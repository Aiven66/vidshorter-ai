#!/usr/bin/env node
/* Programmatic QA of the Digital Human Selling (live commerce) page + canvas + export.
 * Covers: nav entry, product auto-fill (Amazon), editable script, voice catalog (gender follows host),
 * generation → preview canvas regions (LIVE badge, photo host, talking mouth, vector hand, product card,
 * price panel, CTA, subtitle) and MP4 export (video[controls]).
 * Regions are normalized against the 540x960 preview canvas used by TalkingVideoRenderer.
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:5177';
const AMAZON = 'https://www.amazon.com/medicube-Collagen-Volufiline-Under-Eyes-Forehead/dp/B0GHMZXX8Y';

(async () => {
  // 环境里缓存的 chromium 版本与全局 playwright 期望不一致时，回退系统 Chrome
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH
      ? { headless: true, executablePath: process.env.CHROMIUM_PATH }
      : { headless: true, channel: 'chrome' },
  );
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

  let pass = 0, fail = 0;
  const check = (name, cond, detail) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
    cond ? pass++ : fail++;
  };

  /* ---- 1. Page shell ---- */
  await page.goto(`${BASE}/digital-human-live`, { timeout: 60000 });
  await page.waitForLoadState('networkidle');

  const shell = await page.evaluate(() => {
    const txt = document.body.innerText;
    return {
      titleVisible: /Digital Human Selling Video/i.test(txt),
      hostPicker: txt.includes('Emma') && txt.includes('Ryan'),
      voiceLangChips: /English \(US\)/.test(txt) || /中文/.test(txt),
      timbreCards: /Jenny|Guy|Xiaoxiao/i.test(txt),
      urlInput: !!document.querySelector('input[type="url"]'),
      uploadBtn: /Upload Image/i.test(txt),
      noScriptEarly: document.querySelectorAll('textarea').length === 0,
    };
  });
  console.log('shell:', JSON.stringify(shell));
  check('page title', shell.titleVisible);
  check('host picker visible', shell.hostPicker);
  check('voice language chips', shell.voiceLangChips);
  check('voice timbre cards', shell.timbreCards);
  check('product URL input', shell.urlInput);
  check('image upload button', shell.uploadBtn);
  check('script hidden before product', shell.noScriptEarly);

  /* ---- 2. Select male host Ryan → timbre switches to male voices ---- */
  await page.locator('button', { hasText: 'Ryan' }).first().click();
  await page.waitForTimeout(400);
  const maleVoices = await page.evaluate(() => document.body.innerText.includes('GuyNeural'));
  check('timbre follows host gender (male → GuyNeural)', maleVoices);

  /* ---- 3. Amazon auto-fill → editable script auto-built ---- */
  await page.locator('input[type="url"]').fill(AMAZON);
  await page.locator('button[type="submit"]').click();

  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await page.waitForTimeout(2000);
    if ((await page.locator('textarea').count()) >= 5) break;
  }
  const scriptCount = await page.locator('textarea').count();
  check('editable script auto-built (>=5 lines)', scriptCount >= 5, `lines=${scriptCount}`);
  const autoHint = await page.evaluate(() => document.body.innerText.includes('Smart-detected'));
  check('auto-detected hint', autoHint);

  /* ---- 4. Generate → canvas appears ---- */
  await page.locator('button', { hasText: /AI Generate Video/ }).first().click();
  const t1 = Date.now();
  while (Date.now() - t1 < 200000) {
    await page.waitForTimeout(3000);
    if (await page.locator('canvas').count()) break;
  }
  if (!(await page.locator('canvas').count())) { console.log('FAIL: no canvas'); process.exit(1); }
  await page.waitForTimeout(800);

  await page.locator('button[aria-label="Play"], button:has-text("Play")').first().click();
  console.log('playback started');

  /* ---- 5. Canvas sampler over full playback ---- */
  const hasRating = await page.evaluate(() => {
    const el = document.querySelector('input[placeholder*="Rating"], input[placeholder*="评分"]');
    return !!(el && el.value.trim());
  });
  const stats = await page.evaluate(async () => {
    const cv = document.querySelector('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const W = cv.width, H = cv.height;

    const band = (x0, y0, x1, y1) => ({ x0: Math.round(x0 * W), y0: Math.round(y0 * H), x1: Math.round(x1 * W), y1: Math.round(y1 * H) });
    const R = {
      liveBadge: band(0.33, 0.020, 0.67, 0.065),   // LIVE red pill (center top)
      hostPhoto: band(0.62, 0.10, 0.95, 0.60),     // photo host body/face
      mouthZone: band(0.66, 0.36, 0.88, 0.52),     // mouth region (jaw drop / dark cavity)
      handPoint: band(0.26, 0.26, 0.54, 0.50),     // vector hand (greeting/highlight)
      prodCard: band(0.06, 0.15, 0.47, 0.57),      // greeting product card
      numBadge: band(0.02, 0.09, 0.11, 0.20),      // highlight number badge
      pricePanel: band(0.05, 0.55, 0.56, 0.66),    // price panel
      ctaBtn: band(0.05, 0.47, 0.60, 0.56),        // CTA buy button
      starsZone: band(0.05, 0.29, 0.42, 0.35),     // star rating (CTA scene)
      subZone: band(0.08, 0.80, 0.92, 0.94),       // subtitle bar
      chipDot: band(0.045, 0.105, 0.30, 0.165),    // host name chip + online green dot
    };

    const readBand = (r) => {
      const d = ctx.getImageData(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0).data;
      let dark = 0, white = 0, red = 0, green = 0, yellow = 0, skin = 0, indigo = 0, sumL = 0, n = 0, sumL2 = 0;
      for (let i = 0; i < d.length; i += 4) {
        const Rr = d[i], G = d[i + 1], B = d[i + 2];
        const L = 0.299 * Rr + 0.587 * G + 0.114 * B;
        sumL += L; sumL2 += L * L; n++;
        if (L < 70) dark++;
        if (L > 205) white++;
        if (Rr > 170 && G < 90 && B < 90) red++;                              // LIVE pill #dc2626
        if (G > 120 && Rr < 110 && B < 110 && G - Rr > 40 && G - B > 30) green++; // online dot #22c55e
        if (Rr > 190 && G > 140 && B < 110) yellow++;                        // stars #fbbf24
        if (Rr > 165 && G > 115 && B > 95 && Rr > G && G > B && Rr - B > 35 && Rr < 250) skin++; // hand skin tone
        if (B > 170 && Rr < 170 && G < 180 && B - Rr > 40) indigo++;         // CTA button indigo gradient
      }
      const meanL = sumL / n;
      return { darkFrac: dark / n, whiteFrac: white / n, redFrac: red / n, greenFrac: green / n, yellowFrac: yellow / n, skinFrac: skin / n, indigoFrac: indigo / n, meanL, grayStd: Math.sqrt(Math.max(0, sumL2 / n - meanL * meanL)) };
    };

    const samples = [];
    const N = 240; // ~72s @ 300ms — full video incl. CTA (TTS lengths vary per run)
    for (let i = 0; i < N; i++) {
      const s = {};
      for (const k in R) s[k] = readBand(R[k]);
      samples.push(s);
      await new Promise((r) => setTimeout(r, 300));
    }
    return { W, H, samples };
  });

  /* ---- 6. Analysis ---- */
  const S = stats.samples;
  const mm = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => { const m = mm(a); return Math.sqrt(mm(a.map((x) => (x - m) ** 2))); };
  const range = (a) => Math.max(...a) - Math.min(...a);
  const col = (k, f) => S.map((s) => s[k][f]);

  console.log(`canvas ${stats.W}x${stats.H}, samples=${S.length} (~${(S.length * 0.3).toFixed(0)}s)`);

  // LIVE badge: red pill present most frames
  const badgeRed = col('liveBadge', 'redFrac');
  check('LIVE badge rendered (red)', mm(badgeRed) > 0.02 && Math.max(...badgeRed) > 0.08, `mean=${mm(badgeRed).toFixed(3)} max=${Math.max(...badgeRed).toFixed(3)}`);

  // Photo host rendered: textured pixels (not flat gradient)
  const hostStd = col('hostPhoto', 'grayStd');
  check('photo host rendered (grayStd)', mm(hostStd) > 35, `mean=${mm(hostStd).toFixed(1)} (>35)`);

  // Talking mouth: dark cavity fraction oscillates during speech
  const mouthDark = col('mouthZone', 'darkFrac');
  check('host is talking (mouth darkFrac variance)', sd(mouthDark) > 0.004 && range(mouthDark) > 0.02, `sd=${sd(mouthDark).toFixed(4)} range=${range(mouthDark).toFixed(3)}`);

  // Vector hand: skin-toned pixels in hand zone during greeting/highlight/CTA scenes
  const handSkin = col('handPoint', 'skinFrac');
  check('vector hand visible (skin pixels)', mm(handSkin) > 0.008 && Math.max(...handSkin) > 0.04, `mean=${mm(handSkin).toFixed(4)} max=${Math.max(...handSkin).toFixed(3)}`);

  // Product card: white card frame + product image texture
  const prodWhite = col('prodCard', 'whiteFrac');
  const prodStd = col('prodCard', 'grayStd');
  check('product card rendered', mm(prodWhite) > 0.02 && Math.max(...prodStd) > 18, `white=${mm(prodWhite).toFixed(3)} stdMax=${Math.max(...prodStd).toFixed(1)}`);

  // Number badge (highlight scenes): bright indigo circle pulses top-left of card
  const badgeWhite = col('numBadge', 'whiteFrac');
  check('highlight number badge', Math.max(...badgeWhite) > 0.05, `whiteMax=${Math.max(...badgeWhite).toFixed(3)}`);

  // Price panel: white big price text on dark panel (price scene)
  const priceWhite = col('pricePanel', 'whiteFrac');
  check('price panel text', range(priceWhite) > 0.01 && Math.max(...priceWhite) > 0.02, `whiteMax=${Math.max(...priceWhite).toFixed(3)} range=${range(priceWhite).toFixed(3)}`);

  // CTA button: indigo gradient fill appears (primary → primaryLight)
  const ctaIndigo = col('ctaBtn', 'indigoFrac');
  check('CTA buy button', Math.max(...ctaIndigo) > 0.10, `indigoMax=${Math.max(...ctaIndigo).toFixed(3)}`);

  // Stars (CTA scene) — only asserted when a rating was extracted this run
  const stars = col('starsZone', 'yellowFrac');
  if (hasRating) {
    check('star rating (CTA)', Math.max(...stars) > 0.01, `yellowMax=${Math.max(...stars).toFixed(4)}`);
  } else {
    console.log('SKIP  star rating (CTA)  no rating extracted this run');
  }

  // Subtitle bar: white text on dark bar, nearly always
  const subWhite = col('subZone', 'whiteFrac');
  check('subtitle bar text', mm(subWhite) > 0.01, `mean=${mm(subWhite).toFixed(4)}`);

  // Host chip online green dot
  const dotGreen = col('chipDot', 'greenFrac');
  check('host chip online dot', mm(dotGreen) > 0.002 && Math.max(...dotGreen) > 0.01, `mean=${mm(dotGreen).toFixed(4)} max=${Math.max(...dotGreen).toFixed(4)}`);

  /* ---- 7. Export MP4 ---- */
  const exportBtn = page.locator('button', { hasText: /Export MP4/ }).first();
  if (await exportBtn.count()) {
    await exportBtn.click();
    const t2 = Date.now();
    while (Date.now() - t2 < 300000) {
      await page.waitForTimeout(5000);
      if (await page.locator('video[controls]').count()) break;
    }
    const hasVideo = await page.locator('video[controls]').count();
    check('MP4 export produced <video>', hasVideo > 0);
  } else {
    check('export button present', false, 'Export MP4 button not found');
  }

  console.log(`\n${fail === 0 ? 'ALL PASS' : 'HAS FAILURES'} — pass=${pass} fail=${fail}`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
