import { NextRequest, NextResponse } from 'next/server';
import { stat, unlink } from 'fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile, spawn } from 'child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 跑 ffmpeg 并保留 stderr（诊断 libass 字体问题）：成功时只打字体相关行，失败打完整尾部。 */
function runFfmpeg(bin: string, args: string[], opts: { timeout: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: { ...process.env, LANG: 'C' } });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('ffmpeg timeout'));
    }, opts.timeout);
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 60_000) stderr = stderr.slice(-60_000);
    });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const fontLines = stderr.split('\n').filter((l) => /font|libass|subtitle/i.test(l));
        if (fontLines.length) console.log(`[karaoke-clip] ffmpeg exit=0\n${fontLines.join('\n')}`);
      } else {
        console.log(`[karaoke-clip] ffmpeg exit=${code}\n--- stderr tail ---\n${stderr.split('\n').slice(-30).join('\n')}\n--- end ---`);
        reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
      }
      if (code === 0) resolve();
    });
  });
}

import { buildVerticalComplex } from '@/lib/server/video-export';
import {
  fetchClipCuesWithLang,
  buildKaraokeAssFile,
  setupFontConfig,
  normalizeSubtitleStyle,
  subtitleFilterForceStyle,
} from '@/lib/server/subtitles';
import { translateCues } from '@/lib/server/subtitle-translate';
import { normalizeSubtitleLang, isNativeTranscript } from '@/lib/subtitle-langs';
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

/** 流式返回 MP4（防 serverless OOM）。仅在流 close 后清理临时文件。 */
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
      'Content-Disposition': 'attachment; filename="karaoke-clip.mp4"',
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
    },
  });
}

interface KaraokePayload {
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
  /** 字幕样式（字号/位置/描边/背景/高亮色），服务端白名单归一化 */
  style?: unknown;
  /** 字幕翻译目标语言（白名单代码，如 zh-CN）。null/缺失 = 不翻译 */
  lang?: unknown;
}

/**
 * /api/karaoke-clip — 动态字幕 Karaoke（Starter+ 权益）。
 * 拉 YouTube 官方字幕 → 生成逐词高亮 ASS（{\k} 标签）→ 单 pass ffmpeg 烧录进
 * muxed 流裁剪片段 → 流式返回标准 MP4。
 *
 * ★ execFile 不经 shell，filtergraph 无引号机制：滤镜串必须用 `\,` 转义逗号
 * （force_style 值内的逗号），路径由我们生成（tmpdir 无空格/冒号/逗号）无需转义。
 */
export async function POST(request: NextRequest) {
  let assPath: string | null = null;
  let fontConfigPath: string | null = null;
  const outPath = join(tmpdir(), `karaoke_clip_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
  try {
    let body: KaraokePayload | null = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const payload: KaraokePayload = body ?? { videoId: '', startTime: 0, duration: 0 };

    const elig = await verifyStarterEligibility(request, payload.plan ?? 'free', 'karaoke');
    if (!elig.ok) {
      return NextResponse.json({ error: elig.reason || 'karaoke_requires_starter' }, { status: 403 });
    }

    const videoId = typeof payload.videoId === 'string' ? payload.videoId.trim() : '';
    const startTime = Math.max(0, Number(payload.startTime) || 0);
    const duration = Math.min(90, Math.max(1, Number(payload.duration) || 30));
    if (!videoId) {
      return NextResponse.json({ error: 'videoId required' }, { status: 400 });
    }
    const orientation = payload.orientation === 'vertical' ? 'vertical' : 'landscape';
    // 字幕样式（Starter+）：白名单归一化，非法值回落默认（medium/bottom/bold/box/yellow）。
    const style = normalizeSubtitleStyle(payload.style);
    // 字幕翻译（Starter+）：白名单归一化，null = 不翻译。
    const targetLang = normalizeSubtitleLang(payload.lang);

    // 拉字幕（目标语言官方字幕优先，否则英文）→ 卡拉OK ASS。
    // 无字幕/拉取失败 → 422（前端提示该片段无可用字幕）。
    const { cues, lang: usedLang } = await fetchClipCuesWithLang(videoId, startTime, duration, targetLang ?? undefined);
    if (cues.length === 0) {
      return NextResponse.json({ error: 'no_subtitles', detail: 'No subtitles available for this clip.' }, { status: 422 });
    }
    // 拉到的是目标语言官方字幕 → 直接用；否则（英文回退）→ 机器翻译。
    let finalCues = cues;
    if (targetLang && usedLang && !isNativeTranscript(usedLang, targetLang)) {
      finalCues = await translateCues(cues, targetLang, usedLang);
    }
    assPath = await buildKaraokeAssFile(finalCues, orientation, style);
    if (!assPath) {
      return NextResponse.json({ error: 'Subtitle generation failed' }, { status: 500 });
    }

    const ffmpegPath = await findFfmpegBinary();
    if (!ffmpegPath) {
      return NextResponse.json({ error: 'FFmpeg not available' }, { status: 500 });
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

    // ★ 转义写法：无引号 + \, 转义 force_style 逗号（execFile 直传，filtergraph 无引号机制）
    // ★ serverless 无 fontconfig：libass 必须能通过 fontconfig 找到字体，否则字幕不渲染。
    //   setupFontConfig 写最小 config 指向 public/fonts（捆绑的 Noto Sans SC）。
    const assFilterPath = assPath.replace(/\\/g, '/');
    const fontsDir = join(process.cwd(), 'public', 'fonts');
    fontConfigPath = await setupFontConfig();
    // force_style 由 style 生成（逗号必须 \, 转义：filtergraph 无引号机制）。
    // 卡拉OK 额外带 SecondaryColour=高亮色（override ASS Style 行，双保险）。
    const subFilter = `subtitles=${assFilterPath}:fontsdir=${fontsDir}:force_style=${subtitleFilterForceStyle(style, true).replace(/,/g, '\\,')}`;
    // 9:16 竖屏：blur-fit 复合滤镜（整幅 contain + 模糊背景，不裁切人物），字幕烧在图内
    const verticalGraph = orientation === 'vertical' ? buildVerticalComplex(subFilter) : null;
    const finalVf = verticalGraph ? null : subFilter;

    console.log(`[karaoke-clip] ffmpeg=${ffmpegPath}, videoId=${videoId}, startTime=${startTime}s, duration=${duration}s, orientation=${orientation}, cues=${cues.length}`);

    const args: string[] = ['-y'];
    args.push('-ss', String(startTime));
    args.push('-rw_timeout', '30000000', '-reconnect', '1', '-reconnect_at_eof', '1',
               '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    args.push('-headers', httpHeaders);
    args.push('-i', muxedStreamEndpoint.toString());
    args.push('-t', String(duration));
    if (verticalGraph) {
      args.push('-filter_complex', verticalGraph, '-map', '[vout]', '-map', '0:a?');
    } else if (finalVf) {
      args.push('-vf', finalVf);
    }
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p');
    args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');
    args.push('-movflags', '+faststart', '-shortest', '-avoid_negative_ts', 'make_zero', outPath);

    await runFfmpeg(ffmpegPath, args, { timeout: 250_000 });

    const outStat = await stat(outPath).catch(() => null);
    if (!outStat || outStat.size < 5_000) {
      return NextResponse.json({ error: 'Karaoke clip output too small' }, { status: 502 });
    }

    console.log(`[karaoke-clip] success: ${outStat.size} bytes (streamed)`);
    return streamMp4Response(outPath, outStat.size);
  } catch (err) {
    console.error('[/api/karaoke-clip] error:', err);
    const msg = err instanceof Error ? err.message.slice(0, 200) : 'Karaoke subtitle synthesis failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    // ★ 只清理输入 ASS 与 fontconfig 配置；outPath 是流式返回的文件，必须由
    // streamMp4Response 在流 close 后清理（finally 提前 unlink 会导致响应 500）。
    if (assPath) void unlink(assPath).catch(() => {});
    if (fontConfigPath) void unlink(fontConfigPath).catch(() => {});
  }
}
