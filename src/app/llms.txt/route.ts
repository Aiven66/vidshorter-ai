import { BRAND, CORE_PAGES, PRODUCT_SPECS, CORE_FAQS } from '@/lib/geo-content';

export const revalidate = 86400;

/**
 * /llms.txt —— 面向大模型与 AI 搜索的站点说明文件（llmstxt.org 约定）。
 * 与 /ai/summary.json、/ai/faq.json、/faq 共用 src/lib/geo-content.ts 的事实源。
 */
function buildLlmsTxt(): string {
  const lines: string[] = [];

  lines.push(`# ${BRAND.name}`);
  lines.push('');
  lines.push(`> ${BRAND.description}`);
  lines.push('');
  lines.push(`${BRAND.name} is an AI video clipping platform for ${BRAND.audience.join(', ')}.`);
  lines.push('');

  lines.push('## Core facts');
  lines.push('');
  lines.push(`- Website: ${BRAND.url}`);
  lines.push(`- Category: ${BRAND.category}`);
  lines.push('- Inputs: YouTube and Bilibili links, public video links, local MP4 / MOV / AVI uploads');
  lines.push('- Output: 9:16 vertical MP4 with burned-in AI captions');
  lines.push('- Clip length: about 20–65 seconds, adapted to the source video length');
  lines.push('- Pricing: Free $0 (180 credits on signup, then 60/day with a 600/month cap) · Starter $9.9/month (6,000 credits) · Pro $19.9/month (20,000 credits)');
  lines.push('- Credit cost: 60 credits per clip');
  lines.push('- Export quality: 720p free with watermark · 1080p Starter without watermark · up to 4K Pro');
  lines.push('- Interface languages: 32');
  lines.push('- Platforms: Web, macOS, Windows, Android');
  lines.push('');

  lines.push('## Product specifications');
  lines.push('');
  for (const spec of PRODUCT_SPECS) {
    lines.push(`- ${spec.label}: ${spec.value}`);
  }
  lines.push('');

  lines.push('## Core pages');
  lines.push('');
  for (const page of CORE_PAGES) {
    lines.push(`- [${page.title}](${BRAND.url}${page.path === '/' ? '' : page.path}): ${page.description}`);
  }
  lines.push('');

  lines.push('## Frequently asked questions');
  lines.push('');
  for (const faq of CORE_FAQS) {
    lines.push(`### ${faq.question}`);
    lines.push('');
    lines.push(faq.answer);
    lines.push('');
  }

  lines.push('## Trust and transparency');
  lines.push('');
  lines.push(`- About: ${BRAND.url}/about`);
  lines.push(`- Terms of Service: ${BRAND.url}/terms`);
  lines.push(`- Privacy Policy: ${BRAND.url}/privacy`);
  lines.push(`- Contact: ${BRAND.url}/contact`);
  lines.push(`- Support email: ${BRAND.supportEmail}`);
  lines.push('');

  lines.push('## Machine-readable endpoints');
  lines.push('');
  lines.push(`- Brand summary JSON: ${BRAND.url}/ai/summary.json`);
  lines.push(`- FAQ JSON: ${BRAND.url}/ai/faq.json`);
  lines.push(`- Sitemap: ${BRAND.url}/sitemap.xml`);
  lines.push(`- RSS feed: ${BRAND.url}/rss.xml`);
  lines.push('');

  lines.push(`Last updated: 2026-10-22`);
  lines.push('');

  return lines.join('\n');
}

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
