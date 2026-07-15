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
 * /api/cut-clip — Server-side ffmpeg clip cutting (v46)
 *
 * APPROACH: Browser downloads video bytes from byte 0 (includes MP4 header)
 * via CF Worker /stream and uploads them to this endpoint. Server ffmpeg then
 * reads from the LOCAL uploaded file, seeks to startTime, cuts for duration,
 * and outputs a standard progressive MP4.
 *
 * v46 FIX: v45 downloaded partial bytes starting at (startTime-15)*bytesPerSec,
 * which SKIPPED the MP4 header (ftyp + moov). ffmpeg couldn't read the file.
 * v46 always starts at byte 0.
 *
 * FALLBACK: If -c copy fails (bad keyframe alignment, corrupted data),
 * retries with -c:v libx264 -c:a aac (re-encode, slower but more robust).
 *
 * Input: multipart/form-data
 *   - file: video bytes (Blob, MUST start from byte 0 of the MP4 file)
 *   - startTime: number (seconds, position within the uploaded video)
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
    //
    // If -c copy fails (e.g., corrupted stream, bad keyframe alignment),
    // fall back to re-encoding with libx264 + aac (slower but more robust).
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
      const stdout = String(execErr?.stdout || '');
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
      throw new Error(`ffmpeg both attempts failed: ${lastError.slice(0, 1000)}`);
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
