import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { refundIfCharged, CREDIT_COST } from '@/lib/server/video-refund';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * P0-4 幂等退积分端点。
 *
 * 桌面端本地下载 / 本地处理失败时上报 videoId，服务端复用 refundIfCharged 做一次
 * 幂等退款（按 related_id=videoId 去重，未实际扣费则空操作）。身份只来自 Supabase
 * Auth 的 bearer token，绝不接受前端传入的 userId。
 */
function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
  if (!videoId) return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });

  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearerToken) {
    return NextResponse.json({ error: 'Please sign in again (your session expired).', code: 'auth_expired' }, { status: 401 });
  }

  const admin = serviceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  // 身份只来自 Supabase Auth。
  let userId = '';
  try {
    const userClient = getSupabaseClient(bearerToken);
    const { data: { user: authUser }, error: authErr } = await userClient.auth.getUser();
    if (!authErr && authUser?.id) userId = authUser.id;
  } catch {
    userId = '';
  }
  if (!userId) {
    return NextResponse.json({ error: 'Please sign in again (your session expired).', code: 'auth_expired' }, { status: 401 });
  }

  // 校验视频归属，防越权触发他人退款。
  const { data: video } = await admin
    .from('videos')
    .select('id,user_id')
    .eq('id', videoId)
    .maybeSingle();
  if (!video || video.user_id !== userId) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  try {
    await refundIfCharged(admin, userId, videoId);
  } catch (e) {
    console.error('[videos/refund] refund failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Refund failed' }, { status: 500 });
  }

  const { data: refundRow } = await admin
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'refund')
    .eq('related_id', videoId)
    .limit(1);
  const refunded = !!(refundRow && refundRow.length > 0);

  return NextResponse.json({ refunded, credits: refunded ? CREDIT_COST : 0, videoId });
}
