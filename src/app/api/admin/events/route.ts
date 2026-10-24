import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CREDIT_PACKS } from '@/lib/server/subscriptions';

// Force dynamic — prevents Next.js from trying to statically generate this API route at build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
 * 同时提供 payment_method_breakdown 展示 Waffo/Creem 细分
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

// v5 P0-1：贯穿「访问 → 付费」的统一漏斗。
// 前五步复用既有事件名（与 video_generation 漏斗共用），后台按 event_name 聚合。
const CONVERSION_STEPS = [
  { key: 'visit', event: 'page_view_home', label: '访问' },
  { key: 'trial', event: 'click_analyze', label: '试跑' },
  { key: 'signup', event: 'sign_up', label: '注册' },
  { key: 'generated', event: 'analyze_success', label: '生成成功' },
  { key: 'export', event: 'clip_download', label: '首次导出' },
  { key: 'paywall', event: 'paywall_view', label: '付费墙曝光' },
  { key: 'checkout', event: 'checkout_started', label: '结算开始' },
  { key: 'paid', event: 'subscribe_success', label: '付费成功' },
] as const;

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
  payment_method: 'waffo' | 'creem' | 'unknown';
  count: number;
  unique_users: number;
  revenue_usd: number;
  plan_breakdown: { plan_id: string; count: number; revenue_usd: number }[];
}

interface DailySubscriptionBreakdown {
  date: string;
  waffo_count: number;
  creem_count: number;
  total_count: number;
  waffo_revenue: number;
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

// ── v5 P0-1 统一转化漏斗 ─────────────────────────────────────────────────
interface ConversionStepStat {
  key: string;
  event: string;
  label: string;
  count: number;
  unique_actors: number;
  conversion_from_previous: number;
  conversion_from_first: number;
}

interface ConversionBreakdownRow {
  /** 来源（seo/direct/...）或语言（zh/en/...） */
  group: string;
  visitors: number;
  trials: number;
  signups: number;
  generations: number;
  exporters: number;
  paywall_views: number;
  checkouts: number;
  paid: number;
  /** 导出 → 付费转化率（%） */
  export_to_paid: number;
}

interface ConversionFunnel {
  steps: ConversionStepStat[];
  daily: Array<{ date: string } & Record<string, number>>;
  by_source: ConversionBreakdownRow[];
  by_locale: ConversionBreakdownRow[];
  /** 流失最大的环节（key + 上一步到本步的转化率） */
  biggest_drop: { key: string; label: string; conversion_from_previous: number } | null;
}

// ── v5 P0-5 失败挽回闭环 ─────────────────────────────────────────────────
interface FailureReasonStat {
  /** 归一化后的失败原因 */
  reason: string;
  count: number;
  /** 已自动退还积分的次数 */
  refunded: number;
}

interface FailureAnalysis {
  failures: number;
  successes: number;
  /** 失败率（%）= failures / (failures + successes) */
  failure_rate: number;
  /** Top 3 失败原因 */
  top_reasons: FailureReasonStat[];
  /** 「重试」按钮点击次数 */
  retry_clicks: number;
  /** 点击重试后最终成功的独立用户数 */
  retry_recovered_users: number;
  /** 点击重试的独立用户数 */
  retry_users: number;
  /** 重试成功率（%）= recovered / retry_users */
  retry_success_rate: number;
  /** 失败后已自动退积分的次数 */
  refunded_failures: number;
}

// ── v5 P0-2 首屏候选卡 ───────────────────────────────────────────────────
interface PreviewAnalysis {
  /** 候选卡曝光次数 */
  views: number;
  /** 曝光过的独立主体数 */
  unique_actors: number;
  /** 其中匿名访客的曝光次数 */
  guest_views: number;
  /** 曝光 → 注册（同一主体后续出现 sign_up） */
  signed_up: number;
  /** 曝光 → 首次导出（同一主体后续出现 clip_download） */
  exported: number;
  /** 提交 → 看到候选卡的耗时分位（毫秒），无数据为 null */
  elapsed_p50_ms: number | null;
  elapsed_p90_ms: number | null;
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
  conversion_funnel: ConversionFunnel;
  failure_analysis: FailureAnalysis;
  preview_analysis: PreviewAnalysis;
}

// ── 解析 credit_transactions.description ──────────────────────────────────
// 格式: "Purchase starter via waffo (order_xxx)" 或 "Purchase pro via creem (order_yyy)"
function parseTransactionDescription(description: string): {
  plan_id: string | null;
  provider: 'waffo' | 'creem' | 'unknown';
  order_id: string | null;
} {
  if (!description) return { plan_id: null, provider: 'unknown', order_id: null };
  // 提取 plan_id
  const planMatch = description.match(/Purchase\s+(\w+)\s+via/i);
  const plan_id = planMatch ? planMatch[1].toLowerCase() : null;
  // 提取 provider（仅统计当前主通道 Waffo / Creem；历史 paypal 记录不计入）
  const providerMatch = description.match(/via\s+(\w+)/i);
  const rawProvider = providerMatch ? providerMatch[1].toLowerCase() : 'unknown';
  const provider: 'waffo' | 'creem' | 'unknown' =
    rawProvider === 'waffo' ? 'waffo' :
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
  // 一次性积分包同样计入真实收入（否则付费转化被低估）
  if (planId && Object.prototype.hasOwnProperty.call(CREDIT_PACKS, planId)) {
    return CREDIT_PACKS[planId].priceIntl;
  }
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
      provider: 'waffo' | 'creem' | 'unknown';
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
      // 过滤掉非 waffo/creem 的（如 wechat/alipay 及历史 paypal 在本次统计外）
      .filter(tx => tx.provider === 'waffo' || tx.provider === 'creem');

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

    // ── 3.5 统一转化漏斗（v5 P0-1） ────────────────────────────────────────
    const stepKeyByEvent = new Map<string, string>(
      CONVERSION_STEPS.map(s => [s.event, s.key])
    );

    const actorOf = (ev: { user_id?: unknown; session_id?: unknown }): string =>
      (typeof ev.user_id === 'string' && ev.user_id) ||
      (typeof ev.session_id === 'string' && ev.session_id) || '';

    const metaOf = (ev: { event_data?: unknown }): { source: string; locale: string } => {
      const d = (ev.event_data && typeof ev.event_data === 'object')
        ? ev.event_data as Record<string, unknown>
        : {};
      return {
        source: typeof d.source === 'string' && d.source ? d.source : 'unknown',
        locale: typeof d.locale === 'string' && d.locale ? d.locale : 'unknown',
      };
    };

    // 每个步骤的去重行为主体（登录用户用 user_id，匿名用 session_id）
    const stepActors = new Map<string, Set<string>>();
    const stepEventCounts = new Map<string, number>();
    const dailyConvMap = new Map<string, Record<string, number>>();

    // 来源 / 语言拆解：group -> stepKey -> actor set
    const sourceAccum = new Map<string, Map<string, Set<string>>>();
    const localeAccum = new Map<string, Map<string, Set<string>>>();
    const addToGroup = (
      map: Map<string, Map<string, Set<string>>>,
      group: string,
      stepKey: string,
      actor: string,
    ) => {
      if (!actor) return;
      let steps = map.get(group);
      if (!steps) { steps = new Map(); map.set(group, steps); }
      let set = steps.get(stepKey);
      if (!set) { set = new Set(); steps.set(stepKey, set); }
      set.add(actor);
    };

    // 用户 → 首次归因来源 / 语言（用于把真实付费按用户归属到来源）
    const userSource = new Map<string, string>();
    const userLocale = new Map<string, string>();
    for (const ev of allEvents) {
      const uid = typeof ev.user_id === 'string' ? ev.user_id : '';
      if (!uid) continue;
      const meta = metaOf(ev);
      if (!userSource.has(uid) && meta.source !== 'unknown') userSource.set(uid, meta.source);
      if (!userLocale.has(uid) && meta.locale !== 'unknown') userLocale.set(uid, meta.locale);
    }

    for (const ev of allEvents) {
      const eventName = String(ev.event_name || '');
      const stepKey = stepKeyByEvent.get(eventName);
      if (!stepKey) continue;
      const actor = actorOf(ev);
      if (actor) {
        if (!stepActors.has(stepKey)) stepActors.set(stepKey, new Set());
        stepActors.get(stepKey)!.add(actor);
      }
      stepEventCounts.set(stepKey, (stepEventCounts.get(stepKey) || 0) + 1);

      const date = (ev.created_at as string).slice(0, 10);
      if (!dailyConvMap.has(date)) dailyConvMap.set(date, {});
      const dayRow = dailyConvMap.get(date)!;
      dayRow[stepKey] = (dayRow[stepKey] || 0) + 1;

      const meta = metaOf(ev);
      addToGroup(sourceAccum, meta.source, stepKey, actor);
      addToGroup(localeAccum, meta.locale, stepKey, actor);
    }

    // 真实付费是唯一可信的「付费成功」来源：按用户归属到来源 / 语言
    const paidUsers = new Set<string>();
    for (const tx of parsedTxs) {
      paidUsers.add(tx.user_id);
      addToGroup(sourceAccum, userSource.get(tx.user_id) || 'unknown', 'paid', tx.user_id);
      addToGroup(localeAccum, userLocale.get(tx.user_id) || 'unknown', 'paid', tx.user_id);
      if (!dailyConvMap.has(tx.date)) dailyConvMap.set(tx.date, {});
      const dayRow = dailyConvMap.get(tx.date)!;
      dayRow.paid = (dayRow.paid || 0) + 1;
    }

    const actorCount = (key: string): number =>
      key === 'paid' ? paidUsers.size : (stepActors.get(key)?.size || 0);

    const conversionSteps: ConversionStepStat[] = CONVERSION_STEPS.map((step, i) => {
      const unique = actorCount(step.key);
      const prev = i > 0 ? actorCount(CONVERSION_STEPS[i - 1].key) : unique;
      const first = actorCount(CONVERSION_STEPS[0].key);
      return {
        key: step.key,
        event: step.event,
        label: step.label,
        count: step.key === 'paid' ? parsedTxs.length : (stepEventCounts.get(step.key) || 0),
        unique_actors: unique,
        conversion_from_previous: i === 0 ? 100 : (prev > 0 ? (unique / prev) * 100 : 0),
        conversion_from_first: first > 0 ? (unique / first) * 100 : 0,
      };
    });

    const buildBreakdown = (map: Map<string, Map<string, Set<string>>>): ConversionBreakdownRow[] =>
      Array.from(map.entries())
        .map(([group, steps]) => {
          const n = (key: string) => steps.get(key)?.size || 0;
          const exporters = n('export');
          const paid = n('paid');
          return {
            group,
            visitors: n('visit'),
            trials: n('trial'),
            signups: n('signup'),
            generations: n('generated'),
            exporters,
            paywall_views: n('paywall'),
            checkouts: n('checkout'),
            paid,
            export_to_paid: exporters > 0 ? (paid / exporters) * 100 : 0,
          };
        })
        .sort((a, b) => b.visitors - a.visitors);

    const dropCandidates = conversionSteps.filter(s => s.key !== 'visit');
    const biggestDrop = dropCandidates.length > 0
      ? dropCandidates.reduce((min, s) => (s.conversion_from_previous < min.conversion_from_previous ? s : min))
      : null;

    const conversionFunnel: ConversionFunnel = {
      steps: conversionSteps,
      daily: Array.from(dailyConvMap.entries())
        .map(([date, counts]) => Object.assign({ date }, counts))
        .sort((a, b) => a.date.localeCompare(b.date)),
      by_source: buildBreakdown(sourceAccum),
      by_locale: buildBreakdown(localeAccum),
      biggest_drop: biggestDrop
        ? {
            key: biggestDrop.key,
            label: biggestDrop.label,
            conversion_from_previous: biggestDrop.conversion_from_previous,
          }
        : null,
    };

    // ── 4. 支付方式细分（Waffo/Creem） ───────────────────────────────────
    const paymentMethodBreakdown: PaymentMethodStat[] = [];
    for (const method of ['waffo', 'creem'] as const) {
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

    // ── 4.6 失败分析（v5 P0-5） ────────────────────────────────────────────
    // 失败原因归一化：只保留稳定的枚举值，避免把整段报错文本写成维度。
    const normalizeFailureReason = (raw: unknown): string => {
      const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      if (!text) return 'unknown';
      if (/insufficient|not enough|quota|credit/.test(text)) return 'insufficient_credits';
      if (/timeout|timed out|time out|deadline/.test(text)) return 'timeout';
      if (/private|sign in|login|cookie|bot|403|forbidden|unavailable/.test(text)) return 'source_blocked';
      if (/no highlight|no clip|empty|nothing found|未找到/.test(text)) return 'no_highlights';
      if (/network|fetch|connection|econn|socket/.test(text)) return 'network';
      if (/unsupported|format|codec|invalid url|bad url/.test(text)) return 'unsupported_input';
      return 'other';
    };

    const failureEvents = allEvents.filter(ev =>
      ev.event_name === 'generation_failed' || ev.event_name === 'analyze_failed'
    );
    const successEvents = allEvents.filter(ev => ev.event_name === 'analyze_success');
    const retryEvents = allEvents.filter(ev => ev.event_name === 'retry_clicked');

    const reasonMap = new Map<string, { count: number; refunded: number }>();
    let refundedFailures = 0;
    for (const ev of failureEvents) {
      const d = (ev.event_data && typeof ev.event_data === 'object')
        ? ev.event_data as Record<string, unknown>
        : {};
      const reason = normalizeFailureReason(d.reason ?? d.error ?? d.message);
      const refunded = d.credits_refunded === true;
      if (refunded) refundedFailures++;
      const entry = reasonMap.get(reason) || { count: 0, refunded: 0 };
      entry.count++;
      if (refunded) entry.refunded++;
      reasonMap.set(reason, entry);
    }

    // 重试恢复：同一 actor 先点 retry_clicked，之后又出现 analyze_success。
    // allEvents 已按 created_at 升序，逐条扫描即可。
    const firstRetryAt = new Map<string, string>();
    for (const ev of retryEvents) {
      const actor = actorOf(ev);
      const at = String(ev.created_at || '');
      if (!actor || !at) continue;
      const prev = firstRetryAt.get(actor);
      if (!prev || at < prev) firstRetryAt.set(actor, at);
    }
    const recoveredActors = new Set<string>();
    for (const ev of successEvents) {
      const actor = actorOf(ev);
      const at = String(ev.created_at || '');
      if (!actor || !at) continue;
      const retryAt = firstRetryAt.get(actor);
      if (retryAt && at >= retryAt) recoveredActors.add(actor);
    }

    const failureCount = failureEvents.length;
    const successCount = successEvents.length;
    const retryUsers = firstRetryAt.size;

    const failureAnalysis: FailureAnalysis = {
      failures: failureCount,
      successes: successCount,
      failure_rate: failureCount + successCount > 0
        ? parseFloat(((failureCount / (failureCount + successCount)) * 100).toFixed(1))
        : 0,
      top_reasons: Array.from(reasonMap.entries())
        .map(([reason, v]) => ({ reason, count: v.count, refunded: v.refunded }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      retry_clicks: retryEvents.length,
      retry_recovered_users: recoveredActors.size,
      retry_users: retryUsers,
      retry_success_rate: retryUsers > 0
        ? parseFloat(((recoveredActors.size / retryUsers) * 100).toFixed(1))
        : 0,
      refunded_failures: refundedFailures,
    };

    // ── 4.7 首屏候选卡（v5 P0-2） ─────────────────────────────────────────
    const previewEvents = allEvents.filter(ev => ev.event_name === 'preview_shown');
    const previewActors = new Set<string>();
    let guestViews = 0;
    const elapsedSamples: number[] = [];
    for (const ev of previewEvents) {
      const actor = actorOf(ev);
      if (actor) previewActors.add(actor);
      const d = (ev.event_data && typeof ev.event_data === 'object')
        ? ev.event_data as Record<string, unknown>
        : {};
      if (d.is_guest === true) guestViews++;
      const ms = typeof d.elapsed_ms === 'number' ? d.elapsed_ms : Number(d.elapsed_ms);
      if (Number.isFinite(ms) && ms >= 0) elapsedSamples.push(ms);
    }
    elapsedSamples.sort((a, b) => a - b);
    const percentile = (arr: number[], p: number): number | null => {
      if (arr.length === 0) return null;
      const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil((p / 100) * arr.length) - 1));
      return arr[idx];
    };
    const previewAnalysis: PreviewAnalysis = {
      views: previewEvents.length,
      unique_actors: previewActors.size,
      guest_views: guestViews,
      signed_up: Array.from(previewActors).filter(a => stepActors.get('signup')?.has(a)).length,
      exported: Array.from(previewActors).filter(a => stepActors.get('export')?.has(a)).length,
      elapsed_p50_ms: percentile(elapsedSamples, 50),
      elapsed_p90_ms: percentile(elapsedSamples, 90),
    };

    // ── 5. 按日期聚合的行为事件 ───────────────────────────────────────────
    const dailyMap = new Map<string, Record<string, number>>();
    for (const ev of allEvents) {
      const date = (ev.created_at as string).slice(0, 10);
      if (!dailyMap.has(date)) dailyMap.set(date, {});
      const dayData = dailyMap.get(date)!;
      dayData[ev.event_name] = (dayData[ev.event_name] || 0) + 1;
    }

    const daily: Array<{ date: string } & Record<string, number>> = Array.from(dailyMap.entries())
      .map(([date, counts]) => Object.assign({ date }, counts))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── 6. 按日期+支付方式聚合的订阅数据 ──────────────────────────────────
    const dailySubMap = new Map<string, { waffo: number; creem: number; waffo_rev: number; creem_rev: number }>();
    for (const tx of parsedTxs) {
      if (!dailySubMap.has(tx.date)) {
        dailySubMap.set(tx.date, { waffo: 0, creem: 0, waffo_rev: 0, creem_rev: 0 });
      }
      const entry = dailySubMap.get(tx.date)!;
      if (tx.provider === 'waffo') {
        entry.waffo++;
        entry.waffo_rev += tx.amount_usd;
      } else if (tx.provider === 'creem') {
        entry.creem++;
        entry.creem_rev += tx.amount_usd;
      }
    }

    const dailySubscriptionBreakdown: DailySubscriptionBreakdown[] = Array.from(dailySubMap.entries())
      .map(([date, v]) => ({
        date,
        waffo_count: v.waffo,
        creem_count: v.creem,
        total_count: v.waffo + v.creem,
        waffo_revenue: parseFloat(v.waffo_rev.toFixed(2)),
        creem_revenue: parseFloat(v.creem_rev.toFixed(2)),
        total_revenue: parseFloat((v.waffo_rev + v.creem_rev).toFixed(2)),
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
      conversion_funnel: conversionFunnel,
      failure_analysis: failureAnalysis,
      preview_analysis: previewAnalysis,
    };

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch events';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
