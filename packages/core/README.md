# @clipop/core

通用组件库的共享核心，提供类型定义、Supabase 客户端工厂、配置注入接口。

所有上层包（auth / payments / blog / admin / feedback / analytics）都依赖此包。

## 设计原则

- **零业务耦合**：不包含任何 VidShorter / Clipop 品牌相关代码
- **配置注入**：通过 `Provider` 模式接收外部配置，避免读取 process.env
- **降级兼容**：Supabase 未配置时返回 placeholder，应用不崩溃
- **类型安全**：所有公开 API 都有完整 TypeScript 类型

## 模块

- `types.ts` — 共享类型定义（User / Plan / Locale 等）
- `config.ts` — 配置注入接口（`ConfigProvider` / `useConfig`）
- `supabase.ts` — Supabase 客户端工厂（单例 + token 注入 + placeholder 降级）
- `utils.ts` — 通用工具函数

## 使用

```tsx
import { ConfigProvider, useConfig } from './packages/core/config';

function App() {
  return (
    <ConfigProvider
      value={{
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        appName: 'MyApp',
        appUrl: 'https://myapp.com',
        adminEmails: ['admin@myapp.com'],
      }}
    >
      <YourApp />
    </ConfigProvider>
  );
}
```

## License

MIT
