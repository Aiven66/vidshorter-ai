/**
 * 发布文案生成（v6 路径 B）。
 *
 * 一次调用按「目标平台」产出差异化标题 / 正文 / 话题标签：
 *   - 有 LLM 密钥 → 走 OpenAI 兼容 chat，要求严格 JSON，失败自动回落模板
 *   - 无密钥 / 解析失败 → 确定性模板（绝不编造平台数据，也不会返回空）
 *
 * 纯服务端；不扣积分（一次几百 token，成本可忽略），但要求登录身份。
 */

import { openAiChat } from '@/lib/server/llm';
import { getLlmConfig } from '@/lib/server/model-config';
import { PUBLISH_TARGETS, type SchedulePlatform } from '@/lib/publish-schedule';

export interface CopyInput {
  title: string;
  summary?: string;
  duration?: number;
  platform: SchedulePlatform;
  locale: string;
  /** 主打角度：钩子 / 故事 / 干货 */
  angle?: 'hook' | 'story' | 'value';
}

export interface PlatformCopy {
  title: string;
  caption: string;
  hashtags: string[];
  source: 'llm' | 'template';
}

const BASE_HASHTAGS: Record<SchedulePlatform, string[]> = {
  youtube: ['#shorts', '#highlights'],
  tiktok: ['#fyp', '#foryou', '#shorts'],
  instagram: ['#reels', '#reelsinstagram', '#explore'],
  linkedin: ['#video', '#contentmarketing'],
};

const ANGLE_HINT: Record<string, { zh: string; en: string }> = {
  hook: {
    zh: '前 3 秒必须有强钩子，第一句就让观众停下来',
    en: 'The first 3 seconds must hook hard; the opening line should stop the scroll',
  },
  story: {
    zh: '用故事线推进，制造一个小悬念再收尾',
    en: 'Tell it as a short story with a small open loop that pays off',
  },
  value: {
    zh: '突出可带走的干货/结论，让人想收藏',
    en: 'Lead with a takeaway worth saving',
  },
};

function clamp(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function buildTemplate(input: CopyInput): PlatformCopy {
  const target = PUBLISH_TARGETS[input.platform];
  const zh = input.locale === 'zh';
  const baseTitle = clamp(input.title || (zh ? '高光片段' : 'Highlight clip'), target.titleMax);

  const body = input.summary?.trim()
    ? input.summary.trim()
    : zh
      ? `这条 ${Math.max(1, Math.round(input.duration || 0))} 秒片段把最关键的瞬间剪了出来。`
      : `The key moment of this video, cut into ${Math.max(1, Math.round(input.duration || 0))} seconds.`;

  const cta = zh ? '看完告诉我你的看法👇' : 'Tell me what you think 👇';
  const caption = clamp(`${body}\n\n${cta}`, target.captionMax);

  const hashtags = [...BASE_HASHTAGS[input.platform], '#clipop'].slice(0, target.hashtagCount);
  return { title: baseTitle, caption, hashtags, source: 'template' };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 生成一份平台文案；任何失败都回落模板，不向调用方抛错。 */
export async function generatePlatformCopy(input: CopyInput): Promise<PlatformCopy> {
  const template = buildTemplate(input);

  let llm: Awaited<ReturnType<typeof getLlmConfig>> = null;
  try {
    llm = await getLlmConfig();
  } catch {
    llm = null;
  }
  if (!llm) return template;

  const target = PUBLISH_TARGETS[input.platform];
  const zh = input.locale === 'zh';
  const angle = ANGLE_HINT[input.angle || 'hook'] ?? ANGLE_HINT.hook;

  const system = zh
    ? '你是资深短视频运营，擅长为同一条素材写出各平台原生风格的标题与文案。只输出 JSON，不要解释。'
    : 'You are a senior short-video growth operator. Write native-feeling titles and captions per platform. Output JSON only.';

  const user = zh
    ? `目标平台：${target.label}
片段标题：${input.title}
片段内容摘要：${input.summary || '（无）'}
时长：${Math.round(input.duration || 0)} 秒
写作要求：${angle.zh}；标题不超过 ${target.titleMax} 字；正文不超过 ${target.captionMax} 字；给 ${target.hashtagCount} 个话题标签（以 # 开头，贴合内容而非堆砌）。
输出格式：{"title":"...","caption":"...","hashtags":["#..."]}`
    : `Target platform: ${target.label}
Clip title: ${input.title}
Clip summary: ${input.summary || '(none)'}
Duration: ${Math.round(input.duration || 0)}s
Requirements: ${angle.en}; title <= ${target.titleMax} chars; caption <= ${target.captionMax} chars; exactly ${target.hashtagCount} hashtags starting with #, specific to the content.
Output format: {"title":"...","caption":"...","hashtags":["#..."]}`;

  try {
    const raw = await openAiChat({
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.8,
      maxTokens: 700,
      timeoutMs: 30_000,
    });

    const obj = parseJsonObject(raw);
    if (!obj) return template;

    const title = clamp(typeof obj.title === 'string' ? obj.title : '', target.titleMax);
    const caption = clamp(typeof obj.caption === 'string' ? obj.caption : '', target.captionMax);
    const hashtags = Array.isArray(obj.hashtags)
      ? obj.hashtags
          .map((h) => (typeof h === 'string' ? h.trim() : ''))
          .filter(Boolean)
          .slice(0, 8)
          .map((h) => (h.startsWith('#') ? h : `#${h}`))
      : [];

    if (!title || !caption) return template;
    return {
      title,
      caption,
      hashtags: hashtags.length > 0 ? hashtags : template.hashtags,
      source: 'llm',
    };
  } catch {
    return template;
  }
}
