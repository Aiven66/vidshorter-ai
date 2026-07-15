import { NextRequest, NextResponse } from 'next/server';
import { readFile, unlink, access, constants as fsConstants } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const execFileAsync = promisify(execFile);

/**
 * /api/cut-clip — Server-side ffmpeg clip cutting
 *
 * APPROACH (v45 — completely different from v41-v44):
 *   Previous versions used browser-side captureStream + MediaRecorder, which
 *   produces fragmented MP4 (fMP4) that desktop players cannot play.
 *   v44 added a remux step (fMP4 → standard MP4), but ffmpeg path issues
 *   on Vercel caused failures.
 *
 *   v45 eliminates MediaRecorder entirely. ffmpeg reads directly from the
 *   CF Worker /stream URL (which proxies googlevideo.com with CORS headers
 *   and Range support). ffmpeg seeks to startTime via HTTP Range requests,
 *   cuts for the specified duration, and outputs a standard progressive MP4
 *   (ftyp + moov + mdat with +faststart).
 *
 * Flow:
 *   1. Browser resolves streamUrl via CF Worker /resolve
 *   2. Browser POSTs stream metadata + startTime + endTime to this endpoint
 *   3. Server builds CF Worker /stream URL (fast path with streamUrl param)
 *   4. ffmpeg: -ss <startTime> -i <streamUrl> -t <duration> -c copy -movflags +faststart output.mp4
 *   5. Server returns the standard MP4
 *   6. Browser downloads it
 *
 * WHY this is reliable:
 *   - No MediaRecorder → no fMP4
 *   - No captureStream → no CORS issues
 *   - No browser recording → no user activation issues
 *   - ffmpeg handles HTTP seeking via Range requests natively
 *   - CF Worker /stream passes through Content-Length, Accept-Ranges, Content-Range
 *   - Output is guaranteed to be a proper progressive MP4 (+faststart)
 *   - ffmpeg is already proven to work on Vercel (video-clipper.ts uses the same binary)
 */
export async function POST(request: NextRequest) {
  const outputPath = join(tmpdir(), `cut-clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);

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
    } = body;

    if (!videoId || !streamUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: videoId, streamUrl' },
        { status: 400 },
      );
    }

    const startSec = Math.max(0, Number(startTime) || 0);
    const endSec = Math.max(startSec + 1, Number(endTime) || startSec + 30);
    const duration = Math.min(endSec - startSec, 90);

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

    // Find ffmpeg binary (same fallback chain as video-clipper.ts)
    const ffmpegPath = await findFfmpegBinary();
    if (!ffmpegPath) {
      return NextResponse.json(
        { error: 'ffmpeg binary not found' },
        { status: 500 },
      );
    }

    console.log(`[cut-clip] ffmpeg=${ffmpegPath}, videoId=${videoId}, start=${startSec}s, duration=${duration}s`);

    // Run ffmpeg:
    // -ss before -i: fast seek via HTTP Range (keyframe-based)
    // -c copy: no re-encoding (fast, lossless)
    // -movflags +faststart: moov atom at file beginning (desktop player compatible)
    // -rw_timeout: 30s socket timeout (microseconds)
    console.log(`[cut-clip] Running ffmpeg with URL length: ${fullStreamUrl.length}`);
    try {
      await execFileAsync(ffmpegPath, [
        '-y',
        '-rw_timeout', '30000000',
        '-ss', String(startSec),
        '-i', fullStreamUrl,
        '-t', String(duration),
        '-c', 'copy',
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero',
        outputPath,
      ], {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 45_000,
        env: { ...process.env, LANG: 'C' },
      });
    } catch (execErr: any) {
      const stderr = execErr?.stderr || '';
      const stdout = execErr?.stdout || '';
      throw new Error(`ffmpeg exec failed: ${execErr?.message?.slice(0, 200)} || STDERR: ${String(stderr).slice(0, 1500)} || STDOUT: ${String(stdout).slice(0, 300)}`);
    }

    const outputData = await readFile(outputPath);

    if (outputData.length < 5_000) {
      throw new Error(`Output file too small: ${outputData.length} bytes (stream may be blocked or unavailable)`);
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
