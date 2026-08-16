#!/usr/bin/env node
/* E2E test v2: digital-human — extract, auto-generate (TTS), canvas preview, export. */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:5177';
const AMAZON = 'https://www.amazon.com/medicube-Collagen-Volufiline-Under-Eyes-Forehead/dp/B0GHMZXX8Y';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 160)}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
  const ttsTimings = [];
  page.on('request', (r) => { if (r.url().includes('/api/tts')) r._t0 = Date.now(); });
  page.on('response', async (r) => {
    if (r.url().includes('/api/tts')) ttsTimings.push(Date.now() - (r.request()._t0 || Date.now()));
  });

  await page.goto(`${BASE}/digital-human`, { timeout: 60000 });
  await page.waitForLoadState('networkidle');

  // 1. Fill URL + submit
  await page.locator('input[type="url"]').fill(AMAZON);
  await page.locator('button[type="submit"]').click();
  console.log('auto-fill clicked');

  // 2. Poll until canvas appears (auto-generate triggers after extraction)
  let canvasSeen = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    await page.waitForTimeout(4000);
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const m = body.match(/Voice clip (\d+)\/(\d+)/);
    const hasCanvas = await page.locator('canvas').count();
    if (m) process.stdout.write(`\rprogress: clip ${m[1]}/${m[2]}  tts_done=${ttsTimings.length}  ${( (Date.now()-t0)/1000 ).toFixed(0)}s   `);
    if (hasCanvas) { canvasSeen = true; break; }
    if (!m && !hasCanvas) process.stdout.write(`\rwaiting... tts_done=${ttsTimings.length} ${( (Date.now()-t0)/1000 ).toFixed(0)}s   `);
  }
  console.log(canvasSeen ? '\ncanvas appeared ✓' : '\nERROR: canvas never appeared');
  await page.screenshot({ path: '/tmp/dh-10-canvas.png' });
  console.log('tts timings (ms):', JSON.stringify(ttsTimings));

  if (canvasSeen) {
    // 3. Click Play and screenshot frames
    const btns = await page.locator('button').allInnerTexts();
    console.log('buttons:', JSON.stringify(btns.filter((x) => x && x.trim())));
    let played = false;
    for (const txt of btns) {
      const t = (txt || '').trim();
      if (/^(Play|Preview|播放)/i.test(t) || /play/i.test(t.toLowerCase())) {
        await page.locator('button', { hasText: t }).first().click();
        console.log('clicked:', t);
        played = true;
        break;
      }
    }
    if (!played) {
      // icon-only buttons: click first enabled icon button near canvas
      const iconBtns = page.locator('button:has(svg)');
      const c = await iconBtns.count();
      for (let i = 0; i < c; i++) {
        const b = iconBtns.nth(i);
        const txt = (await b.innerText()).trim();
        if (!txt && (await b.isVisible())) { await b.click(); console.log('clicked icon button #', i); played = true; break; }
      }
    }
    for (const ms of [700, 2000, 3500, 5000, 6500, 8000, 10000]) {
      await page.waitForTimeout(ms === 700 ? 700 : 1500);
      await page.screenshot({ path: `/tmp/dh-11-play-${ms}.png` });
    }
    console.log('preview frames captured');

    // 4. Export
    const dl = page.locator('button', { hasText: 'Download' }).first();
    if (await dl.count()) {
      await dl.click();
      console.log('export clicked');
      try {
        await page.waitForSelector('video', { timeout: 180000 });
        console.log('export <video> appeared ✓');
        await page.waitForTimeout(1500);
        await page.screenshot({ path: '/tmp/dh-12-exported.png' });
      } catch {
        console.log('export pending >180s');
        await page.screenshot({ path: '/tmp/dh-12-export-pending.png' });
      }
    } else console.log('no Download button');
  }

  fs.writeFileSync('/tmp/dh-console.log', logs.join('\n'));
  console.log('=== errors ===');
  for (const l of logs.filter((x) => /\[error\]|pageerror/.test(x) && !x.includes('google-analytics') && !x.includes('doubleclick'))) console.log(l.slice(0, 180));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
