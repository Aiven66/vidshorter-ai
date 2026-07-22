# @clipop/packages

通用组件库，从 [VidShorter AI / Clipop AI](../) 项目提炼，可被任意 Next.js + Supabase + Tailwind 项目复用。

## 目录

| 包 | 说明 |
|---|---|
| [`@clipop/core`](./core) | 共享内核：类型定义、配置注入、Supabase 工厂、工具函数 |
| [`@clipop/auth`](./auth) | 认证体系：邮箱密码、Google OAuth、桌面客户端桥接、Admin Gate |
| [`@clipop/payments`](./payments) | 支付体系：PayPal/Creem/Alipay/WeChat 多通道 + 积分 + 订阅 |
| [`@clipop/blog`](./blog) | 博客体系：CRUD、HTML 富文本净化、多语言翻译、封面上传 |
| [`@clipop/admin`](./admin) | 管理后台：数据统计、用户管理、付费管理、行为数据 |
| [`@clipop/analytics`](./analytics) | 行为追踪：SDK + 漏斗 + Session 管理 |
| [`@clipop/feedback`](./feedback) | 用户反馈：提交、列表、管理审核 |

## 设计原则

1. **零业务耦合** — 不出现任何 VidShorter / Clipop 品牌字符串，所有 app-specific 值通过 `AppConfigProvider` 注入。
2. **配置注入** — 包内代码不读 `process.env`，所有环境特定值由 host 通过 `<AppConfigProvider value={...}>` 提供。
3. **降级兼容** — Supabase 未配置时返回 placeholder，应用不崩溃；token 缺失时进入 demo 模式。
4. **类型安全** — 全部 TypeScript，公开 API 完整类型定义。
5. **零 UI 框架依赖** — 不依赖 shadcn/ui，只用原生 HTML + Tailwind 语义化变量，可在任意 Tailwind 项目使用。
6. **App Router 友好** — 所有客户端组件标注 `'use client'`，服务端模块标注 `SERVER-ONLY`。

## 快速接入

### 1. 复制 packages 目录到你的项目

```bash
cp -r packages/ /path/to/your-project/
```

### 2. 安装 peer 依赖

```bash
pnpm add @supabase/supabase-js react lucide-react
```

### 3. 在 layout 包裹 AppConfigProvider

```tsx
// app/providers.tsx
'use client';

import { AppConfigProvider } from '../packages/core/config';
import { AuthProvider } from '../packages/auth/auth-provider';
import { CreditsProvider } from '../packages/payments/credits-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppConfigProvider
      value={{
        appName: 'MyApp',
        appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY, // server-only
        admin: {
          adminEmails: ['admin@myapp.com'],
          loginPath: '/login',
        },
        desktop: { enabled: true, scheme: 'myapp' },
        plans: [
          { id: 'free', name: 'Free', priceIntl: 0, priceCny: 0, dailyCredits: 100, features: ['Basic features'] },
          { id: 'pro', name: 'Pro', priceIntl: 19.9, priceCny: 99, dailyCredits: 1_000_000, unlimitedCredits: true, badge: 'Popular', features: ['All features'] },
        ],
        paymentChannels: [
          { provider: 'paypal', enabled: true, config: { clientId: process.env.PAYPAL_CLIENT_ID || '' } },
          { provider: 'creem', enabled: true, config: { apiKey: process.env.CREEM_API_KEY || '' } },
        ],
        funnels: [
          {
            id: 'signup',
            name: 'Signup Funnel',
            steps: [
              { event: 'page_view_home', step: 1 },
              { event: 'click_signup', step: 2 },
              { event: 'signup_success', step: 3 },
            ],
          },
        ],
      }}
    >
      <AuthProvider>
        <CreditsProvider>
          {children}
        </CreditsProvider>
      </AuthProvider>
    </AppConfigProvider>
  );
}
```

### 4. 使用各包组件

```tsx
// app/login/page.tsx
import { LoginForm } from '../packages/auth/login-form';

export default function LoginPage() {
  return <LoginForm redirectTo="/dashboard" showRegisterLink />;
}

// app/pricing/page.tsx
import { PricingPage } from '../packages/payments/pricing-page';

export default function PricingPage() {
  return <PricingPage />;
}

// app/blog/page.tsx
import { BlogListPage } from '../packages/blog/blog-list-page';

export default function BlogPage() {
  return <BlogListPage />;
}

// app/admin/page.tsx
import { AdminDashboard } from '../packages/admin/admin-dashboard';
import { AdminFeedbackManager } from '../packages/feedback/admin-feedback-manager';

export default function AdminPage() {
  return (
    <AdminDashboard
      extraNavItems={[
        {
          id: 'feedback',
          label: { zh: '反馈', en: 'Feedback' },
          component: <AdminFeedbackManager token={token} />,
        },
      ]}
    />
  );
}
```

## API 路由清单（host 需提供）

每个包都假定 host 项目实现对应的 API 路由。详细列表见各包 README。

| 路由 | 用于 | 方法 |
|---|---|---|
| `/api/check-email` | auth | POST |
| `/api/send-verification-code` | auth | POST / PUT |
| `/api/admin/verify` | auth (AdminGate) | POST |
| `/api/init-admin` | admin | POST |
| `/api/admin/analytics` | admin | GET |
| `/api/admin/users` | admin | GET |
| `/api/admin/users/[id]` | admin | GET / PATCH / DELETE |
| `/api/admin/payments` | admin | GET |
| `/api/admin/events` | admin | GET |
| `/api/payment/{creem,paypal,alipay,wechat}` | payments | POST |
| `/api/payment/creem/webhook` | payments | POST |
| `/api/blog/posts` | blog | GET / POST / PATCH / DELETE |
| `/api/blog/posts/[id]` | blog | GET / PATCH |
| `/api/blog/[id]` | blog | DELETE |
| `/api/blog/html-publish` | blog | POST |
| `/api/blog/upload-cover` | blog | POST |
| `/api/blog/translate` | blog | POST |
| `/api/events/track` | analytics | POST |
| `/api/feedback` | feedback | GET / POST / PATCH |

## 数据库表结构

完整 SQL 脚本位于各包的 `sql.ts` 或 schema 文件，host 需在 Supabase 中执行。

| 表 | 包 | 说明 |
|---|---|---|
| `users` | core / auth | 用户表 (id, email, name, role, google_id, avatar_url) |
| `credits` | payments | 积分表 (user_id, balance, last_reset_at) |
| `subscriptions` | payments | 订阅表 (user_id, plan_type, status) |
| `credit_transactions` | payments | 交易记录 (user_id, amount, type, description) |
| `blogs` | blog | 博客表 (title, category, content, locale, parent_id) |
| `behavior_events` | analytics | 行为事件 (session_id, event_name, funnel_id, step_index) |
| `feedbacks` | feedback | 反馈表 (user_id, content, rating, status) |

## 桌面客户端集成

`@clipop/auth` 内置桌面客户端桥接，支持 Electron / macOS Agent / Android 三端：

1. 桌面客户端在 WebView 注入 bridge 对象 `window.clipopDesktop`（或 `electronAPI` / `api` / `agent`）：
   ```ts
   interface DesktopBridge {
     getAuthToken(): Promise<string>;
     clearAuthToken(): Promise<{ ok: boolean }>;
     openWebLogin(): Promise<{ ok: boolean }>;
     getMediaBaseUrl(): Promise<string>;
   }
   ```

2. 桌面客户端启动本地回调服务器 `http://127.0.0.1:port/api/desktop-auth` 接收 token。

3. 注册 deep-link scheme（如 `myapp://`），桌面客户端拦截 `myapp://login-success?token=...` 自动登录。

4. Web 端通过 `AppConfigProvider` 启用：
   ```tsx
   desktop: {
     enabled: true,
     scheme: 'myapp',
   }
   ```

详细文档见 [`@clipop/auth/README.md`](./auth/README.md)。

## 包依赖关系

```
                  ┌──────────┐
                  │  @clipop │
                  │   /core  │
                  └────┬─────┘
        ┌──────┬──────┼──────┬──────┬─────────┐
        ▼      ▼      ▼      ▼      ▼         ▼
      auth  payments blog  admin analytics feedback
        │      │              │
        └──────┤              │
               ▼              │
            (admin uses auth's AdminGate)
```

- 所有上层包依赖 `@clipop/core`。
- `@clipop/admin` 通过 `extraNavItems` 机制可嵌入 `@clipop/blog` 的 `AdminBlogManager` 和 `@clipop/feedback` 的 `AdminFeedbackManager`。
- `@clipop/payments` 调用 `@clipop/analytics` 的 `trackServerConversion` 触发订阅漏斗（可选）。

## 迁移到 monorepo workspace（可选）

当前 `packages/*` 是源码目录，host 通过相对路径 import。若要转为正式的 pnpm workspace：

1. 在项目根创建 `pnpm-workspace.yaml`：
   ```yaml
   packages:
     - 'packages/*'
   ```

2. 在 host `package.json` 添加依赖：
   ```json
   {
     "dependencies": {
       "@clipop/core": "workspace:*",
       "@clipop/auth": "workspace:*",
       "@clipop/payments": "workspace:*",
       "@clipop/blog": "workspace:*",
       "@clipop/admin": "workspace:*",
       "@clipop/analytics": "workspace:*",
       "@clipop/feedback": "workspace:*"
     }
   }
   ```

3. 运行 `pnpm install` 链接 workspace。

4. import 路径从 `../packages/core/config` 改为 `@clipop/core/config`。

## License

MIT
