/**
 * AI 工具箱 — 模型加载器
 *
 * 设计要点:
 * - HuggingFace 主源 + hf-mirror.com 中国镜像源自动回退
 * - Cache API 持久缓存模型字节（LaMa ~200MB 首次下载后秒加载）
 * - 流式下载进度回调
 * - ONNX Runtime Web session 复用（单例）
 */

export type ModelProgress = (loadedBytes: number, totalBytes: number) => void;

const HF_HOSTS = [
  'https://huggingface.co',
  'https://hf-mirror.com',
] as const;

const MODEL_CACHE_NAME = 'clipop-ai-models-v1';

let modelCache: Cache | null = null;
async function getModelCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  if (!modelCache) {
    try {
      modelCache = await caches.open(MODEL_CACHE_NAME);
    } catch {
      modelCache = null;
    }
  }
  return modelCache;
}

function modelUrls(repoPath: string): string[] {
  const clean = repoPath.replace(/^\/+/, '').replace(/\/+$/, '');
  return HF_HOSTS.map((host) => `${host}/${clean}`);
}

async function readContentLength(resp: Response): Promise<number> {
  const len = Number(resp.headers.get('content-length') || 0);
  if (len > 0) return len;
  // 一些 CDN 不返回 content-length，从 x-linked-size 头取
  const linked = Number(resp.headers.get('x-linked-size') || 0);
  return linked > 0 ? linked : 0;
}

/** 流式下载，支持进度 */
async function downloadWithProgress(
  url: string,
  onProgress?: ModelProgress
): Promise<Uint8Array> {
  const resp = await fetch(url, { mode: 'cors' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);

  const total = await readContentLength(resp);
  const reader = resp.body?.getReader();
  if (!reader) {
    return new Uint8Array(await resp.arrayBuffer());
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }

  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  onProgress?.(loaded, total || loaded);
  return out;
}

/**
 * 从多源下载模型文件（带持久缓存）。
 * @param repoPath 形如 "Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx"
 */
export async function fetchModelFile(
  repoPath: string,
  onProgress?: ModelProgress
): Promise<Uint8Array> {
  const urls = modelUrls(repoPath);
  const cache = await getModelCache();

  // 1. 尝试缓存
  if (cache) {
    for (const url of urls) {
      try {
        const cached = await cache.match(url);
        if (cached && cached.ok) {
          const buf = new Uint8Array(await cached.arrayBuffer());
          if (buf.byteLength > 0) {
            onProgress?.(buf.byteLength, buf.byteLength);
            return buf;
          }
        }
      } catch {
        // 缓存读取失败，忽略
      }
    }
  }

  // 2. 逐源下载
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const bytes = await downloadWithProgress(url, onProgress);
      if (bytes.byteLength === 0) throw new Error('empty model file');
      // 写入缓存（best-effort）
      if (cache) {
        try {
          await cache.put(
            url,
            new Response(bytes.slice().buffer as ArrayBuffer, {
              headers: { 'content-type': 'application/octet-stream' },
            })
          );
        } catch {
          // 配额不足等，忽略
        }
      }
      return bytes;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Failed to download model "${repoPath}": ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

/* -------------------------------------------------------------------------
 * ONNX Runtime Web sessions（LaMa 去水印 / 黑白上色）
 * ---------------------------------------------------------------------- */

export type OrtModule = typeof import('onnxruntime-web');

let ortModule: OrtModule | null = null;

export async function getOrt(): Promise<OrtModule> {
  if (!ortModule) {
    ortModule = (await import('onnxruntime-web')) as unknown as OrtModule;
    // wasm 二进制从官方 CDN 加载（jsdelivr 国内可达）
    ortModule.env.wasm.wasmPaths =
      'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
  }
  return ortModule;
}

export interface TrackedSession {
  session: import('onnxruntime-web').InferenceSession;
}

const sessionCache = new Map<string, Promise<import('onnxruntime-web').InferenceSession>>();

/**
 * 加载（并缓存）一个 ONNX InferenceSession。
 * @param key 缓存键（模型路径）
 */
export async function getOrtSession(
  key: string,
  repoPath: string,
  onProgress?: ModelProgress
): Promise<import('onnxruntime-web').InferenceSession> {
  const existing = sessionCache.get(key);
  if (existing) return existing;

  const task = (async () => {
    const ort = await getOrt();
    const bytes = await fetchModelFile(repoPath, onProgress);
    return await ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
  })().catch((error) => {
    sessionCache.delete(key);
    throw error;
  });

  sessionCache.set(key, task);
  return task;
}

/* -------------------------------------------------------------------------
 * Transformers.js pipeline（Swin2SR 超分）
 * ---------------------------------------------------------------------- */

let transformersEnvConfigured = false;
let usingMirror = false;

export interface TransformersModules {
  pipeline: typeof import('@huggingface/transformers').pipeline;
  env: typeof import('@huggingface/transformers').env;
  RawImage: typeof import('@huggingface/transformers').RawImage;
  Tensor: typeof import('@huggingface/transformers').Tensor;
}

export async function getTransformers(): Promise<TransformersModules> {
  const mod = await import('@huggingface/transformers');
  if (!transformersEnvConfigured) {
    mod.env.allowLocalModels = false; // 只用远程 HF CDN
    mod.env.useBrowserCache = true; // IndexedDB 缓存模型
    transformersEnvConfigured = true;
  }
  if (usingMirror) {
    mod.env.remoteHost = 'https://hf-mirror.com';
    mod.env.remotePathTemplate = '{model}/resolve/{revision}/';
  }
  return {
    pipeline: mod.pipeline,
    env: mod.env,
    RawImage: mod.RawImage,
    Tensor: mod.Tensor,
  };
}

/** 在 HF 主源失败时切换镜像重试一次 */
export async function withMirrorFallback<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (usingMirror) throw error;
    usingMirror = true;
    const { env } = await getTransformers();
    env.remoteHost = 'https://hf-mirror.com';
    env.remotePathTemplate = '{model}/resolve/{revision}/';
    return await task();
  }
}

type UpscalerPipeline = (
  input: string | Blob | URL,
  options?: Record<string, unknown>
) => Promise<{ data: Uint8ClampedArray | Int32Array | Float32Array; width: number; height: number; channels: number }>;

let upscalerPromise: Promise<UpscalerPipeline> | null = null;

export const UPSCALE_MODEL_ID = 'Xenova/swin2SR-classical-sr-x2-64';

/** Swin2SR x2 超分 pipeline（单例缓存） */
export function getUpscaler(onProgress?: (status: string) => void): Promise<UpscalerPipeline> {
  if (!upscalerPromise) {
    upscalerPromise = (async () => {
      onProgress?.('downloading');
      const { pipeline } = await getTransformers();
      const create = () =>
        pipeline('image-to-image', UPSCALE_MODEL_ID, {
          dtype: 'fp32',
          device: 'wasm',
        }) as unknown as Promise<UpscalerPipeline>;
      const pipe = await withMirrorFallback(create);
      onProgress?.('ready');
      return pipe;
    })().catch((error) => {
      upscalerPromise = null;
      throw error;
    });
  }
  return upscalerPromise;
}

/* -------------------------------------------------------------------------
 * FFmpeg.wasm（视频去水印）
 * ---------------------------------------------------------------------- */

export interface FFmpegInstance {
  exec: (args: string[]) => Promise<number>;
  writeFile: (path: string, data: Uint8Array | string) => Promise<boolean>;
  readFile: (path: string) => Promise<Uint8Array | string>;
  deleteFile?: (path: string) => Promise<boolean>;
  on: (event: string, cb: (data: unknown) => void) => void;
  off?: (event: string, cb: (data: unknown) => void) => void;
  loaded?: boolean;
  terminate?: () => void;
}

let ffmpegPromise: Promise<FFmpegInstance> | null = null;

/** ffmpeg.wasm 单线程核心（jsdelivr CDN，国内可达） */
export function getFFmpeg(onStatus?: (status: string) => void): Promise<FFmpegInstance> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      onStatus?.('loading-core');
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);
      const coreBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
      const ffmpeg = new FFmpeg() as unknown as FFmpegInstance;
      await ffmpeg.load({
        coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      onStatus?.('core-ready');
      return ffmpeg;
    })().catch((error) => {
      ffmpegPromise = null;
      throw error;
    });
  }
  return ffmpegPromise;
}
