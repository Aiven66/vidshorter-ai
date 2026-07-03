'use client';

/**
 * Browser-side video clip capture using HTMLVideoElement.captureStream() + MediaRecorder.
 *
 * This replaces ffmpeg.wasm which required downloading a 25MB WASM file and
 * had reliability issues. Instead, we:
 * 1. Create a <video> element with crossorigin="anonymous"
 * 2. Set its src to the CF Worker /stream URL (which proxies YouTube video with CORS headers)
 * 3. Seek to the clip's start time
 * 4. Use captureStream() to get a MediaStream (video + audio tracks)
 * 5. Use MediaRecorder to record the stream for the clip duration
 * 6. Return the recorded blob as the real video clip
 *
 * Key advantages:
 * - No external dependencies (no 25MB WASM download)
 * - Uses native browser APIs (fast, reliable)
 * - CORS handled by CF Worker's Access-Control-Allow-Origin: *
 * - Real video with audio (not zoompan fake)
 * - Works with any video format the browser can play
 *
 * Limitation: records in real-time (takes `duration` seconds for a `duration`-second clip)
 */

interface CaptureResult {
  videoBlob: Blob;
  thumbnailBlob: Blob | null;
}

/**
 * Capture a video clip by playing a video element and recording its stream.
 *
 * @param videoUrl - URL of the video to play (must be CORS-enabled)
 * @param startTime - Start time in seconds
 * @param endTime - End time in seconds
 * @param onProgress - Optional progress callback
 */
export async function captureVideoClip(params: {
  videoUrl: string;
  startTime: number;
  endTime: number;
  onProgress?: (msg: string) => void;
}): Promise<CaptureResult> {
  const { videoUrl, startTime, endTime, onProgress } = params;
  const duration = Math.max(1, endTime - startTime);

  // Check if captureStream is available
  const videoProto = HTMLVideoElement.prototype as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  if (typeof videoProto.captureStream !== 'function' &&
      typeof videoProto.mozCaptureStream !== 'function') {
    throw new Error('captureStream not supported in this browser');
  }

  onProgress?.('Loading video source...');

  // Create hidden video element (must be in DOM and visible for some browsers)
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true; // Mute speakers but captureStream still captures audio
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px;height:360px;opacity:0.01;pointer-events:none;';
  document.body.appendChild(video);

  let recorder: MediaRecorder | null = null;
  let cleanupAudioCtx: AudioContext | null = null;

  try {
    // Load video metadata
    video.src = videoUrl;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Video load timeout (30s)')), 30_000);
      const onLoaded = () => { clearTimeout(timeout); resolve(); };
      const onError = () => { clearTimeout(timeout); reject(new Error('Video load failed (CORS or codec)')); };
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    // Seek to start time (skip if 0 — the video already starts at 0, and
    // setting currentTime=0 may not fire a 'seeked' event, causing a hang).
    if (startTime > 0.1) {
      onProgress?.(`Seeking to ${Math.round(startTime)}s...`);
      video.currentTime = Math.max(0, startTime);

      await new Promise<void>((resolve) => {
        // Use resolve (not reject) on timeout: if seeked never fires, proceed
        // anyway — the video may already be at or near the right position.
        const timeout = setTimeout(() => {
          console.warn('[captureVideoClip] Seek timeout, proceeding anyway');
          resolve();
        }, 5_000);
        const onSeeked = () => { clearTimeout(timeout); resolve(); };
        video.addEventListener('seeked', onSeeked, { once: true });
      });
    }

    // Get the video dimensions for canvas thumbnail
    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 360;

    onProgress?.('Starting recording...');

    // Try captureStream first (Chrome, Firefox, Edge)
    const stream = videoProto.captureStream
      ? videoProto.captureStream.call(video)
      : videoProto.mozCaptureStream!.call(video);

    if (!stream) throw new Error('Failed to capture stream');

    // If no audio track in the stream, try to add one via Web Audio API
    if (!stream.getAudioTracks().length) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtx();
        cleanupAudioCtx = audioCtx;
        const sourceNode = audioCtx.createMediaElementSource(video);
        const destNode = audioCtx.createMediaStreamDestination();
        sourceNode.connect(destNode);
        // Also connect to ctx.destination so audio plays (but video is muted so no sound)
        sourceNode.connect(audioCtx.destination);
        const audioTrack = destNode.stream.getAudioTracks()[0];
        if (audioTrack) {
          stream.addTrack(audioTrack);
        }
      } catch (audioErr) {
        console.warn('[captureVideoClip] Web Audio API fallback failed:', audioErr);
      }
    }

    // Pick best supported mimeType
    const mimeTypes = [
      'video/mp4;codecs=h264,aac',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
    ];
    const mimeType = mimeTypes.find(m => {
      try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
    }) || 'video/webm';

    // Setup MediaRecorder
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2_000_000, // 2 Mbps for 360p
      audioBitsPerSecond: 128_000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const recordingDone = new Promise<Blob>((resolve, reject) => {
      recorder!.onstop = () => {
        try {
          const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
          resolve(blob);
        } catch (err) {
          reject(err);
        }
      };
      recorder!.onerror = (e) => {
        reject(new Error(`MediaRecorder error: ${e}`));
      };
    });

    // Start recording with 100ms timeslice for smoother data collection
    recorder.start(100);

    // Play the video
    try {
      await video.play();
    } catch (playErr) {
      throw new Error(`Video play failed: ${playErr instanceof Error ? playErr.message : playErr}`);
    }

    onProgress?.(`Recording ${Math.round(duration)}s of video...`);

    // Wait for the clip duration
    await new Promise<void>((resolve) => {
      const stopTime = Date.now() + duration * 1000;
      const checkInterval = setInterval(() => {
        if (Date.now() >= stopTime || video.ended) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });

    // Stop recording and video
    video.pause();
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }

    const videoBlob = await recordingDone;

    if (videoBlob.size < 10_000) {
      throw new Error(`Recording too small: ${videoBlob.size} bytes`);
    }

    onProgress?.('Capturing thumbnail...');

    // Capture thumbnail from current video frame
    let thumbnailBlob: Blob | null = null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(videoWidth, 640);
      canvas.height = Math.min(videoHeight, 360);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')),
            'image/jpeg',
            0.8,
          );
        });
      }
    } catch (thumbErr) {
      console.warn('[captureVideoClip] Thumbnail capture failed:', thumbErr);
    }

    onProgress?.('Recording complete!');
    return { videoBlob, thumbnailBlob };
  } finally {
    // Cleanup
    try {
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    } catch {}
    try { video.pause(); } catch {}
    try { video.src = ''; } catch {}
    try { video.load(); } catch {}
    try { document.body.removeChild(video); } catch {}
    try {
      if (cleanupAudioCtx && cleanupAudioCtx.state !== 'closed') {
        await cleanupAudioCtx.close();
      }
    } catch {}
  }
}

/**
 * Convert a Blob to a data URL.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
