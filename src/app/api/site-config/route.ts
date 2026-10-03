import { NextResponse } from 'next/server';
import { readNavConfig } from '@/lib/server/site-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 公开接口：前台读取导航配置以渲染左侧菜单。
 * 无鉴权；带 60s CDN 缓存，保证「保存后最多 60 秒」在前台生效。
 */
export async function GET() {
  const nav = await readNavConfig();
  return NextResponse.json(
    { ok: true, nav },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    },
  );
}
