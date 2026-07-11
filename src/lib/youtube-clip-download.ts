'use client';

/**
 * YouTube clip download utility — browser-side recording via CF Worker /stream.
 *
 * PROBLEM:
 *   - CF Worker /stream without streamUrl param calls InnerTube API, which is
 *     rate-limited by YouTube (LOGIN_REQUIRED on SJC colo after 1-2 calls).
 *   - Vercel Edge/Lambda IPs are blocked by YouTube (403).
 *   - googlevideo.com streamUrls are video-only DASH (itag=136), no audio.
 *   - Browser CORS prevents direct fetch of googlevideo.com URLs.
 *
 * SOLUTION:
 *   1. Browser calls CF Worker /resolve (InnerTube API) — works on first call,
 *      gets rate-limited after. Cache the result for 5 hours (streamUrl expiry).
 *   2. Browser passes the resolved streamUrl to CF Worker /stream as a query
 *      param (fast path). /stream fetches the streamUrl from CF Worker IP
 *      (matches IP binding) and adds CORS headers (Access-Control-Allow-Origin: *).
 *   3. Browser creates a <video> element with the /stream URL, seeks to
 *      startTime, and uses captureStream + MediaRecorder to record the segment.
 *   4. Browser triggers download of the recorded blob.
 *
 * LIMITATIONS:
 *   - Real-time recording (takes min(duration, 15) seconds)
 *   - Video-only (no audio) — YouTube IOS_v20 client returns video-only DASH
 *   - Max 15 seconds per clip (captureVideoClip MAX_RECORD_DURATION)
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
}

// Module-level cache: streamUrl is valid for ~6 hours (YouTube expire param).
// YouTube rate-limits /resolve after 1-2 calls per CF Worker colo, so caching
// is critical to avoid LOGIN_REQUIRED on subsequent downloads.
const resolveCache = new Map<string, { data: ResolvedStream; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours

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
  resolveUrl.searchParams.set('maxHeight', '360');

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

      const resolved: ResolvedStream = {
        streamUrl: data.streamUrl,
        userAgent: data.userAgent || '',
        visitorData: data.visitorData || '',
        xClientName: data.xClientName || '1',
        clientVersion: data.clientVersion || '',
        client: data.client || 'direct',
        audioUrl: data.audioUrl,
        duration: data.duration,
        colo: data.colo,
      };

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
  streamEndpoint.searchParams.set('maxHeight', '360');
  // Fast path params: skip InnerTube, fetch streamUrl directly
  streamEndpoint.searchParams.set('streamUrl', resolved.streamUrl);
  streamEndpoint.searchParams.set('userAgent', resolved.userAgent);
  streamEndpoint.searchParams.set('visitorData', resolved.visitorData);
  streamEndpoint.searchParams.set('xClientName', String(resolved.xClientName));
  streamEndpoint.searchParams.set('clientVersion', resolved.clientVersion);
  streamEndpoint.searchParams.set('clientName', resolved.client);
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

/**
 * Download a YouTube video clip by recording it via captureStream + MediaRecorder.
 *
 * Flow:
 *   1. Build /stream URL directly (no streamUrl param) — Worker handles
 *      resolve + stream internally, avoiding colo-mismatch 502 errors.
 *   2. Fetch partial video as ArrayBuffer (combined MP4 from Worker fallback)
 *   3. Create blob URL with explicit video/mp4 MIME type (no trimming)
 *   4. Seek to startTime, use captureStream + MediaRecorder to record
 *   5. Trigger browser download of the recorded blob
 *
 * FALLBACK: If /stream fails (e.g., YouTube rate-limited the CF Worker colo)
 * or returns non-MP4 data, falls back to screen capture (getDisplayMedia)
 * which works at any position and includes audio.
 *
 * CRITICAL FIXES (v10):
 *   - Removed /resolve + /stream fast-path dual call: caused 502 when the two
 *     requests routed to different CF Worker colos (different egress IPs).
 *     Direct /stream call lets Worker handle resolve internally with consistent
 *     IP binding, and falls back to 360p combined MP4 (itag=18) when HD fails.
 *   - Removed trimToCompleteFragment: it incorrectly truncated the buffer to
 *     just ftyp+moov (517KB), discarding the entire mdat (video data).
 *     Combined MP4 from /stream is a regular MP4 (ftyp+moov+mdat) that plays
 *     and seeks correctly without trimming.
 *   - For clips far into the video (>75s), falls back to screen capture
 *     (getDisplayMedia) which works at any position and includes audio.
 *
 * @returns The recorded blob (also triggers download)
 */
export async function downloadYouTubeClip(params: {
  videoId: string;
  startTime: number;
  endTime: number;
  title: string;
  onProgress?: (msg: string) => void;
}): Promise<{ blob: Blob; extension: string }> {
  const { videoId, startTime, endTime, title, onProgress } = params;

  // For clips far into the video (>75s), the blob approach requires too much
  // data. Use screen capture instead (works at any position, includes audio).
  const BLOB_MAX_END_TIME = 75; // seconds — ~30MB at 400KB/s
  if (endTime > BLOB_MAX_END_TIME) {
    onProgress?.('Clip is far into video, using screen capture...');
    return downloadViaScreenCapture({ videoId, startTime, endTime, title, onProgress });
  }

  // Build /stream URL directly (without streamUrl param) — Worker handles
  // resolve + stream internally. This avoids the 502 error caused by
  // /resolve + /stream fast-path dual calls hitting different CF Worker colos
  // (different egress IPs → streamUrl IP binding mismatch → YouTube 403).
  // Worker falls back to 360p combined MP4 (itag=18) when 720p fails — this is
  // a regular MP4 (ftyp+moov+mdat) that plays and seeks correctly.
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

  // Calculate how many bytes we need to cover the clip position.
  // 360p combined MP4 (itag=18) is ~400KB/s. Need data from 0 to endTime + 5s buffer.
  const BITRATE_BYTES_PER_SEC = 400_000;
  const neededBytes = Math.ceil((endTime + 5) * BITRATE_BYTES_PER_SEC);

  // Fetch partial video data as ArrayBuffer.
  // If /stream fails (e.g., YouTube rate-limited the CF Worker colo) or
  // returns non-video response (JSON error), fall back to screen capture.
  // Timeout is 120s — CF Worker must resolve via InnerTube API (~10-15s)
  // then stream data from googlevideo.com (~67KB/s observed, so 5MB ≈ 75s).
  const sizeMB = (neededBytes / 1024 / 1024).toFixed(1);
  onProgress?.(`Downloading video data (${sizeMB}MB)...`);
  let arrayBuffer: ArrayBuffer;
  try {
    const videoRes = await fetch(streamEndpoint.toString(), {
      headers: { Range: `bytes=0-${neededBytes - 1}` },
      signal: AbortSignal.timeout(120_000),
    });
    if (!videoRes.ok && videoRes.status !== 206) {
      throw new Error(`Stream fetch failed: HTTP ${videoRes.status}`);
    }
    arrayBuffer = await videoRes.arrayBuffer();
    // Check if response is a valid MP4 (starts with "ftyp" box at offset 4).
    // /stream may return a JSON error (small, non-MP4) when YouTube rate-limits
    // the CF Worker colo. In that case, fall back to screen capture.
    if (arrayBuffer.byteLength < 50_000) {
      const preview = new TextDecoder().decode(arrayBuffer.slice(0, 200));
      throw new Error(`Stream returned non-video data (${arrayBuffer.byteLength} bytes): ${preview}`);
    }
    const view = new DataView(arrayBuffer);
    const boxType = String.fromCharCode(
      view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7),
    );
    if (boxType !== 'ftyp') {
      const preview = new TextDecoder().decode(arrayBuffer.slice(0, 200));
      throw new Error(`Stream returned non-MP4 data (boxType=${boxType}): ${preview}`);
    }
  } catch (streamErr) {
    console.warn('[downloadYouTubeClip] /stream failed, falling back to screen capture:', streamErr instanceof Error ? streamErr.message : streamErr);
    onProgress?.('Stream unavailable, using screen capture...');
    return downloadViaScreenCapture({ videoId, startTime, endTime, title, onProgress });
  }

  // Use the full ArrayBuffer directly — do NOT trim.
  // Combined MP4 (itag=18) from /stream is a regular MP4 (ftyp+moov+mdat),
  // not DASH fMP4. trimToCompleteFragment was found to incorrectly truncate
  // the buffer to just ftyp+moov (~517KB), discarding all mdat video data.
  // Tests confirmed: 5MB and 10MB complete blobs load metadata, seek, and
  // record correctly without any trimming.
  const downloadedMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(1);
  console.log(`[downloadYouTubeClip] Blob downloaded: ${arrayBuffer.byteLength} bytes (${downloadedMB}MB)`);

  // Create blob with explicit MIME type so the browser uses the MP4 media engine
  const videoBlob = new Blob([arrayBuffer], { type: 'video/mp4' });
  const blobUrl = URL.createObjectURL(videoBlob);

  onProgress?.('Recording clip (real-time, max 15s)...');
  const { captureVideoClip } = await import('@/lib/ffmpeg-client');
  try {
    const { videoBlob: recordedBlob } = await captureVideoClip({
      videoUrl: blobUrl,
      startTime,
      endTime,
      onProgress: (msg) => onProgress?.(msg),
    });

    if (recordedBlob.size < 10_000) {
      throw new Error(`Recording too small: ${recordedBlob.size} bytes`);
    }

    const extension = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const safeName = (title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50) || 'clip');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(recordedBlob);
    a.download = `${safeName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);

    onProgress?.('Download complete!');
    return { blob: recordedBlob, extension };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Fallback download: fetch the video stream as a blob and trigger download.
 * Used when captureVideoClip fails (e.g., browser doesn't support captureStream).
 *
 * This downloads a partial video (up to maxBytes), which includes video from 0:00
 * to ~maxBytes/400KBps. The user can use a video player to find the highlight segment.
 *
 * v10 fix: Uses direct /stream URL (no /resolve + /stream dual call) to avoid
 * colo-mismatch 502 errors. Also validates that the response is a valid MP4.
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

  onProgress?.('Downloading video (this may take a while)...');
  const res = await fetch(streamEndpoint.toString(), {
    headers: { Range: `bytes=0-${maxBytes - 1}` },
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok && res.status !== 206) {
    throw new Error(`Stream fetch failed: HTTP ${res.status}`);
  }

  const blob = await res.blob();
  if (blob.size === 0) throw new Error('Empty response');

  // Validate that we got a real MP4, not a JSON error response
  if (blob.size < 50_000) {
    const text = await blob.text();
    throw new Error(`Stream returned non-video data (${blob.size} bytes): ${text.slice(0, 200)}`);
  }

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
 * This is NOT the ideal solution (it's not the exact [startTime, endTime]
 * segment), but it ensures the user always gets a downloadable file.
 */
export async function downloadPartialMP4(params: {
  videoId: string;
  title: string;
  endTime: number;
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const { videoId, title, endTime, onProgress } = params;

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

  // Download enough data to cover the clip position
  const neededBytes = Math.ceil(Math.min(endTime + 5, 75) * 400_000);

  onProgress?.(`Downloading video data (${(neededBytes / 1024 / 1024).toFixed(1)}MB)...`);
  const res = await fetch(streamEndpoint.toString(), {
    headers: { Range: `bytes=0-${neededBytes - 1}` },
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok && res.status !== 206) {
    throw new Error(`Stream fetch failed: HTTP ${res.status}`);
  }

  const blob = await res.blob();
  if (blob.size < 50_000) {
    throw new Error(`Stream too small: ${blob.size} bytes`);
  }

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
