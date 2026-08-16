#!/usr/bin/env node
/* Programmatic visual QA of the talking-avatar canvas during playback + export verification. */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:5177';
const AMAZON = 'https://www.amazon.com/medicube-Collagen-Volufiline-Under-Eyes-Forehead/dp/B0GHMZXX8Y';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

  await page.goto(`${BASE}/digital-human`, { timeout: 60000 });
  await page.waitForLoadState('networkidle');

  // which avatar is selected by default?
  const selAvatar = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const av = btns.find((b) => b.className.includes('ring-primary'));
    return av ? av.innerText.replace(/\n/g, ' ') : '(none)';
  });
  console.log('selected avatar:', selAvatar);

  await page.locator('input[type="url"]').fill(AMAZON);
  await page.locator('button[type="submit"]').click();

  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    await page.waitForTimeout(3000);
    if (await page.locator('canvas').count()) break;
  }
  if (!(await page.locator('canvas').count())) { console.log('FAIL: no canvas'); process.exit(1); }
  // wait until generating done (Generate button reappears)
  await page.waitForSelector('button:has-text("Generate Talking Video"), button:has-text("Regenerate voice"), button:has-text("Export MP4")', { timeout: 120000 });
  await page.waitForTimeout(500);

  // click Play
  await page.locator('button', { hasText: 'Play' }).first().click();
  console.log('playback started');

  // In-page sampler: 12s @ ~10Hz over key regions (540x960 canvas, avatar us-f rig)
  const stats = await page.evaluate(async () => {
    const cv = document.querySelector('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const W = cv.width, H = cv.height;

    const band = (x0, y0, x1, y1) => ({ x0: Math.round(x0 * W), y0: Math.round(y0 * H), x1: Math.round(x1 * W), y1: Math.round(y1 * H) });
    // normalized regions (avatar us-f rig layout, computed offline)
    const R = {
      mouth: band(200 / 540, 372 / 960, 345 / 540, 472 / 960),
      eyeL: band(183 / 540, 244 / 960, 227 / 540, 268 / 960),
      eyeR: band(317 / 540, 244 / 960, 361 / 540, 268 / 960),
      cheek: band(190 / 540, 300 / 960, 230 / 540, 330 / 960),
      forehead: band(230 / 540, 185 / 960, 310 / 540, 225 / 960),
      live: band(165 / 540, 20 / 960, 375 / 540, 65 / 960),
      subtitle: band(60 / 540, 760 / 960, 480 / 540, 890 / 960),
      product: band(40 / 540, 672 / 960, 500 / 540, 756 / 960),
      midtext: band(80 / 540, 545 / 960, 460 / 540, 690 / 960),
    };

    const readBand = (r) => {
      const d = ctx.getImageData(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0).data;
      let dark = 0, white = 0, red = 0, sumL = 0, n = 0;
      const grays = [];
      for (let i = 0; i < d.length; i += 4) {
        const Rr = d[i], G = d[i + 1], B = d[i + 2];
        const L = 0.299 * Rr + 0.587 * G + 0.114 * B;
        sumL += L; n++;
        if (L < 70) dark++;
        if (L > 205) white++;
        if (Rr > 165 && G < 95 && B < 95) red++;
        grays.push(L);
      }
      return { darkFrac: dark / n, whiteFrac: white / n, redFrac: red / n, meanL: sumL / n, grays };
    };

    // skin tone reference from cheek (first sample)
    const cheek0 = readBand(R.cheek);
    const samples = [];
    const N = 110; // ~11s
    for (let i = 0; i < N; i++) {
      const s = {};
      s.mouth = readBand(R.mouth);
      s.eyeL = readBand(R.eyeL);
      s.eyeR = readBand(R.eyeR);
      s.forehead = readBand(R.forehead);
      s.live = readBand(R.live);
      s.subtitle = readBand(R.subtitle);
      s.product = readBand(R.product);
      s.midtext = readBand(R.midtext);
      // drop grays to keep payload small
      for (const k in s) { delete s[k].grays; }
      // keep forehead gray ROW (center row) for x-shift correlation
      const fg = ctx.getImageData(R.forehead.x0, Math.round((R.forehead.y0 + R.forehead.y1) / 2), R.forehead.x1 - R.forehead.x0, 1).data;
      s.foreheadRow = [];
      for (let j = 0; j < fg.length; j += 4) s.foreheadRow.push(Math.round(0.299 * fg[j] + 0.587 * fg[j + 1] + 0.114 * fg[j + 2]));
      samples.push(s);
      await new Promise((r) => setTimeout(r, 100));
    }
    return { W, H, cheekMeanL: cheek0.meanL, samples };
  });

  // ---- Analysis ----
  const S = stats.samples;
  const mouth = S.map((s) => s.mouth.darkFrac);
  const mouthMean = S.map((s) => s.mouth.meanL);
  const mm = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => { const m = mm(a); return Math.sqrt(mm(a.map((x) => (x - m) ** 2))); };
  const range = (a) => Math.max(...a) - Math.min(...a);

  // mouth variation over time
  console.log('\n=== MOUTH (dark frac in mouth band) ===');
  console.log('mean=%.3f sd=%.4f range=%.3f min=%.3f max=%.3f', mm(mouth), sd(mouth), range(mouth), Math.min(...mouth), Math.max(...mouth));
  console.log('timeline:', mouth.map((x) => x.toFixed(2)).join(' '));

  // zero-crossing count of mouth signal around mean → opening/closing cycles
  const mAvg = mm(mouth);
  let crossings = 0;
  for (let i = 1; i < mouth.length; i++) if ((mouth[i - 1] - mAvg) * (mouth[i] - mAvg) < 0) crossings++;
  console.log('mouth signal zero-crossings (open/close cycles):', crossings);

  // blink detection: eye band meanL spike toward skin tone (lighter than eye dark)
  const eyeL = S.map((s) => s.eyeL.meanL);
  const eyeR = S.map((s) => s.eyeR.meanL);
  console.log('\n=== EYES ===');
  console.log('eyeL mean=%.1f sd=%.2f range=%.1f', mm(eyeL), sd(eyeL), range(eyeL));
  console.log('eyeR mean=%.1f sd=%.2f range=%.1f', mm(eyeR), sd(eyeR), range(eyeR));
  const blinkL = eyeL.filter((v, i) => v > mm(eyeL) + 3 * sd(eyeL)).length;
  const blinkR = eyeR.filter((v) => v > mm(eyeR) + 3 * sd(eyeR)).length;
  console.log('blink-candidate frames: L=%d R=%d', blinkL, blinkR);

  // head movement: cross-correlate forehead rows
  const shifts = [];
  for (let i = 1; i < S.length; i++) {
    const a = S[i - 1].foreheadRow, b = S[i].foreheadRow;
    let best = 0, bestDx = 0;
    for (let dx = -6; dx <= 6; dx++) {
      let err = 0, n = 0;
      for (let j = Math.max(0, -dx); j < Math.min(a.length, b.length - dx); j++) { err += Math.abs(a[j] - b[j + dx]); n++; }
      if (n > 0 && (best === 0 || err / n < best)) { best = err / n; bestDx = dx; }
    }
    shifts.push(bestDx);
  }
  console.log('\n=== HEAD (forehead x-shift px per frame) ===');
  console.log('shifts:', shifts.join(','));
  const cumShift = shifts.reduce((a, b) => a + b, 0);
  console.log('cum shift=%d px, sd=%.2f', cumShift, sd(shifts));

  // template elements
  const liveRed = S.map((s) => s.live.redFrac);
  const subWhite = S.map((s) => s.subtitle.whiteFrac);
  const prodVar = S.map((s) => 1 - s.product.darkFrac);
  const midWhite = S.map((s) => s.midtext.whiteFrac);
  console.log('\n=== TEMPLATE ===');
  console.log('LIVE badge redFrac: mean=%.3f max=%.3f (>0.25 = OK)', mm(liveRed), Math.max(...liveRed));
  console.log('subtitle whiteFrac: mean=%.3f max=%.3f (>0.01 = text present)', mm(subWhite), Math.max(...subWhite));
  console.log('product-card nonDark: mean=%.3f (>0.15 = card visible)', mm(prodVar));
  console.log('mid-area whiteFrac (label/highlight/price/cta): mean=%.3f max=%.3f', mm(midWhite), Math.max(...midWhite));

  fs.writeFileSync('/tmp/dh-stats.json', JSON.stringify({ stats: { W: stats.W, H: stats.H }, summary: { mouth: { mean: mm(mouth), sd: sd(mouth), range: range(mouth), crossings } } }, null, 2));

  // ---- Export ----
  console.log('\n=== EXPORT ===');
  await page.locator('button', { hasText: 'Export MP4' }).first().click();
  try {
    await page.waitForSelector('video', { timeout: 240000 });
    const meta = await page.evaluate(async () => {
      const v = document.querySelector('video');
      const info = { duration: v.duration, w: v.videoWidth, h: v.videoHeight, src: v.src.slice(0, 60) };
      try {
        const buf = await (await fetch(v.src)).arrayBuffer();
        info.bytes = buf.byteLength;
        // save via title
        window.__exportBuf = buf;
      } catch (e) { info.err = String(e); }
      return info;
    });
    console.log('exported video meta:', JSON.stringify(meta));
    // pull the blob out to disk
    const b64 = await page.evaluate(() => {
      const u8 = new Uint8Array(window.__exportBuf);
      let s = '';
      const CH = 0x8000;
      for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      return btoa(s);
    });
    fs.writeFileSync('/tmp/dh-export.mp4', Buffer.from(b64, 'base64'));
    console.log('saved /tmp/dh-export.mp4 bytes=', b64.length * 0.75);
  } catch {
    console.log('export did not finish in 240s');
    await page.screenshot({ path: '/tmp/dh-export-fail.png' });
  }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
