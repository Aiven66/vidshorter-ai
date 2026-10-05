'use strict';

/**
 * 本地模型管理（P0-1）
 *
 * 负责 whisper.cpp ggml 模型的下载 / 校验 / 状态查询。设计目标：
 *  - 与 Electron 解耦：调用方注入 modelsDir，测试可用临时目录。
 *  - 完整性校验不依赖精确字节数：ggml 文件头 magic 校验 + 最小体积兜底。
 *  - 下载写临时文件再 rename，避免半成品被当作已就绪。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// ggml 文件魔数 0x67676d6c，按小端写入的字节序为 'lmgg'。
const GGML_MAGIC_LITTLE_ENDIAN = Buffer.from([0x6c, 0x6d, 0x67, 0x67]);

const HF_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

const MODEL_REGISTRY = [
  {
    id: 'whisper-tiny',
    file: 'ggml-tiny.bin',
    url: `${HF_BASE}/ggml-tiny.bin`,
    minBytes: 70 * 1024 * 1024,
    label: 'Whisper Tiny (最快，低配)',
  },
  {
    id: 'whisper-base',
    file: 'ggml-base.bin',
    url: `${HF_BASE}/ggml-base.bin`,
    minBytes: 130 * 1024 * 1024,
    label: 'Whisper Base (默认，均衡)',
  },
  {
    id: 'whisper-small',
    file: 'ggml-small.bin',
    url: `${HF_BASE}/ggml-small.bin`,
    minBytes: 440 * 1024 * 1024,
    label: 'Whisper Small (高质量)',
  },
];

const DEFAULT_MODEL_ID = 'whisper-base';

function findModel(id) {
  return MODEL_REGISTRY.find((m) => m.id === id) || null;
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

function createModelStore({ modelsDir, binDir }) {
  if (!modelsDir) throw new Error('local-models: modelsDir is required');

  async function ensureDir() {
    await fsp.mkdir(modelsDir, { recursive: true });
    if (binDir) await fsp.mkdir(binDir, { recursive: true });
  }

  function modelPath(id) {
    const model = findModel(id);
    if (!model) throw new Error(`unknown model: ${id}`);
    return path.join(modelsDir, model.file);
  }

  function status() {
    const models = MODEL_REGISTRY.map((model) => {
      const filePath = path.join(modelsDir, model.file);
      let bytes = 0;
      try {
        bytes = fs.statSync(filePath).size;
      } catch {}
      const ready = bytes >= model.minBytes && isGgmlFile(filePath);
      return {
        id: model.id,
        label: model.label,
        file: model.file,
        path: filePath,
        bytes,
        minBytes: model.minBytes,
        ready,
      };
    });
    return {
      modelsDir,
      binDir: binDir || '',
      defaultModelId: DEFAULT_MODEL_ID,
      models,
      readyCount: models.filter((m) => m.ready).length,
      totalBytes: models.reduce((sum, m) => sum + m.bytes, 0),
    };
  }

  async function download(filePath, url, expectedMinBytes, onProgress) {
    await ensureDir();
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
   * 用户可在「本地模型」页升级到 small。
   */
  async function prepare(ids, onProgress) {
    const list = Array.isArray(ids) && ids.length > 0 ? ids : [DEFAULT_MODEL_ID];
    const results = [];
    for (const id of list) {
      const model = findModel(id);
      if (!model) throw new Error(`unknown model: ${id}`);
      const filePath = path.join(modelsDir, model.file);
      const current = status().models.find((m) => m.id === id);
      if (current && current.ready) {
        onProgress?.({ id, stage: 'ready', pct: 1, file: model.file });
        results.push({ id, path: filePath, skipped: true });
        continue;
      }
      onProgress?.({ id, stage: 'downloading', pct: 0, file: model.file });
      await download(filePath, model.url, model.minBytes, ({ received, total }) => {
        onProgress?.({
          id,
          stage: 'downloading',
          pct: total ? Math.min(1, received / total) : 0,
          file: model.file,
          received,
          total,
        });
      });
      if (!isGgmlFile(filePath)) {
        await fsp.rm(filePath, { force: true });
        throw new Error(`model integrity check failed: ${model.file}`);
      }
      onProgress?.({ id, stage: 'ready', pct: 1, file: model.file });
      results.push({ id, path: filePath, skipped: false });
    }
    return { ok: true, results };
  }

  function resolveModelFile(id) {
    const target = id || DEFAULT_MODEL_ID;
    const info = status().models.find((m) => m.id === target);
    if (!info || !info.ready) return null;
    return info.path;
  }

  return {
    modelsDir,
    binDir: binDir || '',
    registry: MODEL_REGISTRY,
    defaultModelId: DEFAULT_MODEL_ID,
    status,
    prepare,
    modelPath,
    resolveModelFile,
  };
}

module.exports = {
  MODEL_REGISTRY,
  DEFAULT_MODEL_ID,
  createModelStore,
  isGgmlFile,
};
