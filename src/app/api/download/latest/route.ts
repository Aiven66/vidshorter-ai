import { NextResponse } from 'next/server';

const GITHUB_REPO = 'Aiven66/vidshorter-ai';
const DESKTOP_RELEASE_TAG = 'v0.9.29';
const CACHE_DURATION = 60;

let cachedData: { timestamp: number; data: unknown } | null = null;

export async function GET() {
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cachedData.data);
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${DESKTOP_RELEASE_TAG}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'VidShorter-AI',
        },
        next: { revalidate: CACHE_DURATION },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch release info', available: false },
        { status: res.status }
      );
    }

    const release = await res.json();

    const assets = (release.assets as Array<{ name: string; browser_download_url: string; size: number }>) || [];

    const dmgAsset = assets.find((a) => a.name.endsWith('.dmg') && a.name.includes('arm64'))
      || assets.find((a) => a.name.endsWith('.dmg') && a.name.includes('x64'))
      || assets.find((a) => a.name.endsWith('.dmg'));

    const data = {
      available: !!dmgAsset,
      version: release.tag_name?.replace(/^v/, '') || DESKTOP_RELEASE_TAG.replace(/^v/, ''),
      name: release.name || '',
      publishedAt: release.published_at || '',
      dmgUrl: dmgAsset?.browser_download_url || '',
      dmgSize: dmgAsset?.size || 0,
      releaseUrl: release.html_url || '',
      releaseNotes: release.body || '',
    };

    cachedData = { timestamp: Date.now(), data };

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch release info', available: false },
      { status: 500 }
    );
  }
}
