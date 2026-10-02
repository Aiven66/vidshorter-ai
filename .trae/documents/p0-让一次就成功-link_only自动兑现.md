# P0 治本：让「一次就成功」—— 异步主流程 link_only 自动兑现

## Context（为什么做）

生产数据揭示付费率 0% 的根因不是"没人愿意付"，而是**多数用户从没跑通"拿到真成片"这一环**：

- 147 用户仅 21 人真正处理过视频；生成漏斗 391 次点击 → 仅 46 次"成功"。
- **236 条 short_videos 里 226 条是 `https://youtu.be/<id>?t=<s>s` 占位链接**，只有 10 条是真可播 MP4/签名 URL。用户花了 60 积分，拿到的却是"跳回原视频的链接" → 没有"AI 做成了"的获得感 → 不付费。
- 12 个 `failed` 全部是历史挂起被 STALE 超时清掉的（`Processing timed out`），当前自调用 + rescue kick + STALE 兜底已就位。

已确认的根因：**生产主提交走异步管线（`/api/videos/process` + 状态轮询），但该流程对 link_only 占位不触发客户端兑现。** 兑现能力 `regenerateThumbnailClips` 已存在且经验证可靠（captureVideoClip 浏览器录制 + /api/regenerate-clip 服务端 ffmpeg），但它只被旧的同步/本地流程调用，异步主流程从未调用。

目标：把占位成片自动转为真可播成片，使用户**总是能拿到"AI 真剪出的视频"**，一次就成功。

## 改动（复用已验证代码，最小触达）

### 文件：`src/components/home/video-processor.tsx`

在 `handleProcess` 的**异步状态轮询块**（`doSubmit('/api/videos/process')` + `while(true)` 轮询 `/api/videos/process/status`）中，`if (s.done) { done = true; return; }` 之前的收尾处，加入 link_only 兑现：

1. 收集 `s.clips` 中 `status === 'link_only' && linkOnlyUrl` 的 clip；若存在且 `ytVideoIdFromUrl` 非空，调用现有的 `regenerateThumbnailClips`：
   - 传入 `clips`（这些 link_only clip）、`ytVideoId`（从输入 URL 提取，异步块内已有 `ytVideoIdFromUrl`）、`existingStreamUrl` / `existingMetadata`（handleProcess 顶部已预解析）。
   - `onClipUpdated`：用返回的真可播 clip 更新 `clipMap` 与 `setClips`（复用现有 `mergeClips`），UI 由占位渐进升级为真 MP4。
   - `onProgress`：复用现有 `setProgress`，提示"正在将占位片段转为真实视频…"。
2. 兑现全部/失败兜底：`regenerateThumbnailClips` 内部已自带 resolve 失败、CF /stream 健康检查失败、captureVideoClip 失败降级 download+upload 等兜底；任一 clip 仍无法兑现时保持 link_only（前端预览走 CF Worker /stream，可播）。无需额外处理。
3. **漏斗如实化**：兑现后若结果中存在 ≥1 个非 link_only 真可播 clip，才广播 `ANALYZE_SUCCESS`（step 3），`data.clip_count` 填真可播数量。这样漏斗从今天起反映"真拿到成片"，便于衡量本改造效果。

> 复用点（不要重写）：
> - `regenerateThumbnailClips`（同文件，已验证，含 captureVideoClip/download+upload 全套兜底）
> - `mergeClips`、`ytVideoIdFromUrl`、`preResolvedStreamUrl` / `preResolvedMetadata`（handleProcess 现有作用域）
> - `trackEvent(VIDEO_FUNNEL.ANALYZE_SUCCESS, …)` 埋点（`@/lib/analytics`）

### 不改动
- 服务端管线（`/api/videos/process`、status、worker、video-job）不动——兑现依赖浏览器侧（浏览器 colo 不被 YouTube 限流），天然应在客户端做。
- 不引入新表/新接口；`/api/regenerate-clip` 已存在。

## 验证

1. **构建**：`pnpm ts-check && pnpm build` 无新增类型错误（若存在视频裁剪旧有 TS 报错，属 `ignoreBuildErrors` 范围，忽略）。
2. **本地 E2E**（Playwright，对本地 `next build && next start` 或用代理直连生产）：
   - 以测试用户登录，提交一个 YouTube 链接 → 轮询 status 待到 `done`；
   - 断言结果中 link_only clip 被兑现为真可播（`videoUrl` 非 youtu.be 页面，`ffmpeg -v error` 解码 0 错误）；
   - 断言 `ANALYZE_SUCCESS` 仅在存在真可播 clip 时触发。
3. **部署 + 生产返测**：`vercel deploy --prod --yes`（token 走 VERCEL_TOKEN），重跑上屏 E2E，并抽查生产 short_videos 新记录中 signed_storage/真 URL 占比上升。