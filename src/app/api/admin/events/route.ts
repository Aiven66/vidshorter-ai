import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 管理后台 - 行为数据 API
 * GET /api/admin/events?startDate=2026-01-01&endDate=2026-01-31
 *
 * 返回两个核心漏斗的统计数据:
 *   - video_generation: page_view_home → click_analyze → analyze_success → clip_download
 *   - subscription:     page_view_pricing → click_subscribe → subscribe_success
 *
 * 真实数据来源：
 *   1. behavior_events 表 — 前端和后端 webhook 埋点
 *   2. credit_transactions 表 — applyPlanPurchase 写入的 type='purchase' 记录（最可靠）
 *      description 格式: "Purchase starter via creem (order_xxx)"
 *
 * 订阅漏斗 step 3 (subscribe_success) 使用 credit_transactions 真实数据覆盖，
 * 同时提供 payment_method_breakdown 展示 PayPal/Creem 细分
 */

const ADMIN_EMAILS = new Set(['admin@126.com', 'admin@clipop.ai', 'admin@vidshorter.ai']);

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function isAdminFromToken(token: string): boolean {
  if (process.env.ADMIN_API_KEY && token === process.env.ADMIN_API_KEY) return true;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const email = typeof payload.email === 'string' ? payload.email : '';
  const role = typeof payload.role === 'string' ? payload.role : '';
  if (role === 'admin') return true;
  if (email && ADMIN_EMAILS.has(email.trim().toLowerCase())) return true;
  const metadata = payload.user_metadata as Record<string, unknown> | undefined;
  if (metadata?.role === 'admin') return true;
  return false;
}

function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
    '';
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// 漏斗定义
const FUNNELS = {
  video_generation: [
    { event: 'page_view_home', step: 1, label: '访问首页' },
    { event: 'click_analyze', step: 2, label: '点击 Analyze' },
    { event: 'analyze_success', step: 3, label: '生成成功' },
    { event: 'clip_download', step: 4, label: '下载短视频' },
  ],
  subscription: [
    { event: 'page_view_pricing', step: 1, label: '访问价格页' },
    { event: 'click_subscribe', step: 2, label: '点击付费按钮' },
    { event: 'subscribe_success', step: 3, label: '付费成功' },
  ],
} as const;

interface DailyCount {
  date: string;
  count: number;
  unique_users: number;
  unique_sessions: number;
}

interface FunnelStepStat {
  step: number;
  event: string;
  label: string;
  count: number;
  unique_users: number;
  unique_sessions: number;
  conversion_from_previous: number;
  conversion_from_first: number;
}

interface FunnelStats {
  funnel_id: string;
  steps: FunnelStepStat[];
  total_count: number;
}

interface PaymentMethodStat {
  payment_method: 'paypal' | 'creem' | 'unknown';
  count: number;
  unique_users: number;
  revenue_usd: number;
  plan_breakdown: { plan_id: string; count: number; revenue_usd: number }[];
}

interface DailySubscriptionBreakdown {
  date: string;
  paypal_count: number;
  creem_count: number;
  total_count: number;
  paypal_revenue: number;
  creem_revenue: number;
  total_revenue: number;
}

interface DailyFunnelRow {
  date: string;
  video_generation: Record<string, number>; // event_name -> count
  subscription: Record<string, number>;     // event_name -> count
  real_subscriptions: number;               // 真实付费数（来自 credit_transactions）
  total: number;
}

interface ApiResponse {
  range: { startDate: string; endDate: string };
  summary: {
    total_events: number;
    unique_users: number;
    unique_sessions: number;
  };
  funnels: FunnelStats[];
  daily: Array<{ date: string } & Record<string, number>>;
  // 新增字段
  payment_method_breakdown: PaymentMethodStat[];
  daily_subscription_breakdown: DailySubscriptionBreakdown[];
  daily_funnel_tables: DailyFunnelRow[];
  real_subscription_count: number;
  real_subscription_revenue: number;
}

// ── 解析 credit_transactions.description ──────────────────────────────────
// 格式: "Purchase starter via creem (order_xxx)" 或 "Purchase pro via paypal (order_yyy)"
function parseTransactionDescription(description: string): {
  plan_id: string | null;
  provider: 'paypal' | 'creem' | 'unknown';
  order_id: string | null;
} {
  if (!description) return { plan_id: null, provider: 'unknown', order_id: null };
  // 提取 plan_id
  const planMatch = description.match(/Purchase\s+(\w+)\s+via/i);
  const plan_id = planMatch ? planMatch[1].toLowerCase() : null;
  // 提取 provider
  const providerMatch = description.match(/via\s+(\w+)/i);
  const rawProvider = providerMatch ? providerMatch[1].toLowerCase() : 'unknown';
  const provider: 'paypal' | 'creem' | 'unknown' =
    rawProvider === 'paypal' ? 'paypal' :
    rawProvider === 'creem' ? 'creem' : 'unknown';
  // 提取 order_id（括号内）
  const orderIdMatch = description.match(/\(([^)]+)\)/);
  const order_id = orderIdMatch ? orderIdMatch[1].trim() : null;
  return { plan_id, provider, order_id };
}

// 根据计划推断价格
function getPlanPrice(planId: string | null): number {
  if (planId === 'pro') return 19.9;
  if (planId === 'starter') return 9.9;
  return 0;
}

export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token || !isAdminFromToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getServiceRoleClient();
  if (!client) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  // 日期范围参数（默认最近 30 天）
  const { searchParams } = new URL(request.url);
  const endDate = searchParams.get('endDate') || new Date().toISOString().slice(0, 10);
  const startDate = searchParams.get('startDate') ||
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 时区处理：UTC 边界
  const startTs = `${startDate}T00:00:00.000Z`;
  const endTs = `${endDate}T23:59:59.999Z`;

  try {
    // ── 1. 查询 behavior_events ─────────────────────────────────────────────
    const { data: events, error } = await client
      .from('behavior_events')
      .select('event_name,funnel_id,step_index,user_id,session_id,created_at,event_data')
      .gte('created_at', startTs)
      .lte('created_at', endTs)
      .order('created_at', { ascending: true })
      .limit(50000);

    if (error) {
      console.warn('[admin/events] behavior_events query error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const allEvents = events || [];

    // ── 2. 查询 credit_transactions 真实付费记录 ──────────────────────────
    // 这是订阅漏斗 step 3 的最可靠数据源
    const { data: transactions, error: txError } = await client
      .from('credit_transactions')
      .select('user_id,amount,type,description,created_at')
      .eq('type', 'purchase')
      .gte('created_at', startTs)
      .lte('created_at', endTs)
      .order('created_at', { ascending: true })
      .limit(10000);

    if (txError) {
      console.warn('[admin/events] credit_transactions query error:', txError.message);
      // 不阻塞：继续返回 behavior_events 数据
    }

    // 解析真实付费记录
    type ParsedTx = {
      user_id: string;
      plan_id: string | null;
      provider: 'paypal' | 'creem' | 'unknown';
      order_id: string | null;
      amount_usd: number;
      created_at: string;
      date: string;
    };
    const parsedTxs: ParsedTx[] = (transactions || [])
      .map(tx => {
        const parsed = parseTransactionDescription(tx.description || '');
        return {
          user_id: tx.user_id as string,
          plan_id: parsed.plan_id,
          provider: parsed.provider,
          order_id: parsed.order_id,
          amount_usd: getPlanPrice(parsed.plan_id),
          created_at: tx.created_at as string,
          date: (tx.created_at as string).slice(0, 10),
        };
      })
      // 过滤掉非 paypal/creem 的（如 wechat/alipay 在本次统计外）
      .filter(tx => tx.provider === 'paypal' || tx.provider === 'creem');

    // ── 3. 计算每个漏斗的统计数据 ──────────────────────────────────────────
    const funnels: FunnelStats[] = [];

    for (const [funnelId, steps] of Object.entries(FUNNELS)) {
      const funnelEvents = allEvents.filter(e => e.funnel_id === funnelId);
      const stepStats: FunnelStepStat[] = [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        let stepEvents = funnelEvents.filter(e => e.event_name === step.event);

        // ── 关键：订阅漏斗 step 3 用真实付费数据覆盖 ────────────────────
        if (funnelId === 'subscription' && step.event === 'subscribe_success') {
          // 用 credit_transactions 表的真实付费记录覆盖
          const realUniqueUsers = new Set(parsedTxs.map(tx => tx.user_id)).size;
          const realUniqueSessions = new Set(parsedTxs.map(tx => tx.user_id)).size;
          stepStats.push({
            step: step.step,
            event: step.event,
            label: step.label + '（真实）',
            count: parsedTxs.length,
            unique_users: realUniqueUsers,
            unique_sessions: realUniqueSessions,
            conversion_from_previous: 0, // 后面计算
            conversion_from_first: 0,    // 后面计算
          });
          continue;
        }

        const uniqueUsers = new Set(stepEvents.map(e => e.user_id).filter(Boolean)).size;
        const uniqueSessions = new Set(stepEvents.map(e => e.session_id).filter(Boolean)).size;
        const count = stepEvents.length;

        const prevCount = i > 0 ? stepStats[i - 1].count : count;
        const firstCount = stepStats[0]?.count || count;

        stepStats.push({
          step: step.step,
          event: step.event,
          label: step.label,
          count,
          unique_users: uniqueUsers,
          unique_sessions: uniqueSessions,
          conversion_from_previous: prevCount > 0 ? (count / prevCount) * 100 : 0,
          conversion_from_first: firstCount > 0 ? (count / firstCount) * 100 : 100,
        });
      }

      // 重新计算转化率（因为 step 3 可能被覆盖了）
      for (let i = 0; i < stepStats.length; i++) {
        const prevCount = i > 0 ? stepStats[i - 1].count : stepStats[i].count;
        const firstCount = stepStats[0]?.count || stepStats[i].count;
        stepStats[i].conversion_from_previous = prevCount > 0
          ? (stepStats[i].count / prevCount) * 100
          : 0;
        stepStats[i].conversion_from_first = firstCount > 0
          ? (stepStats[i].count / firstCount) * 100
          : 100;
      }

      funnels.push({
        funnel_id: funnelId,
        steps: stepStats,
        total_count: stepStats[0]?.count || 0,
      });
    }

    // ── 4. 支付方式细分（PayPal/Creem） ──────────────────────────────────
    const paymentMethodBreakdown: PaymentMethodStat[] = [];
    for (const method of ['paypal', 'creem'] as const) {
      const txs = parsedTxs.filter(tx => tx.provider === method);
      const uniqueUsers = new Set(txs.map(tx => tx.user_id)).size;
      const revenue = txs.reduce((sum, tx) => sum + tx.amount_usd, 0);
      // plan 细分
      const planMap = new Map<string, { count: number; revenue: number }>();
      for (const tx of txs) {
        const key = tx.plan_id || 'unknown';
        if (!planMap.has(key)) planMap.set(key, { count: 0, revenue: 0 });
        const entry = planMap.get(key)!;
        entry.count++;
        entry.revenue += tx.amount_usd;
      }
      paymentMethodBreakdown.push({
        payment_method: method,
        count: txs.length,
        unique_users: uniqueUsers,
        revenue_usd: parseFloat(revenue.toFixed(2)),
        plan_breakdown: Array.from(planMap.entries()).map(([plan_id, v]) => ({
          plan_id,
          count: v.count,
          revenue_usd: parseFloat(v.revenue.toFixed(2)),
        })),
      });
    }

    // ── 5. 按日期聚合的行为事件 ───────────────────────────────────────────
    const dailyMap = new Map<string, Record<string, number>>();
    for (const ev of allEvents) {
      const date = (ev.created_at as string).slice(0, 10);
      if (!dailyMap.has(date)) dailyMap.set(date, {});
      const dayData = dailyMap.get(date)!;
      dayData[ev.event_name] = (dayData[ev.event_name] || 0) + 1;
    }

    const daily: Array<{ date: string } & Record<string, number>> = Array.from(dailyMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── 6. 按日期+支付方式聚合的订阅数据 ──────────────────────────────────
    const dailySubMap = new Map<string, { paypal: number; creem: number; paypal_rev: number; creem_rev: number }>();
    for (const tx of parsedTxs) {
      if (!dailySubMap.has(tx.date)) {
        dailySubMap.set(tx.date, { paypal: 0, creem: 0, paypal_rev: 0, creem_rev: 0 });
      }
      const entry = dailySubMap.get(tx.date)!;
      if (tx.provider === 'paypal') {
        entry.paypal++;
        entry.paypal_rev += tx.amount_usd;
      } else if (tx.provider === 'creem') {
        entry.creem++;
        entry.creem_rev += tx.amount_usd;
      }
    }

    const dailySubscriptionBreakdown: DailySubscriptionBreakdown[] = Array.from(dailySubMap.entries())
      .map(([date, v]) => ({
        date,
        paypal_count: v.paypal,
        creem_count: v.creem,
        total_count: v.paypal + v.creem,
        paypal_revenue: parseFloat(v.paypal_rev.toFixed(2)),
        creem_revenue: parseFloat(v.creem_rev.toFixed(2)),
        total_revenue: parseFloat((v.paypal_rev + v.creem_rev).toFixed(2)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── 7. 每日漏斗数据列表（按天展示两个漏斗的步骤计数） ────────────────
    const allDates = new Set<string>();
    for (const ev of allEvents) allDates.add((ev.created_at as string).slice(0, 10));
    for (const tx of parsedTxs) allDates.add(tx.date);

    const dailyFunnelTables: DailyFunnelRow[] = Array.from(allDates)
      .sort()
      .map(date => {
        // behavior_events 当日聚合
        const dayEvents = allEvents.filter(ev => (ev.created_at as string).slice(0, 10) === date);
        const videoEvents: Record<string, number> = {};
        const subEvents: Record<string, number> = {};
        for (const ev of dayEvents) {
          if (ev.funnel_id === 'video_generation') {
            videoEvents[ev.event_name] = (videoEvents[ev.event_name] || 0) + 1;
          } else if (ev.funnel_id === 'subscription') {
            subEvents[ev.event_name] = (subEvents[ev.event_name] || 0) + 1;
          }
        }
        // 用真实付费数据覆盖 subscribe_success
        const realSubs = parsedTxs.filter(tx => tx.date === date).length;
        subEvents['subscribe_success'] = realSubs;

        const total =
          Object.values(videoEvents).reduce((a, b) => a + b, 0) +
          Object.values(subEvents).reduce((a, b) => a + b, 0);

        return {
          date,
          video_generation: videoEvents,
          subscription: subEvents,
          real_subscriptions: realSubs,
          total,
        };
      });

    // ── 8. 总览统计 ─────────────────────────────────────────────────────────
    const totalEvents = allEvents.length;
    const uniqueUsers = new Set(allEvents.map(e => e.user_id).filter(Boolean)).size;
    const uniqueSessions = new Set(allEvents.map(e => e.session_id).filter(Boolean)).size;
    const realSubCount = parsedTxs.length;
    const realSubRevenue = parseFloat(parsedTxs.reduce((sum, tx) => sum + tx.amount_usd, 0).toFixed(2));

    const response: ApiResponse = {
      range: { startDate, endDate },
      summary: {
        total_events: totalEvents,
        unique_users: uniqueUsers,
        unique_sessions: uniqueSessions,
      },
      funnels,
      daily,
      payment_method_breakdown: paymentMethodBreakdown,
      daily_subscription_breakdown: dailySubscriptionBreakdown,
      daily_funnel_tables: dailyFunnelTables,
      real_subscription_count: realSubCount,
      real_subscription_revenue: realSubRevenue,
    };

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch events';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
