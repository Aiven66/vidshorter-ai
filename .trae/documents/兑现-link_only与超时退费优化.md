# 兑现 link_only + 卡死任务超时退费

## Context（为什么做）

管理后台行为数据（60 天）显示付费率 = 0%，146 用户 0 笔真实付费。根因之一是**价值交付断裂**：
- `videos`：34 个里 22 个 `link_only_completed`、11 个卡 `processing`、仅 1 个 `completed`。
- `short_videos`：216 条里 206 条是 `https://youtu.be/xxx?t=<s>s` 链接占位，仅 10 条可播放。

用户花了积分、等了时间，拿到的"成品"却是跳转原视频的链接 → **没有"AI 做成了"的获得感 → 不付费**。同时大量任务卡死 25min 才被标记 failed，且**扣的积分从不退还**，进一步摧毁信任。

本任务做两件事：
1. **兑现 link_only**：无预解析流时也让服务端真裁剪 MP4，并把 MP4 **持久化到 Supabase Storage**，让前端真正拿到可播放/可下载的视频。
2. **卡死任务超时退费**：停滞任务超时转 failed 时，把已扣的 60 积分退还。

## 根因定位（已确认）

- 文件 `src/lib/server/video-job.ts` 的 `produceClip()`（L184–226）：对 YouTube **只有 `if (params.preResolvedStreamUrl)` 为真时才调用 `createClipFromYouTubeStream`**，否则直接 `linkOnly: true` 返回 youtu.be 时间戳链接。但 `createClipFromYouTubeStream` 内部自带多候选（前置 pre-resolved fast path + self-resolve CF Worker/Invidious/yt-dlp），本可在无 pre-resolved 时自解析，被这道 `if` 挡住。
- `runClip()`（video-job.ts L356–374）：当 `artifact.url` 是 `data:video/mp4;base64,..`（Vercel 生产 `SHOULD_INLINE_CLIPS=true` 产出）时，DB 只存了占位符 `data-url:${clipKey}`，**真实 base64 视频内容被丢弃**（DB `url` 是 varchar(1000)，放不下 45MB base64；且无任何对象存储承接）。前端只认 `data:`、`/`、`http` 开头，`data-url:` 占位既不可播也不可下。
- 对象存储：`uploads` 桶已存在（非 public、50MB 上限），service-role 直传/签名 URL 模式已在 `src/lib/server/ai-tools/storage.ts`（`uploadResult` / `createSignedUrl`）与前端 `uploadToSupabase` 中成熟使用，可直接复用。

## 实施方案

### 1. 兑现 link_only — 无预解析流也真裁剪（video-job.ts）

`produceClip()`：YouTube 分支不再用 `if (params.preResolvedStreamUrl)` 挡死，改为**无条件调用 `createClipFromYouTubeStream`**（参数可选传 pre-resolved 作为第一候选，其余靠它内部自解析），仅在裁剪返回 null 时才落 `linkOnly` 兜底。

最小改动（L184–226 重构为）：
```
if (ytId) {
  try {
    const clip = await videoClipper.createClipFromYouTubeStream({...同现状, 保留 preResolved 字段});
    const clipUrl = clip?.dataUrl || clip?.publicUrl || '';
    if (clip && clipUrl) { return { artifact:{url:clipUrl, linkOnly:false, ...}, duration }; }
  } catch(e) { console.warn(...); }
  // 全部失败才 link_only
  return { artifact:{ url: youTubeTimestampUrl(ytId, start), linkOnly:true, ... }, duration };
}
```

### 2. 兑现 link_only — 持久化 MP4 到 Storage（video-job.ts + 新存储工具）

在 `runClip()` 拿到非 linkOnly 的 `artifact` 后，把 video 上传到 Supabase Storage 并以真实 URL 落库：

- 在 video-job.ts 内新增 helper `persistClip(serviceClient, userId, videoId, index, artifact)`：
  - 若 `artifact.url` 为 `data:video/mp4;base64,..` → 解 base64 得 Buffer → service-role upload 到 `uploads` 桶对象路径 `users/{userId}/clips/{videoId}/{index}.mp4`（`contentType: video/mp4`，复用 storage.ts 的 service-role 模式）→ `createSignedUrl(objectPath, 7d)`（clip 即时播放/下载足够，且视频是用户私有，非公开桶更安全）→ 返回绝对 signed URL。
  - 若已是 http(s)/signed URL 或非 data 前缀 → 原样透传。
- `runClip()` 的 `dbUrl` 改为 persistClip 返回的**真实可播放 URL**，删除 `data-url:${clipKey}` 占位逻辑。
- 复用：`src/lib/server/ai-tools/storage.ts` 里的 service-role client 创建方式（`getServiceRoleClient()` 局部实现即可，不强制 import 该文件，因为其中是 req 上下文；在 video-job 现有 `getServiceRoleClient()` 上直接 `client.storage.from('uploads')`）。

### 3. 前端判定修正（status 路由 + 前端 videoUrl 识别）

新交付的 signed URL 形如 `https://<proj>.supabase.co/storage/v1/object/sign/uploads/users/...`，是 http 开头，会被：
- status 路由 `normalizedClips`（`src/app/api/videos/process/status/route.ts` L110–132）误判为 `link_only`；
- 前端下载判定误导入下载分支。

修正：
- status 路由 `normalizedClips`：`isLink` 判定收紧 —— 仅当 url 以 `youtu.be`/`youtube.com` 开头（且**非** supabase storage 域名）才算 link_only；supabase storage signed URL 归为 `completed`（可直接播）。`linkOnlyUrl` 仅在真 link_only 时补。

以 storage 域名匹配（用 Supabase url 主机）区分。

### 4. 卡死任务超时退费（status 路由 + video-job 兜底）

现状：status 路由已有 STALE_MS=25min 检测（L91–102），把停滞任务标记 `failed`，但**不退积分**。

新增逻辑（放在 status 路由触发 STALE 分支处）：
- 原子认领一次性退费，避免并发多次：`UPDATE videos SET ... WHERE id=? AND status NOT IN (terminal)`，认领成功才执行退费。
- 幂等退费：查 `credit_transactions` 是否已有 `type='refund', related_id=videoId`；没有则：
  - `credits.balance += CREDIT_COST`
  - 插入 `credit_transactions { amount: +60, type: 'refund', description: 'Refund for timed-out video processing', related_id: videoId }`
- 前瞻：新任务失败路径统一走一套 `refundIfCharged(client, userId, videoId)`，也挂在 `video-job.ts` 的 failed 终态旁，保证任何失败都退款。

> 说明：本任务只针对**超时/失败退费**（解决"卡死还扣钱"）。"抵扣 60 → 不退"的设计本文不动。

### 5. 一致性预防

`runClip` 写 short_videos 使用同一个 `persistClip` 结果，保证 DB 里的就是能播的 URL。旧记录（link_only / data-url 占位）不迁移（存量可后续按需批量重生成）。

## 关键文件

- `src/lib/server/video-job.ts` — produceClip 无条件裁剪、persistClip、runClip 落真实 URL、失败退费
- `src/app/api/videos/process/status/route.ts` — SignedURL 识别为 completed、STALE 超时退费
- `src/components/home/video-processor.tsx` 与 `src/app/dashboard/page.tsx` — 前端对 storage signed URL 视为可播放（下载走 v59 cut-clip 已兼容 http url）

## 验证

1. **本地生产构建**：`pnpm build` 无类型错误。
2. **生产 E2E**（复用 scripts/e2e-download-test.js 思路）：
   - 提交一个 YouTube 链接（不带 pre-resolved，模拟无预解析用户）→ 轮询 status：
     - `short_videos.url` 应为 `https://...supabase.co/storage/v1/object/sign/uploads/...`（非 youtu.be 链接）
     - status 最终为 `completed`（或全部成功后 completed）而非 `link_only_completed`
   - 预览 videoUrl：返回可播放的 mp4（ffmpeg 解码 0 error）。
   - 下载按钮：产物为可播放 MP4。
3. **超时退费**：造一个 `processing` 且 `updated_at` 早于 STALE_MS 的 video → 请求 status → 断言成 `failed`、`credit_transactions` 出现 `type='refund'`、用户 balance 恢复 60。
4. **部署**：`vercel deploy --prod` 并复查生产数据无 link_only 占位。