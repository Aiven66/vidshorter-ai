/**
 * 行为埋点 SDK — 轻量级、非阻塞、不依赖 useAuth
 *
 * 两个核心漏斗:
 *   1. video_generation (AI 生成高光时刻短视频)
 *      - page_view_home      (step 1) 访问首页
 *      - click_analyze       (step 2) 点击 Analyze 按钮
 *      - analyze_success     (step 3) AI 生成成功
 *      - clip_download       (step 4) 下载高光短视频
 *
 *   2. subscription (付费漏斗)
 *      - page_view_pricing   (step 1) 访问价格页
 *      - click_subscribe     (step 2) 点击付费按钮
 *      - subscribe_success   (step 3) 付费成功
 *
 * 使用方式：
 *   import { trackEvent, VIDEO_FUNNEL, SUBSCRIBE_FUNNEL } from '@/lib/analytics';
 *   trackEvent(VIDEO_FUNNEL.CLICK_ANALYZE, { source_type: 'youtube' });
 */

// ── 漏斗定义 ───────────────────────────────────────────────────────────────
// 注意：每个 step 必须包含 funnelId，否则 trackEvent 无法传递 funnel_id

export const VIDEO_FUNNEL = {
  funnelId: 'video_generation',
  PAGE_VIEW_HOME: { event: 'page_view_home', step: 1, funnelId: 'video_generation' as const },
  CLICK_ANALYZE: { event: 'click_analyze', step: 2, funnelId: 'video_generation' as const },
  ANALYZE_SUCCESS: { event: 'analyze_success', step: 3, funnelId: 'video_generation' as const },
  CLIP_DOWNLOAD: { event: 'clip_download', step: 4, funnelId: 'video_generation' as const },
} as const;

export const SUBSCRIBE_FUNNEL = {
  funnelId: 'subscription',
  PAGE_VIEW_PRICING: { event: 'page_view_pricing', step: 1, funnelId: 'subscription' as const },
  CLICK_SUBSCRIBE: { event: 'click_subscribe', step: 2, funnelId: 'subscription' as const },
  SUBSCRIBE_SUCCESS: { event: 'subscribe_success', step: 3, funnelId: 'subscription' as const },
} as const;

export type FunnelStep = {
  event: string;
  step: number;
  funnelId: string;
};

// ── Session ID 管理 ──────────────────────────────────────────────────────────

const SESSION_KEY = 'clipop_session_id';
const SESSION_TS_KEY = 'clipop_session_ts';
const SESSION_TTL = 30 * 60 * 1000; // 30 分钟无活动视为新 session

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';

  try {
    const now = Date.now();
    const lastTs = parseInt(localStorage.getItem(SESSION_TS_KEY) || '0', 10);
    let sid = localStorage.getItem(SESSION_KEY);

    // session 过期或首次访问，生成新 session
    if (!sid || now - lastTs > SESSION_TTL) {
      sid = `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, sid);
    }
    localStorage.setItem(SESSION_TS_KEY, String(now));
    return sid;
  } catch {
    return 'fallback';
  }
}

// ── 用户信息 ──────────────────────────────────────────────────────────────────

let currentUser: { id?: string; email?: string } = {};

/** 在应用初始化时调用，设置当前用户信息（从 useAuth 获取） */
export function setAnalyticsUser(user: { id?: string; email?: string } | null) {
  currentUser = user || {};
}

// ── 核心 track 函数 ─────────────────────────────────────────────────────────

export interface TrackOptions {
  /** 自定义用户 ID（优先于 setAnalyticsUser 设置的） */
  userId?: string;
  /** 自定义用户邮箱 */
  userEmail?: string;
  /** 事件附加数据 */
  data?: Record<string, unknown>;
  /** 页面 URL（默认自动获取） */
  pageUrl?: string;
  /** 来源页面 */
  referrer?: string;
}

/**
 * 发送埋点事件到 /api/events/track
 * - 使用 sendBeacon 优先（页面卸载时也能发送）
 * - fallback 到 fetch with keepalive
 * - 静默失败，永不抛出异常
 */
export function trackEvent(
  step: FunnelStep,
  options: TrackOptions = {}
): void {
  if (typeof window === 'undefined') return;

  try {
    const payload = {
      event_name: step.event,
      funnel_id: step.funnelId,
      step_index: step.step,
      event_data: options.data || {},
      session_id: getSessionId(),
      user_id: options.userId || currentUser.id || '',
      user_email: options.userEmail || currentUser.email || '',
      page_url: options.pageUrl || window.location.href,
      referrer: options.referrer || document.referrer,
    };

    const body = JSON.stringify(payload);

    // 优先使用 sendBeacon（页面卸载时也能可靠发送）
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon('/api/events/track', blob);
      if (ok) return;
    }

    // fallback: fetch with keepalive
    fetch('/api/events/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {
      // 静默失败
    });
  } catch {
    // 静默失败：埋点不应影响主功能
  }
}

/**
 * 通用事件埋点（非漏斗步骤，用于记录独立行为）
 */
export function trackCustomEvent(
  eventName: string,
  data: Record<string, unknown> = {}
): void {
  if (typeof window === 'undefined') return;

  try {
    const payload = {
      event_name: eventName,
      funnel_id: null,
      step_index: null,
      event_data: data,
      session_id: getSessionId(),
      user_id: currentUser.id || '',
      user_email: currentUser.email || '',
      page_url: window.location.href,
      referrer: document.referrer,
    };

    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/events/track', blob)) return;
    }

    fetch('/api/events/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {});
  } catch {
    // 静默失败
  }
}
