# Clipop AI — Android 客户端

Android 原生客户端，参考 macOS 客户端（`src/agent/`）的实现方案，在移动端实现 Clipop AI 的全部核心功能。

## 架构

Android 客户端复刻 macOS Agent 的架构，利用设备网络出口处理视频任务：

```
Web (Vercel) 创建 Job → Android Agent 轮询 pull → 本地分析+下载+ffmpeg 剪辑 → report 回传
```

### 与 macOS 客户端的对应关系

| macOS 客户端 | Android 客户端 | 说明 |
|---|---|---|
| `src/agent/runner.ts` (主循环) | `AgentService.kt` (前台 Service) | 每 2s 轮询 `/api/agent/jobs/pull` |
| `processJob()` (处理流程) | `JobProcessor.kt` | analyze → download → clip → report |
| `videoClipper.analyzeVideo` | `VideoDownloader.kt` | Piped/Invidious 代理获取元数据+字幕 |
| `videoClipper.downloadSourceVideo` | `VideoDownloader.kt` | 下载源视频到本地 |
| `videoClipper.createLocalClip` | `VideoProcessor.kt` | FFmpegKit 截取片段+缩略图 |
| launchd 自启动 | 前台 Service + START_STICKY | 后台常驻处理 |
| Web 登录 + deep link | Custom Tabs + `clipop://` 深链 | 认证流程 |

### 核心功能

1. **用户认证** — Web Custom Tabs 登录 → deep link `clipop://login-success?token=...` 回传
2. **视频提交** — 输入 YouTube/Bilibili URL 创建 Job
3. **后台 Agent** — 前台 Service 轮询 Job 并本地处理
4. **视频分析** — Piped/Invidious 代理获取标题/时长/字幕 → 生成高光片段
5. **视频剪辑** — FFmpegKit 截取片段、生成缩略图、转 base64 dataUrl
6. **结果回传** — 进度和剪辑结果上报到服务端
7. **Job 监控** — 实时查看进度和剪辑列表
8. **设置** — 服务器地址、Agent Secret、Agent ID 配置

## 目录结构

```
android/
├── app/
│   ├── build.gradle.kts
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml          # 深链、权限、前台 Service
│       ├── res/                         # 资源（主题、图标、字符串）
│       └── java/com/clipop/ai/
│           ├── ClipopApp.kt            # Application
│           ├── MainActivity.kt         # 入口 + 导航 + deep link
│           ├── data/
│           │   ├── models/Models.kt     # 数据模型（对齐服务端）
│           │   ├── ApiClient.kt         # HTTP 客户端
│           │   └── AuthManager.kt       # 认证+设置持久化
│           ├── video/
│           │   ├── VideoDownloader.kt   # 视频解析+下载
│           │   └── VideoProcessor.kt    # FFmpegKit 剪辑
│           ├── service/
│           │   ├── AgentService.kt      # 前台 Service 主循环
│           │   └── JobProcessor.kt      # Job 处理引擎
│           └── ui/
│               ├── theme/Theme.kt      # Material3 主题
│               ├── navigation/Screen.kt
│               ├── MainViewModel.kt     # ViewModel
│               └── screens/
│                   ├── LoginScreen.kt
│                   ├── HomeScreen.kt   # 提交+Job 列表+Agent 控制
│                   ├── JobDetailScreen.kt
│                   └── SettingsScreen.kt
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
└── gradle/libs.versions.toml
```

## 构建方法

### 环境要求

- Android Studio Ladybug+ 或 Gradle 8.11+
- JDK 17
- Android SDK 35（compileSdk）
- minSdk 24（Android 7.0+）

### 命令行构建

```bash
# 生成 Gradle wrapper（首次）
cd android
gradle wrapper --gradle-version 8.11.1

# 构建 debug APK
./gradlew assembleDebug

# 构建 release APK
./gradlew assembleRelease
```

或使用项目脚本：

```bash
bash scripts/android-build.sh debug
bash scripts/android-build.sh release
```

APK 产物位于：`android/app/build/outputs/apk/debug/app-debug.apk`

### Android Studio

1. 打开 Android Studio → Open → 选择 `android/` 目录
2. 等待 Gradle sync 完成
3. 点击 Run 或 Build APK

## 使用说明

### 首次使用

1. 安装 APK
2. 打开 App，点击 "Continue with Web Account"
3. 在浏览器 Custom Tab 中完成登录
4. 登录成功后点击 "Return to Clipop Agent"，通过 deep link 回到 App

### 配置 Agent

1. 进入 Settings 页面
2. 设置 Server URL（默认 `https://www.clipopai.com`）
3. 设置 Agent Secret（与服务端 `AGENT_SECRET` 环境变量一致，未设置则留空）
4. 设置 Agent ID（默认自动生成）

### 处理视频

1. 在首页输入 YouTube/Bilibili 视频链接
2. 点击 "Analyze & Generate Clips" 创建 Job
3. 打开 Agent 开关启动后台处理
4. 点击 Job 查看进度和剪辑结果

## 服务端配合

Android 客户端复用 Web 端已有的全部 API：

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/agent/jobs` | POST | 创建 Job |
| `/api/agent/jobs/pull` | POST | Agent 拉取下一个 Job |
| `/api/agent/jobs/report` | POST | 上报进度/结果 |
| `/api/agent/jobs/:jobId` | GET | 查询 Job 状态 |
| `/api/check-login` | GET | 检查登录态 |
| `/login?from=desktop` | GET | Web 登录页 |

无需对 Web 服务端做任何改动即可使用。

## 技术栈

- **语言**: Kotlin 2.1
- **UI**: Jetpack Compose + Material3
- **网络**: OkHttp 4
- **视频处理**: FFmpegKit (com.arthenica:ffmpeg-kit-full-gpl:6.0-2)
- **图片加载**: Coil 2
- **播放器**: Media3 ExoPlayer
- **持久化**: DataStore Preferences
- **导航**: Navigation Compose
- **序列化**: Gson
- **构建**: Gradle 8.11 + AGP 8.7
