#!/usr/bin/env node
/* Programmatic visual QA of the product-showcase canvas (no digital human) + export verification.
 * Regions are normalized against the 540x960 canvas used by TalkingVideoRenderer.
 */
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

  // Talking Host must be hidden; showcase-only; avatar picker visible (roles drive voice + host chip)
  const modeState = await page.evaluate(() => {
    const txt = document.body.innerText;
    return {
      talkingHostHidden: !txt.includes('Talking Host'),
      avatarPickerVisible: txt.includes('Emma') && txt.includes('Ryan'),
    };
  });
  console.log('mode state:', JSON.stringify(modeState));
  if (!modeState.talkingHostHidden) { console.log('FAIL: Talking Host still visible'); process.exit(1); }
  if (!modeState.avatarPickerVisible) { console.log('FAIL: avatar picker hidden'); process.exit(1); }

  // select male host Ryan — narration voice must follow the role (en-US-GuyNeural)
  await page.locator('button', { hasText: 'Ryan' }).first().click();
  console.log('selected host: Ryan (us-m)');

  await page.locator('input[type="url"]').fill(AMAZON);
  await page.locator('button[type="submit"]').click();

  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    await page.waitForTimeout(3000);
    if (await page.locator('canvas').count()) break;
  }
  if (!(await page.locator('canvas').count())) { console.log('FAIL: no canvas'); process.exit(1); }
  await page.waitForSelector('button:has-text("Generate"), button:has-text("Export MP4")', { timeout: 120000 });
  await page.waitForTimeout(500);

  await page.locator('button', { hasText: 'Play' }).first().click();
  console.log('playback started');

  // In-page sampler: ~36s @ 5Hz over normalized regions
  const stats = await page.evaluate(async () => {
    const cv = document.querySelector('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const W = cv.width, H = cv.height;

    const band = (x0, y0, x1, y1) => ({ x0: Math.round(x0 * W), y0: Math.round(y0 * H), x1: Math.round(x1 * W), y1: Math.round(y1 * H) });
    const R = {
      prodCenter: band(0.20, 0.18, 0.80, 0.45),  // greeting fullscreen product shot
      hlCard: band(0.14, 0.10, 0.86, 0.38),      // highlight product card
      numBadge: band(0.075, 0.077, 0.245, 0.173),// numbered circle badge (tech primary indigo)
      titleZone: band(0.07, 0.56, 0.93, 0.72),   // product name / highlight title
      badgeZone: band(0.25, 0.680, 0.75, 0.730), // MUST HAVE pill (y~0.705)
      starsZone: band(0.20, 0.755, 0.80, 0.795), // star rating (y~0.775)
      priceZone: band(0.10, 0.62, 0.90, 0.71),   // big price text
      ctaBtn: band(0.15, 0.45, 0.85, 0.56),      // CTA button (primary fill)
      subZone: band(0.08, 0.86, 0.92, 0.95),     // subtitle bar
      waveZone: band(0.42, 0.78, 0.58, 0.90),    // voice waveform bars
      hostDot: band(0.895, 0.112, 0.952, 0.170), // host chip online green dot (#22c55e)
      hostFace: band(0.830, 0.072, 0.940, 0.128),// host chip circular photo
    };

    const readBand = (r) => {
      const d = ctx.getImageData(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0).data;
      let dark = 0, white = 0, yellow = 0, indigo = 0, green = 0, sumL = 0, n = 0, sumL2 = 0;
      for (let i = 0; i < d.length; i += 4) {
        const Rr = d[i], G = d[i + 1], B = d[i + 2];
        const L = 0.299 * Rr + 0.587 * G + 0.114 * B;
        sumL += L; sumL2 += L * L; n++;
        if (L < 70) dark++;
        if (L > 205) white++;
        if (Rr > 190 && G > 140 && B < 110) yellow++;          // star gold #fbbf24
        if (B > 170 && Rr < 170 && G < 170 && B - Rr > 40) indigo++; // primary/primaryLight
        if (G > 120 && Rr < 110 && B < 110 && G - Rr > 40 && G - B > 30) green++; // online dot #22c55e
      }
      const meanL = sumL / n;
      return { darkFrac: dark / n, whiteFrac: white / n, yellowFrac: yellow / n, indigoFrac: indigo / n, greenFrac: green / n, meanL, grayStd: Math.sqrt(Math.max(0, sumL2 / n - meanL * meanL)) };
    };

    const samples = [];
    const N = 220; // ~66s @ 3.3Hz — full video incl. CTA scene (starts ~57s)
    for (let i = 0; i < N; i++) {
      const s = {};
      for (const k in R) s[k] = readBand(R[k]);
      samples.push(s);
      await new Promise((r) => setTimeout(r, 300));
    }
    return { W, H, samples };
  });

  // ---- Analysis ----
  const S = stats.samples;
  const mm = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => { const m = mm(a); return Math.sqrt(mm(a.map((x) => (x - m) ** 2))); };
  const range = (a) => Math.max(...a) - Math.min(...a);
  const col = (k, f) => S.map((s) => s[k][f]);

  let pass = 0, fail = 0;
  const check = (name, cond, detail) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
    cond ? pass++ : fail++;
  };

  console.log(`canvas ${stats.W}x${stats.H}, samples=${S.length} (~${(S.length * 0.3).toFixed(0)}s)`);

  // 1. Product image actually rendered (white-bg Amazon shots have lower variance; flat gradient ~<12)
  const prodStd = col('prodCenter', 'grayStd');
  check('product image rendered (grayStd)', Math.max(...prodStd) > 20, `max=${Math.max(...prodStd).toFixed(1)} (>20)`);
  check('product image sustained', prodStd.filter((v) => v > 20).length > 20, `frames>20: ${prodStd.filter((v) => v > 20).length}/${S.length}`);

  // 2. Ken Burns motion: product center luminance drifts over greeting
  check('ken-burns motion', range(prodStd) > 2.5, `range=${range(prodStd).toFixed(2)} (>2.5)`);

  // 3. Highlight card visible mid-timeline
  const hlStd = col('hlCard', 'grayStd');
  check('highlight card image', Math.max(...hlStd) > 22, `max=${Math.max(...hlStd).toFixed(1)} (>22)`);

  // 4. Numbered badge (indigo circle) appears in highlight scenes
  const numIndigo = col('numBadge', 'indigoFrac');
  check('number badge', Math.max(...numIndigo) > 0.25, `max=${Math.max(...numIndigo).toFixed(3)} (>0.25)`);

  // 5. Title text (product name / highlight title)
  const titleWhite = col('titleZone', 'whiteFrac');
  check('title text', Math.max(...titleWhite) > 0.02, `max=${Math.max(...titleWhite).toFixed(3)} (>0.02)`);

  // 6. MUST HAVE badge (white pill)
  const badgeWhite = col('badgeZone', 'whiteFrac');
  check('must-have badge', Math.max(...badgeWhite) > 0.05, `max=${Math.max(...badgeWhite).toFixed(3)} (>0.05)`);

  // 7. Star rating (gold)
  const starYellow = col('starsZone', 'yellowFrac');
  check('star rating', Math.max(...starYellow) > 0.005, `max=${Math.max(...starYellow).toFixed(4)} (>0.005)`);

  // 8. Big price text
  const priceWhite = col('priceZone', 'whiteFrac');
  check('price text', Math.max(...priceWhite) > 0.03, `max=${Math.max(...priceWhite).toFixed(3)} (>0.03)`);

  // 9. CTA button (indigo fill)
  const ctaIndigo = col('ctaBtn', 'indigoFrac');
  check('cta button', Math.max(...ctaIndigo) > 0.15, `max=${Math.max(...ctaIndigo).toFixed(3)} (>0.15)`);

  // 10. Subtitle bar text
  const subWhite = col('subZone', 'whiteFrac');
  check('subtitle text', mm(subWhite) > 0.005, `mean=${mm(subWhite).toFixed(4)} (>0.005)`);

  // 11. Voice waveform bars animate (indigo bars fluctuate)
  const waveIndigo = col('waveZone', 'indigoFrac');
  check('waveform animates', sd(waveIndigo) > 0.002 && Math.max(...waveIndigo) > 0.01, `sd=${sd(waveIndigo).toFixed(4)} max=${Math.max(...waveIndigo).toFixed(3)}`);

  // 12. Host chip present in every scene: online green dot (#22c55e) at top-right
  const dotGreen = col('hostDot', 'greenFrac');
  check('host chip online dot', mm(dotGreen) > 0.01 && Math.max(...dotGreen) > 0.03, `mean=${mm(dotGreen).toFixed(4)} max=${Math.max(...dotGreen).toFixed(3)}`);
  check('host chip sustained', dotGreen.filter((v) => v > 0.01).length > S.length * 0.8, `frames>0.01: ${dotGreen.filter((v) => v > 0.01).length}/${S.length}`);

  // 13. Host chip circular photo renders (face pixels → local variance)
  const faceStd = col('hostFace', 'grayStd');
  check('host chip avatar photo', Math.max(...faceStd) > 18, `max=${Math.max(...faceStd).toFixed(1)} (>18)`);

  fs.writeFileSync('/tmp/dh-showcase-stats.json', JSON.stringify({ W: stats.W, H: stats.H, n: S.length }, null, 2));

  // ---- Voice follows selected host (Ryan = male en-US → GuyNeural) ----
  const voiceChip = await page.evaluate(() => {
    const codes = [...document.querySelectorAll('code')];
    return codes.map((c) => c.textContent || '').join(',');
  });
  check('voice follows host (GuyNeural)', voiceChip.includes('GuyNeural'), `chip="${voiceChip}"`);

  // ---- Export ----
  console.log('\n=== EXPORT ===');
  await page.locator('button', { hasText: 'Export MP4' }).first().click();
  try {
    await page.waitForSelector('video[controls]', { timeout: 240000 });
    const meta = await page.evaluate(async () => {
      const v = document.querySelector('video[controls]');
      const info = { duration: v.duration, w: v.videoWidth, h: v.videoHeight };
      try {
        const buf = await (await fetch(v.src)).arrayBuffer();
        info.bytes = buf.byteLength;
        window.__exportBuf = buf;
      } catch (e) { info.err = String(e); }
      return info;
    });
    console.log('exported video meta:', JSON.stringify(meta));
    const b64 = await page.evaluate(() => {
      const u8 = new Uint8Array(window.__exportBuf);
      let s = '';
      const CH = 0x8000;
      for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      return btoa(s);
    });
    fs.writeFileSync('/tmp/dh-showcase-export.mp4', Buffer.from(b64, 'base64'));
    console.log('saved /tmp/dh-showcase-export.mp4 bytes=', meta.bytes);
    check('export mp4 has content', meta.bytes > 100000 && meta.duration > 10, `bytes=${meta.bytes} dur=${meta.duration}`);
  } catch {
    console.log('export did not finish in 240s');
    await page.screenshot({ path: '/tmp/dh-showcase-export-fail.png' });
    fail++;
  }

  console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
