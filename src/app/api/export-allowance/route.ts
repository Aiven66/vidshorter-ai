import { NextRequest, NextResponse } from 'next/server';
import { resolveBearerUserId } from '@/lib/server/plan-gate';
import { resolveEffectivePlan } from '@/lib/server/effective-plan';
import { getFreeExportStatus, consumeFreeExport } from '@/lib/server/export-allowance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/export-allowance
 *
 * 返回当前登录用户的「一次性免费导出额度」状态，供前端决定是否放宽免费用户导出。
 *  - 未登录 → 401（前端静默按无额度处理）
 *  - 已付费 → { paid:true, available:false, used:true }（付费用户不受一次性额度约束）
 *  - 免费   → { paid:false, available, used }（查询失败时 assert fail-closed，available=false）
 */
export async function GET(request: NextRequest) {
  const userId = await resolveBearerUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const entitlement = await resolveEffectivePlan(userId);
  if (entitlement.paid) {
    return NextResponse.json({ ok: true, paid: true, available: false, used: true });
  }

  const s = await getFreeExportStatus(userId);
  return NextResponse.json({ ok: true, paid: false, available: s.available, used: s.used });
}

/**
 * POST /api/export-allowance
 *
 * 直接消费当前用户的一次性免费导出额度。
 *
 * 用途：本地上传片段的下载不经任何服务端导出端点（纯前端 blob 下载），
 * 无法在服务端「成功出口」落库消费。前端下载成功后调用本端点补记，
 * 避免免费用户重复下载本地片段绕过「仅一次」限制。
 *
 *  - 未登录 → 401
 *  - 已付费 → consumed:false（付费用户不占用一次性额度）
 *  - 免费   → consumeFreeExport 幂等落库；已用返回 consumed:false
 */
export async function POST(request: NextRequest) {
  const userId = await resolveBearerUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const entitlement = await resolveEffectivePlan(userId);
  if (entitlement.paid) {
    return NextResponse.json({ ok: true, paid: true, consumed: false });
  }

  const consumed = await consumeFreeExport(userId, { endpoint: '/api/export-allowance' });
  return NextResponse.json({ ok: true, paid: false, consumed });
}
