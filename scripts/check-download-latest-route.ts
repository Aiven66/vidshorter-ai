import assert from 'node:assert/strict';
import { GET } from '../src/app/api/download/latest/route';

type FetchCall = { url: string };

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json' },
  });
}

const RELEASE = (
  tag: string,
  assetName: string,
  url: string,
  extra: Record<string, unknown> = {},
) => ({
  tag_name: tag,
  name: `Clipop Agent ${tag}`,
  published_at: '2026-06-05T00:00:00Z',
  html_url: `https://github.com/Aiven66/vidshorter-ai/releases/tag/${tag}`,
  body: `Notes for ${tag}`,
  assets: [{ name: assetName, browser_download_url: url, size: 1000, ...extra }],
});

async function main() {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push({ url });

    if (url.endsWith('/releases/tags/0.9.30')) {
      return jsonResponse(
        RELEASE('0.9.30', 'Clipop Agent-0.9.30-arm64.dmg', 'https://github.com/Aiven66/vidshorter-ai/releases/download/0.9.30/Clipop.Agent-0.9.30-arm64.dmg', { size: 208000000 }),
      );
    }
    if (url.endsWith('/releases/tags/win-0.9.30')) {
      return jsonResponse(
        RELEASE('win-0.9.30', 'Clipop Agent Setup 0.9.30.exe', 'https://github.com/Aiven66/vidshorter-ai/releases/download/win-0.9.30/Clipop.Agent.Setup.0.9.30.exe', { size: 98200000 }),
      );
    }
    if (url.endsWith('/releases/tags/android-0.9.30')) {
      return jsonResponse(
        RELEASE('android-0.9.30', 'clipop-agent-0.9.30-android.apk', 'https://github.com/Aiven66/vidshorter-ai/releases/download/android-0.9.30/clipop-agent-0.9.30-android.apk', { size: 4700000 }),
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const data = (await (await GET()).json()) as {
      version: string;
      mac: { url: string; size: number } | null;
      windows: { url: string; size: number } | null;
      android: { url: string; size: number } | null;
      publishedAt: string;
      releaseUrl: string;
      releaseNotes: string;
    };

    assert.equal(data.version, '0.9.30');
    assert.match(data.mac?.url ?? '', /\.dmg$/);
    assert.equal(data.mac?.size, 208000000);
    assert.match(data.windows?.url ?? '', /Setup.*\.exe$/i);
    assert.match(data.android?.url ?? '', /\.apk$/i);
    assert.equal(data.publishedAt, '2026-06-05T00:00:00Z');
    assert.match(data.releaseUrl, /releases\/tag\/0\.9\.30$/);
    assert.match(data.releaseNotes, /Notes for android-0.9.30/);

    assert.equal(calls.length, 3, 'route must query mac/windows/android releases in parallel');
    assert.match(calls[0].url, /releases\/tags\/0\.9\.30$/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('Download latest release route checks passed.');
}

main();
