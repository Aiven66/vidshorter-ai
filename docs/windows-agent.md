## Windows 后台 Agent（第一版）

### 概述

Windows 版 Agent 完整复刻 macOS Agent 的实现方案，在 Windows 平台实现 Clipop AI 的全部核心功能：

- 后台常驻运行（Windows Task Scheduler 自启动，对应 macOS 的 launchd）
- 轮询 Web 服务端 Job 队列（`/api/agent/jobs/pull`）
- 本地执行视频处理流程：`analyzeVideo` → `downloadSourceVideo` → `createLocalClip`
- 利用设备网络出口下载视频（避免数据中心 IP 风控，与 macOS Agent 同理）
- 产物回传（report clips 为 dataUrl 或 serve-clip URL）

### 与 macOS 客户端的对应关系

| macOS 客户端 | Windows 客户端 | 说明 |
|---|---|---|
| `src/agent/runner.ts` | `src/agent/runner.ts`（复用） | 纯 Node.js 跨平台，无需修改 |
| `src/agent/cli.ts`（launchctl） | `src/agent/windows-cli.ts`（schtasks） | 平台特定 CLI |
| launchd plist（LaunchAgents） | Task Scheduler XML + wrapper .cmd | 自启动配置 |
| plist `EnvironmentVariables` | wrapper .cmd `set "VAR=value"` | 环境变量传递 |
| `~/Library/Logs/ClipopAgent/` | `%USERPROFILE%\AppData\Local\ClipopAgent\logs\` | 日志路径 |
| `pnpm agent:mac install` | `pnpm agent:win install` | 安装命令 |

### 1. 构建

```bash
pnpm agent:build
```

产物：
- `dist/agent/runner.js` — 跨平台 Agent 运行器（与 macOS 共用）
- `dist/agent/cli.js` — macOS CLI
- `dist/agent/windows-cli.js` — Windows CLI

### 2. 安装（Task Scheduler 自启动）

在 Windows 上（需预装 Node.js 20+）：

```cmd
# 方式 A：直接用编译后的 CLI
node dist\agent\windows-cli.js install --server https://www.clipopai.com --secret <AGENT_SECRET>

# 方式 B：用发布包的 PowerShell 脚本
powershell -ExecutionPolicy Bypass -File install.ps1 -Server https://www.clipopai.com -Secret <AGENT_SECRET>
```

可选参数：
- `--agentId agent-win-xxx`（不指定则自动生成）

安装位置：
- wrapper：`%USERPROFILE%\AppData\Local\ClipopAgent\clipop-agent.cmd`
- 配置：`%USERPROFILE%\AppData\Local\ClipopAgent\clipop-agent-task.xml`
- 日志：`%USERPROFILE%\AppData\Local\ClipopAgent\logs\out.log`、`err.log`
- Task Scheduler 任务名：`ClipopAgent`

### 3. 管理命令

```bash
# 通过 CLI
node dist\agent\windows-cli.js status
node dist\agent\windows-cli.js stop
node dist\agent\windows-cli.js start
node dist\agent\windows-cli.js uninstall

# 或通过 PowerShell 管理脚本
.\manage.ps1 status
.\manage.ps1 stop
.\manage.ps1 start
.\manage.ps1 uninstall
```

### 4. 发布包（不依赖 pnpm）

生成 release 目录：

```bash
bash scripts/windows-agent-release.sh
```

产物在 `release/windows-agent/` 下：

| 文件 | 说明 |
|---|---|
| `runner.js` | Agent 运行器（核心逻辑） |
| `windows-cli.js` | Windows CLI |
| `cli.js` | macOS CLI（附带，跨平台备用） |
| `install.ps1` | PowerShell 安装脚本 |
| `uninstall.ps1` | PowerShell 卸载脚本 |
| `manage.ps1` | 便捷管理入口 |

在 Windows 上使用发布包：

```powershell
# 安装
$env:VIDSHORTER_SERVER_URL = "https://www.clipopai.com"
$env:AGENT_SECRET = "your-secret"
powershell -ExecutionPolicy Bypass -File install.ps1

# 或传参
powershell -ExecutionPolicy Bypass -File install.ps1 -Server https://www.clipopai.com -Secret your-secret

# 卸载
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```

### 5. 测试验证

```bash
# 运行全部逻辑测试（11 项）
pnpm test:windows-agent
```

测试覆盖：
- 参数解析（空格分隔 / 等号形式 / 缺失参数）
- wrapper .cmd 脚本生成（环境变量、路径转换、CRLF 换行）
- 无 secret 时的正确处理
- Task Scheduler XML 路径转换与特殊字符转义
- 路径转换（Unix → Windows 反斜杠）
- Agent Job 数据模型完整性
- autoCount 高光数量自动计算（与服务端一致）
- desiredClipCount 范围限制 [1, 10]

### 6. 验证（端到端）

1. 在 Windows 上安装 Agent
2. 在 Web 端创建 Agent Job（输入 YouTube/B 站链接点击 Analyze）
3. Windows Agent 自动拉取 Job 并处理
4. 观察 Job 进度与 clips 是否回传并可预览下载
5. 查看 `%USERPROFILE%\AppData\Local\ClipopAgent\logs\out.log` 确认运行日志

### 7. 核心功能清单

- [x] 后台常驻运行（Task Scheduler + RestartOnFailure）
- [x] 开机自启动（LogonTrigger + BootTrigger）
- [x] Job 轮询（每 2s pull 一次）
- [x] 视频分析（Piped/Invidious 代理 → 生成高光）
- [x] 视频下载（设备网络出口，避免风控）
- [x] 视频剪辑（ffmpeg 截取片段 + 缩略图）
- [x] 结果回传（base64 dataUrl / serve-clip URL）
- [x] 崩溃恢复（Task Scheduler RestartOnFailure，间隔 1 分钟）
- [x] 日志记录（stdout/stderr 重定向到日志文件）
- [x] AGENT_SECRET 鉴权（x-agent-secret header）

### 8. 环境要求

- Windows 10/11（64 位）
- Node.js 20+（需在 PATH 中）
- ffmpeg（由 `@ffmpeg-installer/ffmpeg` 自动提供，无需单独安装）
- yt-dlp（由 runner 运行时自动下载到临时目录）
