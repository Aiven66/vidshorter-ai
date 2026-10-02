# P0-2 解说成片引擎 Recap Studio — 实现方案

## Context（为什么做这个）

Clipop AI 现有能力都是"切片级"（剪裁 / 竖屏 / 字幕 / 配音 / BGM / 拼接），单价锚点停在 $9.9/$19.9。
Recap Studio 做的是**成片级**新品类：长视频 → 1–3 分钟「AI 解说成片」——
LLM 写解说稿（黄金 3 秒钩子 + 分章节 + 金句）→ 专属音色配音 → **解说驱动音画对齐** → 字幕/混音 → 一键出片。

这是客单价主力：成片是高感知价值品类，用来把定价锚点上移。

### 已确认的三项范围决策
1. **付费门控**：先挂 **Pro 门控**（403 `recap_requires_pro`），不动定价页结构 / 支付 webhook / DB。
2. **成片规格**：Phase 1 **同步渲染，≤3 分钟 / ≤6 章节**（单请求内跑完，maxDuration=300），硬上限防 OOM/超时。
3. **交互**：**两步** —— 先出解说稿（可编辑）→ 再成片。同一路由用 `mode: 'script' | 'render'`。

### 复用的既有资产（不重复造轮子）
| 能力 | 复用来源 |
|---|---|
| 逐段裁剪 + 规格归一化 | [compile-clips/route.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/app/api/compile-clips/route.ts) `cutClipNormalized` / `buildSegmentVf` |
| xfade 拼接 + concat 兜底 | 同上 `compileWithXfade` / `compileWithConcat` / `getDurationSeconds` |
| TTS 配音（分块 + 重试 + 拼接） | [voiceover.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/voiceover.ts) `synthesizeVoiceover` / `splitScript` / `isVoiceId` |
| ASS 字幕（含横/竖 PlayRes + 逐词高亮） | [subtitles.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/subtitles.ts) `buildKaraokeAssFile` / `setupFontConfig` / `subtitleFilterForceStyle` |
| 字体捆绑 | `public/fonts/NotoSansSC.ttf`（已 trace 进 Lambda，生产已验证） |
| BGM 资产 + 混音参数换算 | [bgm-clip/route.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/app/api/bgm-clip/route.ts) + `public/bgm/{calm,energetic,warm}.mp3` |
| 字幕降采样（喂 LLM prompt） | [llm-note-generator.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-notes/llm-note-generator.ts) `downsampleSegments`（已导出） |
| 前端流解析缓存 | [youtube-clip-download.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/youtube-clip-download.ts) `resolveYouTubeStream`（5h 缓存）+ `compileClips` 的"解析→传参给服务端"范式 |
| 流式返回 + 清理 | `streamMp4Response` 范式（**输出文件只能在流 close 后 unlink**，见下方 GOTCHA） |

---

## 流水线设计

```
长视频 URL
  ├─[mode:'script']─ 全量字幕 → LLM 解说稿 JSON（钩子/分章节/金句/源时间锚点）→ 返回给前端可编辑
  └─[mode:'render']─ 解说稿 → 逐章 TTS(得真实时长 D_i) → 音画对齐(Σ源片时长 == D_i)
                     → 逐片裁剪归一化 → xfade 拼接(失败降级 concat)
                     → 烧录解说字幕 + 原声 ducking + BGM amix → 成片 MP4
```

**核心洞察（本方案的关键简化）**：让**每个章节的视频段总时长精确等于该章解说时长 D_i**。
这样 A/V 天然同步——旁白轨只需按章顺序 concat，无需做音频伸缩/对时。这就是"解说驱动音画对齐"的落地方式：
**先有解说时长，再裁视频去适配它**，而不是反过来。

### 音画对齐算法（`planRecapTimeline`，纯函数）
对第 i 章（解说时长 D_i，共 n 章）：
1. **候选窗**：以每条字幕 cue 的起点为锚，取窗口 `[s, s+D_i]` 并 clamp 到 `[0, sourceDuration]`。
2. **打分**：`0.6 × 文本重合度 + 0.25 × 高光先验 + 0.15 × 位置先验`
   - 文本重合度：解说词与窗内字幕的 cosine-like 重合（CJK 按字符 bigram，拉丁按小写词 token，`|A∩B|/sqrt(|A||B|)`）
   - 高光先验：落在客户端已分析 highlights 区间内则加分
   - 位置先验：第 i 章偏好源视频 `sourceDuration×(i+0.5)/n` 处（避免所有章节都取自同一段）
3. **A-Roll 锚点**：取最高分窗。LLM 给了 `sourceStart/sourceEnd` 且合法时优先采用。
4. **B-Roll 补齐**：若 D_i > `RECAP_MAX_PIECE_SEC`(30s)，或锚点窗可用时长不足 → 按分数取次优**未被占用**窗补齐，直到 Σ == D_i。
5. **去重**：已被前章占用的窗加极大惩罚（尽量不重复素材）；确实素材不足时才允许复用。
6. **输出**：`[{chapterIndex, pieces:[{start,end,role:'a-roll'|'b-roll'}]}]`

**硬保证（单测断言）**：Σ pieces 时长 == D_i；同章内不重叠；全在 `[0, sourceDuration]`；每片 ≥1.5s。

### 字幕时间轴
解说字幕 = **解说词**（不是源视频字幕）。每章解说按 ≤22 字符切行，在 `[chapterStart, chapterStart+D_i]` 内按字符长度占比分配时间，产出 `SubtitleCue[]` → 复用 `buildKaraokeAssFile(cues, orientation, style)`（自带横 1280x720 / 竖 1080x1920 PlayRes + 逐词高亮，视觉更"成片"）。

---

## 需要改动的文件

### 新增
| 文件 | 内容 |
|---|---|
| `src/lib/recap.ts` | 纯数据模块（无 node 依赖，前后端共用）：`RecapChapter` / `RecapScript` 类型、`RECAP_TARGET_SECS=[60,120,180]`、`RECAP_MAX_CHAPTERS=6`、`RECAP_MAX_NARRATION_CHARS=2000`、`normalizeRecapScript(raw)` 白名单归一化、错误码常量 |
| `src/lib/server/recap/script.ts` | `resolveRecapLlmConfig(aiConfig)` + `generateRecapScript(...)` + `parseRecapScriptJson(raw)`（导出供单测）+ `buildLocalRecapDraft(...)`（明文标记的本地兜底） |
| `src/lib/server/recap/align.ts` | `planRecapTimeline(...)` + `buildNarrationCues(...)` + 分词/打分辅助（全纯函数，可单测） |
| `src/lib/server/recap/render.ts` | ffmpeg 编排：`findFfmpegBinary` / `probeDuration` / `cutSegmentNormalized` / `stitchWithXfade` / `stitchWithConcat` / `concatNarrationAudio` / `renderRecapFilm(...)` |
| `src/app/api/recap-studio/route.ts` | 路由：Pro 门控 + `mode:'script'\|'render'` |
| `src/app/recap/page.tsx` | Recap Studio 页面（两步交互） |
| `scripts/check-recap.ts` | 单测（`pnpm test:recap`） |

### 修改
| 文件 | 改动 |
|---|---|
| `src/lib/server/subtitles.ts` | 新增 `fetchFullTranscript(videoId, preferredLang?)`：复用 `YoutubeTranscript.fetchTranscript`，**不做窗口过滤**（现有 `fetchClipCuesWithLang` 会先拉全量再按窗口切，这里去掉窗口那步），返回 `{cues, lang}` |
| `src/lib/youtube-clip-download.ts` | 新增 `generateRecapScriptApi()` / `renderRecapFilmApi()`，复用 `resolveYouTubeStream` + `compileClips` 的"解析后传 stream 参数给服务端"范式 |
| `src/lib/i18n/common.ts`（en）+ `src/lib/i18n/locales/zh.ts` | `nav.recap` + `video.recap.*` |
| `src/components/navbar.tsx` | 桌面(≈L96-101)+移动(≈L104-110) 两个数组各加 `{ href:'/recap', label:t('nav.recap') }` |
| `src/app/pricing/page.tsx` + 定价 i18n | Pro 档 features 数组加 `pricing.pro.feature7` = "Recap Studio: AI 解说出片（≤3 分钟）" |
| `package.json` | `"test:recap": "node --import tsx scripts/check-recap.ts"` |

**不动 DB**（无迁移）。

> **素材范围**：Phase 1 限 **YouTube**（与既有 voiceover-clip / bgm-clip / karaoke-clip / compile-clips 四条链路一致，均走 CF Worker `/stream` 的 muxed fast path）。B 站字幕/流另有独立链路（`local-note-generator.ts` 的 bilibili 分支），留 Phase 2 接入。

---

## 关键实现细节与坑

### 1. LLM 配置解析（provider-agnostic，明文标记，绝不静默降级）
```ts
resolveRecapLlmConfig(aiConfig) →
  1) 请求体 aiConfig（enabled && apiKey）  ← 复用既有 video 管线通道（process-video/stream 同款）
  2) process.env.COZE_WORKLOAD_IDENTITY_API_KEY（+ COZE_INTEGRATION_BASE_URL / _MODEL_BASE_URL）
  → null
```
**现状实证**：生产 Vercel env 不含任何 `COZE_*`；且 `clipop_ai_config` 被 3 处读取但**全项目无一处写入** → 当前生产**没有任何可用 LLM 通道**。

因此 `mode:'script'` 的行为定为：
- 解析到配置 → LLM 生成，`engine: 'llm'`
- 解析不到 → **不静默降级**：请求未显式允许时返回 **503 `recap_ai_unavailable`** + 可操作提示；
  前端可勾选「使用本地启发式草稿」重试（body `allowLocalDraft: true`）→ 走 `buildLocalRecapDraft`（复用 TextRank-like 提炼关键句成稿），`engine: 'local'`。
- 前端始终显示 engine 徽章（「AI 生成」/「本地草稿 · 未配置 AI」），用户永远知道拿到的是什么。

> 用户后续在 Vercel 补 `COZE_WORKLOAD_IDENTITY_API_KEY` 后，`engine=llm` 自动生效，无需改码。

### 2. SDK GOTCHA（新文件必须 ts-clean）
- `LLMConfig` 类型**无 `max_tokens`** → 用 `{model, temperature, max_tokens} as never`
- `LLMResponse.content` 是 `string | ContentPart[]` → `const raw = typeof resp?.content === 'string' ? resp.content : ''`
- 模块内 import 用**相对路径**（tsx 单测脚本兼容）；路由内才用 `@/`
- 既有 `tsc` 报错（`video-clipper.ts` / `video-cover.ts` / `categorize.ts` 的 max_tokens）**不要碰**

### 3. ffmpeg 编排（三步）
1. **逐片裁剪**：mirror `cutClipNormalized`（`-ss` + `-rw_timeout 30000000` + `-reconnect*` + `-headers` + `-vf buildSegmentVf` + libx264 ultrafast crf28 yuv420p + aac 128k 44.1k stereo + faststart）
2. **拼接**：`stitchWithXfade`（td=0.4，offset 用 `probeDuration` 实测时长）→ 失败自动降级 `stitchWithConcat`（`-f concat -c copy`，片段已同规格）
3. **成片合成**（单 pass）：输入 `[0]=拼接结果 [1]=旁白 [2]=BGM?`
   - 视频：`[0:v]subtitles=...:fontsdir=...:force_style=...`（**字幕放最后**，在最终分辨率上烧录；`force_style` 里的逗号必须 `\,` 转义）
   - 音频：`[1:a]volume=1[nar];[0:a]volume=<orig>[orig];[2:a]volume=<bgmVol>[bg];[nar][orig][bg]amix=inputs=3:duration=longest:normalize=0[aout]`
   - `-shortest`（视频=旁白总长，靠它收尾）+ `-movflags +faststart`

### 4. 必须遵守的既有 GOTCHA
- **流式输出文件绝不进 `finally` 清理** —— 只能在 `streamMp4Response` 的流 `close` 回调里 unlink，否则 Vercel 消费流时 ENOENT → 客户端收到 500 HTML
- `finally` 引用的变量必须声明在 `try` **外**（Turbopack 代码分割后 try 内 `let` 对 finally 不可见）
- serverless 无 fontconfig → 烧字幕前必须 `setupFontConfig()`（写最小 fontconfig xml 并设 `FONTCONFIG_FILE`），并清理其临时文件
- BGM 用 `-stream_loop -1` 铺满；`amix` 必须 `normalize=0`（防自动增益爆音）

### 5. 服务端门控（比既有 Starter 门控更严）
```ts
verifyProEligibility(request, clientPlan):
  - 有 Bearer token 且 Supabase 已配置 → 以服务端为准：subscriptions.plan_type==='pro'
    || status==='active' || users.role==='admin'
  - 无 token（本地/SSR 场景）→ 才回落信任 clientPlan==='pro'
  - 否则 403 recap_requires_pro
```
> 既有 `verifyStarterEligibility` 在 `clientPlan` 命中时**直接放行、不校验 token**（可伪造）。本条是最高客单价功能，本路由不复刻该弱点：**有 token 时一律服务端裁定**。

### 6. 规模硬上限（防 OOM / 超时）
`RECAP_MAX_CHAPTERS=6`、`targetDurationSec ∈ {60,120,180}`、`RECAP_MAX_PIECE_SEC=30`、`RECAP_MAX_PIECES=12`、总解说 ≤2000 字符、每章解说 ≤400 字符。
预计 ffmpeg 调用 ≈ 12(裁剪) + 1(拼接) + 1(合成) = 14 次，3 分钟成片在 300s 内可控。

---

## 验证方案

1. **单测**：`pnpm test:recap`（`node --import tsx scripts/check-recap.ts` + `node:assert/strict`），断言：
   - `normalizeRecapScript`：合法稿通过 / 超 6 章截断 / 空 narration → null / 总字符超限 → null / `sourceStart-End` 越界被 clamp
   - `parseRecapScriptJson`：合法 JSON / markdown 围栏 / 前后杂文 / 非法结构 → null / 章节超限截断
   - `planRecapTimeline`：**Σ片时长 == 解说时长（±0.1s）** / 同章不重叠 / 全在 `[0,duration]` / A-roll 命中与解说词重合度最高的窗 / 长解说自动 B-roll 补齐 / 跨章去重生效 / 无字幕但 LLM 给了锚点时仍可对齐
   - `buildNarrationCues`：行数正确 / 时间单调递增 / 末条 end == 章节末尾
   - `resolveRecapLlmConfig`：无 aiConfig 无 env → null（**不碰网络**）
   - i18n：`video.recap.*` en/zh 关键 key 齐备
2. **类型检查**：`npx tsc --noEmit`，确认**本次新增/改动文件零新增报错**（既有 3 处 max_tokens 报错忽略）
3. **部署**：重建 `scripts/_deploy_rest.mjs`（REST API 直传：并发 **4** + 单文件 4 次退避重试；`POST /v13/deployments` 的 **`target:'production'` 必须在 body**）→ 轮询 `READY` → **用完即删**
   - 本机 `pnpm build` / `vercel deploy` 都会死锁 → 不本地构建，一律云端部署验证
4. **生产 E2E**（Playwright 走代理 `127.0.0.1:7897`；`import pw from '<abs>/playwright/index.js'`；`admin@126.com` / `admin@666666`）：
   - `GET /api/recap-studio` → **405**
   - 空 body → **400**
   - `mode:'script'` + free/starter（无 token）→ **403 `recap_requires_pro`**
   - `mode:'script'` + admin → 200；断言 **engine 字段明确存在**（预期 `local`，因生产无 LLM key）→ 验证"明文标记、不静默降级"
   - `mode:'render'` + admin + **手写 script**（绕开 LLM，专测渲染链路）+ 真实 muxed 流 → 200 MP4；
     `ffprobe` 校验：`ftyp` / h264+aac / 时长 ≈ Σ 解说时长 / 分辨率 1280x720 或 1080x1920；
     抽帧像素校验字幕已烧录（底部非背景像素占比显著高于无字幕基线）
5. **前端**：`/recap` 页面手测 —— 未登录/非 Pro 显示升级引导；Pro 走完两步并成功下载成片

---

## 不在本次范围（Phase 2 候选）
- **Studio 档 $29.9 / "每月 N 部成片" 配额表** + 支付 webhook + DB 迁移（本次先 Pro 门控快速验证价值）
- **≤10 分钟异步成片**：QStash 微任务逐章渲染 + DB 持久化 + 作品库页面（复用 `video-queue.ts` + `video-job.ts` 范式）
- **音色克隆**（桌面本地 vs 云端 GPU 推理仍未决）—— 本次先用既有 msedge-tts 声线，克隆作为可插拔增强
- 更强的 A-roll/B-roll 选片（人脸检测、语义 embedding 匹配）