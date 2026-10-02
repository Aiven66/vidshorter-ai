# P0 — 成片质量：AI 粗剪清理（Jump-cut） + 竖屏智能追焦构图

## Context

下个版本被定为「直接决定成片能不能看」的两个 P0 新功能（非优化、非商业化门控）：

1. **AI 粗剪清理（Jump-cut）** —— 按逐字稿自动剪掉长停顿与纯语气词（呃/嗯/um/uh），让成片节奏紧凑。这是绝大多数短视频工具的标配能力，本项目完全缺失。
2. **竖屏智能追焦构图（Auto-Reframe）** —— 当前竖屏导出用 blur-fit（整幅 contain + 模糊背景）回避裁切，代价是**主体偏小**，观感差。但 UI 文案 [zh.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/i18n/locales/zh.ts#L208-L211) 已经承诺「AI 人物跟踪居中 / 主体始终居中」，属于**已承诺未实现**，是信任风险。

### 一个必须先讲清楚的硬约束

本项目**没有任何人脸检测能力**，追焦不能靠"假装聪明"来实现：

- `ffmpeg-static` 无人脸/视觉滤镜。这一点代码里已明确记录：[video-export.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-export.ts#L13-L17) 注明生产构建无 `drawtext`，只有 `overlay`/`subtitles`。
- `package.json` 无任何 ML / vision 依赖，也未接入视觉 API。
- **naive crop 已经在线失败过**：[video-export.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-export.ts#L60-L74) 的注释记录了「裁切窗漂到幻灯片上，成片里看不到人」，这正是当初改用 blur-fit 的原因。所以追焦**不能**重走老路。

因此本轮追焦走 **零新增依赖的启发式人物跟踪**（肤色掩码 + 边缘能量 + 帧间运动求水平重心 → 时序平滑 → 裁切路径），并且在「检测不到人」时**自动回落现有 blur-fit**，绝不重演"把人裁出画面"。

### 落地顺序（本轮只做第 1 步）

- **Step 1（本轮交付）**：Jump-cut。确定性高、零新依赖、可独立验证与回滚，用户立刻感知"成片更紧凑"。
- **Step 2（紧随）**：竖屏追焦，风险与前一步隔离。

---

## Step 1 — AI 粗剪清理（Jump-cut）

### 权益

Starter+ 付费权益，复用唯一门控实现 [plan-gate.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/plan-gate.ts#L121-L129)：
`verifyStarterEligibility(request, plan, 'jumpcut')` → 失败码 `jumpcut_requires_starter`。

### 1.1 新增：`src/lib/server/jump-cut.ts`（纯函数 + 滤镜图构建）

逐字稿 cues 已是现成输入（[subtitles.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/subtitles.ts#L19-L23) 的 `SubtitleCue` 含 `start/end/text`，来自 YouTube 官方字幕，**非 ASR、词级时间戳不可得**，因此按 cue 粒度工作）。

导出三个函数：

- `planKeepSegments(cues: SubtitleCue[], duration: number): JumpCutPlan`
  - 每段 cue 区间两侧各扩 `PAD = 0.15s`（避免切掉辅音起音）。
  - 合并间隔 `< MIN_KEEP_GAP = 0.35s` 的相邻区间。
  - **丢弃纯语气词 cue**：文本归一化后仅由 `呃|嗯|啊|哦|唉|呀|um|uh|erm|hmm|like|you know` 构成且时长 `< 1.5s` → 不纳入保留集（自然被剪掉）。
  - 首尾 clamp 到 `[0, duration]`。
  - **安全阀（关键）**：若 `cues.length === 0`、或保留总时长 `< 3s`、或保留占比 `< 50%` → 返回 `{ disabled: true }`，整段原样输出。宁可不动，不可毁片。
  - 返回 `{ disabled: false, segments: {start,end}[], removedSec, keptSec }`。
- `buildJumpCutGraph(segments): { videoChain: string; audioChain: string; vLabel: string; aLabel: string }`
  - 每条区间生成 `trim=start=..:end=..,setpts=PTS-STARTPTS` / `atrim=..,asetpts=PTS-STARTPTS`，
    以 `concat=n=N:v=1:a=0` / `concat=n=N:v=0:a=1` 收尾，返回 `[vjc]` / `[ajc]` 标签。
- `remapCuesForSegments(cues, segments): SubtitleCue[]`
  - 把 cues 时间轴映射到剪后时间轴；跨切口的 cue 被截断或丢弃。**字幕必须重映射**，否则烧录字幕会整体错位。

### 1.2 改造：`src/lib/server/video-export.ts`

让既有滤镜图接受任意输入标签（当前硬编码 `[0:v]`），这是 jump-cut 前置链能接入的前提：

- `buildVerticalComplex(postChain?, inLabel = '[0:v]')`
- `buildWatermarkArgs(exportVf, wmPng, inLabel = '[0:v]')`

默认值保持 `[0:v]`，**对现有调用点零行为变化**。

### 1.3 改造：`src/lib/server/subtitles.ts`

拆出「取 cues（含翻译）」的独立步骤，供 jump-cut 前先拿到 cues 做重映射：

- 新增 `export async function fetchClipCuesTranslated(videoId, startTime, duration, lang?): Promise<SubtitleCue[]>`
  —— 把现有 `buildClipSubtitleFile`（[L349-L370](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/subtitles.ts#L349-L370)）内部的 fetch → 翻译逻辑搬进来。
- `buildClipSubtitleFile` 改为调用它 + `buildAssFile`，行为不变。

### 1.4 改造：`src/app/api/cut-clip/route.ts`

- 解析新入参 `jumpCut = body.jumpCut === true`（JSON 与 multipart 两条入参分支都要读）。
- 门控：在 `verifyPaidEligibility` 之后，若 `jumpCut` → `verifyStarterEligibility(request, plan, 'jumpcut')`，失败 403。
- 字幕流程改为：`fetchClipCuesTranslated(...)` →（jumpCut 时）`remapCuesForSegments` → `buildAssFile(...)`。
- **主链路让路**：`jumpCut` 为真时**跳过** `cutFromStreamUrl` 直读快路径（该函数是精细的流式 seek 逻辑，不改动），直接落到已验证的 v51「下载 + cut」路径。
- `cutLocalFile(...)` 新增参数 `jumpCutSegments?: Segment[] | null`：
  - 有 segments 时强制 re-encode（与现有 `watermarkPng || exportVf || vertical` 同一条跳过 `-c copy` 的判断），并在 [L822-L834](file:///Users/aiven/Desktop/AI/codex/projects/src/app/api/cut-clip/route.ts#L822-L834) 处把 `[vjc]` / `[ajc]` 接进既有滤镜图，音频改为 `-map '[ajc]'`。
  - 竖屏/水印/字幕三者与 jump-cut 的**组合**都要在过滤器图上正确串联（`[0:v]` → jumpcut → vertical/watermark/subtitles）。

### 1.5 前端

- [video-processor.tsx](file:///Users/aiven/Desktop/AI/codex/projects/src/components/home/video-processor.tsx#L565-L593)：新增 `exportJumpCut` 状态；在 [L2086-L2128](file:///Users/aiven/Desktop/AI/codex/projects/src/components/home/video-processor.tsx#L2086-L2128) 的导出开关区按现有 checkbox label 模式加一个开关（复用 `video.vertical.*` / `video.subtitle.*` 的写法）。
- 透传：`handleDownload`（[L1603-L1667](file:///Users/aiven/Desktop/AI/codex/projects/src/components/home/video-processor.tsx#L1603-L1667)）→ `downloadAndCutOnServer`（[youtube-clip-download.ts L1469-L1527](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/youtube-clip-download.ts#L1469-L1527)）→ POST `/api/cut-clip`，新增 `jumpCut?: boolean`。
- 竖屏导出失败必须硬抛错、不许静默回落的既有约束保持不变（[youtube-clip-download.ts L778-L781](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/youtube-clip-download.ts#L778-L781)）。

### 1.6 i18n

加在 `video.` 命名空间下，**只需改 `zh.ts` 与 `en.ts`**——[index.ts L186-L188](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/i18n/index.ts#L186-L188) 已把 `commonTranslations`(en) 与各 locale 做深度 merge，缺失 key 自动回落英文，其余 32 个 locale 无需改动。

- `video.jumpCut.label` / `video.jumpCut.hint`（zh + en）。

---

## Step 2 — 竖屏智能追焦构图（本轮不做，紧随其后）

作为独立阶段，路径与接口在 Step 1 完成后开工：

- 新增 `src/lib/server/reframe.ts`：
  - 用 ffmpeg 按固定间隔抽帧到 `/tmp`（如 `fps=1/0.5`，90s 上限约 180 帧），**逐帧处理后立即删除**；
  - `sharp` 解码并降采样到宽约 320px 的原始 RGB（sharp 已是既有依赖，无新增），计算 YCbCr 肤色掩码 + 列向边缘能量 → 该帧人物水平重心与置信度；
  - 时序 EMA 平滑 + deadband 抑制抖动 → 裁切路径；**全局置信度低（幻灯片/无人）→ 回落到现有 blur-fit**。
- 接入 [video-export.ts](file:///Users/aiven/Desktop/AI/codex/projects/src/lib/server/video-export.ts) 新增「分段裁切 + concat」滤镜图构建，作为 blur-fit 的替代分支。
- **内存纪律**（吸取 [cut-clip OOM 教训](file:///Users/aiven/Desktop/AI/codex/projects/src/app/api/cut-clip/route.ts#L903)）：只处理降采样帧，禁止整块 readFile 输出。

---

## 验证

1. **类型**：`pnpm ts-check`。
2. **纯函数单测**：用合成 cues 跑 `planKeepSegments` / `remapCuesForSegments`，覆盖：空 cues、全是语气词、保留占比 < 50%、跨切口 cue 截断。
3. **本地端到端**（dev 5100）：
   - `SKIP_GEN=1 node .pwtest/vertical-upload-probe.mjs` 回归竖屏导出（确认未破坏既有链路）。
   - `node scripts/e2e-download-test.js`（经代理 `127.0.0.1:7897`，用 `ffmpeg -v error` 全解码校验）；新增 jumpCut 用例：断言输出时长 < 源窗口时长、音频存在且同步、`ftyp` 正常。
   - 组合矩阵必须逐个跑通：`jumpCut` × {横屏, 竖屏} × {无字幕, 有字幕}。
4. **人工确认**：抽一段有明显停顿与"呃/嗯"的口播视频，开/关 jumpCut 各导一次，对比节奏与字幕对齐。
5. **部署**：用户确认后 `node .pwtest/deploy-rest.mjs`（git push 不触发部署）。

## 不做的事

- 不引入任何 ML / 视觉依赖。
- 不改动 `cutFromStreamUrl` 的直读快路径逻辑。
- 不新建文档、不主动 commit。
- 不为 32 个非 zh/en locale 补文案。