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

async function generateHighlightsFromPath({
  inputPath,
  outDir,
  clipBaseUrl,
  maxClips,
  clipLenSeconds,
  onProgress,
}) {
  const bin = ffmpegPath();
  if (!bin) throw new Error('ffmpeg not available');

  await fs.mkdir(outDir, { recursive: true });

  const duration = await probeDurationSeconds(inputPath, 180);
  const count = Math.max(1, Math.min(typeof maxClips === 'number' ? maxClips : pickClipCount(duration), 12));
  const clipLen = Math.max(5, Math.min(typeof clipLenSeconds === 'number' ? clipLenSeconds : pickClipLen(duration), 120));
  const spacing = Math.max(1, Math.floor(duration / (count + 1)));

  const clips = [];
  for (let i = 0; i < count; i += 1) {
    if (typeof onProgress === 'function') {
      const p = 40 + Math.floor((i / Math.max(1, count)) * 50);
      onProgress({ stage: 'generating_clip', progress: p, message: `Creating highlight clip... (${i + 1}/${count})`, data: { clipIndex: i } });
    }
    const start = Math.max(0, Math.min(duration - 2, spacing * (i + 1) - Math.floor(clipLen / 2)));
    const end = Math.min(duration, start + clipLen);
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
      title: `Highlight ${i + 1}`,
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

  return { clips };
}

module.exports = {
  ffmpegPath,
  probeDurationSeconds,
  generateHighlightsFromPath,
};
