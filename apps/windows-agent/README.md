# Clipop Agent (Windows)

Clipop Agent Windows 版客户端，基于 Electron 33 + 嵌入式 Next.js standalone 构建，功能与 [Mac 版](../macos-agent/) 完全一致。

## 简介

用户通过桌面客户端即可使用 Clipop AI 的全部能力：输入 YouTube / B 站视频链接或上传本地视频，AI 自动分析视频亮点并生成精彩短视频片段。桌面客户端内嵌 Next.js Web 服务器，本地启动后由 BrowserWindow 加载，无需独立部署前端。

## 系统要求

- **操作系统**：Windows 10 / Windows 11 64-bit
- **内存**：≥ 4 GB RAM
- **磁盘空间**：≥ 200 MB（安装包 + 缓存）
- **网络**：需要访问 `https://www.clipopai.com` 与 `https://github.com/yt-dlp/yt-dlp/releases`（用于首次运行时下载 `yt-dlp.exe`）

## 开发

```bash
# 安装依赖
pnpm install

# 准备嵌入式 Web 资源 + 下载 yt-dlp.exe + 启动 Electron
pnpm dev
```

`pnpm dev` 会执行以下步骤：
1. 调用 `scripts/prepare-runner.js`：
   - 下载 `yt-dlp.exe` 到 `bin/yt-dlp.exe`（已存在且有效则跳过）
   - 构建根项目的 `agent` 入口（`pnpm agent:build`）
   - 构建 Next.js standalone（`pnpm next build --webpack`）
   - 复制 `dist/agent/runner.js` 到 `apps/windows-agent/runner.js`
   - 复制 `.next/standalone` 到 `apps/windows-agent/embedded-web/`
   - 生成 `embedded-web/bootstrap.js`
2. 启动 Electron 加载 `main.js`

## 构建

```bash
# 构建 NSIS 安装包（默认）
pnpm dist

# 构建便携版（单文件 .exe，无需安装）
pnpm dist:portable

# 仅打包（不生成最终安装包，用于调试 electron-builder 配置）
pnpm pack
```

**输出位置**：

- **NSIS 安装包**：`dist/Clipop-Agent-Setup-0.9.30.exe`
- **便携版**：`dist/Clipop-Agent-0.9.30.exe`
- **未打包目录**：`dist/win-unpacked/`

## Deep Link 协议

应用注册 `clipop://` 协议（写入 Windows 注册表）。Web 端登录成功后通过以下方式回传 token：

```
clipop://login-success?token=...&refreshToken=...&email=...&userId=...&name=...
```

**Windows 上 deep link 的两种触发场景**：

1. **应用已运行**：用户点击 `clipop://` 链接 → 系统启动新进程 → `app.requestSingleInstanceLock()` 阻止新进程 → 主实例通过 `app.on('second-instance', ...)` 接收 argv 中的 URL → 调用 `handleDeepLink()`。
2. **应用未运行**：用户点击 `clipop://` 链接 → 系统以 URL 作为 argv 启动应用 → `app.on('ready', ...)` 中遍历 `process.argv` 查找 `clipop://` 前缀 → 延迟 2 秒后调用 `handleDeepLink()`。

## 注册登录流程

与 Mac 版完全一致：

1. 用户在桌面客户端点击「登录」 → 调用 `shell.openExternal('https://www.clipopai.com/login?from=desktop&callback=http://127.0.0.1:port')` 唤起系统默认浏览器
2. 用户在浏览器完成登录
3. Web 端通过以下两种方式之一回传 token：
   - **HTTP 回调**：`POST http://127.0.0.1:{port}/api/desktop-auth`，body 包含 `{ token, refreshToken, email, userId, name }`
   - **Deep link**：`clipop://login-success?token=...&...`
4. 主进程通过 `persistAndSyncAuth()` 将 token 持久化到 `config.json`
5. 通过 `injectAuthToWebWindow()` 将 token 注入嵌入式 Web 窗口的 `localStorage` 与 `window.__clipopDesktop*` 变量
6. 1.2 秒后再次注入，2.5 秒后 `reload()` 确保前端 UI 刷新到登录态

## Token 存储位置

```
%APPDATA%\clipop-windows-agent\config.json
```

即 `C:\Users\{用户名}\AppData\Roaming\clipop-windows-agent\config.json`，明文 JSON 格式，包含字段：

```json
{
  "authToken": "...",
  "authRefreshToken": "...",
  "authEmail": "...",
  "authUserId": "...",
  "authName": "..."
}
```

## 日志位置

```
%APPDATA%\clipop-windows-agent\logs\ClipopAgent\app.log
```

> 注意：Windows 没有 `app.getPath('logs')`，因此使用 `app.getPath('userData')/logs/ClipopAgent/app.log` 作为日志路径。Mac 版则使用 `app.getPath('logs')/ClipopAgent/app.log`。

## 与 Mac 客户端的关键差异

| 维度 | Mac (`apps/macos-agent/`) | Windows (`apps/windows-agent/`) |
|---|---|---|
| **单实例锁** | 不需要（Mac 由系统保证） | **必须**：`app.requestSingleInstanceLock()`，否则 deep link 会启动新实例 |
| **Deep link 接收事件** | `app.on('open-url', ...)` 在 ready 之前触发 | `app.on('second-instance', ...)` 通过 argv 接收 + ready 时遍历 `process.argv` |
| **日志路径** | `app.getPath('logs')/ClipopAgent/app.log` | `app.getPath('userData')/logs/ClipopAgent/app.log` |
| **图标** | `icon.png` | `icon.ico`（也保留 `icon.png` 供 electron-builder 自动转换） |
| **ffmpeg 二进制** | `@ffmpeg-installer/ffmpeg` darwin x64/arm64 | `@ffmpeg-installer/ffmpeg` win32 x64 |
| **yt-dlp 二进制** | `bin/yt-dlp`（Mac Mach-O） | `bin/yt-dlp.exe`（Windows PE） |
| **yt-dlp 下载 URL** | `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos` | `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe` |
| **文件权限** | 需要 `chmod +x` + `xattr -dr com.apple.quarantine` | 不需要（Windows 不使用 Unix 权限） |
| **二进制校验** | Mach-O magic（`cafebabe` / `feedface` 等） | PE magic（`MZ` = `0x4d 0x5a`） |
| **打包目标** | `dmg` (arm64) | `nsis` (x64) + `portable` (x64) |
| **App ID** | `com.clipop.macos-agent` | `com.clipop.windows-agent` |
| **Package name** | `clipop-macos-agent` | `clipop-windows-agent` |
| **prepare-runner.js** | 调用独立的 `scripts/prepare-ytdlp.js` | 内联 yt-dlp.exe 下载逻辑（无单独 prepare-ytdlp.js） |

其余代码（`preload.js` / `preload-web.js` / `i18n.js` / `ytdlp.js` / `local-highlights.js` / `media-server.js` / `renderer/*`）均与 Mac 版完全一致，跨平台兼容。

## 首次运行 SmartScreen 警告处理

由于本应用未进行代码签名，Windows SmartScreen 在首次运行安装包时会显示「Windows 已保护你的电脑」警告。处理方法：

1. **NSIS 安装包**：点击「更多信息」→「仍要运行」
2. **便携版 exe**：右键 → 属性 → 勾选「解除锁定」→ 重新双击运行
3. **已安装的应用**：首次启动时同样会弹出 SmartScreen 警告，按上述步骤处理

> 企业部署或需要消除警告的用户，可使用代码签名证书对 `dist/Clipop-Agent-Setup-0.9.30.exe` 进行签名，并在 `package.json` 的 `build.win` 中配置 `certificateFile` 与 `certificatePassword`。

## 目录结构

```
apps/windows-agent/
├── main.js                    # 主进程入口（Windows 适配版）
├── preload.js                 # 调试窗口 preload（与 Mac 一致）
├── preload-web.js             # Web 窗口 preload（与 Mac 一致）
├── i18n.js                    # 国际化（与 Mac 一致）
├── ytdlp.js                   # yt-dlp 调用封装（与 Mac 一致）
├── local-highlights.js        # 本地视频切片逻辑（与 Mac 一致）
├── media-server.js            # 本地媒体 HTTP 服务器（与 Mac 一致）
├── package.json               # Windows 构建配置
├── icon.png                   # 应用图标（PNG，electron-builder 自动转 ico）
├── icon.ico                   # 应用图标（ICO，构建时需要，需自行准备）
├── bin/
│   └── yt-dlp.exe             # 由 prepare-runner.js 下载生成
├── renderer/
│   ├── index.html             # 调试控制台 UI（与 Mac 一致）
│   └── renderer.js            # 调试控制台逻辑（与 Mac 一致）
├── scripts/
│   └── prepare-runner.js      # 构建准备脚本（Windows 版，下载 yt-dlp.exe）
├── embedded-web/              # 由 prepare-runner.js 生成（构建时）
├── runner.js                  # 由 prepare-runner.js 复制（构建时）
└── dist/                      # electron-builder 输出目录
```

## 开发规范

- **包管理器**：仅允许使用 `pnpm`
- **Hydration 错误预防**：使用 `'use client'` + `useEffect` + `useState`
- **颜色使用**：使用 `globals.css` 中的主题变量，禁止硬编码颜色
- **字体**：使用语义化变量（`bg-background`、`text-foreground`）
