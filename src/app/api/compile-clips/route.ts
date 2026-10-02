import { NextRequest, NextResponse } from 'next/server';
import { stat, writeFile, unlink, access, constants as fsConstants } from 'fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 多段下载+重编码+转场拼接较重（每段一次 seek+encode，再整段编码一次）。
// 放宽到 300s 与 vercel.json 一致，但会通过 CLIP_MAX / 总时长上限控制任务规模防超时/OOM。
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

import { verifyStarterEligibility } from '@/lib/server/plan-gate';

interface CompileClipInput {
  videoId: string;
  startTime: number;
  duration: number;
  streamUrl?: string;
  audioUrl?: string;
  userAgent?: string;
  visitorData?: string;
  xClientName?: string | number;
  clientVersion?: string;
  clientName?: string;
}

// 任务规模上限（防 serverless OOM / 超时）
const CLIP_MAX = 5;
const CLIP_MAX_SEC = 30;
const COMPILE_MAX_TOTAL_SEC = 90;
const DELETE_DURATION_SEC = 0.5; // 交叉淡化时长

export async function POST(request: NextRequest) {
  // 一次性前缀的临时路径集合，finally 统一清理
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const segPaths: string[] = [];
  const listPath = join(tmpdir(), `compile-list-${runId}.txt`);
  const outputPath = join(tmpdir(), `compile-out-${runId}.mp4`);

  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 });
    }
    const plan = String(body.plan || '');
    const vertical = body.orientation === 'vertical' || body.vertical === true;
    const rawClips: unknown = body.clips;

    const elig = await verifyStarterEligibility(request, plan, 'compile');
    if (!elig.ok) {
      return NextResponse.json({ error: elig.reason, detail: 'Auto Compile requires Starter or Pro.' }, { status: 403 });
    }

    if (!Array.isArray(rawClips) || rawClips.length === 0) {
      return NextResponse.json({ error: 'No clips provided' }, { status: 400 });
    }
    if (rawClips.length > CLIP_MAX) {
      return NextResponse.json({ error: `Too many clips (max ${CLIP_MAX})` }, { status: 400 });
    }

    const clips: CompileClipInput[] = rawClips.map((c: any) => ({
      videoId: String(c?.videoId || ''),
      startTime: Number(c?.startTime) || 0,
      duration: Math.max(1, Math.min(Number(c?.duration) || 15, CLIP_MAX_SEC)),
      streamUrl: String(c?.streamUrl || ''),
      audioUrl: String(c?.audioUrl || ''),
      userAgent: String(c?.userAgent || ''),
      visitorData: String(c?.visitorData || ''),
      xClientName: c?.xClientName || '1',
      clientVersion: String(c?.clientVersion || ''),
      clientName: String(c?.clientName || 'direct'),
    }));

    if (clips.some((c) => !c.videoId || !c.streamUrl)) {
      return NextResponse.json({ error: 'Each clip requires videoId and streamUrl' }, { status: 400 });
    }
    const totalSec = clips.reduce((s, c) => s + c.duration, 0);
    if (totalSec > COMPILE_MAX_TOTAL_SEC) {
      return NextResponse.json({ error: `Total duration too long (max ${COMPILE_MAX_TOTAL_SEC}s)` }, { status: 400 });
    }

    const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim().replace(/\/$/, '');
    if (!cfWorkerUrl) {
      return NextResponse.json({ error: 'CF_WORKER_URL not configured' }, { status: 500 });
    }

    const ffmpegPath = await findFfmpegBinary();
    if (!ffmpegPath) {
      return NextResponse.json({ error: 'ffmpeg binary not found' }, { status: 500 });
    }

    // 目标画幅：竖版 720x1280，横版 1280x720（统一规格才能 xfade/concat）
    const W = vertical ? 720 : 1280;
    const H = vertical ? 1280 : 720;
    const segVf = buildSegmentVf(vertical, W, H);

    // 1) 逐段裁剪为统一规格的临时文件，并解析真实时长（xfade offset 需要精确时长）
    const durations: number[] = [];
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const segPath = join(tmpdir(), `compile-seg-${runId}-${i}.mp4`);
      segPaths.push(segPath);

      const muxedUrl = buildMuxedStreamUrl(cfWorkerUrl, c);
      let ok = false;
      try {
        await cutClipNormalized(ffmpegPath, muxedUrl, c.startTime, c.duration, segPath, segVf, i);
        ok = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[compile-clips] segment ${i} cut failed: ${msg.slice(0, 300)}`);
      }
      if (!ok) {
        return NextResponse.json(
          { error: `Failed to prepare clip #${i + 1}. Please try again (server or source may be rate-limited).` },
          { status: 502 },
        );
      }

      const sec = await getDurationSeconds(ffmpegPath, segPath);
      durations.push(sec > 0 ? sec : c.duration);
      console.log(`[compile-clips] seg ${i}: ${sec}s`);
    }

    // 单片段直接出该段；多片段才拼接
    if (segPaths.length === 1) {
      return streamMp4Response(segPaths[0], (await stat(segPaths[0])).size);
    }

    // 2) 转场拼接（xfade+acrossfade），失败降级 concat 硬拼
    let stitched = false;
    let fallbackReason = '';
    try {
      await compileWithXfade(ffmpegPath, segPaths, durations, outputPath, DELETE_DURATION_SEC);
      stitched = true;
      console.log('[compile-clips] xfade stitch succeeded');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fallbackReason = msg.slice(0, 300);
      console.warn(`[compile-clips] xfade stitch failed, falling back to concat: ${fallbackReason}`);
    }

    if (!stitched) {
      try {
        const listContent = segPaths.map((p) => `file '${p}'`).join('\n');
        await writeFile(listPath, listContent);
        await compileWithConcat(ffmpegPath, listPath, outputPath);
        console.log('[compile-clips] concat fallback succeeded');
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        console.error('[compile-clips] concat fallback also failed:', msg2.slice(0, 300));
        return NextResponse.json(
          { error: `Compile failed: xfade (${fallbackReason.slice(0, 150)}) and concat fallback both failed.` },
          { status: 500 },
        );
      }
    }

    const outStat = await stat(outputPath).catch(() => null);
    if (!outStat || outStat.size < 5000) {
      return NextResponse.json({ error: 'Compile output too small or missing' }, { status: 500 });
    }

    return streamMp4Response(outputPath, outStat.size);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[compile-clips] Error:', msg.slice(0, 1000));
    return NextResponse.json({ error: `Compile failed: ${msg.slice(0, 2000)}` }, { status: 500 });
  } finally {
    await unlink(listPath).catch(() => {});
    for (const p of segPaths) await unlink(p).catch(() => {});
  }
}

/** 构建与 cut-clip 一致的单条 muxed stream（fast path streamUrl + muxed=1） */
function buildMuxedStreamUrl(cfWorkerUrl: string, c: CompileClipInput): string {
  const u = new URL(cfWorkerUrl.replace(/\/$/, '') + '/stream');
  u.searchParams.set('videoId', c.videoId);
  u.searchParams.set('maxHeight', '360');
  u.searchParams.set('muxed', '1');
  if (c.streamUrl) u.searchParams.set('streamUrl', c.streamUrl);
  if (c.userAgent) u.searchParams.set('userAgent', c.userAgent);
  if (c.visitorData) u.searchParams.set('visitorData', c.visitorData);
  u.searchParams.set('xClientName', String(c.xClientName));
  if (c.clientVersion) u.searchParams.set('clientVersion', c.clientVersion);
  if (c.clientName) u.searchParams.set('clientName', c.clientName);
  return u.toString();
}

/** 统一规格归一化裁剪（重编码），保证所有片段同分辨率/帧率/像素格式/音频采样，便于 xfade/concat */
async function cutClipNormalized(
  ffmpegPath: string,
  muxedUrl: string,
  startTime: number,
  duration: number,
  outPath: string,
  vf: string,
  index: number,
): Promise<void> {
  const httpHeaders = 'Accept: */*\r\nAccept-Encoding: identity\r\n';
  const args: string[] = [
    '-y',
    '-ss', String(startTime),
    '-rw_timeout', '30000000', '-reconnect', '1', '-reconnect_at_eof', '1',
    '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-headers', httpHeaders,
    '-i', muxedUrl,
    '-t', String(duration),
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
    '-movflags', '+faststart', '-avoid_negative_ts', 'make_zero',
    outPath,
  ];
  await execFileAsync(ffmpegPath, args, {
    maxBuffer: 40 * 1024 * 1024,
    timeout: 150_000,
    env: { ...process.env, LANG: 'C' },
  });
  console.log(`[compile-clips] seg ${index} re-encoded ok`);
}

/** 统一画幅的 -vf（横版 scale+pad；竖版居中裁 9:16 条再 scale） */
function buildSegmentVf(vertical: boolean, W: number, H: number): string {
  if (vertical) {
    const cw = 'trunc(ih*9/16/2)*2';
    return `crop=${cw}:ih:(iw-${cw})/2:0,scale=${W}:${H},fps=30,format=yuv420p`;
  }
  return `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`;
}

/**
 * 用 ffmpeg -i 探测文件时长（stderr 打印 Duration），想被 execFile 以 code1 拒绝。
 * 不加输出时会正常 exit 1，但 stderr 带 Duration 行；捕获它即可。
 */
async function getDurationSeconds(ffmpegPath: string, filePath: string): Promise<number> {
  try {
    await execFileAsync(ffmpegPath, ['-i', filePath], {
      timeout: 8_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (err: any) {
    const stderr = String(err?.stderr || '');
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)(?:\.(\d+))?/);
    if (m) {
      const h = parseInt(m[1], 10);
      const mi = parseInt(m[2], 10);
      const s = parseInt(m[3], 10);
      const frac = parseInt(m[4] || '0', 10);
      return h * 3600 + mi * 60 + s + frac / 100;
    }
  }
  return 0;
}

/**
 * xfade(视频) + acrossfade(音频) 交叉淡化拼接。
 * 视频 offset_k = (前 k+1 段时长之和) - (k+1)*td（累计消耗随每次淡化递减 td）。
 * 音频 acrossfade 不需 offset（自动首尾结合）。
 * ⚠️ 片段已统一 30fps/同分辨率/同像素格式，且 we 无带逗号的表达式，filtergraph 安全。
 */
async function compileWithXfade(
  ffmpegPath: string,
  segPaths: string[],
  durations: number[],
  outPath: string,
  td: number,
): Promise<void> {
  const n = segPaths.length;
  const args: string[] = ['-y'];
  for (const p of segPaths) args.push('-i', p);

  // 前缀和 Vec
  const prefix: number[] = [];

  // 视频 xfade 链
  const vParts: string[] = [];
  let prevLabel = '[0:v]';
  let runningDue = 0; // sum durations[0..k]
  for (let k = 0; k < n - 1; k++) {
    runningDue += durations[k];
    const offset = runningDue - (k + 1) * td;
    const outLabel = k === n - 2 ? '[vout]' : `[x${k}]`;
    vParts.push(`[${prevLabel.slice(1, -1)}][${k + 1}:v]xfade=transition=fade:duration=${td}:offset=${offset.toFixed(2)}${outLabel}`);
    prevLabel = outLabel;
  }

  // 音频 acrossfade 链
  const aParts: string[] = [];
  prevLabel = '[0:a]';
  for (let k = 0; k < n - 1; k++) {
    const outLabel = k === n - 2 ? '[aout]' : `[a${k}]`;
    aParts.push(`[${prevLabel.slice(1, -1)}][${k + 1}:a]acrossfade=d=${td}${outLabel}`);
    prevLabel = outLabel;
  }

  const filterComplex = `${vParts.join(';')};${aParts.join(';')}`;
  args.push(
    '-filter_complex', filterComplex,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', '-avoid_negative_ts', 'make_zero',
    outPath,
  );
  await execFileAsync(ffmpegPath, args, {
    maxBuffer: 40 * 1024 * 1024,
    timeout: 180_000,
    env: { ...process.env, LANG: 'C' },
  });
}

/** concat demuxer 硬拼兜底（片段已统一规格/编码，copy 即可） */
async function compileWithConcat(ffmpegPath: string, listPath: string, outPath: string): Promise<void> {
  const args: string[] = [
    '-y',
    '-f', 'concat', '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    '-movflags', '+faststart', '-avoid_negative_ts', 'make_zero',
    outPath,
  ];
  await execFileAsync(ffmpegPath, args, {
    maxBuffer: 40 * 1024 * 1024,
    timeout: 120_000,
    env: { ...process.env, LANG: 'C' },
  });
}

/** 与 cut-clip 相同的多级查找：ffmpeg-static > @ffmpeg-installer > 系统 PATH */
async function findFfmpegBinary(): Promise<string> {
  try {
    const ffmpegStatic: string = require('ffmpeg-static');
    if (ffmpegStatic) {
      await access(ffmpegStatic, fsConstants.X_OK);
      return ffmpegStatic;
    }
  } catch { /* fall through */ }
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer?.path) {
      await access(installer.path, fsConstants.X_OK);
      return installer.path;
    }
  } catch { /* fall through */ }
  try {
    const { stdout } = await execFileAsync('which', ['ffmpeg']);
    const sysPath = stdout.trim();
    if (sysPath) {
      await access(sysPath, fsConstants.X_OK);
      return sysPath;
    }
  } catch { /* fall through */ }
  return '';
}

/** 流式返回 MP4，勿整块 readFile（防 serverless OOM） */
function streamMp4Response(filePath: string, size: number): NextResponse {
  const rs = createReadStream(filePath);
  rs.on('close', () => {
    unlink(filePath).catch(() => {});
  });
  const webStream = Readable.toWeb(rs) as unknown as BodyInit;
  return new NextResponse(webStream as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="compiled.mp4"',
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
    },
  });
}