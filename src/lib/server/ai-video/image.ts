/**
 * AI 成片 —— 逐分镜配图生成（通义万相文生图，DashScope 异步任务协议）。
 *
 * 这是「实拍画面」质量的来源：移植 Pixelle-Video 的核心做法——每个分镜根据旁白生成**一张
 * AI 插画**作为画面主体（Pixelle 的 `image_*.html` 模版即「AI 图 + 标题 + 字幕」版式）。
 * 旧实现用纯 SVG 矢量背景顶替，导致成片像 PPT，与开源框架的 demo 效果完全不一致。
 *
 * 通道：POST /api/v1/services/aigc/text2image/image-synthesis（X-DashScope-Async: enable）
 *   → 轮询 GET /api/v1/tasks/{task_id} → SUCCEEDED 后下载 results[0].url 的图片字节。
 *
 * 谨慎降级：未配置 Key / 提交失败 / 超时 / 审核失败 → 返回 null，调用方回落 SVG 版式，
 * 绝不因为配图失败而让整条成片报错。
 */

import { getDashscopeImageConfig } from '../model-config';

/** 通义万相 wanx2.1 系列 prompt 上限 500 字符；留余量避免被截断。 */
const MAX_PROMPT_CHARS = 480;

/** 默认出图尺寸：竖屏 9:16（wanx2.1 支持档位），全幅铺满画面利用率最高。 */
const DEFAULT_SIZE = '720*1280';

/** 抑制生成图中出现文字/水印（title/caption 由 libass 另行烧录）。 */
const NEGATIVE_PROMPT =
  'text, watermark, signature, logo, letters, words, caption, subtitles, low resolution, blurry, distorted, deformed, extra limbs';

const SUBMIT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 75_000;
/** DashScope t2i 的 QPS 限流较紧（Throttling.RateQuota），429 时退避重试。 */
const RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_BACKOFF_MS = 2_500;

interface DashscopeTask {
  output?: {
    task_id?: string;
    task_status?: string;
    results?: Array<{ url?: string; code?: string; message?: string }>;
    message?: string;
  };
  message?: string;
  code?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 该环境是否具备出图能力（决定 UI 是否显示「AI 配图」状态）。 */
export async function isIllustrationAvailable(): Promise<boolean> {
  return (await getDashscopeImageConfig()) !== null;
}

function buildPrompt(scenePrompt: string, stylePrefix?: string): string {
  const scene = scenePrompt.replace(/\s+/g, ' ').trim();
  const style = (stylePrefix || '').trim();
  const merged = style ? `${style}, ${scene}` : scene;
  return merged.slice(0, MAX_PROMPT_CHARS);
}

/**
 * 生成一张插画。失败/未配置一律返回 null（不抛异常）。
 * @param scenePrompt 该分镜的画面内容描述（建议英文）
 * @param stylePrefix 模版风格前缀（英文，控制整片视觉统一）
 */
export async function generateIllustrationImage(
  scenePrompt: string,
  stylePrefix?: string,
  size: string = DEFAULT_SIZE,
): Promise<Buffer | null> {
  const cfg = await getDashscopeImageConfig();
  if (!cfg) return null;

  const prompt = buildPrompt(scenePrompt, stylePrefix);
  if (!prompt) return null;

  try {
    // 提交阶段：429 限流时退避重试（wanx2.1 的 QPS 配额较紧）
    let submitted: DashscopeTask | null = null;
    for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
      const submit = await fetchWithTimeout(
        `${cfg.baseUrl}/api/v1/services/aigc/text2image/image-synthesis`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
            'X-DashScope-Async': 'enable',
          },
          body: JSON.stringify({
            model: cfg.imageModel,
            input: { prompt, negative_prompt: NEGATIVE_PROMPT },
            parameters: { size, n: 1, prompt_extend: true },
          }),
        },
        SUBMIT_TIMEOUT_MS,
      );
      submitted = (await submit.json()) as DashscopeTask;
      if (submit.ok && submitted.output?.task_id) break;
      // 非 429 或已到重试上限：放弃
      if (submit.status !== 429 || attempt === RATE_LIMIT_RETRIES) {
        console.warn(
          `[ai-video/image] submit failed ${submit.status}: ${JSON.stringify(submitted).slice(0, 240)}`,
        );
        return null;
      }
      await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
    }
    if (!submitted?.output?.task_id) return null;
    const taskId = submitted.output.task_id;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const poll = await fetchWithTimeout(
        `${cfg.baseUrl}/api/v1/tasks/${taskId}`,
        { headers: { Authorization: `Bearer ${cfg.apiKey}` } },
        SUBMIT_TIMEOUT_MS,
      );
      const task = (await poll.json()) as DashscopeTask;
      const status = task.output?.task_status;
      if (status === 'SUCCEEDED') {
        const url = task.output?.results?.[0]?.url;
        if (!url) return null;
        const img = await fetchWithTimeout(url, {}, SUBMIT_TIMEOUT_MS);
        if (!img.ok) return null;
        return Buffer.from(await img.arrayBuffer());
      }
      if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
        console.warn(
          `[ai-video/image] task ${status}: ${JSON.stringify(task.output).slice(0, 240)}`,
        );
        return null;
      }
    }
    console.warn('[ai-video/image] poll timeout');
    return null;
  } catch (e) {
    console.warn('[ai-video/image] error:', e instanceof Error ? e.message.slice(0, 200) : e);
    return null;
  }
}

/**
 * 并发生成一组分镜配图。
 * 默认串行（concurrency=1）：DashScope t2i 的 QPS 配额较紧，并发提交会触发 429
 * 限流导致大量分镜回落 SVG 版式；串行 + 429 退避重试可获得最高的实拍覆盖率。
 * 返回与输入等长的数组，某项失败为 null（调用方逐项回落）。
 */
export async function generateSceneImages(
  scenePrompts: string[],
  stylePrefix?: string,
  concurrency = 1,
): Promise<Array<Buffer | null>> {
  const results: Array<Buffer | null> = new Array(scenePrompts.length).fill(null);
  if (scenePrompts.length === 0) return results;

  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, scenePrompts.length) }, async () => {
    while (cursor < scenePrompts.length) {
      const idx = cursor++;
      results[idx] = await generateIllustrationImage(scenePrompts[idx], stylePrefix);
    }
  });
  await Promise.all(workers);
  const ok = results.filter(Boolean).length;
  console.log(`[ai-video/image] generated ${ok}/${scenePrompts.length} illustrations`);
  return results;
}