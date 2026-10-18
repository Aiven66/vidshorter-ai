# TikTok 链接 → AI 二创（SEO 拉新）实施方案

## Context

**为什么做**：产品（Clipop AI，生产域 www.clipopai.com）需要一个高搜索量的自然流量入口来拉新。"tiktok downloader" 是超高搜索量词，但**纯下载器方案被否决**，原因有三：

1. **合规是运营级风险**：整站跑在 Vercel 上，Vercel ToS 明确禁止侵权用途，一次 DMCA 投诉可能停掉整个生产环境，连带打死高光剪辑与 AI 成片全部业务；且 Apple/Google 对 TikTok downloader 类应用基本直接拒审（CI 正在打 APK）。
2. **与自家条款冲突**：现有服务条款已明文禁止"侵犯版权/商标、深度伪造"。
3. **成本不可控**：TikTok 反爬（`X-Bogus`/`msToken` 轮换、数据中心 IP 高封锁）需住宅代理 + 常驻维护，与 YouTube 的稳定路径不在一个量级。

**改为做什么**：用户粘贴 TikTok 链接 → 服务端仅通过 **TikTok 官方 oEmbed** 取元数据（标题/作者/封面）→ LLM 拆解出「选题 / 前 3 秒钩子 / 叙事结构 / 情绪曲线 / 建议二创角度」→ 一键预填进**现有** `/api/ai-video` 管线生成用户自己的原创竖屏视频。

**预期结果**：获得一批可被搜索引擎收录的高质量落地页（覆盖 TikTok 二创类长尾词），流量进入后经"免费拆解 → 付费生成"动线转化，全程不触碰版权红线与反爬。

## 合规红线（硬约束，实现时不可突破）

- **不下载、不转存、不代理**任何 TikTok 视频/音频文件。
- **不去水印**、不做批量搬运。
- 仅调用官方 oEmbed；页面必须展示原作者署名与回链（`rel="nofollow noopener"`）。
- 不引入 yt-dlp / puppeteer / 住宅代理 / 按月付费第三方 API。
- 不做 ASR（服务端无通用音频转写能力，`subtitles.ts` 仅支持 YouTube 官方字幕）。

## 决策（用户已授权按推荐项执行）

| 决策点 | 选定 |
|---|---|
| 页面结构 | 落地页集群：主页面 + 8 个模版子页（单一页面模板 + 内容数据驱动，避免手写 9 个页面） |
| 拆解接口计费 | 免费匿名 + 按 `videoId` 缓存 + 严格限流（重复/爬虫流量不重复烧 token） |
| 主 slug | `/tiktok-remix` |
| 语言覆盖 | SEO 正文只做 en / zh / zh-Hant，其余 29 语自动回落英文 |

## 架构与数据流

```
用户粘贴 TikTok URL
  └─ POST /api/tiktok-breakdown  { url, locale, topicHint? }
       ├─ parseTikTokUrl()      校验域名白名单 + 提取 videoId（短链仅读 3xx Location，不跟随、不下媒体）
       ├─ fetchTikTokOEmbed()   官方 oEmbed → title/author_name/author_url/thumbnail_url（5s 超时 + 1h 内存缓存）
       └─ generateTikTokBreakdown()  LLM → 结构化 JSON；失败回落本地结构模版
  └─ 前端展示：选题 + 钩子 + 结构 + 建议二创角度 + 署名回链
       └─ CTA「用这个选题生成我的原创成片」
            └─ POST /api/ai-video  { topic: derivedTopic, template, locale }   ← 复用既有管线，不改动
                 └─ 沿用既有 401→登录、402→InsufficientCreditsDialog 门控
```

## 实施步骤

### Step 1 — 服务端 TikTok 工具库（新增，可与 Step 2/3 并行）
- `src/lib/server/tiktok/url.ts` — `parseTikTokUrl(input): {videoId, canonicalUrl} | null`
  - 主机白名单：`tiktok.com` / `www.` / `m.` / `vm.tiktok.com` / `vt.tiktok.com`；强制 https。
  - 正则匹配 `/@[\w.\-]+/video/(\d+)`、`/video/(\d+)`、`/t/(\w+)`；显式拒绝 `/photo/` 与音频页。
  - 短链：`fetch(url, { method:'GET', redirect:'manual', signal: AbortSignal.timeout(4000) })`，**只读** 3xx 的 `Location`，二次校验目标仍是 `*.tiktok.com` 且路径含 `/video/{id}`。
- `src/lib/server/tiktok/oembed.ts` — `fetchTikTokOEmbed(canonicalUrl)`
  - GET `https://www.tiktok.com/oembed?url=<canonical>`，5s 超时，内存 `Map` TTL 1h 缓存。
  - 返回 `title / author_name / author_url / thumbnail_url`；失败返回 `null`（由上层标记 `degraded`）。

### Step 2 — LLM 拆解（新增，依赖 Step 1）
- `src/lib/server/tiktok/breakdown.ts` — `generateTikTokBreakdown({ title, author, topicHint, locale })`
  - 复用 `openAiChat`（[llm.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/llm.ts)）与 `getLlmConfig()`（`src/lib/server/model-config*`）。
  - 严格 JSON 契约：
    `{ derivedTopic, hook:{type,text,why}, structure:[{beat,role}], emotionCurve:[{phase,level}], remixAngles:[{angle,templateId,rationale}], searchKeywords:string[] }`
  - `templateId` 必须经 `resolveAiVideoTemplate()`（[ai-video-templates.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/ai-video-templates.ts)）白名单校验。
  - LLM 缺失/解析失败 → 本地结构模版兜底，对齐 [script.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/ai-video/script.ts) 的 `engine:'local'` 范式。
  - **不**调用 `generateAiVideoScript`（避免重复出片），成片仍走既有管线。

### Step 3 — 拆解 API（新增，依赖 Step 1、2）
- `src/app/api/tiktok-breakdown/route.ts`，`runtime='nodejs'`。
  - 入参 `{ url, locale, topicHint? }`；出参 `{ ok, video:{...}, breakdown, engine:'llm'|'local', degraded:boolean }`。
  - URL 非法 → 400 `invalid_tiktok_url`；oEmbed 失败 → 200 + `degraded:true` + 本地兜底（**页面永不空转**）。
  - **免费、不鉴权、不扣费**；限流先查仓库是否已有工具（参照 `src/lib/server/` 现有约定），无则用简单内存 `Map` 按 IP 限速；结果按 `videoId` 缓存。

### Step 4 — SEO 落地页集群（依赖 Step 3；UI 骨架可先行）
- `src/app/tiktok-remix/layout.tsx` — `buildMetadata({ title, description, path:'/tiktok-remix', keywords })`（对齐 [video-clips/layout.tsx](file:///Users/aiven/Desktop/AI/codex/projects/src/app/video-clips/layout.tsx)），并注入 FAQPage / HowTo / BreadcrumbList JSON-LD。
- `src/app/tiktok-remix/page.tsx` — **SSR 正文**（H1/H2、How-it-works、合规声明、SSR 版 FAQ——不可用 `ssr:false` 的客户端 FAQ，否则丢 SEO）+ 挂载客户端工作台。
- `src/app/tiktok-remix/[template]/page.tsx` — 8 个模版子页，靠 `generateStaticParams()` 静态化；正文由 Step 4 的内容模块驱动，针对各模版的长尾词。
- `src/components/tiktok/tiktok-remix-studio.tsx` — `'use client'`，参照 [client-video-processor.tsx](file:///Users/aiven/Desktop/AI/codex/projects/src/components/home/client-video-processor.tsx) 与 `src/app/ai-video/page.tsx` 的输入/预览/错误态模式。
- `src/lib/tiktok-remix-content.ts` — en/zh/zh-Hant 三语文案 + 子页内容数据（**不塞进 `i18n.ts`**）。
- 修改 `src/app/sitemap.ts`：`PUBLIC_ROUTES` 追加 `/tiktok-remix` 与 8 个子页（`priority:0.9` / `0.7`，`changeFrequency:'weekly'`）。
- `src/app/robots.ts` **无需改动**（`/api/` 已屏蔽，新页为公开路径）。

### Step 5 — 转化动线（依赖 Step 4）
免费拆解展示 `derivedTopic` + 建议模版 → CTA「用这个选题生成我的原创成片」预填 `topic=derivedTopic`、`template=remixAngles[0].templateId`、`locale`，POST 既有 `/api/ai-video`（复用其 `topic/locale/template/bgmMood` 字段与 `X-Ai-Video-*` 响应头）。**导出付费墙与积分逻辑一律不动。**

### Step 6 — 合规落地（与 Step 4/5 并行）
- 页面上两处声明：输入框下方 + 成片区上方（不复用/不下载/不转存，仅用官方 oEmbed 元数据；二创内容为原创，发布前请自审）。
- 预览卡展示 `author_name` + `author_url` 外链（`rel="nofollow noopener"`）与「封面与信息来自 TikTok 官方 oEmbed」。
- `src/app/terms/page.tsx` 新增一节，`src/lib/i18n.ts` 补对应 `terms.*` 键（en/zh/zh-Hant）。

## 复用清单（不要新造）

| 复用对象 | 位置 | 用途 |
|---|---|---|
| `buildMetadata()` | [seo.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/seo.ts#L30-L54) | 页面 metadata / canonical / OG |
| `PUBLIC_ROUTES` | [sitemap.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/app/sitemap.ts#L4-L31) | 收录新页面 |
| `openAiChat` / `getLlmConfig()` | `src/lib/server/llm.ts` | LLM 拆解通道（无需新增 Key） |
| `AI_VIDEO_TEMPLATES` / `resolveAiVideoTemplate` | [ai-video-templates.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/ai-video-templates.ts) | 二创角度 → 模版白名单校验 |
| `/api/ai-video` | [route.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/app/api/ai-video/route.ts) | 成片生成（零改动） |
| 401 / 402 门控与弹窗 | `plan-gate.ts` / `InsufficientCreditsDialog` | 登录与积分不足引导 |
| i18n 回落机制 | [i18n.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/i18n.ts) `translations[locale][key] \|\| translations[defaultLocale][key] \|\| key` | 其余 29 语自动回落英文 |

## 验证方案

**本地**
1. `pnpm dev` → 访问 `/tiktok-remix` 及一个子页（如 `/tiktok-remix/growth`）；`view-source` 确认 `canonical` 与 `application/ld+json` 存在且合法。
2. 拆解接口：
   `curl -sX POST localhost:3000/api/tiktok-breakdown -H 'Content-Type: application/json' -d '{"url":"https://www.tiktok.com/@tiktok/video/<id>","locale":"en"}'`
   → 期望 200 且 `breakdown.remixAngles[].templateId` 均在白名单内。
3. 短链用例：同一条用 `vm.tiktok.com` 短链请求，应返回**相同 `videoId`**。
4. 降级用例：非法域名 → 400；不可达/私密视频 → 200 且 `degraded:true`、`engine:'local'`，页面不空转。
5. `/sitemap.xml` 包含新路径；`pnpm build` 通过（子页被静态化）。
6. `pnpm ts-check`：基线 **212 errors**，改动文件零新增。
7. `pnpm test:home-i18n`（若与新文案相关）保持通过。

**生产**
- Lighthouse / PSI：SEO ≥ 95；Rich Results 测试 FAQ/HowTo 无报错。
- GSC 提交并确认收录；确认 oEmbed 被限流时页面正常降级。
- 确认署名与回链可见、合规声明在首屏与成片区各出现一次。

## 风险与降级

| 风险 | 处置 |
|---|---|
| oEmbed 对私密/已删除/地区限制视频返回 4xx | 200 + `degraded:true` + 本地结构模版兜底；提示用户可手填 `topicHint` |
| oEmbed 对 Vercel 数据中心 IP 限流/挑战 | 1h 内存缓存 + 限流；失败即降级，绝不阻塞页面 |
| 短链跳转规则变更 | 域名白名单二次校验；校验失败按非法 URL 处理 |
| FAQ 富结果被 Google 收窄 | 仍保留合法标记，不依赖富结果获取排名 |
| 匿名接口被刷 token | 按 IP 限流 + 按 `videoId` 缓存（同一视频只算一次） |

## 明确不做

视频下载 / 去水印 / 转存 / 代理 / 批量搬运；ASR 或音频转写；YouTube 之外平台的取流扩展；yt-dlp / puppeteer / 住宅代理 / 月费第三方 API；改动既有 `/api/ai-video`、`plan-gate.ts`、导出付费墙逻辑。

## 长尾关键词布局（写入内容模块）

- **en**：tiktok video remaker / tiktok hook analyzer / rewrite tiktok video / tiktok script breakdown / tiktok video to original short
- **zh**：TikTok 视频拆解 / 前 3 秒钩子分析 / 短视频选题拆解工具 / 视频二创生成 / TikTok 链接生成原创视频