'use strict';

/**
 * 本地模型管理（P0-1）
 *
 * 负责本地 ASR 模型的下载 / 校验 / 状态查询。设计目标：
 *  - 与 Electron 解耦：调用方注入 modelsDir，测试可用临时目录。
 *  - 完整性校验不依赖精确字节数：ggml 文件头 magic 校验 + 最小体积兜底。
 *  - 下载写临时文件再 rename，避免半成品被当作已就绪。
 *
 * 支持两类模型：
 *  ① whisper.cpp（单文件 ggml）：`file` + `url`，用 ggml magic 校验。
 *  ② sherpa-onnx SenseVoice（多文件）：`files[]` + `dir` 子目录，逐文件体积校验。
 *     多文件模型是为 FunASR/SenseVoice 中文 ASR 精度与词级时间戳引入的（P0-1）。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');

// ggml 文件魔数 0x67676d6c，按小端写入的字节序为 'lmgg'。
const GGML_MAGIC_LITTLE_ENDIAN = Buffer.from([0x6c, 0x6d, 0x67, 0x67]);

const HF_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
const SENSEVOICE_BASE =
  'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main';

const MODEL_REGISTRY = [
  {
    id: 'whisper-tiny',
    engine: 'whisper.cpp',
    file: 'ggml-tiny.bin',
    url: `${HF_BASE}/ggml-tiny.bin`,
    minBytes: 70 * 1024 * 1024,
    label: 'Whisper Tiny (最快，低配)',
  },
  {
    id: 'whisper-base',
    engine: 'whisper.cpp',
    file: 'ggml-base.bin',
    url: `${HF_BASE}/ggml-base.bin`,
    minBytes: 130 * 1024 * 1024,
    label: 'Whisper Base (默认，均衡)',
  },
  {
    id: 'whisper-small',
    engine: 'whisper.cpp',
    file: 'ggml-small.bin',
    url: `${HF_BASE}/ggml-small.bin`,
    minBytes: 440 * 1024 * 1024,
    label: 'Whisper Small (高质量)',
  },
  {
    id: 'sensevoice-small',
    engine: 'sherpa-onnx',
    kind: 'sensevoice',
    dir: 'sensevoice-small',
    label: 'SenseVoice Small (中文/多语，字幕级时间戳)',
    files: [
      {
        name: 'model.int8.onnx',
        url: `${SENSEVOICE_BASE}/model.int8.onnx`,
        minBytes: 200 * 1024 * 1024,
      },
      {
        name: 'tokens.txt',
        url: `${SENSEVOICE_BASE}/tokens.txt`,
        minBytes: 100 * 1024,
      },
    ],
  },
  {
    id: 'speaker-diarization',
    engine: 'sherpa-onnx',
    kind: 'diarization',
    dir: 'speaker-diarization',
    label: '说话人分离模型 (多人场景，识别主讲人)',
    files: [
      {
        name: 'segmentation.onnx',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/main/model.onnx',
        minBytes: 5 * 1024 * 1024,
      },
      {
        name: 'embedding.onnx',
        url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
        minBytes: 30 * 1024 * 1024,
      },
    ],
  },
  {
    // AI 多语转换：唯一能「用原声音色」的本地 TTS（零样本克隆）。
    // 上游只提供 tar.bz2 整包（含 encoder/decoder/tokens/lexicon），vocoder 单独下载。
    id: 'zipvoice-zh-en',
    engine: 'sherpa-onnx',
    kind: 'zipvoice',
    dir: 'zipvoice',
    label: 'ZipVoice 音色克隆 (中/英，约 160MB)',
    archive: {
      url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia.tar.bz2',
      minBytes: 100 * 1024 * 1024,
    },
    files: [
      { name: 'encoder.int8.onnx', minBytes: 40 * 1024 * 1024 },
      { name: 'decoder.int8.onnx', minBytes: 40 * 1024 * 1024 },
      { name: 'tokens.txt', minBytes: 10 * 1024 },
      { name: 'lexicon.txt', minBytes: 10 * 1024 },
      {
        name: 'vocos_24khz.onnx',
        url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models/vocos_24khz.onnx',
        minBytes: 40 * 1024 * 1024,
      },
    ],
  },
];

const DEFAULT_MODEL_ID = 'whisper-base';

/** SenseVoice 引擎的默认模型（中文场景优选，需用户显式下载）。 */
const SENSEVOICE_MODEL_ID = 'sensevoice-small';

/** 说话人分离模型（pyannote 分割 + 声纹嵌入；可选增强，需用户显式下载）。 */
const DIARIZATION_MODEL_ID = 'speaker-diarization';

/** AI 多语转换用的零样本音色克隆模型（ZipVoice zh-en）。 */
const ZIPVOICE_MODEL_ID = 'zipvoice-zh-en';

function findModel(id) {
  return MODEL_REGISTRY.find((m) => m.id === id) || null;
}

function isMultiFileModel(model) {
  return Boolean(model && Array.isArray(model.files) && model.files.length > 0);
}

/** 归一化出模型的全部文件描述（单文件模型也统一成数组，便于统一遍历）。 */
function modelFiles(model) {
  if (!model) return [];
  if (isMultiFileModel(model)) return model.files;
  return [{ name: model.file, url: model.url, minBytes: model.minBytes }];
}

/** 模型文件所在目录：多文件模型用子目录，避免与 whisper 的 ggml 文件混在一起。 */
function modelDirOf(model, modelsDir) {
  if (isMultiFileModel(model) && model.dir) return path.join(modelsDir, model.dir);
  return modelsDir;
}

function isGgmlFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const head = Buffer.alloc(4);
      const read = fs.readSync(fd, head, 0, 4, 0);
      if (read < 4) return false;
      if (head.equals(GGML_MAGIC_LITTLE_ENDIAN)) return true;
      return head.toString('utf8') === 'ggml';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

/**
 * 单文件就绪判定。
 * whisper 的 ggml 用 magic 做强校验；ONNX/词表等按体积兜底（onnx 为 protobuf，无稳定魔数）。
 */
function fileReady(model, filePath, minBytes) {
  let bytes = 0;
  try {
    bytes = fs.statSync(filePath).size;
  } catch {
    return false;
  }
  if (bytes < minBytes) return false;
  const expected = isMultiFileModel(model) ? model.kind : 'whisper';
  if (expected === 'whisper') return isGgmlFile(filePath);
  return true;
}

/** 解压 tar.bz2 到目标目录，并剥掉上游包内的顶层目录。 */
function extractArchive(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    execFile('tar', ['-xjf', archivePath, '-C', destDir, '--strip-components=1'], { maxBuffer: 8 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(`extract failed: ${String(stderr || err.message).slice(-400)}`));
        return;
      }
      resolve();
    });
  });
}

function createModelStore({ modelsDir, binDir }) {
  if (!modelsDir) throw new Error('local-models: modelsDir is required');

  async function ensureDir() {
    await fsp.mkdir(modelsDir, { recursive: true });
    if (binDir) await fsp.mkdir(binDir, { recursive: true });
  }

  function statusOf(model) {
    const dir = modelDirOf(model, modelsDir);
    const files = modelFiles(model).map((f) => {
      const filePath = path.join(dir, f.name);
      let bytes = 0;
      try {
        bytes = fs.statSync(filePath).size;
      } catch {}
      return {
        name: f.name,
        path: filePath,
        bytes,
        minBytes: f.minBytes,
        ready: fileReady(model, filePath, f.minBytes),
      };
    });
    const bytes = files.reduce((sum, f) => sum + f.bytes, 0);
    const minBytes = files.reduce((sum, f) => sum + f.minBytes, 0);
    return {
      id: model.id,
      engine: model.engine || 'whisper.cpp',
      label: model.label,
      file: files.length ? files[0].name : '',
      path: dir,
      bytes,
      minBytes,
      ready: files.length > 0 && files.every((f) => f.ready),
      files,
    };
  }

  function status() {
    const models = MODEL_REGISTRY.map(statusOf);
    return {
      modelsDir,
      binDir: binDir || '',
      defaultModelId: DEFAULT_MODEL_ID,
      senseVoiceModelId: SENSEVOICE_MODEL_ID,
      diarizationModelId: DIARIZATION_MODEL_ID,
      zipVoiceModelId: ZIPVOICE_MODEL_ID,
      models,
      readyCount: models.filter((m) => m.ready).length,
      totalBytes: models.reduce((sum, m) => sum + m.bytes, 0),
    };
  }

  async function download(filePath, url, expectedMinBytes, onProgress) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const partPath = `${filePath}.part`;
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length') || 0);
    await fsp.writeFile(partPath, '');
    const handle = await fsp.open(partPath, 'w');
    let received = 0;
    try {
      for await (const chunk of res.body) {
        await handle.write(chunk);
        received += chunk.length;
        if (onProgress) onProgress({ received, total: total || expectedMinBytes || received });
      }
    } finally {
      await handle.close();
    }
    if (expectedMinBytes && received < expectedMinBytes) {
      await fsp.rm(partPath, { force: true });
      throw new Error(`downloaded file too small: ${received} < ${expectedMinBytes}`);
    }
    await fsp.rename(partPath, filePath);
    return received;
  }

  /**
   * 下载并校验指定模型。默认只下载 whisper-base（≈142MB），
   * 用户可在「本地模型」页升级到 small 或 SenseVoice（中文优选）。
   */
  async function prepare(ids, onProgress) {
    const list = Array.isArray(ids) && ids.length > 0 ? ids : [DEFAULT_MODEL_ID];
    const results = [];
    for (const id of list) {
      const model = findModel(id);
      if (!model) throw new Error(`unknown model: ${id}`);
      const current = statusOf(model);
      if (current.ready) {
        onProgress?.({ id, stage: 'ready', pct: 1, file: current.file });
        results.push({ id, path: current.path, skipped: true });
        continue;
      }

      // 归档型模型（ZipVoice）：上游只发 tar.bz2，先整包下载再解压。
      if (model.archive) {
        const pending = modelFiles(model).filter((f) => !f.url);
        const missing = pending.some((f) => !fileReady(model, path.join(current.path, f.name), f.minBytes));
        if (missing) {
          await fsp.mkdir(current.path, { recursive: true });
          const archivePath = path.join(current.path, '_model.tar.bz2');
          onProgress?.({ id, stage: 'downloading', pct: 0, file: 'model.tar.bz2' });
          await download(archivePath, model.archive.url, model.archive.minBytes, ({ received, total }) => {
            onProgress?.({
              id,
              stage: 'downloading',
              pct: total ? Math.min(0.9, (received / total) * 0.9) : 0,
              file: 'model.tar.bz2',
              received,
              total,
            });
          });
          onProgress?.({ id, stage: 'extracting', pct: 0.92, file: 'model.tar.bz2' });
          await extractArchive(archivePath, current.path);
          await fsp.rm(archivePath, { force: true });
        }
      }

      const files = modelFiles(model);
      for (let i = 0; i < files.length; i += 1) {
        const f = files[i];
        const filePath = path.join(current.path, f.name);
        let alreadyReady = false;
        try {
          alreadyReady = fileReady(model, filePath, f.minBytes);
        } catch {}
        if (alreadyReady) {
          onProgress?.({ id, stage: 'downloading', pct: (i + 1) / files.length, file: f.name });
          continue;
        }
        // 归档内文件没有独立 url：解压后仍缺失说明包内容不符
        if (!f.url) {
          throw new Error(`model file missing after extraction: ${f.name}`);
        }
        onProgress?.({ id, stage: 'downloading', pct: i / files.length, file: f.name });
        await download(filePath, f.url, f.minBytes, ({ received, total }) => {
          const inner = total ? Math.min(1, received / total) : 0;
          onProgress?.({
            id,
            stage: 'downloading',
            pct: (i + inner) / files.length,
            file: f.name,
            received,
            total,
          });
        });
        if (!fileReady(model, filePath, f.minBytes)) {
          await fsp.rm(filePath, { force: true });
          throw new Error(`model integrity check failed: ${f.name}`);
        }
      }

      onProgress?.({ id, stage: 'ready', pct: 1, file: files[0].name });
      results.push({ id, path: current.path, skipped: false });
    }
    return { ok: true, results };
  }

  /** 模型主文件（whisper 的 ggml / SenseVoice 的 onnx）绝对路径；未就绪返回 null。 */
  function resolveModelFile(id) {
    const target = id || DEFAULT_MODEL_ID;
    const model = findModel(target);
    if (!model) return null;
    const info = statusOf(model);
    if (!info.ready) return null;
    return info.files[0].path;
  }

  /** 模型目录（多文件模型需要；未就绪返回 null）。 */
  function resolveModelDir(id) {
    const model = findModel(id);
    if (!model) return null;
    const info = statusOf(model);
    return info.ready ? info.path : null;
  }

  /** 按文件名取模型内某个文件路径（如 tokens.txt）；未就绪返回 null。 */
  function resolveModelSubFile(id, name) {
    const model = findModel(id);
    if (!model) return null;
    const info = statusOf(model);
    if (!info.ready) return null;
    const hit = info.files.find((f) => f.name === name);
    return hit ? hit.path : null;
  }

  function modelPath(id) {
    const model = findModel(id);
    if (!model) throw new Error(`unknown model: ${id}`);
    return path.join(modelDirOf(model, modelsDir), modelFiles(model)[0].name);
  }

  return {
    modelsDir,
    binDir: binDir || '',
    registry: MODEL_REGISTRY,
    defaultModelId: DEFAULT_MODEL_ID,
    senseVoiceModelId: SENSEVOICE_MODEL_ID,
    diarizationModelId: DIARIZATION_MODEL_ID,
    zipVoiceModelId: ZIPVOICE_MODEL_ID,
    status,
    prepare,
    modelPath,
    resolveModelFile,
    resolveModelDir,
    resolveModelSubFile,
  };
}

module.exports = {
  MODEL_REGISTRY,
  DEFAULT_MODEL_ID,
  SENSEVOICE_MODEL_ID,
  DIARIZATION_MODEL_ID,
  ZIPVOICE_MODEL_ID,
  createModelStore,
  isGgmlFile,
  isMultiFileModel,
  modelFiles,
  findModel,
};