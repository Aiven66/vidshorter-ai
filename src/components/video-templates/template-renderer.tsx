'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface Scene {
  id: string;
  render: () => React.ReactNode;
  duration: number;
  transition?: 'fade' | 'slide' | 'none';
  backgroundColor?: string;
}

export interface TemplateRendererProps {
  scenes: Scene[];
  onExport?: (blob: Blob) => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * 检测 MediaRecorder 是否支持 MP4（Safari 16+ 支持 avc1）。
 */
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

/**
 * Deep-clones a DOM node while inlining every computed style onto the clone.
 * 用于将 DOM 节点序列化为 SVG foreignObject 以便 Canvas 绘制。
 */
function cloneWithInlineStyles(source: Node): Node {
  if (source.nodeType === Node.TEXT_NODE) {
    return source.cloneNode(true);
  }
  if (source.nodeType !== Node.ELEMENT_NODE) {
    return source.cloneNode(true);
  }

  const element = source as HTMLElement;
  const clone = element.cloneNode(false) as HTMLElement;
  const computed = window.getComputedStyle(element);

  for (let i = 0; i < computed.length; i++) {
    const prop = computed.item(i);
    if (prop === null) continue;
    clone.style.setProperty(prop, computed.getPropertyValue(prop));
  }

  for (const child of element.childNodes) {
    clone.appendChild(cloneWithInlineStyles(child));
  }

  return clone;
}

/**
 * 将 DOM 元素绘制到 Canvas：通过 SVG foreignObject data-URL 序列化后绘制。
 */
async function captureDomToCanvas(
  element: HTMLElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): Promise<void> {
  try {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const clone = cloneWithInlineStyles(element) as HTMLElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${rect.width} ${rect.height}">` +
      `<foreignObject width="100%" height="100%" x="0" y="0">` +
      new XMLSerializer().serializeToString(clone) +
      `</foreignObject></svg>`;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG image load failed'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } catch {
    // 失败时绘制纯色背景，保证录制器始终有帧
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

export type ExportFormat = 'mp4' | 'webm';

export interface ExportResult {
  blob: Blob;
  format: ExportFormat;
  mimeType: string;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function TemplateRenderer({ scenes, onExport, className }: TemplateRendererProps) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

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

  /* ----- 释放之前的 video URL ----- */
  const clearVideoUrl = useCallback(() => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
      setVideoUrl(null);
    }
  }, []);

  /* ----- 播放循环 ----- */
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

  /* ----- 控制器 ----- */
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

  /* ----- 导出：优先 WebCodecs + mp4-muxer → 降级 MediaRecorder ----- */
  const handleExport = useCallback(async () => {
    if (!previewRef.current || isExporting || scenes.length === 0) return;

    clearVideoUrl();
    setExportError(null);
    setIsExporting(true);
    setIsPlaying(false);

    const width = 1080;
    const height = 1920;
    const fps = 30;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      setIsExporting(false);
      setExportError('Canvas 2D context unavailable.');
      return;
    }
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const totalFrames = scenes.reduce((sum, s) => sum + Math.max(1, Math.ceil(s.duration * fps)), 0);
    let frameIndex = 0;

    /* 优先路径：WebCodecs + mp4-muxer（真正的 H.264 MP4） */
    const hasWebCodecs =
      typeof window !== 'undefined' &&
      typeof (window as unknown as { VideoEncoder?: typeof VideoEncoder }).VideoEncoder !== 'undefined' &&
      typeof VideoFrame !== 'undefined';

    if (hasWebCodecs) {
      try {
        const muxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: { codec: 'avc', width, height, frameRate: fps },
          fastStart: 'in-memory',
        });

        const VideoEncoderCtor = (window as unknown as { VideoEncoder: typeof VideoEncoder }).VideoEncoder;
        const encoder = new VideoEncoderCtor({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e: unknown) => {
            console.error('[VideoEncoder] error', e);
          },
        });

        encoder.configure({
          codec: 'avc1.420028', // Baseline Profile, Level 4.0（支持 1080p）
          width,
          height,
          bitrate: 4_000_000,
          framerate: fps,
          latencyMode: 'quality',
        });

        for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
          const scene = scenes[sceneIdx];
          const sceneFrames = Math.max(1, Math.ceil(scene.duration * fps));

          for (let frame = 0; frame < sceneFrames; frame++) {
            const frameProgress = sceneFrames > 1 ? frame / (sceneFrames - 1) : 1;

            setCurrentSceneIndex(sceneIdx);
            setProgress(frameProgress);
            setExportProgress(frameIndex / totalFrames);
            frameIndex++;

            // 等待两帧让 React flush + 浏览器绘制
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
            await new Promise<void>((r) => requestAnimationFrame(() => r()));

            await captureDomToCanvas(previewRef.current!, canvas, ctx);

            const videoFrame = new VideoFrame(canvas, {
              timestamp: Math.floor((frameIndex - 1) * 1_000_000 / fps),
              duration: Math.floor(1_000_000 / fps),
            });

            const isKeyFrame = (frameIndex - 1) % fps === 0;
            encoder.encode(videoFrame, { keyFrame: isKeyFrame });
            videoFrame.close();

            // 控制编码器队列，避免内存爆炸
            while (encoder.encodeQueueSize > 8) {
              await new Promise<void>((r) => setTimeout(r, 10));
            }
          }
        }

        await encoder.flush();
        muxer.finalize();

        const buffer = muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        videoUrlRef.current = url;
        setVideoUrl(url);
        setExportFormat('mp4');
        onExport?.(blob);

        setIsExporting(false);
        setExportProgress(1);
        setCurrentSceneIndex(0);
        setProgress(0);
        sceneElapsedRef.current = 0;
        return;
      } catch (err) {
        console.warn('[WebCodecs MP4 export] failed, falling back:', err);
        // 继续走降级路径
      }
    }

    /* 降级路径 A：MediaRecorder MP4（Safari） */
    const mp4Type = getMp4RecorderType();
    if (mp4Type) {
      try {
        const stream = canvas.captureStream(fps);
        const recorder = new MediaRecorder(stream, { mimeType: mp4Type });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

        const stopped = new Promise<Blob>((resolve) => {
          recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' }));
        });

        recorder.start();

        for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
          const scene = scenes[sceneIdx];
          const sceneFrames = Math.max(1, Math.ceil(scene.duration * fps));

          for (let frame = 0; frame < sceneFrames; frame++) {
            const frameProgress = sceneFrames > 1 ? frame / (sceneFrames - 1) : 1;
            setCurrentSceneIndex(sceneIdx);
            setProgress(frameProgress);
            setExportProgress(frameIndex / totalFrames);
            frameIndex++;

            await new Promise<void>((r) => requestAnimationFrame(() => r()));
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
            await captureDomToCanvas(previewRef.current!, canvas, ctx);
            await new Promise<void>((r) => setTimeout(r, 1000 / fps));
          }
        }

        if (recorder.state !== 'inactive') recorder.stop();
        const blob = await stopped;
        const url = URL.createObjectURL(blob);
        videoUrlRef.current = url;
        setVideoUrl(url);
        setExportFormat('mp4');
        onExport?.(blob);

        setIsExporting(false);
        setExportProgress(1);
        setCurrentSceneIndex(0);
        setProgress(0);
        sceneElapsedRef.current = 0;
        return;
      } catch (err) {
        console.warn('[MediaRecorder MP4] failed:', err);
      }
    }

    /* 降级路径 B：MediaRecorder WebM */
    const webmType = getWebmRecorderType();
    if (!webmType) {
      setIsExporting(false);
      setExportError('当前浏览器不支持视频导出。请使用 Chrome/Edge/Safari 最新版本。');
      return;
    }

    try {
      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, { mimeType: webmType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      const stopped = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      });

      recorder.start();

      for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
        const scene = scenes[sceneIdx];
        const sceneFrames = Math.max(1, Math.ceil(scene.duration * fps));

        for (let frame = 0; frame < sceneFrames; frame++) {
          const frameProgress = sceneFrames > 1 ? frame / (sceneFrames - 1) : 1;
          setCurrentSceneIndex(sceneIdx);
          setProgress(frameProgress);
          setExportProgress(frameIndex / totalFrames);
          frameIndex++;

          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          await captureDomToCanvas(previewRef.current!, canvas, ctx);
          await new Promise<void>((r) => setTimeout(r, 1000 / fps));
        }
      }

      if (recorder.state !== 'inactive') recorder.stop();
      const blob = await stopped;
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setVideoUrl(url);
      setExportFormat('webm');
      onExport?.(blob);

      setIsExporting(false);
      setExportProgress(1);
      setCurrentSceneIndex(0);
      setProgress(0);
      sceneElapsedRef.current = 0;
    } catch (err) {
      console.error('[Export] all paths failed:', err);
      setIsExporting(false);
      setExportError('视频导出失败，请稍后重试。');
    }
  }, [scenes, isExporting, onExport, clearVideoUrl]);

  /* ----- 卸载时释放 URL ----- */
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);

  /* ----- 渲染 ----- */
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

      {/* ----- 视频播放器（导出后显示） ----- */}
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
          <button
            onClick={clearVideoUrl}
            className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            返回实时预览
          </button>
        </div>
      )}

      {/* ----- 实时预览区 ----- */}
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
              style={{ animation: getTransitionAnimation(transition) }}
            >
              {currentScene?.render()}
            </div>

            {/* 导出进度遮罩 */}
            {isExporting && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80">
                <div className="font-medium text-foreground">导出中…</div>
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
        </div>
      )}

      {/* ----- 控制器 ----- */}
      <div className="mt-4 space-y-3">
        {/* 进度条（仅实时预览模式显示） */}
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

        {/* 按钮行 */}
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
              {isExporting ? '导出中…' : '导出 MP4'}
            </button>
          </div>
        </div>

        {/* 场景指示器 */}
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

        {/* 错误提示 */}
        {exportError && (
          <p className="text-sm text-destructive">{exportError}</p>
        )}
      </div>
    </div>
  );
}

export default TemplateRenderer;
