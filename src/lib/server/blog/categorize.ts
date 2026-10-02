/**
 * 博客自动分类 — 根据文章 HTML 内容用 LLM 提炼一个分类标签。
 *
 * LLM 走 coze-coding-dev-sdk（与视频高光/对话剪辑一致的鉴权与调用方式），
 * 环境变量: COZE_WORKLOAD_IDENTITY_API_KEY / COZE_INTEGRATION_BASE_URL
 *          / COZE_INTEGRATION_MODEL_BASE_URL。
 * 固定一份窄分类库保证归档一致性；LLM 从中挑选最贴切的一个，必要时给简短衍生词。
 */

import { LLMClient, Config } from 'coze-coding-dev-sdk';

/** 推荐分类库 —— 覆盖 Clipop AI 现有内容主题，保证归档一致、便于聚合 */
const TAXONOMY = [
  'AI Video Clipping',
  'AI Tools',
  'Digital Human',
  'AI Avatar',
  'Background Removal',
  'Image Upscaling',
  'Photo Colorization',
  'Watermark Removal',
  'Podcast Editing',
  'Long-Form to Shorts',
  'Content Creation',
  'Video Marketing',
  'Bilibili Video',
  'Product News',
  'Tutorial',
];

/** 把 HTML 压成可判别的纯文本（去标签/脚本/样式，截断到安全长度） */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;|&#39;|&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, 4000);
}

/** 构造（或复用）Coze LLM 客户端；未配置密钥时返回 null 以便优雅降级 */
function createLlmClient(): LLMClient | null {
  const apiKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  if (!apiKey) return null;
  const config = new Config({
    apiKey,
    baseUrl: process.env.COZE_INTEGRATION_BASE_URL,
    modelBaseUrl: process.env.COZE_INTEGRATION_MODEL_BASE_URL,
  });
  return new LLMClient(config, {});
}

/**
 * 本地关键词启发式分类器 —— 生产未配置 Coze LLM 时的可靠兜底。
 * 通过标题+正文匹配关键词，返回最贴切的分类；无法判断时返回 null。
 * LLM 优先，LLM 不可用/失败时由调用方改走此兜底，保证功能端到端可用。
 */
const CATEGORY_KEYWORDS: ReadonlyArray<{ category: string; keywords: string[] }> = [
  {
    category: 'AI Tools',
    keywords: ['ai tool', 'ai toolkit', 'toolbox', 'best ai', 'ai app', 'roadmap', 'get started', 'beginner guide'],
  },
  {
    category: 'Background Removal',
    keywords: ['background remover', 'remove background', 'remove-background', 'background removal', 'transparent', 'cutout', 'white background', 'product photo background', 'bg remover'],
  },
  {
    category: 'Image Upscaling',
    keywords: ['upscale', 'upscaler', 'super resolution', 'super-resolution', 'high resolution image', 'enlarge image', 'restore resolution', '4k image', 'blurry image'],
  },
  {
    category: 'Photo Colorization',
    keywords: ['colorize', 'colorization', 'colourize', 'black and white photo', 'b&w photo', 'color old photo', 'recolor', 'restore color'],
  },
  {
    category: 'Watermark Removal',
    keywords: ['watermark', 'remove logo', 'delete logo', 'remove text overlay', 'logo off', 'unstamp', 'remove captions overlay'],
  },
  {
    category: 'Digital Human',
    keywords: ['digital human', 'ai avatar video', 'ai presenter', 'virtual presenter', 'talking avatar', 'avatar video', 'digital twin'],
  },
  {
    category: 'AI Avatar',
    keywords: ['avatar', 'ai photo', 'profile picture', 'headshot'],
  },
  {
    category: 'Podcast Editing',
    keywords: ['podcast', 'podcast clip', 'podcast short', 'audio clip', 'episode clip', 'podcast marketing'],
  },
  {
    category: 'Long-Form to Shorts',
    keywords: ['long video to short', 'long to short', 'shorts', 'reels', 'tiktok', 'vertical video', 'repurpose', 'clip long video', 'video clips', 'turn long video', 'convert to shorts', 'extract clips', 'highlight clip', 'highlight detection'],
  },
  {
    category: 'Content Creation',
    keywords: ['content creation', 'content creator', 'create content', 'content strategy', 'make videos', 'produce videos'],
  },
  {
    category: 'Video Marketing',
    keywords: ['marketing', 'social media marketing', 'ads', 'advertising', 'sell', 'sales', 'conversion', 'traffic', 'brand', 'agency'],
  },
  {
    category: 'Bilibili Video',
    keywords: ['bilibili', 'b站', 'bili', '中长视频', 'up主'],
  },
  {
    category: 'Product News',
    keywords: ['announcement', 'release', 'launch', 'update', 'news', 'changelog', 'new feature', 'what is'],
  },
  {
    category: 'Tutorial',
    keywords: ['tutorial', 'how to', 'step by step', 'guide', 'walkthrough'],
  },
];

export function heuristicClassifyCategory(title: string, htmlContent: string): string | null {
  const text = htmlToText(htmlContent);
  const haystack = `${title || ''} ${text || ''}`.toLowerCase();
  if (!haystack.trim()) return null;

  let best = null;
  let bestScore = 0;
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    let score = 0;
    for (const kw of keywords) {
      if (haystack.includes(kw)) {
        // 标题中出现权重更高
        score += (title || '').toLowerCase().includes(kw) ? 3 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }
  return bestScore > 0 ? best : null;
}

/**
 * 根据文章 HTML 内容提炼分类标签。
 * LLM 优先；未配置 Coze 或 LLM 调用失败时，回退到本地关键词启发式分类，
 * 保证生产在无外部凭据时功能仍端到端可用。最终无法判断时返回 null。
 */
export async function classifyBlogCategory(
  title: string,
  htmlContent: string
): Promise<string | null> {
  const llm = createLlmClient();

  const text = htmlToText(htmlContent);
  if (!text && !title) return null;

  // LLM 可用时优先走 LLM，失败再回退启发式
  if (llm) {
    const prompt = [
      'You are an expert SEO content classifier for Clipop AI, an AI tool that turns long videos into shorts (YouTube/Bilibili), with an AI toolbox (background removal, upscaling, colorization, watermark removal), digital humans, podcast editing, etc.',
      'Read the article (title + body) below and choose the SINGLE most accurate category.',
      `Allowed categories (pick the closest; only use a short 1-3 word custom label if none fits): ${TAXONOMY.join(', ')}`,
      '',
      `TITLE: ${title || '(untitled)'}`,
      '',
      `BODY: ${text || '(empty)'}`,
      '',
      'Reply with ONLY the category label, no quotes, no explanation.',
    ].join('\n');

    try {
      const resp = await llm.invoke(
        [{ role: 'user', content: prompt }],
        { model: 'doubao-seed-1-8-251228', temperature: 0.2, max_tokens: 16 }
      );
      const raw = (resp?.content || '').trim();
      if (raw) {
        // 去引号/首行/干扰词，归一为单标签
        const label = raw
          .replace(/^["'`]+|["'`]+$/g, '')
          .split('\n')[0]
          .split(',')[0]
          .trim();
        if (label.length > 0 && label.length <= 40) return label;
      }
    } catch (error) {
      console.error('[blog-categorize] LLM failed:', error instanceof Error ? error.message : error);
    }
  }

  // 本地启发式兜底
  return heuristicClassifyCategory(title, htmlContent);
}