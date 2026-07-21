import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, unlink, access, constants as fsConstants } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// v55: Increased from 60s to 300s to match vercel.json and allow ffmpeg direct
// stream read fallback (which can take longer but is more reliable).
// Previous 60s cap was the root cause of "download failed" — server downloads
// (80MB ~40s) + ffmpeg cut (~10s) = ~50s, dangerously close to the 60s limit.
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

/**
 * /api/cut-clip — Server-side ffmpeg clip cutting (v58 muxed-single-input-audio-sync)
 *
 * APPROACH (v58 — always use muxed single input + ffmpeg -ss, audio synced):
 *   Browser sends streamUrl (resolved googlevideo.com URL) + metadata (JSON).
 *   Server ALWAYS uses a single muxed (combined video+audio) stream from CF
 *   Worker /stream?muxed=1, regardless of whether /resolve returned a separate
 *   audioUrl. ffmpeg reads directly from the CF Worker /stream URL using HTTP
 *   input, with `-ss startTime` BEFORE `-i` for fast seek to the correct
 *   position. Only ~5-10MB of data is downloaded.
 *
 *   Total time: ~10-15s.
 *
 * WHY muxed single-input (not dual-input):
 *   v56/v57 dual-input (video + separate audio) caused 5.353s audio/video
 *   drift because ffmpeg's `-ss` on dual inputs preserves original timestamps
 *   differently for each stream. v57 tried to use CF Worker's `begin` parameter
 *   to make YouTube return streams starting at startTime — but YouTube IGNORES
 *   the `begin` parameter (URL signature sig/lsig mismatch), so all outputs
 *   started from 0:00 (verified by comparing MD5 of outputs with begin=30s vs
 *   begin=60s — they were identical).
 *
 *   Local tests confirmed that muxed stream (itag 18, 360p) single input +
 *   `-ss 30` produces drift=0.056s (essentially perfect sync). This is the
 *   ONLY reliable approach. Trade-off: 360p quality instead of 720p, but
 *   audio sync is critical (user's "no sound" complaint).
 *
 * FALLBACK (v51 path — download + cut):
 *   If direct ffmpeg read fails (e.g., TLS issues, network errors), fall back
 *   to the v51 approach: download video bytes to local file, then ffmpeg cut.
 *   This is slower but more robust for edge cases.
 *
 * Input: JSON body
 *   - streamUrl: string (resolved googlevideo.com URL — video or muxed)
 *   - audioUrl?: string (IGNORED in v58 — kept for API compatibility)
 *   - userAgent: string (from /resolve response)
 *   - visitorData: string (from /resolve response)
 *   - xClientName?: string|number
 *   - clientVersion?: string
 *   - clientName?: string
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
    let xClientName: string | number = '1';
    let clientVersion = '';
    let clientName = 'direct';
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
      xClientName = body.xClientName || '1';
      clientVersion = body.clientVersion || '';
      clientName = body.clientName || 'direct';
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

    console.log(`[cut-clip] v58 videoId=${videoId}, startTime=${startTime}s, duration=${duration}s, hasAudioUrl=${!!audioUrl} (IGNORED — v58 always uses muxed single input)`);

    const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim().replace(/\/$/, '');
    if (!cfWorkerUrl) {
      return NextResponse.json({ error: 'CF_WORKER_URL not configured' }, { status: 500 });
    }

    // ── v58 PRIMARY PATH: direct ffmpeg read from CF Worker /stream (muxed) ──
    // Build CF Worker /stream URL with streamUrl param + muxed=1 (fast path).
    // ffmpeg reads this URL directly via HTTP input, using -ss fast seek
    // to jump to startTime. Only ~5-10MB of data is downloaded.
    // v58: ALWAYS use muxed single input (ignore audioUrl) to guarantee
    // audio/video sync. Dual-input + -ss caused 5.353s drift in v56/v57.
    try {
      const result = await cutFromStreamUrl({
        cfWorkerUrl,
        streamUrl,
        audioUrl,
        userAgent,
        visitorData,
        xClientName,
        clientVersion,
        clientName,
        videoId,
        startTime,
        duration,
        outputPath,
      });
      if (result) return result;
    } catch (directErr) {
      const msg = directErr instanceof Error ? directErr.message : String(directErr);
      console.warn(`[cut-clip] v58 direct stream read failed, falling back to v51 download+cut: ${msg.slice(0, 300)}`);
    }

    // ── v51 FALLBACK PATH: download + cut ──────────────────────────────────
    // Download video stream to local file, then ffmpeg cut.
    // Slower but more robust for edge cases (TLS issues, network errors).
    // v58: ALWAYS use single muxed input (download with muxed=1 in
    // downloadStreamViaCfWorker). Do NOT download audio separately —
    // dual-input cut caused 5.353s audio drift in v56/v57.
    const videoBuf = await downloadStreamViaCfWorker(
      cfWorkerUrl, videoId, streamUrl, userAgent, visitorData, /*audio*/ false, /*audioUrl*/ null,
    );
    if (!videoBuf || videoBuf.length < 50_000) {
      return NextResponse.json({
        error: `Video download failed or too small: ${videoBuf ? videoBuf.length : 0} bytes`,
      }, { status: 502 });
    }
    await writeFile(inputPath, videoBuf);
    console.log(`[cut-clip] Video downloaded (muxed, contains audio): ${videoBuf.length} bytes (${(videoBuf.length / 1024 / 1024).toFixed(1)}MB)`);

    // v58: Skip separate audio download — the muxed stream already contains
    // audio. Using dual-input cutLocalFile would reintroduce the 5.353s drift
    // bug. Pass audioPath=null to force single-input cut.
    console.log(`[cut-clip] v58 fallback: using single-input cut (no separate audio)`);

    // Cut the clip using ffmpeg with single-input mode (audioPath=null)
    return await cutLocalFile(inputPath, outputPath, startTime, duration, /*audioPath*/ null);
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
 * v58: Cut clip by having ffmpeg read directly from CF Worker /stream URL.
 *
 * ALWAYS uses a single muxed (combined video+audio) input stream from CF Worker
 * /stream?muxed=1, with ffmpeg `-ss startTime` BEFORE `-i` for fast seek.
 *
 * This is the ONLY approach that produces audio/video sync reliably:
 *   - v55/v56 dual-input + `-ss` on both inputs → 5.353s audio drift
 *   - v57 CF Worker `begin` param → YouTube IGNORES begin (URL sig mismatch),
 *     all outputs started from 0:00 (verified by MD5 comparison)
 *   - v58 muxed single-input + `-ss` → drift 0.056s (essentially perfect)
 *
 * Trade-off: 360p quality (itag 18) instead of 720p, but audio sync is
 * critical (user's "no sound" complaint). 360p is acceptable for short
 * highlight clips.
 *
 * Uses ffmpeg-static binary which supports modern TLS (unlike @ffmpeg-installer
 * which uses a 2018 build with outdated gnutls).
 *
 * Returns NextResponse on success, null on failure (caller falls back to v51).
 */
async function cutFromStreamUrl(params: {
  cfWorkerUrl: string;
  streamUrl: string;
  audioUrl: string; // v58: IGNORED — kept for API compatibility
  userAgent: string;
  visitorData: string;
  xClientName: string | number;
  clientVersion: string;
  clientName: string;
  videoId: string;
  startTime: number;
  duration: number;
  outputPath: string;
}): Promise<NextResponse | null> {
  const {
    cfWorkerUrl, streamUrl, audioUrl, userAgent, visitorData,
    xClientName, clientVersion, clientName, videoId,
    startTime, duration, outputPath,
  } = params;

  const ffmpegPath = await findFfmpegBinary();
  if (!ffmpegPath) {
    console.warn('[cut-clip] v58: ffmpeg binary not found');
    return null;
  }

  // v58: Build a SINGLE muxed (combined video+audio) stream URL.
  // - muxed=1: CF Worker returns itag 18 (360p) — combined video+audio in
  //   one stream. No separate audioUrl needed.
  // - maxHeight=360: Force itag 18 (360p) for fastest download. 720p muxed
  //   (itag 22) is rarely available from YouTube, so 360p is the default.
  // - NO `begin` param: YouTube IGNORES begin (URL sig/lsig mismatch), so
  //   we use ffmpeg's `-ss` for seeking instead.
  // - NO `streamUrl` param (CRITICAL): The frontend's /api/yt-stream resolves
  //   VIDEO-ONLY streams (itag 137, 1080p) + separate audioUrl. If we pass
  //   that video-only streamUrl to CF Worker /stream, the fast path proxies
  //   it directly (ignoring muxed=1), producing a video-only output with NO
  //   AUDIO. By NOT passing streamUrl, we force CF Worker to resolve its OWN
  //   muxed stream URL from YouTube (itag 18, 360p with integrated audio).
  const muxedStreamEndpoint = new URL(cfWorkerUrl.replace(/\/$/, '') + '/stream');
  muxedStreamEndpoint.searchParams.set('videoId', videoId);
  muxedStreamEndpoint.searchParams.set('maxHeight', '360');
  muxedStreamEndpoint.searchParams.set('muxed', '1');
  if (userAgent) muxedStreamEndpoint.searchParams.set('userAgent', userAgent);
  if (visitorData) muxedStreamEndpoint.searchParams.set('visitorData', visitorData);
  muxedStreamEndpoint.searchParams.set('xClientName', String(xClientName));
  if (clientVersion) muxedStreamEndpoint.searchParams.set('clientVersion', clientVersion);
  if (clientName) muxedStreamEndpoint.searchParams.set('clientName', clientName);

  console.log(`[cut-clip] v58 direct read: ffmpeg=${ffmpegPath}, single muxed input (NO streamUrl — CF Worker resolves fresh muxed), startTime=${startTime}s, duration=${duration}s`);

  // HTTP input headers for ffmpeg (CF Worker doesn't need special headers,
  // but we set Accept and Accept-Encoding for clean Range handling)
  const httpHeaders = 'Accept: */*\r\nAccept-Encoding: identity\r\n';

  let cutSuccess = false;
  let lastError = '';

  // Attempt 1: -c copy (fast remux) with -ss BEFORE -i (input fast seek)
  // -ss before -i = input seek (fast, jumps to keyframe near startTime)
  // -t after -i = output duration limit
  try {
    const args: string[] = ['-y'];
    args.push('-ss', String(startTime));
    args.push('-rw_timeout', '30000000', '-reconnect', '1', '-reconnect_at_eof', '1',
               '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    args.push('-headers', httpHeaders);
    args.push('-i', muxedStreamEndpoint.toString());
    args.push('-t', String(duration));
    args.push('-c', 'copy');
    args.push('-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', outputPath);

    console.log(`[cut-clip] v58 attempt 1 (-c copy + -ss): ${args.length} args`);
    await execFileAsync(ffmpegPath, args, {
      maxBuffer: 50 * 1024 * 1024,
      // v58: Increased from 60s to 180s — CF Worker may need to resolve a fresh
      // muxed stream URL from YouTube (no streamUrl fast path), which can take
      // 30-60s on cold cache. Plus ffmpeg -ss seek + -c copy time (~5-10s).
      timeout: 180_000,
      env: { ...process.env, LANG: 'C' },
    });
    cutSuccess = true;
    console.log('[cut-clip] v58 -c copy succeeded');
  } catch (execErr: any) {
    const stderr = String(execErr?.stderr || '');
    lastError = `copy: ${execErr?.message?.slice(0, 150)} | STDERR: ${stderr.slice(0, 500)}`;
    console.warn(`[cut-clip] v58 -c copy failed: ${lastError.slice(0, 300)}`);
  }

  // Attempt 2: re-encode (fallback, slower but handles edge cases)
  if (!cutSuccess) {
    try {
      const args: string[] = ['-y'];
      args.push('-ss', String(startTime));
      args.push('-rw_timeout', '30000000', '-reconnect', '1', '-reconnect_at_eof', '1',
                 '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
      args.push('-headers', httpHeaders);
      args.push('-i', muxedStreamEndpoint.toString());
      args.push('-t', String(duration));
      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28');
      args.push('-c:a', 'aac', '-b:a', '128k');
      args.push('-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', outputPath);

      console.log(`[cut-clip] v58 attempt 2 (re-encode + -ss): ${args.length} args`);
      await execFileAsync(ffmpegPath, args, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 120_000,
        env: { ...process.env, LANG: 'C' },
      });
      cutSuccess = true;
      console.log('[cut-clip] v58 re-encode succeeded');
    } catch (execErr2: any) {
      const stderr2 = String(execErr2?.stderr || '');
      lastError = `copy+reencode: ${lastError} || reencode: ${execErr2?.message?.slice(0, 150)} | STDERR: ${stderr2.slice(0, 500)}`;
      console.warn(`[cut-clip] v58 re-encode failed: ${lastError.slice(0, 300)}`);
    }
  }

  if (!cutSuccess) {
    console.warn(`[cut-clip] v58 both attempts failed, will fall back to v51 path`);
    return null;
  }

  const outputData = await readFile(outputPath);
  if (outputData.length < 5_000) {
    console.warn(`[cut-clip] v58 output too small: ${outputData.length} bytes`);
    return null;
  }

  // Validate output is a real MP4 (ftyp box at offset 4)
  if (outputData.length >= 8) {
    const boxType = String.fromCharCode(
      outputData[4], outputData[5], outputData[6], outputData[7],
    );
    if (boxType !== 'ftyp') {
      console.warn(`[cut-clip] v58 output missing ftyp header (got: ${boxType})`);
      return null;
    }
  }

  // v58: ALWAYS verify audio stream is present (single muxed input should
  // always have audio, but check anyway as a safety net).
  const probeOk = await verifyAudioVideoSync(ffmpegPath, outputPath);
  if (!probeOk) {
    console.warn(`[cut-clip] v58 audio stream missing, falling back to v51 path`);
    return null;
  }

  console.log(`[cut-clip] v58 success: ${outputData.length} bytes`);

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
 * v56: Quick probe to verify the output MP4 has an audio stream.
 * Uses ffmpeg -i (header-only, ~100ms) since ffmpeg-static doesn't bundle ffprobe.
 * Returns true if audio stream is present, false otherwise.
 *
 * Note: this checks audio EXISTS, not that it's perfectly in sync. The -ss fix
 * applied to both inputs in cutFromStreamUrl() handles sync. This probe is a
 * safety net to catch cases where audio merge silently failed.
 */
async function verifyAudioVideoSync(ffmpegPath: string, outputPath: string): Promise<boolean> {
  try {
    // ffmpeg -i without output spec exits with code 1, but writes stream
    // info (including audio stream presence) to stderr — fast header probe.
    await execFileAsync(ffmpegPath, ['-i', outputPath], {
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    });
    return true; // unreachable: ffmpeg -i always exits 1 without output
  } catch (err: any) {
    const stderr = String(err.stderr || '');
    const hasAudio = /Stream #\d+:\d+.*Audio:/.test(stderr);
    if (!hasAudio) {
      console.warn(`[cut-clip] v57 sync check: no audio stream in output`);
    } else {
      console.log(`[cut-clip] v57 sync check: audio stream present ✓`);
    }
    return hasAudio;
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
  // v58: Always use maxHeight=360 for muxed streams to ensure itag 18
  // (360p combined video+audio) is returned. 720p muxed (itag 22) is rarely
  // available from YouTube, so 360p is the most reliable muxed format.
  proxyUrl.searchParams.set('maxHeight', '360');
  if (audio) {
    proxyUrl.searchParams.set('audio', '1');
    if (audioUrl) proxyUrl.searchParams.set('audioUrl', audioUrl);
    // For audio-only requests, the streamUrl param is not required —
    // doFetch() in worker.js uses audioUrl when wantAudio=true.
  } else {
    proxyUrl.searchParams.set('muxed', '1');
    // v58: Do NOT pass streamUrl — it would trigger CF Worker's fast path,
    // which proxies the provided URL directly (ignoring muxed=1). The
    // frontend's streamUrl is video-only (itag 137), so passing it would
    // produce a video-only download with NO AUDIO. Let CF Worker resolve
    // its own muxed stream (itag 18, 360p with integrated audio).
  }
  if (userAgent) proxyUrl.searchParams.set('userAgent', userAgent);
  if (visitorData) proxyUrl.searchParams.set('visitorData', visitorData);

  console.log(`[cut-clip] Downloading ${audio ? 'audio' : 'video (muxed 360p, CF Worker resolves)'} via CF Worker /stream...`);

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
      // v56: Dual-input — apply -ss to BOTH inputs so audio stays in sync.
      // v55 bug: -ss only applied to first input → audio started from 0s,
      // video from startTime → audio offset in output, perceived as "no sound".
      args.push('-i', inputPath);
      args.push('-ss', String(startTime));
      args.push('-i', audioPath, '-t', String(duration));
      // audioPath is .m4a (AAC, itag 139/140) → copy without re-encode
      args.push('-c:v', 'copy', '-c:a', 'copy');
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
        // v56: seek audio input to startTime too (see attempt 1 comment)
        args.push('-i', inputPath);
        args.push('-ss', String(startTime));
        args.push('-i', audioPath, '-t', String(duration));
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
 * Prefers ffmpeg-static (newer build with modern TLS support) over @ffmpeg-installer.
 */
async function findFfmpegBinary(): Promise<string> {
  // 1. ffmpeg-static binary (newer build with modern TLS support)
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
