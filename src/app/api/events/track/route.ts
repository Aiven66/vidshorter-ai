import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 行为事件埋点 API
 *
 * POST /api/events/track
 * 接收前端埋点数据，写入 behavior_events 表
 *
 * 两个核心漏斗:
 *   funnel_id = 'video_generation':
 *     step 1: page_view_home       - 用户访问首页
 *     step 2: click_analyze         - 点击 Analyze 按钮
 *     step 3: analyze_success       - AI 生成高光时刻成功
 *     step 4: clip_download         - 下载高光短视频
 *
 *   funnel_id = 'subscription':
 *     step 1: page_view_pricing     - 用户访问价格页
 *     step 2: click_subscribe       - 点击付费订阅按钮
 *     step 3: subscribe_success     - 付费订阅成功
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
    '';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.COZE_SUPABASE_ANON_KEY ||
    '';
  // 优先使用 service role（绕过 RLS），回退到 anon key（受 RLS 限制，但有 INSERT 权限）
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// 获取客户端 IP
function getClientIP(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xRealIP = request.headers.get('x-real-ip');
  if (xRealIP) return xRealIP;
  return '';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as {
      event_name?: string;
      funnel_id?: string;
      step_index?: number;
      event_data?: Record<string, unknown>;
      session_id?: string;
      user_id?: string;
      user_email?: string;
      page_url?: string;
      referrer?: string;
    } | null;

    if (!body || !body.event_name) {
      return NextResponse.json(
        { error: 'event_name is required' },
        { status: 400 }
      );
    }

    const client = getServiceRoleClient();
    if (!client) {
      // 数据库未配置，静默成功（不影响主流程）
      return NextResponse.json({ ok: true, skipped: true });
    }

    // 从请求头获取元数据
    const userAgent = request.headers.get('user-agent') || '';
    const ip = getClientIP(request);
    const pageUrl = body.page_url || '';
    const referrer = body.referrer || '';

    // session_id 兜底：使用 IP+UA 的简单哈希作为匿名 session
    const sessionId = body.session_id || '';

    const insertData = {
      event_name: String(body.event_name).slice(0, 100),
      funnel_id: body.funnel_id ? String(body.funnel_id).slice(0, 50) : null,
      step_index: typeof body.step_index === 'number' ? body.step_index : null,
      event_data: body.event_data || {},
      session_id: sessionId || 'anonymous',
      user_id: body.user_id ? String(body.user_id).slice(0, 100) : null,
      user_email: body.user_email ? String(body.user_email).slice(0, 200) : null,
      page_url: pageUrl.slice(0, 500),
      referrer: referrer.slice(0, 500),
      user_agent: userAgent.slice(0, 500),
      ip: ip.slice(0, 50),
    };

    const { error } = await client
      .from('behavior_events')
      .insert(insertData);

    if (error) {
      // 表不存在或其他错误，静默失败不影响主流程
      console.warn('[events/track] insert error:', error.message);
      return NextResponse.json({ ok: true, skipped: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn('[events/track] error:', err);
    // 静默失败：埋点不应阻塞用户主流程
    return NextResponse.json({ ok: true, skipped: true });
  }
}
