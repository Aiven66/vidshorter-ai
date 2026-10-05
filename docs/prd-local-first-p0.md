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

## 5. P1-6 配方（Recipe）一键复跑 + 批量复用

### 5.1 目标
把「调好的导出风格」沉淀为**账号级命名配方**：换个素材一键复跑同一套设置。用户不必每次重调参数 —— 这是回访的核心理由，也是把「一次性剪辑器」升级为「内容生产线」的关键私有资产。

### 5.2 商业定位（留存 + 转化双引擎）
- **留存**：配方 = 用户私有资产，换素材即可复用，形成「保存 → 回访 → 复跑」的正循环。
- **转化**：免费档仅可保存 **1 条**配方；Starter+ 不限量 —— 配方库本身成为清晰的付费台阶，且随用户积累而迁移成本递增。

### 5.3 配方模型
固化字段与首页「高级设置」一一对应：
`quality / exportVertical / exportSubtitles / exportJumpCut / exportVoiceover / voiceoverVoice / exportBgm / bgmMood / bgmOrigVol / exportKaraoke / subStyle / subLang / exportTemplate / scenario / maxClips / targetDuration`。
- **归一化**：逐字段白名单校验，非法值回落默认，未知字段丢弃（损坏数据 / 旧版本配方安全降级，绝不抛错）。
- **存储**：`localStorage`，key = `clipop_recipes:<userId>`，按账号隔离；SSR / 无 window 下安全回落空列表。
- 配方只描述「怎么导出」，**不含媒体来源**，因此可在任意视频上复跑。

### 5.4 改动文件
- 新增 `src/lib/recipes.ts`（纯函数：类型 + 归一化 + 列表 CRUD + 存储适配 + 档位上限）
- 新增 `src/components/home/recipe-panel.tsx`（保存 / 列表 / 应用 / 删除 + 免费档升级 CTA）
- 改 `src/components/home/video-processor.tsx`（挂载面板 + 设置快照 `recipeConfig` / 回填 `applyRecipeConfig`）
- i18n：`common.ts`（en）+ `zh.ts` + `zh-Hant.ts` 的 `video.recipe.*`
- 新增 `scripts/check-recipes.ts` + `package.json#test:recipes`

### 5.5 验收标准
1. `pnpm test:recipes` 全绿（归一化 / CRUD / 去重排序 / 档位上限 / i18n 齐备，19 项）。
2. 免费档保存 1 条后出现升级引导；Starter+ 可保存多条，应用后设置即刻回填。
3. 配方按账号隔离，退出登录后列表清空、不泄露他人配方。
4. 损坏的 localStorage 数据不导致崩溃（回落空列表 / 默认值）。
5. `pnpm ts-check` 零新增错误；`pnpm build` 成功。

---

## 6. 任务清单（可执行，按依赖排序）

### S1 · 本地 AI 引擎（P0-1）
- [x] T1.1 `local-models.js`：模型注册表 + 下载/校验 + 进度事件
- [x] T1.2 `local-asr.js`：引擎探测（whisper.cpp/sherpa-onnx/faster-whisper）+ cues/words 归一化 + sha256 缓存
- [x] T1.3 `local-signals.js`：ffmpeg 响度/静音/高频带信号（`ebur128` 逐点 LUFS 动态归一 + `silencedetect` 抑制死air + `highpass` 派生笑声/情绪），产出 `signals.loudness` / `signals.emotion` 供打分器消费；无 ffmpeg 时抛 `NO_FFMPEG` 并由调用方降级为纯 ASR 语义打分，不阻断出片
- [x] T1.7 `scripts/check-local-signals.js` + `pnpm --dir apps/macos-agent test:local-signals`（32 项断言，含真实 ffmpeg 合成音频链路）
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
- [x] T4.1 `ytdlp.js`：cookieMode/cookieFile + `--continue` + 缓存（+ `downloadWithYtDlp` / IPC `local-download`）
- [x] T4.2 结构化错误码（`classifyYtDlpError`）+ 上报联动退积分（`POST /api/videos/refund` 复用 `refundIfCharged`）
- [x] T4.3 `scripts/check-ytdlp-strategies.js` 扩展用例（公开成功 / LOGIN_REQUIRED+retryable / REGION_LOCKED / NETWORK / 续跑命中 `--continue`，共 6 项）

### S5 · 计费与埋点
- [x] T5.1 免费版「一次性完整成片导出」额度在本地渲染路径生效（复用 `export-allowance.ts`）
- [x] T5.2 埋点：本地转写/成片/规则命中率/二次回访（`local_transcribe` / `local_render_publishable` / `local_highlight_planned`（含 `rule_hit_rate`、`signals_extracted`）/ `local_return_visit`（含 `gap_days`）；桌面端 `analysis` 经本地管线 SSE `complete` 事件回传；已埋「可发布成片导出」事件）

### S6 · 配方一键复跑（P1-6）
- [x] T6.1 `src/lib/recipes.ts`：类型 + 白名单归一化 + 列表 CRUD + 账号级存储 + 档位上限
- [x] T6.2 `recipe-panel.tsx`：保存 / 列表 / 应用 / 删除 + 免费档升级 CTA
- [x] T6.3 `video-processor.tsx`：挂载面板 + 设置快照（`recipeConfig`）/ 回填（`applyRecipeConfig`）
- [x] T6.4 i18n `video.recipe.*`（en / zh / zh-Hant）
- [x] T6.5 `scripts/check-recipes.ts` + `pnpm test:recipes`（19 项）
- [ ] T6.6 配方一键投递到批量队列（复用 `/api/videos/batch/process`，一次提交多条同一风格）

---

## 7. 里程碑与验收口径
- **M1（S1）**：断网可转写 → 最小闭环成立。验收：T1.6 通过 + 手工 10 分钟视频转写。
- **M2（S2+S3）**：意图可控 → 一键出成片。验收：规则命中单测 + 1080×1920 全解码。
- **M3（S4+S5）**：本地下载闭环 + 免费额度与埋点。验收：退积分幂等 + 埋点落库。
- **M4（S6）**：配方一键复跑，形成「保存 → 回访 → 复跑」正循环。验收：单测 19 项 + 免费档升级引导 + 应用后设置回填。

> 工程规则：仅用 pnpm；禁止硬编码颜色（用 `globals.css` 主题变量）；每阶段 `pnpm ts-check` + `pnpm build`；交付后经用户确认再 commit + push（push main 触发自动部署）。
