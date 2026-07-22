# @clipop/admin

通用后台管理面板：数据统计、用户管理、付费管理、行为数据。零品牌耦合，通过 `useAppConfig()` 注入配置。

## 设计原则

- **零品牌耦合**：不包含任何 VidShorter / Clipop 品牌代码
- **不使用 shadcn/ui**：原生 HTML + Tailwind CSS
- **不直接读 process.env**：所有配置通过 `useAppConfig()` 或参数传入
- **表名可定制**：通过 `AdminConfig.tables` 覆盖默认表名
- **'use client' / SERVER-ONLY 标记清晰**

## 安装

在 monorepo 中通过 workspace 引用：

```json
{
  "dependencies": {
    "@clipop/admin": "workspace:*",
    "@clipop/core": "workspace:*",
    "@clipop/auth": "workspace:*"
  }
}
```

## 配置

通过 `AppConfigProvider` 注入配置。admin 包额外读取以下字段：

```tsx
import { AppConfigProvider } from '@clipop/core';

<AppConfigProvider
  value={{
    appName: 'MyApp',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    admin: {
      adminEmails: ['admin@myapp.com'],
      adminApiKey: process.env.ADMIN_API_KEY, // 可选
      loginPath: '/login',
    },
    plans: [
      { id: 'free', name: 'Free', priceIntl: 0, priceCny: 0, dailyCredits: 100, features: [] },
      { id: 'starter', name: 'Starter', priceIntl: 9.9, priceCny: 49, dailyCredits: 500, features: [] },
      { id: 'pro', name: 'Pro', priceIntl: 19.9, priceCny: 99, dailyCredits: 1000000, features: [] },
    ],
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
    ],
  }}
>
  <YourApp />
</AppConfigProvider>
```

### 表名覆盖

如果数据库使用了非默认表名，通过 `tables` 字段覆盖：

```ts
import type { AdminConfig } from '@clipop/admin';

const config: AdminConfig = {
  ...appConfig,
  tables: {
    users: 'app_users',           // 默认 'users'
    credits: 'user_credits',      // 默认 'credits'
    creditTransactions: 'tx_log', // 默认 'credit_transactions'
    // subscriptions, videos, behaviorEvents 同理
  },
};
```

## API 路由列表

host 应用需创建以下 API 路由，调用对应的 server 函数：

| 路由 | 方法 | Server 函数 |
|------|------|-------------|
| `/api/admin/analytics` | GET | `fetchAnalytics(config, client)` |
| `/api/admin/users` | GET | `listUsers(config, client, opts)` |
| `/api/admin/users/[id]` | GET / PATCH / DELETE | `getUserDetail` / `updateUser` / `deleteUser` |
| `/api/admin/payments` | GET | `listPayments(config, client, opts)` |
| `/api/admin/payments/transactions` | GET | `listTransactions(config, client, opts)` |
| `/api/admin/events` | GET | `fetchBehaviorEvents(config, client, opts)` |
| `/api/admin/verify` | POST | `isAdminFromToken(config, token)` |
| `/api/init-admin` | POST | `initAdmin(config, input)` |

### 路由示例

```ts
// app/api/admin/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAppConfig } from '@/lib/config';
import { requireAdmin, fetchAnalytics } from '@clipop/admin';

export async function GET(request: NextRequest) {
  const config = getAppConfig();
  try {
    const { client } = await requireAdmin(config, request);
    const stats = await fetchAnalytics(config, client);
    return NextResponse.json(stats);
  } catch (err) {
    const status = (err as Error & { status?: number }).status || 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
```

## 数据库表结构

admin 包期望以下表（可通过 `tables` 配置覆盖名称）：

### users
- `id` (TEXT/UUID), `email` (TEXT), `name` (TEXT), `role` (TEXT: 'admin'|'user')
- `avatar_url`, `google_id`, `is_active` (BOOL), `created_at` (TIMESTAMPTZ)

### credits
- `id`, `user_id`, `balance` (INT), `last_reset_at`

### subscriptions
- `id`, `user_id`, `plan_type` (TEXT), `status` (TEXT: 'active'|'cancelled'|'expired')

### credit_transactions
- `id`, `user_id`, `amount` (INT), `type` (TEXT), `description` (TEXT), `created_at`
- `type='purchase'` 的记录用于营收计算，`description` 中需包含 plan id 以匹配价格

### videos (可选)
- `id`, `user_id`, `created_at`
- 用于活跃用户和留存率计算

### behavior_events
- 详见 `@clipop/analytics` 包的 SQL 建表语句

## 扩展菜单

通过 `extraNavItems` 注入额外菜单项（如博客管理）：

```tsx
import { AdminDashboard } from '@clipop/admin';
import { BlogManager } from '@clipop/blog';

function AdminPage() {
  return (
    <AdminDashboard
      token={accessToken}
      locale="zh"
      onLogout={handleLogout}
      extraNavItems={[
        {
          id: 'blog',
          label: { zh: '博客管理', en: 'Blog' },
          icon: <FileText className="w-5 h-5" />,
          component: <BlogManager token={accessToken} />,
        },
      ]}
    />
  );
}
```

## 漏斗配置

漏斗定义在 `config.funnels` 中，行为数据页会自动读取并渲染对应的漏斗卡片：

```ts
funnels: [
  {
    id: 'video_generation',
    name: '视频生成漏斗',
    steps: [
      { event: 'page_view_home', step: 1 },
      { event: 'click_analyze', step: 2 },
      { event: 'analyze_success', step: 3 },
      { event: 'clip_download', step: 4 },
    ],
  },
  {
    id: 'subscription',
    name: '订阅付费漏斗',
    steps: [
      { event: 'page_view_pricing', step: 1 },
      { event: 'click_subscribe', step: 2 },
      { event: 'subscribe_success', step: 3 },
    ],
  },
]
```

## License

MIT
