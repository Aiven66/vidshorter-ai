import { buildAiSummary } from '@/lib/geo-content';

export const revalidate = 3600;

/** /ai/summary.json —— 机器可读的品牌与产品摘要。 */
export function GET() {
  return Response.json(buildAiSummary(), {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
