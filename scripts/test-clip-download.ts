import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const cfWorkerUrl = process.env.CF_WORKER_URL?.trim();
  if (!cfWorkerUrl) {
    console.error('CF_WORKER_URL env var is required');
    process.exit(1);
  }

  const videoClipper = (await import('../src/lib/server/video-clipper')).default;
  const videoId = 'c_KmQkjBJt8';
  const title = 'test-clip';

  // Test two different clips to verify they are different and have audio
  const clips = [
    { startTime: 80, endTime: 95 },
    { startTime: 110, endTime: 125 },
  ];

  for (const clip of clips) {
    console.log(`\n=== Testing clip ${clip.startTime}s-${clip.endTime}s ===`);
    try {
      const result = await videoClipper.downloadYouTubeClip({
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        startTime: clip.startTime,
        endTime: clip.endTime,
        maxInlineBytes: 4 * 1024 * 1024,
      });

      console.log('Result keys:', Object.keys(result));
      console.log('dataUrl length:', result.dataUrl?.length || 0);
      console.log('outputPath:', result.outputPath);
      console.log('publicUrl:', result.publicUrl);
      console.log('thumbnailUrl length:', result.thumbnailUrl?.length || 0);

      if (result.dataUrl) {
        const base64 = result.dataUrl.replace(/^data:video\/mp4;base64,/, '');
        const buf = Buffer.from(base64, 'base64');
        const outPath = path.join(__dirname, `..`, `test-clip-${clip.startTime}-${clip.endTime}.mp4`);
        await fs.writeFile(outPath, buf);
        console.log(`Saved clip to ${outPath} (${buf.length} bytes)`);

        // Basic sanity checks
        const hasAudio = await checkAudioTrack(buf);
        console.log(`Has audio track: ${hasAudio}`);
      }
    } catch (err) {
      console.error('Clip failed:', err instanceof Error ? err.message : err);
    }
  }
}

async function checkAudioTrack(mp4Buffer: Buffer): Promise<boolean> {
  // Simple heuristic: search for common audio codec signatures in MP4
  const sample = mp4Buffer.slice(0, Math.min(mp4Buffer.length, 200 * 1024));
  const text = sample.toString('binary');
  return text.includes('mp4a') || text.includes('aac') || text.includes('opus') || text.includes('sowt');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
