# YouTube Proxy — Cloudflare Worker

本 Worker 从 Cloudflare IP 调用 YouTube InnerTube API，并提供视频流转发接口，用于绕过 YouTube 对 AWS/Vercel 数据中心 IP 的封锁。

## 一次性部署步骤

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

### 3. 部署 Worker

```bash
cd cf-worker
wrangler deploy
```

部署成功后会输出 Worker URL，格式如：
```
https://youtube-proxy.<your-subdomain>.workers.dev
```

### 4. 在 Vercel 设置环境变量

进入 Vercel Dashboard → 项目 → Settings → Environment Variables，添加：

```
CF_WORKER_URL = https://youtube-proxy.<your-subdomain>.workers.dev
```

重新部署项目后生效。

## 可选：启用密钥保护（防止滥用）

编辑 `wrangler.toml`，取消注释并设置密钥：

```toml
[vars]
CF_SECRET_KEY = "your-secret-key-here"
```

然后在 Vercel 也添加：
```
CF_WORKER_URL = https://youtube-proxy.<your-subdomain>.workers.dev?key=your-secret-key-here
```

## 免费额度

Cloudflare Workers 免费套餐每天 100,000 次请求，对绝大多数使用场景完全够用。

## 测试 Worker

```bash
### 1) Resolve（获取可播放流信息）

```bash
curl "https://youtube-proxy.<your-subdomain>.workers.dev/resolve?videoId=dQw4w9WgXcQ"
```
```

正常响应示例：
```json
{
  "title": "Rick Astley - Never Gonna Give You Up",
  "duration": 213,
  "streamUrl": "https://rr1---sn-...",
  "quality": "360p",
  "client": "IOS"
}
```

### 2) Stream（按 Range 转发视频流，供 ffmpeg 直接 -i 使用）

```bash
curl -I -H "Range: bytes=0-1" "https://youtube-proxy.<your-subdomain>.workers.dev/stream?videoId=dQw4w9WgXcQ"
```
