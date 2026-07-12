import { createClient } from '@supabase/supabase-js';

/**
 * 服务端行为埋点 — 用于 webhook 等后端场景
 *
 * 与前端 analytics.ts 不同，这里使用 service role client 直接写入数据库，
 * 适用于：
 *   - 支付 webhook（PayPal capture / Creem webhook）
 *   - 后端任务完成
 *
 * 通过 session_id 字段做幂等：session_id = `server_${paymentMethod}_${orderId}`
 * 插入前查询是否存在，避免 webhook 多次回调重复写入
 */

interface ServiceClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
    insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
  };
}

let cachedClient: ServiceClient | null = null;

function getServiceRoleClient(): ServiceClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
    '';
  if (!url || !serviceKey) return null;
  cachedClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as ServiceClient;
  return cachedClient;
}

/**
 * 记录付费成功事件（subscribe_success）
 * 通过 session_id 字段做幂等：相同 payment_method + order_id 不会重复写入
 */
export async function trackSubscribeSuccess(params: {
  userId: string;
  userEmail?: string;
  paymentMethod: 'paypal' | 'creem';
  planId: string;
  planName?: string;
  amountUsd?: number;
  orderId: string;
}): Promise<void> {
  try {
    const client = getServiceRoleClient();
    if (!client) return;

    // 用 session_id 做幂等键
    const idempotencyKey = `server_${params.paymentMethod}_${params.orderId}`;

    // 插入前检查是否已存在（webhook 可能多次回调）
    const { data: existing, error: queryError } = await client
      .from('behavior_events')
      .select('id')
      .eq('session_id', idempotencyKey);

    if (queryError) {
      console.warn('[server/track] dedup query error:', queryError.message);
    }
    if (existing && existing.length > 0) {
      console.log('[server/track] subscribe_success already recorded, skip:', idempotencyKey);
      return;
    }

    const insertData = {
      event_name: 'subscribe_success',
      funnel_id: 'subscription',
      step_index: 3,
      event_data: {
        payment_method: params.paymentMethod,
        plan_id: params.planId,
        plan_name: params.planName || params.planId,
        amount_usd: params.amountUsd,
        order_id: params.orderId,
        source: 'server_webhook',
      },
      session_id: idempotencyKey,
      user_id: params.userId,
      user_email: params.userEmail || null,
      page_url: '',
      referrer: '',
      user_agent: 'server/webhook',
      ip: '',
    };

    const { error } = await client.from('behavior_events').insert(insertData);
    if (error) {
      console.warn('[server/track] subscribe_success insert error:', error.message);
    } else {
      console.log('[server/track] subscribe_success recorded:', {
        userId: params.userId,
        paymentMethod: params.paymentMethod,
        planId: params.planId,
        orderId: params.orderId,
      });
    }
  } catch (err) {
    console.warn('[server/track] error:', err);
  }
}

export type TrackServerEvent = typeof trackSubscribeSuccess;
