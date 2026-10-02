import { NextRequest, NextResponse } from 'next/server';
import { getLlmConfig } from '@/lib/server/model-config';
import { openAiChat } from '@/lib/server/llm';
import { resolveAiVideoTemplate } from '@/lib/ai-video-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 数字人口播单次上限（与 dashscope.ts 的 MAX_NARRATION_CHARS 一致，对应音频 <20s）。 */
const MAX_DH_CHARS = 72;

function localTier(locale?: string): 'zh' | 'zh-Hant' | 'en' {
  const l = (locale || '').toLowerCase();
  if (l.startsWith('zh-hant') || l.startsWith('zh-tw') || l.startsWith('zh-hk')) return 'zh-Hant';
  if (l.startsWith('zh')) return 'zh';
  return 'en';
}

/** 无 LLM 时的兜底：把模板本地脚本压成一段 ≤72 字口播（钩子 + 卖点拼接近似）。 */
function localScript(topic: string, locale?: string): string {
  const tpl = resolveAiVideoTemplate('digital-human');
  const tier = localTier(locale);
  const scenes = tpl.local[tier];
  const t = topic.trim() || (tier === 'en' ? 'this' : '这件事');
  // 拼前两拍（钩子+痛点/卖点）再硬截断，保证任何主题都有一段完整可口播的稿
  const merged = scenes
    .slice(0, 2)
    .map((s) => s.narration.replace(/\{topic\}/g, t))
    .join(' ');
  return merged.slice(0, MAX_DH_CHARS);
}

/**
 * 数字人带货 —— 口播稿生成（把一句话主题压成 ≤72 字的带货口播）。
 * 复用管理后台可配的 OpenAI 兼容 LLM 通道；未配置/失败回落模板本地口播。
 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    const topic = String(body.topic || '').trim().slice(0, 300);
    if (!topic) return NextResponse.json({ error: 'topic_required' }, { status: 400 });
    const locale = String(body.locale || 'en');
    const isZh = locale.toLowerCase().startsWith('zh');

    const tpl = resolveAiVideoTemplate('digital-human');
    const llm = await getLlmConfig();
    if (llm) {
      try {
        const raw = await openAiChat({
          baseUrl: llm.baseUrl,
          apiKey: llm.apiKey,
          model: llm.model,
          temperature: 0.7,
          maxTokens: 300,
          timeoutMs: 30_000,
          messages: [
            {
              role: 'system',
              content: [
                `You are a live-commerce scriptwriter. Turn ONE topic into a single-spoken-take talking-head script for a digital human presenter.`,
                `ROLE: ${tpl.persona}`,
                `STRUCTURE (one flowing paragraph, in this order): ${tpl.structure.join('; ')}`,
                isZh
                  ? `用简体中文写作（话题是中文时）/繁體中文（話題是繁體時）。`
                  : `Write in the same language as the topic (default English).`,
                `HARD LIMIT: the script must be at most ${MAX_DH_CHARS} characters including punctuation (spoken audio under 20 seconds). Output ONLY the script text — no quotes, no title, no stage directions, no emojis.`,
              ].join('\n'),
            },
            { role: 'user', content: `Topic: ${topic}` },
          ],
        });
        const script = (raw || '').trim().replace(/^["'「『]+|["'」』]+$/g, '');
        if (script) {
          return NextResponse.json({ script: script.slice(0, MAX_DH_CHARS), engine: 'llm' });
        }
      } catch (e) {
        console.warn('[ai-video/dh-script] llm failed, local fallback:', e instanceof Error ? e.message.slice(0, 160) : e);
      }
    }
    return NextResponse.json({ script: localScript(topic, locale), engine: 'local' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'internal', detail: msg.slice(0, 200) }, { status: 500 });
  }
}
