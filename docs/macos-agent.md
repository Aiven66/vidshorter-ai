## macOS 后台 Agent（第一版）

### 1. 构建

```bash
pnpm agent:build
```

产物：
- dist/agent/runner.js
- dist/agent/cli.js

### 2. 安装（launchd 自启动）

```bash
pnpm agent:mac install --server https://projects-pi-kohl.vercel.app --secret <AGENT_SECRET>
```

可选参数：
- `--agentId agent-xxx`

安装位置：
- plist：`~/Library/LaunchAgents/com.vidshorter.agent.plist`
- 日志：`~/Library/Logs/VidShorterAgent/out.log`、`~/Library/Logs/VidShorterAgent/err.log`

### 3. 管理命令

```bash
pnpm agent:mac status
pnpm agent:mac stop
pnpm agent:mac start
pnpm agent:mac uninstall
```

### 4. 验证（端到端）

1) 启动 Web（本地或线上）  
2) Web 创建一个 Agent Job（输入 YouTube/B 站链接点击 Analyze）  
3) 观察 job 进度与 clips 是否回传并可预览下载

### 5. 交付包（不依赖 pnpm）

生成 release 目录：

```bash
bash scripts/macos-agent-release.sh
```

然后在 `release/macos-agent` 下：
- `install.sh`：读取环境变量 `VIDSHORTER_SERVER_URL`、`AGENT_SECRET`、`VIDSHORTER_AGENT_ID` 执行安装
- `uninstall.sh`：卸载

## macOS 桌面客户端（本地高光剪辑）

### 回退版本

- 0.7.1（可稳定使用本地 MP4 上传 + 生成高光短视频）：`apps/macos-agent/dist/VidShorter-Agent-0.7.1-arm64.dmg`
