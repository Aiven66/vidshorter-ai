# Clipop AI 产品上下文（调研前置资料）

本文件是 `next-iteration-feature-research` skill 的参考资料。调研前读一遍，可避免重复劳动和违反硬约束。
能力现状随版本变化，**以 `apps/macos-agent/package.json` 与 grep `ipcMain.handle(` 的实测结果为准**。

## 1. 产品定位与硬约束

- **定位**：本地 AI 视频处理器（macOS 桌面客户端 / Electron，Apple Silicon）。核心能力是**高光时刻切片**（长视频 → 短视频成片）。
- **零云端大模型**：不调用第三方 LLM/VLM/ASR/TTS 基座 API。云端只允许做认证、支付、配置下发、可选付费重算力档。
- **硬件基线**：16GB 统一内存 Mac 能跑；32GB 为推荐档。不假设 CUDA / 大显存。
- **安装包纪律**：组件打进包内开箱即用，但安装包不能过大 → 小模型内置（合计 < 50MB 量级），大模型走按需下载（复用 `local-models:prepare` 范式 + 国内镜像源 + 断点续传）。
- **声音克隆**：高保真、零样本几秒参考音频；**男声克隆必须输出男声**；克隆后预览必须立即播放且播放的是克隆音（非参考原声）；中文读「你好，很高兴认识你，这是我的声音预览」，其他语言按语言翻译。
- **数字人**：目标是 Hengen / TopView 级逼真（口型自然准确、手持产品自然讲解、面部无干扰光），**不接受照片式假数字人**。
- **播客脚本**：自然、对话式，避免生硬与重复用词。
- **UI/UX**：与在线 web 端保持一致并可优化；深色模式必须适配；有「选择桌面」页签用于本地模型功能。
- **登录**：必须注册/登录，并重定向到在线 web 端验证；客户端显示已登录账号。
- 包管理器：**仅 pnpm**。

## 2. 能力现状（v0.10.1 基线，需复核）

| 能力 | 状态 |
| --- | --- |
| 本地 ASR | 已有：whisper.cpp（tiny/base/small）+ sherpa-onnx（SenseVoice、说话人分离），`prepare:whisper` / `prepare:sherpa` 脚本 |
| 高光检测 | 已有：规则式评分器（`local-highlight-scorer` + `local-signals` 音频/视觉信号），无本地语义理解 |
| 本地渲染 | 已有：ffmpeg 管线（`local-render`），按订阅分层导出（free 720p+水印 / starter 1080p / pro 4K） |
| 批量剪辑 | 已有：粤剪 YueCut 管线（粤语、素材分析、批量渲染、候选决策、导出、store、IPC） |
| 数字人/口型 | 已有：vendored MuseTalk + `real-human-engine`（人脸关键点嘴部合成 + 手持产品 sprite）+ `local-product-avatar` |
| TTS | 已有：Kokoro 本地优先，edge-tts（微软云端）兜底 —— **无声音克隆** |
| 下载 | 已有：`ytdlp.js` 多策略 |
| 人脸检测 | 已有：YuNet ONNX（`onnxruntime-node` 已在依赖里） |
| 媒体服务 | 已有：`media-server.js`（本地视频流给渲染窗口） |

**已知缺口**（上一个迭代的调研结论）：声音克隆、语义级理解（本地 LLM/VLM）、逐词卡拉OK字幕、镜头/节拍对齐、抠像/画质增强、数字人逼真度。

## 3. 许可证红线（禁止集成，已核实）

只用「代码 License + **模型权重 License**」双绿的项目。以下为已核实的红线，不要再重复调研：

| 项目 | 问题 |
| --- | --- |
| Sonic（腾讯） | CC-BY-NC-SA 非商用 |
| MatAnyone / MatAnyone2 | S-Lab 非商用 |
| F5-TTS 权重 | CC-BY-NC（代码 MIT） |
| XTTS-v2 | CPML 禁商用且已无授权渠道 |
| Video2X / APISR / RVM / aeneas / aubio / RubberBand / seed-vc | AGPL-3.0 或 GPL 系 |
| Make-An-Audio 2 | 权重 CC-BY-NC |
| IndexTTS2 / 2.5 | 自定义 bilibili 许可（有营收门槛 + 禁止用于改进竞品模型）且**不支持粤语**；暂缓 |
| LatentSync / EchoMimicV3 / Hallo / SeedVR2 / HunyuanVideo-Avatar | 许可多可商用但**仅 CUDA 或需 18GB+**，本地机器不可行（只能作云端付费档） |

已确认可商用且 16GB Mac 可行的常用选项：CosyVoice3（Apache-2.0，含粤语）、GPT-SoVITS（MIT）、stable-ts（MIT）、TransNetV2（MIT）、PySceneDetect（BSD-3）、Qwen2.5-VL（Apache-2.0，mlx-vlm）、Qwen3-4B（Apache-2.0）、beat_this（MIT）、BiRefNet（MIT）、DeepFilterNet3（MIT/Apache）、Real-ESRGAN（BSD-3/Apache）、Practical-RIFE（MIT）、LivePortrait（MIT）、Ditto（Apache-2.0）、Wan2.x（Apache-2.0）、LTX-Video（LTXV Open Weights，年营收门槛）、Stable Audio Open Small（Community License，年营收门槛）。

## 4. 竞品调研对象

海外：Opus Clip、Descript、Submagic、Vizard、Klap、Gling、Kapwing、Recut、Runway、CapCut。
国内：剪映专业版 / 剪映小助手、必剪、腾讯智影、度加剪辑、通义听悟、YueCut 系批量剪辑工具。

调研重点不是功能罗列，而是**他们用什么机制拉动留存与付费**：免费额度形态、水印/导出限制、模板库、批量生产、发布排期、素材复用、团队协作、历史资产沉淀、付费墙位置。

## 5. 历史调研文档（先读，避免重复）

- `.trae/documents/v2-高光核心攻坚-产品调研与需求清单.md`
- `.trae/documents/retention-mvp-p0-p1-plan.md`
- `.trae/documents/付费墙放宽-免费下载与邀请裂变-实现方案.md`
- `.trae/documents/批量生产队列-实现方案.md`
- `.trae/documents/月度积分重构-实现方案.md`
- `docs/prd-desktop-next-iteration.md`（本地优先路线的开源选型：CosyVoice3 / stable-ts / Qwen3-4B / TransNetV2 / beat_this 等）
