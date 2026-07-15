import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, unlink, access, constants as fsConstants, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const execFileAsync = promisify(execFile);

const MAX_CHUNK_BYTES = 2 * 1024 * 1024; // 2MB (googlevideo.com per-request limit on CF colos)
const DOWNLOAD_TIMEOUT_MS = 40_000;

/**
 * /api/cut-clip — Server-side ffmpeg clip cutting (v45)
 *
 * APPROACH: Download stream segment via Node.js fetch (modern TLS), then
 * cut with ffmpeg reading from a LOCAL temp file. This avoids ffmpeg's
 * outdated TLS stack (2018 johnvansickle.com build cannot connect to
 * Cloudflare Workers HTTPS endpoints).
 *
 * Flow:
 *   1. Browser resolves streamUrl via CF Worker /resolve
 *   2. Browser POSTs stream metadata + startTime + endTime to this endpoint
 *   3. Server HEADs CF Worker /stream to get Content-Length
 *   4. Server calculates byte range for [startTime, endTime] segment
 *   5. Server downloads that byte range via chunked Range requests (2MB each)
 *   6. ffmpeg reads from local temp file, seeks, cuts, outputs standard MP4
 *   7. Server returns the standard MP4
 */
export async function POST(request: NextRequest) {
  const inputPath = join(tmpdir(), `cut-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);
  const outputPath = join(tmpdir(), `cut-output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);

  try {
    const body = await request.json();
    const {
      videoId,
      startTime,
      endTime,
      streamUrl,
      userAgent,
      visitorData,
      xClientName,
      clientVersion,
      clientName,
      duration: videoDuration,
    } = body;

    if (!videoId || !streamUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: videoId, streamUrl' },
        { status: 400 },
      );
    }

    const startSec = Math.max(0, Number(startTime) || 0);
    const endSec = Math.max(startSec + 1, Number(endTime) || startSec + 30);
    const clipDuration = Math.min(endSec - startSec, 90);

    // Build CF Worker /stream URL (fast path with streamUrl param)
    const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim().replace(/\/$/, '');
    if (!cfWorkerUrl) {
      return NextResponse.json(
        { error: 'CF_WORKER_URL not configured' },
        { status: 500 },
      );
    }

    const streamEndpoint = new URL(cfWorkerUrl);
    streamEndpoint.pathname = `${streamEndpoint.pathname.replace(/\/$/, '')}/stream`;
    streamEndpoint.searchParams.set('videoId', String(videoId));
    streamEndpoint.searchParams.set('maxHeight', '720');
    streamEndpoint.searchParams.set('streamUrl', String(streamUrl));
    streamEndpoint.searchParams.set('userAgent', String(userAgent || ''));
    streamEndpoint.searchParams.set('visitorData', String(visitorData || ''));
    streamEndpoint.searchParams.set('xClientName', String(xClientName || '1'));
    streamEndpoint.searchParams.set('clientVersion', String(clientVersion || ''));
    streamEndpoint.searchParams.set('clientName', String(clientName || 'direct'));
    streamEndpoint.searchParams.set('muxed', '1');

    const fullStreamUrl = streamEndpoint.toString();

    // Find ffmpeg binary
    const ffmpegPath = await findFfmpegBinary();
    if (!ffmpegPath) {
      return NextResponse.json(
        { error: 'ffmpeg binary not found' },
        { status: 500 },
      );
    }

    console.log(`[cut-clip] ffmpeg=${ffmpegPath}, videoId=${videoId}, start=${startSec}s, duration=${clipDuration}s`);

    // Step 1: HEAD request to get Content-Length
    console.log('[cut-clip] HEAD request to get Content-Length...');
    const headRes = await fetch(fullStreamUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(15_000),
    });

    if (!headRes.ok) {
      return NextResponse.json(
        { error: `CF Worker /stream HEAD failed: HTTP ${headRes.status}` },
        { status: 502 },
      );
    }

    const contentLength = parseInt(headRes.headers.get('content-length') || '0', 10);
    const acceptRanges = headRes.headers.get('accept-ranges');
    console.log(`[cut-clip] Content-Length=${contentLength}, Accept-Ranges=${acceptRanges}`);

    if (!contentLength || contentLength < 10_000) {
      return NextResponse.json(
        { error: `Invalid Content-Length: ${contentLength}` },
        { status: 502 },
      );
    }

    // Step 2: Calculate byte range for the clip segment
    // Use video duration to estimate bitrate, then map time to bytes
    const vidDur = Number(videoDuration) || 822; // fallback to known duration
    const bytesPerSec = contentLength / vidDur;
    console.log(`[cut-clip] bitrate estimate: ${bytesPerSec.toFixed(0)} bytes/s (${(bytesPerSec / 1024).toFixed(1)} KB/s)`);

    // Add 15s buffer before startTime (for keyframe alignment) and 10s after endTime
    const bufferBefore = 15;
    const bufferAfter = 10;
    const startByte = Math.max(0, Math.floor((startSec - bufferBefore) * bytesPerSec));
    const endByte = Math.min(contentLength - 1, Math.ceil((endSec + bufferAfter) * bytesPerSec));
    const downloadBytes = endByte - startByte + 1;

    console.log(`[cut-clip] Downloading bytes [${startByte}, ${endByte}] = ${(downloadBytes / 1024 / 1024).toFixed(2)} MB`);

    // Step 3: Download the byte range via chunked Range requests (2MB each)
    // googlevideo.com limits CF Worker to 2MB per request
    const chunks: Buffer[] = [];
    let downloaded = 0;
    const downloadStart = Date.now();
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), DOWNLOAD_TIMEOUT_MS);

    try {
      while (downloaded < downloadBytes) {
        const chunkStart = startByte + downloaded;
        const chunkEnd = Math.min(chunkStart + MAX_CHUNK_BYTES, endByte);
        const chunkRange = `bytes=${chunkStart}-${chunkEnd}`;

        console.log(`[cut-clip] Range ${chunkRange} (${downloaded}/${downloadBytes} bytes, chunk ${chunks.length + 1})`);

        const chunkRes = await fetch(fullStreamUrl, {
          headers: { Range: chunkRange },
          signal: abortController.signal,
        });

        if (!chunkRes.ok && chunkRes.status !== 206) {
          throw new Error(`Range request failed: HTTP ${chunkRes.status}`);
        }

        const chunkBuf = Buffer.from(await chunkRes.arrayBuffer());
        if (chunkBuf.length === 0) {
          throw new Error('Empty chunk received');
        }

        chunks.push(chunkBuf);
        downloaded += chunkBuf.length;

        // If we got less than requested, we've hit the end of the file
        if (chunkBuf.length < (chunkEnd - chunkStart + 1)) {
          console.log(`[cut-clip] Short read (${chunkBuf.length} bytes), reached end of file`);
          break;
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const downloadedBuffer = Buffer.concat(chunks);
    const downloadMs = Date.now() - downloadStart;
    console.log(`[cut-clip] Downloaded ${downloadedBuffer.length} bytes in ${(downloadMs / 1000).toFixed(1)}s`);

    if (downloadedBuffer.length < 50_000) {
      return NextResponse.json(
        { error: `Downloaded too little data: ${downloadedBuffer.length} bytes` },
        { status: 502 },
      );
    }

    // Step 4: Write downloaded data to temp file
    await writeFile(inputPath, downloadedBuffer);
    console.log(`[cut-clip] Written to ${inputPath}`);

    // Step 5: ffmpeg reads from local file, seeks, cuts
    // Adjusted start time within the downloaded portion:
    //   The downloaded file starts at time (startByte / bytesPerSec)
    //   So the clip starts at (startSec - startByte / bytesPerSec) within the file
    const fileStartTime = startByte / bytesPerSec;
    const adjustedStart = Math.max(0, startSec - fileStartTime);
    console.log(`[cut-clip] fileStartTime=${fileStartTime}s, adjustedStart=${adjustedStart}s`);

    try {
      await execFileAsync(ffmpegPath, [
        '-y',
        '-ss', String(adjustedStart),
        '-i', inputPath,
        '-t', String(clipDuration),
        '-c', 'copy',
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero',
        outputPath,
      ], {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 30_000,
        env: { ...process.env, LANG: 'C' },
      });
    } catch (execErr: any) {
      const stderr = execErr?.stderr || '';
      const stdout = execErr?.stdout || '';
      throw new Error(`ffmpeg exec failed: ${execErr?.message?.slice(0, 200)} || STDERR: ${String(stderr).slice(0, 1000)} || STDOUT: ${String(stdout).slice(0, 200)}`);
    }

    const outputData = await readFile(outputPath);

    if (outputData.length < 5_000) {
      throw new Error(`Output file too small: ${outputData.length} bytes`);
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
 * Find ffmpeg binary path using the same multi-level fallback as video-clipper.ts.
 * Works on both local dev and Vercel Lambda.
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
