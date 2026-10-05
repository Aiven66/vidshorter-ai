# PRD — Local-first 内容生产线（P0）

> 目标：把 Clipop AI 从「一次性 AI 剪辑器」升级为 **Local-first「内容生产线」**。
> 用本地小模型把边际成本压到 ≈0，从而能承诺「无限量 + 隐私 + 可复用」，与重度依赖基座模型 API 的 ChatCut / Recapo / Pollo 形成错位。
>
> 北极星指标：**周活跃导出创作者数 × 人均周导出成片数**。
> 商业原则：**免费版必须能完整导出一次「可发布成片」**（720p + 水印）；付费卡「去水印 / 1080p / 4K / 批量 / Recipe / 数字人」。

---

## 0. 现状盘点（已核实，2026-10-05）

| 能力 | 现状 | 缺口 |
| --- | --- | --- |
| 桌面壳 | Electron：`apps/macos-agent/main.js`（IPC + media-server + OAuth 回调） | — |
| 桌面任务循环 | `runner.js`（由 `src/agent/runner.ts` + `video-clipper` 经 `pnpm agent:build` 打包） | 只有一种 job：高光剪辑 |
| 本地高光 | `apps/macos-agent/local-highlights.js`：**按片长均匀取点**，无内容理解 | 缺本地 ASR / 信号分析 / 用户意图 |
| 本地 ASR | ❌ 无。仅 MuseTalk 自带 whisper-tiny（用于口型，不是 ASR） | **P0-1 核心缺口** |
| 本地 TTS | ✅ `resources/piper`（piper/espeak-ng）、`resources/sherpa-onnx`（offline-tts） | — |
| 本地数字人 | ✅ `local-product-avatar.js` + `vendor/musetalk-local`（MuseTalk v1.5，含模型下载器范式） | — |
| YouTube 下载 | ✅ `apps/macos-agent/ytdlp.js`（多策略 + `--cookies-from-browser`） | 缺可配置 cookie 文件、断点续跑、失败退积分联动 |
| 服务端本地处理 | ✅ `src/lib/server/{subtitles,jump-cut,reframe,video-export,plan-gate}.ts`（blur-fit 9:16、ASS 字幕、粗剪） | 需下沉/复用为桌面本地渲染管线 |
| 任务队列 | ✅ `src/app/api/agent/jobs/{route,pull,report,[jobId]}` + `agent-job-store.ts` | job 只有隐式一种类型，需显式 `type` |

**结论**：P0 的四个能力里，TTS / 数字人 / 下载器已具备大量基建，真正从 0 到 1 的是 **① 本地 ASR/视觉理解、② 意图可控高光、③ 本地成片渲染管线与 job 类型化**。

---

## 1. P0-1 本地 AI 引擎（去基座 API）

### 1.1 目标
桌面端在**离网**状态下完成「转写 → 高光信号 → 说话人」全链路，不再依赖 YouTube 字幕、机房出口或被墙的云 ASR。

### 1.2 本地模型选型（macOS 优先，体积/速度/质量平衡）

| 能力 | 首选方案 | 模型/体积 | 备选 | 说明 |
| --- | --- | --- | --- | --- |
| ASR 转写 | **whisper.cpp** `whisper-cli`（Metal/CoreML 加速） | `ggml-base` ≈142MB（默认）、`ggml-small` ≈466MB（高质量）、`ggml-tiny` ≈75MB（低配） | sherpa-onnx `SenseVoice-small` int8 ≈234MB（zh/en 极快）；Python `faster-whisper`（复用 MuseTalk venv） | whisper.cpp 提供 **词级时间戳**，是卡拉OK字幕的前提 |
| 音频信号 | **ffmpeg**（`ebur128` 响度 / `silencedetect` / 频谱带能量） | 0（复用已内置 ffmpeg） | — | 提取响度峰值、笑声、语速突变，做「无字幕也有信号」的高光 |
| 视觉理解（可选，质量增强） | **Ollama** + `qwen2.5-vl:3b`（≈3.2GB）或 `minicpm-v:8b` | 按需下载 | Apple MLX `mlx-vlm` | 默认**不下载**，仅在用户开启「画面理解」时触发 |
| 说话人分离 | sherpa-onnx `pyannote` 分割模型（≈45MB）+ 声纹聚类 | 45MB | 仅音频信号兜底 | 用于「只保留主讲人」规则 |

**默认策略**：首启只下载 `ggml-base`（≈142MB）；用户可在「本地模型」页升级到 `small` 或开启画面理解。

### 1.3 接口设计

**（A）模型管理 IPC**
```
IPC local-models:status   -> { engine, models: ModelStatus[], diskBytes }
    ModelStatus = { id, kind:'asr'|'vlm'|'diar', size, ready, downloaded, path }
IPC local-models:prepare  ({ ids:string[] }) -> 事件流 local-models:progress { id, pct, stage, file }
```

**（B）转写 IPC**
```
IPC local-transcribe ({ inputPath, locale?, quality?:'fast'|'balanced'|'best', wantWords?:boolean })
  -> { engine, lang, cues: Cue[], words?: Word[], duration }
  Cue  = { start:number, end:number, text:string }         // 相对媒体时间（秒）
  Word = { start:number, end:number, text:string, speaker?:number }
```
- `local-transcribe` 必须有**磁盘缓存**（key = 文件 sha256 + 模型 id），二次调用 O(1)。
- 引擎不可用时抛结构化错误 `{ code:'NO_ASR_ENGINE', hint }`，绝不静默返回空。

**（C）服务端任务类型化** — 扩展 `AgentJob`
```ts
type AgentJobType = 'highlight' | 'transcribe' | 'render';
interface AgentJob { type: AgentJobType; /* 现有字段 */ }
```
`POST /api/agent/jobs` 增加 `type`；`pull` 支持 `agent.capabilities` 过滤，避免把 `transcribe` 发给无 ASR 的机器。

### 1.4 新增/改动文件
- 新增 `apps/macos-agent/local-models.js` — 模型注册表 + 下载/校验（复用 `local-product-avatar.js` 的 size*0.98 校验范式）
- 新增 `apps/macos-agent/local-asr.js` — 引擎探测（whisper.cpp → sherpa-onnx → faster-whisper python）+ 归一化 cues/words + 缓存
- 新增 `apps/macos-agent/local-signals.js` — ffmpeg 音频信号提取
- 新增 `apps/macos-agent/scripts/test-local-asr.js` — 引擎探测 + cue 归一化 + 无引擎优雅失败
- 改 `apps/macos-agent/main.js` — 注册 `local-models:*` / `local-transcribe` IPC
- 改 `src/lib/server/agent-job-store.ts` + `src/app/api/agent/jobs/route.ts` — `type` 字段

### 1.5 验收标准
1. 断网（`HTTPS_PROXY` 指向黑洞）下，对 10 分钟视频完成转写，产出带词级时间戳的 `cues/words`。
2. 同一文件二次转写命中缓存，耗时 < 200ms。
3. 未安装任何 ASR 引擎时返回 `NO_ASR_ENGINE`，UI 显示引导下载，**不产生空字幕**。
4. `scripts/test-local-asr.js` 在无模型环境走优雅分支并 exit 0；有模型环境跑通真实转写。
5. `node --check` 全绿；主仓 `pnpm ts-check` 全绿。

---

## 2. P0-2 意图可控高光（私有资产 = 切换成本）

### 2.1 目标
用户可**框选「必须保留 / 必须删除」**并保存为规则；规则**本地持久化**且默认命中。让「结果可控」成为回访理由。

### 2.2 规则模型
```ts
interface HighlightRuleSet {
  profileId: string;            // 频道/创作者档案，可多套
  keep: Rule[];                 // 必须保留
  drop: Rule[];                 // 必须删除
  prefs: {
    clipCount: number | 'auto';
    minLen: number; maxLen: number;
    hookFirstSeconds: number;   // 默认 3
    keepPunchlines: boolean;    // 保留金句
    stripFillers: boolean;      // 去口头禅
    keepSpeaker?: number;       // 只保留某说话人
  };
}
type Rule =
  | { kind:'keyword'; text:string }            // 词/短语
  | { kind:'timeRange'; start:number; end:number }
  | { kind:'speaker'; speaker:number };
```

### 2.3 打分与信号
对每个候选窗口打分：`score = w1·ASR语义(金句/关键词) + w2·响度峰值 + w3·笑声/情绪 + w4·语速突变 + w5·说话人匹配`；
- `keep` 规则窗口 **score 置顶并强制入选**；`drop` 规则窗口 **硬剔除**（含重叠片段裁剪）。
- 每个入选片段返回 `reason[]`（如 `["含关键词：增长","笑声+响度峰值","开头 3s 有钩子"]`），UI 可解释。

### 2.4 接口
```
IPC local-highlight-rules:load  ({ profileId? }) -> HighlightRuleSet
IPC local-highlight-rules:save  ({ rules })      -> { ok:true }
IPC local-highlights:plan       ({ inputPath, rules, locale? })
  -> { clips: PlannedClip[] }    // 只规划，不渲染
  PlannedClip = { start, end, title, score, reason[], asrCues, words? }
```
存储：`userData/highlight-rules.json`（按 `profileId` 索引）；可选 `localStorage` 镜像给 web 端。

### 2.5 改动文件
- 新增 `apps/macos-agent/local-highlight-scorer.js`（纯函数，便于单测）
- 改 `apps/macos-agent/local-highlights.js`：`generateHighlightsFromPath` 增加 `plan`/`rules` 入参，保留旧的均匀取点作为**无 ASR 兜底**
- 新增 `apps/macos-agent/scripts/test-highlight-scorer.js`

### 2.6 验收标准
1. 给定含 `keep:["增长"]` / `drop:[{timeRange}]` 的规则与一份 fixture cues，`plan()` 输出：keep 命中片段入选、drop 区间被完整剔除、`reason` 非空。
2. 无 ASR 时自动回落均匀取点，不报错。
3. 打分纯函数单测 ≥ 12 例全绿。

---

## 3. P0-3 一键可直接发布成片

### 3.1 目标
不只是「切一段」：一键产出 9:16 + 卡拉OK字幕 + 片头钩子 + 结尾 CTA 的**可直接发布**成片。

### 3.2 管线（复用现有服务端能力，下沉为本地渲染）
```
Plan → 选取 clip →
  1. jump-cut（去长停顿/口头禅，复用 jump-cut.ts 逻辑）
  2. reframe 9:16 blur-fit（复用 reframe.ts：contain 居中 + 同画面放大模糊填边，不裁人）
  3. ASS 卡拉OK字幕（复用 subtitles.ts 样式；提词从 words 时间戳生成 karaoke \k）
  4. 片头钩子（前 3s：标题大字/关键帧封面）
  5. 结尾 CTA（Logo + 行动号召，模板化）
  6. 水印/画质按 plan 分级（Free=720p+水印 / Starter=1080p / Pro=4K）
  → 输出 mp4 + sidecar .ass
```
- **失败必须显式报错并允许重试**，禁止静默回退到 640×360 横屏（沿用既有「竖屏导出失败处理」规则）。

### 3.3 接口
```
IPC local-render:publishable ({
  inputPath, clip:{start,end}, words?, title,
  style:{ hook:boolean, ctaText?, karaoke:boolean, aspect:'9:16'|'1:1'|'16:9' },
  plan:'free'|'starter'|'pro'
}) -> { outputPath, assPath, width, height, duration, watermark:boolean }
```
- 通过 `plan-gate.ts` 的服务端等效逻辑在本地判定 plan（token 来自 `clipop_access_token`），**fail-closed**。

### 3.4 改动文件
- 新增 `apps/macos-agent/local-render.js`（ffmpeg 滤镜图编排；ASS 写入；分级）
- 新增 `apps/macos-agent/scripts/test-local-render.js`（合成源 → 产出 → `ffmpeg -v error` 全解码校验 + 分辨率断言）
- 改 `apps/macos-agent/main.js` 注册 IPC
- 改 web 端导出入口：本地可用时走 `local-render`，否则回落服务端

### 3.5 验收标准
1. 合成 16:9 测试源，一键产出 1080×1920 H.264+AAC+faststart，`ffmpeg -v error` 全解码无错。
2. Free plan 产出 720p 且带水印；Starter 1080p 无水印。
3. 卡拉OK字幕随词高亮（ASS `\k` 时间轴与 words 对齐误差 < 80ms）。
4. 渲染失败返回结构化错误 + UI「重试」，无横屏静默回退。

---

## 4. P0-4 本地 YouTube 下载器

### 4.1 目标
用**本地 IP + 可配 Cookie** 下载，解决机房出口 `LOGIN_REQUIRED`；失败**退积分 + 可续跑**。

### 4.2 改动
- `ytdlp.js` 扩展：新增 `cookieMode:'none'|'browser'|'file'` 与 `cookieFile`（现仅 `--cookies-from-browser`）；新增 `--continue --no-overwrites` 断点续跑；将已下载分片缓存到 `userData/download-cache/<videoId>`。
- 结构化错误码：`LOGIN_REQUIRED` / `REGION_LOCKED` / `NETWORK` / `FORMAT_UNAVAILABLE`。
- 失败联动：桌面上报失败 → 服务端 `video-refund.ts` 幂等退积分（复用既有 `refundIfCharged`）。

### 4.3 接口
```
IPC local-download ({ url, cookieMode, cookieFile?, maxHeight? })
  -> { path, title, duration, videoId }
  错误: { code, message, retryable }
```

### 4.4 验收标准
1. 公开视频本地下载成功且 `ffprobe` 时长/分辨率正确。
2. 需登录视频：配 `file` cookie 后成功；无 cookie 时返回 `LOGIN_REQUIRED` 且 `retryable:true`。
3. 中断后重跑命中 `--continue`，不重复全量下载。
4. 失败调用后服务端产生**恰好一次**退积分流水（幂等）。

---

## 5. 任务清单（可执行，按依赖排序）

### S1 · 本地 AI 引擎（P0-1）
- [x] T1.1 `local-models.js`：模型注册表 + 下载/校验 + 进度事件
- [x] T1.2 `local-asr.js`：引擎探测（whisper.cpp/sherpa-onnx/faster-whisper）+ cues/words 归一化 + sha256 缓存
- [ ] T1.3 `local-signals.js`：ffmpeg 响度/静音/频谱信号（未实现，高光暂以 ASR 语义 + 均匀兜底）
- [x] T1.4 `main.js` 注册 `local-models:*` / `local-transcribe` IPC + 「本地模型」页对接
- [x] T1.5 `agent-job-store.ts` + `jobs/route.ts`：`type` 字段与能力过滤
- [x] T1.6 `scripts/test-local-asr.js` + npm script

### S2 · 意图可控高光（P0-2）
- [x] T2.1 `local-highlight-scorer.js`（纯函数打分 + keep/drop 强约束）
- [x] T2.2 `local-highlights.js` 接入 `plan`/`rules`，保留均匀兜底
- [x] T2.3 `local-highlight-rules:*` IPC + `highlight-rules.json` 持久化
- [x] T2.4 UI：must-keep/must-delete 规则面板 + reason 展示（`highlight-rules-panel.tsx` + `video-processor.tsx`）
- [x] T2.5 `scripts/test-highlight-scorer.js`

### S3 · 一键可发布成片（P0-3）
- [x] T3.1 `local-render.js`：jump-cut → reframe 9:16 → ASS 卡拉OK → hook → CTA → 分级
- [x] T3.2 plan 本地判定（fail-closed）+ 水印/画质分级
- [x] T3.3 `scripts/test-local-render.js`（全解码 + 分辨率断言）
- [x] T3.4 web 端本地导出入口 + 失败重试 UI

### S4 · 本地下载器（P0-4）
- [ ] T4.1 `ytdlp.js`：cookieMode/cookieFile + `--continue` + 缓存
- [ ] T4.2 结构化错误码 + 上报联动退积分
- [ ] T4.3 `scripts/test-ytdlp-download-youtube.js` 扩展三类用例

### S5 · 计费与埋点
- [x] T5.1 免费版「一次性完整成片导出」额度在本地渲染路径生效（复用 `export-allowance.ts`）
- [ ] T5.2 埋点：本地转写/成片/规则命中率/二次回访（PostHog）——已埋「可发布成片导出」事件，其余待补

---

## 6. 里程碑与验收口径
- **M1（S1）**：断网可转写 → 最小闭环成立。验收：T1.6 通过 + 手工 10 分钟视频转写。
- **M2（S2+S3）**：意图可控 → 一键出成片。验收：规则命中单测 + 1080×1920 全解码。
- **M3（S4+S5）**：本地下载闭环 + 免费额度与埋点。验收：退积分幂等 + 埋点落库。

> 工程规则：仅用 pnpm；禁止硬编码颜色（用 `globals.css` 主题变量）；每阶段 `pnpm ts-check` + `pnpm build`；交付后经用户确认再 commit + push（push main 触发自动部署）。
