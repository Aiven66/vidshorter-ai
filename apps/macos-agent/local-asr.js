'use strict';

/**
 * 本地 ASR 引擎（P0-1）
 *
 * 用 whisper.cpp 在本地完成转写，替代被机房出口拦截的 YouTube 字幕 / 收费云 ASR。
 * 产出**词级时间戳**，是「一键可发布成片」卡拉OK字幕的前置条件。
 *
 * 设计：
 *  - `detectEngine()` 只做探测，不下载；不可用时抛结构化错误 `NO_ASR_ENGINE`，绝不静默返回空。
 *  - `transcribe()` 走磁盘缓存（key = 文件 sha256 + 模型 + 语言），二次调用 O(1)。
 *  - `parseWhisperJson` / `normalizeCues` / `normalizeWords` 为纯函数，便于单测。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { createModelStore } = require('./local-models');

const ENGINE = 'whisper.cpp';
const BIN_NAMES = ['whisper-cli', 'whisper', 'main'];
const COMMON_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin'];

const QUALITY_MODEL = {
  fast: 'whisper-tiny',
  balanced: 'whisper-base',
  best: 'whisper-small',
};

function asrError(code, message, hint) {
  const err = new Error(message);
  err.code = code;
  if (hint) err.hint = hint;
  return err;
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

/**
 * 随包分发的 whisper-cli 目录（prepare-whisper.js 产出到 bin/whisper）。
 * 覆盖 dev（__dirname/bin/whisper）与打包后（app.asar -> app.asar.unpacked）两种情况。
 */
function bundledBinDirs() {
  const dirs = [path.join(__dirname, 'bin', 'whisper')];
  const res = process.resourcesPath || '';
  if (res) dirs.push(path.join(res, 'bin', 'whisper'), path.join(res, 'app.asar.unpacked', 'bin', 'whisper'));
  const seen = new Set();
  return dirs
    .map((d) => d.replace(/\.asar([/\\])/, '.asar.unpacked$1'))
    .filter((d) => d && !seen.has(d) && seen.add(d));
}

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

function resolveBinary(binDirs) {
  const override = String(process.env.CLIPOP_WHISPER_CLI || process.env.WHISPER_CLI_PATH || '').trim();
  if (override && isExecutable(override)) return override;
  const dirs = [...(binDirs || []), ...bundledBinDirs(), ...COMMON_BIN_DIRS].filter(Boolean);
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

/**
 * 探测本地 ASR 能力。不下载任何东西。
 * @returns {{ available:boolean, engine:string, binary:string, modelId:string|null, modelPath:string|null }}
 */
function detectEngine({ modelsDir, binDirs, quality } = {}) {
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

  return {
    available: Boolean(binary && modelPath),
    engine: ENGINE,
    binary: binary || '',
    modelId,
    modelPath,
  };
}

function requireEngine(opts) {
  const engine = detectEngine(opts);
  if (engine.binary && !engine.modelPath) {
    throw asrError(
      'NO_ASR_MODEL',
      'Whisper 模型未就绪，请先下载本地模型。',
      '在「本地模型」页下载 whisper-base（≈142MB）。',
    );
  }
  if (!engine.binary) {
    throw asrError(
      'NO_ASR_ENGINE',
      '未检测到 whisper.cpp 引擎。',
      '安装 whisper.cpp（如 `brew install whisper-cpp`）或设置 CLIPOP_WHISPER_CLI 指向 whisper-cli。',
    );
  }
  return engine;
}

async function extractAudio16k(ffmpegPath, inputPath, outWav) {
  await new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      ['-hide_banner', '-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outWav],
      { timeout: 20 * 60_000, maxBuffer: 16 * 1024 * 1024 },
      (err) => (err ? reject(err) : resolve()),
    );
  });
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

function createTranscriber({ modelsDir, cacheDir, ffmpegPath, binDirs, workDir }) {
  if (!modelsDir) throw new Error('local-asr: modelsDir is required');

  async function transcribe({ inputPath, locale, quality, wantWords = true } = {}) {
    if (!inputPath || !fs.existsSync(inputPath)) {
      throw asrError('ASR_INPUT_MISSING', '待转写的媒体文件不存在。');
    }
    if (!ffmpegPath) throw asrError('NO_FFMPEG', '未找到 ffmpeg，无法抽取音频。');

    const engine = requireEngine({ modelsDir, binDirs, quality });
    const digest = await sha256File(inputPath);
    const cacheKey = `${digest}.${engine.modelId}.${wantWords ? 'w' : 's'}.${locale || 'auto'}`;
    const cacheFile = cacheDir ? path.join(cacheDir, `${cacheKey}.json`) : '';

    if (cacheFile) {
      try {
        const cached = JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
        if (cached && Array.isArray(cached.cues)) return { ...cached, cached: true };
      } catch {}
    }

    const tmp = await fsp.mkdtemp(path.join(workDir || os.tmpdir(), 'clipop-asr-'));
    const wavPath = path.join(tmp, 'audio.wav');
    const outPrefix = path.join(tmp, 'out');
    try {
      await extractAudio16k(ffmpegPath, inputPath, wavPath);
      const parsed = await runWhisper({
        binary: engine.binary,
        modelPath: engine.modelPath,
        wavPath,
        outPrefix,
        locale,
        wantWords,
      });

      const result = {
        engine: ENGINE,
        modelId: engine.modelId,
        lang: parsed.lang || locale || 'auto',
        cues: parsed.cues,
        words: wantWords ? parsed.words : [],
        duration: parsed.cues.length ? parsed.cues[parsed.cues.length - 1].end : 0,
        cached: false,
      };

      if (cacheFile) {
        await fsp.mkdir(path.dirname(cacheFile), { recursive: true });
        await fsp.writeFile(cacheFile, JSON.stringify(result));
      }
      return result;
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  return { transcribe, detect: (opts) => detectEngine({ modelsDir, binDirs, ...opts }) };
}

module.exports = {
  ENGINE,
  QUALITY_MODEL,
  detectEngine,
  parseWhisperJson,
  normalizeCues,
  normalizeWords,
  createTranscriber,
  asrError,
};
