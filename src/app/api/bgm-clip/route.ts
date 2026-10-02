import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

import { buildVerticalComplex } from '@/lib/server/video-export';
import { verifyStarterEligibility } from '@/lib/server/plan-gate';

async function findFfmpegBinary(): Promise<string> {
  const candidates = [process.env.FFMPEG_BIN, 'ffmpeg'];
  for (const bin of candidates) {
    if (!bin) continue;
    try {
      await new Promise((res, rej) => {
        execFile(bin, ['-version'], (err) => (err ? rej(err) : res(null)));
      });
      return bin;
    } catch { /* 尝试下一个 */ }
  }
  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic) return ffmpegStatic;
  } catch { /* ignore */ }
  return '';
}

/** 流式返回 MP4（防 serverless OOM）。仅在流 close 后清理临时文件（同 cut-clip）。 */
function streamMp4Response(filePath: string, size: number): NextResponse {
  const rs = createReadStream(filePath);
  rs.on('close', () => {
    import('fs/promises').then(({ unlink }) => unlink(filePath).catch(() => {})).catch(() => {});
  });
  const webStream = Readable.toWeb(rs) as unknown as BodyInit;
  return new NextResponse(webStream as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="bgm-clip.mp4"',
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
    },
  });
}

const BGM_MOODS = ['calm', 'energetic', 'warm'] as const;

interface BgmPayload {
  plan?: string;
  videoId: string;
  startTime: number;
  duration: number;
  streamUrl?: string;
  userAgent?: string;
  visitorData?: string;
  xClientName?: string | number;
  clientVersion?: string;
  clientName?: string;
  orientation?: 'landscape' | 'vertical';
  /** calm | energetic | warm（默认 calm） */
  mood?: string;
  /** 0-100 原声音量（默认 70） */
  originalVolume?: number;
}

/**
 * /api/bgm-clip — AI 背景音乐（Starter+ 权益）。
 * 单 pass ffmpeg：muxed 流裁剪 [startTime, startTime+duration]，
 * 叠加内置免版权 BGM（volume 压低后与原声 amix），流式返回标准 MP4。
 * BGM 资产：public/bgm/{calm|energetic|warm}.mp3（60s 程序合成，免版权）。
 */
export async function POST(request: NextRequest) {
  try {
    let body: BgmPayload | null = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const payload: BgmPayload = body ?? { videoId: '', startTime: 0, duration: 0 };

    const elig = await verifyStarterEligibility(request, payload.plan ?? 'free', 'bgm');
    if (!elig.ok) {
      return NextResponse.json({ error: elig.reason || 'bgm_requires_starter' }, { status: 403 });
    }

    const videoId = typeof payload.videoId === 'string' ? payload.videoId.trim() : '';
    const startTime = Math.max(0, Number(payload.startTime) || 0);
    const duration = Math.min(90, Math.max(1, Number(payload.duration) || 30));
    if (!videoId) {
      return NextResponse.json({ error: 'videoId required' }, { status: 400 });
    }
    const orientation = payload.orientation === 'vertical' ? 'vertical' : 'landscape';
    const mood = BGM_MOODS.includes(payload.mood as any) ? (payload.mood as string) : 'calm';
    const originalVolume = Math.min(100, Math.max(0, Number(payload.originalVolume) ?? 70)) / 100;
    const bgmVolume = Math.max(0.05, 1 - originalVolume * 0.9); // 原声越高 BGM 越低

    const ffmpegPath = await findFfmpegBinary();
    if (!ffmpegPath) {
      return NextResponse.json({ error: 'FFmpeg not available' }, { status: 500 });
    }

    const bgmPath = join(process.cwd(), 'public', 'bgm', `${mood}.mp3`);
    try {
      const bgmStat = await stat(bgmPath);
      if (bgmStat.size < 5_000) throw new Error('bgm too small');
    } catch {
      return NextResponse.json({ error: `BGM asset not found: ${mood}` }, { status: 500 });
    }

    const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim().replace(/\/$/, '');
    if (!cfWorkerUrl) {
      return NextResponse.json({ error: 'CF_WORKER_URL not configured' }, { status: 500 });
    }
    const muxedStreamEndpoint = new URL(cfWorkerUrl + '/stream');
    muxedStreamEndpoint.searchParams.set('videoId', videoId);
    muxedStreamEndpoint.searchParams.set('maxHeight', '360');
    muxedStreamEndpoint.searchParams.set('muxed', '1');
    if (payload.streamUrl) muxedStreamEndpoint.searchParams.set('streamUrl', payload.streamUrl);
    if (payload.userAgent) muxedStreamEndpoint.searchParams.set('userAgent', payload.userAgent);
    if (payload.visitorData) muxedStreamEndpoint.searchParams.set('visitorData', payload.visitorData);
    muxedStreamEndpoint.searchParams.set('xClientName', String(payload.xClientName ?? '1'));
    if (payload.clientVersion) muxedStreamEndpoint.searchParams.set('clientVersion', payload.clientVersion);
    if (payload.clientName) muxedStreamEndpoint.searchParams.set('clientName', payload.clientName);

    const httpHeaders = 'Accept: */*\r\nAccept-Encoding: identity\r\n';
    // 9:16 竖屏：blur-fit 复合滤镜（整幅 contain + 模糊背景，不裁切人物）
    const verticalGraph = orientation === 'vertical' ? buildVerticalComplex() : null;

    const outPath = join(tmpdir(), `bgm_clip_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);

    console.log(`[bgm-clip] ffmpeg=${ffmpegPath}, videoId=${videoId}, startTime=${startTime}s, duration=${duration}s, mood=${mood}, origVol=${originalVolume}, bgmVol=${bgmVolume.toFixed(2)}, vf=${!!verticalGraph}`);

    const args: string[] = ['-y'];
    args.push('-ss', String(startTime));
    args.push('-rw_timeout', '30000000', '-reconnect', '1', '-reconnect_at_eof', '1',
               '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    args.push('-headers', httpHeaders);
    args.push('-i', muxedStreamEndpoint.toString());
    // BGM：循环播放铺满片段
    args.push('-stream_loop', '-1', '-i', bgmPath);
    args.push('-t', String(duration));
    const hasVf = !!verticalGraph;
    // 视频（竖屏 blur-fit）+ 原声与 BGM 混音：BGM 压低 + 可选原声衰减
    const filterComplex = hasVf
      ? `${verticalGraph};[0:a]volume=${originalVolume}[orig];[1:a]volume=${bgmVolume}[bg];[orig][bg]amix=inputs=2:duration=first:normalize=0[aout]`
      : `[0:a]volume=${originalVolume}[orig];[1:a]volume=${bgmVolume}[bg];[orig][bg]amix=inputs=2:duration=first:normalize=0[aout]`;
    args.push('-filter_complex', filterComplex);
    args.push('-map', hasVf ? '[vout]' : '0:v:0');
    args.push('-map', '[aout]');
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p');
    args.push('-c:a', 'aac', '-b:a', '128k');
    args.push('-movflags', '+faststart', '-shortest', '-avoid_negative_ts', 'make_zero', outPath);

    await execFileAsync(ffmpegPath, args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 250_000,
      env: { ...process.env, LANG: 'C' },
    });

    const outStat = await stat(outPath).catch(() => null);
    if (!outStat || outStat.size < 5_000) {
      return NextResponse.json({ error: 'BGM clip output too small' }, { status: 502 });
    }

    console.log(`[bgm-clip] success: ${outStat.size} bytes (streamed)`);
    return streamMp4Response(outPath, outStat.size);
  } catch (err) {
    console.error('[/api/bgm-clip] error:', err);
    const msg = err instanceof Error ? err.message.slice(0, 200) : 'BGM clip synthesis failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}