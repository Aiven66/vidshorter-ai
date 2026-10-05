const { execFile, spawnSync } = require('node:child_process');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function normalizeAsarPath(p) {
  const raw = String(p || '');
  if (!raw.includes('app.asar')) return raw;
  const next = raw
    .replace(/\/app\.asar\//g, '/app.asar.unpacked/')
    .replace(/\\app\.asar\\?/g, '\\app.asar.unpacked\\');
  try {
    if (next && fsSync.existsSync(next)) return next;
  } catch {}
  return raw;
}

function ffmpegPath() {
  try {
    const ffmpeg = require('@ffmpeg-installer/ffmpeg');
    const p = normalizeAsarPath(ffmpeg.path);
    try {
      if (!p || !fsSync.existsSync(p)) return '';
      try { fsSync.chmodSync(p, 0o755); } catch {}
      try { spawnSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', p], { stdio: 'ignore' }); } catch {}
    } catch {}
    return p;
  } catch {
    return '';
  }
}

async function probeDurationSeconds(inputPath, fallback = 0) {
  const bin = ffmpegPath();
  if (!bin) return fallback;
  try {
    const r = await execFileAsync(bin, ['-hide_banner', '-i', inputPath], { timeout: 20_000 })
      .catch((e) => ({ stderr: e && e.stderr ? e.stderr : '' }));
    const stderr = r && typeof r.stderr === 'string' ? r.stderr : '';
    const m = String(stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return fallback;
    const h = parseInt(m[1], 10) || 0;
    const mi = parseInt(m[2], 10) || 0;
    const s = parseFloat(m[3]) || 0;
    return Math.max(0, Math.floor(h * 3600 + mi * 60 + s));
  } catch {
    return fallback;
  }
}

function pickClipCount(durationSec) {
  const d = Math.max(0, Math.floor(durationSec || 0));
  if (d >= 2 * 60 * 60) return 10;
  if (d >= 90 * 60) return 9;
  if (d >= 60 * 60) return 8;
  if (d >= 40 * 60) return 7;
  if (d >= 25 * 60) return 6;
  if (d >= 15 * 60) return 5;
  if (d >= 8 * 60) return 4;
  return 3;
}

function pickClipLen(durationSec) {
  const d = Math.max(0, Math.floor(durationSec || 0));
  if (d <= 8 * 60) return 35;
  if (d <= 20 * 60) return 50;
  return 60;
}

/**
 * 把「打分器输出的 plan」或「均匀取点」统一成待渲染窗口列表。
 * plan 为一等公民（P0-2 意图可控高光）；缺失时退化为按片长均匀取点，保证无 ASR 也能出片。
 */
function buildRenderWindows({ duration, plan, maxClips, clipLenSeconds, prefs }) {
  const rawMin = Number(prefs.minLen);
  const rawMax = Number(prefs.maxLen);
  const minLen = Math.max(5, Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 5);
  const maxLen = Math.max(minLen, Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 120);

  if (Array.isArray(plan) && plan.length > 0) {
    return plan
      .map((p, i) => {
        const start = Math.max(0, Math.min(Math.max(0, duration - 2), Number(p.start) || 0));
        const end = Math.min(duration, Math.max(start + minLen, Number(p.end) || start + minLen));
        return {
          start,
          end,
          title: String(p.title || `Highlight ${i + 1}`),
          reason: Array.isArray(p.reason) ? p.reason : [],
        };
      })
      .filter((w) => w.end - w.start >= Math.min(minLen, 2));
  }

  const prefsCount = Number(prefs.clipCount);
  const fallbackCount = Number.isFinite(prefsCount) && prefsCount > 0 ? prefsCount : pickClipCount(duration);
  const count = Math.max(1, Math.min(typeof maxClips === 'number' ? maxClips : fallbackCount, 12));
  const clipLen = Math.max(minLen, Math.min(typeof clipLenSeconds === 'number' ? clipLenSeconds : pickClipLen(duration), maxLen));
  const spacing = Math.max(1, Math.floor(duration / (count + 1)));

  const out = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.max(0, Math.min(duration - 2, spacing * (i + 1) - Math.floor(clipLen / 2)));
    const end = Math.min(duration, start + clipLen);
    out.push({ start, end, title: `Highlight ${i + 1}`, reason: [] });
  }
  return out;
}

async function generateHighlightsFromPath({
  inputPath,
  outDir,
  clipBaseUrl,
  maxClips,
  clipLenSeconds,
  onProgress,
  plan,
  rules,
}) {
  const bin = ffmpegPath();
  if (!bin) throw new Error('ffmpeg not available');

  await fs.mkdir(outDir, { recursive: true });

  const duration = await probeDurationSeconds(inputPath, 180);
  const prefs = rules && typeof rules === 'object' && rules.prefs && typeof rules.prefs === 'object' ? rules.prefs : {};
  const windows = buildRenderWindows({ duration, plan, maxClips, clipLenSeconds, prefs });
  const count = windows.length;
  const usedPlan = Array.isArray(plan) && plan.length > 0;

  const clips = [];
  for (let i = 0; i < count; i += 1) {
    if (typeof onProgress === 'function') {
      const p = 40 + Math.floor((i / Math.max(1, count)) * 50);
      onProgress({ stage: 'generating_clip', progress: p, message: `Creating highlight clip... (${i + 1}/${count})`, data: { clipIndex: i } });
    }
    const window = windows[i];
    const start = window.start;
    const end = window.end;
    const t = String(Math.max(1, Math.floor(end - start)));
    const outName = `local-${Date.now()}-${Math.random().toString(16).slice(2)}-${i + 1}.mp4`;
    const outPath = path.join(outDir, outName);

    const encodeArgsFast = [
      '-y',
      '-ss', String(start),
      '-i', inputPath,
      '-t', t,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outPath,
    ];
    await execFileAsync(bin, encodeArgsFast, { timeout: 180_000 });
    const outDur = await probeDurationSeconds(outPath, 0);
    if (outDur <= 0) {
      const encodeArgsAccurate = [
        '-y',
        '-i', inputPath,
        '-ss', String(start),
        '-t', t,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outPath,
      ];
      await execFileAsync(bin, encodeArgsAccurate, { timeout: 180_000 });
      const outDur2 = await probeDurationSeconds(outPath, 0);
      if (outDur2 <= 0) throw new Error('Failed to generate valid clip.');
    }

    const thumbName = outName.replace(/\.mp4$/i, '.jpg');
    const thumbPath = path.join(outDir, thumbName);
    let thumbBuf = null;
    try {
      const thumbArgs = [
        '-y',
        '-ss', '0.1',
        '-i', outPath,
        '-frames:v', '1',
        '-q:v', '2',
        thumbPath,
      ];
      await execFileAsync(bin, thumbArgs, { timeout: 60_000 });
      thumbBuf = await fs.readFile(thumbPath);
    } finally {
      await fs.unlink(thumbPath).catch(() => {});
    }

    clips.push({
      id: `local-${i + 1}-${Math.random().toString(16).slice(2)}`,
      title: window.title || `Highlight ${i + 1}`,
      reason: window.reason || [],
      startTime: start,
      endTime: end,
      duration: end - start,
      status: 'completed',
      videoUrl: `${clipBaseUrl}/api/serve-clip/${outName}`,
      thumbnailUrl: thumbBuf ? `data:image/jpeg;base64,${thumbBuf.toString('base64')}` : '',
      outputPath: outPath,
    });

    if (typeof onProgress === 'function') {
      const p = 40 + Math.floor(((i + 1) / Math.max(1, count)) * 50);
      onProgress({ stage: 'clip_ready', progress: p, message: 'Highlight clip ready', data: { clip: clips[clips.length - 1], clipIndex: i } });
    }
  }

  return { clips, usedPlan };
}

module.exports = {
  ffmpegPath,
  probeDurationSeconds,
  buildRenderWindows,
  generateHighlightsFromPath,
};
