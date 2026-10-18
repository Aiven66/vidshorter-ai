import videoClipper from '../src/lib/server/video-clipper';

const URL = 'https://www.bilibili.com/video/BV1FCps68EGf/';

const tail = (s: string, n = 700) => (s.length > n ? '…' + s.slice(-n) : s);

async function main() {
  // Mirrors video-job.produceClip: downloadSourceVideo now attaches ffmpegHeaders
  // for remote (Vercel CDN) Bilibili sources, and produceClip forwards them.
  const src = await videoClipper.downloadSourceVideo(URL, { forceMaxHeight: 720 });
  console.log('inputPath =', src.inputPath.slice(0, 110));
  console.log('ffmpegHeaders =', JSON.stringify(src.ffmpegHeaders));

  for (const [start, end] of [[55, 75], [101, 141]] as const) {
    console.log(`\n== createLocalClip ${start}-${end} ==`);
    const t = Date.now();
    try {
      const r = await videoClipper.createLocalClip({
        inputPath: src.inputPath,
        startTime: start,
        endTime: end,
        title: 'probe',
        fastCopy: true,
        ...(src.ffmpegHeaders ? { inputHeaders: src.ffmpegHeaders } : {}),
        targetHeight: 720,
      });
      console.log(`OK publicUrl=${r.publicUrl ? 'yes' : 'no'} dataUrl=${r.dataUrl ? r.dataUrl.length + 'B' : 'no'} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    } catch (e) {
      console.log(`FAILED (${((Date.now() - t) / 1000).toFixed(1)}s):\n` + tail(e instanceof Error ? e.message : String(e)));
    }
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
