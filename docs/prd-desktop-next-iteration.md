# PRD — 桌面客户端下版本迭代：本地 AI 视频工作台（零云端算力）

> 定位：Clipop Agent / 粤剪（macOS Apple Silicon）是「本地算力、零云端消耗」的 AI 视频工作台。
> 本文基于 2026-10-14 对 GitHub 最先进开源框架的调研（License 逐条核对代码与模型权重、硬件可行性以 M 系列 16GB 统一内存为基线），给出下版本功能需求清单。
> 北极星指标：**周活跃导出创作者数 × 人均周导出成片数**（延续 local-first P0 PRD）。
> 前置文档：[docs/prd-local-first-p0.md](./prd-local-first-p0.md)（其 P0 已落地，本文是其下一迭代）。

---

## 0. 现状盘点（v0.10.1，2026-10-14 已核实）

| 能力 | 现状 | 缺口 |
| --- | --- | --- |
| 本地 ASR | ✅ whisper.cpp（tiny/base/small）+ sherpa-onnx SenseVoice-small + 说话人分离；模型管理器 IPC（`local-models:status/prepare`） | 仅句级时间戳，无逐词对齐 |
| 高光检测 | ✅ 规则式评分器（`local-highlight-scorer` + `local-signals` 音频/视觉信号），按频道 profile 持久化规则 | **无语义理解**：标题/摘要靠模板，无法「找某句话/某个画面」 |
| 本地渲染 | ✅ ffmpeg 管线（`local-render`），按订阅分层：free 720p+水印 / starter 1080p / pro 4K | 无镜头对齐切点、无卡点、无增强 |
| 数字人/口型 | ✅ MuseTalk（vendored）+ `real-human-engine`（关键点嘴部合成 + 手持产品 sprite）+ `local-product-avatar` | 逼真度距 Hengen/TopView 有差距 |
| TTS | ✅ Kokoro 本地优先（v0.9.40+），edge-tts（微软云端）兜底，macOS `say` 末位 | **无声音克隆**：只有固定音色，用户硬需求未满足 |
| 批量剪辑 | ✅ YueCut 管线（粤语支持、素材分析、批量渲染、候选决策） | 依赖规则高光，同上缺口 |
| 下载 | ✅ `ytdlp.js` 多策略 | — |
| 人脸检测 | ✅ YuNet ONNX（232KB，web 端 `face-detect.ts`；桌面已带 onnxruntime-node） | 桌面端未复用（追焦在云端） |
| 云端依赖 | 仅认证/支付（clipopai.com）、embedded-web 壳、edge-tts 兜底 | 符合「零云端」定位 |

**结论**：真正从 0 到 1 的缺口是 ①声音克隆、②语义级理解（本地 LLM/VLM）、③逐词字幕、④镜头/节拍对齐、⑤抠像/增强。数字人升级是「从 70 分到 90 分」。

---

## 1. 选型总览（GitHub 调研结论，2026-10）

| 方向 | 首选 | 代码 License | 权重 License | 16GB Mac | 体积 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| 声音克隆 TTS | **CosyVoice3 0.5B**（阿里） | Apache-2.0 | Apache-2.0 | ✅ MLX-4bit / GGUF | ≈1.0–1.2GB | 3 秒零样本，含**粤语**，性别/音色保持强；Mac RTF 待实测 |
| 克隆兜底 | GPT-SoVITS | MIT | MIT | ✅ CPU/MPS | 数百 MB | 支持粤语；1 分钟微调保真极高，零样本稍欠稳、偏慢 |
| 逐词字幕 | **stable-ts** | MIT | 无独立权重（对齐用 whisper 家族） | ✅ MLX | ≈150–300MB | 直接叠加在现有 whisper 生态上 |
| 语义视频理解 | **Qwen2.5-VL 3B/7B** via mlx-vlm | mlx-vlm MIT | Apache-2.0 | ✅ 4-bit | 3B≈2GB / 7B≈5–6GB | Qwen3-VL MLX 支持待核实 |
| 脚本/标题 LLM | **Qwen3-4B-Instruct**（MLX LM / Ollama） | MIT/Apache | Apache-2.0 | ✅ Q4_K_M | ≈2.5–3GB | 与 VLM 分时驻留，不同时加载 |
| 镜头切分 | **TransNetV2**（+PySceneDetect 快速规则） | MIT / BSD-3 | MIT | ✅ CPU/MPS | **数 MB** | F1 领先，零 CUDA 依赖 |
| 静音跳剪 | Auto-Editor 思路（自研+自有 ASR） | Unlicense | — | ✅ | 0 | 捆绑依赖 License 待核实，建议只借鉴算法 |
| 节拍检测 | **beat_this**（CPJKU ISMIR'24） | MIT | MIT | ✅ CPU/MPS | 数十 MB | 优于 librosa 基线；**避开 aubio（GPL）** |
| 数字人口型升级 | **Ditto**（蚂蚁） | Apache-2.0 | Apache-2.0 | ⚠️ MPS 移植待实测 | ≈数百 MB | 运动空间前馈、近实时、长视频友好；MuseTalk 保留实时主力 |
| 表情/眼神辅助 | LivePortrait | MIT | MIT | ✅ ONNX | ≈260MB | 无音频驱动口型，仅重定向前/眼神/头姿 |
| 人像抠像 | **BiRefNet**（+时序平滑） | MIT | MIT | ✅ MPS | lite≈224MB | **避开 MatAnyone（非商用）、RVM（GPL-3.0）** |
| 参考音频修复 | **DeepFilterNet3** | MIT/Apache 双许可 | 同 | ✅ | **≈3MB** | 48kHz 全带，克隆前置处理 |
| BGM 生成 | Stable Audio Open Small | MIT | Community License（年营收<$1M 可商用） | ✅ Arm CPU | ≈341M 参数 | 备选 ACE-Step（Apache，Mac 可行性待核实） |
| 超分 | Real-ESRGAN | BSD-3 | Apache | ✅ ncnn-Vulkan/CoreML | 数十 MB | 1080p→4K 慢但可行 |
| 插帧 | Practical-RIFE | MIT | MIT | ✅ 社区 MPS | 数十 MB | 慢动作/丝滑化 |
| 文/图生视频素材 | LTX-Video 2B（快）/ Wan2.2-TI2V-5B（质） | Apache | LTXV Open Weights（<$10M 营收可商用）/ Wan Apache-2.0 | ⚠️ 慢 | 2B≈数 GB | 出片数十分钟级，定位「可选素材生成」 |

**License 红线（禁止集成）**：Sonic（CC-BY-NC-SA）、MatAnyone/MatAnyone2（S-Lab 非商用）、F5-TTS 权重（CC-BY-NC）、XTTS-v2（CPML 禁商用且无授权渠道）、Video2X（AGPL）、APISR/RVM/aeneas/aubio/RubberBand/seed-vc（GPL/AGPL）、Make-An-Audio 2（CC-BY-NC）。
**暂缓**：IndexTTS2/2.5（自定义 bilibili 许可：免费商用但有营收门槛+禁止用于改进竞品模型，且**不支持粤语**）；InternVL（权重混合许可待核实）；LatentSync/EchoMimicV2-V3/Hallo/SeedVR2/HunyuanVideo-Avatar（CUDA-only 或 ≥18GB，Mac 不可行，仅可作云端付费增值）。

---

## 2. P0 — 下版本必须交付

### P0-1 声音克隆配音（核心卖点，用户硬需求）
- **用户价值**：录 3–10 秒参考音频 → 全片配音/口播/播客都用「自己的声音」；男声克隆必须男声输出；中/英/粤覆盖；与「零云端」一致（edge-tts 兜底保留但默认关闭）。
- **选型**：CosyVoice3 0.5B（MLX-4bit ≈1.2GB，Apache-2.0 可商用）；GPT-SoVITS（MIT）作高保真微调兜底。
- **集成点**：`real-human-engine` 配音段（Kokoro→克隆音色优先级链）、YueCut 批量配音、数字人口播脚本。
- **交互硬约束**（用户画像）：克隆完成后预览**立即播放**且播放的是克隆音（非参考原声）；中文朗读「你好，很高兴认识你，这是我的声音预览」，其他语言按语言翻译。
- **硬件**：M1 16GB 可跑；**风险**：Mac RTF 待实测（<1 为合格），不达标降级 GPT-SoVITS 或 Kokoro 固定音色。
- **验收**：离网状态下完成「录音→克隆→整段口播合成→口型驱动」全链路。

### P0-2 逐词卡拉OK字幕
- **用户价值**：短视频爆款字幕（逐词高亮、计时弹出），直接提升完播率；现有 ASR 只有句级。
- **选型**：stable-ts（MIT，MLX）在现有 whisper 模型上做强制对齐，零新模型负担。
- **集成点**：`local-render` 的 ASS 字幕轨（已有 Dialogue 机制）加逐词 `\t` 动画；YueCut 导出选项「字幕样式：句级/逐词/花字」。
- **硬件**：复用现有 ASR 模型，增量 ≈150–300MB。**风险**：粤语对齐质量需实测。

### P0-3 语义级高光 + 本地脚本生成
- **用户价值**：从「规则猜亮点」升级为「看懂内容」：自动生成贴题的高光标题/摘要；支持自然语言检索（「找提到价格的那段」「有产品特写的镜头」）；YueCut 批量出片时自动配文案。
- **选型**：Qwen3-4B-Instruct Q4（MLX LM，≈3GB）做转录→标题/文案/语义评分；Qwen2.5-VL 3B（mlx-vlm，≈2GB，可选开启）做画面级检索。与现有规则评分器**融合打分**（规则保底、语义增强），两者分时驻留内存。
- **集成点**：`local-highlight-scorer` 增加语义特征通道；`yuecut:material:analyze` 输出加 AI 标题/描述；新增 IPC `local-llm:status/prepare/search`。
- **硬件**：16GB 可跑 4B+3B 组合（串行加载）；32GB 体验最佳。**风险**：首 token 延迟、安装包体积 → 全部按需下载（见 §5）。

### P0-4 镜头/场景切分
- **用户价值**：切点永远落在镜头边界，不再出现「切在镜头中间」的碎闪；高光候选按镜头对齐，批量出片观感质变。
- **选型**：TransNetV2（MIT，数 MB，CPU/MPS）做边界检测 + PySceneDetect（BSD-3）做内容感知兜底。
- **集成点**：`local-signals` 增加 shot 通道；`local-render` 裁切窗口吸附到最近镜头边界（±0.5s 容差）。
- **硬件**：几乎零门槛。**这是性价比最高的 P0。**

---

## 3. P1 — 下版本应交付 / 下下版本

| 编号 | 功能 | 用户价值 | 选型（License） | 体积 | 风险 |
| --- | --- | --- | --- | --- | --- |
| P1-1 | 静音/语气词跳剪 | 口播视频自动去「嗯啊呃」与长停顿，节奏感强 | Auto-Editor 思路自研 + 自有 ASR 词级时间戳（依赖 P0-2） | 0 | 误剪笑声/强调停顿，需可调阈值 |
| P1-2 | 音乐节拍卡点 | 带货/种草视频画面踩点，模板化批量出片 | beat_this（MIT）+ librosa（ISC）兜底 | 数十 MB | 复杂编曲检测精度 |
| P1-3 | 数字人逼真度升级 | 逼近 Hengen/TopView：口型自然、长视频稳定、手持产品 | Ditto（Apache，MPS 移植）+ LivePortrait（MIT）眼神/头姿微调；MuseTalk 保留实时档 | ≈300–500MB | **MPS 移植可行性待实测**，失败则维持现状+云端 CUDA 档（P2-4） |
| P1-4 | 人像抠像/换背景 | 口播视频换直播间背景、绿幕替代 | BiRefNet lite（MIT）+ 帧间时序平滑 | ≈224MB | 单帧闪烁，必须加平滑；避开 RVM/MatAnyone 许可 |
| P1-5 | 参考音频修复 | 手机录音/有噪参考 → 干净克隆样本（P0-1 前置） | DeepFilterNet3（MIT/Apache） | **≈3MB** | 几乎无 |
| P1-6 | 本地 BGM 生成 | 免版权背景音乐一句话生成，替代素材库 | Stable Audio Open Small（Community，<$1M 可商用）；ACE-Step（Apache）备选 | ≈700MB | Mac 生成速度待核实 |

---

## 4. P2 — 规划项

| 编号 | 功能 | 说明 |
| --- | --- | --- |
| P2-1 | 超分/插帧增强导出 | Real-ESRGAN（BSD-3/Apache）+ Practical-RIFE（MIT）；绑定 pro 档 4K 导出卖点；Mac 上慢，定位「夜间挂机增强」 |
| P2-2 | 文生/图生视频素材 | LTX-Video 2B（LTXV 许可）+ Wan2.2-5B（Apache）；空镜/B-roll 生成，Mac 出片数十分钟级，定位为可选功能默认不装 |
| P2-3 | 播客双声合成 | Qwen3 拆对话脚本 + CosyVoice3 双音色逐句编排（不引入 VibeVoice：英文为主、曾下架风险） |
| P2-4 | 云端 CUDA 高质量档（可选付费） | LatentSync 1.6 / EchoMimicV3 / SeedVR2 走 GPU worker。**与零云端定位冲突，仅作增值选项，默认本地链路完整可用** |

---

## 5. 安装包体积与模型分发策略（关键约束落地）

用户要求「开箱即用但安装包不能过大」→ 两级分发：

1. **安装包内置**（合计增量 <50MB）：TransNetV2（数 MB）、beat_this（数十 MB 内）、DeepFilterNet3（≈3MB）、stable-ts 对齐逻辑（复用已有 whisper 模型）。装完即可体验 P0-2/P0-4 + P1-1/P1-2 骨架。
2. **模型管理器按需下载**（复用现有 `local-models:prepare` IPC 范式，加断点续传 + 国内镜像源）：CosyVoice3（1.2GB）、Qwen3-4B（3GB）、Qwen2.5-VL-3B（2GB，默认关）、BiRefNet lite（224MB）、Ditto（300–500MB）、BGM/视频生成（700MB+，默认关）。
3. **硬件基线**：M1 16GB = 全部 P0/P1 可跑（部分慢）；32GB 推荐 = VLM+LLM 并行、Ditto 流畅。首启做「本机能力探测」并给出档位建议。

体积预算：当前 DMG 基础上 +<50MB 内置；可选模型包合计 ≈7–9GB，用户按功能勾选。

---

## 6. 建议里程碑

1. **M1（克隆闭环）**：P1-5 → P0-1（CosyVoice3 MLX 移植 + 预览即播交互）→ 实测 Mac RTF 定兜底策略。
2. **M2（剪辑质感）**：P0-4（镜头切分）→ P0-2（逐词字幕）→ P1-1（跳剪）。
3. **M3（语义大脑）**：P0-3（Qwen3-4B 先行、VL 后置），与规则评分融合。
4. **M4（视觉升级）**：P1-4（抠像）→ P1-3（Ditto 移植 spike）→ P1-2/P1-6。

**待核实清单**（集成前必须实测/复核）：CosyVoice3 在 M 系列 RTF；Ditto MPS 移植；Qwen3-VL MLX 支持；Auto-Editor 捆绑依赖 License；ACE-Step Mac 可行性；stable-ts 粤语对齐质量。

---

*调研方法：对 2026-10 时点 GitHub 活跃项目逐条核对 README/LICENSE 与 HuggingFace/ModelScope 权重许可，硬件可行性以 Apple Silicon 16GB 统一内存为基线（MLX/MPS/ONNX/ncnn 路径）。*
