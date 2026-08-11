'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

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

function getSupportedMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return '';
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
  return '';
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
 * This is required so that `foreignObject` rendering inside an SVG data-URL
 * produces a faithful visual copy (external stylesheets are not available
 * inside the SVG image context).
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
 * Captures a DOM element onto a canvas by serialising it into an SVG
 * `foreignObject` data-URL and drawing the resulting image. The SVG viewBox
 * is set to the element's rendered size so that the canvas (1080x1920) acts
 * as a scaled-up viewport, giving us a full-resolution frame.
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
    // Fallback: paint a solid background so the recorder always has a frame.
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function TemplateRenderer({ scenes, onExport, className }: TemplateRendererProps) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 within current scene
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [mediaRecorderSupported, setMediaRecorderSupported] = useState(true);

  const previewRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const sceneElapsedRef = useRef<number>(0);

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const currentScene = scenes[currentSceneIndex];
  const elapsedBefore = scenes
    .slice(0, currentSceneIndex)
    .reduce((sum, s) => sum + s.duration, 0);
  const overallProgress =
    elapsedBefore + (currentScene?.duration ?? 0) * progress;

  /* ----- detect MediaRecorder support ----- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasRecorder = typeof MediaRecorder !== 'undefined';
    const hasCaptureStream =
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function';
    setMediaRecorderSupported(hasRecorder && hasCaptureStream);
  }, []);

  /* ----- playback animation loop ----- */
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

  /* ----- controls ----- */
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

  /* ----- export ----- */
  const handleExport = useCallback(async () => {
    if (!previewRef.current || isExporting || scenes.length === 0) return;

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      setMediaRecorderSupported(false);
      return;
    }

    setIsExporting(true);
    setIsPlaying(false);

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsExporting(false);
      return;
    }

    // Paint an initial frame so the stream has data immediately.
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const fps = 30;
    let stream: MediaStream;
    try {
      stream = canvas.captureStream(fps);
    } catch {
      setIsExporting(false);
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });

    recorder.start();

    try {
      for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
        const scene = scenes[sceneIdx];
        const totalFrames = Math.max(1, Math.ceil(scene.duration * fps));

        for (let frame = 0; frame < totalFrames; frame++) {
          const frameProgress =
            totalFrames > 1 ? frame / (totalFrames - 1) : 1;

          setCurrentSceneIndex(sceneIdx);
          setProgress(frameProgress);
          setExportProgress((sceneIdx + frameProgress) / scenes.length);

          // Allow React to flush + browser to paint twice before capturing.
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          await new Promise<void>((r) => requestAnimationFrame(() => r()));

          await captureDomToCanvas(previewRef.current!, canvas, ctx);

          // Pace the frame so MediaRecorder picks it up.
          await new Promise<void>((r) => setTimeout(r, 1000 / fps));
        }
      }
    } finally {
      if (recorder.state !== 'inactive') recorder.stop();
    }

    const blob = await stopped;
    onExport?.(blob);
    setIsExporting(false);
    setExportProgress(0);
    setCurrentSceneIndex(0);
    setProgress(0);
    sceneElapsedRef.current = 0;
  }, [scenes, isExporting, onExport]);

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
      {/* transition keyframes (scoped to this component instance) */}
      <style>{`
        @keyframes vs-tr-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes vs-tr-slide { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      {/* ----- Preview area ----- */}
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

          {/* Exporting overlay */}
          {isExporting && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80">
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
      </div>

      {/* ----- Controls ----- */}
      <div className="mt-4 space-y-3">
        {/* Progress bar */}
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

        {/* Buttons row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayPause}
              disabled={isExporting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={handleRestart}
              disabled={isExporting}
              className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
            >
              Restart
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {Math.floor(overallProgress)}s / {Math.ceil(totalDuration)}s
            </span>
            <button
              onClick={handleExport}
              disabled={isExporting || !mediaRecorderSupported}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isExporting ? 'Exporting…' : 'Export WebM'}
            </button>
          </div>
        </div>

        {/* Scene indicators */}
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

        {/* Browser support warning */}
        {!mediaRecorderSupported && (
          <p className="text-sm text-destructive">
            Video export is not supported in this browser (MediaRecorder API
            unavailable).
          </p>
        )}
      </div>
    </div>
  );
}

export default TemplateRenderer;
