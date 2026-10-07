import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, resolveBearerUserId } from '@/lib/server/plan-gate';
import { checkIn, claimTaskReward, getRetentionStatus } from '@/lib/server/retention';

/**
 * 留存引擎 API —— 每日创作任务 / 连续签到 / 奖励领取。
 *
 *   GET  /api/retention/daily            → 当日任务与 streak 状态（只读，无副作用）
 *   POST /api/retention/daily {action}   → action='checkin' 签到 | action='claim' 领取奖励
 *
 * 身份：只认服务端可核验的 access token（`Authorization: Bearer` 或 `clipop_access_token`
 * cookie），**绝不接受请求体里的 userId** —— 否则任意用户可刷他人签到与奖励。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 统一取身份：无有效 token → 401（fail-closed）。 */
async function requireUserId(request: NextRequest): Promise<string | null> {
  if (!bearerToken(request)) return null;
  return resolveBearerUserId(request);
}

export async function GET(request: NextRequest) {
  const userId = await requireUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = await getRetentionStatus(userId);
  if (!status) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  return NextResponse.json({ status });
}

export async function POST(request: NextRequest) {
  const userId = await requireUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = String(body.action || '');

  if (action === 'checkin') {
    const res = await checkIn(userId);
    if (!res.ok) {
      return NextResponse.json({ error: 'Check-in failed' }, { status: 500 });
    }
    const status = await getRetentionStatus(userId);
    return NextResponse.json({ ok: true, already: res.already, status });
  }

  if (action === 'claim') {
    const res = await claimTaskReward(userId);
    if (!res.ok) {
      const code = res.reason === 'tasks_incomplete' ? 409 : 500;
      return NextResponse.json({ error: res.reason || 'Claim failed', status: res.status }, { status: code });
    }
    return NextResponse.json({ ok: true, already: res.already === true, credits: res.credits, status: res.status });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
