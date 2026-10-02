/**
 * 定向探针：直接打 /api/cut-clip 的「竖屏 + AI 字幕」路径，量化其可靠性。
 * 不触发生成（不需要 5 分钟），只做 resolve + cut-clip，重复 N 次统计成功率与失败原因。
 *
 * 用法：BASE=https://www.clipopai.com node .pwtest/shorts-cutclip-probe.mjs
 */
import pw from '/Users/aiven/Desktop/AI/node_modules/playwright/index.js';

const { chromium } = pw;
const BASE = process.env.BASE || 'https://www.clipopai.com';
const PROXY = { server: 'http://127.0.0.1:7897', bypass: 'localhost,127.0.0.1' };
const VIDEO_URL = process.env.TEST_VIDEO_URL || 'https://www.youtube.com/watch?v=arj7oStGLkU';
const ROUNDS = Number(process.env.ROUNDS || 3);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, proxy: PROXY });
const page = await ctx.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (/cut-clip|downloadAndCutOnServer|downloadClipViaBrowser|too small|ftyp|abort/i.test(t)) {
    console.log(`  [console.${m.type()}] ${t.slice(0, 220)}`);
  }
});

// 登录
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('input[type=email]', { timeout: 60000 });
await page.fill('input[type=email]', 'admin@126.com');
await page.fill('input[type=password]', 'admin@666666');
await page.click('button[type=submit]');
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  if (!page.url().includes('/login')) break;
}
console.log('已登录:', page.url());

await page.goto(`${BASE}/shorts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(4000);

const videoId = (VIDEO_URL.match(/[?&]v=([\w-]{11})/) || [])[1];
console.log('videoId =', videoId);

// 在页面上下文里 resolve 流，再直接打 cut-clip（竖屏 + 字幕），重复 ROUNDS 次
const results = await page.evaluate(async ({ videoId, rounds }) => {
  const cf = String(window.__CF_WORKER_URL__ || '').trim();
  if (!cf) return { error: 'CF_WORKER_URL 未注入' };
  const rurl = new URL(cf);
  rurl.pathname = `${rurl.pathname.replace(/\/$/, '')}/resolve`;
  rurl.searchParams.set('videoId', videoId);
  rurl.searchParams.set('maxHeight', '720');
  rurl.searchParams.set('muxed', '1');

  const rres = await fetch(rurl.toString());
  const metaText = await rres.text();
  let meta;
  try { meta = JSON.parse(metaText); } catch { return { error: `resolve 非 JSON: ${metaText.slice(0, 200)}` }; }
  if (!meta?.streamUrl) return { error: `resolve 无 streamUrl: ${metaText.slice(0, 300)}` };

  const out = [];
  for (let i = 0; i < rounds; i++) {
    const t = Date.now();
    try {
      const res = await fetch('/api/cut-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamUrl: meta.streamUrl,
          ...(meta.audioUrl ? { audioUrl: meta.audioUrl } : {}),
          userAgent: meta.userAgent,
          visitorData: meta.visitorData,
          xClientName: meta.xClientName,
          clientVersion: meta.clientVersion,
          clientName: meta.client,
          videoId,
          startTime: 51,
          duration: 50,
          endTime: 101,
          plan: 'pro',
          orientation: 'vertical',
          subtitles: true,
        }),
      });
      const buf = await res.arrayBuffer();
      const u8 = new Uint8Array(buf);
      const ftyp = buf.byteLength >= 8
        ? String.fromCharCode(u8[4], u8[5], u8[6], u8[7])
        : '(too short)';
      out.push({
        round: i + 1,
        ms: Date.now() - t,
        status: res.status,
        bytes: buf.byteLength,
        ftyp,
        errText: res.ok ? '' : new TextDecoder().decode(u8.slice(0, 260)),
      });
    } catch (e) {
      out.push({ round: i + 1, ms: Date.now() - t, status: 'THROW', error: String(e).slice(0, 220) });
    }
  }
  return { ok: true, meta: { streamUrl: String(meta.streamUrl).slice(0, 90), hasAudioUrl: !!meta.audioUrl, client: meta.client }, out };
}, { videoId, rounds: ROUNDS });

console.log('\n探针结果：', JSON.stringify(results, null, 2));

if (results?.out) {
  const good = results.out.filter((r) => r.status === 200 && r.ftyp === 'ftyp' && r.bytes > 100000);
  console.log(`\n竖屏 cut-clip 成功率：${good.length}/${results.out.length}`);
} 
await browser.close();