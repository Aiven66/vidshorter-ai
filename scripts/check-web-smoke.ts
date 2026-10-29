/**
 * 线上 Web 端冒烟测试（pnpm test:web-smoke）
 *
 * 默认打线上域名，可用 SMOKE_BASE_URL 指向本地/预览环境：
 *   SMOKE_BASE_URL=http://localhost:5100 pnpm test:web-smoke
 *
 * 覆盖：公开页面 200、SEO 元信息、sitemap/robots、GEO 端点（llms.txt 与 /ai/*.json）、
 * PWA manifest、首页 JSON-LD 可解析。响应时间只告警不判失败，避免网络抖动误报。
 */

import assert from 'node:assert/strict';

const BASE = (process.env.SMOKE_BASE_URL || 'https://www.clipopai.com').replace(/\/$/, '');

type Result = { name: string; ok: boolean; ms: number; detail: string };
const results: Result[] = [];
const warnings: string[] = [];

async function fetchText(path: string) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': 'ClipopSmoke/1.0 (+https://www.clipopai.com)' },
    redirect: 'follow',
  });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body, ms: Date.now() - started };
}

async function check(name: string, run: () => Promise<void>) {
  const started = Date.now();
  try {
    await run();
    const ms = Date.now() - started;
    results.push({ name, ok: true, ms, detail: 'ok' });
    if (ms > 2500) warnings.push(`${name}: ${ms}ms (slow)`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, detail: (error as Error).message });
  }
}

const PUBLIC_PAGES = [
  '/',
  '/video-clips',
  '/shorts',
  '/ai-video',
  '/tiktok-remix',
  '/video-notes',
  '/ai-tools',
  '/pricing',
  '/blog',
  '/download',
  '/faq',
  '/ai-dubbing',
];

function hasTitle(body: string) {
  return /<title[^>]*>[^<]+<\/title>/i.test(body);
}

function parseJsonLd(body: string): unknown[] {
  const blocks = [...body.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  return blocks.map((m) => JSON.parse(m[1]));
}

async function main() {
  for (const path of PUBLIC_PAGES) {
    await check(`page ${path}`, async () => {
      const { status, headers, body } = await fetchText(path);
      assert.equal(status, 200, `${path} returned ${status}`);
      assert.match(headers.get('content-type') || '', /text\/html/i, `${path} is not HTML`);
      assert.ok(body.includes('<!DOCTYPE html') || body.includes('<!doctype html'), `${path} missing doctype`);
      assert.ok(hasTitle(body), `${path} missing <title>`);
    });
  }

  await check('SEO /ai-dubbing indexable', async () => {
    const { body } = await fetchText('/ai-dubbing');
    assert.ok(body.includes('AI Dubbing'), 'missing AI Dubbing copy');
    assert.ok(
      !/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(body),
      '/ai-dubbing must not be noindex',
    );
    assert.ok(body.includes('/ai-dubbing'), 'missing canonical');
  });

  await check('SEO sitemap.xml', async () => {
    const { status, body } = await fetchText('/sitemap.xml');
    assert.equal(status, 200);
    assert.match(body, /<urlset/i);
    // sitemap 内的 loc 是绝对站点地址（本地/预览环境与 BASE 不同域），只校验路径
    assert.match(body, /\/ai-dubbing<\/loc>/i, 'sitemap must include /ai-dubbing');
    assert.match(body, /\/pricing<\/loc>/i, 'sitemap must include /pricing');
  });

  await check('SEO robots.txt', async () => {
    const { status, body } = await fetchText('/robots.txt');
    assert.equal(status, 200);
    assert.match(body, /Sitemap:\s+https?:/i);
    assert.match(body, /User-Agent:\s*GPTBot/i);
    assert.match(body, /User-Agent:\s*PerplexityBot/i);
    assert.match(body, /Disallow:\s*\/admin/i, 'AI crawlers must not crawl admin');
    assert.match(body, /Disallow:\s*\/api\//i);
  });

  await check('GEO llms.txt', async () => {
    const { status, body } = await fetchText('/llms.txt');
    assert.equal(status, 200);
    assert.ok(body.startsWith('# Clipop AI'), 'llms.txt must start with brand heading');
    assert.ok(body.includes('AI Dubbing'), 'llms.txt must mention AI Dubbing');
    assert.ok(body.includes('Starter $9.9'), 'llms.txt must state pricing');
    assert.ok(body.includes('Last updated:'), 'llms.txt must be dated');
  });

  await check('GEO /ai/summary.json', async () => {
    const { status, body } = await fetchText('/ai/summary.json');
    assert.equal(status, 200);
    const data = JSON.parse(body) as { name?: string; capabilities?: string[]; updated?: string };
    assert.equal(data.name, 'Clipop AI');
    assert.ok(Array.isArray(data.capabilities) && data.capabilities.length > 0, 'capabilities missing');
    assert.ok((data.capabilities || []).some((c) => /dubbing/i.test(c)), 'AI dubbing capability missing');
  });

  await check('GEO /ai/faq.json', async () => {
    const { status, body } = await fetchText('/ai/faq.json');
    assert.equal(status, 200);
    const data = JSON.parse(body) as unknown;
    const text = JSON.stringify(data);
    assert.ok(text.includes('AI dubbing') || text.includes('AI Dubbing'), 'AI dubbing FAQ missing');
  });

  await check('PWA manifest', async () => {
    const { status, body } = await fetchText('/manifest.webmanifest');
    assert.equal(status, 200);
    const data = JSON.parse(body) as { name?: string };
    assert.ok(data.name, 'manifest name missing');
  });

  await check('JSON-LD parses', async () => {
    const { body } = await fetchText('/');
    const blocks = parseJsonLd(body);
    assert.ok(blocks.length > 0, 'home page has no JSON-LD');
    for (const block of blocks) {
      assert.notEqual(block, null, 'JSON-LD block is null');
    }
  });

  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${String(r.ms).padStart(5)}ms  ${r.name}${r.ok ? '' : `\n        ${r.detail}`}`);
  }
  if (warnings.length) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${BASE}`);
  if (failed.length > 0) process.exit(1);
}

main();
