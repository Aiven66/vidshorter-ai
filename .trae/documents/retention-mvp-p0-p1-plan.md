# Clipop AI 留存提升版（v-retention）实现计划

## Context

Clipop AI 是面向**海外 C 端**的产品（www.clipopai.com），用户把 YouTube 长视频转成可发布到 TikTok / Reels / Shorts 的短视频。当前最大问题是**新增留存率过低**，诊断出三个流失断点：

1. **激活断点** — 免费用户每天 60 积分 = **仅 1 次生成机会**，失败或结果不满意当天就没有补救手段，且必须注册才能开始。
2. **价值断点** — 一次生成多条候选，但界面不告诉用户「发哪条」，也不排序，决策成本高。
3. **回访断点** — 没有发布标记、没有数据回流、没有作品沉淀，用户第二天没有理由再打开。

本版目标是打通这三处，形成「免费可试 → 首次产出即可发布 → 有理由回来」的最小闭环。

**已确认范围（5 项）**：P0-1 失败零损失、P0-2 免登录试跑、P0-3 精彩度评分+TopN+AI hook 标题、P0-6 免费成片可发布级、P1-2 本地标记+手动回填。

**硬约束**
- 项目**无 DDL 权限**（无 Supabase PAT），禁止新增数据库列/表；`videos` / `short_videos` 的现有列已够用，新增状态一律放 localStorage 或 Supabase Storage。
- 服务端身份裁定唯一入口 `src/lib/server/plan-gate.ts`（fail-closed）；免费额度凭证沿用 `credit_transactions` 流水，不建新表。
- i18n 以 [common.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/i18n/common.ts) 为英文基准，改 locales 只需同步 `zh.ts` / `zh-Hant.ts`（其余语言自动回落英文）。
- push 到 `main` 由 GitHub Actions 自动部署生产。

---

## P0-1 失败零损失（修复扣费/退款缺口）

### 现状（已核实的问题）
- [video-job.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-job.ts#L500-L523) `runClip` 的终态分支：无论 `finalStatus` 是 `completed` 还是 `failed`，都会执行 `deductCreditsOnce` —— **失败也扣费，且从不退款**。
- [status/route.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/app/api/videos/process/status/route.ts#L86-L113) 只在 **STALE 超时**分支调用 `refundIfCharged`；而 `failed` 属于终态集合，STALE 分支不会触发 → 失败任务的 60 积分为**永久损失**。
- `refundIfCharged` 本身实现正确且幂等（[video-refund.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-refund.ts#L25-L57)），只是没有在失败路径被调用。

### 改动
1. [video-job.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-job.ts#L500-L523) `runClip` 终态分支：
   - 扣费改为**仅当 `finalStatus !== 'failed'`** 时执行；
   - `finalStatus === 'failed'` 时调用 `refundIfCharged(client, userId, videoId)`。
2. [video-job.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-job.ts#L380-L400) analyze 步骤的两处失败返回（analysis 异常 / 无高光）也各补一次 `refundIfCharged`（此时通常未扣费，属幂等空操作，仅统一不变式）。
3. [status/route.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/app/api/videos/process/status/route.ts#L86-L113)：`effectiveStatus === 'failed'` 时统一调用 `refundIfCharged`（幂等），并在响应中新增 `creditsRefunded: true`。
4. 前端 [video-processor.tsx](file:///Users/aiven/Desktop/AI/codex/projects/src/components/home/video-processor.tsx#L2514-L2533) 失败提示条内新增一行承诺文案（i18n key `video.failureRefundGuarantee`），例如「未扣费：已退还 60 积分，重试免费」。现有重试按钮（`t('video.retry')`）保留不动。

### 关于「首日重试额度」——不新增机制
`refundIfCharged` 退还 60 积分后，用户当天可**零净成本重试**，这本身已经是「首日重试额度」。**不再新增** grant/allowance 机制，避免过度设计。
需确认的不变式：失败任务不得消耗一次性免费导出额度 —— 现有 `commitFreeExport` 只在成功导出出口调用（[plan-gate.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/plan-gate.ts#L168-L184)），已满足，无需改动，仅加断言注释。

### 验收
- 构造一次失败任务 → `credit_transactions` 中该 `related_id` 同时存在 `video_process`(−60) 与 `refund`(+60)，`credits.balance` 净变化为 0；重复轮询不产生第二条 `refund`。
- 响应含 `creditsRefunded: true`；UI 显示退款承诺；重试成功且不再额外扣费。

---

## P0-2 免登录试跑（真出一条低清预览 + 注册后继承）

### 设计
访客**不注册**即可提交链接，服务端真跑一条 Top1 高光低清预览；其余条目标记为锁定。注册后**继承已算好的分析结果**继续出全集，用户不会「白等一次」。

**关键：访客试跑不落 `videos` 表**（`videos.user_id` 有 FK 约束，虚构 userId 会 23503 崩溃——见项目血泪史）。因此试跑结果全部放 Supabase Storage 私有桶。

### 新增端点 `POST /api/videos/try`
文件：`src/app/api/videos/try/route.ts`（`runtime='nodejs'`，无需鉴权）

- 入参：`{ videoUrl, locale }`
- 流程：
  1. 校验 URL → 复用 `video-job.ts` 内的 YouTube id 提取逻辑（抽为共享工具，避免复制）。
  2. 调用 `video-clipper.ts` 的高光分析（需确认该函数签名可脱离 videos 行独立调用；若强依赖 DB 则抽出一个纯分析函数）。
  3. 按 `engagement_score` 取 Top1 → 以**480p**渲染 1 条片段（复用 `produceClip` + ffmpeg，串行、有超时上限）。
  4. 上传到私有桶 `guest-trials/<trialId>.mp4`，返回短 TTL（2h）签名 URL。
  5. 把完整分析 JSON 写入 `guest-trials/<trialId>.analysis.json`（供注册后继承）。
- 返回：`{ trialId, previewUrl, highlights: top3{title,score,startTime,endTime}, totalHighlights, lockedCount, reasonLabel }`
- **防滥用**：每 IP 每 24h 限 1 次。用私有桶 marker 对象 `/guest-trials/limit-<ipHash>-<yyyymmdd>.json` 判断（复用 `site-config.ts` 的「私有桶 + service role」既有模式），另加请求内 in-memory 并发闸。超限返回 `429 { code:'trial_used' }` 并引导注册。
- 任何环节失败 → 返回明确错误，**不扣费**（访客本无积分）。

### 注册后继承（无缝接上）
1. `VideoJobMessage` 增加可选 `trialId`；[videos/process/route.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/app/api/videos/process/route.ts#L164-L175) 透传。
2. [video-job.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-job.ts) analyze 步骤：若 `trialId` 能取到 `<24h` 且 `original_url` 匹配的 analysis.json，则**跳过 LLM 分析**直接复用；校验失败一律静默回落正常分析（绝不阻断主流程）。

### 前端
- [video-processor.tsx](file:///Users/aiven/Desktop/AI/codex/projects/src/components/home/video-processor.tsx)：未登录时允许提交 → 调 `/api/videos/try` → 渲染单条预览 + N 个锁定占位（模糊 + 锁图标）+ CTA「注册免费解锁全部 N 条」→ 跳 `/register?trial=<trialId>`，同时 `sessionStorage.setItem('clipop_trial', ...)`。
- 登录/注册成功后检测 `sessionStorage.clipop_trial` → 用同一 URL + `trialId` 自动提交并继续轮询。
- [home-start-button.tsx](file:///Users/aiven/Desktop/AI/codex/projects/src/components/home/home-start-button.tsx)：未登录不再强制跳 `/register`，改为滚动到处理器（`#core-video-processor`），保持与已登录一致。

### 验收
- 登出状态粘贴 YouTube 链接 → 约 60–90s 出现 1 条 480p 可播放预览 + 锁定条目 + CTA；同 IP 第二次提交返回「试跑已用，请注册」。
- 从 CTA 注册 → 自动带 `trialId` 开跑 → 出全集；日志可见「复用 trial 分析、跳过 LLM」。

---

## P0-3 精彩度评分 + TopN 排序 + AI hook 标题

### 现状（已核实的缺口）
- LLM/启发式已产出 `engagement_score`(1–10)，但 `normalizeHighlights` 最后**按 `start_time` 重排**（[video-clipper.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-clipper.ts#L394-L394)），分数只存不用。
- 异步 status 路由的 `normalizeClipRows` **丢弃了分数**（[video-status.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-status.ts#L37-L53)），而 UI 却在渲染 `clip.engagementScore/10`（[video-processor.tsx](file:///Users/aiven/Desktop/AI/codex/projects/src/components/home/video-processor.tsx#L2817-L2819)）→ 异步链路下分数实际是 `undefined`。这是既有 bug，正好一并修掉。

### 改动
1. [video-status.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-status.ts#L37-L53) `normalizeClipRows(videoId, rows, highlights?)`：新增可选 `highlights` 参数，按行序（`short_videos` 按 `created_at asc` 插入序 = 高光索引）优先匹配、`start_time` 兜底，回填 `engagementScore`，并附带 `hookTitle = highlight.title`。status 与 batch status 两条链路**共用**，一次修好。
2. [status/route.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/app/api/videos/process/status/route.ts#L115-L127)：把 `highlights` 传入 `normalizeClipRows`，并为每条 clip 返回 `rank`（按分数降序 1..N）。
3. **排序只影响展示，绝不动管线顺序**（下载全部、批量等仍用原 `clips`）：
   - [video-processor.tsx](file:///Users/aiven/Desktop/AI/codex/projects/src/components/home/video-processor.tsx#L2600-L2960)：新增 `rankedClips = [...completedClips].sort((a,b)=>b.engagementScore-a.engagementScore)`；结果区上方渲染「Top 3」突出行，下方「全部片段」网格保持原样；rank 1 打 `Best` 徽标，2/3 打 `#2`/`#3`。
4. **AI hook 标题**：
   - [video-clipper.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-clipper.ts) 分析 prompt：要求输出「好奇心驱动、≤60 字符、不带 hashtag、不虚标」的钩子标题，并给出 1–10 病毒度评分口径（钩子强度 / 情绪回报 / 自洽性 / 可引用性）。
   - 无 LLM 的启发式兜底：把当前「取前 6 个词」改为生成拟钩子标题（[video-clipper.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-clipper.ts#L455-L458)）。
   - 标题经 `short_videos.highlight_title` 回流，**无需 DDL**。
5. i18n：`video.bestPick` / `video.topPicks` / `video.rankedByScore` / `video.scoreLabel`（common + zh + zh-Hant）。

### 验收
- 任务完成后每条 clip 显示真实分数（非 undefined），展示区按分数排序且 Top1 有 Best 徽标；刷新页面（仅走 status 路由）分数仍在；标题呈钩子风格。

---

## P0-6 免费成片做到「可发布级」（免费开通烧录字幕）

### 现状
`subtitles.ts` 用 YouTube 官方 cues 生成 ASS 并烧录进导出（[subtitles.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/subtitles.ts#L7-L17)），目前作为 **Starter+ 权益**被 `cut-clip` 门控。

### 决策（默认，若与你预期不符请纠正）
把「AI 烧录字幕」从付费权益中**下放为发布基线**：免费用户导出 = **720p + 水印 + 烧录字幕**；付费差异保留在 **1080p/4K + 无水印 + 字幕样式/多语翻译**。理由：字幕是「测试品 vs 能直接发」的分水岭，直接抬升首次发布率，是本版要买的留存。

### 改动
1. [cut-clip/route.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/app/api/cut-clip/route.ts)：`subtitles` 参数不再走 `verifyStarterEligibility(...,'subtitles')`；改为服务端按实际情况直接烧录。**分辨率/水印门控保持不变**（仍由 plan 决定 720p/1080p/4K 与是否加水印），确保付费差异不被削弱。
2. 若 `download-youtube-clip` 也存在同一字幕门控，同步放开。
3. 前端免费导出流程：字幕开关**默认开启**，文案「含 AI 字幕（720p，带水印）」。字幕**样式选择**仍为付费。
4. i18n：`export.captionsIncluded` / `export.captionsPaidStyles`。

### 验收
- 免费用户导出 → 产出 720p + 有烧录字幕 + 有 watermark 的 MP4（ffmpeg 全解码无错）；
- Starter 用户导出 → 1080p + 无 watermark；Pro → 4K。

---

## P1-2 发布标记 + 手动回填（作品库回访闭环）

### 现状
历史记录已是 localStorage：键 `clipop_demo_videos_<userId>`，records 内 `clips: VideoClip[]`（[video-processor.tsx](file:///Users/aiven/Desktop/AI/codex/projects/src/components/home/video-processor.tsx#L176-L252) / [dashboard/page.tsx](file:///Users/aiven/Desktop/AI/codex/projects/src/app/dashboard/page.tsx#L116-L141)）。保存时用 `{...c}` 展开，未知字段可存活 → 可安全扩展。

### 改动
1. 扩展类型（**新增字段全部可选，向后兼容**）：

```ts
type PublishInfo = {
  platform: 'tiktok' | 'reels' | 'shorts' | 'other';
  postUrl?: string;
  postedAt: string;            // ISO
  views?: number;
  likes?: number;
  comments?: number;
  metricsUpdatedAt?: string;   // ISO
};
// VideoClip 增加 publish?: PublishInfo
```
2. 新增轻量客户端工具 `src/lib/publish-tracker.ts`（纯函数 + localStorage 读写，无新依赖）：更新某条 clip 的 publish 信息、汇总统计（已发布数 / 总播放 / 总点赞）。
3. UI：
   - 新增 `MarkPublishedDialog` 组件（平台下拉 + 可选作品链接 + 播放/点赞/评论数值）。
   - 结果网格与 dashboard 历史的每个 clip 卡片：未发布显示「标记为已发布」，已发布显示 `Published` 徽标 + 播放/点赞，并提供「更新数据」。
   - [dashboard/page.tsx](file:///Users/aiven/Desktop/AI/codex/projects/src/app/dashboard/page.tsx#L879-L916) history 头部加汇总条：「已发布 N 条 · 总播放 X · 总点赞 Y」。
4. i18n：`dashboard.published` / `dashboard.markPublished` / `dashboard.updateMetrics` / `dashboard.publishSummary` / 平台名（common + zh + zh-Hant）。

### 验收
- 标记一条为已发布并填指标 → 刷新后仍在；dashboard 汇总条数值正确；「更新数据」可就地修改；
- 老记录（无 publish 字段）正常渲染，不报错。

---

## 验证

1. **静态检查**：`pnpm ts-check`（注意 `video-clipper.ts` / `i18n.ts` 等旧文件有既存报错，只关注新增错误）+ `pnpm run build`。
2. **本地 E2E**（dev server 需带 `http_proxy`/`https_proxy=http://127.0.0.1:7897` 才能让服务端 ffmpeg 访问 CF Worker）：
   - P0-1：构造失败源 → 校验 `credit_transactions` 出现 `video_process`(−60) + `refund`(+60) 且余额不变；重复轮询无第二条 refund。
   - P0-2：登出提交真实 YouTube 链接 → 单条预览 + 锁定 + CTA；注册后自动带 `trialId` 续跑，日志确认跳过 LLM。
   - P0-3：完成后 clip 分数非 undefined、展示区按分数排序、Top1 有 Best 徽标。
   - P0-6：免费导出 → 720p + 字幕 + 水印，`ffmpeg -v error` 全解码校验。
   - P1-2：标记发布 + 回填指标 → 刷新保留、汇总正确。
3. **回归探针**：复用 `.pwtest/`（`reframe-probe.mjs`、`vertical-upload-probe.mjs`）确认既有能力未被破坏；为 P0-1 退款幂等补一个最小脚本。
4. **生产验证**：改动经你确认后 commit + push `main`（GH Actions 自动部署），在 www.clipopai.com 复跑上述关键用例。

## 明确不做（本版）
- 不接 YouTube Analytics OAuth 自动回流（P1-2 本版只做本地标记 + 手动回填）。
- 不做 TikTok 视频下载工具页（已搁置）。
- 不做 TTFV 30s 极速通道（P0-4）、作品库项目中心（P0-5）、一键发布/排期（P1-1）——留待后续版本。
- 不新增任何数据库列/表。
