import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminEmail } from '@/lib/server/admin-auth';
import { normalizeNavConfig } from '@/lib/nav-config';
import { getNavConfigView, writeNavConfig } from '@/lib/server/site-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await resolveAdminEmail(request);
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const view = await getNavConfigView();
  return NextResponse.json({ ok: true, ...view });
}

export async function POST(request: NextRequest) {
  const admin = await resolveAdminEmail(request);
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // 容错解析：只保留合法 NavKey，非法输入回落默认配置
  const cfg = normalizeNavConfig({ order: body.order, hidden: body.hidden });

  try {
    await writeNavConfig(cfg, admin);
  } catch (e) {
    return NextResponse.json(
      { error: 'save_failed', detail: e instanceof Error ? e.message.slice(0, 300) : 'unknown' },
      { status: 500 },
    );
  }

  const view = await getNavConfigView();
  return NextResponse.json({ ok: true, ...view });
}
