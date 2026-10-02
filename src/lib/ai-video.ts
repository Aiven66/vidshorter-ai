/**
 * AI 成片（一句话生成视频）——客户端 / 服务端共用的类型与常量。
 *
 * 本模块必须保持零依赖（不 import next / react / supabase），供路由与页面直接引用。
 */

/** 一次「AI 成片」消耗的积分（与视频处理同价，免费档 60/日 = 恰好 1 条）。 */
export const AI_VIDEO_COST = 60;

/** 分镜数量区间：太少讲不清，太多则渲染耗时与包体都失控。 */
export const AI_VIDEO_MIN_SCENES = 4;
export const AI_VIDEO_MAX_SCENES = 6;

/** 主题输入上限（防止超长 prompt 拖慢 LLM 与 TTS）。 */
export const AI_VIDEO_MAX_TOPIC_CHARS = 200;

/** 单个分镜旁白上限（≈ 12s 语音；全片控制在 60s 内）。 */
export const AI_VIDEO_MAX_NARRATION_CHARS = 120;

/** 单个分镜标题上限（画面主标题，过长会压字）。 */
export const AI_VIDEO_MAX_HEADLINE_CHARS = 28;

/** 全片总时长上限（秒）——与 ffmpeg 渲染预算匹配。 */
export const AI_VIDEO_MAX_TOTAL_SEC = 90;

export interface AiVideoScene {
  /** 画面主标题（烧录在画面上方） */
  headline: string;
  /** 旁白文案（TTS 朗读 + 底部字幕） */
  narration: string;
}

export interface AiVideoScript {
  title: string;
  scenes: AiVideoScene[];
  /** 'llm' = 大模型生成；'local' = 未配置/调用失败时的本地模板兜底 */
  engine: 'llm' | 'local';
}

/** 输出规格：免费档 720p + 水印，Starter+ 1080p 无水印（与全站付费差异一致）。 */
export interface AiVideoTarget {
  width: number;
  height: number;
  watermark: boolean;
}

export function resolveAiVideoTarget(plan?: string | null): AiVideoTarget {
  if (plan === 'starter' || plan === 'pro') {
    return { width: 1080, height: 1920, watermark: false };
  }
  return { width: 720, height: 1280, watermark: true };
}

/** 白名单兜底：把任意输入归一为合法分镜数组（服务端绝不信任前端结构）。 */
export function normalizeAiVideoScript(raw: unknown, engine: 'llm' | 'local'): AiVideoScript | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawScenes = Array.isArray(r.scenes) ? r.scenes : [];
  const scenes: AiVideoScene[] = [];
  for (const item of rawScenes.slice(0, AI_VIDEO_MAX_SCENES)) {
    const s = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const headline = typeof s.headline === 'string' ? s.headline.trim().slice(0, AI_VIDEO_MAX_HEADLINE_CHARS) : '';
    const narration = typeof s.narration === 'string' ? s.narration.trim().slice(0, AI_VIDEO_MAX_NARRATION_CHARS) : '';
    if (!headline && !narration) continue;
    scenes.push({ headline: headline || narration.slice(0, AI_VIDEO_MAX_HEADLINE_CHARS), narration: narration || headline });
  }
  if (scenes.length < AI_VIDEO_MIN_SCENES) return null;
  const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 60) : scenes[0].headline;
  return { title, scenes, engine };
}