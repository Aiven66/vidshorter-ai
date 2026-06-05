import { NextResponse } from 'next/server';

const GITHUB_REPO = 'Aiven66/vidshorter-ai';
const FALLBACK_DESKTOP_RELEASE_TAG = 'v0.9.30';
const FALLBACK_DOWNLOAD_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
const CACHE_DURATION = 60;

let cachedData: { timestamp: number; data: unknown } | null = null;

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GithubRelease {
  tag_name?: string;
  name?: string;
  published_at?: string;
  html_url?: string;
  body?: string;
  assets?: GithubReleaseAsset[];
}

function selectDmgAsset(assets: GithubReleaseAsset[] = []) {
  return assets.find((a) => a.name.endsWith('.dmg') && a.name.includes('arm64'))
    || assets.find((a) => a.name.endsWith('.dmg') && a.name.includes('x64'))
    || assets.find((a) => a.name.endsWith('.dmg'));
}

function releaseToResponse(release: GithubRelease) {
  const dmgAsset = selectDmgAsset(release.assets);
  const version = release.tag_name?.replace(/^v/, '') || FALLBACK_DESKTOP_RELEASE_TAG.replace(/^v/, '');

  return {
    available: !!dmgAsset,
    version,
    name: release.name || release.tag_name || '',
    publishedAt: release.published_at || '',
    dmgUrl: dmgAsset?.browser_download_url || '',
    dmgSize: dmgAsset?.size || 0,
    releaseUrl: release.html_url || `https://github.com/${GITHUB_REPO}/releases/tag/${release.tag_name || FALLBACK_DESKTOP_RELEASE_TAG}`,
    releaseNotes: release.body || '',
  };
}

function fallbackResponse() {
  return {
    available: true,
    version: FALLBACK_DESKTOP_RELEASE_TAG.replace(/^v/, ''),
    name: `Clipop Agent ${FALLBACK_DESKTOP_RELEASE_TAG}`,
    publishedAt: '',
    dmgUrl: FALLBACK_DOWNLOAD_URL,
    dmgSize: 0,
    releaseUrl: `https://github.com/${GITHUB_REPO}/releases/tag/${FALLBACK_DESKTOP_RELEASE_TAG}`,
    releaseNotes: '',
  };
}

export async function GET() {
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cachedData.data);
  }

  try {
    const latestReleaseRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'VidShorter-AI',
        },
        next: { revalidate: CACHE_DURATION },
      }
    );

    if (latestReleaseRes.ok) {
      const release = await latestReleaseRes.json() as GithubRelease;
      const data = releaseToResponse(release);

      if (data.available) {
        cachedData = { timestamp: Date.now(), data };
        return NextResponse.json(data);
      }
    }

    const taggedReleaseRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${FALLBACK_DESKTOP_RELEASE_TAG}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'VidShorter-AI',
        },
        next: { revalidate: CACHE_DURATION },
      }
    );

    const taggedData = taggedReleaseRes.ok
      ? releaseToResponse(await taggedReleaseRes.json() as GithubRelease)
      : null;
    const data = taggedData?.available ? taggedData : fallbackResponse();

    cachedData = { timestamp: Date.now(), data };

    return NextResponse.json(data);
  } catch {
    const data = fallbackResponse();
    cachedData = { timestamp: Date.now(), data };
    return NextResponse.json(data);
  }
}
