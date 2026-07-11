'use client';

/**
 * YouTube clip download utility — canvas captureStream + decoded audio buffer.
 *
 * PROBLEM:
 *   - video.captureStream() on cross-origin video may return empty frames
 *   - createMediaElementSource() on cross-origin audio outputs zeros (CORS taint)
 *   - googlevideo.com streamUrls are video-only DASH (itag=136), no audio
 *   - googlevideo.com begin param signature mismatch — can't seek via URL
 *
 * SOLUTION (v19):
 *   1. /resolve to get streamUrl (video) + audioUrl (audio)
 *   2. /stream?streamUrl=... proxies both streams with CORS headers
 *   3. <video> plays video stream, seek to startTime
 *   4. requestAnimationFrame draws video frames to <canvas>
 *   5. canvas.captureStream(30) → video track
 *   6. fetch audio ArrayBuffer → decodeAudioData → AudioBufferSourceNode
 *      (bypasses audio element CORS taint)
 *   7. AudioBufferSourceNode.start(0, startTime, duration) → audio track
 *   8. Merge tracks → MediaRecorder → download
 *
 * FALLBACK CHAIN (in handleDownload):
 *   downloadYouTubeClip → downloadFullVideoStream → downloadPartialMP4 → window.open(linkOnlyUrl)
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
  onProgress?: (msg: string) => void;
}): Promise<{ blob: Blob; extension: string }> {
  const { videoId, startTime, endTime, title, onProgress } = params;

  // ── Primary path: server-side ffmpeg clipper ───────────────────────────────
  try {
    onProgress?.('Preparing server-side clip...');
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const apiUrl = new URL('/api/download-youtube-clip', origin || undefined);
    apiUrl.searchParams.set('videoId', videoId);
    apiUrl.searchParams.set('startTime', String(startTime));
    apiUrl.searchParams.set('endTime', String(endTime));
    apiUrl.searchParams.set('title', title);

    const res = await fetch(apiUrl.toString(), {
      signal: AbortSignal.timeout(300_000), // 5 minutes — server may download + transcode
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
  } catch (serverErr) {
    console.warn('[downloadYouTubeClip] Server-side clip failed, falling back to browser capture:', serverErr);
    onProgress?.('Server clip unavailable, using browser fallback...');
  }

  // ── Fallback path: browser-side capture (existing implementation) ───────────
  const cfWorkerUrl = String(
    typeof window !== 'undefined' ? window.__CF_WORKER_URL__ : '',
  ).trim();
  if (!cfWorkerUrl) {
    throw new Error('CF_WORKER_URL not configured');
  }

  // Step 1: Resolve stream URLs (bypass cache to ensure fresh streamUrl).
  onProgress?.('Resolving video stream...');
  let resolved: ResolvedStream | null = null;
  try {
    resolved = await resolveYouTubeStream(videoId, 1);
    console.log('[downloadYouTubeClip] Resolved:', {
      hasStreamUrl: !!resolved.streamUrl,
      hasAudioUrl: !!resolved.audioUrl,
      client: resolved.client,
      colo: resolved.colo,
    });
  } catch (resolveErr) {
    console.warn('[downloadYouTubeClip] /resolve failed:', resolveErr);
  }

  if (resolved && !resolved.streamUrl) {
    resolved = null;
  }

  // Step 2: Build /stream?streamUrl=... URLs (fast path).
  const streamBase = new URL(cfWorkerUrl);
  streamBase.pathname = `${streamBase.pathname.replace(/\/$/, '')}/stream`;

  const buildStreamUrl = (rawStreamUrl: string): string => {
    const u = new URL(streamBase.toString());
    u.searchParams.set('streamUrl', rawStreamUrl);
    if (resolved) {
      u.searchParams.set('userAgent', resolved.userAgent);
      u.searchParams.set('visitorData', resolved.visitorData);
      u.searchParams.set('xClientName', String(resolved.xClientName));
      u.searchParams.set('clientVersion', resolved.clientVersion);
      u.searchParams.set('clientName', resolved.client);
    }
    return u.toString();
  };

  let videoStreamUrl: string;
  let audioStreamUrl: string | null = null;

  if (resolved) {
    videoStreamUrl = buildStreamUrl(resolved.streamUrl);
    if (resolved.audioUrl) {
      audioStreamUrl = buildStreamUrl(resolved.audioUrl);
    }
  } else {
    const u = new URL(streamBase.toString());
    u.searchParams.set('videoId', videoId);
    u.searchParams.set('maxHeight', '360');
    videoStreamUrl = u.toString();
  }

  const rawDuration = Math.max(1, endTime - startTime);
  const duration = Math.min(rawDuration, 30);

  onProgress?.('Loading video stream...');

  // Create video element — must be in DOM and rendered for canvas.drawImage.
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true; // Bypass autoplay policy; captureStream still gets audio
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:360px;opacity:0.01;pointer-events:none;z-index:-1;';
  document.body.appendChild(video);

  // Create canvas for video frame capture
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  canvas.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });

  let recorder: MediaRecorder | null = null;
  let audioCtx: AudioContext | null = null;
  let rafId: number | null = null;
  let audioSource: AudioBufferSourceNode | null = null;

  try {
    if (!ctx) throw new Error('Canvas 2D context not available');

    // Load video
    video.src = videoStreamUrl;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Video load timeout (30s)')), 30_000);
      const onCanPlay = () => { clearTimeout(timeout); resolve(); };
      const onError = () => {
        clearTimeout(timeout);
        const err = video.error;
        reject(new Error(`Video load failed: ${err?.message || 'unknown'}`));
      };
      video.addEventListener('canplay', onCanPlay, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    // Match canvas size to video
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 360;
    canvas.width = vw;
    canvas.height = vh;

    // Seek video to startTime
    if (startTime > 0.1) {
      onProgress?.(`Seeking to ${Math.round(startTime)}s...`);
      video.currentTime = Math.max(0, startTime);
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[downloadYouTubeClip] Video seek timeout, proceeding anyway');
          resolve();
        }, 15_000);
        const onSeeked = () => { clearTimeout(timeout); resolve(); };
        video.addEventListener('seeked', onSeeked, { once: true });
      });
    }

    // Play video (muted=true bypasses autoplay policy)
    onProgress?.('Starting recording...');
    try {
      await video.play();
    } catch (playErr) {
      throw new Error(`Video play failed: ${playErr instanceof Error ? playErr.message : playErr}`);
    }

    // Start drawing video frames to canvas
    const drawFrame = () => {
      try {
        if (!video.paused && !video.ended) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      } catch (e) {
        // drawImage may throw if video frame not ready; ignore
      }
      rafId = requestAnimationFrame(drawFrame);
    };
    rafId = requestAnimationFrame(drawFrame);

    // Capture canvas stream (video track)
    await new Promise<void>((r) => setTimeout(r, 100));
    const canvasStream = canvas.captureStream(30);
    const videoTrack = canvasStream.getVideoTracks()[0];
    if (!videoTrack) throw new Error('Failed to capture canvas stream');

    // Set up audio track
    let audioTrack: MediaStreamTrack | null = null;

    if (audioStreamUrl) {
      try {
        onProgress?.('Loading audio stream...');

        // Fetch audio data directly (bypasses audio element CORS taint)
        const audioRes = await fetch(audioStreamUrl, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!audioRes.ok) {
          throw new Error(`Audio fetch failed: HTTP ${audioRes.status}`);
        }
        const audioBuffer = await audioRes.arrayBuffer();
        if (audioBuffer.byteLength < 1_000) {
          throw new Error(`Audio data too small: ${audioBuffer.byteLength}`);
        }

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        const decodedAudio = await audioCtx.decodeAudioData(audioBuffer);
        console.log('[downloadYouTubeClip] Decoded audio:', {
          duration: decodedAudio.duration,
          channels: decodedAudio.numberOfChannels,
          sampleRate: decodedAudio.sampleRate,
        });

        // Create audio track from decoded buffer
        const destNode = audioCtx.createMediaStreamDestination();
        audioSource = audioCtx.createBufferSource();
        audioSource.buffer = decodedAudio;
        audioSource.connect(destNode);
        // Start at startTime, play for clip duration
        audioSource.start(0, Math.max(0, startTime), duration);
        audioTrack = destNode.stream.getAudioTracks()[0] || null;

        console.log('[downloadYouTubeClip] Audio track from decoded buffer:', !!audioTrack);
      } catch (audioErr) {
        console.warn('[downloadYouTubeClip] Decoded audio failed:', audioErr);
      }
    }

    // Fallback: extract audio from video element (if muxed format)
    if (!audioTrack) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!audioCtx) {
          audioCtx = new AudioCtx();
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
          }
        }
        const sourceNode = audioCtx.createMediaElementSource(video);
        const destNode = audioCtx.createMediaStreamDestination();
        sourceNode.connect(destNode);
        audioTrack = destNode.stream.getAudioTracks()[0] || null;
        console.log('[downloadYouTubeClip] Audio track from video element:', !!audioTrack);
      } catch (audioErr) {
        console.warn('[downloadYouTubeClip] Video audio extraction failed:', audioErr);
      }
    }

    // Merge tracks
    const tracks: MediaStreamTrack[] = [videoTrack];
    if (audioTrack) tracks.push(audioTrack);
    const mergedStream = new MediaStream(tracks);

    console.log('[downloadYouTubeClip] Merged stream tracks:', {
      video: mergedStream.getVideoTracks().length,
      audio: mergedStream.getAudioTracks().length,
    });

    // Pick best supported mimeType
    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
    ];
    const mimeType = mimeTypes.find(m => {
      try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
    }) || 'video/webm';

    recorder = new MediaRecorder(mergedStream, {
      mimeType,
      videoBitsPerSecond: 2_000_000,
      audioBitsPerSecond: 128_000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const recordingDone = new Promise<Blob>((resolve, reject) => {
      recorder!.onstop = () => {
        try {
          resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
        } catch (err) {
          reject(err);
        }
      };
      recorder!.onerror = () => {
        reject(new Error('MediaRecorder error'));
      };
    });

    recorder.start(100);

    onProgress?.(`Recording ${Math.round(duration)}s of clip...`);

    // Wait for clip duration
    await new Promise<void>((resolve) => {
      const stopTime = Date.now() + duration * 1000;
      const checkInterval = setInterval(() => {
        if (Date.now() >= stopTime || video.ended) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });

    // Stop everything
    video.pause();
    if (audioSource) {
      try { audioSource.stop(); } catch {}
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }

    const videoBlob = await recordingDone;

    if (videoBlob.size < 10_000) {
      throw new Error(`Recording too small: ${videoBlob.size} bytes`);
    }

    // Trigger download
    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const safeName = (title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50) || 'clip');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(videoBlob);
    a.download = `${safeName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);

    onProgress?.('Download complete!');
    return { blob: videoBlob, extension };
  } finally {
    // Cleanup
    if (rafId !== null) cancelAnimationFrame(rafId);
    try { if (audioSource) audioSource.stop(); } catch {}
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
    try { video.pause(); } catch {}
    try { video.src = ''; } catch {}
    try { video.load(); } catch {}
    try { document.body.removeChild(video); } catch {}
    try { document.body.removeChild(canvas); } catch {}
    try {
      if (audioCtx && audioCtx.state !== 'closed') {
        await audioCtx.close();
      }
    } catch {}
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

  // Download enough data to cover the clip position, capped at 10MB (5 chunks)
  const neededBytes = Math.min(
    Math.ceil(Math.min(endTime + 5, 75) * 400_000),
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
