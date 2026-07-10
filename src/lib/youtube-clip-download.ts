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
 * Download a YouTube video clip by recording it via captureStream + MediaRecorder.
 *
 * Flow:
 *   1. Resolve streamUrl via CF Worker /resolve (cached)
 *   2. Build /stream URL with streamUrl param (fast path, CORS-enabled)
 *   3. Fetch partial video as blob (enough to cover clip position)
 *   4. Create blob URL and load in <video> → metadata loads instantly
 *   5. Seek to startTime, use captureStream + MediaRecorder to record
 *   6. Trigger browser download of the recorded blob
 *
 * CRITICAL: DASH video-only streams (itag=136) cannot be loaded directly by
 * <video src="streamUrl"> — loadedmetadata never fires because the browser's
 * media engine can't parse the fragmented MP4 in a streaming fashion. Fetching
 * as a blob first solves this: the browser has all data immediately available
 * and can parse ftyp+moov atoms from the beginning of the file.
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

  onProgress?.('Resolving video stream...');
  const resolved = await resolveYouTubeStream(videoId);

  onProgress?.('Preparing video player...');
  const streamProxyUrl = buildStreamProxyUrl(videoId, resolved);

  // Calculate how many bytes we need to cover the clip position.
  // 720p video-only stream (itag=136) is ~2-3Mbps (250-375 KB/s).
  // Use 400KB/s as a conservative estimate. Need data from 0 to endTime + 5s buffer.
  const BITRATE_BYTES_PER_SEC = 400_000;
  const maxBlobSize = 50 * 1024 * 1024; // 50MB cap
  const neededBytes = Math.min(
    Math.ceil((endTime + 5) * BITRATE_BYTES_PER_SEC),
    maxBlobSize,
  );

  // If the clip is too far into the video (>~125s at 400KB/s), the blob
  // approach would require too much data. Fall back to full stream download.
  if (neededBytes >= maxBlobSize) {
    onProgress?.('Clip position is far, downloading full stream...');
    await downloadFullVideoStream({
      videoId,
      title,
      maxBytes: maxBlobSize,
      onProgress,
    });
    return { blob: new Blob(), extension: 'mp4' };
  }

  // Fetch partial video as a blob. This is the key fix: <video> can load
  // metadata from a blob URL instantly, but can't parse DASH streams directly.
  const sizeMB = (neededBytes / 1024 / 1024).toFixed(1);
  onProgress?.(`Downloading video data (${sizeMB}MB)...`);
  const videoRes = await fetch(streamProxyUrl, {
    headers: { Range: `bytes=0-${neededBytes - 1}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!videoRes.ok && videoRes.status !== 206) {
    throw new Error(`Stream fetch failed: HTTP ${videoRes.status}`);
  }
  const videoBlob = await videoRes.blob();
  if (videoBlob.size < 50_000) {
    throw new Error(`Stream too small: ${videoBlob.size} bytes`);
  }
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
 * Fallback download: fetch the full video stream as a blob and trigger download.
 * Used when captureVideoClip fails (e.g., browser doesn't support captureStream).
 *
 * This downloads the FULL video (not just the clip segment), which is large
 * but ensures the user gets something downloadable.
 */
export async function downloadFullVideoStream(params: {
  videoId: string;
  title: string;
  maxBytes?: number;
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const { videoId, title, maxBytes = 50 * 1024 * 1024, onProgress } = params;

  onProgress?.('Resolving video stream...');
  const resolved = await resolveYouTubeStream(videoId);

  onProgress?.('Building stream proxy URL...');
  const streamProxyUrl = buildStreamProxyUrl(videoId, resolved);

  onProgress?.('Downloading video (this may take a while)...');
  const res = await fetch(streamProxyUrl, {
    headers: { Range: `bytes=0-${maxBytes - 1}` },
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok && res.status !== 206) {
    throw new Error(`Stream fetch failed: HTTP ${res.status}`);
  }

  const blob = await res.blob();
  if (blob.size === 0) throw new Error('Empty response');

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
