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
 * 带超时保护，失败时绘制降级内容（纯色背景 + 场景文字）。
 */
async function captureDomToCanvas(
  element: HTMLElement | null,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  fallbackText?: string,
): Promise<void> {
  if (!element) {
    drawFallback(ctx, canvas, fallbackText);
    return;
  }

  try {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      drawFallback(ctx, canvas, fallbackText);
      return;
    }

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

    // 超时保护：3 秒内加载不完就降级
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SVG load timeout')), 3000);
      img.onload = () => { clearTimeout(timer); resolve(); };
      img.onerror = () => { clearTimeout(timer); reject(new Error('SVG image load failed')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } catch (err) {
    console.warn('[captureDomToCanvas] failed, drawing fallback:', err);
    drawFallback(ctx, canvas, fallbackText);
  }
}

function drawFallback(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, text?: string) {
  // 降级：绘制深色渐变背景 + 文字
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (text) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 自动换行
    const maxWidth = canvas.width - 120;
    const words = text.split('');
    let line = '';
    let y = canvas.height / 2;
    for (const word of words) {
      const testLine = line + word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, canvas.width / 2, y);
        line = word;
        y += 60;
      } else {
        line = testLine;
      }
    }
    if (line) ctx.fillText(line, canvas.width / 2, y);
  }
}

/* ------------------------------------------------------------------ */
/* WebCodecs 配置检测                                                  */
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
  'avc1.420028', // Main Profile, Level 4.0（1080p）
  'avc1.4D0028', // High Profile, Level 4.0
  'avc1.42001F', // Baseline Profile, Level 3.1（720p 级别，兼容性最好）
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
      // 继续尝试下一个 codec
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* MediaRecorder 格式检测                                              */
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
/* 帧渲染管道（共享逻辑）                                              */
/* ------------------------------------------------------------------ */

interface FrameRenderContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  previewRef: React.RefObject<HTMLDivElement | null>;
  scenes: Scene[];
  fps: number;
  totalFrames: number;
  setCurrentSceneIndex: (idx: number) => void;
  setProgress: (p: number) => void;
  setExportProgress: (p: number) => void;
}

async function renderAllFrames(
  fctx: FrameRenderContext,
  onFrame: (frameIndex: number) => Promise<void>,
): Promise<void> {
  let frameIndex = 0;
  for (let sceneIdx = 0; sceneIdx < fctx.scenes.length; sceneIdx++) {
    const scene = fctx.scenes[sceneIdx];
    const sceneFrames = Math.max(1, Math.ceil(scene.duration * fctx.fps));

    for (let frame = 0; frame < sceneFrames; frame++) {
      const frameProgress = sceneFrames > 1 ? frame / (sceneFrames - 1) : 1;

      fctx.setCurrentSceneIndex(sceneIdx);
      fctx.setProgress(frameProgress);
      fctx.setExportProgress(frameIndex / fctx.totalFrames);

      // 等待 React flush + 浏览器绘制
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      await captureDomToCanvas(
        fctx.previewRef.current,
        fctx.canvas,
        fctx.ctx,
        scene.id,
      );

      await onFrame(frameIndex);
      frameIndex++;
    }
  }
}

export type ExportFormat = 'mp4' | 'webm';

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
  const [browserSupport, setBrowserSupport] = useState<{ webCodecs: boolean; mediaRecorder: boolean } | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const sceneElapsedRef = useRef<number>(0);
  const videoUrlRef = useRef<string | null>(null);
  const encoderErrorRef = useRef<boolean>(false);

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const currentScene = scenes[currentSceneIndex];
  const elapsedBefore = scenes
    .slice(0, currentSceneIndex)
    .reduce((sum, s) => sum + s.duration, 0);
  const overallProgress =
    elapsedBefore + (currentScene?.duration ?? 0) * progress;

  /* ----- 浏览器兼容性检测 ----- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasWebCodecs =
      typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined' &&
      typeof (window as unknown as { VideoFrame?: unknown }).VideoFrame !== 'undefined';
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
    setBrowserSupport({ webCodecs: hasWebCodecs, mediaRecorder: hasMediaRecorder });
  }, []);

  /* ----- 释放 video URL ----- */
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

  /* ----- 导出：三级降级 ----- */
  const handleExport = useCallback(async () => {
    if (!previewRef.current || isExporting || scenes.length === 0) return;

    clearVideoUrl();
    setExportError(null);
    setIsExporting(true);
    setIsPlaying(false);
    encoderErrorRef.current = false;

    const width = 1080;
    const height = 1920;
    const fps = 30;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      setIsExporting(false);
      setExportError('Canvas 2D 上下文不可用，请更换浏览器重试。');
      return;
    }
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const totalFrames = scenes.reduce(
      (sum, s) => sum + Math.max(1, Math.ceil(s.duration * fps)),
      0,
    );

    const frameCtx: FrameRenderContext = {
      canvas,
      ctx,
      previewRef,
      scenes,
      fps,
      totalFrames,
      setCurrentSceneIndex,
      setProgress,
      setExportProgress,
    };

    /* ===== 路径 1：WebCodecs + mp4-muxer（真正的 H.264 MP4）===== */
    const config = await pickSupportedWebCodecsConfig(width, height, fps, 4_000_000);
    if (config) {
      try {
        const muxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: { codec: 'avc', width, height, frameRate: fps },
          fastStart: 'in-memory',
        });

        const w = window as unknown as { VideoEncoder: typeof VideoEncoder };
        const encoder = new w.VideoEncoder({
          output: (chunk, meta) => {
            if (!encoderErrorRef.current) {
              muxer.addVideoChunk(chunk, meta);
            }
          },
          error: (e: unknown) => {
            console.error('[VideoEncoder] error:', e);
            encoderErrorRef.current = true;
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

        // 先测试编码一帧，确保管道正常
        await captureDomToCanvas(previewRef.current, canvas, ctx, scenes[0]?.id);
        const testFrame = new (window as unknown as { VideoFrame: typeof VideoFrame }).VideoFrame(canvas, {
          timestamp: 0,
          duration: Math.floor(1_000_000 / fps),
        });
        encoder.encode(testFrame, { keyFrame: true });
        testFrame.close();

        // 等待编码器处理测试帧
        let testWait = 0;
        while (encoder.encodeQueueSize > 0 && testWait < 50) {
          await new Promise<void>((r) => setTimeout(r, 100));
          testWait++;
          if (encoderErrorRef.current) break;
        }

        if (encoderErrorRef.current) {
          throw new Error('VideoEncoder test frame failed');
        }

        // 正式编码所有帧
        let frameIndex = 0;
        await renderAllFrames(frameCtx, async (idx) => {
          if (encoderErrorRef.current) {
            throw new Error('VideoEncoder encountered an error during encoding');
          }

          const videoFrame = new (window as unknown as { VideoFrame: typeof VideoFrame }).VideoFrame(canvas, {
            timestamp: Math.floor(idx * 1_000_000 / fps),
            duration: Math.floor(1_000_000 / fps),
          });

          const isKeyFrame = idx % fps === 0;
          encoder.encode(videoFrame, { keyFrame: isKeyFrame });
          videoFrame.close();

          while (encoder.encodeQueueSize > 8) {
            await new Promise<void>((r) => setTimeout(r, 10));
            if (encoderErrorRef.current) break;
          }
          frameIndex++;
        });

        if (encoderErrorRef.current) {
          throw new Error('VideoEncoder error during encoding');
        }

        await encoder.flush();
        muxer.finalize();

        const buffer = muxer.target.buffer;
        if (!buffer || buffer.byteLength === 0) {
          throw new Error('Muxer produced empty buffer');
        }

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
        console.log('[Export] WebCodecs MP4 success:', blob.size, 'bytes');
        return;
      } catch (err) {
        console.warn('[WebCodecs MP4] failed, falling back:', err);
        encoderErrorRef.current = false;
        // 重置进度，准备降级
        setExportProgress(0);
      }
    } else {
      console.log('[Export] WebCodecs not available or no supported codec, trying MediaRecorder');
    }

    /* ===== 路径 2：MediaRecorder + canvas.captureStream ===== */
    const useMp4 = !!getMp4RecorderType();
    const useWebm = !!getWebmRecorderType();
    const recorderType = useMp4 ? getMp4RecorderType()! : useWebm ? getWebmRecorderType()! : null;

    if (!recorderType) {
      setIsExporting(false);
      setExportError('当前浏览器不支持视频导出（需要 MediaRecorder API）。请使用 Chrome 90+ / Edge / Safari 16+ 浏览器。');
      return;
    }

    try {
      // 重置 canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, {
        mimeType: recorderType,
        videoBitsPerSecond: 4_000_000,
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
        recorder.onerror = (e) => reject(e);
      });

      recorder.start(1000); // 每秒出一个 chunk

      // 重置进度
      setExportProgress(0);

      await renderAllFrames(frameCtx, async () => {
        // 控制帧率，让 MediaRecorder 有时间捕获
        await new Promise<void>((r) => setTimeout(r, 1000 / fps));
      });

      // 等待最后一帧被录制
      await new Promise<void>((r) => setTimeout(r, 500));

      if (recorder.state !== 'inactive') {
        recorder.stop();
      }

      const blob = await stopped;
      if (blob.size === 0) {
        throw new Error('Recorded blob is empty');
      }

      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setVideoUrl(url);
      setExportFormat(useMp4 ? 'mp4' : 'webm');
      onExport?.(blob);

      setIsExporting(false);
      setExportProgress(1);
      setCurrentSceneIndex(0);
      setProgress(0);
      sceneElapsedRef.current = 0;
      console.log('[Export] MediaRecorder success:', blob.size, 'bytes, format:', useMp4 ? 'mp4' : 'webm');
    } catch (err) {
      console.error('[Export] all paths failed:', err);
      setIsExporting(false);
      setExportProgress(0);
      const errMsg = err instanceof Error ? err.message : String(err);
      setExportError(`视频导出失败：${errMsg}。请尝试使用最新版 Chrome 浏览器。`);
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
          {/* previewRef 只包含场景内容，不包含遮罩 - 确保 captureDomToCanvas 不会捕获到遮罩 */}
          <div
            ref={previewRef}
            className="relative w-full overflow-hidden rounded-xl bg-background shadow-lg"
            style={{
              aspectRatio: '9 / 16',
              backgroundColor: currentScene?.backgroundColor,
            }}
          >
            {/* 使用 key 触发场景切换动画，但在导出时关闭动画以避免捕获到中间状态 */}
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

          {/* 导出进度遮罩 - 在 previewRef 外部，不会被 captureDomToCanvas 捕获 */}
          {isExporting && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/90">
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
      )}

      {/* ----- 控制器 ----- */}
      <div className="mt-4 space-y-3">
        {/* 进度条 */}
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

        {/* 浏览器兼容性提示 */}
        {browserSupport && !browserSupport.webCodecs && !browserSupport.mediaRecorder && (
          <p className="text-sm text-destructive">
            当前浏览器不支持视频导出。请使用 Chrome 90+ / Edge / Safari 16+ 浏览器。
          </p>
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
