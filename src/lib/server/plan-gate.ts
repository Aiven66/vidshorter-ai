import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, getSupabaseClient } from '@/storage/database/supabase-client';
import { BATCH_ERROR_CODES } from '@/lib/video-batch';
import { decideEntitlement, type SubscriptionSnapshot } from '@/lib/server/effective-plan';
import { getFreeExportStatus, consumeFreeExport } from '@/lib/server/export-allowance';

/**
 * 付费门控（Starter+）——全站唯一实现，server-authoritative。
 *
 * 安全模型：
 *  - 只要能取到 access token（Authorization: Bearer 或 clipop_access_token cookie），
 *    **一律以服务端为准**（subscriptions.plan_type / status / users.role），绝不相信前端传来的 clientPlan。
 *  - 完全没有 token 时才回落信任 clientPlan —— 仅用于无 Supabase 的本地/桌面场景。
 *  - 有 token 但无法服务端核验（缺 service role key）→ 拒绝（fail-closed），绝不放行。
 */

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * 取请求里的 access token：优先 `Authorization: Bearer`，其次 `clipop_access_token` cookie。
 *
 * cookie 由 auth-context 登录后写入（Path=/、7 天、SameSite=Lax），同源导出请求会自动携带，
 * 因此无需在各调用点手工塞 header，也能拿到真实用户身份做服务端裁定。
 * 取法与 middleware.ts 保持一致（不额外 decode —— JWT 字符不被 encodeURIComponent 转义）。
 */
export function bearerToken(request: NextRequest): string {
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer) return bearer;
  return request.cookies.get('clipop_access_token')?.value?.trim() || '';
}

/** Bearer token → Supabase auth 用户 id（无 token / 无效 token → null） */
export async function resolveBearerUserId(request: NextRequest): Promise<string | null> {
  const token = bearerToken(request);
  if (!token || !isSupabaseConfigured()) return null;
  try {
    const userClient = getSupabaseClient(token);
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user?.id) return null;
    return user.id;
  } catch (e) {
    console.warn('[plan-gate] bearer resolve failed:', e instanceof Error ? e.message.slice(0, 200) : e);
    return null;
  }
}

export type PaidEligibility = {
  ok: boolean;
  /** 失败时为错误码 */
  reason?: string;
  /** 服务端裁定时解析出的真实用户 id（无 token 回落路径下为 undefined） */
  userId?: string;
  /** 免费用户一次性导出额度命中时为 true（需由成功出口调用 commitFreeExport 落库消费） */
  freeAllowance?: boolean;
};

type Decision =
  | { ok: true; userId?: string; freeAllowance?: boolean }
  | { ok: false; userId?: string };

/** 服务端裁定：token 有效性 + 订阅/角色。任何失败一律 not ok（绝不 fail-open）。 */
async function serverDecision(token: string): Promise<Decision> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    const userClient = getSupabaseClient(token);
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user?.id) return { ok: false };

    const service = serviceRoleClient();
    if (!service) return { ok: false }; // 有 token 却无法核验 → 拒绝

    const [subRes, profileRes] = await Promise.all([
      service.from('subscriptions').select('plan_type, status, current_period_end').eq('user_id', user.id).maybeSingle(),
      service.from('users').select('role').eq('id', user.id).maybeSingle(),
    ]);
    if (profileRes.data?.role === 'admin') return { ok: true, userId: user.id };

    // 生效判定必须同时看 status 与 current_period_end：
    // 只读 plan_type 会让「订阅到期/取消后」的权益永不回收；
    // 而把 status === 'active' 当作放行条件更糟——注册流程给每个用户写的就是
    // { plan_type: 'free', status: 'active' }，等于对所有已登录用户开放付费墙。
    const entitlement = decideEntitlement(subRes.data as SubscriptionSnapshot | null);
    if (entitlement.paid) return { ok: true, userId: user.id };
    // 非付费也回带 userId：供 decide() 进一步核查「一次性免费导出额度」。
    // 注意：此处仅表示订阅未生效，是否放行由 decide() 兜底判定，绝不 fail-open。
    return { ok: false, userId: user.id };
  } catch (e) {
    console.warn('[plan-gate] eligibility error:', e instanceof Error ? e.message.slice(0, 200) : e);
    return { ok: false };
  }
}

/**
 * 请求级 memo：同一请求内只解析/授予一次，避免多次 decide 重复查库，
 * 也保证「一次性免费导出额度」在整条请求链路上只被授予（并在成功时消费）一次。
 * 以 request 对象为 key，随请求生命周期回收。
 */
type RequestGrant = { userId?: string; freeAllowance: boolean; committed?: boolean };
const requestGrant = new WeakMap<object, RequestGrant>();

/**
 * 统一裁定入口。
 *
 *  - Supabase 已配置（云端/生产）→ **必须**持可核验 token，否则直接拒绝：
 *    绝不采信 clientPlan —— 否则未登录或已登录的免费用户改请求体即可绕过付费墙。
 *    （token 由 Authorization 或 clipop_access_token cookie 提供，登录后同源请求自动携带。）
 *    非付费但可解析身份时，再核查「一次性免费导出额度」：尚有额度则以 freeAllowance=true 放行。
 *  - 未配置 Supabase（纯本地/离线）→ 才回落信任 clientPlan（不涉及额度概念，行为完全不变）。
 */
async function decide(request: NextRequest, clientPlan: string): Promise<Decision> {
  if (!isSupabaseConfigured()) {
    return clientPlan === 'starter' || clientPlan === 'pro' ? { ok: true } : { ok: false };
  }
  // 命中请求级 memo：直接复用首次裁定结果
  const cached = requestGrant.get(request);
  if (cached) return { ok: true, userId: cached.userId, freeAllowance: cached.freeAllowance };

  const token = bearerToken(request);
  if (!token) return { ok: false };
  const d = await serverDecision(token);
  if (d.ok) {
    requestGrant.set(request, { userId: d.userId, freeAllowance: false });
    return d;
  }
  // 非付费：若可解析出真实用户，检查是否还持有一次性免费导出额度
  if (d.userId) {
    const status = await getFreeExportStatus(d.userId);
    if (status.available) {
      requestGrant.set(request, { userId: d.userId, freeAllowance: true });
      return { ok: true, userId: d.userId, freeAllowance: true };
    }
  }
  return { ok: false, userId: d.userId };
}

/**
 * 成功出口调用：把「一次性免费导出额度」真正落库消费（仅一次）。
 * 从 memo 取条目，freeAllowance 命中且未消费时写入流水；失败只告警，绝不抛错。
 */
export async function commitFreeExport(request: NextRequest): Promise<void> {
  const entry = requestGrant.get(request);
  if (!entry || !entry.freeAllowance || !entry.userId || entry.committed) return;
  entry.committed = true;
  let endpoint: string | undefined;
  try {
    endpoint = new URL(request.url).pathname;
  } catch {
    endpoint = undefined;
  }
  try {
    const ok = await consumeFreeExport(entry.userId, { endpoint });
    if (!ok) console.warn('[plan-gate] free export allowance commit returned false (fail-closed)');
  } catch (e) {
    console.warn('[plan-gate] commitFreeExport failed:', e instanceof Error ? e.message.slice(0, 200) : e);
  }
}

/**
 * 付费（starter|pro）或 admin 才放行。失败码 batch_requires_paid。
 */
export async function verifyPaidEligibility(request: NextRequest, clientPlan: string): Promise<PaidEligibility> {
  const deny = (): PaidEligibility => ({ ok: false, reason: BATCH_ERROR_CODES.requiresPaid });
  const d = await decide(request, clientPlan);
  return d.ok ? { ok: true, userId: d.userId, freeAllowance: d.freeAllowance } : deny();
}

/**
 * 泛化 Starter+ 门控（供竖屏/字幕/批量导出/AI 配音/配乐/卡拉OK/关键帧封面等复用）。
 * 错误码按 featureKey 区分：`${featureKey}_requires_starter`。
 *
 * 与旧版本的关键差异：**先看 token**。只要请求里带了真实身份，就不再采信 clientPlan
 * ——旧实现是「clientPlan 命中即放行」，改请求体即可绕过，属于付费墙漏洞。
 */
export async function verifyStarterEligibility(
  request: NextRequest,
  clientPlan: string,
  featureKey: string,
): Promise<PaidEligibility> {
  const deny = (): PaidEligibility => ({ ok: false, reason: `${featureKey}_requires_starter` });
  const d = await decide(request, clientPlan);
  return d.ok ? { ok: true, userId: d.userId, freeAllowance: d.freeAllowance } : deny();
}