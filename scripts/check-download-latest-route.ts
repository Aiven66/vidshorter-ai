import assert from 'node:assert/strict';
import { GET } from '../src/app/api/download/latest/route';

type FetchCall = {
  url: string;
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function readRouteJson() {
  const response = await GET();
  return response.json();
}

async function main() {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push({ url });

    if (url.endsWith('/releases/latest')) {
      return jsonResponse({
        tag_name: 'v0.9.30',
        name: 'Clipop Agent v0.9.30',
        published_at: '2026-06-05T00:00:00Z',
        html_url: 'https://github.com/Aiven66/vidshorter-ai/releases/tag/v0.9.30',
        body: 'Latest desktop build',
        assets: [
          {
            name: 'Clipop Agent-0.9.30-arm64.dmg',
            browser_download_url: 'https://github.com/Aiven66/vidshorter-ai/releases/download/v0.9.30/Clipop.Agent-0.9.30-arm64.dmg',
            size: 208000000,
          },
        ],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const data = await readRouteJson();
    assert.equal(data.available, true);
    assert.equal(data.version, '0.9.30');
    assert.match(data.dmgUrl, /v0\.9\.30/);
    assert.match(data.dmgUrl, /\.dmg$/);
    assert.equal(data.dmgSize, 208000000);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /releases\/latest$/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('Download latest release route checks passed.');
}

main();
