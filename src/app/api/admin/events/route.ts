import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 管理后台 - 行为数据 API
 * GET /api/admin/events?startDate=2026-01-01&endDate=2026-01-31
 *
 * 返回两个核心漏斗的统计数据:
 *   - video_generation: page_view_home → click_analyze → analyze_success → clip_download
 *   - subscription:     page_view_pricing → click_subscribe → subscribe_success
 *   - 按日期聚合的时间序列数据
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
    // 查询范围内的所有行为事件
    const { data: events, error } = await client
      .from('behavior_events')
      .select('event_name,funnel_id,step_index,user_id,session_id,created_at')
      .gte('created_at', startTs)
      .lte('created_at', endTs)
      .order('created_at', { ascending: true })
      .limit(10000);

    if (error) {
      console.warn('[admin/events] query error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const allEvents = events || [];

    // ── 计算每个漏斗的统计数据 ──────────────────────────────────────────────
    const funnels: FunnelStats[] = [];

    for (const [funnelId, steps] of Object.entries(FUNNELS)) {
      const funnelEvents = allEvents.filter(e => e.funnel_id === funnelId);
      const stepStats: FunnelStepStat[] = [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepEvents = funnelEvents.filter(e => e.event_name === step.event);

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

      funnels.push({
        funnel_id: funnelId,
        steps: stepStats,
        total_count: stepStats[0]?.count || 0,
      });
    }

    // ── 按日期聚合的时间序列数据 ────────────────────────────────────────────
    const dailyMap = new Map<string, Record<string, number>>();

    for (const ev of allEvents) {
      const date = (ev.created_at as string).slice(0, 10);
      if (!dailyMap.has(date)) {
        dailyMap.set(date, {});
      }
      const dayData = dailyMap.get(date)!;
      dayData[ev.event_name] = (dayData[ev.event_name] || 0) + 1;
    }

    const daily: Array<{ date: string } & Record<string, number>> = Array.from(dailyMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── 总览统计 ─────────────────────────────────────────────────────────────
    const totalEvents = allEvents.length;
    const uniqueUsers = new Set(allEvents.map(e => e.user_id).filter(Boolean)).size;
    const uniqueSessions = new Set(allEvents.map(e => e.session_id).filter(Boolean)).size;

    return NextResponse.json({
      range: { startDate, endDate },
      summary: {
        total_events: totalEvents,
        unique_users: uniqueUsers,
        unique_sessions: uniqueSessions,
      },
      funnels,
      daily,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch events';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
