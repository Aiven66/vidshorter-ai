# VidShorter AI - 项目上下文

### 项目简介

VidShorter AI 是一个 AI 驱动的长视频转短视频平台。用户可以输入 YouTube/B站视频链接或上传本地视频，AI 自动分析视频亮点并生成精彩短视频片段。

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Database**: PostgreSQL (via Supabase)
- **AI**: LLM (doubao-seed models)
- **Video Processing**: coze-coding-dev-sdk

## 目录结构

```
├── public/                     # 静态资源
├── scripts/                    # 构建与启动脚本
├── src/
│   ├── app/                    # 页面路由与布局
│   │   ├── page.tsx            # 首页 (视频处理)
│   │   ├── login/              # 登录页面
│   │   ├── register/           # 注册页面
│   │   ├── blog/               # 博客页面
│   │   ├── pricing/            # 定价页面
│   │   ├── dashboard/          # 用户控制台
│   │   ├── admin/              # 管理后台
│   │   ├── api/                # API 路由
│   │   │   ├── init-admin/     # 初始化管理员
│   │   │   └── process-video/  # 视频处理 API
│   │   └── auth/callback/      # OAuth 回调
│   ├── components/             # 组件
│   │   ├── ui/                 # Shadcn UI 组件库
│   │   ├── navbar.tsx          # 导航栏
│   │   └── footer.tsx          # 页脚
│   ├── hooks/                  # 自定义 Hooks
│   ├── lib/                    # 工具库
│   │   ├── utils.ts            # 通用工具函数
│   │   ├── i18n.ts             # 国际化配置
│   │   ├── auth-context.tsx    # 认证上下文
│   │   ├── credits-context.tsx # 积分上下文
│   │   └── locale-context.tsx  # 语言上下文
│   └── storage/database/       # 数据库
│       ├── supabase-client.ts  # Supabase 客户端
│       └── shared/schema.ts    # 数据库 Schema
├── next.config.ts              # Next.js 配置
├── package.json                # 项目依赖管理
└── tsconfig.json               # TypeScript 配置
```

## 数据库模型

### users - 用户表
- id, email, name, password_hash, role (admin/user), google_id, avatar_url

### credits - 积分表
- id, user_id, balance, last_reset_at

### videos - 视频表
- id, user_id, original_url, source_type, status, highlights

### short_videos - 短视频表
- id, video_id, user_id, url, start_time, end_time, highlight_title, highlight_summary

### blogs - 博客表
- id, title, category, content, cover_image, author_id, is_published

### subscriptions - 订阅表
- id, user_id, plan_type (free/basic/pro), status, stripe_subscription_id

### credit_transactions - 积分交易记录
- id, user_id, amount, type, description

## 功能模块

### 1. 首页 (视频处理)
- 支持输入 YouTube/B站视频链接
- 支持上传本地视频文件
- AI 分析视频亮点
- 生成短视频片段
- 支持预览和下载

### 2. 用户认证
- 邮箱注册/登录
- Google OAuth 登录
- 管理员账户: admin@vidshorter.ai / admin123

### 3. 积分系统
- 每天赠送 300 积分
- 每次处理消耗 30 积分
- 每天上午 8 点重置

### 4. 订阅计划
- Free: 免费 300 积分/天
- Basic: $19/月, 1000 积分/天
- Pro: $49/月, 无限积分

### 5. 博客系统
- 博客文章展示
- 管理后台发布文章 (仅管理员)
- 支持 HTML 富文本内容

### 6. 国际化
- 支持中文/英文切换
- 默认语言: 英文

## 包管理规范

**仅允许使用 pnpm** 作为包管理器

## 开发规范

- **Hydration 错误预防**: 使用 'use client' + useEffect + useState
- **颜色使用**: 使用 globals.css 中的主题变量，禁止硬编码颜色
- **字体**: 使用语义化变量 (bg-background, text-foreground)
