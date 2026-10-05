'use strict';

/**
 * 本地音频信号提取（T1.3）
 *
 * 用 ffmpeg 从媒体里提取**与字幕无关**的高光依据，补齐
 * `local-highlight-scorer.js` 里已预留但一直没数据源的 `signals` 接口：
 *  - signals.loudness: [{ start, end, value }]      value 归一到 0..1（响度峰值）
 *  - signals.emotion:  [{ start, end, kind, value }] kind='laughter'（高频带相对突增）
 *
 * 数据来源：
 *  - 全带  `ebur128`（momentary LUFS）+ `ametadata=print` → 逐点响度
 *  - 静音  `silencedetect`                              → 死air区间（用于把响度置 0）
 *  - 高频带 `highpass=f=1500,ebur128`                   → 笑声/摩擦音等高频能量
 *
 * 设计约束：
 *  - 纯函数解析（parse/normalize/bucketize/derive）便于单测，不依赖 fs / 子进程。
 *  - 信号是**加分项而非必需项**：ffmpeg 不可用时抛结构化 `NO_FFMPEG`，
 *    调用方 catch 后照常走 ASR 语义打分（绝不阻断出片）。
 */

const fs = require('node:fs');
const { execFile } = require('node:child_process');

const DEFAULT_LUFS_MIN = -40;
const DEFAULT_LUFS_MAX = -12;
const DEFAULT_WINDOW_SEC = 3;
const DEFAULT_SILENCE_DB = -30;
const DEFAULT_SILENCE_MIN = 0.5;
const DEFAULT_EMOTION_BAND_HZ = 1500;
const DEFAULT_EMOTION_MIN = 0.18;
const MIN_DYNAMIC_RANGE_LUFS = 6;
const DEFAULT_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

function signalsError(code, message, hint) {
  const err = new Error(message);
  err.code = code;
  if (hint) err.hint = hint;
  return err;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round3(v) {
  return Math.round(Number(v) * 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* 纯函数：解析 ffmpeg 输出                                            */
/* ------------------------------------------------------------------ */

/**
 * 解析 `silencedetect` 的日志（stderr）。
 * 未闭合的 silence_start 用 duration 收尾；无 duration 则丢弃（不猜）。
 */
function parseSilences(text, duration = 0) {
  const src = String(text || '');
  const re = /silence_(start|end):\s*(-?[\d.]+)(?:\s*\|\s*silence_duration:\s*([\d.]+))?/g;
  const out = [];
  let open = null;
  let m;
  while ((m = re.exec(src)) !== null) {
    const kind = m[1];
    const value = Number(m[2]);
    if (!isFiniteNumber(value)) continue;
    if (kind === 'start') {
      if (open === null) open = Math.max(0, value);
      continue;
    }
    if (open !== null && value > open) {
      out.push({ start: round3(open), end: round3(value) });
      open = null;
    }
  }
  if (open !== null && isFiniteNumber(Number(duration)) && Number(duration) > open) {
    out.push({ start: round3(open), end: round3(Number(duration)) });
  }
  return out;
}

/**
 * 解析 `ebur128=metadata=1,ametadata=print` 的逐点响度（stdout）。
 * 形如：
 *   frame:0    pts:0    pts_time:0.1
 *   lavfi.r128.M=-23.4
 */
function parseLoudness(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let t = null;
  for (const line of lines) {
    const timeMatch = line.match(/pts_time:\s*(-?[\d.]+)/);
    if (timeMatch) {
      const v = Number(timeMatch[1]);
      t = isFiniteNumber(v) ? v : null;
    }
    const m = line.match(/lavfi\.r128\.M\s*=\s*(-?[\d.]+|-?inf)/i);
    if (!m) continue;
    const raw = m[1].toLowerCase();
    const lufs = raw.includes('inf') ? (raw.startsWith('-') ? -120 : 0) : Number(raw);
    if (!isFiniteNumber(lufs)) continue;
    out.push({ time: t === null ? out.length * 0.1 : t, lufs: clamp(lufs, -120, 5) });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** 解析整体响度 `lavfi.r128.I`（最后一个值）。 */
function parseIntegratedLufs(text) {
  const re = /lavfi\.r128\.I\s*=\s*(-?[\d.]+|-?inf)/gi;
  let last = null;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) last = m[1];
  if (last === null) return null;
  const raw = last.toLowerCase();
  if (raw.includes('inf')) return null;
  const v = Number(raw);
  return isFiniteNumber(v) ? round3(v) : null;
}

/* ------------------------------------------------------------------ */
/* 纯函数：归一化与聚合                                                */
/* ------------------------------------------------------------------ */

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
}

/**
 * LUFS → 0..1。默认「动态归一化」：用本片自身的 p05/p95 作为量程，
 * 让安静播客与高声vlog都能得到有区分度的峰值；动态范围过小则回落固定量程。
 */
function normalizeLoudnessPoints(points, { lufsMin, lufsMax, dynamic = true } = {}) {
  const list = (Array.isArray(points) ? points : [])
    .map((p) => ({ time: Number(p && p.time), lufs: Number(p && p.lufs) }))
    .filter((p) => isFiniteNumber(p.time) && isFiniteNumber(p.lufs));
  if (!list.length) return [];

  let lo = isFiniteNumber(lufsMin) ? lufsMin : DEFAULT_LUFS_MIN;
  let hi = isFiniteNumber(lufsMax) ? lufsMax : DEFAULT_LUFS_MAX;
  if (dynamic) {
    const sorted = list.map((p) => p.lufs).sort((a, b) => a - b);
    const p05 = percentile(sorted, 0.05);
    const p95 = percentile(sorted, 0.95);
    if (p95 - p05 >= MIN_DYNAMIC_RANGE_LUFS) {
      lo = p05;
      hi = p95;
    }
  }
  const span = Math.max(1, hi - lo);
  return list.map((p) => ({
    time: round3(p.time),
    value: clamp((p.lufs - lo) / span, 0, 1),
  }));
}

/** 按固定窗口取每桶峰值，返回 [{ start, end, value }]。 */
function bucketize(points, { windowSec, duration = 0 } = {}) {
  const w = isFiniteNumber(windowSec) && windowSec > 0 ? windowSec : DEFAULT_WINDOW_SEC;
  const buckets = new Map();
  for (const p of Array.isArray(points) ? points : []) {
    const time = Number(p && p.time);
    const value = Number(p && p.value);
    if (!isFiniteNumber(time) || !isFiniteNumber(value)) continue;
    const idx = Math.max(0, Math.floor(time / w));
    const cur = buckets.get(idx);
    if (!cur || value > cur.value) {
      buckets.set(idx, { start: round3(idx * w), end: round3((idx + 1) * w), value: clamp(value, 0, 1) });
    }
  }
  const total = Number(duration) > 0 ? Number(duration) : 0;
  return Array.from(buckets.keys())
    .sort((a, b) => a - b)
    .map((k) => {
      const b = buckets.get(k);
      return { start: b.start, end: total > 0 ? Math.min(total, b.end) : b.end, value: b.value };
    });
}

function overlapLen(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** 与静音区间重叠过半的窗口视为无内容，响度置 0。 */
function applySilence(windows, silences) {
  const list = Array.isArray(silences) ? silences : [];
  if (!list.length) return windows;
  return windows.map((w) => {
    const span = Math.max(0.001, w.end - w.start);
    let quiet = 0;
    for (const s of list) quiet += overlapLen(w.start, w.end, s.start, s.end);
    return quiet / span >= 0.5 ? { ...w, value: 0 } : w;
  });
}

/**
 * 高频带相对全带的突增 → 情绪/笑声高点。
 * 两个序列各自动态归一后逐桶相减，delta 越大越可能是笑声/欢呼。
 */
function deriveEmotion(fullWindows, bandWindows, { minDelta } = {}) {
  const threshold = isFiniteNumber(minDelta) ? minDelta : DEFAULT_EMOTION_MIN;
  const full = new Map((Array.isArray(fullWindows) ? fullWindows : []).map((w, i) => [i, w]));
  const band = new Map((Array.isArray(bandWindows) ? bandWindows : []).map((w, i) => [i, w]));
  const out = [];
  for (const [idx, bw] of band) {
    const fw = full.get(idx);
    const delta = clamp(bw.value - (fw ? fw.value : 0), 0, 1);
    if (delta < threshold) continue;
    out.push({ start: bw.start, end: bw.end, kind: 'laughter', value: round3(delta) });
  }
  return out;
}

/**
 * 组装最终 signals（纯函数，单测入口）。
 * @returns {{ loudness:Array, emotion:Array, silences:Array, integratedLufs:number|null }}
 */
function buildSignals({
  fullPoints,
  bandPoints,
  silences,
  duration,
  integratedLufs = null,
  windowSec,
  lufsMin,
  lufsMax,
  dynamic,
  emotionMin,
} = {}) {
  const fullNorm = normalizeLoudnessPoints(fullPoints, { lufsMin, lufsMax, dynamic });
  const fullWindows = bucketize(fullNorm, { windowSec, duration });
  const loudness = applySilence(fullWindows, silences)
    .filter((w) => w.value > 0)
    .map((w) => ({ start: w.start, end: w.end, value: round3(w.value) }));

  let emotion = [];
  if (Array.isArray(bandPoints) && bandPoints.length) {
    const bandNorm = normalizeLoudnessPoints(bandPoints, { lufsMin, lufsMax, dynamic });
    const bandWindows = bucketize(bandNorm, { windowSec, duration });
    emotion = deriveEmotion(fullWindows, bandWindows, { minDelta: emotionMin });
  }

  return {
    loudness,
    emotion,
    silences: (Array.isArray(silences) ? silences : []).map((s) => ({ start: round3(s.start), end: round3(s.end) })),
    integratedLufs: isFiniteNumber(integratedLufs) ? round3(integratedLufs) : null,
  };
}

/** 清洗来自渲染进程的 signals，坏数据不参与打分。 */
function normalizeSignals(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const clean = (list, withKind) =>
    (Array.isArray(list) ? list : [])
      .map((s) => {
        const start = Number(s && s.start);
        const end = Number(s && s.end);
        const value = Number(s && s.value);
        if (!isFiniteNumber(start) || !isFiniteNumber(end) || end <= start || !isFiniteNumber(value)) return null;
        const item = { start, end, value: clamp(value, 0, 1) };
        if (withKind) item.kind = String((s && s.kind) || 'emotion');
        return item;
      })
      .filter(Boolean);
  return { loudness: clean(src.loudness, false), emotion: clean(src.emotion, true) };
}

/* ------------------------------------------------------------------ */
/* ffmpeg 调用（薄壳，可被调用方 catch 后降级）                          */
/* ------------------------------------------------------------------ */

function runFfmpegPass(bin, inputPath, filter, { timeoutMs, maxBuffer } = {}) {
  const args = [
    '-hide_banner',
    '-nostdin',
    '-nostats',
    '-i', inputPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-af', filter,
    '-f', 'null',
    '-',
  ];
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { timeout: timeoutMs || DEFAULT_TIMEOUT_MS, maxBuffer: maxBuffer || DEFAULT_MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err) {
          reject(signalsError('SIGNALS_RUN_FAILED', String(stderr || err.message).slice(-800)));
          return;
        }
        resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
      },
    );
  });
}

/**
 * 提取音频信号。ffmpeg 缺失抛 NO_FFMPEG；输入缺失抛 SIGNALS_INPUT_MISSING。
 * 高频带（情绪）pass 为 best-effort：失败只丢 emotion，不影响 loudness。
 */
async function extractSignals({
  inputPath,
  ffmpegPath: bin,
  duration = 0,
  wantEmotion = true,
  silenceDb,
  silenceMinDur,
  windowSec,
  lufsMin,
  lufsMax,
  emotionBandHz,
  emotionMin,
  timeoutMs,
} = {}) {
  if (!bin) {
    throw signalsError('NO_FFMPEG', '未找到 ffmpeg，无法提取音频信号。');
  }
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw signalsError('SIGNALS_INPUT_MISSING', '待分析的媒体文件不存在。');
  }

  const noise = isFiniteNumber(silenceDb) ? silenceDb : DEFAULT_SILENCE_DB;
  const minDur = isFiniteNumber(silenceMinDur) ? silenceMinDur : DEFAULT_SILENCE_MIN;
  const mainFilter = [
    `silencedetect=noise=${noise}dB:d=${minDur}`,
    'ebur128=metadata=1',
    'ametadata=mode=print:file=-',
  ].join(',');

  const main = await runFfmpegPass(bin, inputPath, mainFilter, { timeoutMs });
  const fullPoints = parseLoudness(main.stdout);
  const silences = parseSilences(main.stderr, duration);
  const integratedLufs = parseIntegratedLufs(main.stdout);

  let bandPoints = [];
  if (wantEmotion) {
    const band = isFiniteNumber(emotionBandHz) ? emotionBandHz : DEFAULT_EMOTION_BAND_HZ;
    try {
      const hi = await runFfmpegPass(
        bin,
        inputPath,
        [`highpass=f=${band}`, 'ebur128=metadata=1', 'ametadata=mode=print:file=-'].join(','),
        { timeoutMs },
      );
      bandPoints = parseLoudness(hi.stdout);
    } catch {
      bandPoints = [];
    }
  }

  const signals = buildSignals({
    fullPoints,
    bandPoints,
    silences,
    duration,
    integratedLufs,
    windowSec,
    lufsMin,
    lufsMax,
    dynamic: true,
    emotionMin,
  });
  return {
    ...signals,
    stats: {
      engine: 'ffmpeg',
      loudnessPoints: fullPoints.length,
      bandPoints: bandPoints.length,
      windows: signals.loudness.length,
    },
  };
}

module.exports = {
  parseSilences,
  parseLoudness,
  parseIntegratedLufs,
  normalizeLoudnessPoints,
  bucketize,
  applySilence,
  deriveEmotion,
  buildSignals,
  normalizeSignals,
  extractSignals,
  signalsError,
};
