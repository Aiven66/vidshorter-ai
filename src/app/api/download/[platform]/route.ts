/**
 * /api/download/<platform> —— 客户端安装包下载入口。
 *
 * 为什么需要它：`download.clipopai.com` 从未配置 DNS（NXDOMAIN），且旧页面标注的
 * 2.1.0 / 2.0.5 安装包在任何渠道都不存在，导致三个平台全部无法下载。
 *
 * 现在由本站接管：
 *   1. 先按 GitHub Release 的**最新**资产解析出真实下载地址（内存缓存 10 分钟）；
 *   2. 解析失败则退回 `download-manifest.ts` 里钉死的最近一次发布地址；
 *   3. 通过本站流式回源（支持 Range 断点续传），重定向不可用时仍能下载；
 *   4. 回源失败时返回 302 到 GitHub 原始地址，作为最后兜底。
 *
 * 必须保持 GET / HEAD 都可用：部分下载管理器（迅雷、IDM）会先发 HEAD。
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  DOWNLOAD_ARTIFACTS,
  GITHUB_REPO,
  PLATFORM_ASSET_PATTERN,
  isDownloadPlatform,
  type DownloadPlatform,
} from '@/lib/download-manifest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ResolvedAsset {
  url: string;
  fileName: string;
  version: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const resolveCache = new Map<DownloadPlatform, { value: ResolvedAsset; at: number }>();

function ghHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'clipop-download-resolver',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

/** 解析「该平台最新可下载资产」；任何异常都回落钉死的 manifest 值。 */
async function resolveAsset(platform: DownloadPlatform): Promise<ResolvedAsset> {
  const cached = resolveCache.get(platform);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const fallback = DOWNLOAD_ARTIFACTS[platform];
  const fallbackResolved: ResolvedAsset = {
    url: fallback.fallbackUrl,
    fileName: fallback.fileName,
    version: fallback.version.replace(/^v/, ''),
  };

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`, {
      headers: ghHeaders(),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) return fallbackResolved;

    const releases = (await res.json()) as Array<{
      tag_name?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    }>;

    const pattern = PLATFORM_ASSET_PATTERN[platform];
    for (const release of releases) {
      for (const asset of release.assets ?? []) {
        const name = asset.name ?? '';
        const url = asset.browser_download_url ?? '';
        if (name && url && pattern.test(name)) {
          // 三个平台发布在不同 tag（0.9.30 / win-0.9.30 / android-0.9.30），统一成纯版本号
          const version = (release.tag_name ?? fallback.version)
            .replace(/^v?android-?/i, '')
            .replace(/^v?win-?/i, '')
            .replace(/^v/, '');
          const resolved: ResolvedAsset = { url, fileName: name, version };
          resolveCache.set(platform, { value: resolved, at: Date.now() });
          return resolved;
        }
      }
    }
  } catch {
    // 网络失败 / 频控：用钉死值
  }
  return fallbackResolved;
}

function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function handle(request: NextRequest, platform: DownloadPlatform, headOnly: boolean) {
  const asset = await resolveAsset(platform);

  const range = request.headers.get('range');
  const upstreamHeaders: Record<string, string> = { 'User-Agent': 'clipop-download-proxy' };
  if (range) upstreamHeaders.Range = range;

  let upstream: Response | null = null;
  try {
    upstream = await fetch(asset.url, {
      headers: upstreamHeaders,
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(headOnly ? 15_000 : 45_000),
    });
  } catch {
    upstream = null;
  }

  // 回源失败：交给浏览器直连 GitHub
  if (!upstream || (!upstream.ok && upstream.status !== 206)) {
    return NextResponse.redirect(asset.url, 302);
  }

  const headers = new Headers();
  const passthrough = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
  ];
  for (const key of passthrough) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set('content-disposition', contentDisposition(asset.fileName));
  headers.set('cache-control', 'public, max-age=300');
  headers.set('x-download-version', asset.version);

  if (headOnly) {
    return new NextResponse(null, { status: upstream.status, headers });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ platform: string }> },
) {
  const { platform } = await ctx.params;
  if (!isDownloadPlatform(platform)) {
    return NextResponse.json({ error: 'Unknown platform.' }, { status: 404 });
  }
  return handle(request, platform, false);
}

export async function HEAD(
  request: NextRequest,
  ctx: { params: Promise<{ platform: string }> },
) {
  const { platform } = await ctx.params;
  if (!isDownloadPlatform(platform)) {
    return new NextResponse(null, { status: 404 });
  }
  return handle(request, platform, true);
}
