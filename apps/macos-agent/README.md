# VidShorter Agent (macOS)

## Build DMG

```bash
cd apps/macos-agent
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" pnpm install --no-frozen-lockfile
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" pnpm dist
```

输出：
- `apps/macos-agent/dist/VidShorter-Agent-<version>-<arch>.dmg`

## Install

1) 打开 dmg，把 `VidShorter Agent.app` 拖到 `/Applications`  
2) 首次运行打开设置页，确认：
   - Server URL：默认 `https://projects-pi-kohl.vercel.app`
   - Agent ID：默认 `agent-mac-1`
   - AGENT_SECRET：如服务端配置了则填写
3) 点击 Save，然后点击 Start

应用会设置开机自启（Login Item），并在本机持续拉取 job 执行剪辑。

