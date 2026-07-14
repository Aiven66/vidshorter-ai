import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * /api/remux-mp4
 *
 * Converts a fragmented MP4 (fMP4) produced by MediaRecorder into a
 * standard MP4 that all desktop players (QuickTime, VLC, Windows Media
 * Player) can play.
 *
 * MediaRecorder outputs fMP4 (ftyp + moov with mvex + moof + mdat fragments).
 * Standard players expect a progressive MP4 (ftyp + moov + mdat, with moov
 * placed at the beginning via +faststart).
 *
 * ffmpeg remuxes without re-encoding (-c copy), so it's very fast (~1-2s).
 *
 * Input: multipart/form-data with a "file" field containing the fMP4 blob
 * Output: standard MP4 file (video/mp4)
 */
export async function POST(request: NextRequest) {
  const inputPath = join(tmpdir(), `remux-input-${Date.now()}.mp4`);
  const outputPath = join(tmpdir(), `remux-output-${Date.now()}.mp4`);

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

    // Write input to temp file
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

    // Get ffmpeg binary path (same logic as video-clipper)
    let ffmpegPath = '';
    try {
      const ffmpegStatic: string = require('ffmpeg-static');
      if (ffmpegStatic) ffmpegPath = ffmpegStatic;
    } catch { /* fall through */ }
    if (!ffmpegPath) {
      try {
        const installer = require('@ffmpeg-installer/ffmpeg');
        if (installer?.path) ffmpegPath = installer.path;
      } catch { /* fall through */ }
    }

    if (!ffmpegPath) {
      // No ffmpeg available — return the original file as-is
      const originalData = await readFile(inputPath);
      return new NextResponse(originalData, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': 'attachment; filename="clip.mp4"',
        },
      });
    }

    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    // Remux fMP4 to standard MP4 (-c copy = no re-encoding, +faststart = moov at beginning)
    await execFileAsync(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30_000,
    });

    const outputData = await readFile(outputPath);

    if (outputData.length < 1000) {
      throw new Error(`Remuxed file too small: ${outputData.length} bytes`);
    }

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
    console.error('[remux-mp4] Error:', msg);
    return NextResponse.json(
      { error: `Remux failed: ${msg.slice(0, 200)}` },
      { status: 500 },
    );
  } finally {
    // Cleanup temp files
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
