/**
 * Recap Studio — 解说稿生成（LLM 优先 + 明文标记的本地草稿兜底）
 *
 * 设计原则（见实现方案 §1）：
 * - 配置解析是 provider-agnostic 的三级回落：请求体 aiConfig > 服务端 env > null
 * - **绝不静默降级**：解析不到配置时由路由返回 503 recap_ai_unavailable，
 *   只有请求显式带上 allowLocalDraft 才走本地启发式草稿，并把 engine 标成 'local'
 * - 本模块所有 export 都必须是纯函数/可单测的（无网络即可验证 resolve/parse/draft）
 */

import { LLMClient, Config } from 'coze-coding-dev-sdk';
import type { TranscriptSegment } from '../../../app/api/video-notes/generate/local-note-generator';
import { generateNoteFromTranscript } from '../../../app/api/video-notes/generate/local-note-generator';
import { downsampleSegments } from '../video-notes/llm-note-generator';
import {
  normalizeRecapScript,
  RECAP_HOOK_MAX_CHARS,
  RECAP_MAX_CHAPTER_CHARS,
  RECAP_MAX_CHAPTERS,
  RECAP_MAX_NARRATION_CHARS,
  RECAP_MAX_PIECE_SEC,
  type RecapScript,
} from '../../recap';

/** 客户端 AI 配置通道（与 process-video/stream 同款结构） */
export type RecapAiConfig = {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  modelBaseUrl?: string;
  model?: string;
};

export type RecapLlmConfig = {
  apiKey: string;
  baseUrl?: string;
  modelBaseUrl?: string;
  model: string;
};

const DEFAULT_LLM_MODEL = 'doubao-seed-1-8-251228';

/** TTS 语速经验值：msedge 中文神经声线约 4.2 字/秒，用于反推解说字数预算 */
const CHARS_PER_SEC = 4.2;

/**
 * 三级解析 LLM 配置。无任何可用通道时返回 null（调用方负责不静默降级）。
 * 不发起任何网络请求，可安全单测。
 */
export function resolveRecapLlmConfig(aiConfig?: RecapAiConfig | null): RecapLlmConfig | null {
  if (aiConfig?.enabled && typeof aiConfig.apiKey === 'string' && aiConfig.apiKey.trim()) {
    return {
      apiKey: aiConfig.apiKey.trim(),
      baseUrl: aiConfig.baseUrl || process.env.COZE_INTEGRATION_BASE_URL,
      modelBaseUrl: aiConfig.modelBaseUrl || process.env.COZE_INTEGRATION_MODEL_BASE_URL,
      model: aiConfig.model || DEFAULT_LLM_MODEL,
    };
  }

  const envKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  if (envKey && envKey.trim()) {
    return {
      apiKey: envKey.trim(),
      baseUrl: process.env.COZE_INTEGRATION_BASE_URL,
      modelBaseUrl: process.env.COZE_INTEGRATION_MODEL_BASE_URL,
      model: DEFAULT_LLM_MODEL,
    };
  }

  return null;
}

/** 解析 LLM 返回文本为解说稿：剥 markdown 围栏 / 取首个 {...} / 白名单归一化。结构非法返回 null。 */
export function parseRecapScriptJson(raw: string): RecapScript | null {
  if (!raw || typeof raw !== 'string') return null;

  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) text = fence[1].trim();
  const open = text.indexOf('{');
  const close = text.lastIndexOf('}');
  if (open === -1 || close <= open) return null;

  let data: unknown;
  try {
    data = JSON.parse(text.slice(open, close + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  // 引擎标记由调用方决定，不接受模型自报
  return normalizeRecapScript({ ...(data as Record<string, unknown>), engine: 'llm' });
}

function langHint(locale?: string): string {
  const l = (locale || '').toLowerCase();
  if (l.startsWith('zh-hant') || l.startsWith('zh-tw')) return '繁體中文';
  if (l.startsWith('zh')) return '简体中文';
  if (l.startsWith('ja')) return '日本語';
  return 'English';
}

/** 章节数量：60s→3 章，120s→3 章，180s→5 章（硬上限 6） */
function planChapterCount(targetDurationSec: number): number {
  return Math.min(RECAP_MAX_CHAPTERS, Math.max(3, Math.round(targetDurationSec / 40)));
}

/**
 * 用 LLM 生成解说稿。
 * 未配置 / 网络失败 / 解析失败 → 返回 null（路由据此返回错误，不做静默降级）。
 */
export async function generateRecapScript(params: {
  cfg: RecapLlmConfig;
  segments: TranscriptSegment[];
  videoTitle?: string;
  targetDurationSec: number;
  locale?: string;
}): Promise<RecapScript | null> {
  const { cfg, segments, videoTitle, targetDurationSec, locale } = params;
  if (segments.length === 0) return null;

  const lines = downsampleSegments(segments, 80, 7000);
  if (lines.length === 0) return null;

  const chapterTarget = planChapterCount(targetDurationSec);
  const budget = Math.min(RECAP_MAX_NARRATION_CHARS, Math.round(targetDurationSec * CHARS_PER_SEC));
  const charsPerChapter = Math.max(40, Math.min(RECAP_MAX_CHAPTER_CHARS, Math.floor(budget / chapterTarget)));

  const prompt = [
    'You are a top short-form video narration writer. Turn the transcript below into a tight "recap film" narration script in JSON.',
    `Video title: ${videoTitle || '(untitled)'}`,
    `Target finished length: ${targetDurationSec} seconds.`,
    '',
    'Output a SINGLE JSON object with exactly these fields:',
    '{',
    `  "hook": "one punchy opening line (<= 30 characters) that hooks the viewer within 3 seconds",`,
    `  "title": "recap title (<= 16 characters)",`,
    `  "chapters": [ { "title": "<= 16 characters", "narration": "spoken narration of about ${charsPerChapter} characters", "keyQuote": "<= 20 characters punchy quote", "sourceStart": <seconds:number>, "sourceEnd": <seconds:number> } ]`,
    '}',
    `Rules:`,
    `- Produce EXACTLY ${chapterTarget} chapters, in chronological order of the source video.`,
    `- "sourceStart" / "sourceEnd" MUST be the [MM:SS] seconds range of the transcript that this chapter is based on (convert MM:SS to total seconds). Never exceed the video length.`,
    `- hook + all chapter narration together must be at most ${budget} characters. Do NOT exceed it.`,
    '- Narration must be natural spoken language, flowing sentences: no bullet points, no markdown, no emoji, no stage directions, no on-screen text descriptions.',
    `- Write hook, title, chapter title, narration and keyQuote in ${langHint(locale)}.`,
    '- Reply with ONLY the JSON object — no markdown fences, no comments, no extra text.',
    '',
    'TRANSCRIPT:',
    ...lines,
  ].join('\n');

  try {
    const client = new LLMClient(
      new Config({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, modelBaseUrl: cfg.modelBaseUrl }),
      {},
    );
    const resp = await client.invoke([{ role: 'user', content: prompt }], {
      // max_tokens 未声明在 SDK 的 LLMConfig 类型里，但服务端 API 接受（与 categorize.ts / llm-note-generator 一致）
      model: cfg.model,
      temperature: 0.6,
      max_tokens: 2000,
    } as never);

    const raw = typeof resp?.content === 'string' ? resp.content : '';
    const parsed = parseRecapScriptJson(raw);
    if (!parsed) return null;
    // 目标时长以请求为准（模型自报不可信）
    return { ...parsed, targetDurationSec, engine: 'llm' };
  } catch (error) {
    console.error('[recap/script] LLM failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** 从 `[MM:SS]` 或纯数字串解析秒数 */
function parseAnchorSeconds(ts: string): number | null {
  const m = ts.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** 按句子边界截断到 maxChars（找不到合适断点则硬切） */
function truncateAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const window = text.slice(0, maxChars);
  const cut = Math.max(
    window.lastIndexOf('。'),
    window.lastIndexOf('！'),
    window.lastIndexOf('？'),
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
  );
  const idx = cut >= Math.floor(maxChars * 0.6) ? cut + 1 : maxChars;
  return window.slice(0, idx).trim();
}

/**
 * 本地启发式草稿（engine: 'local'）——仅在请求显式允许时使用。
 *
 * 复用高光笔记的 TextRank-like 提炼（`generateNoteFromTranscript` 已导出）：
 * corePoints 天然是"按内容量分块 + 块内选高分句"的产物，正好对应解说稿的章节。
 * 无字幕 / 提炼不出要点 → null（路由返回错误，不产出空成片）。
 */
export function buildLocalRecapDraft(params: {
  segments: TranscriptSegment[];
  videoTitle?: string;
  targetDurationSec: number;
  locale?: string;
  sourceUrl?: string;
  sourceType?: 'youtube' | 'bilibili' | 'local';
}): RecapScript | null {
  const { segments, videoTitle, targetDurationSec, locale, sourceUrl = '', sourceType = 'youtube' } = params;
  if (segments.length === 0) return null;

  const note = generateNoteFromTranscript(segments, videoTitle, sourceUrl, sourceType, locale);
  if (note.corePoints.length === 0) return null;

  const chapterTarget = planChapterCount(targetDurationSec);
  const points = note.corePoints;

  // 均匀抽样章节，始终保留首章（导入）与末章（收尾）
  let picked = points;
  if (points.length > chapterTarget) {
    const idxs = new Set<number>();
    for (let i = 0; i < chapterTarget; i++) {
      idxs.add(Math.round((i * (points.length - 1)) / (chapterTarget - 1 || 1)));
    }
    picked = [...idxs].sort((a, b) => a - b).map((i) => points[i]);
  }

  const firstSentence = (text: string) => text.split(/[。.!！?？\n]+/)[0]?.trim() || '';
  const hookSource = firstSentence(note.summary) || picked[0].title;
  const hook = hookSource.slice(0, RECAP_HOOK_MAX_CHARS);

  const perChapterBudget = Math.max(
    40,
    Math.min(RECAP_MAX_CHAPTER_CHARS, Math.floor((RECAP_MAX_NARRATION_CHARS - hook.length) / picked.length)),
  );

  const chapters = picked.map((p) => {
    const raw = p.detail && p.detail.length >= 20 ? p.detail : `${p.title}。${p.detail}`;
    const narration = truncateAtBoundary(raw.trim(), perChapterBudget);

    let sourceStart: number | undefined;
    let sourceEnd: number | undefined;
    for (const ts of p.sourceTimestamps || []) {
      const sec = parseAnchorSeconds(ts);
      if (sec != null) {
        sourceStart = sec;
        sourceEnd = sec + RECAP_MAX_PIECE_SEC;
        break;
      }
    }

    return {
      index: 0,
      title: p.title,
      narration,
      ...(p.title ? { keyQuote: p.title.slice(0, 20) } : {}),
      ...(sourceStart != null && sourceEnd != null ? { sourceStart, sourceEnd } : {}),
    };
  });

  return normalizeRecapScript({
    hook,
    title: (videoTitle || hook).slice(0, 40),
    chapters,
    targetDurationSec,
    engine: 'local',
  });
}