'use strict';

/**
 * YueCut · 本地批量导出
 *
 *  - 9:16 中心裁剪（直播横屏源自动裁竖屏，竖屏源直接缩放）；
 *  - 优先 VideoToolbox 硬件编码（h264_videotoolbox），不可用回落 libx264；
 *  - 烧录 ASS 字幕（白字高对比 + 柠绿价格行），同时可导出 SRT 侧车文件；
 *  - 纯本地 ffmpeg，零网络；通过 -progress 解析真实渲染进度。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { assEscape } = require('./yuecut-cantonese');
const { probeMedia } = require('./local-render');

const EXPORT_DEFAULTS = {
  width: 1080,
  height: 1920,
  fps: 30,
  videoCodec: 'auto', // auto | videotoolbox | libx264
  burnSubtitles: true,
  keepSrt: true,
  subtitleLang: 'yue', // yue | zh
  stylePreset: 'commerce', // commerce | simple
  hookText: '',
  priceText: '',
};

function pad2(n) {
  return String(Math.floor(n)).padStart(2, '0');
}

/** 秒 → SRT 时间码 00:00:03,200 */
function srtTime(t) {
  const v = Math.max(0, Number(t) || 0);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = Math.floor(v % 60);
  const ms = Math.round((v - Math.floor(v)) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${String(ms).padStart(3, '0')}`;
}

/** 秒 → ASS 时间码 0:00:03.20 */
function assTime(t) {
  const v = Math.max(0, Number(t) || 0);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = Math.floor(v % 60);
  const cs = Math.round((v - Math.floor(v)) * 100);
  return `${h}:${pad2(m)}:${pad2(s)}.${String(cs).padStart(2, '0')}`;
}

/** 由 cue 列表生成 SRT（offset 相对成片起点）。 */
function buildSrt(cues, offset = 0) {
  return (Array.isArray(cues) ? cues : [])
    .filter((c) => c && Number.isFinite(Number(c.start)) && Number.isFinite(Number(c.end)) && String(c.text || '').trim())
    .map((c, i) => {
      const begin = Math.max(0, Number(c.start) - offset);
      const end = Math.max(begin + 0.1, Number(c.end) - offset);
      return `${i + 1}\n${srtTime(begin)} --> ${srtTime(end)}\n${String(c.text).trim()}\n`;
    })
    .join('\n');
}

/**
 * 生成带货样式 ASS（PlayRes 1080×1920）：
 *  Price 柠绿价格行（画面下三分之一）、Sub 白字黑边字幕（底部安全区）。
 */
function buildAss({ cues, offset = 0, duration, hookText = '', priceText = '', preset = 'commerce' }) {
  const W = 1080;
  const H = 1920;
  const isSimple = preset === 'simple';
  const subSize = isSimple ? 74 : 82;
  const hookSize = 92;
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,PingFang SC,${subSize},&H00FFFFFF,&H000000FF,&H00111111,&H64000000,-1,0,0,0,100,100,0,0,1,5,2,2,72,72,150,1
Style: Hook,PingFang SC,${hookSize},&H0069F2C6,&H000000FF,&H00101408,&H78000000,-1,0,0,0,100,100,0,0,1,6,3,2,80,80,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = [];
  const totalDur = Number.isFinite(Number(duration)) && duration > 0 ? duration : 0;

  // 价格行（+ 钩子句）：前 4 秒只显示钩子句，4 秒后价格行常驻到结尾。
  if (priceText || hookText) {
    const parts = [];
    if (hookText) parts.push(assEscape(hookText));
    if (priceText) parts.push(`{\\c&H0069F2C6&}${assEscape(priceText)}`);
    const text = parts.join('\\N');
    lines.push(`Dialogue: 1,${assTime(0)},${assTime(totalDur || 5)},Hook,,0,0,0,,${text}`);
  }

  for (const c of Array.isArray(cues) ? cues : []) {
    if (!c || !String(c.text || '').trim()) continue;
    const begin = Math.max(0, Number(c.start) - offset);
    const end = Math.max(begin + 0.1, Number(c.end) - offset);
    if (totalDur && begin >= totalDur) continue;
    lines.push(`Dialogue: 0,${assTime(begin)},${assTime(Math.min(end, totalDur || end))},Sub,,0,0,0,,${assEscape(c.text)}`);
  }

  return header + lines.join('\n') + '\n';
}

// ── 硬件编码探测（memoized）──────────────────────────────────────────────────

let hwEncoderCache = null;
async function detectHardwareEncoder(ffmpeg) {
  if (hwEncoderCache !== null) return hwEncoderCache;
  await new Promise((resolve) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-encoders']);
    let out = '';
    child.stdout.on('data', (b) => { out += String(b); });
    child.stderr.on('data', (b) => { out += String(b); });
    child.on('error', () => resolve());
    child.on('close', () => {
      hwEncoderCache = /h264_videotoolbox/.test(out) ? 'h264_videotoolbox' : null;
      resolve();
    });
  });
  return hwEncoderCache;
}

/** 9:16 居中裁剪滤镜（输入 iw/ih，输出 width×height）。 */
function buildPortraitChain(width, height, assName) {
  const crop = `crop='min(iw,ih*${width}/${height})':'min(ih,iw*${height}/${width})',scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  const chain = assName ? `${crop},subtitles=${assName}:fontsdir=./` : crop;
  return ['-filter_complex', `[0:v]${chain}[vout]`];
}

function sanitizeName(s) {
  return String(s || 'clip').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 90);
}

/** 输出文件命名：主播_话术主题_序号.mp4 */
function outputFileName({ streamer = '', title = '', index = 1 }) {
  const parts = [streamer, title].map((s) => sanitizeName(s)).filter(Boolean);
  const base = parts.length ? parts.join('_') : 'clip';
  return `${base}_${String(index).padStart(3, '0')}.mp4`;
}

/**
 * 渲染单条切片。
 * @param {object} opts
 * @param {(p:{stage:string,progress:number,message?:string})=>void} [opts.onProgress]
 */
async function renderClip(opts) {
  const settings = { ...EXPORT_DEFAULTS, ...(opts.settings || {}) };
  const inputPath = String(opts.inputPath || '').trim();
  const clip = opts.clip || {};
  const start = Math.max(0, Number(clip.start) || 0);
  const end = Number(clip.end);
  if (!inputPath || !fs.existsSync(inputPath)) {
    const e = new Error('源素材不存在');
    e.code = 'YECUT_INPUT_MISSING';
    throw e;
  }
  if (!Number.isFinite(end) || end <= start) {
    const e = new Error('切片时间区间无效');
    e.code = 'YECUT_BAD_WINDOW';
    throw e;
  }
  const outDir = String(opts.outDir || '').trim();
  if (!outDir) {
    const e = new Error('缺少输出目录');
    e.code = 'YECUT_OUTDIR';
    throw e;
  }
  const ffmpeg = String(opts.ffmpegPath || '').trim();
  if (!ffmpeg) {
    const e = new Error('未找到 ffmpeg');
    e.code = 'NO_FFMPEG';
    throw e;
  }

  await fsp.mkdir(outDir, { recursive: true });
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  onProgress({ stage: 'probe', progress: 2, message: '探测源素材' });

  const meta = await probeMedia(inputPath);
  const duration = end - start;

  // 字幕文件（在 outDir 内，cwd=outDir 规避路径转义）
  let assName = '';
  let srtName = '';
  const cues = Array.isArray(opts.cues)
    ? opts.cues.map((c) => ({ start: c.start, end: c.end, text: settings.subtitleLang === 'zh' && c.textZh ? c.textZh : c.text }))
    : [];

  if (settings.burnSubtitles && cues.length) {
    assName = `yc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ass`;
    await fsp.writeFile(
      path.join(outDir, assName),
      buildAss({
        cues,
        offset: start,
        duration,
        hookText: settings.hookText || '',
        priceText: settings.priceText || '',
        preset: settings.stylePreset,
      }),
      'utf8',
    );
  }
  if (settings.keepSrt && cues.length) {
    srtName = `${sanitizeName(opts.baseName || 'clip')}.srt`;
    await fsp.writeFile(path.join(outDir, srtName), buildSrt(cues, start), 'utf8');
  }

  const outputName = opts.outputName || outputFileName({
    streamer: opts.streamer,
    title: opts.title,
    index: opts.index,
  });
  const outputPath = path.join(outDir, outputName);

  const args = [
    '-y', '-nostdin', '-hide_banner',
    '-ss', String(start),
    '-i', inputPath,
    '-t', String(duration),
    ...buildPortraitChain(settings.width, settings.height, assName),
    '-map', '[vout]',
    '-map', '0:a:0?',
    '-r', String(settings.fps),
  ];

  // 编码器选择
  let encoder = 'libx264';
  const hw = settings.videoCodec === 'libx264' ? null : await detectHardwareEncoder(ffmpeg);
  if (settings.videoCodec === 'videotoolbox' || settings.videoCodec === 'auto') {
    if (hw) {
      encoder = 'h264_videotoolbox';
      args.push('-c:v', 'h264_videotoolbox', '-b:v', '9M', '-maxrate', '12M', '-allow_sw', '1');
    } else {
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20');
    }
  } else {
    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20');
  }
  args.push(
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
    outputPath,
  );

  onProgress({ stage: 'render', progress: 5, message: `渲染中（${encoder === 'h264_videotoolbox' ? '硬件加速' : 'x264'}）` });

  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { cwd: outDir, env: { ...process.env, LANG: 'C' } });
    let stderr = '';
    child.stderr.on('data', (b) => { stderr += String(b); });
    child.stdout.on('data', (b) => {
      const text = String(b);
      const m = text.match(/out_time_ms=(\d+)/);
      if (m) {
        const done = Number(m[1]) / 1_000_000;
        const pct = clampPct(5 + (done / duration) * 92);
        onProgress({ stage: 'render', progress: pct, message: '渲染中' });
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        const tail = stderr.split('\n').slice(-4).join(' ').slice(0, 500);
        const e = new Error(`ffmpeg 渲染失败（${code}）：${tail}`);
        e.code = 'YECUT_RENDER_FAILED';
        reject(e);
      }
    });
  });

  // 校验产物
  const outMeta = await probeMedia(outputPath);
  if (!(outMeta.duration > 0)) {
    const e = new Error('渲染产物无法解码');
    e.code = 'YECUT_INVALID_OUTPUT';
    throw e;
  }

  // 烧录用的 ASS 是临时文件（字幕已烧入画面），只保留 mp4 + SRT
  if (assName) await fsp.unlink(path.join(outDir, assName)).catch(() => {});

  onProgress({ stage: 'done', progress: 100, message: '导出完成' });
  return {
    outputPath,
    outputName,
    srtName,
    encoder,
    width: outMeta.width,
    height: outMeta.height,
    duration: Math.round(outMeta.duration * 100) / 100,
  };
}

function clampPct(n) {
  return Math.max(0, Math.min(99, Math.round(n)));
}

module.exports = {
  EXPORT_DEFAULTS,
  srtTime,
  assTime,
  buildSrt,
  buildAss,
  detectHardwareEncoder,
  buildPortraitChain,
  outputFileName,
  renderClip,
};
