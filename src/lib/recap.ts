/**
 * Recap Studio 共享数据模块（前后端共用，无 node 依赖）
 *
 * 只放"契约"：类型 + 规模常量 + 白名单归一化 + 错误码。
 * 任何服务端实现（LLM / ffmpeg / 字幕）都不得往这里塞 node 专有依赖，
 * 否则前端 import 会污染客户端 bundle。
 */

/** 解说稿生成引擎：llm = 模型生成；local = 本地启发式草稿 */
export type RecapEngine = 'llm' | 'local';

/** 单章解说 */
export type RecapChapter = {
  /** 章节序号，1-based，由归一化重排保证连续 */
  index: number;
  /** 章节标题（用于 UI 与成片分章展示） */
  title: string;
  /** 该章解说词（成片旁白原文） */
  narration: string;
  /** 该章金句（可选，UI 高亮用） */
  keyQuote?: string;
  /** LLM 给出的源视频时间锚点（秒），可选；越界/非法时会被丢弃 */
  sourceStart?: number;
  sourceEnd?: number;
};

/** 一部解说稿 */
export type RecapScript = {
  /** 黄金 3 秒钩子（置于旁白最前，不计入章节） */
  hook: string;
  /** 成片标题 */
  title: string;
  /** 章节列表，1..RECAP_MAX_CHAPTERS */
  chapters: RecapChapter[];
  /** 目标成片时长（秒），必须命中 RECAP_TARGET_SECS */
  targetDurationSec: number;
  /** 引擎标记：前端必须展示，绝不静默降级 */
  engine: RecapEngine;
};

/** 解说字幕：与字幕模块 SubtitleCue 结构一致（同构，可直接喂 buildKaraokeAssFile） */
export type RecapCue = {
  /** 秒（成片相对时间） */
  start: number;
  end: number;
  text: string;
};

/** 允许的目标成片时长（秒） */
export const RECAP_TARGET_SECS = [60, 120, 180] as const;
export const RECAP_DEFAULT_TARGET_SEC = 120;

/** 解说字幕单行最大字符数（成片字幕一行可读上限） */
export const RECAP_LINE_MAX_CHARS = 22;

/** 规模硬上限（防 OOM / 超时） */
export const RECAP_MAX_CHAPTERS = 6;
export const RECAP_MAX_NARRATION_CHARS = 2000;
export const RECAP_MAX_CHAPTER_CHARS = 400;
export const RECAP_HOOK_MAX_CHARS = 80;
export const RECAP_MAX_PIECE_SEC = 30;
export const RECAP_MIN_PIECE_SEC = 1.5;
export const RECAP_MAX_PIECES = 12;
/** 旁白实测总时长硬上限（秒）：解说稿字符数与 TTS 语速共同决定，超了必须拒绝，防 ffmpeg 超时/OOM */
export const RECAP_MAX_TOTAL_SEC = 200;

/** 时间锚点最小可用窗口（秒），短于此视为无效锚点 */
export const RECAP_MIN_ANCHOR_SEC = RECAP_MIN_PIECE_SEC;

/** 错误码（服务端返回体 `{ error: <code> }`，前端按码给引导） */
export const RECAP_ERROR_CODES = {
  /** 非 Pro 用户 */
  requiresPro: 'recap_requires_pro',
  /** 无任何可用 LLM 通道且未显式允许本地草稿 */
  aiUnavailable: 'recap_ai_unavailable',
  /** 请求体非法 */
  invalidRequest: 'recap_invalid_request',
  /** 解说稿结构非法 */
  scriptInvalid: 'recap_script_invalid',
  /** 源视频流不可用 */
  sourceUnavailable: 'recap_source_unavailable',
  /** 拿不到字幕（无法做音画对齐） */
  transcriptUnavailable: 'recap_transcript_unavailable',
  /** 渲染失败 */
  renderFailed: 'recap_render_failed',
} as const;

export type RecapErrorCode = (typeof RECAP_ERROR_CODES)[keyof typeof RECAP_ERROR_CODES];

const CHAPTER_TITLE_MAX_CHARS = 40;

function toStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 折叠空白（LLM 常输出换行/多空格） */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 归一化目标时长到白名单（取最接近的合法值） */
export function normalizeRecapTargetSec(v: unknown): number {
  const n = toNum(v);
  if (n == null) return RECAP_DEFAULT_TARGET_SEC;
  let best: number = RECAP_DEFAULT_TARGET_SEC;
  let bestDiff = Infinity;
  for (const allowed of RECAP_TARGET_SECS) {
    const diff = Math.abs(allowed - n);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = allowed;
    }
  }
  return best;
}

/**
 * 白名单归一化：任何非法输入返回 null（调用方回 400，不猜测用户意图）。
 * 规则：
 *  - 无章节 / 任一章节 narration 为空 → null
 *  - 章节数 > RECAP_MAX_CHAPTERS → 截断取前 N 章
 *  - 单章 narration > RECAP_MAX_CHAPTER_CHARS → 截断
 *  - hook + 各章 narration 总字符 > RECAP_MAX_NARRATION_CHARS → null
 *  - sourceStart/End 非数字、负数、或 end-start < RECAP_MIN_ANCHOR_SEC → 丢弃锚点
 */
export function normalizeRecapScript(raw: unknown): RecapScript | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const rawChapters = Array.isArray(obj.chapters) ? obj.chapters : [];
  if (rawChapters.length === 0) return null;

  const chapters: RecapChapter[] = [];
  for (const item of rawChapters.slice(0, RECAP_MAX_CHAPTERS)) {
    if (!item || typeof item !== 'object') return null;
    const c = item as Record<string, unknown>;

    const narration = collapse(toStr(c.narration));
    if (!narration) return null;

    const title = collapse(toStr(c.title)).slice(0, CHAPTER_TITLE_MAX_CHARS);
    const keyQuote = collapse(toStr(c.keyQuote)) || undefined;

    let sourceStart: number | undefined;
    let sourceEnd: number | undefined;
    const s = toNum(c.sourceStart);
    const e = toNum(c.sourceEnd);
    if (s != null && e != null && s >= 0 && e >= 0 && e - s >= RECAP_MIN_ANCHOR_SEC) {
      sourceStart = s;
      sourceEnd = e;
    }

    chapters.push({
      index: chapters.length + 1,
      title: title || `第 ${chapters.length + 1} 章`,
      narration: narration.slice(0, RECAP_MAX_CHAPTER_CHARS),
      ...(keyQuote ? { keyQuote } : {}),
      ...(sourceStart != null && sourceEnd != null ? { sourceStart, sourceEnd } : {}),
    });
  }

  const hook = collapse(toStr(obj.hook)).slice(0, RECAP_HOOK_MAX_CHARS);
  const totalChars = hook.length + chapters.reduce((sum, c) => sum + c.narration.length, 0);
  if (totalChars > RECAP_MAX_NARRATION_CHARS) return null;

  const engine: RecapEngine = obj.engine === 'local' ? 'local' : 'llm';

  return {
    hook,
    title: collapse(toStr(obj.title)).slice(0, CHAPTER_TITLE_MAX_CHARS),
    chapters,
    targetDurationSec: normalizeRecapTargetSec(obj.targetDurationSec),
    engine,
  };
}

/** 旁白总字符（hook + 各章 narration），供路由做二次上限校验 */
export function recapNarrationChars(script: RecapScript): number {
  return script.hook.length + script.chapters.reduce((sum, c) => sum + c.narration.length, 0);
}