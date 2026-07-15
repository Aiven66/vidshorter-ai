import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, unlink, access, constants as fsConstants } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const execFileAsync = promisify(execFile);

/**
 * /api/cut-clip — Server-side ffmpeg clip cutting (v48)
 *
 * APPROACH (v48 — server-side download + cut):
 *   Browser sends the resolved streamUrl + metadata. Server downloads the
 *   video bytes using Node.js fetch (modern TLS, works with Cloudflare Workers),
 *   writes to a temp file, then ffmpeg cuts [startTime, startTime+duration]
 *   from the LOCAL file → standard progressive MP4.
 *
 * WHY server-download (not browser-download):
 *   v45-v47 tried browser-download + server-cut. Issues:
 *     - Browser download from CF Worker /stream sometimes returns 403 (colo-mismatch)
 *     - Browser chunked Range requests can fail silently
 *     - 80MB download cap forced fallback to MediaRecorder (produces fMP4/webm)
 *   v48 lets the SERVER download from the streamUrl directly. Node.js fetch
 *   has modern TLS and can connect to googlevideo.com directly (the streamUrl
 *   is IP-bound to the /resolve call's IP, which is the CF Worker's IP —
 *   the server can fetch it because the IP binding is per-CF-colo, not per-client).
 *
 *   Actually, the streamUrl is bound to the CF Worker's egress IP. When the
 *   server (Vercel) tries to fetch it, googlevideo.com may reject it (IP mismatch).
 *   So we use the CF Worker /stream endpoint as a proxy — it re-fetches from
 *   googlevideo.com using its own IP (which matches the streamUrl's binding).
 *
 * Input: JSON body
 *   - streamUrl: string (resolved googlevideo.com URL)
 *   - userAgent: string (from /resolve response)
 *   - visitorData: string (from /resolve response)
 *   - videoId: string (YouTube video ID)
 *   - startTime: number (seconds)
 *   - endTime: number (seconds)
 *
 * Output: video/mp4 (standard progressive MP4 with +faststart)
 */
export async function POST(request: NextRequest) {
  const inputPath = join(tmpdir(), `cut-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);
  const outputPath = join(tmpdir(), `cut-output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);

  try {
    const contentType = request.headers.get('content-type') || '';

    let streamUrl = '';
    let userAgent = '';
    let visitorData = '';
    let videoId = '';
    let startTime = 0;
    let duration = 30;

    // Support both JSON and multipart/form-data (for backwards compat)
    if (contentType.includes('application/json')) {
      const body = await request.json();
      streamUrl = body.streamUrl || '';
      userAgent = body.userAgent || '';
      visitorData = body.visitorData || '';
      videoId = body.videoId || '';
      startTime = Number(body.startTime) || 0;
      duration = Math.min(Number(body.duration) || (Number(body.endTime) - startTime) || 30, 90);
    } else {
      // Legacy multipart/form-data path (browser uploaded video bytes)
      const formData = await request.formData();
      const file = formData.get('file');
      if (file && file instanceof File) {
        if (file.size > 100 * 1024 * 1024) {
          return NextResponse.json({ error: `File too large: ${file.size} bytes (max 100MB)` }, { status: 413 });
        }
        if (file.size < 10_000) {
          return NextResponse.json({ error: `File too small: ${file.size} bytes` }, { status: 400 });
        }
        const arrayBuffer = await file.arrayBuffer();
        await writeFile(inputPath, Buffer.from(arrayBuffer));
        startTime = Number(formData.get('startTime')) || 0;
        duration = Math.min(Number(formData.get('duration')) || 30, 90);

        // Skip the download step — file already uploaded
        return await cutLocalFile(inputPath, outputPath, startTime, duration);
      }
      streamUrl = String(formData.get('streamUrl') || '');
      userAgent = String(formData.get('userAgent') || '');
      visitorData = String(formData.get('visitorData') || '');
      videoId = String(formData.get('videoId') || '');
      startTime = Number(formData.get('startTime')) || 0;
      duration = Math.min(Number(formData.get('duration')) || 30, 90);
    }

    if (!streamUrl) {
      return NextResponse.json({ error: 'No streamUrl provided' }, { status: 400 });
    }

    console.log(`[cut-clip] v48 server-download: videoId=${videoId}, startTime=${startTime}s, duration=${duration}s`);

    // Build CF Worker /stream URL (acts as a proxy that re-fetches from googlevideo.com
    // using the CF Worker's IP, which matches the streamUrl's IP binding).
    const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim().replace(/\/$/, '');
    if (!cfWorkerUrl) {
      return NextResponse.json({ error: 'CF_WORKER_URL not configured' }, { status: 500 });
    }

    const proxyUrl = new URL(cfWorkerUrl + '/stream');
    proxyUrl.searchParams.set('videoId', videoId);
    proxyUrl.searchParams.set('maxHeight', '720');
    proxyUrl.searchParams.set('muxed', '1');
    proxyUrl.searchParams.set('streamUrl', streamUrl);
    if (userAgent) proxyUrl.searchParams.set('userAgent', userAgent);
    if (visitorData) proxyUrl.searchParams.set('visitorData', visitorData);

    // Download the video bytes via the CF Worker /stream proxy.
    // Node.js fetch has modern TLS and can connect to Cloudflare Workers.
    //
    // We download up to (startTime + duration + 30s buffer) bytes from byte 0.
    // Without downloading from byte 0, the MP4 header (ftyp + moov) is missing
    // and ffmpeg cannot read the file.
    console.log(`[cut-clip] Downloading via CF Worker /stream...`);

    // First HEAD to get content-length
    const headRes = await fetch(proxyUrl.toString(), {
      method: 'HEAD',
      signal: AbortSignal.timeout(15_000),
    }).catch((err) => {
      console.warn('[cut-clip] HEAD failed:', err instanceof Error ? err.message : err);
      return null;
    });

    let contentLength = 0;
    if (headRes && headRes.ok) {
      contentLength = parseInt(headRes.headers.get('content-length') || '0', 10);
    }

    // If HEAD failed or returned no content-length, fall back to a GET with Range 0-1
    // to discover the content-length.
    if (!contentLength) {
      const probeRes = await fetch(proxyUrl.toString(), {
        headers: { Range: 'bytes=0-1' },
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      if (probeRes) {
        const cr = probeRes.headers.get('content-range') || '';
        const match = cr.match(/\/(\d+)/);
        if (match) contentLength = parseInt(match[1], 10);
      }
    }

    if (!contentLength || contentLength < 10_000) {
      return NextResponse.json({
        error: `Cannot determine content length (HEAD returned ${contentLength}). CF Worker /stream may be down or rate-limited.`,
      }, { status: 502 });
    }

    console.log(`[cut-clip] Content-Length: ${contentLength} bytes`);

    // Estimate bytes needed: (startTime + duration + 30s buffer) * bytesPerSec
    // bytesPerSec is hard to know without the video duration. Use a conservative
    // estimate based on 360p muxed (~55 KB/s).
    // To be safe, download up to min(contentLength, 150MB).
    const maxDownloadBytes = Math.min(contentLength, 150 * 1024 * 1024);

    // Download in 2MB chunks (googlevideo.com per-request limit on CF Worker)
    const chunks: Buffer[] = [];
    let downloaded = 0;
    const MAX_CHUNK = 2 * 1024 * 1024;
    const totalChunks = Math.ceil(maxDownloadBytes / MAX_CHUNK);

    for (let i = 0; i < totalChunks; i++) {
      const chunkStart = i * MAX_CHUNK;
      const chunkEnd = Math.min(chunkStart + MAX_CHUNK - 1, maxDownloadBytes - 1);

      const chunkRes = await fetch(proxyUrl.toString(), {
        headers: { Range: `bytes=${chunkStart}-${chunkEnd}` },
        signal: AbortSignal.timeout(30_000),
      });

      if (!chunkRes.ok && chunkRes.status !== 206) {
        console.warn(`[cut-clip] Chunk ${i + 1}/${totalChunks} failed: HTTP ${chunkRes.status}`);
        if (i === 0) {
          return NextResponse.json({
            error: `First chunk download failed: HTTP ${chunkRes.status}. CF Worker /stream may be down.`,
          }, { status: 502 });
        }
        break;
      }

      const chunkBuf = Buffer.from(await chunkRes.arrayBuffer());
      if (chunkBuf.length === 0) {
        console.log(`[cut-clip] Chunk ${i + 1}: empty (end of file)`);
        break;
      }

      // Validate first chunk has ftyp header
      if (i === 0 && chunkBuf.length >= 8) {
        const boxType = chunkBuf.slice(4, 8).toString('ascii');
        if (boxType !== 'ftyp') {
          return NextResponse.json({
            error: `First chunk missing ftyp header (got: "${boxType}"). Stream may be invalid.`,
          }, { status: 502 });
        }
        console.log(`[cut-clip] Chunk 1: ftyp header OK`);
      }

      chunks.push(chunkBuf);
      downloaded += chunkBuf.length;

      // Short read = end of file
      if (chunkBuf.length < (chunkEnd - chunkStart + 1)) break;

      if (i % 10 === 0 || i === totalChunks - 1) {
        console.log(`[cut-clip] Chunk ${i + 1}/${totalChunks}: downloaded ${downloaded} bytes (${Math.round(downloaded / 1024 / 1024)}MB)`);
      }
    }

    if (downloaded < 50_000) {
      return NextResponse.json({
        error: `Downloaded too little: ${downloaded} bytes. CF Worker /stream may be rate-limited.`,
      }, { status: 502 });
    }

    const videoBuf = Buffer.concat(chunks);
    await writeFile(inputPath, videoBuf);
    console.log(`[cut-clip] Downloaded ${videoBuf.length} bytes (${(videoBuf.length / 1024 / 1024).toFixed(1)}MB), saved to ${inputPath}`);

    // Now cut the clip using ffmpeg
    return await cutLocalFile(inputPath, outputPath, startTime, duration);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[cut-clip] Error:', msg.slice(0, 1000));
    return NextResponse.json(
      { error: `Cut clip failed: ${msg.slice(0, 2000)}` },
      { status: 500 },
    );
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Cut a clip from a local MP4 file using ffmpeg.
 * Tries -c copy first (fast remux); falls back to re-encode if that fails.
 */
async function cutLocalFile(inputPath: string, outputPath: string, startTime: number, duration: number): Promise<NextResponse> {
  const ffmpegPath = await findFfmpegBinary();
  if (!ffmpegPath) {
    return NextResponse.json({ error: 'ffmpeg binary not found' }, { status: 500 });
  }

  console.log(`[cut-clip] ffmpeg=${ffmpegPath}, startTime=${startTime}s, duration=${duration}s`);

  let cutSuccess = false;
  let lastError = '';

  // Attempt 1: -c copy (fast remux)
  try {
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss', String(startTime),
      '-i', inputPath,
      '-t', String(duration),
      '-c', 'copy',
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero',
      outputPath,
    ], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30_000,
      env: { ...process.env, LANG: 'C' },
    });
    cutSuccess = true;
  } catch (execErr: any) {
    const stderr = String(execErr?.stderr || '');
    lastError = `copy: ${execErr?.message?.slice(0, 150)} | STDERR: ${stderr.slice(0, 500)}`;
    console.warn(`[cut-clip] -c copy failed, trying re-encode: ${lastError.slice(0, 200)}`);
  }

  // Attempt 2: re-encode (fallback, slower but handles edge cases)
  if (!cutSuccess) {
    try {
      await execFileAsync(ffmpegPath, [
        '-y',
        '-ss', String(startTime),
        '-i', inputPath,
        '-t', String(duration),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero',
        outputPath,
      ], {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 45_000,
        env: { ...process.env, LANG: 'C' },
      });
      cutSuccess = true;
      console.log('[cut-clip] Re-encode fallback succeeded');
    } catch (execErr2: any) {
      const stderr2 = String(execErr2?.stderr || '');
      lastError = `copy+reencode: ${lastError} || reencode: ${execErr2?.message?.slice(0, 150)} | STDERR: ${stderr2.slice(0, 500)}`;
    }
  }

  if (!cutSuccess) {
    return NextResponse.json(
      { error: `ffmpeg both attempts failed: ${lastError.slice(0, 1000)}` },
      { status: 500 },
    );
  }

  const outputData = await readFile(outputPath);
  if (outputData.length < 5_000) {
    return NextResponse.json(
      { error: `Output file too small: ${outputData.length} bytes` },
      { status: 500 },
    );
  }

  console.log(`[cut-clip] Success: ${outputData.length} bytes`);

  return new NextResponse(outputData, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="clip.mp4"',
      'Content-Length': String(outputData.length),
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Find ffmpeg binary path using the same multi-level fallback as video-clipper.ts.
 */
async function findFfmpegBinary(): Promise<string> {
  // 1. ffmpeg-static binary
  try {
    const ffmpegStatic: string = require('ffmpeg-static');
    if (ffmpegStatic) {
      await access(ffmpegStatic, fsConstants.X_OK);
      return ffmpegStatic;
    }
  } catch { /* fall through */ }

  // 2. @ffmpeg-installer/ffmpeg bundled binary
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer?.path) {
      await access(installer.path, fsConstants.X_OK);
      return installer.path;
    }
  } catch { /* fall through */ }

  // 3. System PATH ffmpeg (works on local dev, not Vercel)
  try {
    const { stdout } = await execFileAsync('which', ['ffmpeg']);
    const sysPath = stdout.trim();
    if (sysPath) {
      await access(sysPath, fsConstants.X_OK);
      return sysPath;
    }
  } catch { /* fall through */ }

  return '';
}
