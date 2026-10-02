import { NextRequest, NextResponse } from 'next/server';
import { stat, writeFile, unlink } from 'fs/promises';
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
import { fetchClipCues } from '@/lib/server/subtitles';
import { synthesizeVoiceover, VOICEOVER_MAX_CHARS, isVoiceId } from '@/lib/server/voiceover';
import { verifyStarterEligibility } from '@/lib/server/plan-gate';

async function findFfmpegBinary(): Promise<string> {
  const candidates = [
    process.env.FFMPEG_BIN,
    // ffmpeg-static 会随 next build 打包进 .next/server/chunks
    'ffmpeg',
  ];
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
    unlink(filePath).catch(() => {});
  });
  const webStream = Readable.toWeb(rs) as unknown as BodyInit;
  return new NextResponse(webStream as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="voiceover.mp4"',
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
    },
  });
}

interface VoiceoverPayload {
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
  script?: string;
  voice?: string;
}

/**
 * /api/voiceover-clip — AI 自动配音/旁白（Starter+ 权益）。
 *
 * 单 pass ffmpeg：
 *   1. 依据前端背书的 muxed 流 fast path（同 cut-clip v59）裁剪 [startTime, startTime+duration]；
 *   2. 用 msedge-tts 合成神经人声旁白 MP3（无脚本则由官方字幕 fetchClipCues 自动提取原文）；
 *   3. 把配音作为成片音轨（apad 对齐 + -shortest，替换原声）合并输出标准 MP4。
 */
export async function POST(request: NextRequest) {
  let voiceoverPath: string | null = null;
  try {
    let body: VoiceoverPayload | null = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const payload: VoiceoverPayload = body ?? { videoId: '', startTime: 0, duration: 0 };

    // Starter 门控
    const elig = await verifyStarterEligibility(request, payload.plan ?? 'free', 'voiceover');
    if (!elig.ok) {
      return NextResponse.json({ error: elig.reason || 'voiceover_requires_starter' }, { status: 403 });
    }

    const videoId = typeof payload.videoId === 'string' ? payload.videoId.trim() : '';
    const startTime = Math.max(0, Number(payload.startTime) || 0);
    const duration = Math.min(90, Math.max(1, Number(payload.duration) || 30));
    if (!videoId) {
      return NextResponse.json({ error: 'videoId required' }, { status: 400 });
    }
    const orientation = payload.orientation === 'vertical' ? 'vertical' : 'landscape';

    const ffmpegPath = await findFfmpegBinary();
    if (!ffmpegPath) {
      return NextResponse.json({ error: 'FFmpeg not available' }, { status: 500 });
    }

    // ── 旁白文本：用户提供 or 从官方字幕自动提取 ──────────────────────────────
    let script = typeof payload.script === 'string' ? payload.script.trim() : '';
    let autoFromSubtitles = false;
    if (!script) {
      const cues = await fetchClipCues(videoId, startTime, duration).catch(() => []);
      if (cues.length > 0) {
        script = cues.map((c) => c.text).join(' ').trim();
        autoFromSubtitles = true;
      }
    }
    if (!script) {
      return NextResponse.json({
        error: 'no_script: No custom script provided and no subtitles available for auto narration.',
      }, { status: 400 });
    }
    if (script.length > VOICEOVER_MAX_CHARS) {
      return NextResponse.json({
        error: `Narration too long (${script.length} chars), max ${VOICEOVER_MAX_CHARS}`,
      }, { status: 400 });
    }

    // ── 声线：默认按界面语言场景给中/英两个常用神经网络人声 ─────────────────────
    const voice =
      typeof payload.voice === 'string' && isVoiceId(payload.voice)
        ? payload.voice
        : /[\u4e00-\u9fff]/.test(script)
          ? 'zh-CN-YunxiNeural'
          : 'en-US-GuyNeural';

    // ── 合成旁白 MP3 到临时文件 ────────────────────────────────────────────────
    const voiceoverBuf = await synthesizeVoiceover(script, voice);
    voiceoverPath = join(tmpdir(), `vo_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
    await writeFile(voiceoverPath, voiceoverBuf);

    // ── 构建 muxed 流 fast path URL（同 cutFromStreamUrl）────────────────────────
    const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim().replace(/\/$/, '');
    if (!cfWorkerUrl) {
      return NextResponse.json({ error: 'CF_WORKER_URL not configured' }, { status: 500 });
    }
    const muxedStreamEndpoint = new URL(cfWorkerUrl.replace(/\/$/, '') + '/stream');
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

    const outPath = join(tmpdir(), `vo_clip_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);

    console.log(`[voiceover-clip] ffmpeg=${ffmpegPath}, videoId=${videoId}, startTime=${startTime}s, duration=${duration}s, voice=${voice}, scriptLen=${script.length}, autoSub=${autoFromSubtitles}, vf=${!!verticalGraph}`);

    const args: string[] = ['-y'];
    args.push('-ss', String(startTime));
    args.push('-rw_timeout', '30000000', '-reconnect', '1', '-reconnect_at_eof', '1',
               '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    args.push('-headers', httpHeaders);
    args.push('-i', muxedStreamEndpoint.toString());
    args.push('-i', voiceoverPath);
    args.push('-t', String(duration));
    // 视频（竖屏时套 blur-fit 滤镜图）+ 配音 apad 对齐；-shortest 在视频结束时截断
    const hasVf = !!verticalGraph;
    const filterComplex = hasVf
      ? `${verticalGraph};[1:a]apad[aout]`
      : `[1:a]apad[aout]`;
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
      return NextResponse.json({ error: 'Voiceover clip output too small' }, { status: 502 });
    }

    console.log(`[voiceover-clip] success: ${outStat.size} bytes (streamed)`);
    // 配音 MP3 已被 ffmpeg 消费完，可直接清理；输出 MP4 由 streamMp4Response 在流 close 后清理。
    if (voiceoverPath) void unlink(voiceoverPath).catch(() => {});
    return streamMp4Response(outPath, outStat.size);
  } catch (err) {
    console.error('[/api/voiceover-clip] error:', err);
    if (voiceoverPath) void unlink(voiceoverPath).catch(() => {});
    const msg = err instanceof Error ? err.message.slice(0, 200) : 'Voiceover synthesis failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}