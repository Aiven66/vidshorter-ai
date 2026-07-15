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
 * /api/cut-clip — Server-side ffmpeg clip cutting (v45)
 *
 * APPROACH: Browser downloads the video bytes (via CF Worker /stream, same
 * colo as /resolve) and uploads them to this endpoint. Server ffmpeg then
 * reads from the LOCAL uploaded file, seeks to startTime, cuts for duration,
 * and outputs a standard progressive MP4.
 *
 * WHY browser-download + server-cut:
 *   - Server ffmpeg's TLS is too old (2018 build) to read HTTPS URLs directly
 *   - Server-side CF Worker /stream download fails (colo-mismatch 403)
 *   - Server-side googlevideo.com download fails (Vercel IP blocked)
 *   - Browser-side captureStream + MediaRecorder produces fMP4 (not playable)
 *   - Browser-download + server-cut avoids ALL these issues:
 *     ✓ Browser fetch has modern TLS
 *     ✓ Browser and /resolve hit the same CF Worker colo (no mismatch)
 *     ✓ Server ffmpeg reads from LOCAL file (no TLS needed)
 *     ✓ ffmpeg outputs standard progressive MP4 (+faststart)
 *
 * Flow:
 *   1. Browser: resolve streamUrl via CF Worker /resolve
 *   2. Browser: HEAD CF Worker /stream → get Content-Length
 *   3. Browser: calculate byte range for [startTime, endTime] + buffer
 *   4. Browser: download bytes via chunked Range requests (2MB each)
 *   5. Browser: upload bytes to this endpoint (multipart/form-data)
 *   6. Server: ffmpeg -ss <adjusted> -i <uploaded_file> -t <dur> -c copy +faststart
 *   7. Server: return standard MP4
 *   8. Browser: download the MP4
 *
 * Input: multipart/form-data
 *   - file: video bytes (Blob)
 *   - startTime: number (seconds, within the uploaded portion)
 *   - duration: number (seconds to cut)
 *
 * Output: video/mp4 (standard progressive MP4 with +faststart)
 */
export async function POST(request: NextRequest) {
  const inputPath = join(tmpdir(), `cut-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);
  const outputPath = join(tmpdir(), `cut-output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const startTimeStr = formData.get('startTime');
    const durationStr = formData.get('duration');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 },
      );
    }

    const startTime = Number(startTimeStr) || 0;
    const duration = Math.min(Number(durationStr) || 30, 90);

    // Limit upload size to 100MB (clips at 360p muxed are ~450KB/s,
    // so 100MB covers ~220s of video, enough for any clip + buffer)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        { error: `File too large: ${file.size} bytes (max 100MB)` },
        { status: 413 },
      );
    }

    if (file.size < 10_000) {
      return NextResponse.json(
        { error: `File too small: ${file.size} bytes` },
        { status: 400 },
      );
    }

    // Write uploaded file to disk
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

    console.log(`[cut-clip] Input: ${file.size} bytes, startTime=${startTime}s, duration=${duration}s`);

    // Find ffmpeg binary
    const ffmpegPath = await findFfmpegBinary();
    if (!ffmpegPath) {
      return NextResponse.json(
        { error: 'ffmpeg binary not found' },
        { status: 500 },
      );
    }

    console.log(`[cut-clip] ffmpeg=${ffmpegPath}`);

    // ffmpeg: seek to startTime, cut for duration, copy codecs, +faststart
    // -ss before -i: fast seek (demuxer-level, keyframe-based)
    // -c copy: no re-encoding (fast, lossless)
    // -movflags +faststart: moov atom at file beginning (desktop player compatible)
    // -avoid_negative_ts make_zero: normalize timestamps to start at 0
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
