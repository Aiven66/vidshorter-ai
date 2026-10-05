/**
 * TikTok 视频「结构拆解」——用 LLM 把一条 TikTok 视频拆成可复用的创作要素。
 *
 * 设计要点（对齐 ai-video/script.ts 的范式）：
 *  - 输入只有官方 oEmbed 的元数据（标题 / 作者），**不分析视频画面、不做语音转写**：
 *    服务端没有任何 TikTok 媒体文件，这是合规红线决定的。
 *  - 输出严格 JSON，供前端展示 + 作为「二创选题」预填进既有 /api/ai-video 管线。
 *  - LLM 未配置 / 调用失败 / 解析不合法 → 回落本地结构模版（engine='local'），
 *    保证「零密钥」场景下端到端永远可用，页面不会空转。
 */

import { AI_VIDEO_MAX_TOPIC_CHARS } from '../../ai-video';
import { AI_VIDEO_TEMPLATES, isAiVideoTemplateId, type AiVideoTemplateId } from '../../ai-video-templates';
import { getLlmConfig } from '../model-config';
import { openAiChat } from '../llm';

export type TikTokBreakdownEngine = 'llm' | 'local';

export interface TikTokBreakdown {
  /** 由该视频派生出的、可直接用于生成原创成片的选题 */
  derivedTopic: string;
  hook: { type: string; text: string; why: string };
  structure: Array<{ beat: string; role: string }>;
  emotionCurve: Array<{ phase: string; level: number }>;
  remixAngles: Array<{ angle: string; templateId: AiVideoTemplateId; rationale: string }>;
  searchKeywords: string[];
}

export interface TikTokBreakdownResult {
  breakdown: TikTokBreakdown;
  engine: TikTokBreakdownEngine;
}

type LangTier = 'zh' | 'zh-Hant' | 'en';

function langTier(locale?: string): LangTier {
  const l = (locale || '').toLowerCase();
  if (l.startsWith('zh-hant') || l.startsWith('zh-tw') || l.startsWith('zh-hk')) return 'zh-Hant';
  if (l.startsWith('zh')) return 'zh';
  return 'en';
}

/** 可选模版白名单：排除 digital-human（它走 /api/digital-human，不进 /api/ai-video 渲染管线）。 */
const REMIX_TEMPLATE_IDS: AiVideoTemplateId[] = AI_VIDEO_TEMPLATES.map((t) => t.id).filter(
  (id) => id !== 'digital-human',
);

function isRemixTemplateId(id: unknown): id is AiVideoTemplateId {
  return isAiVideoTemplateId(id) && id !== 'digital-human';
}

/** 稳定哈希：让同一条视频的本地兜底结果可复现（不随请求变化）。 */
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const LOCAL_COPY: Record<
  LangTier,
  {
    fallbackTopic: string;
    hookType: string;
    hookText: (t: string) => string;
    hookWhy: string;
    structure: Array<{ beat: string; role: string }>;
    emotion: Array<{ phase: string; level: number }>;
    angleRationale: string;
    angleLead: string;
    keywords: (t: string) => string[];
  }
> = {
  zh: {
    fallbackTopic: '短视频爆款选题',
    hookType: '痛点反问',
    hookText: (t) => `为什么你做的「${t}」总是没人看完？`,
    hookWhy: '前 3 秒用反问把观众的自身经验拉进来，制造「这说的就是我」的代入感。',
    structure: [
      { beat: '抛出痛点', role: '让目标观众在 3 秒内确认「这是给我看的」' },
      { beat: '反常识观点', role: '打破预期，制造继续看下去的理由' },
      { beat: '拆解机制', role: '用大白话讲清为什么，建立可信度' },
      { beat: '给最小行动', role: '给一个今天就能做的具体动作' },
      { beat: '金句收尾', role: '用一句可被记住、可被转发的话收束' },
    ],
    emotion: [
      { phase: '开场', level: 40 },
      { phase: '反转', level: 75 },
      { phase: '论证', level: 60 },
      { phase: '收尾', level: 90 },
    ],
    angleRationale: '该模版的语气人设与这条视频的调性接近，二创后仍然「像自己说的」。',
    angleLead: '把这条视频的选题改写成',
    keywords: (t) => [`${t} 选题拆解`, `${t} 视频二创`, 'TikTok 视频拆解', '前3秒钩子分析'],
  },
  'zh-Hant': {
    fallbackTopic: '短影音爆款選題',
    hookType: '痛點反問',
    hookText: (t) => `為什麼你做的「${t}」總是沒人看完？`,
    hookWhy: '前 3 秒用反問把觀眾的自身經驗拉進來，製造「這說的就是我」的代入感。',
    structure: [
      { beat: '拋出痛點', role: '讓目標觀眾在 3 秒內確認「這是給我看的」' },
      { beat: '反常識觀點', role: '打破預期，製造繼續看下去的理由' },
      { beat: '拆解機制', role: '用大白話講清為什麼，建立可信度' },
      { beat: '給最小行動', role: '給一個今天就能做的具體動作' },
      { beat: '金句收尾', role: '用一句可被記住、可被轉傳的話收束' },
    ],
    emotion: [
      { phase: '開場', level: 40 },
      { phase: '反轉', level: 75 },
      { phase: '論證', level: 60 },
      { phase: '收尾', level: 90 },
    ],
    angleRationale: '該模版的語氣人設與這條影片的調性接近，二創後仍然「像自己說的」。',
    angleLead: '把這條影片的選題改寫成',
    keywords: (t) => [`${t} 選題拆解`, `${t} 影片二創`, 'TikTok 影片拆解', '前3秒鉤子分析'],
  },
  en: {
    fallbackTopic: 'A high-retention short video idea',
    hookType: 'Pain-point question',
    hookText: (t) => `Why does your "${t}" never get watched to the end?`,
    hookWhy:
      'A question in the first 3 seconds pulls the viewer\'s own experience in and creates an "this is about me" effect.',
    structure: [
      { beat: 'Call out the pain', role: 'Make the target viewer confirm in 3s that this is for them' },
      { beat: 'Counter-intuitive point', role: 'Break the expectation and earn the next 10 seconds' },
      { beat: 'Explain the mechanism', role: 'Say WHY in plain words to build trust' },
      { beat: 'One minimum action', role: 'Give one concrete step they can do today' },
      { beat: 'Memorable close', role: 'End on a line worth remembering and reposting' },
    ],
    emotion: [
      { phase: 'Opening', level: 40 },
      { phase: 'Turn', level: 75 },
      { phase: 'Argument', level: 60 },
      { phase: 'Close', level: 90 },
    ],
    angleRationale: 'This template\'s persona matches the tone of the source video, so the remake still sounds like you.',
    angleLead: 'Rewrite this video\'s topic as',
    keywords: (t) => [`${t} idea breakdown`, `${t} video remake`, 'tiktok hook analyzer', 'tiktok script breakdown'],
  },
};

/** 本地结构模版兜底：无需任何模型密钥，结果可复现。 */
export function buildLocalBreakdown(params: {
  title?: string;
  author?: string;
  topicHint?: string;
  locale?: string;
}): TikTokBreakdown {
  const tier = langTier(params.locale);
  const copy = LOCAL_COPY[tier];
  const raw = (params.topicHint || params.title || '').trim();
  const derivedTopic = raw ? raw.slice(0, AI_VIDEO_MAX_TOPIC_CHARS) : copy.fallbackTopic;

  const seed = stableHash(`${derivedTopic}|${params.author || ''}`);
  // 轮转取 3 个模版，保证同一条视频给出稳定且多样的建议
  const picked = [0, 1, 2].map((i) => REMIX_TEMPLATE_IDS[(seed + i * 3) % REMIX_TEMPLATE_IDS.length]);

  return {
    derivedTopic,
    hook: { type: copy.hookType, text: copy.hookText(derivedTopic), why: copy.hookWhy },
    structure: copy.structure,
    emotionCurve: copy.emotion,
    remixAngles: Array.from(new Set(picked)).map((templateId) => ({
      angle: `${copy.angleLead}「${derivedTopic}」`,
      templateId,
      rationale: copy.angleRationale,
    })),
    searchKeywords: copy.keywords(derivedTopic),
  };
}

function clampStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function clampLevel(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** 校验并归一化 LLM 输出；结构不合法返回 null（由调用方回落本地模版）。 */
export function normalizeTikTokBreakdown(data: unknown, fallbackTopic: string): TikTokBreakdown | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  const derivedTopic = clampStr(d.derivedTopic, AI_VIDEO_MAX_TOPIC_CHARS) || fallbackTopic;
  if (!derivedTopic) return null;

  const hookRaw = (d.hook || {}) as Record<string, unknown>;
  const hookText = clampStr(hookRaw.text, 200);
  if (!hookText) return null;
  const hook = {
    type: clampStr(hookRaw.type, 60) || 'Hook',
    text: hookText,
    why: clampStr(hookRaw.why, 300),
  };

  const structure = Array.isArray(d.structure)
    ? d.structure
        .map((s) => {
          const r = (s || {}) as Record<string, unknown>;
          return { beat: clampStr(r.beat, 80), role: clampStr(r.role, 160) };
        })
        .filter((s) => s.beat)
        .slice(0, 8)
    : [];
  if (!structure.length) return null;

  const emotionCurve = Array.isArray(d.emotionCurve)
    ? d.emotionCurve
        .map((s) => {
          const r = (s || {}) as Record<string, unknown>;
          return { phase: clampStr(r.phase, 40), level: clampLevel(r.level) };
        })
        .filter((s) => s.phase)
        .slice(0, 8)
    : [];

  // 模版必须落在白名单内（服务端绝不采信模型给的任意字符串）
  const remixAngles = Array.isArray(d.remixAngles)
    ? d.remixAngles
        .map((s) => {
          const r = (s || {}) as Record<string, unknown>;
          const templateId = isRemixTemplateId(r.templateId) ? r.templateId : null;
          if (!templateId) return null;
          return {
            angle: clampStr(r.angle, 160),
            templateId,
            rationale: clampStr(r.rationale, 240),
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null && Boolean(s.angle))
        .slice(0, 4)
    : [];

  const searchKeywords = Array.isArray(d.searchKeywords)
    ? d.searchKeywords.map((k) => clampStr(k, 60)).filter(Boolean).slice(0, 8)
    : [];

  return { derivedTopic, hook, structure, emotionCurve, remixAngles, searchKeywords };
}

function parseJsonLoose(raw: string): unknown {
  if (!raw || typeof raw !== 'string') return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) text = fence[1].trim();
  const open = text.indexOf('{');
  const close = text.lastIndexOf('}');
  if (open === -1 || close <= open) return null;
  try {
    return JSON.parse(text.slice(open, close + 1));
  } catch {
    return null;
  }
}

/**
 * 拆解一条 TikTok 视频的创作结构。
 * LLM 未配置 / 失败 / 输出不合法 → 回落本地结构模版（engine='local'）。
 */
export async function generateTikTokBreakdown(params: {
  title?: string;
  author?: string;
  topicHint?: string;
  locale?: string;
}): Promise<TikTokBreakdownResult> {
  const tier = langTier(params.locale);
  const fallbackTopic = (params.topicHint || params.title || '').trim().slice(0, AI_VIDEO_MAX_TOPIC_CHARS);
  const fallback = () => ({
    breakdown: buildLocalBreakdown(params),
    engine: 'local' as const,
  });

  const llm = await getLlmConfig();
  if (!llm) return fallback();

  const langRule =
    tier === 'zh'
      ? '用简体中文输出所有文本字段。'
      : tier === 'zh-Hant'
        ? '用繁體中文輸出所有文本欄位。'
        : 'Write all text fields in English.';

  const templateMenu = REMIX_TEMPLATE_IDS.map((id) => {
    const t = AI_VIDEO_TEMPLATES.find((x) => x.id === id)!;
    return `- ${id}: ${t.persona}`;
  }).join('\n');

  const prompt = [
    'You are a short-video strategist for Clipop AI. You are given ONLY the public metadata of a TikTok video (its caption/title and author). You have NOT seen the video itself.',
    'Deconstruct it into reusable creative elements, then propose how a creator could make their OWN ORIGINAL video inspired by it. Never suggest copying or re-uploading the original.',
    langRule,
    '',
    'Available templates (you MUST pick templateId only from this list):',
    templateMenu,
    '',
    'Rules:',
    `- derivedTopic: rewrite the video's subject into a standalone topic a creator can build on, max ${AI_VIDEO_MAX_TOPIC_CHARS} characters.`,
    '- hook: the first-3-seconds hook. type = the hook archetype, text = the actual opening line, why = why it works.',
    '- structure: 3-6 beats in order, each with a short "beat" name and its "role" in retention.',
    '- emotionCurve: 3-6 phases in order, each with a phase name and an intensity level 0-100.',
    '- remixAngles: 2-4 original remix directions, each with angle (what to make), templateId (from the list above), rationale.',
    '- searchKeywords: 3-6 short keywords/search phrases a creator would search for.',
    '- Do not reproduce the original caption verbatim. Do not include emoji, markdown or commentary.',
    'Reply with ONLY valid JSON in exactly this shape:',
    '{"derivedTopic":"...","hook":{"type":"...","text":"...","why":"..."},"structure":[{"beat":"...","role":"..."}],"emotionCurve":[{"phase":"...","level":50}],"remixAngles":[{"angle":"...","templateId":"growth","rationale":"..."}],"searchKeywords":["..."]}',
    '',
    `SOURCE VIDEO TITLE: ${params.title || '(unavailable)'}`,
    `SOURCE AUTHOR: ${params.author || '(unknown)'}`,
    params.topicHint ? `CREATOR'S OWN TOPIC HINT: ${params.topicHint}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const content = await openAiChat({
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      maxTokens: 1200,
      timeoutMs: 45_000,
    });
    const parsed = normalizeTikTokBreakdown(parseJsonLoose(content), fallbackTopic);
    if (parsed) {
      console.log(`[tiktok/breakdown] llm=${llm.provider} model=${llm.model} angles=${parsed.remixAngles.length}`);
      return { breakdown: parsed, engine: 'llm' };
    }
    console.warn('[tiktok/breakdown] LLM output not usable, falling back to local template');
  } catch (e) {
    console.warn('[tiktok/breakdown] LLM failed:', e instanceof Error ? e.message.slice(0, 200) : e);
  }

  return fallback();
}