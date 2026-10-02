/**
 * Real Human Engine — 真人数字人带货短视频引擎 (v3, audio-guided HD mouth retrieval)
 *
 * Pipeline (全本地推理):
 *   1. kokoro / edge-tts / say  : script -> narration.mp3 (v0.9.40+ kokoro first)
 *   2. mel_wav2lip.onnx         : PCM 16k -> mel (librosa-exact, verified <1e-3)
 *   3. yoloface_8n.onnx         : face box (首次检测后整段复用, 主播机位稳定)
 *   4. wav2lip_gan_96.onnx      : mel chunk + [masked|full] 96x96 face -> lip-synced face
 *   5. HD mouth bank            : index natural mouth poses from the source host
 *   6. audio-guided retrieval   : Wav2Lip selects a pose but contributes no pixels
 *   7. lip-only fusion          : composite original 720p texture inside a tight mask
 *   8. ffmpeg streaming pipes   : rawvideo -> x264 + narration + overlays
 *
 * v0.9.52 SOURCE-TEXTURE PIPELINE: Wav2Lip GAN is only 96x96 and can produce
 * malformed teeth or a stretched mouth on difficult phonemes. Upscaling and
 * restoring those pixels caused the persistent waxy lower-face patch. The
 * model now acts strictly as a pose descriptor. Final pixels are retrieved
 * from the host's own full-resolution mouth poses and blended through a tight
 * lip ellipse. No generated/restored pixel can enter the exported video.
 * This preserves the host's real lip texture and skin detail by construction.
 *
 * v0.9.51 MOUTH-ONLY FUSION: BiSeNet ran on the generated 96px face and often
 * returned almost no mouth pixels. Its geometric fallback then covered up to
 * 28% of the face crop, causing CodeFormer to repaint cheeks, philtrum and
 * chin. The host template is now scanned at full 720x1280 resolution and a
 * stable mouth envelope is built directly from mouth-corner landmarks. Both
 * Wav2Lip and CodeFormer are strictly clipped to that envelope, preserving
 * every original high-resolution skin pixel outside the lips.
 *
 * v0.9.46 MOUTH-BLUR ROOT FIX: wav2lip_gan_96 outputs a 96x96 face; upscaled
 * to the ~470px host crop its lips are fundamentally SOFT — no amount of
 * blending/sharpening can recreate detail that was never there (the v0.9.45
 * gradient blend + unsharp could only mask it). The framework-level fix is a
 * dedicated face-restoration pass: after compositing the lip-synced face, the
 * whole face crop runs through GFPGAN 1.4 (512x512, the same model family
 * used by Easy-Wav2Lip / facefusion for exactly this purpose). GFPGAN
 * hallucinates-back photoreal lip texture, teeth and skin pores while
 * PRESERVING the wav2lip-driven mouth pose. The restored face is composited
 * back through the same feathered lower-face mask, so eyes/hair stay 100%
 * original host pixels.
 *
 * v0.9.41 CRITICAL LIP-SYNC FIX: the wav2lip input pose was [ref|cur] — but the
 * official Wav2Lip inference feeds [masked|full] of the SAME frame (lower half
 * zeroed). With an intact mouth in the first 3 channels the network ignored
 * the mel completely (verified: mel -4..+2 changed output <1.5/255 on both
 * runtimes), so lip sync never actually ran since v2 — the visible mouth
 * motion was just the host template video. The 96 GAN model with the correct
 * pose responds strongly (mouthDark 74→97 loud vs silent). The 256 model is
 * gone: its audio-encoder weights are dead under every pose.
 * v0.9.41 HOST-MOUTH UNION FIX: the host template is itself a TALKING video
 * (mouth spread 65/255 across its loop). The blend mask was parsed from the
 * PREDICTION only, so the template's own mouth leaked around the mask edge
 * whenever it opened wider than the predicted mouth (ghost mouth = perceived
 * misalignment). computeHostMaxMask() samples the whole template once and the
 * per-frame blend mask becomes predMask ∪ hostMaxMask — the audio-driven
 * prediction now ALWAYS fully covers the template mouth.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { InferenceSession, Tensor } = require('onnxruntime-node');

// ----------------------------------------------------------------------------
// constants
// ----------------------------------------------------------------------------
const W = 720, H = 1280, FPS = 24;
// v0.9.36 held product card: soft matte "photo card" (NOT pure white — Amazon
// white-bg shots previously rendered as a glaring white slab near the face)
const HELD_CARD = 300;        // card sprite size (square, rounded corners)
const CARD_CONTENT = 244;     // product content area inside the card
const CARD_BG = [244, 241, 236];   // warm off-white card base #f4f1ec
const CARD_EDGE = [210, 204, 193]; // subtle inner border
const FRAME_BYTES = W * H * 3; // rgb24
const MEL_STEP = 16;           // wav2lip mel window
const MEL_PER_SEC = 80;        // 16kHz / hop 200
const MEL_BOOST = 1.5;         // v0.9.43: amplified from 1.0 → 1.5 — wav2lip_gan_96's
                               // wav2lip mouth response (tested 1.45x: open[] curve
                               // identical), so keep 1.0 to avoid input drift
const FACE = 96;               // wav2lip_gan_96 resolution (official Wav2Lip GAN)
                              // v0.9.41: 256 model swapped OUT — its audio-encoder
                              // weights were dead (verified: mel from -4..+2 changed
                              // output by <1.5/255 under the correct masked input
                              // pose, in BOTH onnxruntime-node and python ORT).
                              // The official 96 GAN model responds strongly
                              // (mouthDark 74→97 between loud/silent mel).
const GFDIM = 512;             // gfpgan input resolution
const CROP_EXPAND = 1.3;       // wav2lip square crop expand factor
const CODEFORMER_WEIGHT = clamp(Number.parseFloat(process.env.CLIPOP_CODEFORMER_WEIGHT || '0.45'), 0, 1);
const MOUTH_BANK_FPS = 12;
const MOUTH_DESC_W = 20;
const MOUTH_DESC_H = 12;
// FFHQ-512 5-point alignment template (facexlib convention):
// eyes / nose tip / mouth corners. GFPGAN was trained on FFHQ-aligned faces;
// feeding it an aligned warp measurably improves restoration fidelity
// (+2.5dB PSNR vs naive square-crop resize — see scripts/qa-gfpgan3.js).
const FFHQ_TMPL = [
  [0.37691676, 0.46864664],
  [0.62285697, 0.46912813],
  [0.50123859, 0.61331904],
  [0.39308822, 0.73741159],
  [0.61141959, 0.73744358],
];

// ----------------------------------------------------------------------------
// small utils
// ----------------------------------------------------------------------------
function log(...a) { console.log('[real-human]', ...a); }

function runFfmpeg(ffmpegPath, args, opts = {}) {
  const p = spawn(ffmpegPath, args, opts);
  p.on('error', (e) => log('ffmpeg error', e.message));
  return p;
}

/** decode mp3/wav -> Float32Array mono 16kHz via ffmpeg */
async function decodePcm16k(ffmpegPath, audioPath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const p = runFfmpeg(ffmpegPath, ['-i', audioPath, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']);
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', () => {});
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error('pcm decode failed'));
      const buf = Buffer.concat(chunks);
      // copy into a properly aligned Float32Array
      const out = new Float32Array(buf.length / 4);
      for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
      resolve(out);
    });
  });
}

// ----------------------------------------------------------------------------
// edge-tts (native ws implementation with Sec-MS-GEC token)
// ----------------------------------------------------------------------------
const EDGE_WSS = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH = 11644473600;
// v0.9.43: updated to match latest edge-tts (rany2/edge-tts) — Microsoft
// tightened access and now rejects the old 131.x version string with 403.
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

function secMsGec() {
  // ticks rounded down to 5-minute boundary + trusted token -> SHA256 hex upper
  let ticks = BigInt(Math.floor(Date.now() / 1000 + WIN_EPOCH)) * 10000000n;
  ticks -= ticks % 30000000000000n;
  return crypto.createHash('sha256').update(ticks.toString() + TRUSTED_TOKEN).digest('hex').toUpperCase();
}

function ttsSsml(voice, locale, text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // v0.9.40: plain <voice> wrap only — edge neural voices sound MOST natural
  // with their default prosody. Artificial pitch/rate offsets made it stiff.
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
    `<voice name='${voice}'>${esc}</voice></speak>`
  );
}

/** macOS system TTS (say) — local, offline, stable. Returns true on success. */
async function sayTts(voice, text, outWavPath, ffmpegPath) {
  const { execFile } = require('child_process');
  const wav = outWavPath.replace(/\.[^.]+$/, '_raw.wav');
  await new Promise((resolve, reject) => {
    execFile('say', ['-v', voice, '-o', wav, '--data-format=LEF32@22050', text], { timeout: 120000 }, (err, _so, se) => (err ? reject(new Error(String(se).slice(0, 200) || err.message)) : resolve()));
  });
  if (!fs.existsSync(wav) || fs.statSync(wav).size < 2000) throw new Error('say produced no audio');
  // transcode wav -> 24kHz mono mp3 (pipeline-compatible with edge-tts output)
  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, ['-y', '-i', wav, '-ar', '24000', '-ac', '1', '-b:a', '96k', outWavPath], { timeout: 60000 }, (err) => (err ? reject(err) : resolve()));
  });
  fs.unlinkSync(wav);
  return true;
}

/** pick a macOS say voice for (locale, gender). Falls back to Tingting/Samantha. */
function pickSayVoice(locale, gender) {
  const table = {
    'zh-CN': gender === 'male' ? 'Eddy (中文（中国大陆）)' : 'Tingting',
    'zh-TW': gender === 'male' ? 'Eddy (中文（台湾）)' : 'Meijia',
    'en-US': gender === 'male' ? 'Eddy (English)' : 'Samantha',
    'en-GB': gender === 'male' ? 'Daniel' : 'Kate',
    'ja-JP': gender === 'male' ? 'Otoya' : 'Kyoko',
    'ko-KR': gender === 'male' ? 'Yuna' : 'Yuna',
    'fr-FR': gender === 'male' ? 'Thomas' : 'Amelie',
    'de-DE': gender === 'male' ? 'Markus' : 'Anna',
    'es-ES': gender === 'male' ? 'Jorge' : 'Monica',
    'it-IT': gender === 'male' ? 'Luca' : 'Alice',
    'pt-BR': gender === 'male' ? 'Felipe' : 'Luciana',
    'ru-RU': gender === 'male' ? 'Yuri' : 'Milena',
    'id-ID': 'Damayanti', 'ms-MY': 'Amelia', 'th-TH': 'Narisa',
    'vi-VN': 'Minh', 'hi-IN': gender === 'male' ? 'Rishi' : 'Lekha', 'ar-SA': 'Maged',
  };
  return table[locale] || (String(locale || '').startsWith('zh') ? 'Tingting' : 'Samantha');
}

/** pick edge-tts neural voice for (locale, gender). Returns best-quality natural voice. */
function pickEdgeVoice(locale, gender) {
  const g = gender === 'male' ? 'M' : 'F';
  const table = {
    'zh-CN': { F: 'zh-CN-XiaoyiNeural', M: 'zh-CN-YunxiNeural' },
    'zh-TW': { F: 'zh-TW-HsiaoChenNeural', M: 'zh-TW-YunJhongNeural' },
    'en-US': { F: 'en-US-JennyNeural', M: 'en-US-GuyNeural' },
    'en-GB': { F: 'en-GB-SoniaNeural', M: 'en-GB-RyanNeural' },
    'ja-JP': { F: 'ja-JP-NanamiNeural', M: 'ja-JP-KeitaNeural' },
    'ko-KR': { F: 'ko-KR-SunHiNeural', M: 'ko-KR-InJoonNeural' },
    'fr-FR': { F: 'fr-FR-DeniseNeural', M: 'fr-FR-HenriNeural' },
    'de-DE': { F: 'de-DE-KatjaNeural', M: 'de-DE-ConradNeural' },
    'es-ES': { F: 'es-ES-ElviraNeural', M: 'es-ES-AlvaroNeural' },
    'pt-BR': { F: 'pt-BR-FranciscaNeural', M: 'pt-BR-AntonioNeural' },
    'it-IT': { F: 'it-IT-ElsaNeural', M: 'it-IT-DiegoNeural' },
    'ru-RU': { F: 'ru-RU-SvetlanaNeural', M: 'ru-RU-DmitryNeural' },
    'hi-IN': { F: 'hi-IN-SwaraNeural', M: 'hi-IN-MadhurNeural' },
    'id-ID': { F: 'id-ID-GadisNeural', M: 'id-ID-ArdiNeural' },
    'th-TH': { F: 'th-TH-PremwadeeNeural', M: 'th-TH-NiwatNeural' },
    'vi-VN': { F: 'vi-VN-HoaiMyNeural', M: 'vi-VN-NamMinhNeural' },
  };
  const entry = table[locale];
  if (entry) return entry[g];
  const base = String(locale || '').split('-')[0];
  const match = Object.entries(table).find(([k]) => k.startsWith(base + '-'));
  if (match) return match[1][g];
  return g === 'M' ? 'en-US-GuyNeural' : 'en-US-JennyNeural';
}

async function edgeTts(text, voice, locale, outPath, { proxy } = {}) {
  const WebSocket = require('ws');
  const connId = crypto.randomBytes(16).toString('hex');
  const url =
    `${EDGE_WSS}?TrustedClientToken=${TRUSTED_TOKEN}` +
    `&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connId}`;
  const ws = new WebSocket(url, {
    headers: {
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0`,
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'Sec-WebSocket-Version': '13',
    },
    agent: proxy ? new (require('https-proxy-agent').HttpsProxyAgent)(proxy) : undefined,
  });
  const audioChunks = [];
  return new Promise((resolve, reject) => {
    const fail = (m) => { try { ws.close(); } catch (_) {} reject(new Error('edge-tts: ' + m)); };
    ws.on('open', () => {
      ws.send(
        `X-Timestamp:${new Date().toISOString()}\r\n` +
        'Content-Type:application/json; charset=utf-8\r\n' +
        'Path:speech.config\r\n\r\n' +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        })
      );
      ws.send(
        `X-RequestId:${connId}\r\nContent-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${new Date()}Z\r\nPath:ssml\r\n\r\n` +
        ttsSsml(voice, locale, text)
      );
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const hdrLen = buf.readUInt16BE(0);
        if (buf.length > 2 + hdrLen) audioChunks.push(buf.subarray(2 + hdrLen));
      } else {
        const s = Buffer.isBuffer(data) ? data.toString() : String(data);
        if (s.includes('Path:turn.end')) {
          const mp3 = Buffer.concat(audioChunks);
          if (mp3.length < 512) return fail('empty audio');
          fs.writeFileSync(outPath, mp3);
          try { ws.close(); } catch (_) {}
          resolve(outPath);
        }
      }
    });
    ws.on('error', (e) => fail(e.message));
    ws.on('close', () => reject(new Error('edge-tts: closed before turn.end')));
  });
}

// ----------------------------------------------------------------------------
// kokoro local neural TTS (sherpa-onnx binary, kokoro v1.1-zh, 103 speakers)
// ----------------------------------------------------------------------------
const KOKORO_DIR = 'kokoro-int8-multi-lang-v1_1';

/** resolve sherpa-onnx tts binary (packaged resources/ or dev tree) */
function sherpaTtsBin() {
  const cands = [
    path.join(process.resourcesPath || '', 'sherpa-onnx', 'bin', 'sherpa-onnx-offline-tts'),
    path.join(__dirname, 'resources', 'sherpa-onnx', 'bin', 'sherpa-onnx-offline-tts'),
  ];
  for (const c of cands) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return null;
}

/** kokoro speaker id for (locale, gender). v1.1-zh model only ships zh + en
 *  voices — returns null for other locales so the caller falls back to edge.
 *  mapping: 3=zf_001, 0=af_maple, 58=zm_009 (bilingual zh+en male). */
function pickKokoroSid(locale, gender) {
  const male = gender === 'male';
  const l = String(locale || '');
  if (/^zh/i.test(l)) return male ? 58 : 3;
  if (/^en/i.test(l)) return male ? 58 : 0;
  return null;
}

/** run sherpa-onnx kokoro TTS -> 24kHz mono mp3 (pipeline-compatible output) */
async function kokoroTts(text, sid, modelsDir, outMp3Path, ffmpegPath) {
  const bin = sherpaTtsBin();
  if (!bin) throw new Error('kokoro: sherpa-onnx binary not found');
  const k = path.join(modelsDir || '', KOKORO_DIR);
  const model = path.join(k, 'model.int8.onnx');
  const voices = path.join(k, 'voices.bin');
  if (!fs.existsSync(model) || !fs.existsSync(voices)) throw new Error('kokoro: models not downloaded');
  const lexicons = [path.join(k, 'lexicon-zh.txt'), path.join(k, 'lexicon-us-en.txt')]
    .filter((p) => fs.existsSync(p)).join(',');
  const fsts = ['phone-zh.fst', 'number-zh.fst', 'date-zh.fst']
    .map((f) => path.join(k, f)).filter((p) => fs.existsSync(p)).join(',');
  const dataDir = path.join(k, 'espeak-ng-data');
  const wav = outMp3Path.replace(/\.[^.]+$/, '_kokoro.wav');
  const args = [
    `--kokoro-model=${model}`,
    `--kokoro-lexicon=${lexicons}`,
    `--kokoro-tokens=${path.join(k, 'tokens.txt')}`,
    `--kokoro-voices=${voices}`,
    `--kokoro-data-dir=${dataDir}`,
    `--tts-rule-fsts=${fsts}`,
    `--sid=${sid}`,
    '--num-threads=4',
    `--output-filename=${wav}`,
    text,
  ];
  const t0 = Date.now();
  await new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    execFile(bin, args, { timeout: 600000, maxBuffer: 8 * 1024 * 1024 }, (err, _so, se) => {
      if (err) reject(new Error('kokoro: ' + String(se || err.message).slice(0, 300)));
      else resolve();
    });
  });
  if (!fs.existsSync(wav) || fs.statSync(wav).size < 2000) throw new Error('kokoro: no audio produced');
  // kokoro wav (24kHz) -> 24kHz mono mp3 for the shared pipeline
  await new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    execFile(ffmpegPath, ['-y', '-i', wav, '-ar', '24000', '-ac', '1', '-b:a', '96k', outMp3Path], { timeout: 60000 }, (err) => (err ? reject(err) : resolve()));
  });
  fs.unlinkSync(wav);
  log(`kokoro tts done in ${((Date.now() - t0) / 1000).toFixed(1)}s (sid=${sid})`);
  return true;
}

// ----------------------------------------------------------------------------
// image helpers (pure JS, rgb24 buffers)
// ----------------------------------------------------------------------------
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** letterbox resize rgb buffer (srcW*srcH*3) into dstW*dstH canvas + fill 114 */
function letterboxResize(src, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 3, 114);
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const nw = Math.round(srcW * scale), nh = Math.round(srcH * scale);
  const ox = Math.floor((dstW - nw) / 2), oy = Math.floor((dstH - nh) / 2);
  const xRatio = srcW / nw, yRatio = srcH / nh;
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(srcH - 1, Math.floor(y * yRatio));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x * xRatio));
      const di = ((oy + y) * dstW + (ox + x)) * 3;
      const si = (sy * srcW + sx) * 3;
      dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2];
    }
  }
  return { buf: dst, scale, ox, oy };
}

/** bilinear sample rgb at (fx, fy) in src(srcW,srcH), write into out[outIdx] */
function bilinear(src, srcW, srcH, fx, fy, out, outIdx) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  if (x0 < 0 || y0 < 0 || x0 >= srcW - 1 || y0 >= srcH - 1) {
    // edge clamp instead of black border (faces touch crop borders)
    const cx = clamp(x0, 0, srcW - 1), cy = clamp(y0, 0, srcH - 1);
    const i = (cy * srcW + cx) * 3;
    out[outIdx] = src[i]; out[outIdx + 1] = src[i + 1]; out[outIdx + 2] = src[i + 2];
    return;
  }
  const dx = fx - x0, dy = fy - y0;
  const i00 = (y0 * srcW + x0) * 3, i10 = i00 + 3, i01 = i00 + srcW * 3, i11 = i01 + 3;
  for (let c = 0; c < 3; c++) {
    const top = src[i00 + c] * (1 - dx) + src[i10 + c] * dx;
    const bot = src[i01 + c] * (1 - dx) + src[i11 + c] * dx;
    out[outIdx + c] = top * (1 - dy) + bot * dy;
  }
}

/** resize arbitrary rgb region to exact dstW*dstH (bilinear). Optional dst reuse. */
function resizeTo(src, srcW, srcH, sx, sy, sw, sh, dstW, dstH, dst) {
  const out = dst && dst.length === dstW * dstH * 3 ? dst : Buffer.alloc(dstW * dstH * 3);
  const xr = sw / dstW, yr = sh / dstH;
  for (let y = 0; y < dstH; y++) {
    const fy = sy + (y + 0.5) * yr - 0.5;
    for (let x = 0; x < dstW; x++) {
      const fx = sx + (x + 0.5) * xr - 0.5;
      bilinear(src, srcW, srcH, fx, fy, out, (y * dstW + x) * 3);
    }
  }
  return out;
}

/** Color-independent mouth appearance descriptor. The border estimates skin
 * tone; the normalized interior records lip opening, teeth and lip contour. */
function describeMouth(src, srcW, srcH, sx = 0, sy = 0, sw = srcW, sh = srcH) {
  const small = resizeTo(src, srcW, srcH, sx, sy, sw, sh, MOUTH_DESC_W, MOUTH_DESC_H);
  const n = MOUTH_DESC_W * MOUTH_DESC_H;
  const lum = new Float32Array(n);
  let borderSum = 0, borderN = 0;
  for (let y = 0; y < MOUTH_DESC_H; y++) {
    for (let x = 0; x < MOUTH_DESC_W; x++) {
      const i = y * MOUTH_DESC_W + x;
      const p = i * 3;
      const v = small[p] * 0.299 + small[p + 1] * 0.587 + small[p + 2] * 0.114;
      lum[i] = v;
      if (x < 2 || x >= MOUTH_DESC_W - 2 || y < 2 || y >= MOUTH_DESC_H - 2) {
        borderSum += v;
        borderN++;
      }
    }
  }
  const skin = borderN ? borderSum / borderN : 160;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (lum[i] - skin) ** 2;
  const scale = Math.max(22, Math.sqrt(variance / n));
  const values = new Float32Array(n + MOUTH_DESC_H + 4);
  let darkArea = 0, darkY = 0, darkY2 = 0, darkWeight = 0, brightArea = 0;
  for (let y = 0; y < MOUTH_DESC_H; y++) {
    let rowDark = 0;
    for (let x = 0; x < MOUTH_DESC_W; x++) {
      const i = y * MOUTH_DESC_W + x;
      const z = clamp((lum[i] - skin) / scale, -2.5, 2.5) / 2.5;
      const cx = (x + 0.5) / MOUTH_DESC_W;
      const cy = (y + 0.5) / MOUTH_DESC_H;
      const centerWeight = Math.max(0.2, 1 - 0.65 * Math.hypot((cx - 0.5) * 1.35, (cy - 0.53) * 1.7));
      values[i] = z * centerWeight;
      const dark = Math.max(0, -z) * centerWeight;
      rowDark += dark;
      darkArea += dark;
      darkY += dark * cy;
      darkY2 += dark * cy * cy;
      darkWeight += dark;
      if (z > 0.28 && cy > 0.25 && cy < 0.80) brightArea += z * centerWeight;
    }
    values[n + y] = rowDark / MOUTH_DESC_W;
  }
  const meanY = darkWeight ? darkY / darkWeight : 0.53;
  values[n + MOUTH_DESC_H] = darkArea / n;
  values[n + MOUTH_DESC_H + 1] = meanY;
  values[n + MOUTH_DESC_H + 2] = darkWeight ? Math.sqrt(Math.max(0, darkY2 / darkWeight - meanY * meanY)) : 0;
  values[n + MOUTH_DESC_H + 3] = brightArea / n;
  return values;
}

function descriptorDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  const pixels = MOUTH_DESC_W * MOUTH_DESC_H;
  let pixelErr = 0;
  for (let i = 0; i < pixels; i++) {
    const d = a[i] - b[i];
    pixelErr += d * d;
  }
  let rowErr = 0;
  for (let i = 0; i < MOUTH_DESC_H; i++) {
    const d = a[pixels + i] - b[pixels + i];
    rowErr += d * d;
  }
  const f = pixels + MOUTH_DESC_H;
  return pixelErr / pixels
    + rowErr / MOUTH_DESC_H * 1.8
    + Math.abs(a[f] - b[f]) * 1.6
    + Math.abs(a[f + 1] - b[f + 1]) * 0.8
    + Math.abs(a[f + 2] - b[f + 2]) * 1.2
    + Math.abs(a[f + 3] - b[f + 3]) * 0.9;
}

/** v0.9.53: per-frame audio RMS envelope, normalized by its 95th percentile.
 *  Drives the silence/loudness gate in pose retrieval — during pauses the
 *  mouth must close regardless of descriptor noise; during loud syllables a
 *  fully closed pose is penalized. */
function computeAudioEnv(pcm, totalFrames) {
  const env = new Float32Array(totalFrames);
  const win = Math.round(16000 * 0.03); // ±30ms
  for (let f = 0; f < totalFrames; f++) {
    const center = Math.round((f / FPS) * 16000);
    const a = Math.max(0, center - win), b = Math.min(pcm.length, center + win);
    let s = 0, n = 0;
    for (let i = a; i < b; i++) { s += pcm[i] * pcm[i]; n++; }
    env[f] = Math.sqrt(s / Math.max(1, n));
  }
  const sorted = Float32Array.from(env).sort();
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0;
  const norm = Math.max(1e-4, p95);
  for (let f = 0; f < totalFrames; f++) env[f] = clamp(env[f] / norm, 0, 1.4);
  return env;
}

// ---- v0.9.46 affine geometry (FFHQ alignment for GFPGAN) -------------------

/** least-squares similarity transform mapping src[] -> dst[] (2d points).
 *  Returns [a,b,tx,c,d,ty] (row-major 2x3) with dst ≈ [a -b; b a]·src + t.
 *  Umeyama-style: rotation from atan2 form, uniform scale from variance ratio. */
function similarityEst(src, dst) {
  const n = src.length;
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let c = 0, s = 0, va = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i][0] - sx, ay = src[i][1] - sy;
    const bx = dst[i][0] - dx, by = dst[i][1] - dy;
    c += ax * bx + ay * by;   // cos numerator
    s += ay * bx - ax * by;   // sin numerator
    va += ax * ax + ay * ay;  // src variance
  }
  const r = Math.hypot(c, s);
  if (r === 0 || va === 0) return [1, 0, dx - sx, 0, 1, dy - sy];
  const sc = r / va, cc = c / r, ss = s / r;
  const a = sc * cc, b = sc * ss;
  return [a, -b, dx - (a * sx - b * sy), b, a, dy - (b * sx + a * sy)];
}

/** invert 2x3 affine [a,b,tx,c,d,ty] */
function invAffine2x3(m) {
  const det = m[0] * m[4] - m[1] * m[3];
  if (!det) return [1, 0, 0, 0, 1, 0];
  return [
    m[4] / det, -m[1] / det, (m[1] * m[5] - m[4] * m[2]) / det,
    -m[3] / det, m[0] / det, (m[3] * m[2] - m[0] * m[5]) / det,
  ];
}

/** compose affine m with a pre-translation by (tx,ty):
 *  result(x,y) = m(x+tx, y+ty) — maps crop coords -> m's destination space */
function affinePreTranslate(m, tx, ty) {
  return [
    m[0], m[1], m[0] * tx + m[1] * ty + m[2],
    m[3], m[4], m[3] * tx + m[4] * ty + m[5],
  ];
}

/** inverse-map affine warp: dst(x,y) samples src at m(x,y) (bilinear,
 *  edge-clamped). dst must be dstW*dstH*3 bytes. */
function warpAffineInto(src, srcW, srcH, dst, dstW, dstH, m) {
  for (let y = 0; y < dstH; y++) {
    const my = m[1] * y + m[2];
    const ny = m[4] * y + m[5];
    for (let x = 0; x < dstW; x++) {
      bilinear(src, srcW, srcH, m[0] * x + my, m[3] * x + ny, dst, (y * dstW + x) * 3);
    }
  }
  return dst;
}

/** separable box blur (3 passes ~= gaussian). in-place on Float32Array mask. */
function boxBlur3(mask, w, h, r) {
  const tmp = new Float32Array(w * h);
  const cl = (v, hi) => (v < 0 ? 0 : v > hi ? hi : v);
  const norm = 2 * r + 1;
  for (let p = 0; p < 3; p++) {
    // horizontal pass: src(mask) -> tmp
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += mask[row + cl(x, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / norm;
        acc += mask[row + cl(x + r + 1, w - 1)] - mask[row + cl(x - r, w - 1)];
      }
    }
    // vertical pass: tmp -> mask
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[cl(y, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        mask[y * w + x] = acc / norm;
        acc += tmp[cl(y + r + 1, h - 1) * w + x] - tmp[cl(y - r, h - 1) * w + x];
      }
    }
  }
  return mask;
}

// ----------------------------------------------------------------------------
// engine
// ----------------------------------------------------------------------------
class RealHumanEngine {
  constructor({ modelsDir, ffmpegPath, proxy } = {}) {
    this.modelsDir = modelsDir;
    this.ffmpegPath = ffmpegPath;
    this.proxy = proxy;
    this.sessions = {};
    // reusable buffers
    this._faceIn = null;      // Float32Array 6*256*256 wav2lip input
    this._melChunk = new Float32Array(MEL_STEP * 80);
    this._pred256 = null;     // Buffer 256*256*3 wav2lip output
    this._predSide = null;    // Buffer side*side*3
    // v0.9.45 NEW buffers for Poisson blending
    this._lipConf = null;     // Float32Array side*side lip-confidence map
    this._predAdj = null;     // Buffer side*side*3 color-adjusted prediction
    this._sharpenBuf = null;  // Float32Array for sharpening
    this._sharpenCh1 = null;  // Float32Array channel temp 1
    this._sharpenCh2 = null;  // Float32Array channel temp 2
    // v0.9.46 GFPGAN restoration buffers
    this._gfSrc = null;       // Buffer 512*512*3 gfpgan input image (FFHQ-aligned)
    this._gfIn = null;        // Float32Array 3*512*512 gfpgan input tensor
    this._gfOut = null;       // Buffer 512*512*3 gfpgan restored output
    this._gfSide = null;      // Buffer side*side*3 restored face at crop size
    // v0.9.46 FFHQ alignment warp matrices (locked on first face detection)
    this._gfWarpIn = null;    // affine: FFHQ-512 pixel -> frame coords
    this._gfWarpOut = null;   // affine: crop-side pixel -> FFHQ-512 coords
    this._mouthBank = null;
    this._mouthBankPrev = null;
    this._mouthTargetEma = null;
    this._mouthSelectTick = 0;
    this._mouthContentMask = null;
    this._mouthCurrentContentMask = null;
  }

  mp(name) { return path.join(this.modelsDir, name); }

  async load(onProgress) {
    const need = [
      ['mel', 'mel_wav2lip.onnx'],
      ['wav2lip', 'wav2lip_gan_96.onnx'],
      ['yolo', 'yoloface_8n.onnx'],
    ];
    for (const [key, file] of need) {
      if (!fs.existsSync(this.mp(file))) throw new Error(`model missing: ${file}`);
    }
    const total = need.length;
    let done = 0;
    for (const [key, file] of need) {
      this.sessions[key] = await InferenceSession.create(this.mp(file), {
        graphOptimizationLevel: 'all',
        executionMode: 'sequential',
        intraOpNumThreads: Math.min(4, require('os').cpus().length),
      });
      done += 1;
      if (onProgress) onProgress(done / total);
    }
    log('HD mouth retrieval enabled; low-resolution face restoration disabled');
  }

  /** PCM float32 -> mel (1,80,T) */
  async computeMel(pcm) {
    const out = await this.sessions.mel.run({ pcm: new Tensor('float32', pcm, [1, pcm.length]) });
    return out.mel; // dims [1,80,T]
  }

  /** v0.9.38: amplify mel dynamics around the per-bin utterance mean. Measured
   *  lip spread is only ~57% of the wav2lip reference (30 vs 53) — quiet
   *  syllables under-articulate and the mouth reads as detached from the
   *  voice. Boosting deviation from the mean makes openings/closures track
   *  syllables crisply without shifting timing. */
  boostMelContrast(melData, T, k = MEL_BOOST) {
    for (let m = 0; m < 80; m++) {
      const row = m * T;
      let mu = 0;
      for (let t = 0; t < T; t++) mu += melData[row + t];
      mu /= T;
      for (let t = 0; t < T; t++) melData[row + t] = mu + (melData[row + t] - mu) * k;
    }
    return melData;
  }

  /** rgb frame -> { box:[x1,y1,x2,y2], score, pts: 5x2 } (image coords, clamped) */
  async detectFace(rgb) {
    const LB = letterboxResize(rgb, W, H, 640, 640);
    const input = new Float32Array(1 * 3 * 640 * 640);
    // hwc rgb -> chw /255
    for (let i = 0, n = 640 * 640; i < n; i++) {
      input[i] = LB.buf[i * 3] / 255;
      input[n + i] = LB.buf[i * 3 + 1] / 255;
      input[2 * n + i] = LB.buf[i * 3 + 2] / 255;
    }
    const res = await this.sessions.yolo.run({ input: new Tensor('float32', input, [1, 3, 640, 640]) });
    const data = res.output.data; // (1,20,8400)
    const out = res.output.dims; // [1,20,8400]
    const nAnchor = out[2];
    let best = -1, bestScore = 0.5;
    for (let i = 0; i < nAnchor; i++) {
      const s = data[4 * nAnchor + i];
      if (s > bestScore) { bestScore = s; best = i; }
    }
    if (best < 0) return null;
    const cx = data[best], cy = data[nAnchor + best];
    const w = data[2 * nAnchor + best], h = data[3 * nAnchor + best];
    // v0.9.46 FIX: yoloface_8n kps layout is 5x3 (x,y,conf) packed after the
    // 5 header channels (20 = 4 box + 1 conf + 15 kps). The old 2-stride read
    // produced garbage landmarks, so FFHQ alignment silently degraded to a
    // naive crop. Filter by confidence so occluded points don't skew the fit.
    const pts = [];
    for (let k = 0; k < 5; k++) {
      const kx = data[(5 + 3 * k) * nAnchor + best];
      const ky = data[(6 + 3 * k) * nAnchor + best];
      const kc = data[(7 + 3 * k) * nAnchor + best];
      if (kc < 0.3 || !isFinite(kx) || !isFinite(ky)) { pts.push(null); continue; }
      pts.push([(kx - LB.ox) / LB.scale, (ky - LB.oy) / LB.scale]);
    }
    let x1 = (cx - w / 2 - LB.ox) / LB.scale, y1 = (cy - h / 2 - LB.oy) / LB.scale;
    let x2 = (cx + w / 2 - LB.ox) / LB.scale, y2 = (cy + h / 2 - LB.oy) / LB.scale;
    x1 = clamp(x1, 0, W - 2); y1 = clamp(y1, 0, H - 2);
    x2 = clamp(x2, x1 + 8, W); y2 = clamp(y2, y1 + 8, H);
    return { box: [Math.floor(x1), Math.floor(y1), Math.ceil(x2), Math.ceil(y2)], score: bestScore, pts };
  }

  /** wav2lip-style square crop around face box (expand 1.3), fully inside frame.
   *  v0.9.44: raised crop center so the expanded square contains the full face
   *  and upper torso WITHOUT spilling deep into the neck/shoulder region.
   *  Previously cy was the geometric center of the detector box (≈ nose
   *  bridge), so the bottom 50% of the 1.3x square reached the clavicle.
   *  That 50% contained no mouth pixels — yet the blurred mask spread into
   *  it, producing the "neck pixel stripes" in user screenshots. Shifting the
   *  center upward (22% of face height toward the brow line) keeps every
   *  mouth pixel inside the crop while the crop bottom lands exactly at the
   *  jawline (≈ chin + 6%), so neck pixels never enter the wav2lip feed. */
  squareCrop(box) {
    const [x1, y1, x2, y2] = box;
    const fh = y2 - y1;
    const cx = (x1 + x2) / 2;
    // move the crop center upward so neck stays outside
    const cy = y1 + fh * 0.42;
    const s = Math.max(x2 - x1, fh) * CROP_EXPAND;
    let sx1 = Math.round(clamp(cx - s / 2, 0, W - 16));
    let sy1 = Math.round(clamp(cy - s / 2, 0, H - 16));
    let side = Math.round(s);
    side = Math.min(side, W - sx1, H - sy1);
    return { sx1, sy1, side };
  }

  /** v0.9.41 CRITICAL FIX: fill 6-channel wav2lip input the way the official
   *  Wav2Lip inference does — [masked(3) | full(3)] of the SAME frame, where
   *  masked = lower half (H >= FACE/2) zeroed. The model reconstructs the
   *  mouth from audio BECAUSE the mouth region is blanked in the first half.
   *  The old [ref(3) | cur(3)] pose fed an intact mouth in channel 0-2, so
   *  the network just copied it and IGNORED the mel entirely — that was the
   *  root cause of "嘴型没有对齐" (lip sync never actually engaged since v2). */
  buildFaceInput(curFace) {
    const f = this._faceIn || (this._faceIn = new Float32Array(6 * FACE * FACE));
    const n = FACE * FACE;
    const half = FACE >> 1;
    for (let i = 0; i < n; i++) {
      f[3 * n + i] = curFace[i * 3] / 255; f[4 * n + i] = curFace[i * 3 + 1] / 255; f[5 * n + i] = curFace[i * 3 + 2] / 255;
    }
    f.fill(0, 0, 3 * n);
    for (let y = 0; y < half; y++) {
      const row = y * FACE, rowIn = row * 3, rowOut = row; // first plane is R of masked
      for (let x = 0; x < FACE; x++) {
        const i = row + x, j = rowIn + x * 3;
        f[i] = curFace[j] / 255; f[n + i] = curFace[j + 1] / 255; f[2 * n + i] = curFace[j + 2] / 255;
      }
    }
    return f;
  }

  /** extract 16-frame mel window for video frame idx (zero-padded at edges).
   *  v0.9.38: the window STARTS at the frame's mel index — wav2lip's native
   *  alignment (frame t is driven by audio [t, t+200ms]). The old centered
   *  window made the mouth move ~100ms AHEAD of the audio. */
  fillMelChunk(melData, T, frameIdx) {
    const melMul = MEL_PER_SEC / FPS;
    const start = Math.floor(frameIdx * melMul);
    const c = this._melChunk;
    for (let m = 0; m < 80; m++) {
      const row = m * T;
      for (let t = 0; t < MEL_STEP; t++) {
        const idx = start + t;
        c[m * MEL_STEP + t] = idx >= 0 && idx < T ? melData[row + idx] : 0;
      }
    }
    return c;
  }

  /** run wav2lip 96 (official GAN): mel chunk + [masked|full] cur face -> 96x96 rgb Buffer.
   *  v0.9.41: input names adapted by signature (96 model uses source/target). */
  async lipSync(melChunk, curFace) {
    const faceIn = this.buildFaceInput(curFace);
    const names = this.sessions.wav2lip.inputNames;
    const feed = {};
    feed[names[0]] = new Tensor('float32', melChunk, [1, 1, 80, MEL_STEP]);
    feed[names[1]] = new Tensor('float32', faceIn, [1, 6, FACE, FACE]);
    const out = await this.sessions.wav2lip.run(feed);
    const t = Object.values(out)[0]; // (1,3,96,96) rgb 0..1
    const d = t.data;
    const res = this._pred256 || (this._pred256 = Buffer.alloc(FACE * FACE * 3));
    const n = FACE * FACE;
    for (let i = 0; i < n; i++) {
      res[i * 3] = clamp(d[i] * 255, 0, 255);
      res[i * 3 + 1] = clamp(d[n + i] * 255, 0, 255);
      res[i * 3 + 2] = clamp(d[2 * n + i] * 255, 0, 255);
    }
    return res;
  }

  /** Build a tracked bank of natural, full-resolution mouth poses.
   *
   * Every source pose is cropped around that frame's own landmarks. The old
   * fixed crop drifted away from the moving mouth and its interpolated poses
   * literally blended two differently positioned lips into one patch. */
  async buildHostMouthBank(hostVideo, crop, det) {
    const left = det?.pts?.[3];
    const right = det?.pts?.[4];
    if (!left || !right) throw new Error('mouth landmarks unavailable');
    const cx = (left[0] + right[0]) / 2;
    const cy = (left[1] + right[1]) / 2;
    const mouthW = Math.hypot(right[0] - left[0], right[1] - left[1]);
    if (!Number.isFinite(mouthW) || mouthW < 24) throw new Error('invalid mouth geometry');

    const pw = Math.max(64, Math.round(mouthW * 1.56 / 2) * 2);
    const ph = Math.max(48, Math.round(mouthW * 0.92 / 2) * 2);
    const x = Math.round(clamp(cx - pw / 2, 0, W - pw));
    const y = Math.round(clamp(cy - mouthW * 0.37, 0, H - ph));
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      const p = runFfmpeg(this.ffmpegPath, [
        '-i', hostVideo,
        '-vf', `scale=${W}:${H},fps=${MOUTH_BANK_FPS}`,
        '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-',
      ], { stdio: ['ignore', 'pipe', 'ignore'] });
      p.stdout.on('data', (chunk) => chunks.push(chunk));
      p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('mouth bank decode failed'))));
      p.on('error', reject);
    });
    const count = Math.floor(raw.length / FRAME_BYTES);
    if (count < 8) throw new Error(`mouth bank too small (${count})`);

    const geometry = new Array(count).fill(null);
    for (let i = 0; i < count; i++) {
      const full = raw.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES);
      const sampleDet = i === 0 ? det : await this.detectFace(full);
      const sampleLeft = sampleDet?.pts?.[3];
      const sampleRight = sampleDet?.pts?.[4];
      if (!sampleLeft || !sampleRight) continue;
      const sampleW = Math.hypot(sampleRight[0] - sampleLeft[0], sampleRight[1] - sampleLeft[1]);
      if (!Number.isFinite(sampleW) || sampleW < 24) continue;
      geometry[i] = {
        cx: (sampleLeft[0] + sampleRight[0]) / 2,
        cy: (sampleLeft[1] + sampleRight[1]) / 2,
        mouthW: sampleW,
      };
    }

    const validWidths = geometry.filter(Boolean).map((g) => g.mouthW).sort((a, b) => a - b);
    if (validWidths.length < Math.max(6, count * 0.65)) {
      throw new Error(`mouth tracking incomplete (${validWidths.length}/${count})`);
    }
    const medianW = validWidths[Math.floor(validWidths.length / 2)];
    for (let i = 0; i < count; i++) {
      if (geometry[i] && Math.abs(geometry[i].mouthW - medianW) / medianW <= 0.24) continue;
      let replacement = null;
      for (let radius = 1; radius < count && !replacement; radius++) {
        replacement = geometry[i - radius] || geometry[i + radius] || null;
      }
      geometry[i] = replacement || { cx, cy, mouthW };
    }

    // Smooth landmark jitter only. Mouth pixels themselves are never blended.
    const tracked = geometry.map((g, i) => {
      const a = geometry[Math.max(0, i - 1)] || g;
      const b = g || a;
      const c = geometry[Math.min(count - 1, i + 1)] || b;
      const scx = a.cx * 0.2 + b.cx * 0.6 + c.cx * 0.2;
      const scy = a.cy * 0.2 + b.cy * 0.6 + c.cy * 0.2;
      return {
        x: Math.round(clamp(scx - pw / 2, 0, W - pw)),
        y: Math.round(clamp(scy - medianW * 0.37, 0, H - ph)),
      };
    });

    const frames = [];
    for (let i = 0; i < count; i++) {
      const full = raw.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES);
      const place = tracked[i];
      const pixels = resizeTo(full, W, H, place.x, place.y, pw, ph, pw, ph);
      frames.push({ pixels, descriptor: describeMouth(pixels, pw, ph), index: i });
    }

    // A tight analytic ellipse includes the lips and oral cavity, with a
    // narrow feather. It cannot reach the nose, cheeks or chin.
    const mask = new Float32Array(pw * ph);
    const localCx = pw / 2;
    const localCy = medianW * 0.405;
    const rx = medianW * 0.72;
    const ry = medianW * 0.31;
    let corePixels = 0;
    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        const dx = (px - localCx) / rx;
        const dy = (py - localCy) / ry;
        const d2 = dx * dx + dy * dy;
        let value = 0;
        if (d2 <= 0.55) value = 1;
        else if (d2 < 1) {
          const t = (1 - d2) / 0.45;
          value = t * t * (3 - 2 * t);
        }
        mask[py * pw + px] = value;
        if (value >= 0.5) corePixels++;
      }
    }

    const modelRect = {
      x: clamp((tracked[0].x - crop.sx1) / crop.side * FACE, 0, FACE - 2),
      y: clamp((tracked[0].y - crop.sy1) / crop.side * FACE, 0, FACE - 2),
      w: clamp(pw / crop.side * FACE, 2, FACE),
      h: clamp(ph / crop.side * FACE, 2, FACE),
    };
    modelRect.w = Math.min(modelRect.w, FACE - modelRect.x);
    modelRect.h = Math.min(modelRect.h, FACE - modelRect.y);

    // v0.9.53: normalize candidate openness (darkArea feature) by the bank max
    // so the audio gate can compare poses on a 0..1 scale.
    const openFeat = MOUTH_DESC_W * MOUTH_DESC_H + MOUTH_DESC_H;
    let maxOpen = 1e-6;
    for (const fr of frames) maxOpen = Math.max(maxOpen, fr.descriptor[openFeat]);
    for (const fr of frames) fr.open = fr.descriptor[openFeat] / maxOpen;

    this._mouthBank = { x, y, w: pw, h: ph, mouthW: medianW, mask, frames, track: tracked, fps: MOUTH_BANK_FPS, modelRect };
    this._mouthBankPrev = null;
    this._mouthTargetEma = null;
    this._mouthPrevDesc = null;
    this._mouthSelectTick = 0;
    this._mouthPrevCandidate = null;
    log(`tracked HD mouth bank: ${frames.length} real poses @${MOUTH_BANK_FPS}fps, tracked=${validWidths.length}/${count}, patch=${pw}x${ph}, core=${(corePixels / (pw * ph) * 100).toFixed(1)}%`);
    return this._mouthBank;
  }

  /** Select exactly one real source pose. Cross-dissolving mouth pixels is
   * forbidden because it creates the visible double-lip/ghost-mouth defect. */
  selectHostMouth(pred, frameIdx) {
    const bank = this._mouthBank;
    if (!bank?.frames?.length) return null;
    const r = bank.modelRect;
    const current = describeMouth(pred, FACE, FACE, r.x, r.y, r.w, r.h);
    if (!this._mouthTargetEma || this._mouthTargetEma.length !== current.length) {
      this._mouthTargetEma = Float32Array.from(current);
    } else {
      for (let i = 0; i < current.length; i++) {
        this._mouthTargetEma[i] = this._mouthTargetEma[i] * 0.25 + current[i] * 0.75;
      }
    }
    const target = this._mouthTargetEma;

    // audio gate weight from the narration envelope at this exact frame
    const env = this._audioEnv && frameIdx >= 0 && frameIdx < this._audioEnv.length
      ? this._audioEnv[frameIdx] : 0.4;
    const silenceGate = env < 0.06 ? 1.1 : Math.max(0, (0.32 - env) / 0.26) * 0.45;
    const loudGate = env > 0.55 ? 0.35 : 0;

    // adaptive temporal cost: audio moving fast (syllable transitions) ->
    // allow the pose to switch fast; steady audio -> favour stability
    let dEnv = 0;
    if (this._audioEnv && frameIdx > 0 && frameIdx < this._audioEnv.length) {
      dEnv = Math.abs(this._audioEnv[frameIdx] - this._audioEnv[frameIdx - 1]);
    }
    const tempoCost = clamp(0.34 - dEnv * 0.9, 0.10, 0.34);
    const prev = this._mouthPrevDesc;

    let bestScore = Infinity;
    let best = null;
    let previousScore = Infinity;
    for (const cand of bank.frames) {
      let score = descriptorDistance(target, cand.descriptor);
      if (prev) score += descriptorDistance(prev, cand.descriptor) * tempoCost;
      if (silenceGate > 0) score += (0.10 + cand.open) * silenceGate;
      if (loudGate > 0 && cand.open < 0.22) score += (0.22 - cand.open) * loudGate;
      if (cand === this._mouthPrevCandidate) previousScore = score;
      if (score < bestScore) { bestScore = score; best = cand; }
    }
    if (!best) return null;

    // Hysteresis reduces hard pose chatter without mixing pixels. Keep the
    // previous real frame when its score is effectively tied with the winner.
    if (this._mouthPrevCandidate && previousScore <= bestScore * 1.08 + 0.008) {
      best = this._mouthPrevCandidate;
    }
    this._mouthPrevDesc = best.descriptor;
    this._mouthPrevCandidate = best;
    this._mouthBankPrev = best;
    return best;
  }

  mouthPlacement(frameIdx) {
    const bank = this._mouthBank;
    if (!bank?.track?.length) return bank ? { x: bank.x, y: bank.y } : null;
    const phase = (Math.max(0, frameIdx) * bank.fps / FPS) % bank.track.length;
    const i0 = Math.floor(phase);
    const i1 = (i0 + 1) % bank.track.length;
    const mix = phase - i0;
    return {
      x: Math.round(bank.track[i0].x * (1 - mix) + bank.track[i1].x * mix),
      y: Math.round(bank.track[i0].y * (1 - mix) + bank.track[i1].y * mix),
    };
  }

  /** Composite a selected original host mouth patch. No resize, restoration,
   * sharpening or generated pixels are used, so source detail is conserved. */
  compositeHostMouth(frame, pred, frameIdx) {
    const bank = this._mouthBank;
    const selected = this.selectHostMouth(pred, frameIdx);
    if (!bank || !selected) return false;
    const placement = this.mouthPlacement(frameIdx);
    if (!placement) return false;
    const dstX = placement.x;
    const dstY = placement.y;

    let srcR = 0, srcG = 0, srcB = 0, dstR = 0, dstG = 0, dstB = 0, n = 0;
    for (let py = 0; py < bank.h; py++) {
      for (let px = 0; px < bank.w; px++) {
        const mv = bank.mask[py * bank.w + px];
        if (mv < 0.04 || mv > 0.32) continue;
        const si = (py * bank.w + px) * 3;
        const di = ((dstY + py) * W + dstX + px) * 3;
        srcR += selected.pixels[si]; srcG += selected.pixels[si + 1]; srcB += selected.pixels[si + 2];
        dstR += frame[di]; dstG += frame[di + 1]; dstB += frame[di + 2];
        n++;
      }
    }
    const offR = n ? clamp((dstR - srcR) / n, -10, 10) : 0;
    const offG = n ? clamp((dstG - srcG) / n, -10, 10) : 0;
    const offB = n ? clamp((dstB - srcB) / n, -10, 10) : 0;

    // Build a content-aware lip mask. A fixed ellipse still copied skin from
    // a different host moment during very open poses, making its boundary
    // faintly visible. Red lip pixels and the dark oral cavity drive this
    // mask; a small expansion includes the teeth between them. Plain skin is
    // blended at only 8%, so no oval/square patch can appear.
    let borderLum = 0, currentBorderLum = 0, borderCount = 0;
    for (let py = 0; py < bank.h; py++) {
      for (let px = 0; px < bank.w; px++) {
        if (px >= 5 && px < bank.w - 5 && py >= 5 && py < bank.h - 5) continue;
        const si = (py * bank.w + px) * 3;
        const di = ((dstY + py) * W + dstX + px) * 3;
        borderLum += selected.pixels[si] * 0.299 + selected.pixels[si + 1] * 0.587 + selected.pixels[si + 2] * 0.114;
        currentBorderLum += frame[di] * 0.299 + frame[di + 1] * 0.587 + frame[di + 2] * 0.114;
        borderCount++;
      }
    }
    const skinLum = borderCount ? borderLum / borderCount : 160;
    const currentSkinLum = borderCount ? currentBorderLum / borderCount : 160;
    const content = this._mouthContentMask && this._mouthContentMask.length === bank.w * bank.h
      ? this._mouthContentMask
      : (this._mouthContentMask = new Float32Array(bank.w * bank.h));
    const currentContent = this._mouthCurrentContentMask && this._mouthCurrentContentMask.length === bank.w * bank.h
      ? this._mouthCurrentContentMask
      : (this._mouthCurrentContentMask = new Float32Array(bank.w * bank.h));
    for (let py = 0; py < bank.h; py++) {
      const ny = (py + 0.5) / bank.h;
      for (let px = 0; px < bank.w; px++) {
        const nx = (px + 0.5) / bank.w;
        const si = (py * bank.w + px) * 3;
        const di = ((dstY + py) * W + dstX + px) * 3;
        const r = selected.pixels[si], g = selected.pixels[si + 1], b = selected.pixels[si + 2];
        const lum = r * 0.299 + g * 0.587 + b * 0.114;
        const red = clamp((r - (g + b) * 0.5 - 2) / 24, 0, 1);
        const dark = clamp((skinLum - lum - 7) / 52, 0, 1);
        const center = nx > 0.08 && nx < 0.92 && ny > 0.18 && ny < 0.88 ? 1 : 0.25;
        content[py * bank.w + px] = Math.max(red, dark) * center;
        const cr = frame[di], cg = frame[di + 1], cb = frame[di + 2];
        const currentLum = cr * 0.299 + cg * 0.587 + cb * 0.114;
        const currentRed = clamp((cr - (cg + cb) * 0.5 - 2) / 24, 0, 1);
        const currentDark = clamp((currentSkinLum - currentLum - 7) / 52, 0, 1);
        currentContent[py * bank.w + px] = Math.max(currentRed, currentDark) * center;
      }
    }
    boxBlur3(content, bank.w, bank.h, 2);
    boxBlur3(currentContent, bank.w, bank.h, 2);

    for (let py = 0; py < bank.h; py++) {
      for (let px = 0; px < bank.w; px++) {
        const i = py * bank.w + px;
        // Union with the destination mouth so the host template's previous
        // lip pose is fully removed instead of leaking as a second mouth.
        const mouthContent = clamp(Math.max(content[i], currentContent[i]) * 2.25, 0, 1);
        const k = bank.mask[i] * (0.08 + mouthContent * 0.92);
        if (k <= 0.002) continue;
        const si = (py * bank.w + px) * 3;
        const di = ((dstY + py) * W + dstX + px) * 3;
        const r = clamp(selected.pixels[si] + offR, 0, 255);
        const g = clamp(selected.pixels[si + 1] + offG, 0, 255);
        const b = clamp(selected.pixels[si + 2] + offB, 0, 255);
        frame[di] = clamp(frame[di] * (1 - k) + r * k, 0, 255);
        frame[di + 1] = clamp(frame[di + 1] * (1 - k) + g * k, 0, 255);
        frame[di + 2] = clamp(frame[di + 2] * (1 - k) + b * k, 0, 255);
      }
    }
    return true;
  }

  /** Build one stable mouth envelope by scanning full-resolution host frames.
   *  This covers the host's widest talking pose while remaining bounded by
   *  detected mouth corners, preventing both ghost-mouth leaks and lower-face
   *  repainting. */
  async computeHostMaxMask(hostVideo, crop) {
    const { sx1, sy1, side } = crop;
    const frames = await new Promise((resolve, reject) => {
      const chunks = [];
      const p = runFfmpeg(this.ffmpegPath, [
        '-t', '32', '-i', hostVideo,
        '-vf', `fps=2,scale=${W}:${H}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-',
      ], { stdio: ['ignore', 'pipe', 'ignore'] });
      p.stdout.on('data', (c) => chunks.push(c));
      p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('host sample decode'))));
      p.on('error', reject);
    });
    const nf = Math.floor(frames.length / FRAME_BYTES);
    if (nf < 1) return null;
    const stride = Math.max(1, Math.ceil(nf / 24));
    const max = new Float32Array(side * side);
    let used = 0;

    // v0.9.51: derive the blend envelope from full-resolution mouth-corner
    // landmarks. Parsing the 96x96 generated face frequently failed and fell
    // back to a huge lower-face ellipse; the restoration model then repainted
    // cheeks, philtrum and chin, producing the visible blur/smear defect.
    const addMouthEllipse = (det) => {
      const pts = det?.pts || [];
      const left = pts[3], right = pts[4];
      let cx, cy, mouthW;
      if (left && right) {
        cx = ((left[0] + right[0]) / 2) - sx1;
        cy = ((left[1] + right[1]) / 2) - sy1;
        mouthW = Math.hypot(right[0] - left[0], right[1] - left[1]);
      } else if (det?.box) {
        const [x1, y1, x2, y2] = det.box;
        const fw = x2 - x1, fh = y2 - y1;
        cx = (x1 + x2) / 2 - sx1;
        cy = y1 + fh * 0.73 - sy1;
        mouthW = fw * 0.40;
      } else {
        return false;
      }
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || mouthW < 16) return false;

      const rx = clamp(mouthW * 0.78, side * 0.10, side * 0.19);
      const ry = clamp(mouthW * 0.52, side * 0.065, side * 0.13);
      const centerY = cy + mouthW * 0.08;
      for (let y = Math.max(0, Math.floor(centerY - ry * 1.15)); y < Math.min(side, Math.ceil(centerY + ry * 1.15)); y++) {
        const dy = (y - centerY) / ry;
        const row = y * side;
        for (let x = Math.max(0, Math.floor(cx - rx * 1.15)); x < Math.min(side, Math.ceil(cx + rx * 1.15)); x++) {
          const dx = (x - cx) / rx;
          const d2 = dx * dx + dy * dy;
          let value = 0;
          if (d2 <= 0.72) value = 1;
          else if (d2 < 1.15) {
            const t = (1.15 - d2) / 0.43;
            value = t * t * (3 - 2 * t);
          }
          if (value > max[row + x]) max[row + x] = value;
        }
      }
      return true;
    };

    for (let f = 0; f < nf; f += stride) {
      const frame = frames.subarray(f * FRAME_BYTES, (f + 1) * FRAME_BYTES);
      if (addMouthEllipse(await this.detectFace(frame))) used++;
    }
    if (!used) throw new Error('host mouth landmarks unavailable');

    // Feather only the outer 3-6 pixels. The core stays a full replacement;
    // generated pixels cannot spread into the surrounding high-res skin.
    const feather = Math.max(3, Math.round(side * 0.009));
    boxBlur3(max, side, side, feather);
    for (let i = 0; i < max.length; i++) max[i] = clamp(max[i] * 1.18, 0, 1);
    let cov = 0;
    for (let i = 0; i < max.length; i++) if (max[i] > 0.5) cov++;
    log(`landmark mouth mask: ${used}/${nf} samples (fps=2, stride=${stride}), coverage=${(cov / max.length * 100).toFixed(1)}%, feather=${feather}`);
    return max;
  }

  /** Blend the audio-driven face through the full-resolution mouth envelope.
   *  Color matching and a narrow feather keep the boundary seamless while
   *  generated pixels remain physically unable to alter cheeks or chin. */
  blendFace(frame, { sx1, sy1, side }, pred256, mask) {
    if (!this._predSide || this._predSide.length !== side * side * 3) this._predSide = Buffer.alloc(side * side * 3);
    const pr = resizeTo(pred256, FACE, FACE, 0, 0, FACE, FACE, side, side, this._predSide);
    const host = this._hostMaxMask;
    const hasHost = host && host.length === side * side;

    // ---- Step 2: lip-confidence map from Wav2Lip output ----
    // Dark regions in the predicted face = lip interior, mouth opening
    // These are the most reliable lip-sync pixels — boost their mask weight
    const lipConf = this._lipConf || (this._lipConf = new Float32Array(side * side));
    for (let y = 0; y < side; y++) {
      const rowS = y * side;
      for (let x = 0; x < side; x++) {
        const si = (rowS + x) * 3;
        const lum = (pr[si] + pr[si + 1] + pr[si + 2]) / 3;
        // Dark = lip interior → high confidence. Bright = teeth/skin → lower
        let conf;
        if (lum < 80) conf = 0.95;         // deep lip shadow / mouth interior
        else if (lum < 140) conf = 0.80;    // lip skin
        else if (lum < 200) conf = 0.55;    // light lip / teeth
        else conf = 0.30;                   // bright skin
        // Emphasize center of mouth region (y ≈ 60-75% height)
        const mouthCenter = 0.67;
        const yDist = Math.abs(y / side - mouthCenter);
        if (yDist < 0.08) conf = Math.min(1, conf + 0.15);
        lipConf[rowS + x] = conf;
      }
    }

    // Combine the landmark envelope with Wav2Lip confidence. Confidence may
    // strengthen pixels inside the envelope but can never expand its bounds.
    const combinedMask = this._blendMask && this._blendMask.length === side * side
      ? this._blendMask
      : (this._blendMask = new Float32Array(side * side));

    for (let i = 0; i < side * side; i++) {
      const mv = mask[i];
      const lc = lipConf[i];
      // v0.9.50 CRITICAL FIX — whole-face blur bug. The old formula
      // `Math.max(mv, mv * 0.7 + lc * 0.3)` evaluated to `0.3 * lc` where
      // mv == 0, leaking up to 0.285 mask weight into EVERY unmasked pixel
      // (lipConf is luminance-based over the whole crop: eyes, brows, nose
      // shadows → 0.95). After the k = 1-(1-mv)^2.5 curve that meant 21-57%
      // of the blurry 96x96 Wav2Lip upscale was mixed over the ENTIRE face —
      // the "脸部虚化" the user kept reporting. The lip-confidence may only
      // AMPLIFY coverage inside the existing mask, never create coverage:
      let cv = mv * (0.7 + 0.3 * lc);

      // Host max: if host has mouth here but pred doesn't, force coverage
      if (hasHost) {
        const hv = host[i];
        if (hv > 0.30 && cv < 0.40) {
          cv = Math.max(cv, 0.40 + hv * 0.40);
        }
      }
      combinedMask[i] = Math.min(1, cv);
    }

    // Blur the combined mask once for smoother boundaries
    boxBlur3(combinedMask, side, side, Math.max(3, Math.round(side * 0.012)));

    // ---- Step 5: local color matching (transfer mean+std from pred to host) ----
    // Compute stats of predicted region (weighted by mask)
    let sumGR = 0, sumGG = 0, sumGB = 0, sumOR = 0, sumOG = 0, sumOB = 0;
    let sqGR = 0, sqGG = 0, sqGB = 0, sqOR = 0, sqOG = 0, sqOB = 0, nOff = 0;
    for (let y = 0; y < side; y++) {
      const rowF = ((sy1 + y) * W + sx1) * 3;
      const rowS = y * side;
      for (let x = 0; x < side; x++) {
        const mv = combinedMask[rowS + x];
        if (mv <= 0.02) continue;
        const si = (rowS + x) * 3;
        const di = rowF + x * 3;
        const w = mv;
        sumGR += pr[si] * w; sumGG += pr[si + 1] * w; sumGB += pr[si + 2] * w;
        sqGR += pr[si] * pr[si] * w; sqGG += pr[si + 1] * pr[si + 1] * w; sqGB += pr[si + 2] * pr[si + 2] * w;
        sumOR += frame[di] * w; sumOG += frame[di + 1] * w; sumOB += frame[di + 2] * w;
        sqOR += frame[di] * frame[di] * w; sqOG += frame[di + 1] * frame[di + 1] * w; sqOB += frame[di + 2] * frame[di + 2] * w;
        nOff += w;
      }
    }
    let gainR = 1, gainG = 1, gainB = 1, offR = 0, offG = 0, offB = 0;
    if (nOff >= 48) {
      const ch = (sG, sG2, sO, sO2) => {
        const mG = sG / nOff, mO = sO / nOff;
        const sdG = Math.sqrt(Math.max(1, sG2 / nOff - mG * mG));
        const sdO = Math.sqrt(Math.max(1, sO2 / nOff - mO * mO));
        const gain = clamp(0.35 + 0.65 * (sdO / sdG), 0.60, 1.60);
        const off = clamp(mO - mG * gain, -60, 60);
        return [gain, off];
      };
      [gainR, offR] = ch(sumGR, sqGR, sumOR, sqOR);
      [gainG, offG] = ch(sumGG, sqGG, sumOG, sqOG);
      [gainB, offB] = ch(sumGB, sqGB, sumOB, sqOB);
    }

    // ---- Step 6: POISSON GRADIENT BLENDING ----
    // Instead of copying pixel colors, transfer the GRADIENT (spatial
    // derivative) of the predicted face into the original. This means:
    //   output(x,y) = original(x,y) + k * (predicted(x,y) - original(x,y))
    // where k is the mask value raised to a power for smooth falloff.
    // The gradient-preserving nature means edges (lip lines, teeth) stay
    // sharp while colors blend naturally.

    // First pass: compute predicted pixel values with color transfer applied
    const predAdj = this._predAdj || (this._predAdj = Buffer.alloc(side * side * 3));
    for (let i = 0; i < side * side; i++) {
      predAdj[i * 3] = clamp(pr[i * 3] * gainR + offR, 0, 255);
      predAdj[i * 3 + 1] = clamp(pr[i * 3 + 1] * gainG + offG, 0, 255);
      predAdj[i * 3 + 2] = clamp(pr[i * 3 + 2] * gainB + offB, 0, 255);
    }

    // Compute mask centroid for radial falloff
    let cmx = 0, cmy = 0, cw = 0;
    for (let y = 0; y < side; y++) {
      const row = y * side;
      for (let x = 0; x < side; x++) {
        const mv = combinedMask[row + x];
        if (mv > 0.10) { cmx += x * mv; cmy += y * mv; cw += mv; }
      }
    }
    if (cw > 0) { cmx /= cw; cmy /= cw; }

    // Poisson gradient blending with radial host bias
    for (let y = 0; y < side; y++) {
      const rowF = ((sy1 + y) * W + sx1) * 3;
      const rowS = y * side;
      for (let x = 0; x < side; x++) {
        let mv = combinedMask[rowS + x];
        if (mv <= 0.003) continue;
        const si = (rowS + x) * 3;
        const di = rowF + x * 3;

        const origR = frame[di], origG = frame[di + 1], origB = frame[di + 2];
        const predR = predAdj[si], predG = predAdj[si + 1], predB = predAdj[si + 2];

        // v0.9.46: single smooth-step curve — FULL prediction in the mask core
        // (mv≥0.75 → k≈1, crisp lips) with a narrow feather at the boundary.
        // The old mv^0.6 / mv^1.5 two-branch mix diluted the mouth interior
        // with host pixels, which read as 虚化 (blur) even before upscaling.
        const k = 1 - Math.pow(1 - mv, 2.5);
        let r = origR + (predR - origR) * k;
        let g = origG + (predG - origG) * k;
        let b = origB + (predB - origB) * k;

        // v0.9.45 ghost-mouth guard: at host-max covered pixels where
        // predicted mask is thin, ensure full coverage by boosting the
        // mask weight so the predicted face fully replaces the host
        if (hasHost) {
          const hv = host[rowS + x];
          if (hv > 0.35 && mv < 0.50) {
            const ghostK = clamp((hv - 0.35) / 0.45, 0.30, 0.85);
            r = predR * ghostK + origR * (1 - ghostK);
            g = predG * ghostK + origG * (1 - ghostK);
            b = predB * ghostK + origB * (1 - ghostK);
            mv = Math.max(mv, 0.60);
          }
        }

        // v0.9.46: radial host-bias only near the mask BOUNDARY (mv<0.6) —
        // the core must stay pure prediction or the mouth reads soft again
        if (cw > 0 && mv < 0.6) {
          const dr2 = (x - cmx) ** 2 + (y - cmy) ** 2;
          const maxR2 = (side * 0.28) ** 2;
          const t = clamp(dr2 / maxR2, 0, 1);
          const hostBias = 0.30 * t * t * (1 - mv / 0.6);
          r = r * (1 - hostBias) + origR * hostBias;
          g = g * (1 - hostBias) + origG * hostBias;
          b = b * (1 - hostBias) + origB * hostBias;
        }

        frame[di] = clamp(r, 0, 255);
        frame[di + 1] = clamp(g, 0, 255);
        frame[di + 2] = clamp(b, 0, 255);
      }
    }

    // ---- Step 7: post-process sharpening on lip region ----
    // v0.9.46: skip when GFPGAN restoration is active — it rebuilds true
    // high-frequency detail; unsharp on top would over-sharpen (halos)
    if (!this.sessions.gfpgan) this.sharpenLipRegion(frame, combinedMask, sx1, sy1, side);
  }

  /** v0.9.45 NEW: sharpen lip region after blending to counteract
   *  the softness from upscaling 96x96 Wav2Lip output.
   *  Uses unsharp-mask style: sharp = orig + amount * (orig - blurred).
   *  Only applied inside the mask region, and stronger at mask center. */
  sharpenLipRegion(frame, mask, sx1, sy1, side, options = {}) {
    const blurScale = options.blurScale ?? 0.015;
    const maxAmount = options.amount ?? 1.2;
    const minMask = options.minMask ?? 0.15;
    const blurR = Math.max(2, Math.round(side * blurScale));
    const blurred = this._sharpenBuf || (this._sharpenBuf = new Float32Array(side * side));

    for (let ch = 0; ch < 3; ch++) {
      // Extract channel into temp buffer
      const channel = this._sharpenCh1 || (this._sharpenCh1 = new Float32Array(side * side));
      for (let y = 0; y < side; y++) {
        const rowF = ((sy1 + y) * W + sx1) * 3;
        const rowS = y * side;
        for (let x = 0; x < side; x++) {
          channel[rowS + x] = frame[rowF + x * 3 + ch];
        }
      }
      // Box blur the channel
      const blurredCh = this._sharpenCh2 || (this._sharpenCh2 = new Float32Array(side * side));
      blurredCh.set(channel);
      boxBlur3(blurredCh, side, side, blurR);

      // Apply unsharp mask inside mask region
      for (let y = 0; y < side; y++) {
        const rowF = ((sy1 + y) * W + sx1) * 3;
        const rowS = y * side;
        for (let x = 0; x < side; x++) {
          const mv = mask[rowS + x];
          if (mv < minMask) continue;
          const orig = channel[rowS + x];
          const blr = blurredCh[rowS + x];
          const detail = orig - blr;
          // Amount: stronger at mask center, weaker at edges
          const amount = maxAmount * mv;
          const sharp = orig + detail * amount;
          frame[rowF + x * 3 + ch] = clamp(sharp, 0, 255);
        }
      }
    }
  }

  /** v0.9.46: align the current frame's face into FFHQ-512 space (this._gfSrc).
   *  Uses the landmark-based similarity warp locked on first detection; falls
   *  back to a plain bilinear crop resize when landmarks were unavailable. */
  _alignFrame(frame, { sx1, sy1, side }) {
    const S = GFDIM;
    if (!this._gfSrc) this._gfSrc = Buffer.alloc(S * S * 3);
    if (this._gfWarpIn) warpAffineInto(frame, W, H, this._gfSrc, S, S, this._gfWarpIn);
    else resizeTo(frame, W, H, sx1, sy1, side, side, S, S, this._gfSrc);
  }

  /** v0.9.46 / v0.9.49: run the face-restoration model on the aligned crop,
   *  write the restored face into this._gfOut (FFHQ-512 RGB).
   *
   *  Detects the model at runtime by inspecting the input signature:
   *  - GFPGAN 1.4 (v0.9.46): single input "input", normalization = (x/255-0.5)/0.5
   *  - CodeFormer (v0.9.49): two inputs "input" + "w", normalization = x/127.5-1,
   *    "w" controls restoration fidelity. Smaller values favor reconstruction
   *    quality; larger values preserve more of the degraded input. A balanced
   *    0.45 is used because the source is an upscaled 96px mouth crop.
   */
  async _runGfpgan() {
    const S = GFDIM, N = S * S;
    if (!this._gfIn) this._gfIn = new Float32Array(3 * N);
    const x = this._gfIn;
    // normalization (x - 0.5) / 0.5 = x/127.5 - 1
    for (let i = 0; i < N; i++) {
      x[i] = this._gfSrc[i * 3] / 127.5 - 1;
      x[N + i] = this._gfSrc[i * 3 + 1] / 127.5 - 1;
      x[2 * N + i] = this._gfSrc[i * 3 + 2] / 127.5 - 1;
    }
    const names = this.sessions.gfpgan.inputNames;
    const isCodeformer = names.length >= 2 && names.includes('w');
    const feed = {};
    feed[names[0]] = new Tensor('float32', x, [1, 3, S, S]);
    if (isCodeformer) {
      // find the w input name (it could be 'w' or the second input)
      const wName = names.includes('w') ? 'w' : names[1];
      // CodeFormer documents lower w as higher reconstruction quality and
      // higher w as greater input fidelity. Since only the landmark-bounded
      // mouth is composited back, 0.45 can restore texture without repainting
      // the rest of the identity.
      feed[wName] = new Tensor('float64', Float64Array.from([CODEFORMER_WEIGHT]), []);
    }
    const out = await this.sessions.gfpgan.run(feed);
    const d = Object.values(out)[0].data;
    const res = this._gfOut || (this._gfOut = Buffer.alloc(N * 3));
    for (let i = 0; i < N; i++) {
      res[i * 3] = clamp((d[i] + 1) * 127.5, 0, 255);
      res[i * 3 + 1] = clamp((d[N + i] + 1) * 127.5, 0, 255);
      res[i * 3 + 2] = clamp((d[2 * N + i] + 1) * 127.5, 0, 255);
    }
  }

  /** v0.9.46: warp the FFHQ-512 restored face back to crop size (this._gfSide) */
  _warpBackToCrop(side) {
    const S = GFDIM;
    if (!this._gfSide || this._gfSide.length !== side * side * 3) {
      this._gfSide = Buffer.alloc(side * side * 3);
    }
    if (this._gfWarpOut) warpAffineInto(this._gfOut, S, S, this._gfSide, side, side, this._gfWarpOut);
    else resizeTo(this._gfOut, S, S, 0, 0, S, S, side, side, this._gfSide);
    return this._gfSide;
  }

  /** v0.9.46 NEW: composite the GFPGAN-restored face back into the frame.
   *  Uses the same feathered lower-face mask as blendFace so only the
   *  lip-sync region adopts the restored (sharp) pixels — eyes, brows and
   *  hair remain 100% original host pixels (no identity drift).
   *  A weighted mean/std color match keeps the restored region tone-locked
   *  to the surrounding host skin so the restoration never reads as a patch. */
  compositeRestored(frame, { sx1, sy1, side }, restored, mask) {
    // --- weighted color stats: restored vs current frame, over the mask ---
    let sumGR = 0, sumGG = 0, sumGB = 0, sumOR = 0, sumOG = 0, sumOB = 0;
    let sqGR = 0, sqGG = 0, sqGB = 0, sqOR = 0, sqOG = 0, sqOB = 0, wSum = 0;
    for (let y = 0; y < side; y++) {
      const rowF = ((sy1 + y) * W + sx1) * 3;
      const rowS = y * side;
      for (let x = 0; x < side; x++) {
        const mv = mask[rowS + x];
        if (mv <= 0.05) continue;
        const si = (rowS + x) * 3;
        const di = rowF + x * 3;
        sumGR += restored[si] * mv; sumGG += restored[si + 1] * mv; sumGB += restored[si + 2] * mv;
        sqGR += restored[si] * restored[si] * mv; sqGG += restored[si + 1] * restored[si + 1] * mv; sqGB += restored[si + 2] * restored[si + 2] * mv;
        sumOR += frame[di] * mv; sumOG += frame[di + 1] * mv; sumOB += frame[di + 2] * mv;
        sqOR += frame[di] * frame[di] * mv; sqOG += frame[di + 1] * frame[di + 1] * mv; sqOB += frame[di + 2] * frame[di + 2] * mv;
        wSum += mv;
      }
    }
    let gainR = 1, gainG = 1, gainB = 1, offR = 0, offG = 0, offB = 0;
    if (wSum >= 48) {
      const ch = (sG, sG2, sO, sO2) => {
        const mG = sG / wSum, mO = sO / wSum;
        const sdG = Math.sqrt(Math.max(1, sG2 / wSum - mG * mG));
        const sdO = Math.sqrt(Math.max(1, sO2 / wSum - mO * mO));
        // gentle: keep the restoration's own contrast, match the tone
        const gain = clamp(0.65 + 0.35 * (sdO / sdG), 0.80, 1.25);
        const off = clamp(mO - mG * gain, -24, 24);
        return [gain, off];
      };
      [gainR, offR] = ch(sumGR, sqGR, sumOR, sqOR);
      [gainG, offG] = ch(sumGG, sqGG, sumOG, sqOG);
      [gainB, offB] = ch(sumGB, sqGB, sumOB, sqOB);
    }
    // --- composite: GFPGAN replaced at high mask weight, narrow feather ---
    // v0.9.47 FIX: previous k curve capped at 0.34-0.44 inside the mouth
    // ellipse, leaving the blurry host 56-66% in the final mix — that's why
    // the user still saw blur after v0.9.46. The fix:
    //   * 100% restored pixel for mv >= 0.50 (covers the landmark envelope core,
    //     including the lip border and oral cavity)
    //   * narrow 4px-equivalent feather (0.50 → 0.20) for the outer band
    //   * removed radial host bias (it was biasing toward blur inside this
    //     band, undoing GFPGAN's work)
    for (let y = 0; y < side; y++) {
      const rowF = ((sy1 + y) * W + sx1) * 3;
      const rowS = y * side;
      for (let x = 0; x < side; x++) {
        const mv = mask[rowS + x];
        if (mv <= 0.004) continue;
        const si = (rowS + x) * 3;
        const di = rowF + x * 3;
        const rr = clamp(restored[si] * gainR + offR, 0, 255);
        const rg = clamp(restored[si + 1] * gainG + offG, 0, 255);
        const rb = clamp(restored[si + 2] * gainB + offB, 0, 255);
        let k;
        if (mv >= 0.50) k = 1;
        else if (mv <= 0.20) k = 0;
        else {
          const t = (mv - 0.20) / 0.30;
          k = t * t * (3 - 2 * t); // smoothstep, narrow feather
        }
        frame[di] = clamp(frame[di] * (1 - k) + rr * k, 0, 255);
        frame[di + 1] = clamp(frame[di + 1] * (1 - k) + rg * k, 0, 255);
        frame[di + 2] = clamp(frame[di + 2] * (1 - k) + rb * k, 0, 255);
      }
    }
  }

  /** full synthesis pipeline */
  async synthesize({ hostVideo, script, voice, locale = 'zh-CN', outPath, workDir, onProgress, overlays = [], productImages = [] }) {
    const self = this;
    const localProducts = (productImages || [])
      .filter((productPath) => typeof productPath === 'string' && fs.existsSync(productPath));
    if (localProducts.length) {
      throw new Error('Local product overlays are disabled. Use Product Avatar generation for real product holding.');
    }
    fs.mkdirSync(workDir, { recursive: true });
    this._mouthBank = null;
    this._mouthBankPrev = null;
    this._mouthTargetEma = null;
    this._mouthPrevDesc = null;
    this._mouthSelectTick = 0;
    this._audioEnv = null;
    // 1. TTS — v0.9.40: kokoro LOCAL neural voice FIRST (natural, fully
    //    offline, immune to the edge-tts 403/network flakiness that left users
    //    with the robotic macOS `say` fallback). edge-tts second (covers
    //    locales kokoro can't speak), macOS say as last resort.
    onProgress && onProgress({ stage: 'tts', pct: 0 });
    const ttsRaw = path.join(workDir, 'narration_raw.mp3');
    const ttsPath = path.join(workDir, 'narration.mp3');
    let ttsEngineUsed = 'kokoro';
    const kokoroSid = pickKokoroSid(locale, this.gender);
    if (kokoroSid !== null) {
      try {
        log('trying kokoro local tts, sid:', kokoroSid);
        await kokoroTts(script, kokoroSid, this.modelsDir, ttsRaw, this.ffmpegPath);
      } catch (e) {
        log('kokoro failed (' + e.message + '), trying edge-tts');
        ttsEngineUsed = 'edge';
      }
    } else {
      ttsEngineUsed = 'edge';
    }
    if (ttsEngineUsed === 'edge') {
      try {
        const edgeVoice = voice || pickEdgeVoice(locale, this.gender);
        log('trying edge-tts voice:', edgeVoice);
        // 20s cap — a hung WS must not stall the whole generation
        await Promise.race([
          edgeTts(script, edgeVoice, locale, ttsRaw, { proxy: this.proxy }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout after 20s')), 20000)),
        ]);
      } catch (e) {
        log('edge-tts failed (' + e.message + '), falling back to macOS say');
        ttsEngineUsed = 'say';
        await sayTts(pickSayVoice(locale, this.gender), script, ttsRaw, this.ffmpegPath);
      }
    }
    // post-process: `say` output gets tempo+EQ to compensate its robotic feel;
    // neural voices (kokoro/edge) are left at natural pace — loudnorm only.
    {
      const { execFile } = require('child_process');
      const afFilter = ttsEngineUsed === 'say'
        ? 'atempo=1.04,equalizer=f=3000:t=o:w=1:g=3,loudnorm=I=-16:LRA=11:TP=-1.5'
        : 'loudnorm=I=-16:LRA=11:TP=-1.5';
      await new Promise((resolve, reject) => {
        execFile(this.ffmpegPath, ['-y', '-i', ttsRaw, '-af', afFilter, '-ar', '24000', '-ac', '1', '-b:a', '96k', ttsPath], { timeout: 60000 }, (err) => (err ? reject(err) : resolve()));
      });
      fs.unlinkSync(ttsRaw);
    }
    log('tts engine:', ttsEngineUsed);
    const pcm = await decodePcm16k(this.ffmpegPath, ttsPath);
    const dur = pcm.length / 16000;
    log(`tts done: ${dur.toFixed(2)}s, ${pcm.length} samples`);

    // 2. mel (v0.9.38: contrast-boosted so the mouth articulates every syllable)
    const melT = await this.computeMel(pcm);
    const melData = this.boostMelContrast(melT.data, melT.dims[2]);
    const T = melT.dims[2];
    const totalFrames = Math.max(2, Math.ceil(dur * FPS));
    // v0.9.53: audio envelope for the silence/loudness pose gate
    this._audioEnv = computeAudioEnv(pcm, totalFrames);
    log(`mel T=${T}, frames=${totalFrames}`);

    // 3. ffmpeg A: loop host video -> rawvideo stdout
    const ffA = runFfmpeg(this.ffmpegPath, [
      '-stream_loop', '-1', '-i', hostVideo,
      '-t', (dur + 0.2).toFixed(3),
      '-vf', `fps=${FPS},scale=${W}:${H}`,
      '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    // 4. ffmpeg B: rawvideo stdin + narration + overlays -> h264
    //    inputs: 0=rawvideo, 1=tts audio, 2..N=product images (-loop 1)
    const textOvs = overlays.filter((o) => o.type === 'text');
    const imgOvs = overlays.filter((o) => o.type === 'image' && fs.existsSync(o.path || ''));
    const args = [
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
      '-i', ttsPath,
    ];
    for (const im of imgOvs) args.push('-loop', '1', '-t', (dur + 0.5).toFixed(3), '-i', im.path);

    const textChain = textOvs.map((t) => buildOverlayFilter(t)).join(',');
    if (!imgOvs.length) {
      if (textChain) args.push('-filter_complex', `[0:v]${textChain}[v]`, '-map', '[v]', '-map', '1:a');
      else args.push('-map', '0:v', '-map', '1:a');
    } else {
      // [0:v]drawtexts[vt]; [vt][2:v]overlay[vo0]; [vo0][3:v]overlay[v]
      let filter = textChain ? `[0:v]${textChain}[vt]` : '[0:v]null[vt]';
      let prev = '[vt]';
      imgOvs.forEach((im, k) => {
        const inIdx = 2 + k;
        const fromS = (im.from ?? 0).toFixed(3), toS = (im.to ?? 999).toFixed(3);
        const xExpr = im.x != null ? String(im.x).replace(/'/g, '') : '(w-overlay_w)/2';
        const yExpr = im.y != null ? String(im.y).replace(/'/g, '') : '140';
        const last = k === imgOvs.length - 1;
        filter += `;[${inIdx}:v]scale=${im.w || 360}:-1[img${k}]`;
        filter += `;${prev}[img${k}]overlay=x='${xExpr}':y='${yExpr}':enable='between(t,${fromS},${toS})'${last ? '[v]' : `[vo${k}]`}`;
        prev = last ? '[v]' : `[vo${k}]`;
      });
      args.push('-filter_complex', filter, '-map', '[v]', '-map', '1:a');
    }
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
      '-shortest', '-movflags', '+faststart', '-y', outPath);
    // IMPORTANT: stderr must NOT be a pipe — onnx inference blocks the JS thread for
    // hundreds of ms per frame; an unconsumed stderr pipe fills up (64KB) and blocks
    // ffmpeg internally -> it stops reading stdin -> EPIPE deadlock. Write to file instead.
    const ffBlogFd = fs.openSync(path.join(workDir, 'ffB.log'), 'w');
    const ffB = runFfmpeg(this.ffmpegPath, args, { stdio: ['pipe', 'ignore', ffBlogFd] });
    let ffBExit = null;
    ffB.on('close', (code, signal) => { ffBExit = { code, signal }; });
    ffB.on('error', () => {});
    ffB.stdin.on('error', (e) => { try { failLoop(new Error('ffmpeg stdin: ' + e.message)); } catch (_) {} });

    // 5. streaming frame loop
    let frameIdx = 0;
    let lastReport = Date.now();
    let crop = null;            // fixed square crop for whole video (host framing stable)
    let detRetry = 0;
    const DET_RETRY_MAX = 20;   // if no face in first frames, retry every 12 frames
    // v0.9.40 lip-sync alignment: the narration track starts at t=0 in the
    // muxed output, so the mouth for frame N MUST be driven by the mel at the
    // audio file's ABSOLUTE time N/FPS. The old code subtracted the measured
    // audio-onset frame from the mel index, which made the mouth lag the
    // voice by exactly the leading-silence duration (100-300ms — clearly
    // audible as "voice and lips not aligned"). Leading silence needs no
    // special handling: its mel rows are ~0, and wav2lip keeps the mouth
    // closed on silent mel. Onset is now logged for diagnostics only.
    const onsetSamples = detectAudioOnset(pcm, 16000, 0.030, 30);
    log(`audio onset (diagnostic): ${(onsetSamples / 16000 * 1000).toFixed(0)}ms`);

    const processFrame = async (frame) => {
      if (!crop) {
        const det = await self.detectFace(frame);
        if (!det) {
          detRetry++;
          if (detRetry >= DET_RETRY_MAX) throw new Error('no face detected in host video');
          await writeFrame(frame);
          return;
        }
        crop = self.squareCrop(det.box);
        log('face crop fixed:', JSON.stringify(crop));
        // v0.9.52: build the natural high-resolution mouth pose bank once.
        // Failure is fatal; silently falling back to 96px generated pixels
        // would reintroduce the exact blur this pipeline is designed to stop.
        await self.buildHostMouthBank(hostVideo, crop, det);
      }
      const { sx1, sy1, side } = crop;
      const curFace = resizeTo(frame, W, H, sx1, sy1, side, side, FACE, FACE);
      // absolute-time mel indexing (fillMelChunk zero-pads before audio start)
      const melChunk = self.fillMelChunk(melData, T, frameIdx);
      const pred = await self.lipSync(melChunk, curFace);
      if (!self.compositeHostMouth(frame, pred, frameIdx)) throw new Error('HD mouth retrieval unavailable');
      await writeFrame(frame);
    };

    const writeFrame = async (frame) => {
      frameIdx++;
      const now = Date.now();
      if (frameIdx % 12 === 0 || frameIdx === totalFrames) {
        if (now - lastReport > 400 || frameIdx === totalFrames) {
          onProgress && onProgress({ stage: 'render', pct: Math.min(0.99, frameIdx / totalFrames), frame: frameIdx, total: totalFrames });
          lastReport = now;
        }
      }
      const ok = ffB.stdin.write(frame);
      if (!ok) await new Promise((r) => ffB.stdin.once('drain', r));
      if (frameIdx >= totalFrames) {
        ffA.stdout.removeAllListeners('readable');
        // SIGTERM is NOT enough: ffA is typically blocked writing into the full stdout
        // pipe; ffmpeg's graceful-shutdown handler tries to finish that write first and
        // hangs forever -> the Node process never exits. SIGKILL is safe here — we no
        // longer need ffA's output.
        ffA.kill('SIGKILL');
        ffB.stdin.end();
        resolveLoop();
      }
    };

    let resolveLoop = null;
    const loopDone = new Promise((res) => { resolveLoop = res; });

    let processing = false;
    ffA.stdout.on('readable', async () => {
      if (processing) return;
      processing = true;
      try {
        while (frameIdx < totalFrames) {
          const frame = ffA.stdout.read(FRAME_BYTES);
          if (!frame) break;
          await processFrame(frame);
        }
      } catch (e) {
        try {
          ffA.stdout.removeAllListeners('readable');
          ffA.kill('SIGKILL');
          ffB.kill('SIGKILL');
        } catch (_) {}
        failLoop(e);
      }
      processing = false;
    });

    let failLoop = (e) => {};
    const loopFail = new Promise((_r, rej) => { failLoop = rej; });

    // rejectLoop must exist before any readable event can fire
    await Promise.race([loopDone, loopFail]);

    await new Promise((resolve, reject) => {
      const finish = (code) => {
        let tail = '';
        try { tail = fs.readFileSync(path.join(workDir, 'ffB.log'), 'utf8').slice(-700); } catch (_) {}
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg encode failed (code=${code}): ${tail}`));
      };
      // 'close' may have fired while we were awaiting the frame loop — check cached exit first
      if (ffBExit) return finish(ffBExit.code);
      ffB.on('close', (code) => finish(code));
      // safety: if ffB already exited with no event able to fire, finish via cached flag shortly
      const iv = setInterval(() => {
        if (ffBExit) { clearInterval(iv); finish(ffBExit.code); }
      }, 200);
      setTimeout(() => { clearInterval(iv); try { if (ffBExit) finish(ffBExit.code); else finish(-1); } catch (_) {} }, 120000).unref();
    });
    onProgress && onProgress({ stage: 'done', pct: 1, outPath });
    return outPath;
  }
}

/** find an available CJK-capable system font (macOS 26 removed PingFang.ttc) */
function findCjkFont() {
  const candidates = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/System/Library/Fonts/Songti.ttc',
    '/System/Library/Fonts/Supplemental/Songti.ttc',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  ];
  for (const f of candidates) {
    try { if (fs.existsSync(f)) return f; } catch (_) {}
  }
  return null;
}

/** overlay filter builder: {type:'text', from, to, text} | {type:'image', from, to, path, x, y, w} */
function buildOverlayFilter(ov) {
  const fromS = (ov.from ?? 0).toFixed(3), toS = (ov.to ?? 999).toFixed(3);
  if (ov.type === 'text') {
    const txt = String(ov.text).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019").replace(/%/g, '\\%');
    const font = ov.fontFile || findCjkFont();
    if (!font) throw new Error('no CJK font found on this system');
    const size = ov.size || 44;
    const color = ov.color || 'white';
    const boxColor = ov.box || 'black@0.55';
    const yExpr = ov.y ? `${ov.y}` : 'h-th-120';
    return `drawtext=fontfile='${font}':text='${txt}':fontcolor=${color}:fontsize=${size}:box=1:boxcolor=${boxColor}:boxborderw=18:x=(w-tw)/2:y=${yExpr}:enable='between(t,${fromS},${toS})'`;
  }
  if (ov.type === 'image') {
    // assumes overlay image already sized; position by expressions
    return `overlay=x='${ov.x ?? 0}':y='${ov.y ?? 0}':enable='between(t,${fromS},${toS})'`;
  }
  throw new Error('unknown overlay type ' + ov.type);
}

module.exports = {
  RealHumanEngine,
  edgeTts,
  kokoroTts,
  sayTts,
  pickKokoroSid,
  sherpaTtsBin,
  decodePcm16k,
  detectAudioOnset,
  umeyama: null,
  buildOverlayFilter,
  pickEdgeVoice,
  pickSayVoice,
};

/** detect onset (first sample where RMS energy exceeds threshold
 *  SUSTAINEDLY for minSustainMs). Returns sample index (int).
 *  v0.9.39: adaptive threshold (12% of peak), sustained detection to avoid
 *  picking up transients, and returns onset relative to the actual speech start. */
function detectAudioOnset(pcm, sr, _threshold = 0.010, winMs = 20) {
  const win = Math.max(1, Math.round((winMs / 1000) * sr));
  const n = pcm.length;
  const limit = Math.min(n, sr * 3);
  const minSustain = Math.max(win, Math.round(0.05 * sr)); // 50ms sustained
  // find peak RMS in first 3s for adaptive threshold
  let peakRms = 0;
  {
    let sum = 0;
    for (let i = 0; i < Math.min(win, limit); i++) sum += pcm[i] * pcm[i];
    for (let i = 0; i < limit; i++) {
      if (i >= win) sum -= pcm[i - win] * pcm[i - win];
      if (i + win < n) sum += pcm[i + win] * pcm[i + win];
      const rms = Math.sqrt(sum / win);
      if (rms > peakRms) peakRms = rms;
    }
  }
  const threshold = Math.max(0.008, peakRms * 0.12);
  // sustained onset: count consecutive frames above threshold
  let sum = 0;
  let sustainCount = 0;
  for (let i = 0; i < limit; i++) {
    if (i >= win) sum -= pcm[i - win] * pcm[i - win];
    if (i + win < n) sum += pcm[i + win] * pcm[i + win];
    const rms = Math.sqrt(sum / win);
    if (rms > threshold) {
      sustainCount += win;
      if (sustainCount >= minSustain) return Math.max(0, i - win - Math.round(minSustain / 2));
    } else {
      sustainCount = Math.max(0, sustainCount - win);
    }
  }
  return 0;
}

// ----------------------------------------------------------------------------
// held-product composition (v0.9.36)
// The product is a matte rounded "photo card" auto-cropped out of any white
// background, anchored face-aware (never crossing the face), gripped by a
// skin-tone hand and gently presented toward the camera — reads as genuinely
// held while explaining.
// ----------------------------------------------------------------------------

/** render product image -> rounded matte "photo card" RGBA (one-time per card).
 *  Amazon-style shots have near-white backgrounds; the product is auto-cropped
 *  out of the white field and centered, so the card reads as a physical product
 *  photo instead of a giant white slab. */
async function renderProductCard(ffmpegPath, imgPath, workDir, tag) {
  const S = 480; // decode/analysis resolution
  const out = path.join(workDir, `card-${tag}.rgb`);
  await new Promise((resolve, reject) => {
    const p = runFfmpeg(ffmpegPath, [
      '-y', '-i', imgPath,
      '-vf', `scale=${S}:${S}:force_original_aspect_ratio=decrease,pad=${S}:${S}:(ow-iw)/2:(oh-ih)/2:color=white,format=rgb24`,
      '-frames:v', '1', '-f', 'rawvideo', out,
    ], { stdio: ['ignore', 'ignore', 'ignore'] });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('card render exit ' + code))));
    p.on('error', reject);
  });
  const src = fs.readFileSync(out);
  if (src.length !== S * S * 3) throw new Error(`card decode size mismatch: ${src.length}`);

  // -- white-background content detection: bbox of non-bg pixels
  let bgCount = 0;
  const isBg = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const r = src[i * 3], g = src[i * 3 + 1], b = src[i * 3 + 2];
    const bg = r > 240 && g > 240 && b > 240;
    isBg[i] = bg ? 1 : 0;
    if (bg) bgCount++;
  }
  let bx = 0, by = 0, bw = S, bh = S;
  const bgRatio = bgCount / (S * S);
  if (bgRatio > 0.22) {
    // content bbox (product) — trim the white field around it
    let x0 = S, y0 = S, x1 = 0, y1 = 0, content = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (!isBg[y * S + x]) {
          content++;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (content > S * S * 0.03 && content < S * S * 0.88) {
      // 10% breathing margin around the product
      const mx = Math.round((x1 - x0 + 1) * 0.10), my = Math.round((y1 - y0 + 1) * 0.10);
      bx = Math.max(0, x0 - mx); by = Math.max(0, y0 - my);
      bw = Math.min(S, x1 + 1 + mx) - bx; bh = Math.min(S, y1 + 1 + my) - by;
    }
  }

  // -- compose CARD_CONTENT x CARD_CONTENT product area (aspect-fit, centered)
  const scale = Math.min(CARD_CONTENT / bw, CARD_CONTENT / bh);
  const dw = Math.max(8, Math.round(bw * scale)), dh = Math.max(8, Math.round(bh * scale));
  const fitted = resizeTo(src, S, S, bx, by, bw, bh, dw, dh);
  const pad = (HELD_CARD - CARD_CONTENT) / 2;
  const dx = pad + ((CARD_CONTENT - dw) >> 1), dy = pad + ((CARD_CONTENT - dh) >> 1);

  // -- build RGBA card: matte base + product + rounded corners + inner edge
  const rgba = Buffer.alloc(HELD_CARD * HELD_CARD * 4);
  const R = 20; // corner radius
  const alphaAt = (x, y) => {
    const cx = Math.min(Math.max(x, R), HELD_CARD - 1 - R);
    const cy = Math.min(Math.max(y, R), HELD_CARD - 1 - R);
    const d = Math.hypot(x - cx, y - cy); // 0 inside straight edges; >R outside corners
    if (d <= R - 1) return 255;
    if (d >= R + 1) return 0;
    return Math.round(255 * (R + 1 - d) / 2);
  };
  for (let y = 0; y < HELD_CARD; y++) {
    for (let x = 0; x < HELD_CARD; x++) {
      const i = (y * HELD_CARD + x) * 4;
      const a = alphaAt(x, y);
      if (a === 0) continue;
      let r = CARD_BG[0], g = CARD_BG[1], b = CARD_BG[2];
      // inner border stroke: 2px ring inside the rounded edge
      const ring = (x < 2.5 || x > HELD_CARD - 3.5 || y < 2.5 || y > HELD_CARD - 3.5);
      if (ring && a > 200) { r = CARD_EDGE[0]; g = CARD_EDGE[1]; b = CARD_EDGE[2]; }
      // product pixels
      if (x >= dx && x < dx + dw && y >= dy && y < dy + dh) {
        const si = ((y - dy) * dw + (x - dx)) * 3;
        r = fitted[si]; g = fitted[si + 1]; b = fitted[si + 2];
      }
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
    }
  }
  return rgba;
}

/** rotate an RGBA sprite by deg (bilinear, transparent fill) — one-time per card */
function rotateRgba(src, w, h, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const nw = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin));
  const nh = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos));
  const dst = Buffer.alloc(nw * nh * 4);
  const cx = w / 2, cy = h / 2, ncx = nw / 2, ncy = nh / 2;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const dx = x + 0.5 - ncx, dy = y + 0.5 - ncy;
      const sx = cos * dx + sin * dy + cx - 0.5;
      const sy = -sin * dx + cos * dy + cy - 0.5;
      if (sx < 0 || sx >= w - 1 || sy < 0 || sy >= h - 1) continue;
      const x0 = sx | 0, y0 = sy | 0;
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4;
      const di = (y * nw + x) * 4;
      for (let c = 0; c < 4; c++) {
        dst[di + c] = (src[i00 + c] * (1 - fx) * (1 - fy)
          + src[i10 + c] * fx * (1 - fy)
          + src[i01 + c] * (1 - fx) * fy
          + src[i11 + c] * fx * fy) | 0;
      }
    }
  }
  return { buf: dst, w: nw, h: nh };
}

/** soft shadow sprite from a rotated card (box-blurred alpha, black) */
function makeShadowSprite(sprite, strength = 0.32, blur = 8) {
  const { buf, w, h } = sprite;
  let a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = buf[i * 4 + 3] / 255;
  for (let pass = 0; pass < 2; pass++) a = boxBlurAlpha(a, w, h, blur);
  const s = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    s[i * 4] = 0; s[i * 4 + 1] = 0; s[i * 4 + 2] = 0;
    s[i * 4 + 3] = Math.round(255 * a[i] * strength);
  }
  return { buf: s, w, h };
}

function boxBlurAlpha(a, w, h, r) {
  const t = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      t[row + x] = acc / (2 * r + 1);
      acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
    }
  }
  const o = new Float32Array(a.length);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += t[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      o[y * w + x] = acc / (2 * r + 1);
      acc += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x];
    }
  }
  return o;
}

/** per-frame card alpha: fade 0.35s at segment boundaries + slide offset (px)
 *  entering card rises from below, exiting card sinks away — the motion masks
 *  the crossfade so fingers never visibly "pass through" a static overlay */
function cardFade(t, from, to) {
  const fi = Math.min(1, (t - from) / 0.35);
  const fo = Math.min(1, (to - t) / 0.35);
  // slide: entering card starts 36px low and rises; exiting card sinks 36px —
  // the motion masks the crossfade so fingers never visibly "pass through"
  return { alpha: Math.max(0, Math.min(fi, fo)), slide: 36 * (2 - fi - fo) };
}

/** sample host skin tone from the mid-face band (cheeks) of an original frame;
 *  used to color the hand grip so it matches the presenter */
function sampleSkinTone(frame, box) {
  const [fx1, fy1, fx2, fy2] = box;
  const fw = fx2 - fx1, fh = fy2 - fy1;
  const y0 = Math.round(fy1 + fh * 0.42), y1 = Math.round(fy1 + fh * 0.62);
  const x0 = Math.round(fx1 + fw * 0.15), x1 = Math.round(fx1 + fw * 0.85);
  const pts = [];
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 3;
      const r = frame[i], g = frame[i + 1], b = frame[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luma < 60 || luma > 235) continue; // skip shadow/blowout
      pts.push([r, g, b, luma]);
    }
  }
  if (!pts.length) return [226, 172, 150];
  pts.sort((a, b) => a[3] - b[3]);
  const lo = pts.length >> 2, hi = pts.length - lo; // middle 50% -> robust mean
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = lo; i < hi; i++) { sr += pts[i][0]; sg += pts[i][1]; sb += pts[i][2]; n++; }
  return [sr / n, sg / n, sb / n];
}

// ----------------------------------------------------------------------------
// procedural presenter grip (v0.9.53)
// The host video has no visible hands, so the grip is drawn per frame:
//   - sleeve forearm in the host's CLOTHING tone, running from the frame
//     bottom up to the wrist (reads as the presenter's own bent arm);
//   - palm heel behind the card;
//   - four shaded fingertips + thumb wrapping over the card's front edges
//     (contact shadows, knuckle creases, nails) in the host's skin tone.
// ----------------------------------------------------------------------------

/** robust clothing-tone sample from the host's torso band below the face;
 *  blends toward a neutral dark blazer when the region reads as bare skin
 *  or is too bright to be fabric */
function sampleClothTone(frame, box) {
  const [fx1, fy1, fx2, fy2] = box;
  const fcx = (fx1 + fx2) / 2;
  const y0 = Math.round(fy2 + (H - fy2) * 0.10);
  const y1 = Math.round(fy2 + (H - fy2) * 0.45);
  const x0 = Math.max(0, Math.round(fcx - W * 0.30));
  const x1 = Math.min(W, Math.round(fcx + W * 0.30));
  const pts = [];
  for (let y = y0; y < y1; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const i = (y * W + x) * 3;
      const r = frame[i], g = frame[i + 1], b = frame[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luma < 25 || luma > 215) continue; // skip deep shadow / blowout
      pts.push([r, g, b, luma]);
    }
  }
  let c = [52, 56, 68]; // neutral dark blazer fallback
  if (pts.length) {
    pts.sort((a, b) => a[3] - b[3]);
    const lo = pts.length >> 2, hi = pts.length - lo;
    let sr = 0, sg = 0, sb = 0, n = Math.max(1, hi - lo);
    for (let i = lo; i < hi; i++) { sr += pts[i][0]; sg += pts[i][1]; sb += pts[i][2]; }
    c = [sr / n, sg / n, sb / n];
    const luma = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    const skinish = c[0] - c[2] > 25 && c[0] > 150; // bare chest / skin region
    if (skinish || luma > 165) {
      const k = skinish ? 0.55 : 0.35;
      c = [c[0] * (1 - k) + 52 * k, c[1] * (1 - k) + 56 * k, c[2] * (1 - k) + 68 * k];
    }
  }
  return c;
}

/** tapered sleeve forearm from the frame bottom up to the wrist under the
 *  card, cylinder-shaded with a lighter cuff band and subtle fabric folds */
function drawSleeveForearm(frame, bx, by, cw, ch, t, ci, cloth, alpha) {
  const [cr, cg, cb] = cloth;
  const bottom = by + ch - 6;
  const wristY = bottom + 24;
  const palmCX = bx + cw * 0.50;
  const sway = 2.0 * Math.sin(2 * Math.PI * (0.24 * t + ci * 0.13));
  const cx0 = palmCX + cw * 0.02 + sway;   // centerline at the wrist
  const cx1 = palmCX + cw * 0.10 + sway;   // centerline at the frame bottom
  const hw0 = cw * 0.115 + 8;              // wrist half width
  const hw1 = cw * 0.16 + 14;              // half width at the frame bottom
  const y0 = Math.max(0, Math.round(wristY - 8));
  const spanY = Math.max(1, H - y0);
  for (let y = y0; y < H; y++) {
    const v = (y - y0) / spanY;            // 0 wrist -> 1 bottom
    const cxc = cx0 + (cx1 - cx0) * v;
    const hw = hw0 + (hw1 - hw0) * v;
    const vshade = 1 - 0.14 * v;           // slightly darker toward the bottom
    const rowF = y * W;
    for (let x = Math.max(0, Math.round(cxc - hw - 2)); x <= Math.min(W - 1, Math.round(cxc + hw + 2)); x++) {
      const u = (x - cxc) / hw;            // -1..1 across the sleeve
      if (u <= -1 || u >= 1) continue;
      const edge = 1 - Math.max(0, Math.abs(u) - 0.90) / 0.10; // AA edge
      if (edge <= 0) continue;
      // cylinder shading: bright center band, dark rims
      const cyl = 1 - 0.34 * u * u - 0.10 * Math.max(0, Math.abs(u) - 0.75);
      // two subtle fabric fold bands
      let fold = 1;
      const d1 = Math.abs(v - 0.30), d2 = Math.abs(v - 0.62);
      if (d1 < 0.045) fold -= 0.07 * (1 - d1 / 0.045) * (1 - Math.abs(u) * 0.4);
      if (d2 < 0.060) fold -= 0.09 * (1 - d2 / 0.060) * (1 - Math.abs(u) * 0.5);
      const shade = vshade * cyl * fold;
      const a = alpha * edge;
      if (a <= 0.01) continue;
      const di = (rowF + x) * 3;
      const k = 1 - a;
      frame[di]     = frame[di]     * k + Math.min(255, cr * shade) * a;
      frame[di + 1] = frame[di + 1] * k + Math.min(255, cg * shade) * a;
      frame[di + 2] = frame[di + 2] * k + Math.min(255, cb * shade) * a;
    }
  }
  // lighter shirt-cuff band peeking at the wrist
  const cuffY0 = wristY - 6, cuffY1 = wristY + 8;
  for (let y = cuffY0; y <= cuffY1; y++) {
    if (y < 0 || y >= H) continue;
    const v = (y - y0) / spanY;
    const cxc = cx0 + (cx1 - cx0) * v;
    const hw = (hw0 + (hw1 - hw0) * v) * 0.97;
    const rowF = y * W;
    for (let x = Math.max(0, Math.round(cxc - hw)); x <= Math.min(W - 1, Math.round(cxc + hw)); x++) {
      const u = (x - cxc) / hw;
      if (u <= -1 || u >= 1) continue;
      const edge = 1 - Math.max(0, Math.abs(u) - 0.90) / 0.10;
      if (edge <= 0) continue;
      const fade = Math.min(1, (y - cuffY0) / 3) * Math.min(1, (cuffY1 - y) / 3);
      const a = alpha * 0.85 * edge * fade;
      if (a <= 0.01) continue;
      const di = (rowF + x) * 3;
      const k = 1 - a;
      frame[di]     = frame[di]     * k + Math.min(255, cr * 1.28 + 12) * a;
      frame[di + 1] = frame[di + 1] * k + Math.min(255, cg * 1.30 + 14) * a;
      frame[di + 2] = frame[di + 2] * k + Math.min(255, cb * 1.26 + 16) * a;
    }
  }
}

/** alpha-blended capsule with rim shading (optionally darken-only for
 *  contact shadows) — the building block of the v2 grip */
function capsuleA(frame, x0, y0, x1, y1, R, r, g, b, alpha, darkenOnly) {
  if (alpha <= 0.01) return;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - R - 1));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + R + 1));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - R - 1));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + R + 1));
  if (maxX <= minX || maxY <= minY) return;
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let tt = ((x - x0) * dx + (y - y0) * dy) / len2;
      tt = Math.max(0, Math.min(1, tt));
      const ex = x0 + tt * dx, ey = y0 + tt * dy;
      const d = Math.hypot(x - ex, y - ey);
      const a = d <= R - 1 ? alpha : d >= R + 1 ? 0 : (alpha * (R + 1 - d) / 2);
      if (a <= 0.004) continue;
      const di = (y * W + x) * 3;
      if (darkenOnly) {
        const k = 1 - a;
        frame[di] *= k; frame[di + 1] *= k; frame[di + 2] *= k;
      } else {
        const rim = d > R - 3 ? 0.86 : 1;
        const k = 1 - a;
        frame[di]     = frame[di]     * k + Math.min(255, r * rim) * a;
        frame[di + 1] = frame[di + 1] * k + Math.min(255, g * rim) * a;
        frame[di + 2] = frame[di + 2] * k + Math.min(255, b * rim) * a;
      }
    }
  }
}

/** v2 grip drawn AFTER the card: four fingertips + thumb wrapping over the
 *  card's front edges. Each finger = contact shadow on the card + base
 *  segment below the edge + distal segment over the card face + top light +
 *  knuckle crease + nail. Follows the card's tilt so fingers stay glued to
 *  the bottom edge line. */
function drawGripV2(frame, bx, by, cw, ch, t, ci, skin, alpha, tiltDeg) {
  const [sr, sg, sb] = skin;
  const tanT = Math.tan((tiltDeg * Math.PI) / 180);
  const midX = bx + cw / 2;
  const bottomAt = (x) => by + ch - 6 + (x - midX) * tanT;
  const nailR = Math.min(255, sr * 1.30 + 8), nailG = Math.min(255, sg * 1.26 + 6), nailB = Math.min(255, sb * 1.22 + 10);
  const pos = [0.24, 0.42, 0.60, 0.77];
  const tipH = [40, 47, 43, 35];
  const rad = [10.5, 11.5, 10.8, 9.2];
  for (let k = 0; k < 4; k++) {
    const wig = 1.3 * Math.sin(2 * Math.PI * (0.45 * t + k * 0.41 + ci * 0.19));
    const grip = 1.6 * Math.sin(2 * Math.PI * (0.30 * t + k * 0.23 + ci * 0.11));
    const fx = bx + cw * pos[k] + wig;
    const bot = bottomAt(fx);
    const tip = bot - tipH[k] - grip;
    const jx = fx + 3; // joint slightly curled toward the palm side
    // (a) contact shadow the fingertip casts ON the card
    capsuleA(frame, fx + 4, tip + 8, fx + 8, tip + 14, rad[k] + 2, sr * 0.42, sg * 0.42, sb * 0.46, alpha * 0.20, true);
    // (b) base segment below the card edge (slightly darker, in shadow)
    capsuleA(frame, fx, bot + 24, jx, bot + 2, rad[k] + 1.5, sr * 0.90, sg * 0.90, sb * 0.93, alpha);
    // (c) distal segment over the card face
    capsuleA(frame, jx, bot + 2, jx + 2, tip, rad[k], sr, sg, sb, alpha);
    // (d) top light along the finger
    capsuleA(frame, jx - 1, bot - 2, jx + 1, tip + 2, rad[k] - 3.5, Math.min(255, sr * 1.13), Math.min(255, sg * 1.13), Math.min(255, sb * 1.10), alpha * 0.55);
    // (e) knuckle crease at the card edge
    capsuleA(frame, jx - rad[k] + 2, bot + 1, jx + rad[k] - 2, bot + 3, 2.2, sr * 0.66, sg * 0.66, sb * 0.70, alpha * 0.5);
    // (f) nail near the fingertip
    capsuleA(frame, jx - 1, tip + 9, jx + 4, tip + 4, 3.6, nailR, nailG, nailB, alpha * 0.85);
  }
  // thumb wrapping the card's lower-left edge, coming from behind
  const tw = 1.5 * Math.sin(2 * Math.PI * (0.38 * t + ci * 0.5));
  const tbx = bx + cw * 0.045 + tw;
  const tby = bottomAt(tbx) - 16;
  const ttx = bx + cw * 0.155 + tw;
  const tty = bottomAt(ttx) - 44;
  // contact shadow under the thumb tip
  capsuleA(frame, ttx + 4, tty + 8, ttx + 8, tty + 14, 15, sr * 0.42, sg * 0.42, sb * 0.46, alpha * 0.18, true);
  // thumb body + light + nail
  capsuleA(frame, tbx - 8, tby + 18, ttx, tty, 14.5, sr, sg, sb, alpha);
  capsuleA(frame, tbx - 6, tby + 16, ttx - 1, tty + 2, 11, Math.min(255, sr * 1.12), Math.min(255, sg * 1.12), Math.min(255, sb * 1.08), alpha * 0.5);
  capsuleA(frame, ttx - 4, tty + 8, ttx + 1, tty + 3, 4.2, nailR, nailG, nailB, alpha * 0.8);
}

/** composite held cards onto an rgb24 frame (every render frame).
 *  v0.9.53 realHumanMode: full procedural grip —
 *    (1) sleeve forearm from the frame bottom up to the wrist (clothing-
 *        colored, cylinder-shaded, with cuff) so the arm connects to the
 *        presenter's body instead of floating;
 *    (2) palm heel BEHIND the card so the card rests on the hand;
 *    (3) card shadow + matte product card;
 *    (4) four shaded fingertips + thumb wrapping over the card's front
 *        edges, each with contact shadow, knuckle crease and nail —
 *        the grip reads as genuinely holding the product. */
function compositeHeldProduct(frame, cards, t, anchor, skin) {
  if (!anchor) return;
  for (let ci = 0; ci < cards.length; ci++) {
    const c = cards[ci];
    const { alpha, slide } = cardFade(t, c.from, c.to);
    if (alpha <= 0.004) continue;
    // "present to camera": gentle bell-shaped drift toward frame center mid-segment
    const u = Math.min(1, Math.max(0, (t - c.from) / Math.max(0.001, c.to - c.from)));
    const bell = Math.pow(Math.sin(Math.PI * u), 2);
    const centerX = (W - c.sprite.w) / 2;
    const drift = c.realHumanMode ? 0.10 : 0.18; // less drift = more stable in hand
    const px = anchor.x + (centerX - anchor.x) * drift * bell;
    // gentle hand-held bobbing (two incommensurate sines -> organic drift)
    const bx = px + (c.realHumanMode ? 3 : 5) * Math.sin(2 * Math.PI * (0.33 * t + c.ph));
    const by = anchor.y - (c.realHumanMode ? 3 : 6) * bell + (c.realHumanMode ? 5 : 9) * Math.sin(2 * Math.PI * (0.52 * t + c.qh)) + slide;
    const ix = Math.round(bx), iy = Math.round(by);
    const cardW = c.sprite.w, cardH = c.sprite.h;

    if (c.isHand) {
      // legacy real-photo hand sprite already contains the card, the product
      // AND fingers wrapped over the card — just shadow + sprite blit.
      blitSprite(frame, c.shadow, ix + 9, iy + 15, alpha, true);
      blitSprite(frame, c.sprite, ix, iy, alpha, false);
    } else if (c.realHumanMode) {
      // ==== Real Human mode: sleeve forearm + procedural grip ====
      if (alpha > 0.25) {
        // (1) sleeve forearm: frame bottom -> wrist under the card
        drawSleeveForearm(frame, ix, iy, cardW, cardH, t, ci, c.cloth || [52, 56, 68], alpha);
        // (2) palm heel behind the card — the card rests ON the hand
        drawPalmHeel(frame, ix, iy, cardW, cardH, t, skin || [226, 172, 150], ci);
      }
      // (3) card shadow (falls on the wrist/sleeve — adds depth) + card
      blitSprite(frame, c.shadow, ix + 7, iy + 14, alpha * 0.9, true);
      blitSprite(frame, c.sprite, ix, iy, alpha, false);
      // (4) fingers + thumb wrap over the card's front edges
      if (alpha > 0.40 && skin) {
        drawGripV2(frame, ix, iy, cardW, cardH, t, ci, skin, alpha, c.tilt || 0);
      }
    } else {
      // legacy photo-puppet mode: full hand-drawn vector grip
      // (1) palm heel drawn BEFORE the card — card sits on top of the hand
      if (alpha > 0.45) drawPalmHeel(frame, ix, iy, cardW, cardH, t, skin, ci);
      // (2) shadow + card
      blitSprite(frame, c.shadow, ix + 6, iy + 10, alpha, true);
      blitSprite(frame, c.sprite, ix, iy, alpha, false);
      // (3) hand wraps over the card — fingers on bottom + thumb on left edge
      if (alpha > 0.55) drawHandWrap(frame, ix, iy, cardW, cardH, t, skin, ci);
    }
  }
}

/** draw palm heel behind the card — a rounded tablet under the card's bottom
 *  edge that gives the hand a solid-looking base. Drawn with lower alpha so
 *  it doesn't overpower the product. */
function drawPalmHeel(frame, bx, by, cw, ch, t, skin, ci) {
  const [sr, sg, sb] = skin;
  const bottom = by + ch - 4;
  const wig = Math.sin(2 * Math.PI * (0.35 * t + ci * 0.21)) * 1.2;
  const palmX0 = bx + 14 + wig;
  const palmX1 = bx + cw - 14 + wig;
  const palmY0 = bottom - 2;
  const palmY1 = bottom + 32;
  drawPalmTablet(frame, palmX0, palmY0, palmX1, palmY1, sr, sg, sb, 10);
  // dark crease / joint line midway in palm
  drawPalmTablet(frame, palmX0 + 10, palmY1 - 14, palmX1 - 10, palmY1 - 6, sr * 0.88, sg * 0.88, sb * 0.92, 4);
}

/** skin-tone hand wrapping the card's bottom edge — v0.9.37 realistic grip.
 *  Called AFTER the card is drawn, so fingers/thumb overlay the card bottom.
 *  The palm heel (drawPalmHeel) is drawn BEFORE the card so the card sits on
 *  top of the hand, creating a genuine "holding" feel. */
function drawHandWrap(frame, bx, by, cw, ch, t, skin, ci) {
  const [sr, sg, sb] = skin;
  const bottom = by + ch - 6;

  // --- 1. finger capsules wrapping the card's bottom edge ---
  //   4 fingers positioned along the card's width, curling upward.
  const fingers = [0.30, 0.46, 0.62, 0.78];
  for (let k = 0; k < fingers.length; k++) {
    const wig = 1.6 * Math.sin(2 * Math.PI * (0.9 * t + k * 0.7 + ci * 0.31));
    const fx = bx + cw * fingers[k] + wig;
    // knuckle: two stacked capsules give the finger its joint
    capsule(frame, fx, bottom - 28 + wig * 0.4, fx, bottom + 4, 11, sr, sg, sb);
    // darker knuckle-joint highlight (shadows the finger at midpoint)
    const shadeR = sr * 0.82, shadeG = sg * 0.82, shadeB = sb * 0.88;
    capsule(frame, fx - 2, bottom - 8 + wig * 0.3, fx + 2, bottom - 2, 10, shadeR, shadeG, shadeB);
  }

  // --- 2. thumb wrapping the card's left edge ---
  //   Thumb is thicker than other fingers and wraps around the card's left
  //   vertical edge — gives the "holding" feeling by opposing the four fingers.
  const tw = Math.sin(2 * Math.PI * (0.8 * t + ci * 0.5)) * 1.4;
  // main thumb body (diagonal so it looks like it wraps)
  capsule(frame, bx - 4 + tw, bottom - 54, bx + 42 + tw, bottom - 22, 14, sr, sg, sb);
  // thumb shadow (lighter under-side to imply lighting)
  const thumbLightR = Math.min(255, sr * 1.1), thumbLightG = Math.min(255, sg * 1.1);
  capsule(frame, bx + 2 + tw, bottom - 52, bx + 38 + tw, bottom - 24, 11, thumbLightR, thumbLightG, sb);
  // thumb nail highlight (small rounded patch at top-right of thumb)
  capsule(frame, bx + 30 + tw, bottom - 50, bx + 38 + tw, bottom - 46, 4, Math.min(255, sr * 1.25), Math.min(255, sg * 1.25), sb);
}

/** rounded-axis-aligned tablet (used for the palm heel) — lighter weight than capsule */
function drawPalmTablet(frame, x0, y0, x1, y1, r, sr, sg, sb, radius) {
  if (x1 <= x0 || y1 <= y0) return;
  const minX = Math.max(0, Math.floor(x0 - radius - 1));
  const maxX = Math.min(W - 1, Math.ceil(x1 + radius + 1));
  const minY = Math.max(0, Math.floor(y0 - radius - 1));
  const maxY = Math.min(H - 1, Math.ceil(y1 + radius + 1));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const halfW = (x1 - x0) / 2, halfH = (y1 - y0) / 2;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // distance to rounded rectangle
      const dx = Math.max(Math.abs(x - cx) - halfW + radius, 0);
      const dy = Math.max(Math.abs(y - cy) - halfH + radius, 0);
      const d = Math.hypot(dx, dy);
      let a = d <= radius - 1 ? 1 : d >= radius + 1 ? 0 : (radius + 1 - d) / 2;
      if (a <= 0) continue;
      // top-lighting for volume (lighter top, darker bottom)
      const yRel = (y - minY) / Math.max(1, maxY - minY);
      const lift = yRel < 0.35 ? 1.06 : yRel > 0.75 ? 0.88 : 1;
      const shade = d > radius - 2 ? 0.88 : 1;
      const Rv = Math.min(255, sr * lift * shade);
      const Gv = Math.min(255, sg * lift * shade);
      const Bv = Math.min(255, sb * lift * shade);
      const di = (y * W + x) * 3;
      frame[di] = frame[di] * (1 - a) + Rv * a;
      frame[di + 1] = frame[di + 1] * (1 - a) + Gv * a;
      frame[di + 2] = frame[di + 2] * (1 - a) + Bv * a;
    }
  }
}

/** filled capsule (rounded line segment) with rim shading, drawn opaque */
function capsule(frame, x0, y0, x1, y1, R, sr, sg, sb) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - R - 1));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + R + 1));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - R - 1));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + R + 1));
  if (maxX <= minX || maxY <= minY) return;
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // distance to segment
      let tt = ((x - x0) * dx + (y - y0) * dy) / len2;
      tt = Math.max(0, Math.min(1, tt));
      const ex = x0 + tt * dx, ey = y0 + tt * dy;
      const d = Math.hypot(x - ex, y - ey);
      let a = d <= R - 1 ? 1 : d >= R + 1 ? 0 : (R + 1 - d) / 2;
      if (a <= 0) continue;
      // rim darkening + slight top-light for volume
      const rim = d > R - 3 ? 0.82 : 1;
      const lift = (y - minY) / Math.max(1, maxY - minY) < 0.35 ? 1.05 : 1;
      const r = Math.min(255, sr * rim * lift);
      const g = Math.min(255, sg * rim * lift);
      const b = Math.min(255, sb * rim * lift);
      const di = (y * W + x) * 3;
      frame[di] = frame[di] * (1 - a) + r * a;
      frame[di + 1] = frame[di + 1] * (1 - a) + g * a;
      frame[di + 2] = frame[di + 2] * (1 - a) + b * a;
    }
  }
}

function blitSprite(frame, spr, ox, oy, alpha, darkenOnly) {
  const { buf, w, h } = spr;
  const x0 = Math.max(0, ox), y0 = Math.max(0, oy);
  const x1 = Math.min(W, ox + w), y1 = Math.min(H, oy + h);
  if (x1 <= x0 || y1 <= y0) return;
  for (let y = y0; y < y1; y++) {
    const srow = (y - oy) * w, drow = y * W;
    for (let x = x0; x < x1; x++) {
      const si = (srow + x - ox) * 4;
      const sa = (buf[si + 3] / 255) * alpha;
      if (sa <= 0.004) continue;
      const di = (drow + x) * 3;
      if (darkenOnly) {
        const k = 1 - sa;
        frame[di] *= k; frame[di + 1] *= k; frame[di + 2] *= k;
      } else {
        const k = 1 - sa;
        frame[di] = frame[di] * k + buf[si] * sa;
        frame[di + 1] = frame[di + 1] * k + buf[si + 1] * sa;
        frame[di + 2] = frame[di + 2] * k + buf[si + 2] * sa;
      }
    }
  }
}
