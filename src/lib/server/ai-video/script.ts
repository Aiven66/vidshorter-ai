/**
 * AI 成片 —— 分镜脚本生成（模版化 LLM 提示词 + 模版化本地兜底）。
 *
 * 输入一句话主题 + 一个模版，输出「分镜数组」：每个分镜含画面主标题 + 旁白文案。
 * 设计要点（提示词结构移植自 Pixelle-Video 的 topic_narration 提示词资产）：
 *  - 强语言一致、严格 JSON、纯文本（无 markdown / emoji / 舞台提示）。
 *  - 人设与结构骨架来自模版（见 src/lib/ai-video-templates.ts），因此同一主题在不同
 *    模版下会得到「成长口吻 / 深度思考口吻 / 小说解说口吻」等不同成片。
 *  - 未配置 LLM 或调用/解析失败时，回落到**模版自带的本地脚本**（engine='local'），
 *    保证「零门槛」场景下端到端永远能出片，不会因为缺密钥直接报错。
 */

import {
  AI_VIDEO_MAX_HEADLINE_CHARS,
  AI_VIDEO_MAX_NARRATION_CHARS,
  AI_VIDEO_MAX_SCENES,
  AI_VIDEO_MAX_TOPIC_CHARS,
  AI_VIDEO_MIN_SCENES,
  normalizeAiVideoScript,
  type AiVideoScript,
} from '../../ai-video';
import { resolveAiVideoTemplate, type AiVideoTemplate } from '../../ai-video-templates';
import { getLlmConfig } from '../model-config';
import { openAiChat } from '../llm';

type LangTier = 'zh-Hans' | 'zh-Hant' | 'en';

function langTier(locale?: string): LangTier {
  const l = (locale || '').toLowerCase();
  if (l.startsWith('zh-hant') || l.startsWith('zh-tw') || l.startsWith('zh-hk')) return 'zh-Hant';
  if (l.startsWith('zh')) return 'zh-Hans';
  return 'en';
}

/** 本地兜底脚本的语言分桶键（与模版 local 字段一致）。 */
function localTier(locale?: string): 'zh' | 'zh-Hant' | 'en' {
  const tier = langTier(locale);
  if (tier === 'zh-Hans') return 'zh';
  return tier;
}

/** 语言指令：旁白必须使用用户当前界面语言（项目硬约束：文案语言与 UI locale 一致）。 */
function langInstruction(tier: LangTier): string {
  switch (tier) {
    case 'zh-Hans':
      return '用简体中文写作。';
    case 'zh-Hant':
      return '用繁體中文寫作。';
    default:
      return 'Write in the same language as the user\'s topic (default English).';
  }
}

const NARRATION_BUDGET: Record<LangTier, number> = {
  'zh-Hans': 60,
  'zh-Hant': 60,
  en: 150,
};

/**
 * 本地模版兜底脚本——套用该模版自带的「人设 + 结构骨架」文案。
 * 语义偏通用，但保证任何主题都能生成一条结构完整、可播放的成片。
 */
export function buildLocalScript(topic: string, locale?: string, template?: AiVideoTemplate): AiVideoScript {
  const tpl = template || resolveAiVideoTemplate(null);
  const tier = localTier(locale);
  const t = topic.trim().slice(0, AI_VIDEO_MAX_TOPIC_CHARS) || (tier === 'en' ? 'My idea' : '我的想法');

  const scenes = tpl.local[tier].slice(0, AI_VIDEO_MAX_SCENES).map((s) => ({
    headline: s.headline.replace(/\{topic\}/g, t).slice(0, AI_VIDEO_MAX_HEADLINE_CHARS),
    narration: s.narration.replace(/\{topic\}/g, t).slice(0, AI_VIDEO_MAX_NARRATION_CHARS),
  }));

  return { title: t, scenes, engine: 'local' };
}

/** 从模型返回文本中抠出 JSON 并归一化；结构不合法返回 null。 */
export function parseScriptJson(raw: string): AiVideoScript | null {
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
  // engine 由服务端标记，不接受模型自报
  return normalizeAiVideoScript(data, 'llm');
}

/**
 * 用一句话主题 + 一个模版生成分镜脚本。
 * LLM 失败/未配置/解析不合法 → 返回该模版的本地脚本（engine='local'），保证永远有片可出。
 */
export async function generateAiVideoScript(params: {
  topic: string;
  locale?: string;
  templateId?: string | null;
}): Promise<AiVideoScript> {
  const topic = params.topic.trim().slice(0, AI_VIDEO_MAX_TOPIC_CHARS);
  const template = resolveAiVideoTemplate(params.templateId);
  const fallback = () => buildLocalScript(topic, params.locale, template);
  if (!topic) return fallback();

  const llm = await getLlmConfig();
  if (!llm) return fallback();

  const tier = langTier(params.locale);
  const narrationBudget = NARRATION_BUDGET[tier];
  const prompt = [
    'You are a short-video scriptwriter for Clipop AI. Turn ONE topic into a vertical (9:16) short video storyboard.',
    `Write exactly ${AI_VIDEO_MIN_SCENES}-${AI_VIDEO_MAX_SCENES} scenes.`,
    langInstruction(tier),
    '',
    `ROLE AND TONE: ${template.persona}`,
    'NARRATIVE STRUCTURE (follow this order strictly, one scene per beat):',
    ...template.structure.map((s, i) => `${i + 1}. ${s}`),
    '',
    'Rules:',
    '- Each scene has a short on-screen "headline" (a punchy title, no punctuation-heavy sentences) and a "narration" (spoken voiceover, conversational, no stage directions, no emoji, no markdown).',
    `- headline: max ${AI_VIDEO_MAX_HEADLINE_CHARS} characters. narration: max ${narrationBudget} characters.`,
    '- Do not start two scenes with the same opening word or phrase.',
    '- Do not end narration sentences with punctuation marks.',
    '- Do not use numbers like "Scene 1" inside the text.',
    'Reply with ONLY valid JSON, no commentary, in this exact shape:',
    '{"title":"...","scenes":[{"headline":"...","narration":"..."}]}',
    '',
    `TOPIC: ${topic}`,
  ].join('\n');

  try {
    const content = await openAiChat({
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 1400,
      timeoutMs: 60_000,
    });
    const parsed = parseScriptJson(content);
    if (parsed) {
      console.log(`[ai-video/script] llm=${llm.provider} model=${llm.model} scenes=${parsed.scenes.length}`);
      return parsed;
    }
    console.warn('[ai-video/script] LLM output not usable, falling back to local template');
  } catch (e) {
    console.warn('[ai-video/script] LLM failed:', e instanceof Error ? e.message.slice(0, 200) : e);
  }

  return fallback();
}