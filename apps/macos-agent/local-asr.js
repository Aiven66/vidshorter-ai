'use strict';

/**
 * 本地 ASR 引擎（P0-1）
 *
 * 支持两个引擎，自动优选、互为回落：
 *  ① whisper.cpp（`whisper-cli`）—— 通用多语，输出分段 + **词级时间戳**。
 *  ② sherpa-onnx SenseVoice（`sherpa-onnx-offline`）—— **中文/多语精度更高**，
 *     输出的 JSON 含 token 级秒级时间戳；可再叠加说话人分离（`sherpa-onnx-offline-
 *     speaker-diarization`）产出 `speaker`，供「只保留主讲人」的高光规则使用。
 *
 * 设计：
 *  - `detectEngine()` 只做探测，不下载；不可用时抛结构化错误 `NO_ASR_ENGINE`，绝不静默返回空。
 *  - `transcribe()` 走磁盘缓存（key = 文件 sha256 + 引擎 + 模型 + 语言），二次调用 O(1)。
 *  - 解析 / 切句 / 说话人归属均为**纯函数**，便于单测。
 *
 * SenseVoice 说明（已核对上游源码 + 实测）：
 *  - CLI 无 VAD 参数，整段音频只回一行 JSON；**且对多语句音频不可靠**
 *    （实测 14s「两句话/两种人声」只转出后半段）。因此本模块**自己做切块**：
 *    ffmpeg `silencedetect` 求语音区间 → 按 ≤CHUNK_MAX_LEN 切块 → 一次性把多个
 *    分块喂给 sherpa（每个输入一行 JSON、顺序对应）→ 按块起始时间回填偏移。
 *  - stdout 每行一个 `AsJsonString()`：`{ text, timestamps, tokens, words, lang, ... }`，
 *    `timestamps` 单位是**秒**，与 `tokens` 一一对应；SenseVoice 的 `words` 为空，
 *    `lang` 形如 `<|zh|>`（需剥壳）。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { createModelStore, SENSEVOICE_MODEL_ID, DIARIZATION_MODEL_ID } = require('./local-models');
const { parseSilences } = require('./local-signals');

const ENGINE_WHISPER = 'whisper.cpp';
const ENGINE_SENSEVOICE = 'sherpa-onnx-sense-voice';
/** 兼容既有引用（默认引擎）。 */
const ENGINE = ENGINE_WHISPER;

// ------------------------------ whisper.cpp ------------------------------

const BIN_NAMES = ['whisper-cli', 'whisper', 'main'];
const COMMON_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin'];

const QUALITY_MODEL = {
  fast: 'whisper-tiny',
  balanced: 'whisper-base',
  best: 'whisper-small',
};

// ---------------------------- sherpa-onnx SenseVoice ----------------------------

const SHERPA_ASR_BIN = 'sherpa-onnx-offline';
const SHERPA_DIAR_BIN = 'sherpa-onnx-offline-speaker-diarization';
/** SenseVoice 支持的语言；'auto' 交给模型判定。 */
const SENSEVOICE_LANGS = ['auto', 'zh', 'en', 'ja', 'ko', 'yue'];

// ------------------------------ 切句参数 ------------------------------

/** 单条字幕时长上限（秒）：超过即强制断句。 */
const CUE_MAX_LEN = 12;
/** 断句最小长度（秒）：避免被标点切成碎片。 */
const CUE_MIN_LEN = 0.8;
/** token 之间的静默间隔（秒）超过此值视为停顿边界。 */
const TOKEN_GAP = 0.6;
/** 句末强标点：在这些 token 后断句。 */
const STRONG_PUNCT = /[。！？!?…]+$/;
/** 句中断点：仅在句子已经足够长时才断。 */
const SOFT_PUNCT = /[，,、；;：:]+$/;
/** CJK 字符（用于拼文本时决定要不要加空格）。 */
const CJK = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;

/** 16k 单声道 16bit PCM：每秒字节数。 */
const BYTES_PER_SEC = 16000 * 2;
/** SenseVoice 单次推理的音频时长上限（秒）。实测 >20s 连续语音仍正常，30s 是其常见上限。 */
const CHUNK_MAX_LEN = 28;
/** 过短的语音片段直接丢弃（避免静音段被幻觉出词）。 */
const CHUNK_MIN_LEN = 0.25;
/** 分块数量安全上限，防止极端参数打爆命令行。 */
const CHUNK_MAX_COUNT = 400;

function asrError(code, message, hint) {
  const err = new Error(message);
  err.code = code;
  if (hint) err.hint = hint;
  return err;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function round3(v) {
  return Math.round(Number(v) * 1000) / 1000;
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findInPath(name) {
  const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (isExecutable(candidate)) return candidate;
  }
  return '';
}

function dedupe(list) {
  const seen = new Set();
  return (list || []).filter((d) => d && !seen.has(d) && seen.add(d));
}

/**
 * 随包分发的 whisper-cli 目录（prepare-whisper.js 产出到 bin/whisper）。
 * 覆盖 dev（__dirname/bin/whisper）与打包后（app.asar -> app.asar.unpacked）两种情况。
 */
function bundledBinDirs() {
  const dirs = [path.join(__dirname, 'bin', 'whisper')];
  const res = process.resourcesPath || '';
  if (res) dirs.push(path.join(res, 'bin', 'whisper'), path.join(res, 'app.asar.unpacked', 'bin', 'whisper'));
  return dedupe(dirs.map((d) => d.replace(/\.asar([/\\])/, '.asar.unpacked$1')));
}

/**
 * 随包分发的 sherpa-onnx ASR 目录（prepare-sherpa-asr.js 产出到 resources/sherpa-onnx/asr/bin）。
 * 与 kokoro TTS 的 `resources/sherpa-onnx/bin` 隔离，避免 ABI 互相影响；
 * 同时兼容手工把 ASR 二进制放进 `sherpa-onnx/bin` 的情况。
 */
function bundledSherpaBinDirs() {
  const dirs = [
    path.join(__dirname, 'resources', 'sherpa-onnx', 'asr', 'bin'),
    path.join(__dirname, 'resources', 'sherpa-onnx', 'bin'),
  ];
  const res = process.resourcesPath || '';
  if (res) {
    dirs.push(
      path.join(res, 'sherpa-onnx', 'asr', 'bin'),
      path.join(res, 'app.asar.unpacked', 'sherpa-onnx', 'asr', 'bin'),
      path.join(res, 'sherpa-onnx', 'bin'),
    );
  }
  return dedupe(dirs.map((d) => d.replace(/\.asar([/\\])/, '.asar.unpacked$1')));
}

function resolveBinary(binDirs) {
  const override = String(process.env.CLIPOP_WHISPER_CLI || process.env.WHISPER_CLI_PATH || '').trim();
  if (override && isExecutable(override)) return override;
  const dirs = dedupe([...(binDirs || []), ...bundledBinDirs(), ...COMMON_BIN_DIRS]);
  for (const dir of dirs) {
    for (const name of BIN_NAMES) {
      const candidate = path.join(dir, name);
      if (isExecutable(candidate)) return candidate;
    }
  }
  for (const name of BIN_NAMES) {
    const found = findInPath(name);
    if (found) return found;
  }
  return '';
}

function resolveSherpaBinary(name, binDirs) {
  const override = String(process.env.CLIPOP_SHERPA_ONNX_DIR || '').trim();
  const dirs = dedupe([
    ...(binDirs || []),
    ...(override ? [path.join(override, 'bin'), override] : []),
    ...bundledSherpaBinDirs(),
  ]);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (isExecutable(candidate)) return candidate;
  }
  return findInPath(name);
}

// ------------------------------ 解析（纯函数） ------------------------------

/**
 * 解析 whisper.cpp 的 JSON 输出。
 * `-oj` 为分段 JSON；`-ojf` 额外带 `tokens`（词级）。
 */
function parseWhisperJson(raw) {
  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { lang: null, cues: [], words: [] };
  }
  if (!data || typeof data !== 'object') return { lang: null, cues: [], words: [] };

  const segments = Array.isArray(data.transcription) ? data.transcription : [];
  const cues = [];
  const words = [];

  for (const seg of segments) {
    const offsets = seg && seg.offsets ? seg.offsets : null;
    const start = offsets && Number.isFinite(Number(offsets.from)) ? Number(offsets.from) / 1000 : NaN;
    const end = offsets && Number.isFinite(Number(offsets.to)) ? Number(offsets.to) / 1000 : NaN;
    const text = String(seg && seg.text != null ? seg.text : '').trim();
    if (text && Number.isFinite(start) && Number.isFinite(end) && end > start) {
      cues.push({ start, end, text });
    }
    const tokens = Array.isArray(seg && seg.tokens) ? seg.tokens : [];
    for (const token of tokens) {
      const tOffsets = token && token.offsets ? token.offsets : null;
      const tStart = tOffsets && Number.isFinite(Number(tOffsets.from)) ? Number(tOffsets.from) / 1000 : NaN;
      const tEnd = tOffsets && Number.isFinite(Number(tOffsets.to)) ? Number(tOffsets.to) / 1000 : NaN;
      const tText = String(token && token.text != null ? token.text : '');
      if (!tText || /^\[_/.test(tText)) continue;
      if (!Number.isFinite(tStart) || !Number.isFinite(tEnd) || tEnd < tStart) continue;
      words.push({ start: tStart, end: tEnd, text: tText });
    }
  }

  const lang =
    (data.result && typeof data.result.language === 'string' && data.result.language) ||
    (data.params && typeof data.params.language === 'string' && data.params.language) ||
    null;

  return { lang, cues: normalizeCues(cues), words: normalizeWords(words) };
}

function normalizeCues(cues) {
  return (Array.isArray(cues) ? cues : [])
    .map((c) => ({
      start: Number(c.start),
      end: Number(c.end),
      text: String(c.text || '').trim(),
    }))
    .filter((c) => c.text && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start)
    .sort((a, b) => a.start - b.start);
}

function normalizeWords(words) {
  return (Array.isArray(words) ? words : [])
    .map((w) => ({
      start: Number(w.start),
      end: Number(w.end),
      text: String(w.text || ''),
    }))
    .filter((w) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start)
    .sort((a, b) => a.start - b.start);
}

/** SenseVoice 会输出 `<|zh|>` / `<_..._>` 之类的特殊 token，需剔除。 */
function isSpecialToken(text) {
  const s = String(text || '');
  return !s || /^<\|.*\|>$/.test(s) || /^<_/.test(s);
}

/** 归一化 SenseVoice 的 lang：`<|zh|>` → `zh`。 */
function normalizeLang(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  const m = s.match(/^<\|([A-Za-z-]+)\|>$/);
  return (m ? m[1] : s).toLowerCase() || null;
}

/**
 * 解析 `sherpa-onnx-offline` 的 stdout：每个输入 wav 一行 `AsJsonString()`，**顺序对应**。
 * 形如 `{"lang":"<|en|>","text":"你好","timestamps":[0.1,0.4],"tokens":["你","好"],"words":[]}`。
 * 非 JSON 行（日志）被忽略；`timestamps` 为秒，按 token 依次对齐。
 *
 * @returns {Array<{lang:string|null, tokens:Array<{start:number,end:number,text:string}>}>}
 */
function parseSenseVoiceLines(raw) {
  const lines = [];
  for (const line of String(raw || '').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s[0] !== '{') continue;
    let obj;
    try {
      obj = JSON.parse(s);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== 'object') continue;

    const texts = Array.isArray(obj.tokens) ? obj.tokens : [];
    const stamps = Array.isArray(obj.timestamps) ? obj.timestamps : [];
    const tokens = [];
    for (let i = 0; i < texts.length; i += 1) {
      const text = String(texts[i] == null ? '' : texts[i]);
      if (isSpecialToken(text)) continue;
      const start = Number(stamps[i]);
      if (!isFiniteNumber(start)) continue;
      const next = Number(stamps[i + 1]);
      // 末位 token 无后继时间戳，给一个最小占位时长（不猜更长）。
      const end = isFiniteNumber(next) && next > start ? next : start + 0.06;
      tokens.push({ start, end, text });
    }
    lines.push({ lang: normalizeLang(obj.lang), tokens });
  }
  return lines;
}

/** 兼容包装：把多行结果合并成单一 token 序列（不做时间偏移）。 */
function parseSenseVoiceJson(raw) {
  const lines = parseSenseVoiceLines(raw);
  const tokens = [];
  let lang = null;
  for (const l of lines) {
    if (!lang && l.lang) lang = l.lang;
    for (const t of l.tokens) tokens.push(t);
  }
  return { lang, tokens };
}

/**
 * 把 token 序列拼成自然文本。
 * CJK 之间不加空格；拉丁文之间补空格；标点前不补空格。
 */
function joinTokens(tokens) {
  let out = '';
  for (const t of tokens) {
    const s = String((t && t.text) || '');
    if (!s) continue;
    if (!out) {
      out = s;
      continue;
    }
    const prev = out[out.length - 1];
    const needSpace =
      !/\s/.test(prev) &&
      !CJK.test(prev) &&
      !CJK.test(s[0]) &&
      !/^[\s)\]}>”’.,!?;:，。！？；：、]/.test(s);
    out += (needSpace ? ' ' : '') + s;
  }
  return out.trim();
}

/**
 * 按停顿/标点/时长把 token 切成字幕 cue（纯函数，可单测）。
 *
 * SenseVoice 的 CLI 不做 VAD 分段，整段音频只有一个结果，因此这里承担切句职责。
 * 边界来源（任一命中即断句）：
 *   ① ffmpeg silencedetect 报出的静音区间；
 *   ② token 间隔 ≥ TOKEN_GAP（模型没标静音时的兜底）；
 *   ③ 句末强标点（且已达 CUE_MIN_LEN）；
 *   ④ 时长达到 CUE_MAX_LEN。
 *
 * @returns {{ cues: Array<{start:number,end:number,text:string,words:Array}>, words: Array }}
 */
function splitIntoCues(tokens, { duration = 0, silences = [] } = {}) {
  const toks = (Array.isArray(tokens) ? tokens : [])
    .filter((t) => t && t.text && isFiniteNumber(Number(t.start)) && isFiniteNumber(Number(t.end)))
    .map((t) => ({ start: Number(t.start), end: Number(t.end), text: String(t.text) }))
    .sort((a, b) => a.start - b.start);
  if (!toks.length) return { cues: [], words: [] };

  const ranges = (Array.isArray(silences) ? silences : []).filter(
    (s) => s && isFiniteNumber(Number(s.start)) && isFiniteNumber(Number(s.end)),
  );
  const inSilence = (t) => ranges.some((s) => t >= Number(s.start) && t < Number(s.end));

  const cues = [];
  let cur = [];
  let curStart = toks[0].start;

  const flush = (end) => {
    if (!cur.length) return;
    const text = joinTokens(cur);
    if (text) {
      cues.push({
        start: round3(curStart),
        end: round3(Math.max(curStart + 0.02, end)),
        text,
        words: cur.map((w) => ({ start: round3(w.start), end: round3(w.end), text: w.text })),
      });
    }
    cur = [];
  };

  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];
    if (!cur.length) curStart = t.start;
    cur.push(t);

    const next = toks[i + 1];
    const len = t.end - curStart;
    let boundary = false;
    if (!next) {
      boundary = true;
    } else {
      const gap = next.start - t.end;
      if (gap >= TOKEN_GAP) boundary = true;
      else if (inSilence(t.end) || inSilence(next.start)) boundary = true;
      else if (STRONG_PUNCT.test(t.text) && len >= CUE_MIN_LEN) boundary = true;
      else if (SOFT_PUNCT.test(t.text) && len >= CUE_MAX_LEN * 0.6) boundary = true;
      else if (len >= CUE_MAX_LEN) boundary = true;
    }
    if (boundary) flush(t.end);
  }

  // 收尾：末条 cue 用 duration 兜住（若可用），避免 end 早于真实语音尾。
  if (cues.length && isFiniteNumber(Number(duration)) && Number(duration) > cues[cues.length - 1].end) {
    cues[cues.length - 1].end = round3(Number(duration));
  }

  const words = [];
  for (const c of cues) {
    for (const w of c.words) words.push({ start: w.start, end: w.end, text: w.text });
  }
  return { cues, words };
}

/**
 * 规划 SenseVoice 的推理分块（纯函数，可单测）。
 *
 * 为什么需要：`sherpa-onnx-offline` 无 VAD，整段音频只回一行 JSON，且实测对
 * 多语句音频会丢内容。这里把音频按「静音边界」切成语音区间，超长再等分：
 *   ① 语音区间 = 静音区间在 [0, duration] 上的补集；
 *   ② 每段 ≤ CHUNK_MAX_LEN，超出则等分；
 *   ③ 过短（< CHUNK_MIN_LEN）丢弃，避免静音被幻觉出词。
 *
 * @returns {Array<{start:number,end:number}>}
 */
function planChunks({ silences = [], duration = 0, maxLen = CHUNK_MAX_LEN, minLen = CHUNK_MIN_LEN } = {}) {
  const dur = Number(duration);
  if (!isFiniteNumber(dur) || dur <= 0) return [];

  const ranges = (Array.isArray(silences) ? silences : [])
    .map((s) => ({ start: Math.max(0, Number(s && s.start)), end: Math.min(dur, Number(s && s.end)) }))
    .filter((s) => isFiniteNumber(s.start) && isFiniteNumber(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start);

  // ① 求静音的补集（语音区间）
  const spans = [];
  let cursor = 0;
  for (const s of ranges) {
    if (s.start > cursor) spans.push([cursor, s.start]);
    cursor = Math.max(cursor, s.end);
  }
  if (dur > cursor) spans.push([cursor, dur]);
  // 无任何静音信息 → 无法判定语音边界，整段交给模型；
  // 但若静音区间已覆盖全片，spans 为空即代表「无语音」，必须返回空而不是整段。
  if (!spans.length) {
    if (ranges.length) return [];
    spans.push([0, dur]);
  }

  // ② 超长等分；③ 过滤过短
  const out = [];
  for (const [a, b] of spans) {
    const len = b - a;
    if (len < minLen) continue;
    if (len <= maxLen) {
      out.push({ start: round3(a), end: round3(b) });
      continue;
    }
    const parts = Math.ceil(len / maxLen);
    const step = len / parts;
    for (let i = 0; i < parts; i += 1) {
      const s = a + i * step;
      const e = i === parts - 1 ? b : a + (i + 1) * step;
      out.push({ start: round3(s), end: round3(e) });
    }
  }
  return out.slice(0, CHUNK_MAX_COUNT);
}

/** 构造 44 字节的标准 WAV 头（16k / 单声道 / 16bit PCM）。 */
function wavHeader(dataBytes) {
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(BYTES_PER_SEC, 28);
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

/**
 * 从裸 PCM（s16le/16k/mono）按分块切出独立 wav 文件。
 * 用流式拷贝指定字节区间，避免整段音频读进内存。
 */
async function slicePcmChunks(pcmPath, chunks, outDir) {
  let total = 0;
  try {
    total = (await fsp.stat(pcmPath)).size;
  } catch {
    total = 0;
  }
  const out = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const { start, end } = chunks[i];
    const from = Math.max(0, Math.round(start * BYTES_PER_SEC));
    const raw = Math.round((end - start) * BYTES_PER_SEC);
    // 关键：按实际 PCM 长度裁剪，且 2 字节对齐。
    // planChunks 的 end 会做毫秒级四舍五入（可能进位），若不裁剪会写出
    // 「头部声明长度 > 实际字节数」的 WAV，sherpa 读取时直接报 Failed to read。
    let len = Math.min(raw, Math.max(0, total - from));
    len -= len % 2;
    const file = path.join(outDir, `part-${String(i).padStart(4, '0')}.wav`);
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(file);
      ws.on('error', reject);
      ws.write(wavHeader(len));
      if (len <= 0) {
        ws.end(resolve);
        return;
      }
      const rs = fs.createReadStream(pcmPath, { start: from, end: from + len - 1 });
      rs.on('error', reject);
      rs.pipe(ws);
      ws.on('finish', resolve);
    });
    out.push({ path: file, start });
  }
  return out;
}

/** 说话人标签归一化为数字（打分器要求 numeric speaker）：'SPEAKER_00' → 0，'3' → 3。 */
function normalizeSpeaker(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const tail = s.match(/(\d+)\s*$/);
  return tail ? Number(tail[1]) : null;
}

/**
 * 解析说话人分离输出（纯函数，宽容两种上游格式）：
 *  - sherpa CLI：`<start> -- <end> <speaker>`（如 `1.027 -- 1.364 speaker_01`，冒号可有可无）
 *  - RTTM：`SPEAKER <file> <chn> <start> <dur> <NA> <NA> <speaker> ...`
 */
function parseDiarizationTurns(raw) {
  const out = [];
  for (const line of String(raw || '').split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;

    const rttm = s.match(/^SPEAKER\s+\S+\s+\d+\s+([\d.]+)\s+([\d.]+)\s+\S+\s+\S+\s+(\S+)/);
    if (rttm) {
      const start = Number(rttm[1]);
      const dur = Number(rttm[2]);
      const speaker = normalizeSpeaker(rttm[3]);
      if (isFiniteNumber(start) && isFiniteNumber(dur) && dur > 0 && speaker !== null) {
        out.push({ start: round3(start), end: round3(start + dur), speaker });
      }
      continue;
    }

    const plain = s.match(/^([\d.]+)\s*--\s*([\d.]+)\s*:?\s*(\S+)/);
    if (plain) {
      const start = Number(plain[1]);
      const end = Number(plain[2]);
      const speaker = normalizeSpeaker(plain[3]);
      if (isFiniteNumber(start) && isFiniteNumber(end) && end > start && speaker !== null) {
        out.push({ start: round3(start), end: round3(end), speaker });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** 按最大重叠把说话人分配给每条 cue（无重叠则不打标签）。 */
function assignSpeakers(cues, turns) {
  const list = Array.isArray(turns) ? turns : [];
  if (!list.length) return cues;
  return (Array.isArray(cues) ? cues : []).map((cue) => {
    let best = null;
    let bestOverlap = 0;
    for (const t of list) {
      const ov = Math.min(cue.end, t.end) - Math.max(cue.start, t.start);
      if (ov > bestOverlap) {
        bestOverlap = ov;
        best = t.speaker;
      }
    }
    // 重叠需覆盖该 cue 的 30% 以上才可信，避免误标。
    const len = Math.max(0.001, cue.end - cue.start);
    return best !== null && bestOverlap / len >= 0.3 ? { ...cue, speaker: best } : cue;
  });
}

// ------------------------------ 引擎探测 ------------------------------

/**
 * 探测本地 ASR 能力。不下载任何东西。
 * @returns {{available:boolean, engine:string, binary:string, modelId:string|null, modelPath:string|null,
 *            engines:{whisper:object, senseVoice:object}}}
 */
function detectEngine({ modelsDir, binDirs, sherpaBinDirs, quality, locale, engine } = {}) {
  const store = createModelStore({ modelsDir });
  const binary = resolveBinary(binDirs);
  const preferred = QUALITY_MODEL[quality] || store.defaultModelId;
  const order = [preferred, store.defaultModelId, 'whisper-small', 'whisper-tiny']
    .filter((id, index, arr) => id && arr.indexOf(id) === index);

  let modelId = null;
  let modelPath = null;
  for (const id of order) {
    const resolved = store.resolveModelFile(id);
    if (resolved) {
      modelId = id;
      modelPath = resolved;
      break;
    }
  }

  const whisper = {
    engine: ENGINE_WHISPER,
    available: Boolean(binary && modelPath),
    binary: binary || '',
    modelId,
    modelPath,
  };

  const svBinary = resolveSherpaBinary(SHERPA_ASR_BIN, sherpaBinDirs);
  const svModel = store.resolveModelFile(SENSEVOICE_MODEL_ID);
  const svTokens = store.resolveModelSubFile(SENSEVOICE_MODEL_ID, 'tokens.txt');
  const diarBinary = resolveSherpaBinary(SHERPA_DIAR_BIN, sherpaBinDirs);
  const diarSeg = store.resolveModelSubFile(DIARIZATION_MODEL_ID, 'segmentation.onnx');
  const diarEmb = store.resolveModelSubFile(DIARIZATION_MODEL_ID, 'embedding.onnx');
  const senseVoice = {
    engine: ENGINE_SENSEVOICE,
    available: Boolean(svBinary && svModel && svTokens),
    binary: svBinary || '',
    modelId: SENSEVOICE_MODEL_ID,
    modelPath: svModel,
    tokensPath: svTokens,
    diarization: {
      available: Boolean(diarBinary && diarSeg && diarEmb),
      binary: diarBinary || '',
      segmentationModel: diarSeg,
      embeddingModel: diarEmb,
    },
  };

  const result = pickEngine({ whisper, senseVoice, locale, engine });
  const chosen = result && result.engine === ENGINE_SENSEVOICE ? senseVoice : whisper;

  return {
    available: Boolean(whisper.available || senseVoice.available),
    engine: result ? result.engine : '',
    binary: chosen.binary || '',
    modelId: chosen.modelId,
    modelPath: chosen.modelPath,
    engines: { whisper, senseVoice },
  };
}

/** 引擎优选：显式指定 > 中文场景优选 SenseVoice > 其余用 whisper > 可用者兜底。 */
function pickEngine({ whisper, senseVoice, locale, engine }) {
  const wanted = String(engine || '').toLowerCase();
  const sv = { engine: ENGINE_SENSEVOICE };
  const wh = { engine: ENGINE_WHISPER };
  if (wanted === 'sensevoice' || wanted === 'sense-voice' || wanted === 'sherpa-onnx') {
    if (senseVoice.available) return sv;
    if (whisper.available) return wh;
    return null;
  }
  if (wanted === 'whisper') {
    if (whisper.available) return wh;
    if (senseVoice.available) return sv;
    return null;
  }
  const isZh = /^zh/i.test(String(locale || ''));
  if (isZh && senseVoice.available) return sv;
  if (whisper.available) return wh;
  if (senseVoice.available) return sv;
  return null;
}

/**
 * 引擎候选顺序（互为回落）：主引擎优先，其次是另一个可用引擎。
 * 用于「主引擎缺模型 / 运行失败 → 自动换引擎重试」，保证任一引擎可用即可出结果。
 */
function engineCandidates(detected) {
  const { whisper, senseVoice } = (detected && detected.engines) || {};
  const available = {
    [ENGINE_WHISPER]: Boolean(whisper && whisper.available),
    [ENGINE_SENSEVOICE]: Boolean(senseVoice && senseVoice.available),
  };
  const order = [
    detected && detected.engine,
    detected && detected.engine === ENGINE_SENSEVOICE ? ENGINE_WHISPER : ENGINE_SENSEVOICE,
  ];
  const out = [];
  for (const name of order) {
    if (name && available[name] && !out.includes(name)) out.push(name);
  }
  return out;
}

function requireEngine(opts) {
  const engine = detectEngine(opts);
  if (engine.available) return engine;

  const { whisper, senseVoice } = engine.engines;
  if (whisper.binary && !whisper.modelPath && !senseVoice.available) {
    throw asrError(
      'NO_ASR_MODEL',
      'Whisper 模型未就绪，请先下载本地模型。',
      '在「本地模型」页下载 whisper-base（≈142MB）或 SenseVoice Small（≈234MB）。',
    );
  }
  if (!whisper.binary && !senseVoice.binary) {
    throw asrError(
      'NO_ASR_ENGINE',
      '未检测到本地 ASR 引擎。',
      '安装 whisper.cpp（如 `brew install whisper-cpp`）或运行 `pnpm prepare:sherpa`，也可设置 CLIPOP_WHISPER_CLI / CLIPOP_SHERPA_ONNX_DIR。',
    );
  }
  throw asrError(
    'NO_ASR_MODEL',
    '本地 ASR 模型未就绪，请先下载本地模型。',
    '在「本地模型」页下载 whisper-base（≈142MB）或 SenseVoice Small（≈234MB）。',
  );
}

// ------------------------------ 运行 ------------------------------

/**
 * 一次 ffmpeg 调用同时产出两路 16k / 单声道 / 16bit 音频：
 *  - `outWav`：标准 WAV（喂 whisper、silencedetect、说话人分离）；
 *  - `outPcm`：裸 PCM s16le（SenseVoice 分块时按字节区间直接切片，免二次解码）。
 * 不传 `outPcm` 时退化为只产出 WAV。
 */
async function extractAudio(ffmpegPath, inputPath, outWav, outPcm) {
  const common = ['-vn', '-ac', '1', '-ar', '16000'];
  const args = outPcm
    ? [
        '-hide_banner', '-y', '-i', inputPath,
        ...common, '-c:a', 'pcm_s16le', outWav,
        ...common, '-f', 's16le', outPcm,
      ]
    : ['-hide_banner', '-y', '-i', inputPath, ...common, '-c:a', 'pcm_s16le', outWav];
  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { timeout: 20 * 60_000, maxBuffer: 16 * 1024 * 1024 }, (err) =>
      err ? reject(err) : resolve(),
    );
  });
}

/** 裸 PCM（s16le/16k/mono）时长（秒）。 */
async function pcmDuration(pcmPath) {
  try {
    const st = await fsp.stat(pcmPath);
    return st.size / BYTES_PER_SEC;
  } catch {
    return 0;
  }
}

/** 用 ffmpeg `silencedetect` 取静音区间，作为切句的首选依据（失败即回落 token 间隔）。 */
async function detectSilences(ffmpegPath, wavPath) {
  try {
    const stderr = await new Promise((resolve, reject) => {
      execFile(
        ffmpegPath,
        ['-hide_banner', '-nostdin', '-i', wavPath, '-af', 'silencedetect=noise=-32dB:d=0.35', '-f', 'null', '-'],
        { timeout: 20 * 60_000, maxBuffer: 32 * 1024 * 1024 },
        (err, _stdout, errOut) => {
          // silencedetect 的日志走 stderr；进程正常结束即视为成功。
          if (err && !errOut) reject(err);
          else resolve(String(errOut || ''));
        },
      );
    });
    return parseSilences(stderr);
  } catch {
    return [];
  }
}

function senseVoiceLang(locale) {
  const s = String(locale || '').toLowerCase();
  if (!s || s === 'auto') return 'auto';
  const base = s.split(/[-_]/)[0];
  return SENSEVOICE_LANGS.includes(base) ? base : 'auto';
}

async function runWhisper({ binary, modelPath, wavPath, outPrefix, locale, wantWords }) {
  const args = ['-m', modelPath, '-f', wavPath, '-of', outPrefix, '-np'];
  args.push(wantWords ? '-ojf' : '-oj');
  args.push('-l', locale && locale !== 'auto' ? locale : 'auto');
  await new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 60 * 60_000, maxBuffer: 32 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(asrError('ASR_RUN_FAILED', String(stderr || err.message).slice(-800)));
      else resolve();
    });
  });
  const jsonPath = `${outPrefix}.json`;
  const raw = await fsp.readFile(jsonPath, 'utf8');
  return parseWhisperJson(raw);
}

/**
 * 跑 sherpa-onnx SenseVoice。可一次传入多个 wav（**输出行与输入顺序一一对应**），
 * 这样分块推理只需一次进程启动，避免逐块 spawn 的开销。
 * JSON 走 stdout（防御性兜底 stderr）。
 *
 * @returns {Promise<Array<{lang:string|null, tokens:Array}>>} 与 wavPaths 顺序一致
 */
async function runSenseVoice({ binary, modelPath, tokensPath, wavPaths, locale, numThreads = 2 }) {
  const paths = (Array.isArray(wavPaths) ? wavPaths : [wavPaths]).filter(Boolean);
  if (!paths.length) return [];

  const args = [
    `--sense-voice-model=${modelPath}`,
    `--tokens=${tokensPath}`,
    `--sense-voice-language=${senseVoiceLang(locale)}`,
    `--num-threads=${numThreads}`,
    ...paths,
  ];

  const { stdout, stderr } = await new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 60 * 60_000, maxBuffer: 128 * 1024 * 1024 }, (err, out, errOut) => {
      const so = String(out || '');
      const se = String(errOut || '');
      // 进程失败、且 stdout 里没有任何 JSON 才算真失败（stderr 日志本就不该被当结果）。
      if (err && !/\{/.test(so)) reject(asrError('ASR_RUN_FAILED', String(se || err.message).slice(-800)));
      else resolve({ stdout: so, stderr: se });
    });
  });

  const parsed = parseSenseVoiceLines(stdout);
  return parsed.length ? parsed : parseSenseVoiceLines(stderr);
}

/** 跑说话人分离（16k 单声道 wav；需 pyannote 分割模型 + 声纹嵌入模型）。 */
async function runDiarization({ binary, wavPath, segmentationModel, embeddingModel, clusterThreshold = 0.5 }) {
  const args = [
    `--segmentation.pyannote-model=${segmentationModel}`,
    `--embedding.model=${embeddingModel}`,
    `--clustering.cluster-threshold=${clusterThreshold}`,
    wavPath,
  ];
  const stdout = await new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 60 * 60_000, maxBuffer: 32 * 1024 * 1024 }, (err, out, stderr) => {
      if (err) reject(asrError('ASR_DIAR_FAILED', String(stderr || err.message).slice(-800)));
      else resolve(String(out || ''));
    });
  });
  return parseDiarizationTurns(stdout);
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function createTranscriber({
  modelsDir,
  cacheDir,
  ffmpegPath,
  binDirs,
  sherpaBinDirs,
  workDir,
  diarization = null,
} = {}) {
  if (!modelsDir) throw new Error('local-asr: modelsDir is required');

  async function transcribe({ inputPath, locale, quality, wantWords = true, engine } = {}) {
    if (!inputPath || !fs.existsSync(inputPath)) {
      throw asrError('ASR_INPUT_MISSING', '待转写的媒体文件不存在。');
    }
    if (!ffmpegPath) throw asrError('NO_FFMPEG', '未找到 ffmpeg，无法抽取音频。');

    const detected = requireEngine({ modelsDir, binDirs, sherpaBinDirs, quality, locale, engine });
    const candidates = engineCandidates(detected);
    if (!candidates.length) throw asrError('NO_ASR_ENGINE', '未检测到可用的本地 ASR 引擎。');

    const digest = await sha256File(inputPath);
    const tmp = await fsp.mkdtemp(path.join(workDir || os.tmpdir(), 'clipop-asr-'));
    const wavPath = path.join(tmp, 'audio.wav');
    const pcmPath = path.join(tmp, 'audio.pcm');
    const outPrefix = path.join(tmp, 'out');

    // 音频只抽一次；缓存命中时甚至不抽。
    let extracted = false;
    const ensureAudio = async () => {
      if (extracted) return;
      await extractAudio(ffmpegPath, inputPath, wavPath, pcmPath);
      extracted = true;
    };

    let lastErr = null;
    try {
      for (const active of candidates) {
        const modelId =
          active === ENGINE_SENSEVOICE ? SENSEVOICE_MODEL_ID : detected.engines.whisper.modelId;
        const cacheKey = `${digest}.${active}.${modelId}.${wantWords ? 'w' : 's'}.${locale || 'auto'}`;
        const cacheFile = cacheDir ? path.join(cacheDir, `${cacheKey}.json`) : '';

        if (cacheFile) {
          try {
            const cached = JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
            if (cached && Array.isArray(cached.cues)) return { ...cached, cached: true };
          } catch {}
        }

        try {
          await ensureAudio();

          let lang = locale || 'auto';
          let cues = [];
          let words = [];

          if (active === ENGINE_SENSEVOICE) {
            const sv = detected.engines.senseVoice;
            const duration = await pcmDuration(pcmPath);
            const silences = await detectSilences(ffmpegPath, wavPath);
            const chunks = planChunks({ silences, duration });

            if (chunks.length) {
              const parts = await slicePcmChunks(pcmPath, chunks, tmp);
              const lines = await runSenseVoice({
                binary: sv.binary,
                modelPath: sv.modelPath,
                tokensPath: sv.tokensPath,
                wavPaths: parts.map((p) => p.path),
                locale,
              });
              if (lines.length !== parts.length) {
                console.warn(
                  `[asr] SenseVoice 输出行数(${lines.length}) 与分块数(${parts.length}) 不一致，按顺序对齐。`,
                );
              }
              // 按各分块的起始时间，把 token 时间戳回填为全片绝对时间。
              const tokens = [];
              for (let i = 0; i < lines.length && i < parts.length; i += 1) {
                const base = parts[i].start;
                for (const t of lines[i].tokens) {
                  tokens.push({ start: t.start + base, end: t.end + base, text: t.text });
                }
              }
              const split = splitIntoCues(tokens, { duration, silences });
              cues = split.cues;
              words = wantWords ? split.words : [];
              const withLang = lines.find((l) => l.lang);
              lang = (withLang && withLang.lang) || senseVoiceLang(locale);
            } else {
              lang = senseVoiceLang(locale);
            }

            // 说话人分离是可选增强：二进制/模型缺失或失败都不影响转写结果。
            const diar = diarization && diarization.available ? diarization : null;
            if (diar && cues.length) {
              try {
                const turns = await runDiarization({
                  binary: diar.binary,
                  wavPath,
                  segmentationModel: diar.segmentationModel,
                  embeddingModel: diar.embeddingModel,
                  clusterThreshold: diar.clusterThreshold,
                });
                cues = assignSpeakers(cues, turns);
              } catch (err) {
                const msg = err && err.code ? err.code : (err && err.message) || err;
                console.warn(`[asr] 说话人分离失败（忽略，不影响转写）：${String(msg).slice(0, 200)}`);
              }
            }
          } else {
            const parsed = await runWhisper({
              binary: detected.engines.whisper.binary,
              modelPath: detected.engines.whisper.modelPath,
              wavPath,
              outPrefix,
              locale,
              wantWords,
            });
            lang = parsed.lang || locale || 'auto';
            cues = parsed.cues;
            words = wantWords ? parsed.words : [];
          }

          const result = {
            engine: active,
            modelId,
            lang,
            cues,
            words,
            duration: cues.length ? cues[cues.length - 1].end : 0,
            cached: false,
          };

          if (cacheFile) {
            await fsp.mkdir(path.dirname(cacheFile), { recursive: true });
            await fsp.writeFile(cacheFile, JSON.stringify(result));
          }
          return result;
        } catch (err) {
          lastErr = err;
          const msg = err && err.message ? err.message : String(err);
          console.warn(`[asr] 引擎 ${active} 转写失败，尝试回落：${String(msg).slice(0, 240)}`);
        }
      }

      throw lastErr || asrError('ASR_RUN_FAILED', '所有本地 ASR 引擎均转写失败。');
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  return {
    transcribe,
    detect: (opts) => detectEngine({ modelsDir, binDirs, sherpaBinDirs, ...opts }),
  };
}

module.exports = {
  ENGINE,
  ENGINE_WHISPER,
  ENGINE_SENSEVOICE,
  QUALITY_MODEL,
  SENSEVOICE_LANGS,
  SHERPA_ASR_BIN,
  SHERPA_DIAR_BIN,
  detectEngine,
  pickEngine,
  parseWhisperJson,
  parseSenseVoiceJson,
  parseSenseVoiceLines,
  normalizeLang,
  planChunks,
  slicePcmChunks,
  engineCandidates,
  parseDiarizationTurns,
  normalizeSpeaker,
  joinTokens,
  splitIntoCues,
  assignSpeakers,
  normalizeCues,
  normalizeWords,
  createTranscriber,
  resolveSherpaBinary,
  asrError,
};