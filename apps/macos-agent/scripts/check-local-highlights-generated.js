const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const { generateHighlightsFromPath, probeDurationSeconds, ffmpegPath } = require('../local-highlights');

async function main() {
  const bin = ffmpegPath();
  if (!bin) throw new Error('ffmpeg not available');

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipop-local-highlights-'));
  const input = path.join(dir, 'input.mp4');
  const outDir = path.join(dir, 'clips');

  await execFileAsync(bin, [
    '-hide_banner',
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=size=640x360:rate=30',
    '-f', 'lavfi',
    '-i', 'sine=frequency=880:sample_rate=48000',
    '-t', '12',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    input,
  ], { timeout: 120_000 });

  const result = await generateHighlightsFromPath({
    inputPath: input,
    outDir,
    clipBaseUrl: 'http://127.0.0.1:12345',
    maxClips: 2,
    clipLenSeconds: 4,
  });

  if (!Array.isArray(result.clips) || result.clips.length !== 2) {
    throw new Error(`expected 2 clips, got ${result.clips?.length ?? 0}`);
  }

  for (const clip of result.clips) {
    if (!clip.outputPath || !fsSync.existsSync(clip.outputPath)) throw new Error('clip file missing');
    const duration = await probeDurationSeconds(clip.outputPath, 0);
    if (duration <= 0) throw new Error('clip duration invalid');
    if (!clip.videoUrl || !clip.videoUrl.startsWith('http://127.0.0.1:12345/api/serve-clip/')) {
      throw new Error('clip URL invalid');
    }
  }

  console.log('OK local highlights generated');
  console.log(`tmp ${dir}`);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
