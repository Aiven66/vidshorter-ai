#!/usr/bin/env node
/* Capture CANVAS-ONLY frames during playback for visual QA. */
const { chromium } = require('playwright');

const BASE = 'http://localhost:5177';
const AMAZON = 'https://www.amazon.com/medicube-Collagen-Volufiline-Under-Eyes-Forehead/dp/B0GHMZXX8Y';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  await page.goto(`${BASE}/digital-human`, { timeout: 60000 });
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="url"]').fill(AMAZON);
  await page.locator('button[type="submit"]').click();
  console.log('extracting...');

  // wait canvas
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    await page.waitForTimeout(3000);
    if (await page.locator('canvas').count()) break;
  }
  if (!(await page.locator('canvas').count())) { console.log('no canvas'); process.exit(1); }
  console.log('canvas ready,', ((Date.now() - t0) / 1000).toFixed(0) + 's');

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  console.log('canvas box:', JSON.stringify(box));

  // still frame (before play)
  await page.screenshot({ path: '/tmp/cv-00-idle.png', clip: box });

  // click Play
  await page.locator('button', { hasText: 'Play' }).first().click();
  console.log('playing...');

  // sample canvas region every 400ms for ~7s
  for (let i = 0; i < 18; i++) {
    await page.waitForTimeout(400);
    const b2 = await canvas.boundingBox(); // in case of layout shift
    await page.screenshot({ path: `/tmp/cv-f${String(i).padStart(2, '0')}.png`, clip: b2 });
  }
  console.log('18 canvas frames captured');

  // dump canvas pixel diff between consecutive frames (mouth region) via evaluate
  const diffs = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    if (!cv) return null;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const prev = ctx.getImageData(0, 0, W, H).data;
    return { W, H, note: 'snapshot single frame' };
  });
  console.log('canvas size:', JSON.stringify(diffs));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
