import type { MetadataRoute } from 'next';

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.clipopai.com').replace(/\/$/, '');

/** 主流 AI 助手/检索爬虫（GEO 报告中 E2 生态集成的可执行部分）。 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'Amazonbot',
  'DuckAssistBot',
  'meta-externalagent',
  'YouBot',
  'cohere-ai',
  'MistralAI-User',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 注意：绝不能屏蔽 /_next/ —— 否则 Googlebot 无法抓取 JS/CSS，
        // 无法正常渲染页面（本项目大量页面为首屏水合的客户端组件）。
        disallow: [
          '/api/',
          '/dashboard',
          '/admin',
          '/ax',
          '/notes',
          '/batch',
          '/recap',
          '/login',
          '/register',
          '/forgot-password',
          '/auth/',
          '/desktop/',
        ],
      },
      // 明确允许主流 AI 检索/训练爬虫抓取公开内容（GEO：提高被引用概率）。
      // 这些爬虫只需公开页面，因此不复制 disallow 列表。
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/' })),
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}