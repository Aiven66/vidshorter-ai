import { NextResponse } from 'next/server';

// Force dynamic — prevents Next.js from trying to statically generate this API route at build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GITHUB_REPO = 'Aiven66/vidshorter-ai';
// Mac DMG 发布在 0.9.30 标签，Windows NSIS 发布在 win-0.9.30 标签，Android APK 发布在 android-0.9.30 标签（三个独立 release）
const MAC_RELEASE_TAG = '0.9.30';
const WINDOWS_RELEASE_TAG = 'win-0.9.30';
const ANDROID_RELEASE_TAG = 'android-0.9.30';
const FALLBACK_VERSION = '0.9.30';
const FALLBACK_DOWNLOAD_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
const CACHE_DURATION = 60;

let cachedData: { timestamp: number; data: unknown } | null = null;

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  download_count?: number;
}

interface GithubRelease {
  tag_name?: string;
  name?: string;
  published_at?: string;
  html_url?: string;
  body?: string;
  assets?: GithubReleaseAsset[];
}

interface PlatformAssetResponse {
  name: string;
  url: string;
  size: number;
  downloadCount: number;
}

// 选择 macOS DMG 资源（优先 arm64）
function selectMacAsset(assets: GithubReleaseAsset[] = []): GithubReleaseAsset | null {
  const dmgs = assets.filter((a) => a.name.endsWith('.dmg'));
  if (dmgs.length === 0) return null;
  const arm64 = dmgs.find((a) => /arm64/i.test(a.name));
  if (arm64) return arm64;
  const x64 = dmgs.find((a) => /x64|intel/i.test(a.name));
  if (x64) return x64;
  return dmgs[0];
}

// 选择 Windows 安装包资源（优先 NSIS Setup，其次 portable）
function selectWindowsAsset(assets: GithubReleaseAsset[] = []): GithubReleaseAsset | null {
  const setupExe = assets.find((a) =>
    a.name.endsWith('.exe') && /setup/i.test(a.name)
  );
  if (setupExe) return setupExe;
  const portableExe = assets.find((a) =>
    a.name.endsWith('.exe') && !/setup/i.test(a.name)
  );
  if (portableExe) return portableExe;
  return null;
}

// 选择 Android APK 资源（优先 universal/ arm64-v8a，否则取第一个 .apk）
function selectAndroidAsset(assets: GithubReleaseAsset[] = []): GithubReleaseAsset | null {
  const apks = assets.filter((a) => a.name.toLowerCase().endsWith('.apk'));
  if (apks.length === 0) return null;
  // Prefer "universal" builds (single APK supporting all ABIs)
  const universal = apks.find((a) => /universal/i.test(a.name));
  if (universal) return universal;
  // Then prefer arm64-v8a (most modern devices)
  const arm64 = apks.find((a) => /arm64/i.test(a.name));
  if (arm64) return arm64;
  return apks[0];
}

function toPlatformAsset(asset: GithubReleaseAsset | null): PlatformAssetResponse | null {
  if (!asset) return null;
  return {
    name: asset.name,
    url: asset.browser_download_url,
    size: asset.size,
    downloadCount: asset.download_count || 0,
  };
}

async function fetchReleaseByTag(tag: string): Promise<GithubRelease | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${tag}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'VidShorter-AI',
        },
        next: { revalidate: CACHE_DURATION },
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as GithubRelease;
  } catch {
    return null;
  }
}

function fallbackResponse() {
  return {
    version: FALLBACK_VERSION,
    mac: {
      name: '',
      url: FALLBACK_DOWNLOAD_URL,
      size: 0,
      downloadCount: 0,
    },
    windows: null,
    android: null,
    publishedAt: '',
    releaseUrl: `https://github.com/${GITHUB_REPO}/releases/tag/${MAC_RELEASE_TAG}`,
    releaseNotes: '',
  };
}

export async function GET() {
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cachedData.data);
  }

  try {
    // 并行查询 Mac / Windows / Android 三个 release（互相独立，一个失败不影响另一个）
    const [macRelease, windowsRelease, androidRelease] = await Promise.all([
      fetchReleaseByTag(MAC_RELEASE_TAG),
      fetchReleaseByTag(WINDOWS_RELEASE_TAG),
      fetchReleaseByTag(ANDROID_RELEASE_TAG),
    ]);

    const macAsset = macRelease ? selectMacAsset(macRelease.assets) : null;
    const windowsAsset = windowsRelease ? selectWindowsAsset(windowsRelease.assets) : null;
    const androidAsset = androidRelease ? selectAndroidAsset(androidRelease.assets) : null;

    // 选择最新的发布时间作为主 release 元信息
    const primaryRelease = [macRelease, windowsRelease, androidRelease]
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = a?.published_at ? new Date(a.published_at).getTime() : 0;
        const bTime = b?.published_at ? new Date(b.published_at).getTime() : 0;
        return bTime - aTime;
      })[0];
    const fallbackRelease = primaryRelease || macRelease || windowsRelease || androidRelease;

    if (!macAsset && !windowsAsset && !androidAsset) {
      const data = fallbackResponse();
      cachedData = { timestamp: Date.now(), data };
      return NextResponse.json(data);
    }

    // Strip platform prefix (win-, android-) and leading v from the version string
    const version = (fallbackRelease?.tag_name || MAC_RELEASE_TAG)
      .replace(/^v?android-?/i, '')
      .replace(/^v?win-?/i, '')
      .replace(/^v/, '');

    // releaseUrl 优先指向 Mac release（保持向后兼容），releaseNotes 合并三个
    const releaseUrl = macRelease?.html_url || windowsRelease?.html_url || androidRelease?.html_url || `https://github.com/${GITHUB_REPO}/releases/tag/${MAC_RELEASE_TAG}`;
    const releaseNotes = [macRelease?.body || '', windowsRelease?.body || '', androidRelease?.body || '']
      .filter(Boolean)
      .join('\n\n---\n\n');
    const publishedAt = primaryRelease?.published_at || '';

    const data = {
      version,
      mac: toPlatformAsset(macAsset),
      windows: toPlatformAsset(windowsAsset),
      android: toPlatformAsset(androidAsset),
      publishedAt,
      releaseUrl,
      releaseNotes,
    };

    cachedData = { timestamp: Date.now(), data };
    return NextResponse.json(data);
  } catch {
    const data = fallbackResponse();
    cachedData = { timestamp: Date.now(), data };
    return NextResponse.json(data);
  }
}
