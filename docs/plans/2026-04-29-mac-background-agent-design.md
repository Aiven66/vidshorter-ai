## 目标

在不依赖 Vercel/Cloudflare 数据中心 IP 获取 YouTube/B 站源视频的前提下，通过用户本机（macOS）网络出口完成“解析 → 下载 → ffmpeg 剪辑 → 回传结果”，实现线上“稳定生成高光短视频”的商用级体验。

## 范围（第一版：后台常驻）

- macOS 后台常驻 Agent（launchd 自启动）
- 与现有 Web 端 job 队列对接：/api/agent/jobs（create/pull/report/status）
- 任务处理：analyzeVideo → downloadSourceVideo → createLocalClip（产出 mp4 + thumbnail/base64）
- 产物回传：沿用现有 report 结果结构（clips[].videoUrl 为 dataUrl 或 serve-clip URL）

不包含：
- 桌面 UI（菜单栏/窗口）
- 复杂用户级鉴权（先用共享 AGENT_SECRET；后续可升级为 per-user token）
- 多机/多 Agent 负载均衡（先一机一 Agent）

## 架构与数据流

1) Web（Vercel）创建 job：videoUrl + desiredClipCount + userId  
2) macOS Agent 轮询 pull（带 x-agent-secret）：拿到 job 后进入 processing  
3) Agent 本地执行：
   - YouTube：优先走本机环境可用的解析与下载策略（避免数据中心风控）
   - B 站：走现有 video-clipper 路线
   - 本地视频：直接读取文件路径或 file upload（后续扩展）
4) Agent 通过 report 回写进度与最终 clips（base64 或 serve-clip）  
5) Web 轮询 job 状态并展示 clips，用户预览/下载

## 安装与自启动（macOS）

采用 LaunchAgents（per-user）：
- plist 路径：~/Library/LaunchAgents/com.vidshorter.agent.plist
- ProgramArguments：/usr/bin/env node <repo>/dist/agent/runner.js
- EnvironmentVariables：
  - VIDSHORTER_SERVER_URL
  - VIDSHORTER_AGENT_ID
  - AGENT_SECRET（可选）
- 标准输出/错误输出：~/Library/Logs/VidShorterAgent/{out,err}.log

提供 CLI 管理命令：
- install：写入 plist + bootstrap/load
- start/stop：kickstart/bootout
- status：launchctl print
- uninstall：删除 plist + 停止

## 可靠性策略（第一版）

- Job 幂等：服务端 job 状态从 queued → processing → completed/failed
- Agent 崩溃恢复：launchd 拉起；job 可再次被拉取（后续可加“超时回收”）
- 大视频处理：优先本地下载到临时文件再 ffmpeg（避免远程不可 seek）
- 失败可观测：report 写入 error，日志落到本地 log 文件

## 安全策略（第一版）

- 共享 AGENT_SECRET：用于防止公开拉取/回写 job
- 不在日志中打印 secret
- 未来升级路径：Web 端为每个用户签发 agent token（短期 token + 设备绑定）

## 验收标准

- YouTube 链接在 Web 端创建 job 后，macOS Agent 可稳定完成至少 1 个 clip 的生成并回传
- B 站链接同样闭环可用
- 本地视频（上传 MP4）闭环可用

## DMG 客户端（后续实现）

提供一个可安装的 macOS .dmg：
- 用户拖拽到 /Applications 后运行
- 首次运行写入配置（serverUrl/agentId/secret）
- 设置开机自启（Login Item）
- 自动启动 agent runner 在本机网络出口执行剪辑
