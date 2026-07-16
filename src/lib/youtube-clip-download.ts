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
  onProgress?: (msg: string) => void;
}): Promise<{ blob: Blob; extension: string }> {
  const { videoId, startTime, endTime, title, resolved, onProgress } = params;
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
      throw new Error(body.error || `Server clip failed: HTTP ${res.status}`);
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
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const { videoId, startTime, endTime, title, resolved, onProgress } = params;
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
      onProgress,
    });
    if (result) {
      triggerDownload(result, title);
      onProgress?.('Download complete!');
      return;
    }
  } catch (err) {
    console.warn('[downloadClipViaBrowser] v48 server-download+cut failed:', err instanceof Error ? err.message : err);
  }

  // Step 3: Fallback to browser captureStream + MediaRecorder + remux
  // Used ONLY when /api/cut-clip server endpoint fails entirely.
  //
  // captureStream + MediaRecorder produces fMP4 (fragmented MP4) or webm.
  // fMP4/webm are NOT playable in standard desktop players (QuickTime, WMP).
  // We MUST remux to standard progressive MP4 via /api/remux-mp4.
  // If remux fails, we THROW instead of downloading fMP4 as .mp4 (which would
  // produce a non-playable file — the user's reported issue).
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
  onProgress?: (msg: string) => void;
}): Promise<Blob | null> {
  const { streamMeta, videoId, startTime, clipDuration, onProgress } = params;

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
        userAgent: streamMeta.userAgent,
        visitorData: streamMeta.visitorData,
        videoId,
        startTime,
        duration: clipDuration,
        endTime: params.endTime,
      }),
      signal: AbortSignal.timeout(90_000), // 90s — server downloads (80MB cap, ~40s) + cuts (~5s)
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn('[downloadAndCutOnServer] /api/cut-clip failed:', res.status, errBody.slice(0, 300));
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
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
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

      const hasAudio = stream.getAudioTracks().length > 0;
      const hasVideo = stream.getVideoTracks().length > 0;
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
        recorder = new MediaRecorder(stream, {
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
