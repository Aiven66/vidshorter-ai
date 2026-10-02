'use client';

/**
 * YouTube clip download utility — v48 (server-download + server-cut).
 *
 * PROBLEM HISTORY:
 *   - v41-v43: MediaRecorder produces fMP4 → desktop players can't play
 *   - v44: fMP4 → remux sometimes failed (ffmpeg binary issues)
 *   - v45: Partial byte-range download SKIPPED MP4 header → "moov atom not found"
 *   - v46: Browser-download capped at 80MB → fallback to fMP4 (still unplayable)
 *   - v47: Preview start time fix (no download change)
 *
 * SOLUTION (v48 — server-side download + cut):
 *   PRIMARY: Browser sends streamUrl + metadata (JSON) to /api/cut-clip.
 *            Server downloads bytes via CF Worker /stream (Node.js fetch,
 *            modern TLS), then ffmpeg cuts [startTime, startTime+duration]
 *            from local file → standard progressive MP4.
 *   FALLBACK: captureStream + MediaRecorder → /api/remux-mp4 → standard MP4.
 *             If remux FAILS, throw (do NOT download fMP4 as .mp4).
 *
 * Why server-download (not browser-download):
 *   - No 80MB cap (server handles memory better)
 *   - No browser chunked Range failures (silent partial downloads)
 *   - No CF Worker /stream colo-mismatch (server uses same /resolve as browser)
 *   - Works at ANY position in the video (not just <170s)
 */

import type { SubtitleStyle } from '@/lib/server/subtitles';
import type { RecapScript } from '@/lib/recap';

export interface ResolvedStream {
  streamUrl: string;
  userAgent: string;
  visitorData: string;
  xClientName: number | string;
  clientVersion: string;
  client: string;
  audioUrl?: string;
  duration?: number;
  colo?: string;
  quality?: string;
}

// Module-level cache: streamUrl is valid for ~6 hours (YouTube expire param).
// YouTube rate-limits /resolve after 1-2 calls per CF Worker colo, so caching
// is critical to avoid LOGIN_REQUIRED on subsequent downloads.
const resolveCache = new Map<string, { data: ResolvedStream; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours

/**
 * Parse a raw /resolve JSON response into a ResolvedStream.
 * Shared by resolveYouTubeStream and preview-dialog's on-demand resolve.
 */
export function parseResolvedStream(data: any): ResolvedStream {
  return {
    streamUrl: data.streamUrl,
    userAgent: data.userAgent || '',
    visitorData: data.visitorData || '',
    xClientName: data.xClientName || '1',
    clientVersion: data.clientVersion || '',
    client: data.client || 'direct',
    audioUrl: data.audioUrl,
    duration: data.duration,
    colo: data.colo,
    quality: data.quality,
  };
}

/**
 * Extract YouTube videoId from various URL formats.
 * Supports youtu.be/, youtube.com/watch?v=, /embed/, /shorts/.
 */
export function extractYouTubeVideoId(url: string | undefined): string | null {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{7,15})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{7,15})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{7,15})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{7,15})/,
    /m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{7,15})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Resolve a YouTube video's stream URL via CF Worker /resolve.
 * Results are cached for 5 hours to avoid YouTube rate-limiting.
 *
 * @param videoId YouTube video ID (e.g., "dQw4w9WgXcQ")
 * @param maxRetries Retry count for rate-limited requests (default: 1)
 */
export async function resolveYouTubeStream(
  videoId: string,
  maxRetries = 1,
): Promise<ResolvedStream> {
  // Check cache first
  const cached = resolveCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const cfWorkerUrl = String(
    typeof window !== 'undefined' ? window.__CF_WORKER_URL__ : '',
  ).trim();
  if (!cfWorkerUrl) {
    throw new Error('CF_WORKER_URL not configured');
  }

  const resolveUrl = new URL(cfWorkerUrl);
  resolveUrl.pathname = `${resolveUrl.pathname.replace(/\/$/, '')}/resolve`;
  resolveUrl.searchParams.set('videoId', videoId);
  // Use 720 to allow HD muxed streams (itag 22 = 720p muxed)
  // Falls back to 360p muxed (itag 18) if 720p muxed is unavailable
  resolveUrl.searchParams.set('maxHeight', '720');
  // muxed=1: request a combined video+audio stream. Without this, /resolve
  // returns a video-only DASH stream (itag 136) with NO audio track.
  // All downloaded clips would be silent. This is the root cause of the
  // "no sound" bug.
  resolveUrl.searchParams.set('muxed', '1');

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      // Wait before retry (YouTube rate-limit may reset)
      await new Promise<void>((r) => setTimeout(r, 2000));
    }
    try {
      const res = await fetch(resolveUrl.toString(), {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (res.status === 403 || body.includes('LOGIN_REQUIRED')) {
          lastErr = new Error(
            'YouTube rate-limited the CF Worker colo. Please try again in 1-2 hours.',
          );
          continue;
        }
        throw new Error(`CF Worker /resolve failed: HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.streamUrl) {
        throw new Error('No streamUrl in /resolve response');
      }

      const resolved: ResolvedStream = parseResolvedStream(data);

      // Cache for 5 hours (streamUrl expires in ~6 hours)
      resolveCache.set(videoId, {
        data: resolved,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return resolved;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      // Only retry on network/timeout errors, not on 4xx
      if (lastErr.message.includes('rate-limited')) continue;
      if (lastErr.message.includes('CF Worker /resolve failed: HTTP 4')) break;
    }
  }

  throw lastErr || new Error('Failed to resolve YouTube stream');
}

/**
 * Pre-populate the resolve cache with an already-resolved stream.
 * Used by handleProcess to avoid a redundant /resolve call during download.
 */
export function cacheResolvedStream(
  videoId: string,
  resolved: ResolvedStream,
): void {
  resolveCache.set(videoId, {
    data: resolved,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Build a CF Worker /stream URL with pre-resolved streamUrl (fast path).
 *
 * The /stream endpoint has a fast path: when `streamUrl` query param is
 * provided, it fetches the URL directly (no InnerTube API call). This avoids
 * the rate-limited tryClient path and works because the CF Worker's egress
 * IP matches the streamUrl's IP binding (same colo).
 */
export function buildStreamProxyUrl(
  videoId: string,
  resolved: ResolvedStream,
): string {
  const cfWorkerUrl = String(
    typeof window !== 'undefined' ? window.__CF_WORKER_URL__ : '',
  ).trim();
  if (!cfWorkerUrl) {
    throw new Error('CF_WORKER_URL not configured');
  }

  const streamEndpoint = new URL(cfWorkerUrl);
  streamEndpoint.pathname = `${streamEndpoint.pathname.replace(/\/$/, '')}/stream`;
  streamEndpoint.searchParams.set('videoId', videoId);
  // Use 720 to allow HD streams; CF Worker /stream will pick the best available
  streamEndpoint.searchParams.set('maxHeight', '720');
  // Fast path params: skip InnerTube, fetch streamUrl directly
  streamEndpoint.searchParams.set('streamUrl', resolved.streamUrl);
  streamEndpoint.searchParams.set('userAgent', resolved.userAgent);
  streamEndpoint.searchParams.set('visitorData', resolved.visitorData);
  streamEndpoint.searchParams.set('xClientName', String(resolved.xClientName));
  streamEndpoint.searchParams.set('clientVersion', resolved.clientVersion);
  streamEndpoint.searchParams.set('clientName', resolved.client);
  // Ensure /stream re-resolve (if fast path fails) also returns muxed stream
  streamEndpoint.searchParams.set('muxed', '1');
  return streamEndpoint.toString();
}

/**
 * Download a clip via screen capture (getDisplayMedia).
 *
 * Used when the clip position is too far into the video (>~75s) for the blob
 * approach to work. This method:
 *   1. Asks the user to share their screen/tab
 *   2. Creates a YouTube IFrame embed that autoplays from startTime
 *   3. Records the shared stream for the clip duration
 *   4. Triggers download of the recording
 *
 * Advantages: works at ANY position, includes AUDIO.
 * Disadvantage: requires user to click "Share this tab".
 */
async function downloadViaScreenCapture(params: {
  videoId: string;
  startTime: number;
  endTime: number;
  title: string;
  onProgress?: (msg: string) => void;
}): Promise<{ blob: Blob; extension: string }> {
  const { videoId, startTime, endTime, title, onProgress } = params;
  const duration = Math.min(Math.max(1, endTime - startTime), 15);

  onProgress?.('Requesting screen capture (please allow)...');

  let displayStream: MediaStream;
  try {
    const displayOpts: DisplayMediaStreamOptions = {
      video: { frameRate: 30 },
      audio: true,
    };
    displayStream = await navigator.mediaDevices.getDisplayMedia(displayOpts);
  } catch {
    throw new Error('Screen capture was denied. Please allow screen sharing to download clips at this position.');
  }

  // Create fullscreen overlay with YouTube embed
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;';
  document.body.appendChild(overlay);

  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(startTime)}&autoplay=1&controls=0&modestbranding=1&rel=0&playsinline=1`;
  iframe.style.cssText = 'width:100%;height:100%;border:0;';
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
  overlay.appendChild(iframe);

  // Wait for iframe to load and start playing
  await new Promise((r) => setTimeout(r, 3000));

  // Set up MediaRecorder
  const mimeTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const mimeType = mimeTypes.find((m) => {
    try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
  }) || 'video/webm';

  const recorder = new MediaRecorder(displayStream, {
    mimeType,
    videoBitsPerSecond: 2_000_000,
    audioBitsPerSecond: 128_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
    };
  });

  onProgress?.(`Recording ${duration}s (with audio)...`);
  recorder.start(100);

  // Wait for clip duration
  await new Promise<void>((resolve) => {
    const stopTime = Date.now() + duration * 1000;
    const check = setInterval(() => {
      if (Date.now() >= stopTime) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });

  // Cleanup
  try { recorder.stop(); } catch {}
  displayStream.getTracks().forEach((t) => t.stop());
  overlay.remove();

  const blob = await recordingDone;
  if (blob.size < 10_000) throw new Error('Recording too small');

  // Trigger download
  const safeName = title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50) || 'clip';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}.webm`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);

  onProgress?.('Download complete!');
  return { blob, extension: 'webm' };
}

// Maximum chunk size that googlevideo.com accepts from CF Worker colos.
// Testing confirmed: 2MB Range succeeds, 6MB Range fails (returns 603-byte JSON error).
// This is a per-request size limit imposed by YouTube's CDN on CF Worker egress IPs.
const MAX_CHUNK_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Fetch video stream data in small chunks to avoid googlevideo.com's
 * per-request size rate limiting on CF Worker colos.
 *
 * Makes multiple Range requests of MAX_CHUNK_BYTES each and concatenates
 * the results. If a chunk request fails after some data has been fetched,
 * returns whatever data was successfully retrieved (graceful degradation).
 *
 * @param streamUrl CF Worker /stream endpoint URL (without streamUrl param)
 * @param totalBytes Target number of bytes to fetch
 * @param onProgress Optional progress callback
 * @returns ArrayBuffer containing the fetched data
 * @throws Error if the first chunk fails or returns non-MP4 data
 */
async function fetchStreamChunked(
  streamUrl: string,
  totalBytes: number,
  onProgress?: (msg: string) => void,
): Promise<ArrayBuffer> {
  const chunks: ArrayBuffer[] = [];
  let fetched = 0;

  while (fetched < totalBytes) {
    const chunkStart = fetched;
    const chunkEnd = Math.min(fetched + MAX_CHUNK_BYTES, totalBytes) - 1;

    let res: Response;
    try {
      res = await fetch(streamUrl, {
        headers: { Range: `bytes=${chunkStart}-${chunkEnd}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      if (fetched === 0) throw err;
      console.warn(`[fetchStreamChunked] Chunk at offset ${chunkStart} network error, using ${fetched} bytes`);
      break;
    }

    if (!res.ok && res.status !== 206 && res.status !== 200) {
      if (fetched === 0) {
        throw new Error(`Stream fetch failed: HTTP ${res.status}`);
      }
      console.warn(`[fetchStreamChunked] Chunk at offset ${chunkStart} returned HTTP ${res.status}, using ${fetched} bytes`);
      break;
    }

    const chunk = await res.arrayBuffer();
    if (chunk.byteLength === 0) break;

    // Validate first chunk is a valid MP4 (ftyp box at offset 4)
    if (fetched === 0) {
      if (chunk.byteLength < 50_000) {
        const preview = new TextDecoder().decode(chunk.slice(0, 200));
        throw new Error(`Stream returned non-video data (${chunk.byteLength} bytes): ${preview}`);
      }
      const view = new DataView(chunk);
      const boxType = String.fromCharCode(
        view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7),
      );
      if (boxType !== 'ftyp') {
        const preview = new TextDecoder().decode(chunk.slice(0, 200));
        throw new Error(`Stream returned non-MP4 data (boxType=${boxType}): ${preview}`);
      }
    }

    chunks.push(chunk);
    fetched += chunk.byteLength;
    onProgress?.(`Downloaded ${(fetched / 1024 / 1024).toFixed(1)}MB...`);

    // If response was 200 (full file, Range ignored) or chunk is smaller
    // than requested, we've reached the end of available data
    if (res.status === 200 || chunk.byteLength < (chunkEnd - chunkStart + 1)) break;
  }

  // Concatenate all chunks into a single ArrayBuffer
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  if (total === 0) throw new Error('No data received from stream');
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

/**
 * Download a YouTube video clip.
 *
 * PRIMARY PATH (v20): call the server-side /api/download-youtube-clip endpoint.
 * It uses ffmpeg to merge video+audio streams and cut the exact [startTime, endTime]
 * segment. This avoids browser-side CORS taint, missing audio, and seek failures.
 *
 * FALLBACK PATH: browser-side canvas captureStream + decoded audio buffer.
 * Used only when the server endpoint fails or is unreachable.
 *
 * @returns The recorded blob (also triggers download)
 */
export async function downloadYouTubeClip(params: {
  videoId: string;
  startTime: number;
  endTime: number;
  title: string;
  resolved?: ResolvedStream;
  /** P0 导出即付费墙：当前用户 plan，服务端据此门控（免费用户 403 export_requires_paid） */
  exportPlan?: string;
  onProgress?: (msg: string) => void;
}): Promise<{ blob: Blob; extension: string }> {
  const { videoId, startTime, endTime, title, resolved, exportPlan, onProgress } = params;
  const duration = Math.max(1, endTime - startTime);

  // ── Primary path: server-side ffmpeg clipper ───────────────────────────────
  // CRITICAL: Pass the already-resolved stream metadata from the frontend so
  // the server does NOT need to call /resolve again. The server's CF Worker
  // colo is often rate-limited (LOGIN_REQUIRED) while the browser's colo
  // successfully resolved the stream. Without this, the first server attempt
  // always fails and wastes 120s before falling back.
  const callServerApi = async (streamMeta?: ResolvedStream) => {
    onProgress?.(`Server processing clip (${startTime}s–${endTime}s, may take up to 2min)...`);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const apiUrl = new URL('/api/download-youtube-clip', origin || undefined);
    apiUrl.searchParams.set('videoId', videoId);
    apiUrl.searchParams.set('startTime', String(startTime));
    apiUrl.searchParams.set('endTime', String(endTime));
    apiUrl.searchParams.set('title', title);
    // P0 导出即付费墙：服务端据此门控（免费用户返回 403 export_requires_paid）
    apiUrl.searchParams.set('plan', exportPlan || 'free');
    const meta = streamMeta ?? resolved;
    if (meta?.streamUrl) {
      apiUrl.searchParams.set('streamUrl', meta.streamUrl);
      if (meta.audioUrl) apiUrl.searchParams.set('audioUrl', meta.audioUrl);
      if (meta.userAgent) apiUrl.searchParams.set('userAgent', meta.userAgent);
      if (meta.visitorData) apiUrl.searchParams.set('visitorData', meta.visitorData);
      if (meta.xClientName !== undefined) apiUrl.searchParams.set('xClientName', String(meta.xClientName));
      if (meta.clientVersion) apiUrl.searchParams.set('clientVersion', meta.clientVersion);
      if (meta.client) apiUrl.searchParams.set('clientName', meta.client);
    }

    const res = await fetch(apiUrl.toString(), {
      signal: AbortSignal.timeout(120_000), // 120s — server downloads [0,endTime] bytes + ffmpeg cut
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      // 导出即付费墙：优先带上 reason（export_requires_paid），前端据此弹付费引导
      const detail = body.reason
        ? `${body.error || 'Export requires a paid plan'} (${body.reason})`
        : (body.error || `Server clip failed: HTTP ${res.status}`);
      throw new Error(detail);
    }

    const data = await res.json();
    if (!data.success || !data.dataUrl || !data.dataUrl.startsWith('data:')) {
      throw new Error(data.error || 'Server returned no clip data');
    }

    onProgress?.('Downloading clip...');
    const blob = await fetch(data.dataUrl).then((r) => r.blob());
    if (blob.size < 1_000) {
      throw new Error(`Server clip too small: ${blob.size} bytes`);
    }

    const safeName = (title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50) || 'clip');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);

    onProgress?.('Download complete!');
    return { blob, extension: 'mp4' };
  };

  // Step 1: Resolve the stream from the browser (uses cache if available).
  // The browser's CF Worker colo is usually healthy while the server's is rate-limited.
  let streamMeta = resolved;
  if (!streamMeta) {
    try {
      streamMeta = await resolveYouTubeStream(videoId, 1);
    } catch (resolveErr) {
      console.warn('[downloadYouTubeClip] Frontend resolve failed:', resolveErr instanceof Error ? resolveErr.message : resolveErr);
    }
  }

  // CRITICAL: If we have no streamUrl (CF Worker /resolve failed from browser),
  // throw immediately. Without streamUrl, the server would fall back to
  // downloadSourceVideo (yt-dlp + Piped + Invidious proxies), which:
  //   - Doesn't work on Vercel (yt-dlp unavailable)
  //   - Takes 60-120s to fail (slow proxy timeouts)
  //   - Causes the "stuck downloading" UX the user reported
  // Instead, throw so handleDownload opens the YouTube embed fallback.
  if (!streamMeta?.streamUrl) {
    throw new Error('No stream URL available (CF Worker /resolve failed). Opening YouTube embed instead.');
  }

  // Step 2: Call the server API with the resolved stream metadata.
  // This is the ONLY attempt — no frontend chunked fallback.
  // The old chunked fallback downloaded from 0:00 (wrong clip segment) and
  // took 75+ seconds, causing the "stuck downloading" UX. If the server
  // fails, we throw so handleDownload can fall back to YouTube embed.
  try {
    return await callServerApi(streamMeta);
  } catch (serverErr) {
    const msg = serverErr instanceof Error ? serverErr.message : String(serverErr);
    console.warn('[downloadYouTubeClip] Server-side clip failed:', msg);
    throw new Error(`Server clip failed: ${msg.slice(0, 200)}`);
  }
}

/**
 * Fallback download: fetch the video stream as a blob and trigger download.
 * Used when captureVideoClip fails (e.g., browser doesn't support captureStream).
 *
 * This downloads a partial video (up to maxBytes), which includes video from 0:00
 * to ~maxBytes/400KBps. The user can use a video player to find the highlight segment.
 *
 * Uses chunked downloads (2MB per chunk) to bypass googlevideo.com's per-request
 * size rate limiting on CF Worker colos.
 */
export async function downloadFullVideoStream(params: {
  videoId: string;
  title: string;
  maxBytes?: number;
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const { videoId, title, maxBytes = 50 * 1024 * 1024, onProgress } = params;

  // Build /stream URL directly (no streamUrl param) — same fix as downloadYouTubeClip
  const cfWorkerUrl = String(
    typeof window !== 'undefined' ? window.__CF_WORKER_URL__ : '',
  ).trim();
  if (!cfWorkerUrl) {
    throw new Error('CF_WORKER_URL not configured');
  }

  const streamEndpoint = new URL(cfWorkerUrl);
  streamEndpoint.pathname = `${streamEndpoint.pathname.replace(/\/$/, '')}/stream`;
  streamEndpoint.searchParams.set('videoId', videoId);
  streamEndpoint.searchParams.set('maxHeight', '360');
  // muxed=1: ensure the stream has audio (not video-only DASH)
  streamEndpoint.searchParams.set('muxed', '1');

  onProgress?.(`Downloading video (in 2MB chunks, up to ${(maxBytes / 1024 / 1024).toFixed(0)}MB)...`);

  // Use chunked fetch to avoid googlevideo.com's per-request size rate limiting
  const arrayBuffer = await fetchStreamChunked(
    streamEndpoint.toString(),
    maxBytes,
    (msg) => onProgress?.(msg),
  );

  if (arrayBuffer.byteLength < 50_000) {
    throw new Error(`Stream returned too little data: ${arrayBuffer.byteLength} bytes`);
  }

  const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
  const safeName = title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50) || 'clip';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}.mp4`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);

  onProgress?.('Download complete!');
}

/**
 * Ultimate fallback: download partial video data as a raw MP4 file.
 *
 * When captureStream/MediaRecorder fails AND downloadFullVideoStream also
 * fails (or returns non-video data), this function fetches a small portion
 * of the /stream and downloads it directly. The user gets a playable MP4
 * that contains video from 0:00 to ~endTime.
 *
 * Uses chunked downloads (2MB per chunk) to bypass googlevideo.com's
 * per-request size rate limiting. At minimum, the first 2MB chunk (which
 * always succeeds) guarantees the user gets a downloadable file.
 *
 * This is NOT the ideal solution (it's not the exact [startTime, endTime]
 * segment), but it ensures the user always gets a downloadable file.
 */
export async function downloadPartialMP4(params: {
  videoId: string;
  title: string;
  startTime?: number;
  endTime: number;
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const { videoId, title, startTime = 0, endTime, onProgress } = params;
  const duration = Math.max(1, endTime - startTime);

  const cfWorkerUrl = String(
    typeof window !== 'undefined' ? window.__CF_WORKER_URL__ : '',
  ).trim();
  if (!cfWorkerUrl) {
    throw new Error('CF_WORKER_URL not configured');
  }

  const streamEndpoint = new URL(cfWorkerUrl);
  streamEndpoint.pathname = `${streamEndpoint.pathname.replace(/\/$/, '')}/stream`;
  streamEndpoint.searchParams.set('videoId', videoId);
  streamEndpoint.searchParams.set('maxHeight', '360');
  // Ensure the fallback MP4 has audio.
  streamEndpoint.searchParams.set('muxed', '1');
  // Best-effort seek to the highlight start.
  if (startTime > 0) {
    streamEndpoint.searchParams.set('begin', String(Math.floor(startTime * 1000)));
  }

  // Download enough data to cover the clip duration, capped at 10MB (5 chunks)
  const neededBytes = Math.min(
    Math.ceil(Math.min(duration + 5, 75) * 500_000),
    10 * 1024 * 1024,
  );

  onProgress?.(`Downloading video data (${(neededBytes / 1024 / 1024).toFixed(1)}MB in 2MB chunks)...`);

  // Use chunked fetch — the first 2MB chunk always succeeds, ensuring
  // the user gets at least a partial video file even if subsequent chunks fail.
  const arrayBuffer = await fetchStreamChunked(
    streamEndpoint.toString(),
    neededBytes,
    (msg) => onProgress?.(msg),
  );

  if (arrayBuffer.byteLength < 50_000) {
    throw new Error(`Stream returned too little data: ${arrayBuffer.byteLength} bytes`);
  }

  const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
  const safeName = title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50) || 'clip';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}_partial.mp4`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);

  onProgress?.('Download complete!');
}

/**
 * Browser-side clip download — v48 (server-download + server-cut).
 *
 * APPROACH (v48 — server-side download + cut):
 *   Browser sends the resolved streamUrl + metadata (JSON) to /api/cut-clip.
 *   Server downloads the video bytes via CF Worker /stream (Node.js fetch,
 *   modern TLS), then ffmpeg cuts [startTime, startTime+duration] from the
 *   local file → standard progressive MP4.
 *
 *   This eliminates v46's issues:
 *     - No 80MB browser download cap (server handles memory)
 *     - No silent partial downloads (browser chunked Range failures)
 *     - No CF Worker /stream colo-mismatch (server uses same /resolve as browser)
 *     - Works at ANY position in the video (not just <170s)
 *
 * PRIMARY PATH (v48):
 *   1. Resolve muxed stream via CF Worker /resolve (browser-side, cached)
 *   2. POST JSON { streamUrl, videoId, startTime, duration, ... } → /api/cut-clip
 *   3. Server downloads via CF Worker /stream → temp file
 *   4. Server ffmpeg: -ss <startTime> -i <file> -t <dur> -c copy +faststart
 *   5. Browser downloads the standard progressive MP4 response
 *
 * FALLBACK PATH (server endpoint fails):
 *   1. captureStream + MediaRecorder → fMP4 or webm
 *   2. Upload to /api/remux-mp4 → standard progressive MP4
 *   3. If remux FAILS → throw (do NOT download fMP4 as .mp4)
 */
export async function downloadClipViaBrowser(params: {
  videoId: string;
  startTime: number;
  endTime: number;
  title: string;
  resolved?: ResolvedStream;
  /** P0: 当前用户 plan（free/starter/pro），用于导出分辨率+水印差异 */
  exportPlan?: string;
  /** 9:16 竖屏重构（Starter+ 权益）：'vertical' 时服务端做竖屏裁剪 */
  orientation?: 'landscape' | 'vertical';
  /** AI 自动字幕（Starter+）：true 时服务端烧录官方字幕 */
  subtitles?: boolean;
  /** 字幕样式（Starter+）：静态字幕烧录的样式（字号/位置/描边/背景） */
  subtitleStyle?: SubtitleStyle;
  /** 字幕翻译（Starter+）：翻译目标语言（白名单代码，如 zh-CN）；空 = 不翻译 */
  subtitleLang?: string;
  /** AI 粗剪清理（Starter+）：true 时服务端按逐字稿剪掉长停顿与纯语气词 */
  jumpCut?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const { videoId, startTime, endTime, title, resolved, exportPlan, orientation, subtitles, subtitleStyle, subtitleLang, jumpCut, onProgress } = params;
  const clipDuration = Math.max(1, Math.min(endTime - startTime, 90));

  // Step 1: Resolve muxed stream via CF Worker /resolve (from browser)
  let streamMeta = resolved;
  if (!streamMeta) {
    onProgress?.('Resolving YouTube stream...');
    streamMeta = await resolveYouTubeStream(videoId, 1);
  }
  if (!streamMeta?.streamUrl) {
    throw new Error('No stream URL available (CF Worker /resolve failed)');
  }

  // Step 2: Try v48 server-side download + cut (PRIMARY path)
  try {
    const result = await downloadAndCutOnServer({
      streamMeta,
      videoId,
      startTime,
      endTime,
      clipDuration,
      exportPlan,
      orientation,
      subtitles,
      subtitleStyle,
      subtitleLang,
      jumpCut,
      onProgress,
    });
    if (result) {
      triggerDownload(result, title);
      onProgress?.('Download complete!');
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[downloadClipViaBrowser] v48 server-download+cut failed:', msg);
    // 导出即付费墙：不可回落到 captureStream 录制（否则免费用户仍能拿到文件）
    if (msg.includes('export_requires_paid')) throw new Error('export_requires_paid');
  }

  // Step 3: Fallback to browser captureStream + MediaRecorder + remux
  // Used ONLY when /api/cut-clip server endpoint fails entirely.
  //
  // captureStream + MediaRecorder produces fMP4 (fragmented MP4) or webm.
  // fMP4/webm are NOT playable in standard desktop players (QuickTime, WMP).
  // We MUST remux to standard progressive MP4 via /api/remux-mp4.
  // If remux fails, we THROW instead of downloading fMP4 as .mp4 (which would
  // produce a non-playable file — the user's reported issue).
  // The browser recorder captures the landscape source as-is: it cannot produce
  // 9:16 output and cannot burn captions. Falling back here for a vertical /
  // subtitled export would silently hand the user a wrong-aspect, caption-less
  // file, so fail loudly instead (same principle as the remux guard below).
  if (orientation === 'vertical' || subtitles) {
    throw new Error(
      'Vertical export failed on the server. Please retry — the browser fallback cannot produce 9:16 video with captions.',
    );
  }

  onProgress?.('Falling back to browser recording + remux...');
  const streamUrl = buildStreamProxyUrl(videoId, streamMeta);
  const clipBlob = await cutClipFromStream(streamUrl, startTime, clipDuration, onProgress);

  // ALWAYS remux — both fMP4 and webm need conversion to standard MP4
  // /api/remux-mp4 handles both:
  //   - fMP4 input: ffmpeg -c copy (fast, no re-encoding)
  //   - webm input: ffmpeg -c:v libx264 -c:a aac (transcode, slower)
  onProgress?.('Converting to standard MP4...');
  const formData = new FormData();
  const ext = clipBlob.type.includes('mp4') ? 'mp4' : 'webm';
  formData.append('file', clipBlob, `clip.${ext}`);

  const remuxRes = await fetch('/api/remux-mp4', {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(55_000),
  });

  if (!remuxRes.ok) {
    const errBody = await remuxRes.text().catch(() => '');
    throw new Error(`Remux failed (HTTP ${remuxRes.status}): ${errBody.slice(0, 200)}. Cannot produce playable MP4.`);
  }

  const remuxedBuf = await remuxRes.arrayBuffer();
  if (remuxedBuf.byteLength < 5000) {
    throw new Error(`Remux output too small: ${remuxedBuf.byteLength} bytes. Cannot produce playable MP4.`);
  }

  const finalBlob = new Blob([remuxedBuf], { type: 'video/mp4' });
  onProgress?.('Standard MP4 ready. Downloading...');
  triggerDownload(finalBlob, title);
  onProgress?.('Download complete!');
}

/**
 * AI 配音/旁白 (TTS, Starter+ 权益)：把神经人声配音作为音频轨合并进片段。
 * 复用剪裁同款 muxed 流 fast path（命中 5h resolve 缓存），POST /api/voiceover-clip
 * 流式返回标准 MP4。无脚本时服务端自动从官方字幕提取旁白原文。
 */
export async function downloadClipWithVoiceover(params: {
  videoId: string;
  startTime: number;
  endTime: number;
  title: string;
  resolved?: ResolvedStream;
  exportPlan?: string;
  orientation?: 'landscape' | 'vertical';
  /** 可选的用户自写旁白脚本；留空则服务端自动从字幕生成 */
  script?: string;
  /** 可选的 msedge-tts 声线 ID（如 en-US-GuyNeural / zh-CN-YunxiNeural） */
  voice?: string;
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const { videoId, startTime, endTime, title, resolved, exportPlan, orientation, script, voice, onProgress } = params;
  const clipDuration = Math.max(1, Math.min(endTime - startTime, 90));

  let streamMeta = resolved;
  if (!streamMeta) {
    onProgress?.('Resolving YouTube stream...');
    streamMeta = await resolveYouTubeStream(videoId, 1);
  }
  if (!streamMeta?.streamUrl) {
    throw new Error('No stream URL available (CF Worker /resolve failed)');
  }

  onProgress?.('Generating AI voiceover (server-side, may take a minute)...');
  const res = await fetch('/api/voiceover-clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan: exportPlan || 'free',
      videoId,
      startTime,
      duration: clipDuration,
      streamUrl: streamMeta.streamUrl,
      ...(streamMeta.audioUrl ? { audioUrl: streamMeta.audioUrl } : {}),
      userAgent: streamMeta.userAgent,
      visitorData: streamMeta.visitorData,
      xClientName: streamMeta.xClientName,
      clientVersion: streamMeta.clientVersion,
      clientName: streamMeta.client,
      orientation: orientation === 'vertical' ? 'vertical' : 'landscape',
      ...(script ? { script } : {}),
      ...(voice ? { voice } : {}),
    }),
    signal: AbortSignal.timeout(280_000),
  });

  if (!res.ok) {
    let msg = `Voiceover failed (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch { /* non-json */ }
    throw new Error(msg);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength < 5000) {
    throw new Error('Voiceover clip too small.');
  }
  if (buf.byteLength >= 8) {
    const view = new DataView(buf);
    const boxType = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
    if (boxType !== 'ftyp') {
      throw new Error('Voiceover clip output is not a valid MP4.');
    }
  }

  onProgress?.('Voiceover clip ready. Downloading...');
  triggerDownload(new Blob([buf], { type: 'video/mp4' }), `${title}_voiceover`);
  onProgress?.('Download complete!');
}

/**
 * AI 背景音乐 BGM (Starter+ 权益)：把内置免版权 BGM 叠加进片段（原声保留，BGM 压低混音）。
 * 复用剪裁同款 muxed 流 fast path（命中 5h resolve 缓存），POST /api/bgm-clip 流式返回 MP4。
 */
export async function downloadClipWithBgm(params: {
  videoId: string;
  startTime: number;
  endTime: number;
  title: string;
  resolved?: ResolvedStream;
  exportPlan?: string;
  orientation?: 'landscape' | 'vertical';
  /** calm | energetic | warm（默认 calm） */
  mood?: 'calm' | 'energetic' | 'warm';
  /** 0-100 原声音量（默认 70） */
  originalVolume?: number;
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const { videoId, startTime, endTime, title, resolved, exportPlan, orientation, mood, originalVolume, onProgress } = params;
  const clipDuration = Math.max(1, Math.min(endTime - startTime, 90));

  let streamMeta = resolved;
  if (!streamMeta) {
    onProgress?.('Resolving YouTube stream...');
    streamMeta = await resolveYouTubeStream(videoId, 1);
  }
  if (!streamMeta?.streamUrl) {
    throw new Error('No stream URL available (CF Worker /resolve failed)');
  }

  onProgress?.('Adding AI background music (server-side, may take a minute)...');
  const res = await fetch('/api/bgm-clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan: exportPlan || 'free',
      videoId,
      startTime,
      duration: clipDuration,
      streamUrl: streamMeta.streamUrl,
      ...(streamMeta.audioUrl ? { audioUrl: streamMeta.audioUrl } : {}),
      userAgent: streamMeta.userAgent,
      visitorData: streamMeta.visitorData,
      xClientName: streamMeta.xClientName,
      clientVersion: streamMeta.clientVersion,
      clientName: streamMeta.client,
      orientation: orientation === 'vertical' ? 'vertical' : 'landscape',
      mood: mood || 'calm',
      originalVolume: originalVolume ?? 70,
    }),
    signal: AbortSignal.timeout(280_000),
  });

  if (!res.ok) {
    let msg = `BGM failed (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = String(data.error);
    } catch { /* non-json */ }
    throw new Error(msg);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength < 5000) {
    throw new Error('BGM clip too small.');
  }
  if (buf.byteLength >= 8) {
    const view = new DataView(buf);
    const boxType = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
    if (boxType !== 'ftyp') {
      throw new Error('BGM clip output is not a valid MP4.');
    }
  }

  onProgress?.('BGM clip ready. Downloading...');
  triggerDownload(new Blob([buf], { type: 'video/mp4' }), `${title}_bgm`);
  onProgress?.('Download complete!');
}

/**
 * 卡拉OK 动态字幕（Starter+ 权益）：逐词高亮字幕烧录进片段。
 * 错误码 no_subtitles（422）时抛 'no_subtitles'，前端据此提示。
 */
export async function downloadClipWithKaraoke(params: {
  videoId: string;
  startTime: number;
  endTime: number;
  title: string;
  resolved?: ResolvedStream;
  exportPlan?: string;
  orientation?: 'landscape' | 'vertical';
  /** 字幕样式（Starter+）：卡拉OK 高亮色/字号/位置/描边/背景 */
  style?: SubtitleStyle;
  /** 字幕翻译（Starter+）：翻译目标语言（白名单代码，如 zh-CN）；空 = 不翻译 */
  lang?: string;
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const { videoId, startTime, endTime, title, resolved, exportPlan, orientation, style, lang, onProgress } = params;
  const clipDuration = Math.max(1, Math.min(endTime - startTime, 90));

  let streamMeta = resolved;
  if (!streamMeta) {
    onProgress?.('Resolving YouTube stream...');
    streamMeta = await resolveYouTubeStream(videoId, 1);
  }
  if (!streamMeta?.streamUrl) {
    throw new Error('No stream URL available (CF Worker /resolve failed)');
  }

  onProgress?.('Burning karaoke subtitles (server-side, may take a minute)...');
  const res = await fetch('/api/karaoke-clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan: exportPlan || 'free',
      videoId,
      startTime,
      duration: clipDuration,
      streamUrl: streamMeta.streamUrl,
      ...(streamMeta.audioUrl ? { audioUrl: streamMeta.audioUrl } : {}),
      userAgent: streamMeta.userAgent,
      visitorData: streamMeta.visitorData,
      xClientName: streamMeta.xClientName,
      clientVersion: streamMeta.clientVersion,
      clientName: streamMeta.client,
      orientation: orientation === 'vertical' ? 'vertical' : 'landscape',
      // 字幕样式（Starter+）：卡拉OK 高亮色/字号/位置/描边/背景
      ...(style ? { style } : {}),
      // 字幕翻译（Starter+）：翻译目标语言（zh-CN 等）
      ...(lang ? { lang } : {}),
    }),
    signal: AbortSignal.timeout(280_000),
  });

  if (!res.ok) {
    let msg = `Karaoke failed (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error === 'no_subtitles' ? 'no_subtitles' : String(data.error);
    } catch { /* non-json */ }
    throw new Error(msg);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength < 5000) {
    throw new Error('Karaoke clip too small.');
  }
  if (buf.byteLength >= 8) {
    const view = new DataView(buf);
    const boxType = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
    if (boxType !== 'ftyp') {
      throw new Error('Karaoke clip output is not a valid MP4.');
    }
  }

  onProgress?.('Karaoke clip ready. Downloading...');
  triggerDownload(new Blob([buf], { type: 'video/mp4' }), `${title}_karaoke`);
  onProgress?.('Download complete!');
}

/**
 * 按服务端 /api/export-all 的单次请求约束切分批次的纯函数：
 * 每批最多 10 段、每段最多 90s、每批总时长最多 300s。
 * 超出时拆成多批（part1/part2…），而不是让用户手动取消勾选。
 */
export function planExportBatches(
  clips: { videoId: string; startTime: number; endTime: number; title: string }[],
): { videoId: string; startTime: number; endTime: number; title: string; duration: number }[][] {
  const CLIP_MAX_SEC = 90;
  const CLIP_MAX_PER_REQUEST = 10;
  const REQUEST_MAX_TOTAL_SEC = 300;

  const normalized = clips.map((c) => ({
    ...c,
    duration: Math.max(1, Math.min(c.endTime - c.startTime, CLIP_MAX_SEC)),
  }));

  const batches: (typeof normalized)[] = [];
  let currentBatch: typeof normalized = [];
  let currentTotal = 0;
  for (const c of normalized) {
    if (
      currentBatch.length > 0 &&
      (currentTotal + c.duration > REQUEST_MAX_TOTAL_SEC || currentBatch.length >= CLIP_MAX_PER_REQUEST)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentTotal = 0;
    }
    currentBatch.push(c);
    currentTotal += c.duration;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}

/**
 * 批量打包导出 (Starter+ 权益)：把当前视频的全部高光片段打包下载为 zip。
 * 前端把已 resolve 的 muxed 流元数据 + 片段时间轴交给 /api/export-all，
 * 服务端逐段裁剪后流式打包 zip（复用 5h resolve 缓存，免二次 /resolve）。
 *
 * 片段多 / 总时长长时（例如 10 条 × 60s = 600s）不再直接失败：按服务端约束
 * 自动分批请求，逐包下载为 clipopai-clips-part1.zip、part2.zip…，保证全部片段都能拿到。
 */
export async function downloadAllClipsAsZip(params: {
  clips: { videoId: string; startTime: number; endTime: number; title: string }[];
  resolved?: ResolvedStream;
  exportPlan?: string;
  template?: string;
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const { clips, resolved, exportPlan, template, onProgress } = params;
  if (clips.length === 0) return;

  let streamMeta = resolved;
  if (!streamMeta) {
    onProgress?.('Resolving YouTube stream...');
    streamMeta = await resolveYouTubeStream(clips[0].videoId, 1);
  }
  if (!streamMeta?.streamUrl) {
    throw new Error('No stream URL available (CF Worker /resolve failed)');
  }

  // 服务端 /api/export-all 单次请求有约束（最多 10 段 / 每段 ≤90s / 总时长 ≤300s），
  // 超出时自动分批，逐包下载为 clipopai-clips-part1.zip、part2.zip…，保证全部片段都能拿到。
  const batches = planExportBatches(clips);
  const multiPart = batches.length > 1;

  for (let i = 0; i < batches.length; i++) {
    onProgress?.(
      multiPart
        ? `Cutting clips & packing ZIP — part ${i + 1}/${batches.length} (server-side, may take a minute)...`
        : 'Cutting clips & packing ZIP (server-side, may take a minute)...',
    );
    const res = await fetch('/api/export-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: exportPlan || 'free',
        ...(template ? { template } : {}),
        clips: batches[i].map((c) => ({
          videoId: c.videoId,
          startTime: c.startTime,
          duration: c.duration,
          title: c.title,
        })),
        resolved: {
          streamUrl: streamMeta.streamUrl,
          userAgent: streamMeta.userAgent,
          visitorData: streamMeta.visitorData,
          xClientName: streamMeta.xClientName,
          clientVersion: streamMeta.clientVersion,
          clientName: streamMeta.client,
        },
      }),
      signal: AbortSignal.timeout(290_000),
    });

    if (!res.ok) {
      let msg = `Batch export failed (HTTP ${res.status})`;
      try {
        const data = await res.json();
        if (data?.error) msg = String(data.error);
      } catch { /* non-json */ }
      throw new Error(multiPart ? `${msg} (part ${i + 1}/${batches.length})` : msg);
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength < 2000) {
      throw new Error(multiPart ? `ZIP output too small (part ${i + 1}/${batches.length}).` : 'ZIP output too small.');
    }

    onProgress?.(
      multiPart
        ? `ZIP part ${i + 1}/${batches.length} ready. Downloading...`
        : 'ZIP ready. Downloading...',
    );
    triggerDownload(
      new Blob([buf], { type: 'application/zip' }),
      multiPart ? `clipopai-clips-part${i + 1}` : 'clipopai-clips',
    );
  }

  onProgress?.(multiPart ? `Download complete! (${batches.length} ZIP parts)` : 'Download complete!');
}

/**
 * Auto Compile (#3/#4, Starter+ 权益)：把用户选中的多条高光片段交给服务端
 * /api/compile-clips 按源顺序裁剪 + 交叉淡化拼接成一部成片，流式下载 MP4。
 *
 * 每个 clip 需是 YouTube 视频（提供 videoId + startTime + endTime）。服务端要求
 * streamUrl 等流元数据，因此对每个去重后的 videoId 调 resolveYouTubeStream（命中
 * 模块级缓存，不额外触发 CF Worker /resolve）。失败会 throw，由调用方提示。
 */
export async function compileClips(params: {
  clips: Array<{ videoId: string; startTime: number; endTime: number; title: string }>;
  /** 当前用户 plan（导出分辨率/水印差异由服务端处理） */
  exportPlan?: string;
  /** 9:16 竖版合片（Starter+） */
  orientation?: 'landscape' | 'vertical';
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const { clips, exportPlan, orientation, onProgress } = params;
  if (clips.length === 0) throw new Error('No clips selected to compile.');

  // 1) 按 videoId 去重解析流元数据（命中缓存，避免重复 /resolve）
  const streamMetaMap = new Map<string, ResolvedStream>();
  for (const clip of clips) {
    if (streamMetaMap.has(clip.videoId)) continue;
    onProgress?.(`Resolving stream...`);
    const meta = await resolveYouTubeStream(clip.videoId, 1);
    if (!meta?.streamUrl) throw new Error(`Could not resolve stream for video ${clip.videoId}`);
    streamMetaMap.set(clip.videoId, meta);
  }

  // 2) 组装服务端所需的 clip 载荷
  const serverClips = clips.map((clip) => {
    const meta = streamMetaMap.get(clip.videoId)!;
    const duration = Math.max(1, Math.min(clip.endTime - clip.startTime, 30));
    return {
      videoId: clip.videoId,
      startTime: clip.startTime,
      duration,
      streamUrl: meta.streamUrl,
      audioUrl: meta.audioUrl,
      userAgent: meta.userAgent,
      visitorData: meta.visitorData,
      xClientName: meta.xClientName,
      clientVersion: meta.clientVersion,
      clientName: meta.client,
    };
  });

  onProgress?.(`Compiling ${clips.length} clips (server-side, may take a minute or two)...`);

  // 3) 请求服务端拼接，流式返回 MP4
  const res = await fetch('/api/compile-clips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan: exportPlan || 'free',
      orientation: orientation === 'vertical' ? 'vertical' : 'landscape',
      clips: serverClips,
    }),
    signal: AbortSignal.timeout(280_000),
  });

  if (!res.ok) {
    let msg = `Compile failed (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch { /* non-json */ }
    throw new Error(msg);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength < 5000) {
    throw new Error('Compiled video too small.');
  }
  if (buf.byteLength >= 8) {
    const view = new DataView(buf);
    const boxType = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
    if (boxType !== 'ftyp') {
      throw new Error('Compiled output is not a valid MP4.');
    }
  }

  onProgress?.('Compiled video ready. Downloading...');
  triggerDownload(new Blob([buf], { type: 'video/mp4' }), 'compiled');
  onProgress?.('Download complete!');
}

/**
 * Recap Studio (P0-2)：带 HTTP 状态码的 API 错误，供页面区分 403（需升级 Pro）
 * 与其它失败（503 无 AI 通道 / 502 生成失败 / 422 无字幕 …）。
 */
export class RecapApiError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code?: string | null) {
    super(message);
    this.name = 'RecapApiError';
    this.status = status;
    this.code = code ?? null;
  }
}

async function recapApiError(res: Response, fallback: string): Promise<RecapApiError> {
  let detail = fallback;
  let code: string | null = null;
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string' && data.detail) detail = data.detail;
    else if (typeof data?.error === 'string' && data.error) detail = data.error;
    if (typeof data?.error === 'string' && data.error) code = data.error;
  } catch { /* non-json */ }
  return new RecapApiError(detail, res.status, code);
}

export interface RecapScriptResponse {
  script: RecapScript;
  /** 稿子来源：'llm' = AI 生成；'local' = 本地启发式草稿（未配置 AI 通道） */
  engine: 'llm' | 'local';
  transcript: { cueCount: number; lang: string | null };
  /** 源视频时长（秒），render 阶段回传用于音画对齐 */
  sourceDuration: number;
}

/**
 * Recap Studio 第一步：生成解说稿（可编辑）。
 *
 * 服务端优先走 LLM；生产未配置 AI 通道时**不静默降级**——返回 503
 * `recap_ai_unavailable`，需显式传 `allowLocalDraft: true` 才走本地启发式草稿。
 * 返回体始终带 `engine` 字段，前端据此显示来源徽章。
 */
export async function generateRecapScriptApi(params: {
  videoId: string;
  videoTitle?: string;
  targetDurationSec?: number;
  locale?: string;
  /** 客户端已分析出的高光区间（供可选素材打分，非必需） */
  highlights?: Array<{ start: number; end: number }>;
  /** 既有 AI 配置通道（localStorage clipop_ai_config），生产恒为 null */
  aiConfig?: unknown;
  /** 显式允许本地启发式草稿（engine='local'） */
  allowLocalDraft?: boolean;
  exportPlan?: string;
  accessToken?: string | null;
}): Promise<RecapScriptResponse> {
  const {
    videoId,
    videoTitle,
    targetDurationSec,
    locale,
    highlights,
    aiConfig,
    allowLocalDraft,
    exportPlan,
    accessToken,
  } = params;
  if (!videoId) throw new Error('videoId is required.');

  const res = await fetch('/api/recap-studio', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      mode: 'script',
      videoId,
      videoTitle,
      targetDurationSec,
      locale,
      highlights,
      aiConfig,
      allowLocalDraft: allowLocalDraft === true,
      plan: exportPlan || 'free',
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) throw await recapApiError(res, `Recap script failed (HTTP ${res.status})`);

  const data = (await res.json()) as RecapScriptResponse;
  if (!data?.script?.chapters?.length) throw new Error('Recap script response is empty.');
  return data;
}

/**
 * Recap Studio 第二步：按解说稿渲染成片（≤3 分钟），返回 MP4 Blob。
 *
 * 复用 `compileClips` 的范式：客户端先 `resolveYouTubeStream`（命中 5h 缓存）
 * 拿到 muxed 流元数据，再把 streamUrl / UA / visitorData 等交给服务端逐片裁剪。
 * 调用方负责预览用的 object URL 与下载。
 */
export async function renderRecapFilmApi(params: {
  videoId: string;
  script: RecapScript;
  sourceDuration?: number;
  locale?: string;
  orientation?: 'landscape' | 'vertical';
  voice?: string;
  style?: Partial<SubtitleStyle>;
  /** 原声音量百分比 0-100（默认 20，解说是主线） */
  originalVolume?: number;
  bgmMood?: 'calm' | 'energetic' | 'warm' | null;
  highlights?: Array<{ start: number; end: number }>;
  exportPlan?: string;
  accessToken?: string | null;
  onProgress?: (msg: string) => void;
}): Promise<Blob> {
  const {
    videoId,
    script,
    sourceDuration,
    locale,
    orientation,
    voice,
    style,
    originalVolume,
    bgmMood,
    highlights,
    exportPlan,
    accessToken,
    onProgress,
  } = params;
  if (!videoId) throw new Error('videoId is required.');
  if (!script?.chapters?.length) throw new Error('A recap script is required.');
  if (script.chapters.length > 6) throw new Error('Too many chapters (max 6).');

  onProgress?.('Resolving source stream...');
  const meta = await resolveYouTubeStream(videoId, 1);
  if (!meta?.streamUrl) throw new Error(`Could not resolve stream for video ${videoId}`);

  onProgress?.('Rendering recap film (server-side, may take a few minutes)...');

  const res = await fetch('/api/recap-studio', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      mode: 'render',
      videoId,
      script,
      sourceDuration,
      locale,
      plan: exportPlan || 'free',
      orientation: orientation === 'vertical' ? 'vertical' : 'landscape',
      voice,
      style,
      originalVolume,
      bgmMood: bgmMood || null,
      highlights,
      streamUrl: meta.streamUrl,
      audioUrl: meta.audioUrl,
      userAgent: meta.userAgent,
      visitorData: meta.visitorData,
      xClientName: meta.xClientName,
      clientVersion: meta.clientVersion,
      clientName: meta.client,
    }),
    signal: AbortSignal.timeout(290_000),
  });

  if (!res.ok) throw await recapApiError(res, `Recap render failed (HTTP ${res.status})`);

  const buf = await res.arrayBuffer();
  if (buf.byteLength < 20_000) throw new Error('Rendered recap is too small.');
  const view = new DataView(buf);
  const boxType = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
  if (boxType !== 'ftyp') throw new Error('Rendered output is not a valid MP4.');

  onProgress?.('Recap film ready.');
  return new Blob([buf], { type: 'video/mp4' });
}

/**
 * v48 core: Send streamUrl + metadata (JSON) to /api/cut-clip.
 * Server downloads the video bytes itself (no browser download), then
 * ffmpeg cuts [startTime, startTime+duration] from the local file.
 *
 * Returns Blob (standard progressive MP4) on success, or null on failure
 * (so the caller can fall through to the captureStream + remux fallback).
 */
async function downloadAndCutOnServer(params: {
  streamMeta: ResolvedStream;
  videoId: string;
  startTime: number;
  endTime: number;
  clipDuration: number;
  exportPlan?: string;
  /** 9:16 竖屏重构 */
  orientation?: 'landscape' | 'vertical';
  /** AI 自动字幕（Starter+） */
  subtitles?: boolean;
  /** 字幕样式（Starter+）：透传给 /api/cut-clip 的 style 字段 */
  subtitleStyle?: SubtitleStyle;
  /** 字幕翻译（Starter+）：透传给 /api/cut-clip 的 subtitleLang 字段 */
  subtitleLang?: string;
  /** AI 粗剪清理（Starter+）：按逐字稿剪掉长停顿与纯语气词 */
  jumpCut?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<Blob | null> {
  const { streamMeta, videoId, startTime, clipDuration, exportPlan, orientation, subtitles, subtitleStyle, subtitleLang, jumpCut, onProgress } = params;

  // v48: send JSON body with streamUrl + metadata.
  // Server downloads via CF Worker /stream (Node.js fetch, modern TLS),
  // then ffmpeg cuts from local file → standard progressive MP4.
  onProgress?.('Server downloading & cutting clip (may take 30-60s)...');

  try {
    const res = await fetch('/api/cut-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        streamUrl: streamMeta.streamUrl,
        // Pass audioUrl separately so /api/cut-clip can download audio stream
        // and merge with ffmpeg when /resolve returned adaptiveFormats (video-only
        // + separate audio). Without this, downloads from non-muxed /resolve
        // responses have NO audio.
        ...(streamMeta.audioUrl ? { audioUrl: streamMeta.audioUrl } : {}),
        userAgent: streamMeta.userAgent,
        visitorData: streamMeta.visitorData,
        // v55: Pass complete client metadata so /api/cut-clip can build a
        // correct CF Worker /stream URL for direct ffmpeg read (fast path).
        // Without these, the server's /stream URL lacks xClientName/clientVersion
        // and the CF Worker fast path falls back to slow tryClient resolution.
        xClientName: streamMeta.xClientName,
        clientVersion: streamMeta.clientVersion,
        clientName: streamMeta.client,
        videoId,
        startTime,
        duration: clipDuration,
        endTime: params.endTime,
        // P0: 让服务端按 plan 注入分辨率 cap + 水印
        plan: exportPlan || 'free',
        // 9:16 竖屏重构（Starter+）
        ...(orientation === 'vertical' ? { orientation: 'vertical' } : {}),
        // AI 自动字幕（Starter+）
        ...(subtitles ? { subtitles: true } : {}),
        // 字幕样式（Starter+）：静态字幕烧录样式
        ...(subtitleStyle ? { style: subtitleStyle } : {}),
        // 字幕翻译（Starter+）：翻译目标语言（zh-CN 等）
        ...(subtitleLang ? { subtitleLang } : {}),
        // AI 粗剪清理（Starter+）
        ...(jumpCut ? { jumpCut: true } : {}),
      }),
      // v55: increased from 90s to 180s to match the server's maxDuration=300s.
      // The previous 90s timeout was too tight: when the v55 direct-read path
      // failed and fell back to v51 download+cut, total time could reach 120s+.
      // 180s gives ample headroom for both paths.
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn('[downloadAndCutOnServer] /api/cut-clip failed:', res.status, errBody.slice(0, 300));
      // 导出即付费墙：免费用户被服务端拒绝 → 必须抛错，禁止静默回落到浏览器录制（否则仍能拿到文件）
      if (res.status === 403 && errBody.includes('export_requires_paid')) {
        throw new Error('export_requires_paid');
      }
      return null;
    }

    const mp4Buf = await res.arrayBuffer();
    if (mp4Buf.byteLength < 5_000) {
      console.warn('[downloadAndCutOnServer] Output too small:', mp4Buf.byteLength);
      return null;
    }

    // Validate output is a real MP4 (ftyp box at offset 4)
    if (mp4Buf.byteLength >= 8) {
      const view = new DataView(mp4Buf);
      const boxType = String.fromCharCode(
        view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7),
      );
      if (boxType !== 'ftyp') {
        console.warn('[downloadAndCutOnServer] Output missing ftyp header (got:', boxType, ')');
        return null;
      }
    }

    onProgress?.('Standard MP4 ready. Downloading...');
    return new Blob([mp4Buf], { type: 'video/mp4' });
  } catch (err) {
    console.warn('[downloadAndCutOnServer] Error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Trigger a browser download of a blob with a sanitized filename.
 */
function triggerDownload(blob: Blob, title: string): void {
  const safeName = (title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50) || 'clip');
  // 扩展名必须跟随真实类型：zip 包若被当成 webm 命名，用户双击打不开（历史缺陷）。
  const ext = blob.type.includes('zip') ? 'zip' : blob.type.includes('mp4') ? 'mp4' : 'webm';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

/**
 * Cut a clip segment directly from a CF Worker /stream URL.
 *
 * The <video> element loads the stream URL with crossOrigin='anonymous',
 * which enables CORS mode. CF Worker /stream returns proper CORS headers
 * (Access-Control-Allow-Origin: *), so captureStream() returns BOTH video
 * and audio tracks — no CORS taint.
 *
 * The browser handles seeking natively: it sends Range requests to the
 * stream URL for the byte range at startTime. No need to pre-download
 * the entire video prefix.
 *
 * @throws Error if captureStream is unsupported, seek fails, or recording fails
 */
async function cutClipFromStream(
  streamUrl: string,
  startTime: number,
  duration: number,
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const video = document.createElement('video');
    video.src = streamUrl;
    // crossOrigin='anonymous' enables CORS mode. CF Worker /stream returns
    // Access-Control-Allow-Origin: *, so the video loads without taint.
    // captureStream() then returns BOTH video and audio tracks.
    video.crossOrigin = 'anonymous';
    // muted=true: allows play() without user activation. The /resolve call
    // takes 2-5s, and user click activation expires after ~5s. Without muted,
    // play() throws NotAllowedError → empty recording.
    // muted only silences local speaker output; captureStream() still
    // captures the original audio track (verified hasAudio=true with muted).
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:640px;height:360px;opacity:0;';
    document.body.appendChild(video);

    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    const chunks: Blob[] = [];
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    // Seek on long videos can take up to 30s (browser downloads data at startTime)
    const timeoutTimer = setTimeout(() => {
      fail(new Error('Clip recording timed out (seek took too long)'));
    }, (duration + 60) * 1000);
    let settled = false;

    const cleanup = () => {
      if (stopTimer) clearTimeout(stopTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
      try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch {}
      try { video.pause(); } catch {}
      video.remove();
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const succeed = (blob: Blob) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (blob.size < 5_000) {
        reject(new Error(`Recording too small: ${blob.size} bytes`));
      } else {
        resolve(blob);
      }
    };

    video.addEventListener('loadedmetadata', () => {
      const vidDuration = video.duration;
      if (Number.isFinite(vidDuration) && vidDuration < startTime + duration) {
        console.warn(`[cutClipFromStream] Video duration=${vidDuration}s, need ${startTime + duration}s`);
      }
      onProgress?.(`Seeking to ${Math.floor(startTime)}s (video is ${Math.floor(vidDuration)}s long)...`);
      try {
        video.currentTime = startTime;
      } catch (err) {
        fail(new Error(`Seek failed: ${err instanceof Error ? err.message : err}`));
      }
    });

    video.addEventListener('seeked', () => {
      const captureStreamFn = (video as any).captureStream || (video as any).mozCaptureStream;
      if (!captureStreamFn) {
        fail(new Error('captureStream not supported in this browser'));
        return;
      }

      try {
        stream = captureStreamFn.call(video);
      } catch (err) {
        fail(new Error(`captureStream failed: ${err instanceof Error ? err.message : err}`));
        return;
      }

      const activeStream: MediaStream = stream!;
      const hasAudio = activeStream.getAudioTracks().length > 0;
      const hasVideo = activeStream.getVideoTracks().length > 0;
      if (!hasVideo) {
        fail(new Error('captureStream returned no video track'));
        return;
      }
      if (!hasAudio) {
        console.warn('[cutClipFromStream] No audio track in captureStream');
      }

      const mimeTypes = [
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      const mimeType = mimeTypes.find((m) => {
        try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
      }) || 'video/webm';

      try {
        recorder = new MediaRecorder(activeStream, {
          mimeType,
          videoBitsPerSecond: 2_000_000,
          audioBitsPerSecond: 128_000,
        });
      } catch (err) {
        fail(new Error(`MediaRecorder creation failed: ${err instanceof Error ? err.message : err}`));
        return;
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
        succeed(blob);
      };

      recorder.onerror = (e: any) => {
        fail(new Error(`MediaRecorder error: ${e?.error?.message || e}`));
      };

      video.play().then(() => {
        recorder!.start(200);
        onProgress?.(`Recording clip (${duration.toFixed(0)}s, ${hasAudio ? 'with audio' : 'no audio'})...`);

        stopTimer = setTimeout(() => {
          try {
            if (recorder && recorder.state !== 'inactive') recorder.stop();
          } catch (err) {
            fail(new Error(`Recorder stop failed: ${err instanceof Error ? err.message : err}`));
          }
        }, duration * 1000);
      }).catch((playErr) => {
        fail(new Error(`Video play failed: ${playErr instanceof Error ? playErr.message : playErr}`));
      });
    });

    video.addEventListener('error', () => {
      fail(new Error(`Video element error: ${video.error?.message || 'unknown'}`));
    });

    video.load();
  });
}
