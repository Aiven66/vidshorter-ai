'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { DrawContext } from './canvas-utils';
import { SocialShare } from './social-share';

/**
 * HyperFrames-style Scene interface.
 *
 * Each scene provides:
 *  - `render()`     : React node for live preview (DOM-based)
 *  - `draw(ctx, progress, w, h)` : deterministic per-frame canvas drawing
 *
 * The export pipeline uses `draw` directly on a canvas — no DOM capture —
 * which is reliable and matches HyperFrames' per-frame rendering model.
 */
export interface Scene {
  id: string;
  render: () => React.ReactNode;
  duration: number;
  transition?: 'fade' | 'slide' | 'none';
  backgroundColor?: string;
  /**
   * HyperFrames-style deterministic canvas renderer.
   * Receives scene-local progress (0..1) and draws to the given 2D context.
   */
  draw?: (dc: DrawContext) => void;
}

export interface TemplateRendererProps {
  scenes: Scene[];
  onExport?: (blob: Blob) => void;
  className?: string;
  /**
   * When this value changes, all internal state (exported video URL, playback
   * position, export progress) is reset. Pass a value that changes whenever a
   * NEW article/product/news is extracted so the stale video from a previous
   * extraction does not block the live preview.
   */
  resetKey?: string | number;
  /** Title shown in the share section (defaults to "Clipop AI Video"). */
  videoTitle?: string;
  /**
   * Called when a video has been successfully exported. Use this to trigger
   * credits deduction or other side effects.
   */
  onExportSuccess?: () => void;
}

export type ExportFormat = 'mp4' | 'webm';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getTransitionAnimation(transition: string): string {
  switch (transition) {
    case 'fade':
      return 'vs-tr-fade 0.5s ease-out both';
    case 'slide':
      return 'vs-tr-slide 0.5s ease-out both';
    case 'none':
    default:
      return 'none';
  }
}

/** Draw a single scene at the given progress to the canvas. */
function drawSceneToCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  progress: number,
): boolean {
  const width = canvas.width;
  const height = canvas.height;

  // Clear & default background
  ctx.fillStyle = scene.backgroundColor ?? '#0f1020';
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  if (scene.draw) {
    try {
      scene.draw({ ctx, progress, width, height });
      return true;
    } catch (err) {
      console.warn('[drawSceneToCanvas] scene.draw failed:', err);
      // fall through to fallback drawing
    }
  }

  // Fallback: draw a labelled solid background so we never produce a blank frame.
  ctx.fillStyle = '#1a1b2e';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(width * 0.05)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(scene.id || 'scene', width / 2, height / 2);
  return false;
}

/* ------------------------------------------------------------------ */
/* WebCodecs configuration probing                                    */
/* ------------------------------------------------------------------ */

interface WebCodecsConfig {
  codec: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
  latencyMode?: 'realtime' | 'quality';
}

const H264_CODEC_CANDIDATES = [
  'avc1.420028', // Main Profile, Level 4.0 (1080p)
  'avc1.4D0028', // High Profile, Level 4.0
  'avc1.42001F', // Baseline Profile, Level 3.1 (720p)
  'avc1.42E028', // Constrained Baseline, Level 4.0
];

async function pickSupportedWebCodecsConfig(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<WebCodecsConfig | null> {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { VideoEncoder?: typeof VideoEncoder; VideoFrame?: typeof VideoFrame };
  if (!w.VideoEncoder || !w.VideoFrame) return null;

  for (const codec of H264_CODEC_CANDIDATES) {
    try {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
      };
      const support = await w.VideoEncoder.isConfigSupported(config);
      if (support.supported) {
        return { ...config, latencyMode: 'quality' };
      }
    } catch {
      // continue probing next codec
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* MediaRecorder format probing                                       */
/* ------------------------------------------------------------------ */

function getMp4RecorderType(): string | null {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/mp4;codecs=avc1.42001f',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function getWebmRecorderType(): string | null {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function TemplateRenderer({ scenes, onExport, className, resetKey, videoTitle, onExportSuccess }: TemplateRendererProps) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [browserSupport, setBrowserSupport] = useState<{ webCodecs: boolean; mediaRecorder: boolean } | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const sceneElapsedRef = useRef<number>(0);
  const videoUrlRef = useRef<string | null>(null);

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const currentScene = scenes[currentSceneIndex];
  const elapsedBefore = scenes
    .slice(0, currentSceneIndex)
    .reduce((sum, s) => sum + s.duration, 0);
  const overallProgress =
    elapsedBefore + (currentScene?.duration ?? 0) * progress;

  /* ----- browser capability detection ----- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasWebCodecs =
      typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined' &&
      typeof (window as unknown as { VideoFrame?: unknown }).VideoFrame !== 'undefined';
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
    setBrowserSupport({ webCodecs: hasWebCodecs, mediaRecorder: hasMediaRecorder });
  }, []);

  /* ----- revoke video URL ----- */
  const clearVideoUrl = useCallback(() => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
      setVideoUrl(null);
    }
  }, []);

  /* ----- reset internal state when resetKey changes (new article extracted) -----
   * This is the critical fix: when a user extracts a second article after
   * already exporting a video from the first, the old `videoUrl` must be
   * cleared so the live preview (not the stale video player) is shown.
   * The parent passes a `resetKey` that changes on each new extraction.
   */
  const resetKeyRef = useRef<string | number | undefined>(resetKey);
  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      clearVideoUrl();
      setCurrentSceneIndex(0);
      setProgress(0);
      setIsPlaying(false);
      setIsExporting(false);
      setExportProgress(0);
      setExportError(null);
      sceneElapsedRef.current = 0;
      lastTimeRef.current = 0;
    }
  }, [resetKey, clearVideoUrl]);

  /* ----- playback loop ----- */
  useEffect(() => {
    if (!isPlaying || scenes.length === 0) return;

    const tick = (now: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      sceneElapsedRef.current += delta;
      const scene = scenes[currentSceneIndex];
      if (!scene) return;

      const sceneProgress = sceneElapsedRef.current / scene.duration;

      if (sceneProgress >= 1) {
        if (currentSceneIndex < scenes.length - 1) {
          setCurrentSceneIndex((prev) => prev + 1);
          sceneElapsedRef.current = 0;
          setProgress(0);
        } else {
          setIsPlaying(false);
          setCurrentSceneIndex(0);
          setProgress(0);
          sceneElapsedRef.current = 0;
          lastTimeRef.current = 0;
          return;
        }
      } else {
        setProgress(sceneProgress);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [isPlaying, currentSceneIndex, scenes]);

  /* ----- controllers ----- */
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (currentSceneIndex >= scenes.length - 1 && progress >= 1) {
      setCurrentSceneIndex(0);
      sceneElapsedRef.current = 0;
      setProgress(0);
    }
    lastTimeRef.current = 0;
    setIsPlaying(true);
  }, [isPlaying, currentSceneIndex, progress, scenes.length]);

  const handleRestart = useCallback(() => {
    setIsPlaying(false);
    setCurrentSceneIndex(0);
    setProgress(0);
    sceneElapsedRef.current = 0;
    lastTimeRef.current = 0;
  }, []);

  const handleSeek = useCallback(
    (clientX: number, target: HTMLElement) => {
      const rect = target.getBoundingClientRect();
      const clickRatio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const targetTime = clickRatio * totalDuration;

      let acc = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (acc + scenes[i].duration >= targetTime) {
          setCurrentSceneIndex(i);
          const local = targetTime - acc;
          setProgress(scenes[i].duration > 0 ? local / scenes[i].duration : 0);
          sceneElapsedRef.current = local;
          lastTimeRef.current = 0;
          return;
        }
        acc += scenes[i].duration;
      }
    },
    [scenes, totalDuration],
  );

  /* ----- Export: HyperFrames-style per-frame rendering, then encode ----- */
  const handleExport = useCallback(async () => {
    if (isExporting || scenes.length === 0) return;

    clearVideoUrl();
    setExportError(null);
    setIsExporting(true);
    setIsPlaying(false);

    const width = 1080;
    const height = 1920;
    const fps = 30;

    // Offscreen canvas — every frame is drawn via scene.draw() directly
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      setIsExporting(false);
      setExportError('Canvas 2D context unavailable. Please try a different browser.');
      return;
    }
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Pre-compute scene→frame mapping
    const sceneFrames: number[] = scenes.map((s) =>
      Math.max(1, Math.ceil(s.duration * fps)),
    );
    const totalFrames = sceneFrames.reduce((a, b) => a + b, 0);

    /** Draw frame N (0-indexed) to the canvas using the scene's draw function. */
    const renderFrame = (frameIndex: number) => {
      let consumed = 0;
      for (let i = 0; i < scenes.length; i++) {
        const sf = sceneFrames[i];
        if (frameIndex < consumed + sf) {
          const localFrame = frameIndex - consumed;
          const localProgress = sf > 1 ? localFrame / (sf - 1) : 1;
          drawSceneToCanvas(canvas, ctx, scenes[i], localProgress);
          return;
        }
        consumed += sf;
      }
      // Fallback: last frame
      const lastScene = scenes[scenes.length - 1];
      if (lastScene) drawSceneToCanvas(canvas, ctx, lastScene, 1);
    };

    let exportOk = false;
    let exportErr: Error | null = null;

    /* ===== Path 1: WebCodecs + mp4-muxer (true H.264 MP4) ===== */
    const config = await pickSupportedWebCodecsConfig(width, height, fps, 6_000_000);
    if (config) {
      try {
        const muxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: { codec: 'avc', width, height, frameRate: fps },
          fastStart: 'in-memory',
        });

        const w = window as unknown as { VideoEncoder: typeof VideoEncoder };
        let encoderFailed = false;

        const encoder = new w.VideoEncoder({
          output: (chunk, meta) => {
            if (!encoderFailed) muxer.addVideoChunk(chunk, meta);
          },
          error: (e: unknown) => {
            console.error('[VideoEncoder] error:', e);
            encoderFailed = true;
          },
        });

        encoder.configure({
          codec: config.codec,
          width: config.width,
          height: config.height,
          bitrate: config.bitrate,
          framerate: config.framerate,
          latencyMode: config.latencyMode,
        });

        const w2 = window as unknown as { VideoFrame: typeof VideoFrame };

        for (let i = 0; i < totalFrames; i++) {
          if (encoderFailed) throw new Error('Encoder reported an error');

          renderFrame(i);

          const videoFrame = new w2.VideoFrame(canvas, {
            timestamp: Math.floor((i * 1_000_000) / fps),
            duration: Math.floor(1_000_000 / fps),
          });

          const isKeyFrame = i % fps === 0;
          encoder.encode(videoFrame, { keyFrame: isKeyFrame });
          videoFrame.close();

          // Backpressure: keep encode queue bounded
          while (encoder.encodeQueueSize > 8) {
            await new Promise<void>((r) => setTimeout(r, 10));
            if (encoderFailed) break;
          }

          setExportProgress((i + 1) / totalFrames);
        }

        if (encoderFailed) throw new Error('Encoder failed during encoding');

        await encoder.flush();
        muxer.finalize();

        const buffer = muxer.target.buffer;
        if (!buffer || buffer.byteLength === 0) throw new Error('Muxer produced empty buffer');

        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        videoUrlRef.current = url;
        setVideoUrl(url);
        setExportFormat('mp4');
        onExport?.(blob);
        onExportSuccess?.();

        exportOk = true;
        console.log('[Export] WebCodecs MP4 success:', blob.size, 'bytes');
      } catch (err) {
        console.warn('[WebCodecs MP4] failed, will fall back:', err);
        exportErr = err instanceof Error ? err : new Error(String(err));
        setExportProgress(0);
      }
    } else {
      console.log('[Export] WebCodecs not available — falling back to MediaRecorder');
    }

    /* ===== Path 2: MediaRecorder + canvas.captureStream ===== */
    if (!exportOk) {
      const useMp4 = !!getMp4RecorderType();
      const useWebm = !useMp4 && !!getWebmRecorderType();
      const recorderType = useMp4 ? getMp4RecorderType()! : useWebm ? getWebmRecorderType()! : null;

      if (!recorderType) {
        setIsExporting(false);
        setExportError(
          'This browser does not support video export (MediaRecorder API required). Please use Chrome 90+ / Edge / Safari 16+.',
        );
        return;
      }

      try {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        const stream = canvas.captureStream(fps);
        const recorder = new MediaRecorder(stream, {
          mimeType: recorderType,
          videoBitsPerSecond: 6_000_000,
        });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        const stopped = new Promise<Blob>((resolve, reject) => {
          recorder.onstop = () => {
            if (chunks.length === 0) {
              reject(new Error('No data recorded'));
            } else {
              const type = useMp4 ? 'video/mp4' : 'video/webm';
              resolve(new Blob(chunks, { type }));
            }
          };
          recorder.onerror = () => reject(new Error('MediaRecorder error'));
        });

        recorder.start(1000);
        setExportProgress(0);

        for (let i = 0; i < totalFrames; i++) {
          renderFrame(i);
          // Give MediaRecorder time to capture each painted frame.
          await new Promise<void>((r) => setTimeout(r, 1000 / fps));
          setExportProgress((i + 1) / totalFrames);
        }

        // Let the last frame be captured before stopping.
        await new Promise<void>((r) => setTimeout(r, 500));
        if (recorder.state !== 'inactive') recorder.stop();

        const blob = await stopped;
        if (blob.size === 0) throw new Error('Recorded blob is empty');

        const url = URL.createObjectURL(blob);
        videoUrlRef.current = url;
        setVideoUrl(url);
        setExportFormat(useMp4 ? 'mp4' : 'webm');
        onExport?.(blob);
        onExportSuccess?.();

        exportOk = true;
        console.log('[Export] MediaRecorder success:', blob.size, 'bytes, format:', useMp4 ? 'mp4' : 'webm');
      } catch (err) {
        console.error('[Export] MediaRecorder path failed:', err);
        exportErr = err instanceof Error ? err : new Error(String(err));
      }
    }

    setIsExporting(false);

    if (exportOk) {
      setExportProgress(1);
      setCurrentSceneIndex(0);
      setProgress(0);
      sceneElapsedRef.current = 0;
    } else {
      setExportProgress(0);
      const reason = exportErr?.message ?? 'Unknown error';
      setExportError(`Video export failed: ${reason}. Please try the latest Chrome browser.`);
    }
  }, [scenes, isExporting, onExport, onExportSuccess, clearVideoUrl]);

  /* ----- revoke URL on unmount ----- */
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);

  /* ----- render ----- */
  if (scenes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-muted p-8 text-muted-foreground"
        style={{ aspectRatio: '9 / 16' }}
      >
        <p>No scenes to render</p>
      </div>
    );
  }

  const transition = currentScene?.transition ?? 'fade';

  return (
    <div className={className}>
      <style>{`
        @keyframes vs-tr-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes vs-tr-slide { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      {/* ----- Exported video player ----- */}
      {videoUrl && (
        <div className="relative mx-auto mb-4 w-full" style={{ maxWidth: 400 }}>
          <video
            src={videoUrl}
            controls
            autoPlay
            loop
            className="w-full rounded-xl bg-black shadow-lg"
            style={{ aspectRatio: '9 / 16' }}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
              {exportFormat === 'mp4' ? 'MP4 (H.264)' : 'WebM'}
            </span>
            <a
              href={videoUrl}
              download={`clipop-video.${exportFormat}`}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Download {exportFormat.toUpperCase()}
            </a>
          </div>

          {/* Social media share */}
          <SocialShare
            videoUrl={videoUrl}
            videoTitle={videoTitle ?? 'Clipop AI Video'}
            format={exportFormat}
          />

          <button
            onClick={clearVideoUrl}
            className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Back to live preview
          </button>
        </div>
      )}

      {/* ----- Live preview area ----- */}
      {!videoUrl && (
        <div className="relative mx-auto w-full" style={{ maxWidth: 400 }}>
          <div
            ref={previewRef}
            className="relative w-full overflow-hidden rounded-xl bg-background shadow-lg"
            style={{
              aspectRatio: '9 / 16',
              backgroundColor: currentScene?.backgroundColor,
            }}
          >
            <div
              key={currentScene?.id}
              className="absolute inset-0 h-full w-full"
              style={{
                animation: isExporting ? 'none' : getTransitionAnimation(transition),
              }}
            >
              {currentScene?.render()}
            </div>
          </div>

          {/* Export progress overlay (outside previewRef so it is never captured) */}
          {isExporting && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/90 backdrop-blur-sm">
              <div className="font-medium text-foreground">Exporting…</div>
              <div className="h-2 w-3/4 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{ width: `${exportProgress * 100}%` }}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                {Math.round(exportProgress * 100)}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----- Controllers ----- */}
      <div className="mt-4 space-y-3">
        {!videoUrl && (
          <div
            className="relative h-2 cursor-pointer overflow-hidden rounded-full bg-muted"
            onClick={(e) => handleSeek(e.clientX, e.currentTarget)}
          >
            <div
              className="absolute h-full bg-primary transition-all duration-150"
              style={{
                width: `${totalDuration > 0 ? (overallProgress / totalDuration) * 100 : 0}%`,
              }}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayPause}
              disabled={isExporting || !!videoUrl}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={handleRestart}
              disabled={isExporting || !!videoUrl}
              className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
            >
              Restart
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!videoUrl && (
              <span className="text-sm text-muted-foreground">
                {Math.floor(overallProgress)}s / {Math.ceil(totalDuration)}s
              </span>
            )}
            <button
              onClick={handleExport}
              disabled={isExporting || !!videoUrl}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isExporting ? 'Exporting…' : 'Export MP4'}
            </button>
          </div>
        </div>

        {!videoUrl && (
          <div className="flex items-center gap-1.5">
            {scenes.map((scene, idx) => (
              <div
                key={scene.id}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  idx <= currentSceneIndex ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        )}

        {browserSupport && !browserSupport.webCodecs && !browserSupport.mediaRecorder && (
          <p className="text-sm text-destructive">
            This browser does not support video export. Please use Chrome 90+ / Edge / Safari 16+.
          </p>
        )}

        {exportError && <p className="text-sm text-destructive">{exportError}</p>}
      </div>
    </div>
  );
}

export default TemplateRenderer;
