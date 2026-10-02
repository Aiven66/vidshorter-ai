/**
 * AI 工具箱 — 服务端模型推理核心
 *
 * 模型托管: GitHub Releases（公开 CDN，主源）+ HuggingFace（备用源）
 * 会话缓存: 模块级单例，冷启动下载一次后驻留内存
 * 下载策略: 写入 /tmp 再建会话（避免大 Buffer 常驻），建完立即删除
 */

import { createWriteStream, existsSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { InferenceSession } from 'onnxruntime-node';

const GH_RELEASE_BASE =
  'https://github.com/Aiven66/vidshorter-ai/releases/download/ai-models-v1';

export type AiModelName = 'lama' | 'swin2sr' | 'colorize' | 'modnet';

interface ModelSource {
  file: string;
  /** GitHub Releases 直链（主源） */
  primary: string;
  /** HF 备用源（colorize 无公开源，仅自托管） */
  fallback?: string;
  /** 期望字节数（下载后校验，防止 CDN 半截文件） */
  size: number;
}

export const MODEL_SOURCES: Record<AiModelName, ModelSource> = {
  lama: {
    file: 'lama_fp32.onnx',
    primary: `${GH_RELEASE_BASE}/lama_fp32.onnx`,
    fallback:
      'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',
    size: 208044816,
  },
  swin2sr: {
    file: 'swin2sr_x2_fp32.onnx',
    primary: `${GH_RELEASE_BASE}/swin2sr_x2_fp32.onnx`,
    fallback:
      'https://huggingface.co/Xenova/swin2SR-classical-sr-x2-64/resolve/main/onnx/model.onnx',
    size: 54428699,
  },
  colorize: {
    file: 'colorize_fp32.onnx',
    primary: `${GH_RELEASE_BASE}/colorize_fp32.onnx`,
    size: 128975480,
  },
  // Xenova/modnet — 人像前景分割（肖像抠图）。25MB 小模型，直接走 HF 主源。
  modnet: {
    file: 'modnet.onnx',
    primary:
      'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx',
    size: 25888640,
  },
};

const sessionCache = new Map<AiModelName, Promise<InferenceSession>>();
/** 活跃借出计数 — 正在被请求使用（或正在创建）的会话不可驱逐 */
const activeCount = new Map<AiModelName, number>();

/** 回收除 keep 外所有空闲会话（active=0）。
 *  函数实例内存装不下多个 fp32 模型常驻（lama+swin2sr+colorize 累积会 OOM
 *  500，生产实测），所以单会话驻留: 加载新模型前先 release 旧会话。
 *  在途请求引用计数保护，不会被中途回收。 */
async function evictIdleSessions(keep: AiModelName): Promise<void> {
  for (const [name, promise] of [...sessionCache]) {
    if (name === keep || (activeCount.get(name) ?? 0) > 0) continue;
    sessionCache.delete(name);
    try {
      await promise.then((session) => session.release());
    } catch {
      /* 创建失败的 promise 无需释放 */
    }
  }
}

/** 借出模型会话（带活跃计数）。用完必须调 releaseModelSession归还。 */
export async function acquireModelSession(
  name: AiModelName
): Promise<InferenceSession> {
  // 先计数再创建: 创建期间（下载可达 30s+）驱逐器必须跳过本会话
  activeCount.set(name, (activeCount.get(name) ?? 0) + 1);
  try {
    return await getModelSession(name);
  } catch (error) {
    activeCount.set(name, Math.max(0, (activeCount.get(name) ?? 0) - 1));
    throw error;
  }
}

/** 归还借出的模型会话（活跃计数-1；会话留在缓存，空闲后可被驱逐） */
export function releaseModelSession(name: AiModelName): void {
  activeCount.set(name, Math.max(0, (activeCount.get(name) ?? 0) - 1));
}

/** 流式下载模型到 /tmp（带重试），返回本地文件路径 */
async function downloadModel(source: ModelSource): Promise<string> {
  const dest = path.join(tmpdir(), source.file);
  if (existsSync(dest)) return dest; // 同实例前次下载残留，直接复用

  const urls = source.fallback ? [source.primary, source.fallback] : [source.primary];
  let lastError: unknown = null;

  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await fetch(url, {
          redirect: 'follow',
          headers: { 'user-agent': 'clipop-ai-tools/1.0' },
        });
        if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

        const tmpDest = `${dest}.downloading`;
        await pipeline(Readable.fromWeb(resp.body as never), createWriteStream(tmpDest));

        const { statSync } = await import('node:fs');
        const actual = statSync(tmpDest).size;
        if (actual !== source.size) {
          throw new Error(`size mismatch: ${actual} != ${source.size}`);
        }
        const { renameSync } = await import('node:fs');
        renameSync(tmpDest, dest);
        return dest;
      } catch (error) {
        lastError = error;
        // 指数退避后重试（或换下一个源）
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw new Error(
    `model download failed "${source.file}": ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

/** 获取（或创建）模型推理会话 — 全局单例，并发请求共享同一次加载 */
export function getModelSession(name: AiModelName): Promise<InferenceSession> {
  let promise = sessionCache.get(name);
  if (!promise) {
    promise = (async () => {
      await evictIdleSessions(name); // 先回收旧会话腾内存，再加载新模型
      const source = MODEL_SOURCES[name];
      const file = await downloadModel(source);
      try {
        const session = await InferenceSession.create(file, {
          graphOptimizationLevel: 'all',
          executionMode: 'sequential',
        });
        return session;
      } finally {
        // 会话已把模型读入内存，删除临时文件释放 /tmp 空间。
        // 本地测试设 AI_KEEP_MODELS=1 跳过删除，避免反复下载数百 MB 模型。
        if (process.env.AI_KEEP_MODELS !== '1') {
          try {
            if (existsSync(file)) unlinkSync(file);
          } catch {
            /* 删除失败不影响功能 */
          }
        }
      }
    })().catch((error) => {
      sessionCache.delete(name); // 失败后允许重试
      throw error;
    });
    sessionCache.set(name, promise);
  }
  return promise;
}
