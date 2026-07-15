import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile, unlink, access, constants as fsConstants } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const execFileAsync = promisify(execFile);

/**
 * /api/remux-mp4 — Convert fMP4 or webm to standard progressive MP4.
 *
 * MediaRecorder produces either:
 *   - fMP4 (fragmented MP4): ftyp + moov(mvex) + moof + mdat — NOT playable
 *   - webm (VP8/VP9 + Opus/Vorbis) — NOT playable in QuickTime/WMP
 *
 * This endpoint converts both to standard progressive MP4:
 *   - fMP4 input: ffmpeg -c copy (remux, fast ~1-2s, no re-encoding)
 *   - webm input: ffmpeg -c:v libx264 -c:a aac (transcode, slower ~5-10s)
 *
 * Output: standard progressive MP4 (ftyp + moov + mdat, +faststart)
 * Plays in ALL desktop players (QuickTime, VLC, Windows Media Player).
 *
 * Input: multipart/form-data with a "file" field (fMP4 or webm blob)
 * Output: standard MP4 file (video/mp4)
 */
export async function POST(request: NextRequest) {
  const inputPath = join(tmpdir(), `remux-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const outputPath = join(tmpdir(), `remux-output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 },
      );
    }

    // Limit input size to 50MB (clips are typically 1-10MB)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: `File too large: ${file.size} bytes (max 50MB)` },
        { status: 413 },
      );
    }

    // Determine input format from filename/MIME type
    const fileName = file.name || '';
    const mimeType = file.type || '';
    const isWebm = fileName.endsWith('.webm') || mimeType.includes('webm');
    const inputExt = isWebm ? 'webm' : 'mp4';
    const inputPathWithExt = `${inputPath}.${inputExt}`;

    // Write input to temp file
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(inputPathWithExt, Buffer.from(arrayBuffer));

    console.log(`[remux-mp4] Input: ${file.size} bytes, type=${mimeType}, ext=${inputExt}`);

    // Find ffmpeg binary
    const ffmpegPath = await findFfmpegBinary();
    if (!ffmpegPath) {
      console.error('[remux-mp4] ffmpeg binary not found');
      return NextResponse.json(
        { error: 'ffmpeg binary not found' },
        { status: 500 },
      );
    }

    console.log(`[remux-mp4] ffmpeg=${ffmpegPath}`);

    // Build ffmpeg args based on input format
    let ffmpegArgs: string[];
    if (isWebm) {
      // webm → MP4: must transcode (VP8/VP9 → H264, Opus/Vorbis → AAC)
      // -c:v libx264: re-encode video to H264
      // -c:a aac: re-encode audio to AAC
      // -preset ultrafast: fastest encoding (needed on Vercel's limited CPU)
      // -crf 28: reasonable quality (lower = better, 23=default, 28=smaller file)
      // -movflags +faststart: moov atom at beginning (desktop player compatible)
      ffmpegArgs = [
        '-y',
        '-i', inputPathWithExt,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero',
        outputPath,
      ];
    } else {
      // fMP4 → standard MP4: remux (no re-encoding, very fast)
      // -c copy: copy codecs without re-encoding
      // -movflags +faststart: moov atom at beginning
      ffmpegArgs = [
        '-y',
        '-i', inputPathWithExt,
        '-c', 'copy',
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero',
        outputPath,
      ];
    }

    try {
      await execFileAsync(ffmpegPath, ffmpegArgs, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 45_000,
        env: { ...process.env, LANG: 'C' },
      });
    } catch (execErr: any) {
      const stderr = execErr?.stderr || '';
      const stdout = execErr?.stdout || '';
      throw new Error(`ffmpeg exec failed: ${execErr?.message?.slice(0, 200)} || STDERR: ${String(stderr).slice(0, 1000)} || STDOUT: ${String(stdout).slice(0, 200)}`);
    }

    const outputData = await readFile(outputPath);

    if (outputData.length < 1000) {
      throw new Error(`Remuxed file too small: ${outputData.length} bytes`);
    }

    console.log(`[remux-mp4] Success: ${outputData.length} bytes (${isWebm ? 'transcoded' : 'remuxed'})`);

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
    console.error('[remux-mp4] Error:', msg.slice(0, 1000));
    return NextResponse.json(
      { error: `Remux failed: ${msg.slice(0, 2000)}` },
      { status: 500 },
    );
  } finally {
    // Cleanup temp files (both with and without extension)
    await unlink(inputPath).catch(() => {});
    await unlink(`${inputPath}.mp4`).catch(() => {});
    await unlink(`${inputPath}.webm`).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Find ffmpeg binary path using the same multi-level fallback as cut-clip.
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
