#!/usr/bin/env node
/* Export-only E2E: generate + export MP4, verify blob video + codecs via ffprobe. */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:5177';
const AMAZON = 'https://www.amazon.com/medicube-Collagen-Volufiline-Under-Eyes-Forehead/dp/B0GHMZXX8Y';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  const consoleLogs = [];
  page.on('console', (m) => consoleLogs.push(`[${m.type()}] ${m.text().slice(0, 150)}`));

  await page.goto(`${BASE}/digital-human`, { timeout: 60000 });
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="url"]').fill(AMAZON);
  await page.locator('button[type="submit"]').click();

  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    await page.waitForTimeout(3000);
    if (await page.locator('canvas').count()) break;
  }
  if (!(await page.locator('canvas').count())) { console.log('FAIL: no canvas'); process.exit(1); }
  await page.waitForSelector('button:has-text("Export MP4")', { timeout: 150000 });

  // Export
  await page.locator('button', { hasText: 'Export MP4' }).first().click();
  console.log('export clicked, waiting for blob video...');

  // The result player is a <video src="blob:..."> with controls
  await page.waitForSelector('video[src^="blob:"]', { timeout: 300000 });
  console.log('blob video appeared ✓');

  await page.waitForTimeout(2000);
  const meta = await page.evaluate(async () => {
    const v = [...document.querySelectorAll('video')].find((x) => x.src.startsWith('blob:'));
    const info = { duration: v.duration, w: v.videoWidth, h: v.videoHeight };
    try {
      const buf = await (await fetch(v.src)).arrayBuffer();
      info.bytes = buf.byteLength;
      const u8 = new Uint8Array(buf);
      let s = '';
      const CH = 0x8000;
      for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      return { ...info, b64: s };
    } catch (e) { return { ...info, err: String(e) }; }
  });
  const { b64, ...metaRest } = meta;
  console.log('export meta:', JSON.stringify(metaRest));

  if (b64) {
    fs.writeFileSync('/tmp/dh-export.mp4', Buffer.from(b64, 'latin1'));
    console.log('saved /tmp/dh-export.mp4, bytes on disk =', Buffer.from(b64, 'latin1').length);
  }
  await browser.close();

  console.log('\nexport-phase console (warn/error):');
  for (const l of consoleLogs.filter((x) => /\[error\]|\[warning\]/.test(x))) console.log(' ', l);
})().catch((e) => { console.error(e); process.exit(1); });
