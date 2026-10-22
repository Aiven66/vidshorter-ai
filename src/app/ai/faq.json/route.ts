import { BRAND, EXTENDED_FAQS } from '@/lib/geo-content';

export const revalidate = 3600;

/** /ai/faq.json —— 与 /faq 页面正文一致的问答数据。 */
export function GET() {
  return Response.json(
    {
      name: BRAND.name,
      url: BRAND.url,
      updated: '2026-10-22',
      faqs: EXTENDED_FAQS.map((item) => ({
        question: item.question,
        answer: item.answer,
      })),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    },
  );
}
