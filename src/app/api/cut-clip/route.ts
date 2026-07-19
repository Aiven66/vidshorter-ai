import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, unlink, access, constants as fsConstants } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel default; server downloads + cuts in ~50s

const execFileAsync = promisify(execFile);

/**
 * /api/cut-clip — Server-side ffmpeg clip cutting (v51 dual-stream merge)
 *
 * APPROACH (v51 — supports separate audio stream):
 *   Browser sends streamUrl + optional audioUrl + metadata. Server downloads
 *   the video bytes (and audio bytes if audioUrl is provided) using Node.js
 *   fetch via the CF Worker /stream proxy. ffmpeg then cuts and merges:
 *     - No audioUrl: single input `-i video -c copy` (muxed stream — has audio)
 *     - With audioUrl: dual input `-i video -i audio -c:v copy -c:a aac`
 *
 * WHY dual-stream support:
 *   v48-v50 assumed /resolve?muxed=1 always returned a combined video+audio
 *   stream. But YouTube InnerTube API sometimes returns video-only DASH +
 *   separate audio (adaptiveFormats) even when muxed=1 is requested — the
 *   IOS client may not have muxed formats for certain videos. The CF Worker
 *   now passes audioUrl through, and /api/cut-clip must download and merge
 *   both streams; otherwise the output MP4 has NO AUDIO.
 *
 * Input: JSON body
 *   - streamUrl: string (resolved googlevideo.com URL — video or muxed)
 *   - audioUrl?: string (separate audio stream URL, when /resolve returned
 *                  adaptiveFormats)
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
  const audioPath = join(tmpdir(), `cut-audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`);
  const outputPath = join(tmpdir(), `cut-output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);

  try {
    const contentType = request.headers.get('content-type') || '';

    let streamUrl = '';
    let audioUrl = '';
    let userAgent = '';
    let visitorData = '';
    let videoId = '';
    let startTime = 0;
    let duration = 30;

    // Support both JSON and multipart/form-data (for backwards compat)
    if (contentType.includes('application/json')) {
      const body = await request.json();
      streamUrl = body.streamUrl || '';
      audioUrl = body.audioUrl || '';
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
        return await cutLocalFile(inputPath, outputPath, startTime, duration, null);
      }
      streamUrl = String(formData.get('streamUrl') || '');
      audioUrl = String(formData.get('audioUrl') || '');
      userAgent = String(formData.get('userAgent') || '');
      visitorData = String(formData.get('visitorData') || '');
      videoId = String(formData.get('videoId') || '');
      startTime = Number(formData.get('startTime')) || 0;
      duration = Math.min(Number(formData.get('duration')) || 30, 90);
    }

    if (!streamUrl) {
      return NextResponse.json({ error: 'No streamUrl provided' }, { status: 400 });
    }

    console.log(`[cut-clip] v51 server-download: videoId=${videoId}, startTime=${startTime}s, duration=${duration}s, hasAudioUrl=${!!audioUrl}`);

    // Build CF Worker /stream URL (acts as a proxy that re-fetches from googlevideo.com
    // using the CF Worker's IP, which matches the streamUrl's IP binding).
    const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim().replace(/\/$/, '');
    if (!cfWorkerUrl) {
      return NextResponse.json({ error: 'CF_WORKER_URL not configured' }, { status: 500 });
    }

    // Download video stream (streamUrl)
    const videoBuf = await downloadStreamViaCfWorker(
      cfWorkerUrl, videoId, streamUrl, userAgent, visitorData, /*audio*/ false, /*audioUrl*/ null,
    );
    if (!videoBuf || videoBuf.length < 50_000) {
      return NextResponse.json({
        error: `Video download failed or too small: ${videoBuf ? videoBuf.length : 0} bytes`,
      }, { status: 502 });
    }
    await writeFile(inputPath, videoBuf);
    console.log(`[cut-clip] Video downloaded: ${videoBuf.length} bytes (${(videoBuf.length / 1024 / 1024).toFixed(1)}MB)`);

    // Download audio stream (audioUrl) if provided — this is the key v51 change.
    // When /resolve returned adaptiveFormats (video-only + audio), we MUST fetch
    // the audio stream separately and merge with ffmpeg. Without this, the cut
    // clip has video but NO AUDIO.
    let downloadedAudioPath: string | null = null;
    if (audioUrl) {
      console.log(`[cut-clip] Downloading audio stream separately...`);
      const audioBuf = await downloadStreamViaCfWorker(
        cfWorkerUrl, videoId, /*streamUrl*/ '', userAgent, visitorData, /*audio*/ true, audioUrl,
      );
      if (audioBuf && audioBuf.length > 5_000) {
        await writeFile(audioPath, audioBuf);
        downloadedAudioPath = audioPath;
        console.log(`[cut-clip] Audio downloaded: ${audioBuf.length} bytes (${(audioBuf.length / 1024 / 1024).toFixed(1)}MB)`);
      } else {
        console.warn(`[cut-clip] Audio download failed or too small: ${audioBuf ? audioBuf.length : 0} bytes — will use video-only`);
      }
    }

    // Now cut the clip using ffmpeg (with optional dual-stream merge)
    return await cutLocalFile(inputPath, outputPath, startTime, duration, downloadedAudioPath);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[cut-clip] Error:', msg.slice(0, 1000));
    return NextResponse.json(
      { error: `Cut clip failed: ${msg.slice(0, 2000)}` },
      { status: 500 },
    );
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(audioPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Download a stream (video or audio) via the CF Worker /stream proxy.
 * Returns Buffer on success, null on failure.
 *
 * For video (audio=false): uses /stream?streamUrl=<url>&muxed=1
 * For audio (audio=true):  uses /stream?audioUrl=<url>&audio=1
 *   — The CF Worker's fast path checks audioUrl param when wantAudio=true,
 *     so we MUST pass audioUrl as a query param (not just streamUrl).
 */
async function downloadStreamViaCfWorker(
  cfWorkerUrl: string,
  videoId: string,
  streamUrl: string,
  userAgent: string,
  visitorData: string,
  audio: boolean,
  audioUrl: string | null,
): Promise<Buffer | null> {
  const proxyUrl = new URL(cfWorkerUrl.replace(/\/$/, '') + '/stream');
  proxyUrl.searchParams.set('videoId', videoId);
  proxyUrl.searchParams.set('maxHeight', '720');
  if (audio) {
    proxyUrl.searchParams.set('audio', '1');
    if (audioUrl) proxyUrl.searchParams.set('audioUrl', audioUrl);
    // For audio-only requests, the streamUrl param is not required —
    // doFetch() in worker.js uses audioUrl when wantAudio=true.
  } else {
    proxyUrl.searchParams.set('muxed', '1');
    if (streamUrl) proxyUrl.searchParams.set('streamUrl', streamUrl);
  }
  if (userAgent) proxyUrl.searchParams.set('userAgent', userAgent);
  if (visitorData) proxyUrl.searchParams.set('visitorData', visitorData);

  console.log(`[cut-clip] Downloading ${audio ? 'audio' : 'video'} via CF Worker /stream...`);

  // First HEAD to get content-length
  const headRes = await fetch(proxyUrl.toString(), {
    method: 'HEAD',
    signal: AbortSignal.timeout(15_000),
  }).catch((err) => {
    console.warn(`[cut-clip] HEAD (${audio ? 'audio' : 'video'}) failed:`, err instanceof Error ? err.message : err);
    return null;
  });

  let contentLength = 0;
  if (headRes && headRes.ok) {
    contentLength = parseInt(headRes.headers.get('content-length') || '0', 10);
  }

  // If HEAD failed or returned no content-length, fall back to a GET with Range 0-1
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

  if (!contentLength || contentLength < 5_000) {
    console.warn(`[cut-clip] Cannot determine ${audio ? 'audio' : 'video'} content length (HEAD returned ${contentLength}).`);
    return null;
  }

  console.log(`[cut-clip] ${audio ? 'Audio' : 'Video'} Content-Length: ${contentLength} bytes`);

  // Cap downloads to keep Vercel function under 60s.
  //   Video: 80MB (360p muxed ~470KB/s covers ~170s of video)
  //   Audio: 5MB  (audio streams are tiny, ~30KB/s)
  const maxDownloadBytes = Math.min(contentLength, audio ? 5 * 1024 * 1024 : 80 * 1024 * 1024);

  // Download in 2MB chunks (googlevideo.com per-request limit on CF Worker)
  const chunks: Buffer[] = [];
  let downloaded = 0;
  const MAX_CHUNK = 2 * 1024 * 1024;
  const totalChunks = Math.ceil(maxDownloadBytes / MAX_CHUNK);

  console.log(`[cut-clip] Will download ${totalChunks} chunks (${(maxDownloadBytes / 1024 / 1024).toFixed(1)}MB) for ${audio ? 'audio' : 'video'}`);

  for (let i = 0; i < totalChunks; i++) {
    const chunkStart = i * MAX_CHUNK;
    const chunkEnd = Math.min(chunkStart + MAX_CHUNK - 1, maxDownloadBytes - 1);

    const chunkRes = await fetch(proxyUrl.toString(), {
      headers: { Range: `bytes=${chunkStart}-${chunkEnd}` },
      signal: AbortSignal.timeout(30_000),
    });

    if (!chunkRes.ok && chunkRes.status !== 206) {
      console.warn(`[cut-clip] ${audio ? 'Audio' : 'Video'} chunk ${i + 1}/${totalChunks} failed: HTTP ${chunkRes.status}`);
      if (i === 0) return null;
      break;
    }

    const chunkBuf = Buffer.from(await chunkRes.arrayBuffer());
    if (chunkBuf.length === 0) {
      console.log(`[cut-clip] ${audio ? 'Audio' : 'Video'} chunk ${i + 1}: empty (end of file)`);
      break;
    }

    // Validate first chunk has ftyp header (skip for audio — may not start with ftyp)
    if (i === 0 && chunkBuf.length >= 8 && !audio) {
      const boxType = chunkBuf.slice(4, 8).toString('ascii');
      if (boxType !== 'ftyp') {
        console.warn(`[cut-clip] First video chunk missing ftyp header (got: "${boxType}"). Stream may be invalid.`);
        return null;
      }
      console.log(`[cut-clip] Video chunk 1: ftyp header OK`);
    }

    chunks.push(chunkBuf);
    downloaded += chunkBuf.length;

    // Short read = end of file
    if (chunkBuf.length < (chunkEnd - chunkStart + 1)) break;

    if (i % 10 === 0 || i === totalChunks - 1) {
      console.log(`[cut-clip] ${audio ? 'Audio' : 'Video'} chunk ${i + 1}/${totalChunks}: downloaded ${downloaded} bytes (${Math.round(downloaded / 1024 / 1024)}MB)`);
    }
  }

  if (downloaded < (audio ? 5_000 : 50_000)) {
    console.warn(`[cut-clip] ${audio ? 'Audio' : 'Video'} downloaded too little: ${downloaded} bytes`);
    return null;
  }

  return Buffer.concat(chunks);
}

/**
 * Cut a clip from a local MP4 file using ffmpeg.
 *
 * When audioPath is null: single-input `-i video -c copy` (muxed stream).
 * When audioPath is provided: dual-input `-i video -i audio -c:v copy -c:a aac`
 *   (merges video-only stream with separate audio stream).
 *
 * Tries -c copy first (fast remux); falls back to re-encode if that fails.
 */
async function cutLocalFile(
  inputPath: string,
  outputPath: string,
  startTime: number,
  duration: number,
  audioPath: string | null,
): Promise<NextResponse> {
  const ffmpegPath = await findFfmpegBinary();
  if (!ffmpegPath) {
    return NextResponse.json({ error: 'ffmpeg binary not found' }, { status: 500 });
  }

  console.log(`[cut-clip] ffmpeg=${ffmpegPath}, startTime=${startTime}s, duration=${duration}s, audioPath=${audioPath ? '(set)' : '(none)'}`);

  let cutSuccess = false;
  let lastError = '';

  // Attempt 1: -c copy (fast remux) — single or dual input
  try {
    const args: string[] = ['-y', '-ss', String(startTime)];
    if (audioPath) {
      // Dual-input: video + separate audio stream
      // -c:v copy preserves video quality; -c:a aac re-encodes audio (necessary
      // because the audio stream container may not match the output container).
      args.push('-i', inputPath, '-i', audioPath, '-t', String(duration));
      args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k');
      args.push('-map', '0:v:0', '-map', '1:a:0'); // explicitly select video + audio
    } else {
      // Single input: muxed stream (already has audio)
      args.push('-i', inputPath, '-t', String(duration));
      args.push('-c', 'copy');
    }
    args.push('-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', outputPath);

    await execFileAsync(ffmpegPath, args, {
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
      const args: string[] = ['-y', '-ss', String(startTime)];
      if (audioPath) {
        args.push('-i', inputPath, '-i', audioPath, '-t', String(duration));
        args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28');
        args.push('-c:a', 'aac', '-b:a', '128k');
        args.push('-map', '0:v:0', '-map', '1:a:0');
      } else {
        args.push('-i', inputPath, '-t', String(duration));
        args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28');
        args.push('-c:a', 'aac', '-b:a', '128k');
      }
      args.push('-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', outputPath);

      await execFileAsync(ffmpegPath, args, {
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
