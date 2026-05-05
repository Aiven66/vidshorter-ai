# VidShorter AI - GitHub Releases 发布指南

## 一、问题解决总结

### 1. 邮件验证码服务配置问题（已修复）

**问题**：
- Web 端注册时显示 "Verification service not configured" 错误
- 无法收到验证码邮件

**解决方案**：
- 修改了 [`src/app/api/send-verification-code/route.ts`](./src/app/api/send-verification-code/route.ts)
- 添加了 Gmail SMTP 自动配置支持
- 现在可以通过设置以下环境变量来使用 Gmail 发送邮件

**Vercel 环境变量配置**：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `GMAIL_USER` | 你的 Gmail 邮箱地址 | `aiven666666@gmail.com` |
| `GMAIL_PASS` | Gmail 应用专用密码 | `xxxx xxxx xxxx xxxx` |
| `EMAIL_OTP_SECRET` | 可选，用于签名验证码的密钥 | 随机字符串 |

**如何获取 Gmail 应用专用密码**：
1. 开启 Gmail 两步验证
2. 访问 https://myaccount.google.com/apppasswords
3. 生成新的应用密码（选择"其他"作为应用类型）
4. 将生成的 16 位密码填入 `GMAIL_PASS`

---

### 2. Mac DMG 安装包（已就绪）

**当前最新版本**：`0.7.22`

**文件位置**：
- `/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent/dist/VidShorter-Agent-0.7.22-arm64.dmg`

**支持架构**：Apple Silicon (arm64)

---

## 二、GitHub Releases 发布步骤

### 步骤 1：准备 GitHub 仓库

确保你的项目已经推送到 GitHub。如果还没有，请先初始化 git 仓库并推送。

```bash
cd /Users/aiven/Desktop/AI/codex/projects
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

---

### 步骤 2：创建 GitHub Release

#### 方法 A：通过 GitHub 网页界面（推荐）

1. **访问你的 GitHub 仓库**
   - 打开 https://github.com/你的用户名/你的仓库名

2. **进入 Releases 页面**
   - 点击右侧栏的 "Releases"
   - 或直接访问：https://github.com/你的用户名/你的仓库名/releases

3. **创建新 Release**
   - 点击 "Draft a new release" 按钮

4. **填写 Release 信息**

   | 字段 | 内容建议 |
   |------|----------|
   | **Choose a tag** | 点击 "Choose a tag"，输入 `v0.7.22`，然后点击 "Create new tag: v0.7.22 on publish" |
   | **Release title** | `VidShorter AI v0.7.22` |
   | **Describe this release** | 见下方的 Release 说明模板 |

5. **上传 DMG 文件**
   - 在 "Attach binaries by dropping them here or selecting them." 区域
   - 点击 "selecting them"，选择文件：
     ```
     /Users/aiven/Desktop/AI/codex/projects/apps/macos-agent/dist/VidShorter-Agent-0.7.22-arm64.dmg
     ```
   - 也可以直接将文件拖拽到该区域

6. **发布**
   - 确认信息无误后，点击 "Publish release"

---

#### 方法 B：通过 GitHub CLI（命令行）

如果你安装了 GitHub CLI，可以使用命令行发布：

```bash
cd /Users/aiven/Desktop/AI/codex/projects

# 创建 tag
git tag -a v0.7.22 -m "Release v0.7.22"
git push origin v0.7.22

# 创建 Release
gh release create v0.7.22 \
  --title "VidShorter AI v0.7.22" \
  --notes-file RELEASE_NOTES.md \
  apps/macos-agent/dist/VidShorter-Agent-0.7.22-arm64.dmg
```

---

### 步骤 3：Release 说明模板

```markdown
# VidShorter AI v0.7.22

## 🎉 新版本发布！

VidShorter AI 是一个 AI 驱动的长视频转短视频平台，支持 YouTube、Bilibili 以及本地视频文件。

## 📦 下载

### macOS (Apple Silicon)
- [📥 VidShorter-Agent-0.7.22-arm64.dmg](https://github.com/你的用户名/你的仓库名/releases/download/v0.7.22/VidShorter-Agent-0.7.22-arm64.dmg)

## 🚀 功能特性

- ✅ 支持 YouTube/Bilibili 视频链接
- ✅ 支持本地视频文件上传
- ✅ AI 自动分析视频亮点
- ✅ 自动生成短视频剪辑
- ✅ 实时进度显示
- ✅ 支持预览和下载

## 📖 使用说明

1. 下载并安装 `VidShorter-Agent-0.7.22-arm64.dmg`
2. 打开应用后，点击菜单栏 → Sign In
3. 完成账号注册/登录后返回应用
4. 粘贴视频链接或选择本地视频文件
5. 点击 Analyze，等待 AI 分析完成
6. 预览并下载生成的精彩片段

## 🌐 Web 端

访问在线版本：https://projects-pi-kohl.vercel.app/

## 🆕 本次更新

- 优化了邮件验证码发送（支持 Gmail）
- 改进了本地视频处理性能
- 修复了若干已知问题

---

**注意**：首次打开时可能会被 macOS 拦截。解决方法：
- 右键点击应用 → 打开
- 或在系统设置 → 安全性与隐私中允许
```

---

### 步骤 4：在 Web 端添加下载链接

更新你的 Web 端下载页面，添加 GitHub Releases 的下载链接。

编辑 [`src/app/download/page.tsx`](./src/app/download/page.tsx)，将下载链接指向 GitHub Release。

---

## 三、后续版本发布流程

当你需要发布新版本时：

### 1. 更新版本号

编辑 [`apps/macos-agent/package.json`](./apps/macos-agent/package.json)，更新 `version` 字段：

```json
{
  "version": "0.7.23"
}
```

### 2. 重新编译 DMG

```bash
cd /Users/aiven/Desktop/AI/codex/projects/apps/macos-agent
pnpm dist
```

新的 DMG 文件会生成在 `apps/macos-agent/dist/` 目录。

### 3. 按上述步骤发布到 GitHub Releases

---

## 四、Vercel 环境变量配置（重要！）

要让邮件验证码功能正常工作，需要在 Vercel 中配置环境变量：

1. **访问 Vercel 项目设置**
   - 打开 https://vercel.com/你的用户名/你的项目名/settings/environment-variables

2. **添加以下环境变量**：

| Name | Value | Environment |
|------|-------|-------------|
| `GMAIL_USER` | 你的 Gmail 邮箱 | Production, Preview, Development |
| `GMAIL_PASS` | 你的 Gmail 应用专用密码 | Production, Preview, Development |
| `EMAIL_OTP_SECRET` | 随机生成的密钥字符串（可选） | Production, Preview, Development |

3. **重新部署**
   - 添加环境变量后，需要触发一次新的部署才能生效

---

## 五、验证发布是否成功

1. 访问 GitHub Releases 页面，确认新版本已发布
2. 下载 DMG 文件并测试安装
3. 在 Web 端测试注册功能，确认能收到验证码邮件
4. 测试完整的视频处理流程

---

## 附录：重新编译 DMG 的完整命令

```bash
cd /Users/aiven/Desktop/AI/codex/projects/apps/macos-agent

# 安装依赖（如果还没安装）
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" pnpm install --no-frozen-lockfile

# 编译 DMG
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" pnpm dist

# 查看生成的文件
ls -lh dist/
```
