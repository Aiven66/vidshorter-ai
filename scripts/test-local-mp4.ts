import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import videoClipper from '../src/lib/server/video-clipper';

const videoPath = '/Users/aiven/Desktop/演示视频.mp4';

if (!fs.existsSync(videoPath)) {
  throw new Error(`Missing test mp4: ${videoPath}`);
}

function startServer(filePath: string) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1');
    if (u.pathname !== '/api/local-video/test.mp4') {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');

    const range = req.headers.range;
    if (typeof range === 'string' && range.startsWith('bytes=')) {
      const [a, b] = range.replace('bytes=', '').split('-');
      const start = Math.max(0, parseInt(a || '0', 10) || 0);
      const end = Math.min(stat.size - 1, parseInt(b || String(stat.size - 1), 10) || (stat.size - 1));
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Length', String(stat.size));
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise<{ server: http.Server; url: string }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/api/local-video/test.mp4` });
    });
  });
}

async function main() {
  process.env.INLINE_CLIPS = '0';

  const { server, url } = await startServer(videoPath);
  try {
    const source = await videoClipper.downloadSourceVideo(url);
    const clip = await videoClipper.createLocalClip({
      inputPath: source.inputPath,
      startTime: 0,
      endTime: 12,
      title: 'Local MP4 Test',
    });

    const name = path.basename(clip.publicUrl);
    console.log('OK');
    console.log('sourceUrl', url);
    console.log('clipPath', clip.outputPath);
    console.log('publicUrl', clip.publicUrl);
    console.log('thumbPrefix', (clip.thumbnailUrl || '').slice(0, 30));
    console.log('filename', name);
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

