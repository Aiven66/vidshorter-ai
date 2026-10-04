import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Force dynamic — 防止 Next.js 在构建期静态化该路由。
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 新用户注册赠送积分（与前端注册流程保持一致）。 */
const SIGNUP_BALANCE = 60;

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_TOKEN ||
    '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** 取请求里的 access token：优先 Authorization: Bearer，其次 clipop_access_token cookie。 */
function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer) return bearer;
  return request.cookies.get('clipop_access_token')?.value?.trim() || '';
}

/**
 * 服务端兜底建档：以 Supabase Auth 为唯一身份来源，用 service role 幂等补齐
 * public.users / credits / subscriptions 三张表。
 *
 * 背景：档案行原先完全依赖前端用 anon key 写入且被空 catch 静默吞错，一旦
 * RLS/网络/时序失败，该用户就永远不出现在后台「用户管理」中。此接口不受
 * 前端 RLS 影响，是「注册/登录成功即可见」的可靠保障。
 *
 * 幂等性：只补建缺失的行，绝不覆盖已有余额或订阅状态。
 */
export async function POST(request: NextRequest) {
  const token = extractToken(request);
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = serviceRoleClient();
  if (!admin) {
    // 缺少 service role key：明确告知调用方"无法兜底"，前端据此回落到客户端写入路径。
    return Response.json({ error: 'Server not configured' }, { status: 503 });
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const authUser = authData?.user;
  if (authError || !authUser?.id) {
    console.warn('[ensure-profile] token 校验失败:', authError?.message || 'no user');
    return Response.json({ error: 'Invalid session' }, { status: 401 });
  }

  const userId = authUser.id;
  const email = (authUser.email || '').trim().toLowerCase();
  if (!email) {
    return Response.json({ error: 'Auth user has no email' }, { status: 400 });
  }

  const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
  const provider =
    typeof authUser.app_metadata?.provider === 'string' ? authUser.app_metadata.provider : 'email';
  const name =
    (typeof meta.name === 'string' && meta.name) ||
    (typeof meta.full_name === 'string' && meta.full_name) ||
    email.split('@')[0];
  const avatarUrl = typeof meta.avatar_url === 'string' ? meta.avatar_url : null;
  const googleId = provider === 'google' ? userId : null;

  const created = { user: false, credits: false, subscription: false };

  // 1) users 档案行 —— 后台「用户管理」直接读这张表，是本次兜底的核心。
  const { data: existingUser, error: selectUserError } = await admin
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (selectUserError) {
    console.error('[ensure-profile] 查询 users 失败:', selectUserError.message);
    return Response.json({ error: 'Failed to read user profile' }, { status: 500 });
  }

  if (!existingUser) {
    const { error: insertUserError } = await admin.from('users').insert({
      id: userId,
      email,
      name,
      role: 'user',
      google_id: googleId,
      avatar_url: avatarUrl,
    });

    if (!insertUserError) {
      created.user = true;
    } else if (insertUserError.code === '23505') {
      // 唯一约束冲突：同 email 已存在档案行（历史数据 id 不一致）。
      // 后台已能看到该邮箱，视为已存在，不重复写入。
      console.warn(`[ensure-profile] users 唯一约束冲突，按已存在处理: ${email}`);
    } else {
      console.error('[ensure-profile] 写入 users 失败:', insertUserError.message);
      return Response.json({ error: 'Failed to create user profile' }, { status: 500 });
    }
  }

  // 2) credits 行（仅补建，绝不覆盖已有余额）
  const { data: existingCredits } = await admin
    .from('credits')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existingCredits) {
    const { error: creditsError } = await admin
      .from('credits')
      .insert({ user_id: userId, balance: SIGNUP_BALANCE });
    if (!creditsError) {
      created.credits = true;
    } else if (creditsError.code !== '23505') {
      console.error('[ensure-profile] 写入 credits 失败:', creditsError.message);
    }
  }

  // 3) subscriptions 行（仅补建 free/active）
  const { data: existingSub } = await admin
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existingSub) {
    const { error: subError } = await admin
      .from('subscriptions')
      .insert({ user_id: userId, plan_type: 'free', status: 'active' });
    if (!subError) {
      created.subscription = true;
    } else {
      console.error('[ensure-profile] 写入 subscriptions 失败:', subError.message);
    }
  }

  return Response.json({ ok: true, userId, created });
}
