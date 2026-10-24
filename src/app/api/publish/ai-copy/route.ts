/**
 * /api/publish/ai-copy —— 按目标平台生成标题 / 正文 / 话题标签。
 *
 * 鉴权：必须登录（只认服务端可核验的 token）。一次请求只生成一个平台版本，
 * 前端并行请求 4 个平台即可拿到整套差异化文案。
 *
 * 无 LLM 密钥时服务端会回落确定性模板（source='template'），前端据此提示。
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveBearerUserId } from '@/lib/server/plan-gate';
import { generatePlatformCopy } from '@/lib/server/publish-copy';
import { isSchedulePlatform } from '@/lib/publish-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = await resolveBearerUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'title is required.' }, { status: 400 });
  }
  if (!isSchedulePlatform(body.platform)) {
    return NextResponse.json({ error: 'platform is invalid.' }, { status: 400 });
  }

  const duration = Number(body.duration);
  const angle = body.angle === 'story' || body.angle === 'value' ? body.angle : 'hook';

  const copy = await generatePlatformCopy({
    title: title.slice(0, 200),
    summary: typeof body.summary === 'string' ? body.summary.slice(0, 1000) : undefined,
    duration: Number.isFinite(duration) ? duration : undefined,
    platform: body.platform,
    locale: body.locale === 'zh' ? 'zh' : 'en',
    angle,
  });

  return NextResponse.json({ ok: true, copy });
}
