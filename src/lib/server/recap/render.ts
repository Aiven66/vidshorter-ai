/**
 * Recap Studio — 成片渲染编排（ffmpeg）
 *
 * 三步（见实现方案 §3）：
 *   1) 逐片裁剪为统一规格（mirror compile-clips 的 cutClipNormalized / buildSegmentVf）
 *   2) 拼接：xfade + acrossfade，失败自动降级 concat demuxer 硬拼
 *   3) 成片合成（单 pass）：解说字幕烧录 + 原声 ducking + BGM amix + faststart
 *
 * ★ 时长精确性（关键）：每片源窗口多切 `RECAP_XFADE_SEC`（除最后一片），
 *   转场时相邻片重叠该秒数，净时间轴长度恰好回到计划的 L_j —— 于是
 *   "Σ片时长 == 该章解说时长 D_i" 的不变量在转场后依然成立，旁白无需对时。
 *
 * ★ 清理约定：本模块**不删除任何文件**。所有中间产物路径推入调用方传入的
 *   `tempPaths`（即使中途抛错也能被调用方的 finally 清理）；成片 outPath 必须
 *   由流式响应在流 close 后删除，切勿提前 unlink。
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { access, stat, writeFile } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  buildKaraokeAssFile,
  setupFontConfig,
  subtitleFilterForceStyle,
  type SubtitleCue,
  type SubtitleStyle,
} from '../subtitles';
import type { RecapCue } from '../../recap';
import type { RecapPlan } from './align';

const execFileAsync = promisify(execFile);

/** 转场时长（秒）——与 compile-clips 的 DELETE_DURATION_SEC 一致 */
export const RECAP_XFADE_SEC = 0.4;

/** 内置 BGM 心情白名单（资产：public/bgm/{mood}.mp3） */
export const RECAP_BGM_MOODS = ['calm', 'energetic', 'warm'] as const;
export type RecapBgmMood = (typeof RECAP_BGM_MOODS)[number];

export type RecapRenderResult = {
  /** 实际成片时长（秒，ffmpeg 探测） */
  durationSec: number;
  /** true = xfade 转场拼接；false = concat 硬拼兜底 */
  usedXfade: boolean;
  /** 渲染涉及的片段数 */
  pieceCount: number;
};

/** 与 cut-clip / compile-clips 相同的多级查找：ffmpeg-static > @ffmpeg-installer > 系统 PATH */
export async function findFfmpegBinary(): Promise<string> {
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

/**
 * 用 `ffmpeg -i` 探测媒体时长（stderr 打印 Duration；无输出时 ffmpeg 以 code1 退出）。
 * 用于：量出每章旁白 TTS 的真实时长 D_i（音画对齐的输入），以及每片裁剪结果。
 */
export async function probeDuration(ffmpegPath: string, filePath: string): Promise<number> {
  let stderr = '';
  try {
    await execFileAsync(ffmpegPath, ['-i', filePath], { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
  } catch (err: unknown) {
    stderr = String((err as { stderr?: string })?.stderr || '');
  }
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  const s = parseInt(m[3], 10);
  const frac = parseInt((m[4] || '0').padEnd(2, '0').slice(0, 2), 10);
  return h * 3600 + mi * 60 + s + frac / 100;
}

/** 判断媒体是否含音频轨（源视频无音轨时合成图里必须去掉 [0:a]，否则 ffmpeg 直接失败） */
async function probeHasAudio(ffmpegPath: string, filePath: string): Promise<boolean> {
  let stderr = '';
  try {
    await execFileAsync(ffmpegPath, ['-i', filePath], { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
  } catch (err: unknown) {
    stderr = String((err as { stderr?: string })?.stderr || '');
  }
  return /Stream #\d+:\d+.*: Audio:/.test(stderr);
}

/** 统一画幅的 -vf（横版 scale+pad；竖版居中裁 9:16 条再 scale）——与 compile-clips 同规格 */
function buildSegmentVf(vertical: boolean, W: number, H: number): string {
  if (vertical) {
    const cw = 'trunc(ih*9/16/2)*2';
    return `crop=${cw}:ih:(iw-${cw})/2:0,scale=${W}:${H},fps=30,format=yuv420p`;
  }
  return `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`;
}

/** 统一规格归一化裁剪（重编码），保证所有片段同分辨率/帧率/像素格式/音频采样，便于转场与 concat */
async function cutSegmentNormalized(
  ffmpegPath: string,
  muxedUrl: string,
  startTime: number,
  duration: number,
  outPath: string,
  vf: string,
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
}

/**
 * xfade(视频) + acrossfade(音频) 交叉淡化拼接。
 * offset_k = (前 k+1 段实测时长之和) - (k+1)*td（每次淡化累计消耗 td）。
 */
export async function stitchClipsXfade(
  ffmpegPath: string,
  segPaths: string[],
  durations: number[],
  outPath: string,
  td: number,
): Promise<void> {
  const n = segPaths.length;
  const args: string[] = ['-y'];
  for (const p of segPaths) args.push('-i', p);

  const vParts: string[] = [];
  let prevLabel = '[0:v]';
  let runningDue = 0;
  for (let k = 0; k < n - 1; k++) {
    runningDue += durations[k];
    const offset = runningDue - (k + 1) * td;
    const outLabel = k === n - 2 ? '[vout]' : `[x${k}]`;
    vParts.push(`[${prevLabel.slice(1, -1)}][${k + 1}:v]xfade=transition=fade:duration=${td}:offset=${offset.toFixed(2)}${outLabel}`);
    prevLabel = outLabel;
  }

  const aParts: string[] = [];
  prevLabel = '[0:a]';
  for (let k = 0; k < n - 1; k++) {
    const outLabel = k === n - 2 ? '[aout]' : `[a${k}]`;
    aParts.push(`[${prevLabel.slice(1, -1)}][${k + 1}:a]acrossfade=d=${td}${outLabel}`);
    prevLabel = outLabel;
  }

  args.push(
    '-filter_complex', `${vParts.join(';')};${aParts.join(';')}`,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', '-avoid_negative_ts', 'make_zero',
    outPath,
  );
  await execFileAsync(ffmpegPath, args, {
    maxBuffer: 40 * 1024 * 1024,
    timeout: 240_000,
    env: { ...process.env, LANG: 'C' },
  });
}

/** concat demuxer 硬拼兜底（片段已统一规格/编码，copy 即可；时长精确相加） */
export async function stitchClipsConcat(ffmpegPath: string, listPath: string, outPath: string): Promise<void> {
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
    timeout: 180_000,
    env: { ...process.env, LANG: 'C' },
  });
}

/**
 * 渲染整部解说成片。
 *
 * @param tempPaths 调用方传入的可变数组：本模块所有中间产物路径都会 push 进来，
 *                  由调用方在 finally 统一清理（本函数不删任何文件）。
 * @throws 任一片裁剪失败（502 语义由调用方处理）或最终合成失败
 */
export async function renderRecapFilm(params: {
  /** 源视频 muxed 流（CF Worker /stream） */
  muxedUrl: string;
  /** 音画对齐方案（planRecapTimeline 产物） */
  plan: RecapPlan;
  /** 每章旁白音频路径（MP3），顺序必须与 plan.chapters 一致 */
  narrationPaths: string[];
  /** 解说字幕 cues（成片相对时间） */
  cues: RecapCue[];
  style: SubtitleStyle;
  /** true = 竖版 720x1280；false = 横版 1280x720 */
  vertical: boolean;
  /** 原声音量 0..1（解说为主，通常压到 0.2 左右） */
  originalVolume: number;
  /** BGM 心情；null/undefined = 不加 BGM */
  bgmMood?: RecapBgmMood | null;
  outPath: string;
  /** 中间文件命名前缀（调用方生成 runId 保证并发隔离） */
  runId: string;
  tempPaths: string[];
}): Promise<RecapRenderResult> {
  const {
    muxedUrl, plan, narrationPaths, cues, style, vertical,
    originalVolume, bgmMood, outPath, runId, tempPaths,
  } = params;

  const chapters = plan.chapters;
  const pieces = chapters.flatMap((c) => c.pieces);
  if (pieces.length === 0) throw new Error('recap render: empty timeline plan');
  if (narrationPaths.length !== chapters.length) {
    throw new Error(`recap render: narration count ${narrationPaths.length} != chapters ${chapters.length}`);
  }

  const ffmpegPath = await findFfmpegBinary();
  if (!ffmpegPath) throw new Error('ffmpeg binary not found');

  // ── 1) 逐片裁剪（统一规格）；除最后一片外多切 td 供转场重叠 ──────────────
  const W = vertical ? 720 : 1280;
  const H = vertical ? 1280 : 720;
  const segVf = buildSegmentVf(vertical, W, H);
  const segPaths: string[] = [];
  const durations: number[] = [];

  for (let j = 0; j < pieces.length; j++) {
    const p = pieces[j];
    const timelineLen = Math.max(0.1, p.end - p.start);
    const need = timelineLen + (j < pieces.length - 1 ? RECAP_XFADE_SEC : 0);
    const segPath = join(tmpdir(), `recap-seg-${runId}-${j}.mp4`);
    tempPaths.push(segPath);

    await cutSegmentNormalized(ffmpegPath, muxedUrl, p.start, need, segPath, segVf);
    const actual = await probeDuration(ffmpegPath, segPath);
    segPaths.push(segPath);
    durations.push(actual > 0 ? actual : need);
    console.log(`[recap/render] seg ${j} (${p.role}) src=${p.start}-${p.end} want=${need.toFixed(2)}s got=${actual.toFixed(2)}s`);
  }

  // ── 2) 拼接：xfade 优先，失败降级 concat ────────────────────────────────
  let stitchedPath = segPaths[0];
  let usedXfade = false;

  if (segPaths.length > 1) {
    const stitchPath = join(tmpdir(), `recap-stitch-${runId}.mp4`);
    tempPaths.push(stitchPath);

    try {
      await stitchClipsXfade(ffmpegPath, segPaths, durations, stitchPath, RECAP_XFADE_SEC);
      usedXfade = true;
      stitchedPath = stitchPath;
      console.log('[recap/render] xfade stitch ok');
    } catch (e) {
      console.warn('[recap/render] xfade failed, falling back to concat:', e instanceof Error ? e.message.slice(0, 300) : e);
    }

    if (!usedXfade) {
      const listPath = join(tmpdir(), `recap-list-${runId}.txt`);
      tempPaths.push(listPath);
      await writeFile(listPath, segPaths.map((p) => `file '${p}'`).join('\n'));
      await stitchClipsConcat(ffmpegPath, listPath, stitchPath);
      stitchedPath = stitchPath;
      console.log('[recap/render] concat fallback ok');
    }
  }

  // ── 3) 成片合成（单 pass）：烧字幕 + 旁白/原声/BGM 混音 ──────────────────
  const assPath = await buildKaraokeAssFile(cues as SubtitleCue[], vertical ? 'vertical' : 'landscape', style);
  if (assPath) tempPaths.push(assPath);
  const fontConfigPath = await setupFontConfig();
  if (fontConfigPath) tempPaths.push(fontConfigPath);

  const bgmMoodSafe = bgmMood && RECAP_BGM_MOODS.includes(bgmMood) ? bgmMood : null;
  let bgmPath = '';
  if (bgmMoodSafe) {
    const candidate = join(process.cwd(), 'public', 'bgm', `${bgmMoodSafe}.mp3`);
    const s = await stat(candidate).catch(() => null);
    if (s && s.size > 5_000) bgmPath = candidate;
    else console.warn(`[recap/render] bgm asset missing: ${bgmMoodSafe}`);
  }

  const hasOriginalAudio = await probeHasAudio(ffmpegPath, stitchedPath);
  const narVolume = 1;
  const origVolume = Math.min(1, Math.max(0, originalVolume));
  const bgmVolume = Math.max(0.05, 1 - origVolume * 0.9);

  const args: string[] = ['-y', '-i', stitchedPath];
  for (const n of narrationPaths) args.push('-i', n);

  const bgmInputIndex = bgmPath ? 1 + narrationPaths.length : -1;
  if (bgmPath) args.push('-stream_loop', '-1', '-i', bgmPath);

  const filters: string[] = [];
  let videoLabel = '0:v';
  if (assPath) {
    // ★ execFile 不经 shell：filtergraph 无引号机制，force_style 内的逗号必须 \, 转义
    const assFilterPath = assPath.replace(/\\/g, '/');
    const fontsDir = join(process.cwd(), 'public', 'fonts');
    const forceStyle = subtitleFilterForceStyle(style, true).replace(/,/g, '\\,');
    filters.push(`[0:v]subtitles=${assFilterPath}:fontsdir=${fontsDir}:force_style=${forceStyle}[vout]`);
    videoLabel = '[vout]';
  }

  // 旁白轨：多章按序 concat（各章音频规格一致：同一声线/采样率）
  let narLabel: string;
  if (narrationPaths.length === 1) {
    narLabel = '[1:a]';
  } else {
    const labels = narrationPaths.map((_, i) => `[${i + 1}:a]`).join('');
    filters.push(`${labels}concat=n=${narrationPaths.length}:v=0:a=1[nar]`);
    narLabel = '[nar]';
  }
  // 旁白音量显式置 1（amix 会均摊，normalize=0 保证不自动增益）
  filters.push(`${narLabel}volume=${narVolume}[narout]`);

  const mixLabels: string[] = ['[narout]'];
  if (hasOriginalAudio) {
    filters.push(`[0:a]volume=${origVolume.toFixed(3)}[orig]`);
    mixLabels.push('[orig]');
  }
  if (bgmPath) {
    filters.push(`[${bgmInputIndex}:a]volume=${bgmVolume.toFixed(3)}[bg]`);
    mixLabels.push('[bg]');
  }

  let audioLabel: string;
  if (mixLabels.length === 1) {
    audioLabel = '[narout]';
  } else {
    filters.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:normalize=0[aout]`);
    audioLabel = '[aout]';
  }

  args.push('-filter_complex', filters.join(';'));
  args.push('-map', videoLabel);
  args.push('-map', audioLabel);
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p');
  args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100');
  args.push('-movflags', '+faststart', '-shortest', '-avoid_negative_ts', 'make_zero', outPath);

  console.log(`[recap/render] composite: pieces=${pieces.length} chapters=${chapters.length} cues=${cues.length} ass=${!!assPath} bgm=${bgmMoodSafe || '-'} origAudio=${hasOriginalAudio} xfade=${usedXfade}`);

  await execFileAsync(ffmpegPath, args, {
    maxBuffer: 60 * 1024 * 1024,
    timeout: 280_000,
    env: { ...process.env, LANG: 'C' },
  });

  const outStat = await stat(outPath).catch(() => null);
  if (!outStat || outStat.size < 20_000) {
    throw new Error('recap render: output too small or missing');
  }

  const durationSec = await probeDuration(ffmpegPath, outPath);
  return { durationSec, usedXfade, pieceCount: pieces.length };
}