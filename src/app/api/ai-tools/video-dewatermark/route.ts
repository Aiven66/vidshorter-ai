/**
 * AI 视频去水印 — 服务端 ffmpeg 羽化 delogo
 * POST { videoUrl, rects: [{x,y,w,h}]（归一化 0-1 坐标） }
 * → { resultUrl, sizeBytes }
 *
 * 策略（v2 羽化补丁，替代裸 delogo）:
 *   每个水印区域 → 带边距裁剪 → delogo 插值填充 → 轻模糊抹平插值条纹
 *   → 细颗粒噪点匹配压缩纹理 → sharp 生成羽化 alpha 掩码（掩码中心不透明、
 *   向裁剪边缘线性衰减）→ alphamerge + overlay 混合回原画面。
 *   相比裸 delogo 的硬边补丁/条纹拖影，羽化补丁与周围画面连续过渡。
 * 降级链: 羽化补丁 → 裸 delogo → 区域 boxblur。
 */

import { NextRequest } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';

import {
  ApiError,
  assertUserStorageUrl,
  jsonError,
  requireUserId,
  uploadResult,
} from '@/lib/server/ai-tools/storage';

/** 延迟加载 sharp（原生绑定）—— 加载失败返回可诊断 JSON 错误而非路由 500 */
async function getSharp() {
  return (await import('sharp')).default;
}

const execFileAsync = promisify(execFile);

export const maxDuration = 300;
export const runtime = 'nodejs';

const MAX_VIDEO_BYTES = 48 * 1024 * 1024; // Supabase 桶单文件上限 50MB
const MAX_VIDEO_DURATION_S = 900; // 15 分钟

/** 与 cut-clip 一致的三级 ffmpeg fallback（带 spawn 探测：跳过签名失效的二进制） */
let ffmpegBinaryCache: string | null = null;
function findFfmpegBinary(): string {
  if (ffmpegBinaryCache) return ffmpegBinaryCache;

  const candidates: string[] = [];
  try {
    const staticPath = require('ffmpeg-static');
    if (typeof staticPath === 'string' && existsSync(staticPath)) candidates.push(staticPath);
  } catch {}
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer?.path && existsSync(installer.path)) candidates.push(installer.path);
  } catch {}
  candidates.push('ffmpeg');

  // spawnSync 探测：macOS provenance/签名失效的二进制会直接 spawn 失败（errno -88），
  // 静默跳过换下一个源，避免整个路由 500。
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  for (const candidate of candidates) {
    try {
      const probe = spawnSync(candidate, ['-version'], { timeout: 10_000 });
      if (probe.status === 0) {
        ffmpegBinaryCache = candidate;
        return candidate;
      }
    } catch {}
  }
  ffmpegBinaryCache = 'ffmpeg';
  return 'ffmpeg';
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 归一化矩形 → 偶数对齐的像素坐标（clamp 在画面内，留 2px 边距） */
function toPixelCoords(rect: Rect, videoW: number, videoH: number) {
  const px = Math.max(2, Math.round(rect.x * videoW) & ~1);
  const py = Math.max(2, Math.round(rect.y * videoH) & ~1);
  const pw = Math.max(2, Math.min(Math.round(rect.w * videoW) & ~1, videoW - px - 2));
  const ph = Math.max(2, Math.min(Math.round(rect.h * videoH) & ~1, videoH - py - 2));
  return { x: px, y: py, w: pw, h: ph };
}

/** 从 ffmpeg -i 的 stderr 解析时长与分辨率 */
function probeFromStderr(stderr: string): { durationS: number; width: number; height: number; hasAudio: boolean } {
  const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationS = durMatch
    ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3])
    : 0;
  const dimMatch = stderr.match(/,\s(\d{2,5})x(\d{2,5})[\s,]/);
  const width = dimMatch ? parseInt(dimMatch[1]) : 0;
  const height = dimMatch ? parseInt(dimMatch[2]) : 0;
  const hasAudio = /Audio:\s/.test(stderr);
  return { durationS, width, height, hasAudio };
}

/**
 * 生成单个区域的羽化灰度掩码 PNG（掩码尺寸 = 裁剪区域尺寸）。
 * 掩码在水印框（外扩 2px）内为纯白（不透明），向裁剪边缘高斯衰减到黑。
 */
async function buildFeatherMask(cropW: number, cropH: number, boxX: number, boxY: number, boxW: number, boxH: number): Promise<Buffer> {
  const sharp = await getSharp();
  const gray = Buffer.alloc(cropW * cropH, 0);
  const x0 = Math.max(0, Math.floor(boxX - 2));
  const y0 = Math.max(0, Math.floor(boxY - 2));
  const x1 = Math.min(cropW, Math.ceil(boxX + boxW + 2));
  const y1 = Math.min(cropH, Math.ceil(boxY + boxH + 2));
  for (let y = y0; y < y1; y++) {
    gray.fill(255, y * cropW + x0, y * cropW + x1);
  }
  // 羽化宽度 ~ 裁剪边距的一半（sigma 越大过渡越宽）
  const feather = Math.max(2, Math.min(boxX, boxY, cropW - (boxX + boxW), cropH - (boxY + boxH)) / 2.2);
  let pipeline = sharp(gray, { raw: { width: cropW, height: cropH, channels: 1 } });
  if (feather >= 1) pipeline = pipeline.blur(Math.min(feather, 60));
  return pipeline.png().toBuffer();
}

export async function POST(req: NextRequest) {
  const workDir = await mkdtemp(path.join(tmpdir(), 'ai-dewatermark-'));
  try {
    const userId = await requireUserId(req);
    const body = (await req.json()) as { videoUrl?: string; rects?: Rect[] };
    if (!body.videoUrl || !Array.isArray(body.rects) || body.rects.length === 0) {
      throw new ApiError(400, 'MISSING_PARAMS');
    }
    if (body.rects.length > 32) throw new ApiError(400, 'TOO_MANY_REGIONS');
    const videoUrl = assertUserStorageUrl(body.videoUrl, userId, 'ai-tools');

    // 1. 大小检查（HEAD）
    const head = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = Number(head.headers.get('content-length') || 0);
    if (contentLength > MAX_VIDEO_BYTES) throw new ApiError(400, 'VIDEO_TOO_LARGE');

    // 2. 探测时长/分辨率/音轨（ffmpeg -i 无输出必然非零退出，stderr 里带信息）
    const ffmpeg = findFfmpegBinary();
    let probe: ReturnType<typeof probeFromStderr>;
    try {
      await execFileAsync(ffmpeg, ['-hide_banner', '-i', videoUrl], { timeout: 30_000 });
      probe = probeFromStderr('');
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr || '';
      probe = probeFromStderr(stderr);
    }
    if (!probe.width || !probe.height) throw new ApiError(400, 'VIDEO_DECODE_FAILED');
    if (probe.durationS > MAX_VIDEO_DURATION_S) throw new ApiError(400, 'VIDEO_TOO_LONG');

    // 3. 逐区域计算羽化补丁参数（裁剪框 + delogo 相对坐标 + 羽化掩码文件）
    interface Patch {
      cropX: number; cropY: number; cropW: number; cropH: number;
      logoX: number; logoY: number; logoW: number; logoH: number;
      blurRadius: number;
      maskPath: string;
    }
    const patches: Patch[] = [];
    for (let i = 0; i < body.rects.length; i++) {
      const r = body.rects[i];
      if (!(r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001)) {
        throw new ApiError(400, 'INVALID_RECT');
      }
      const { x, y, w, h } = toPixelCoords(r, probe.width, probe.height);
      // 边距: 短边的 1/3（≥12px），clamp 后保证 delogo 框距裁剪边缘 ≥ margin
      let m = Math.max(12, Math.round(Math.min(w, h) / 3));
      m = Math.min(m, x, y, probe.width - x - w, probe.height - y - h, 64);
      if (m < 2) m = 2; // 水印贴边时退化为最小边距
      const cropX = x - m;
      const cropY = y - m;
      const cropW = w + 2 * m;
      const cropH = h + 2 * m;
      const blurRadius = Math.max(3, Math.min(16, Math.round(Math.min(w, h) / 6)));
      const maskPath = path.join(workDir, `mask${i}.png`);
      await writeFile(maskPath, await buildFeatherMask(cropW, cropH, m, m, w, h));
      patches.push({ cropX, cropY, cropW, cropH, logoX: m, logoY: m, logoW: w, logoH: h, blurRadius, maskPath });
    }

    // 4. 羽化补丁滤镜图:
    //    [0:v]split=N+1 → 每区域 crop+delogo+boxblur+noise+alpha → alphamerge 掩码 → overlay 链
    const N = patches.length;
    const parts: string[] = [];
    const splitLabels = patches.map((_, i) => `[c${i}]`).join('');
    parts.push(`[0:v]split=${N + 1}[vbase]${splitLabels}`);
    patches.forEach((p, i) => {
      parts.push(
        `[c${i}]crop=${p.cropW}:${p.cropH}:${p.cropX}:${p.cropY}` +
        `,delogo=x=${p.logoX}:y=${p.logoY}:w=${p.logoW}:h=${p.logoH}` +
        `,boxblur=luma_radius=${p.blurRadius}:luma_power=1:chroma_radius=${p.blurRadius}:chroma_power=1` +
        `,noise=alls=3:allf=t` +
        `,format=yuva420p[f${i}]`
      );
      parts.push(`[${i + 1}:v]format=gray[fm${i}]`);
      parts.push(`[f${i}][fm${i}]alphamerge[am${i}]`);
    });
    let prev = 'vbase';
    patches.forEach((p, i) => {
      parts.push(`[${prev}][am${i}]overlay=${p.cropX}:${p.cropY}[ov${i}]`);
      prev = `ov${i}`;
    });
    // 奇数分辨率兜底（yuv420p 要求偶数尺寸）
    const oddFix =
      probe.width % 2 !== 0 || probe.height % 2 !== 0
        ? `,scale=trunc(iw/2)*2:trunc(ih/2)*2`
        : '';
    const v2Filter = parts.join(';') + `;[${prev}]format=yuv420p${oddFix}[vout]`;

    const maskInputArgs = patches.flatMap((p) => ['-i', p.maskPath]);
    const encodeArgs = [
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '21',
      ...(probe.hasAudio ? ['-c:a', 'copy'] : ['-an']),
      '-movflags', '+faststart',
    ];

    const outputPath = path.join(workDir, 'output.mp4');
    const runFfmpeg = async (filterGraph: string, extraInputs: string[], timeoutMs: number) => {
      await execFileAsync(ffmpeg, [
        '-y',
        '-hide_banner',
        '-rw_timeout', '30000000',
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', videoUrl,
        ...extraInputs,
        '-filter_complex', filterGraph,
        '-map', '[vout]',
        ...encodeArgs,
        outputPath,
      ], {
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, LANG: 'C' },
      });
    };

    let usedStrategy = 'feather-delogo';
    try {
      await runFfmpeg(v2Filter, maskInputArgs, 260_000);
    } catch (v2Error) {
      // 降级 1: 裸 delogo（老版 ffmpeg 无 alphamerge/noise 时）
      console.warn('[video-dewatermark] feather patch failed, fallback to plain delogo:', v2Error instanceof Error ? v2Error.message.split('\n')[0] : v2Error);
      try {
        const delogoFilters = patches
          .map((p) => `delogo=x=${p.cropX + p.logoX}:y=${p.cropY + p.logoY}:w=${p.logoW}:h=${p.logoH}`)
          .join(',');
        await runFfmpeg(`[0:v]${delogoFilters},format=yuv420p${oddFix}[vout]`, [], 250_000);
        usedStrategy = 'plain-delogo';
      } catch (delogoError) {
        // 降级 2: 区域高斯模糊
        console.warn('[video-dewatermark] plain delogo failed, fallback to boxblur:', delogoError instanceof Error ? delogoError.message.split('\n')[0] : delogoError);
        const blurParts: string[] = [];
        let splitLabels2 = '';
        for (let i = 0; i < N; i++) splitLabels2 += `[b${i}]`;
        blurParts.push(`[0:v]split=${N}${splitLabels2 || '[b0]'}`);
        patches.forEach((p, i) => {
          const strength = Math.max(8, Math.round(Math.min(p.logoW, p.logoH) / 4));
          blurParts.push(
            `[b${i}]crop=${p.cropW}:${p.cropH}:${p.cropX}:${p.cropY}` +
            `,boxblur=luma_radius=${strength}:luma_power=2[bl${i}]`
          );
        });
        let prev2 = 'b0';
        // 第一个区域直接用自身模糊结果
        blurParts[1] = blurParts[1].replace(`[b0]crop`, `[b0]crop`);
        let chainParts: string[] = [];
        patches.forEach((p, i) => {
          if (i === 0) {
            chainParts.push(`[bl0]null[s0]`);
            prev2 = 's0';
          } else {
            chainParts.push(`[${prev2}][bl${i}]overlay=${p.cropX}:${p.cropY}[s${i}]`);
            prev2 = `s${i}`;
          }
        });
        const blurFilter = [...blurParts, ...chainParts, `[${prev2}]format=yuv420p${oddFix}[vout]`].join(';');
        await runFfmpeg(blurFilter, [], 240_000);
        usedStrategy = 'boxblur';
      }
    }

    // 5. 上传结果
    const output = await readFile(outputPath);
    if (output.byteLength === 0) throw new ApiError(500, 'VIDEO_PROCESS_FAILED');
    const { signedUrl, sizeBytes } = await uploadResult(userId, 'mp4', output, 'video/mp4');

    return Response.json({ resultUrl: signedUrl, sizeBytes, strategy: usedStrategy });
  } catch (error) {
    return jsonError(error);
  } finally {
    rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
