# @clipop/analytics

通用行为埋点分析包：浏览器端 SDK + 服务端 SDK + 漏斗配置 + 建表 SQL。零品牌耦合，通过 `useAppConfig()` 注入配置。

## 设计原则

- **零品牌耦合**：不包含任何 VidShorter / Clipop 品牌代码
- **静默失败**：埋点永不阻塞主功能，永不抛出异常
- **幂等写入**：服务端 SDK 通过 `session_id` 去重，webhook 重试不会产生重复
- **不直接读 process.env**：通过 `useAppConfig()` 获取 endpoint 和漏斗定义
- **sendBeacon 优先**：页面卸载时也能可靠发送

## 安装

在 monorepo 中通过 workspace 引用：

```json
{
  "dependencies": {
    "@clipop/analytics": "workspace:*",
    "@clipop/core": "workspace:*"
  }
}
```

## 配置

通过 `AppConfigProvider` 注入配置。analytics 包读取以下字段：

```tsx
import { AppConfigProvider } from '@clipop/core';
import { initAnalytics } from '@clipop/analytics';

<AppConfigProvider
  value={{
    // ...其他配置
    analyticsEndpoint: '/api/events/track',  // 默认值
    analyticsSessionTtl: 30 * 60 * 1000,     // 30 分钟，默认值
    funnels: [
      {
        id: 'video_generation',
        name: 'Video Generation Funnel',
        steps: [
          { event: 'page_view_home', step: 1 },
          { event: 'click_analyze', step: 2 },
          { event: 'analyze_success', step: 3 },
          { event: 'clip_download', step: 4 },
        ],
      },
      {
        id: 'subscription',
        name: 'Subscription Funnel',
        steps: [
          { event: 'page_view_pricing', step: 1 },
          { event: 'click_subscribe', step: 2 },
          { event: 'subscribe_success', step: 3 },
        ],
      },
    ],
  }}
>
  <YourApp />
</AppConfigProvider>
```

## SQL 建表语句

在 Supabase SQL Editor 中执行以下语句（也可从 `BEHAVIOR_EVENTS_SQL` 常量获取）：

```sql
-- Behavior Events table for user behavior tracking (funnel analytics)
CREATE TABLE IF NOT EXISTS public.behavior_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  user_email TEXT,
  session_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  funnel_id TEXT,
  step_index INTEGER,
  event_data JSONB DEFAULT '{}'::jsonb,
  page_url TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_behavior_events_event_name ON public.behavior_events(event_name);
CREATE INDEX IF NOT EXISTS idx_behavior_events_funnel_id ON public.behavior_events(funnel_id);
CREATE INDEX IF NOT EXISTS idx_behavior_events_created_at ON public.behavior_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavior_events_user_id ON public.behavior_events(user_id);
CREATE INDEX IF NOT EXISTS idx_behavior_events_session_id ON public.behavior_events(session_id);

-- RLS policies
ALTER TABLE public.behavior_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "behavior_events_insert_any" ON public.behavior_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "behavior_events_select_admin" ON public.behavior_events
  FOR SELECT TO service_role USING (true);
```

## 前端 SDK 使用示例

### 1. 初始化用户信息

在用户登录后调用 `setAnalyticsUser`：

```tsx
import { setAnalyticsUser, clearAnalyticsUser } from '@clipop/analytics';

// 登录成功后
useEffect(() => {
  if (user) {
    setAnalyticsUser({ id: user.id, email: user.email, name: user.name });
  } else {
    clearAnalyticsUser();
  }
}, [user]);
```

### 2. 定义漏斗步骤

使用 `defineFunnel` + `buildFunnelSteps` 创建类型安全的步骤常量：

```ts
import { defineFunnel, buildFunnelSteps } from '@clipop/analytics';

const VIDEO_FUNNEL = defineFunnel('video_generation', 'Video Funnel', [
  { event: 'page_view_home', step: 1 },
  { event: 'click_analyze', step: 2 },
  { event: 'analyze_success', step: 3 },
  { event: 'clip_download', step: 4 },
]);

const STEPS = buildFunnelSteps(VIDEO_FUNNEL, {
  HOME: 1,
  CLICK: 2,
  SUCCESS: 3,
  DOWNLOAD: 4,
});
```

### 3. 埋点调用

```tsx
import { trackEvent } from '@clipop/analytics';

// 首页访问
trackEvent(STEPS.HOME);

// 点击 Analyze 按钮
trackEvent(STEPS.CLICK, { eventData: { source_type: 'youtube' } });

// AI 生成成功
trackEvent(STEPS.SUCCESS, { eventData: { video_id: 'xxx', duration: 120 } });

// 下载短视频
trackEvent(STEPS.DOWNLOAD);
```

### 4. 自定义事件（非漏斗）

```ts
import { trackCustomEvent } from '@clipop/analytics';

trackCustomEvent('user_signup', { eventData: { method: 'google' } });
```

### 5. Session 管理

```ts
import { getSessionId, regenerateSession } from '@clipop/analytics';

// 获取当前 session id
const sid = getSessionId();

// 用户登录后强制生成新 session
regenerateSession();
```

## 服务端 SDK 使用示例

### 1. 创建 API 路由

```ts
// app/api/events/track/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAppConfig } from '@/lib/config';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.event_name) {
    return NextResponse.json({ error: 'event_name required' }, { status: 400 });
  }

  const config = getAppConfig();
  const url = config.supabaseUrl;
  const key = config.supabaseServiceRoleKey || config.supabaseAnonKey;
  if (!url || !key) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userAgent = request.headers.get('user-agent') || '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '';

  const { error } = await client.from('behavior_events').insert({
    event_name: String(body.event_name).slice(0, 100),
    funnel_id: body.funnel_id || null,
    step_index: body.step_index || null,
    event_data: body.event_data || {},
    session_id: body.session_id || 'anonymous',
    user_id: body.user_id || null,
    user_email: body.user_email || null,
    page_url: (body.page_url || '').slice(0, 500),
    referrer: (body.referrer || '').slice(0, 500),
    user_agent: userAgent.slice(0, 500),
    ip: ip.slice(0, 50),
  });

  if (error) return NextResponse.json({ ok: true, skipped: true });
  return NextResponse.json({ ok: true });
}
```

### 2. 在支付 webhook 中使用

```ts
import { trackServerConversion } from '@clipop/analytics';
import { createClient } from '@supabase/supabase-js';
import { getAppConfig } from '@/lib/config';

// 在 PayPal/Stripe webhook 处理中
export async function handlePaymentSuccess(userId: string, planId: string, orderId: string) {
  const config = getAppConfig();
  const client = createClient(config.supabaseUrl!, config.supabaseServiceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 幂等：相同 provider + orderId 不会重复写入
  await trackServerConversion(config, client, {
    userId,
    planId,
    provider: 'paypal',
    orderId,
    amount: 9.9,
  });
}
```

### 3. 通用服务端事件

```ts
import { trackServerEvent } from '@clipop/analytics';

await trackServerEvent(config, client, {
  eventName: 'video_processed',
  sessionId: `server_job_${jobId}`,
  userId,
  eventData: { video_id: 'xxx', duration: 120 },
});
```

## 漏斗配置

漏斗定义通过 `AppConfig.funnels` 传入，admin 包的行为数据页会自动读取并渲染。

```ts
import { defineFunnel, DEFAULT_FUNNELS } from '@clipop/analytics';

// 使用默认漏斗
const funnels = DEFAULT_FUNNELS;

// 或自定义
const myFunnel = defineFunnel('onboarding', 'Onboarding Funnel', [
  { event: 'signup', step: 1 },
  { event: 'profile_complete', step: 2 },
  { event: 'first_action', step: 3 },
]);
```

## License

MIT
