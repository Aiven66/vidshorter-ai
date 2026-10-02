import { NextRequest, NextResponse } from 'next/server';
import { stat, unlink } from 'fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

import { normalizeExportTemplate } from '@/lib/export-templates';
import { verifyStarterEligibility } from '@/lib/server/plan-gate';
import {
  buildClipSubtitleFile,
  buildKaraokeAssFile,
  fetchClipCuesWithLang,
  setupFontConfig,
  subtitleFilterForceStyle,
  DEFAULT_SUBTITLE_STYLE,
  type SubtitleStyle,
} from '@/lib/server/subtitles';
import { buildVerticalComplex } from '@/lib/server/video-export';

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

/** 从 muxed 流裁剪一段标准 MP4 到 outputPath（同 cutFromStreamUrl 核心，横屏 720p）。 */
async function cutSegment(opts: {
  cfWorkerUrl: string;
  videoId: string;
  startTime: number;
  duration: number;
  streamUrl: string;
  userAgent?: string;
  visitorData?: string;
  xClientName?: string | number;
  clientVersion?: string;
  clientName?: string;
  outputPath: string;
  ffmpegPath: string;
  /** 模板：字幕 ASS 路径（静态或卡拉OK，模板驱动）；null = 无字幕 */
  subtitleAssPath?: string | null;
  /** 模板：9:16 竖屏（blur-fit：整幅 contain + 模糊背景，不裁切人物） */
  vertical?: boolean;
  /** 模板：字幕样式（透传给 force_style） */
  subtitleStyle?: SubtitleStyle;
}): Promise<void> {
  const muxedStreamEndpoint = new URL(opts.cfWorkerUrl.replace(/\/$/, '') + '/stream');
  muxedStreamEndpoint.searchParams.set('videoId', opts.videoId);
  muxedStreamEndpoint.searchParams.set('maxHeight', '360');
  muxedStreamEndpoint.searchParams.set('muxed', '1');
  if (opts.streamUrl) muxedStreamEndpoint.searchParams.set('streamUrl', opts.streamUrl);
  if (opts.userAgent) muxedStreamEndpoint.searchParams.set('userAgent', opts.userAgent);
  if (opts.visitorData) muxedStreamEndpoint.searchParams.set('visitorData', opts.visitorData);
  muxedStreamEndpoint.searchParams.set('xClientName', String(opts.xClientName ?? '1'));
  if (opts.clientVersion) muxedStreamEndpoint.searchParams.set('clientVersion', opts.clientVersion);
  if (opts.clientName) muxedStreamEndpoint.searchParams.set('clientName', opts.clientName);

  const httpHeaders = 'Accept: */*\r\nAccept-Encoding: identity\r\n';

  // 模板滤镜：竖屏 → blur-fit 复合滤镜（整幅 contain + 模糊背景，不裁切人物）；
  // 否则统一 720p 横屏规格。两者都统一 fps/format 保证编码兼容。
  // 模板字幕：静态/卡拉OK ASS 烧录（fontsdir 直扫捆绑字体 + force_style，逗号必须 \, 转义）
  const fontsDir = join(process.cwd(), 'public', 'fonts');
  const subFilter = opts.subtitleAssPath
    ? `subtitles=${opts.subtitleAssPath.replace(/\\/g, '/')}:fontsdir=${fontsDir}:force_style=${subtitleFilterForceStyle(opts.subtitleStyle ?? DEFAULT_SUBTITLE_STYLE, false).replace(/,/g, '\\,')}`
    : null;
  if (opts.subtitleAssPath) console.log(`[export-all] segment subtitles enabled: ${opts.subtitleAssPath}`);

  let vf: string | null = null;
  let verticalGraph: string | null = null;
  if (opts.vertical) {
    // 竖屏含 split → 必须 filter_complex；字幕/fps/format 追加在叠加之后
    verticalGraph = buildVerticalComplex([subFilter, 'fps=30,format=yuv420p'].filter(Boolean).join(',') || null);
  } else {
    vf = 'scale=trunc(min(1280\\,iw)/2)*2:-2,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p';
    if (subFilter) vf = `${vf},${subFilter}`;
  }

  const args = [
    '-y',
    '-ss', String(opts.startTime),
    '-rw_timeout', '30000000', '-reconnect', '1', '-reconnect_at_eof', '1',
    '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-headers', httpHeaders,
    '-i', muxedStreamEndpoint.toString(),
    '-t', String(opts.duration),
    // 统一规格：720p 30fps yuv420p + AAC 双声道（多段 zip 内互相独立，无拼接要求，规格放宽无妨）
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
  ];
  if (verticalGraph) {
    args.push('-filter_complex', verticalGraph, '-map', '[vout]', '-map', '0:a?');
  } else if (vf) {
    args.push('-vf', vf);
  }
  args.push(
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-movflags', '+faststart', '-shortest', '-avoid_negative_ts', 'make_zero',
    opts.outputPath,
  );

  await execFileAsync(opts.ffmpegPath, args, {
    maxBuffer: 50 * 1024 * 1024,
    timeout: 240_000,
    env: { ...process.env, LANG: 'C' },
  });
}

/** 文件名安全化（zip 条目名不能含路径分隔符/绝对路径）。 */
function safeEntryName(title: string, index: number): string {
  const base = title
    .replace(/[^\w\s\u4e00-\u9fa5-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40) || 'clip';
  return `${String(index + 1).padStart(2, '0')}_${base}.mp4`;
}

const CLIP_MAX = 10;
const CLIP_MAX_SEC = 90;
const EXPORT_MAX_TOTAL_SEC = 300;

interface ExportClip {
  videoId: string;
  startTime: number;
  duration: number;
  title?: string;
}

/** /api/export-all — 批量打包导出（Starter+ 权益）。把用户当前视频的全部高光片段一次性 zip 下载。 */
export async function POST(request: NextRequest) {
  const tmpFiles: string[] = [];
  try {
    let body: any = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const payload = body ?? {};

    const elig = await verifyStarterEligibility(request, String(payload.plan ?? 'free'), 'exportall');
    if (!elig.ok) {
      return NextResponse.json({ error: elig.reason || 'exportall_requires_starter' }, { status: 403 });
    }

    const clips: ExportClip[] = Array.isArray(payload.clips) ? payload.clips : [];
    if (clips.length === 0) {
      return NextResponse.json({ error: 'clips array required' }, { status: 400 });
    }
    if (clips.length > CLIP_MAX) {
      return NextResponse.json({ error: `Too many clips (max ${CLIP_MAX})` }, { status: 400 });
    }
    let totalSec = 0;
    for (const c of clips) {
      const d = Math.min(CLIP_MAX_SEC, Math.max(1, Number(c.duration) || 30));
      c.duration = d;
      totalSec += d;
    }
    if (totalSec > EXPORT_MAX_TOTAL_SEC) {
      return NextResponse.json({ error: `Total duration too long (max ${EXPORT_MAX_TOTAL_SEC}s)` }, { status: 400 });
    }

    const resolved = payload.resolved ?? {};
    const streamUrl = String(resolved.streamUrl || '');
    const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim().replace(/\/$/, '');
    if (!streamUrl || !cfWorkerUrl) {
      return NextResponse.json({ error: 'Resolved stream not available. Please re-open/process the video and try again.' }, { status: 400 });
    }

    // 模板（Starter+ 权益）：白名单归一化。null → 无字幕横屏（保持既有行为）。
    const tpl = normalizeExportTemplate(payload.template);
    const wantSubs = !!tpl && (tpl.subtitles || tpl.karaoke);
    const wantVertical = !!tpl && tpl.vertical;
    console.log(`[export-all] template=${payload.template ?? '(none)'} → subs=${wantSubs}, vertical=${wantVertical}`);

    const ffmpegPath = await findFfmpegBinary();
    if (!ffmpegPath) {
      return NextResponse.json({ error: 'FFmpeg not available' }, { status: 500 });
    }

    // 模板字幕需要字体配置（serverless 无 fontconfig，libass 靠 FONTCONFIG_FILE 找捆绑字体）。
    let fontConfigPath: string | null = null;
    if (wantSubs) fontConfigPath = await setupFontConfig();
    if (fontConfigPath) tmpFiles.push(fontConfigPath);

    // ── 逐段裁剪到临时 MP4（模板：先建字幕 ASS，再带滤镜裁剪）──────────────
    const segPaths: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const outPath = join(tmpdir(), `exp_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}.mp4`);
      tmpFiles.push(outPath);
      console.log(`[export-all] cutting segment ${i + 1}/${clips.length}: videoId=${c.videoId}, t=${c.startTime}s, d=${c.duration}s`);

      // 模板字幕 ASS：静态 → buildClipSubtitleFile（官方字幕+可选翻译）；卡拉OK → 逐词高亮。
      let subtitleAssPath: string | null = null;
      if (wantSubs) {
        try {
          if (tpl?.karaoke) {
            const { cues } = await fetchClipCuesWithLang(String(c.videoId), Math.max(0, Number(c.startTime) || 0), c.duration);
            if (cues.length > 0) {
              subtitleAssPath = await buildKaraokeAssFile(cues, wantVertical ? 'vertical' : 'landscape', DEFAULT_SUBTITLE_STYLE);
            }
          } else {
            subtitleAssPath = await buildClipSubtitleFile(String(c.videoId), Math.max(0, Number(c.startTime) || 0), c.duration, DEFAULT_SUBTITLE_STYLE);
          }
          if (subtitleAssPath) tmpFiles.push(subtitleAssPath);
        } catch (e) {
          console.warn(`[export-all] segment ${i + 1} subtitle build failed (non-fatal):`, e instanceof Error ? e.message.slice(0, 160) : e);
          subtitleAssPath = null;
        }
      }

      await cutSegment({
        cfWorkerUrl,
        videoId: String(c.videoId),
        startTime: Math.max(0, Number(c.startTime) || 0),
        duration: c.duration,
        streamUrl,
        userAgent: resolved.userAgent,
        visitorData: resolved.visitorData,
        xClientName: resolved.xClientName,
        clientVersion: resolved.clientVersion,
        clientName: resolved.clientName,
        outputPath: outPath,
        ffmpegPath,
        subtitleAssPath,
        vertical: wantVertical,
        subtitleStyle: DEFAULT_SUBTITLE_STYLE,
      });
      const st = await stat(outPath).catch(() => null);
      if (!st || st.size < 5_000) {
        return NextResponse.json({ error: `Segment ${i + 1} output too small` }, { status: 502 });
      }
      segPaths.push(outPath);
    }

    // ── archiver 流式打包 zip（防 OOM：zip 也走流，不整块进内存）──────────────
    // archiver 8.0.0 是纯 ESM：只导出命名导出 Archiver/ZipArchive，无 default。
    const { ZipArchive } = await import('archiver');
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const zipTmpPath = join(tmpdir(), `exp_zip_${Date.now()}_${Math.random().toString(36).slice(2)}.zip`);
    tmpFiles.push(zipTmpPath);

    const zipWriteStream = createWriteStream(zipTmpPath);
    await new Promise<void>((resolve, reject) => {
      archive.on('error', reject);
      zipWriteStream.on('close', resolve);
      zipWriteStream.on('error', reject);
      archive.pipe(zipWriteStream);
      clips.forEach((c, i) => {
        archive.file(segPaths[i], { name: safeEntryName(c.title || 'clip', i) });
      });
      archive.finalize();
    });

    const zipStat = await stat(zipTmpPath).catch(() => null);
    if (!zipStat || zipStat.size < 1_000) {
      return NextResponse.json({ error: 'Zip output too small' }, { status: 502 });
    }

    console.log(`[export-all] success: ${segPaths.length} segments, zip=${zipStat.size} bytes (streamed)`);
    // 流式返回 zip；流 close 后清理所有临时文件
    const rs = createReadStream(zipTmpPath);
    rs.on('close', () => {
      void unlink(zipTmpPath).catch(() => {});
      for (const f of tmpFiles) if (f !== zipTmpPath) void unlink(f).catch(() => {});
    });
    const webStream = (await import('stream')).Readable.toWeb(rs) as unknown as BodyInit;
    return new NextResponse(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="clipopai-clips.zip"',
        'Content-Length': String(zipStat.size),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/export-all] error:', err);
    for (const f of tmpFiles) void unlink(f).catch(() => {});
    const msg = err instanceof Error ? err.message.slice(0, 200) : 'Batch export failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}