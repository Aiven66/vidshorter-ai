/**
 * AI 视频去水印 — 服务端 ffmpeg delogo
 * POST { videoUrl, rects: [{x,y,w,h}]（归一化 0-1 坐标） }
 * → { resultUrl, sizeBytes }
 *
 * 策略: ffmpeg 直接读签名 URL（不落盘输入），delogo 逐区域去除，
 * libx264 veryfast 重编码，音频直拷。超时 270s，超长视频友好拒绝。
 */

import { NextRequest } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
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

/** 归一化矩形 → 偶数对齐的 delogo 像素坐标（clamp 在画面内） */
export function toDelogoCoords(rect: Rect, videoW: number, videoH: number) {
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

    // 3. 构建 delogo 滤镜链
    const filters = body.rects
      .map((r) => {
        const { x, y, w, h } = toDelogoCoords(r, probe.width, probe.height);
        return `delogo=x=${x}:y=${y}:w=${w}:h=${h}`;
      })
      .join(',');

    // 4. 执行（音频直拷；无音轨则丢弃）
    const outputPath = path.join(workDir, 'output.mp4');
    const args = [
      '-y',
      '-hide_banner',
      '-rw_timeout', '30000000',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', videoUrl,
      '-vf', filters,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      ...(probe.hasAudio ? ['-c:a', 'copy'] : ['-an']),
      '-movflags', '+faststart',
      outputPath,
    ];
    try {
      await execFileAsync(ffmpeg, args, {
        timeout: 270_000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, LANG: 'C' },
      });
    } catch {
      // delogo 不可用时回退：区域高斯模糊
      const blurFilters = body.rects
        .map((r, i) => {
          const { x, y, w, h } = toDelogoCoords(r, probe.width, probe.height);
          const strength = Math.max(8, Math.round(Math.min(w, h) / 4));
          return [
            `split=2[base${i}][src${i}]`,
            `[src${i}]crop=${w}:${h}:${x}:${y},boxblur=luma_radius=${strength}:luma_power=2[blur${i}]`,
            `[base${i}][blur${i}]overlay=${x}:${y}`,
          ].join(';');
        })
        .join(';');
      const retryArgs = args
        .slice(0, args.indexOf('-vf') + 1)
        .concat([blurFilters], args.slice(args.indexOf('-vf') + 2));
      await execFileAsync(ffmpeg, retryArgs, {
        timeout: 240_000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, LANG: 'C' },
      });
    }

    // 5. 上传结果
    const output = await readFile(outputPath);
    if (output.byteLength === 0) throw new ApiError(500, 'VIDEO_PROCESS_FAILED');
    const { signedUrl, sizeBytes } = await uploadResult(userId, 'mp4', output, 'video/mp4');

    return Response.json({ resultUrl: signedUrl, sizeBytes });
  } catch (error) {
    return jsonError(error);
  } finally {
    rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
