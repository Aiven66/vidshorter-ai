'use client';

/**
 * AI 视频去水印 — ffmpeg.wasm delogo 滤镜（逐帧插值修复）
 * 交互: 上传视频 → 框选水印区域（支持多个）→ 处理 → 下载
 * delogo 失败时自动回退到区域高斯模糊（crop+boxblur+overlay 链）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useLocale } from '@/lib/locale-context';
import { getFFmpeg } from '@/lib/ai-tools/model-loader';
import { formatBytes } from '@/lib/ai-tools/image-utils';
import { Download, Loader2, Trash2, Video, Square, Sparkles } from 'lucide-react';

interface Rect {
  x: number; // 归一化 0..1
  y: number;
  w: number;
  h: number;
}

const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

export function VideoDewatermark() {
  const { t } = useLocale();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<File | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // 绘制已选区域
  const drawRects = useCallback((all: Rect[], dragging: Rect | null) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const list = dragging ? [...all, dragging] : all;
    for (const rect of list) {
      const x = rect.x * overlay.width;
      const y = rect.y * overlay.height;
      const w = rect.w * overlay.width;
      const h = rect.h * overlay.height;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
      ctx.lineWidth = Math.max(2, overlay.width / 400);
      ctx.setLineDash([Math.max(6, overlay.width / 80), Math.max(4, overlay.width / 120)]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
      ctx.fillRect(x, y, w, h);
      // 删除角标
      const tag = Math.min(22, Math.max(14, overlay.width / 40));
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
      ctx.fillRect(x + w - tag, y, tag, tag);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w - tag + 6, y + 6);
      ctx.lineTo(x + w - 6, y + tag - 6);
      ctx.moveTo(x + w - 6, y + 6);
      ctx.lineTo(x + w - tag + 6, y + tag - 6);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    drawRects(rects, dragRect);
  }, [rects, dragRect, drawRects]);

  const toNorm = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const overlay = overlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (processing || !videoSize) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = toNorm(e.clientX, e.clientY);

    // 点击已有矩形的删除角标 → 删除
    for (let i = rects.length - 1; i >= 0; i--) {
      const rect = rects[i];
      const tag = Math.min(22, Math.max(14, overlayRef.current!.width / 40)) / overlayRef.current!.width;
      if (pt.x >= rect.x + rect.w - tag && pt.x <= rect.x + rect.w && pt.y >= rect.y && pt.y <= rect.y + tag) {
        setRects(rects.filter((_, idx) => idx !== i));
        return;
      }
    }

    e.preventDefault();
    dragStartRef.current = pt;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const pt = toNorm(e.clientX, e.clientY);
    const start = dragStartRef.current;
    setDragRect({
      x: Math.min(start.x, pt.x),
      y: Math.min(start.y, pt.y),
      w: Math.abs(pt.x - start.x),
      h: Math.abs(pt.y - start.y),
    });
  };

  const handlePointerUp = () => {
    if (dragStartRef.current && dragRect && dragRect.w > 0.01 && dragRect.h > 0.01) {
      setRects((prev) => [...prev, dragRect]);
    }
    dragStartRef.current = null;
    setDragRect(null);
  };

  const handleFile = (file: File) => {
    if (file.size > MAX_VIDEO_BYTES) {
      setError(t('aiTools.videoTooLarge'));
      return;
    }
    setError(null);
    setResultUrl(null);
    setRects([]);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    fileRef.current = file;
    setVideoUrl(URL.createObjectURL(file));
  };

  const onVideoLoaded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setVideoSize({ w: video.videoWidth, h: video.videoHeight });
    if (overlayRef.current) {
      overlayRef.current.width = video.videoWidth;
      overlayRef.current.height = video.videoHeight;
    }
  };

  /** 归一化区域 → ffmpeg 像素坐标（delogo 要求 1px 边距） */
  const toDelogoCoords = (rect: Rect) => {
    const vw = videoSize!.w;
    const vh = videoSize!.h;
    let x = Math.round(rect.x * vw);
    let y = Math.round(rect.y * vh);
    let w = Math.round(rect.w * vw);
    let h = Math.round(rect.h * vh);
    x = Math.max(1, Math.min(vw - 3, x));
    y = Math.max(1, Math.min(vh - 3, y));
    w = Math.max(1, Math.min(vw - x - 1, w));
    h = Math.max(1, Math.min(vh - y - 1, h));
    return { x, y, w, h };
  };

  const runFFmpeg = async (filters: string[], label: string) => {
    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('@ffmpeg/util');

    const progressHandler = ({ progress }: { progress: number }) => {
      setProgress(Math.min(99, Math.round(progress * 100)));
    };
    ffmpeg.on('progress', progressHandler as never);

    try {
      await ffmpeg.writeFile('input.mp4', await fetchFile(fileRef.current!));
      const code = await ffmpeg.exec([
        '-i', 'input.mp4',
        '-vf', filters.join(','),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        '-y', 'output.mp4',
      ]);
      const data = await ffmpeg.readFile('output.mp4');
      if (code !== 0 || typeof data === 'string' || data.byteLength < 1024) {
        throw new Error(`ffmpeg ${label} failed (code ${code})`);
      }
      return new Blob([new Uint8Array(data as ArrayBuffer)], { type: 'video/mp4' });
    } finally {
      ffmpeg.off?.('progress', progressHandler as never);
      try { await ffmpeg.deleteFile?.('input.mp4'); } catch { /* ignore */ }
      try { await ffmpeg.deleteFile?.('output.mp4'); } catch { /* ignore */ }
    }
  };

  const handleProcess = async () => {
    if (!videoSize || rects.length === 0) {
      setError(t('aiTools.rectRequired'));
      return;
    }
    setProcessing(true);
    setError(null);
    setProgress(0);
    setStage(t('aiTools.loadingEngine'));

    try {
      const delogoFilters = rects.map((rect) => {
        const { x, y, w, h } = toDelogoCoords(rect);
        return `delogo=x=${x}:y=${y}:w=${w}:h=${h}`;
      });

      let blob: Blob;
      try {
        setStage(t('aiTools.processingVideo'));
        blob = await runFFmpeg(delogoFilters, 'delogo');
      } catch {
        // 回退：区域高斯模糊（delogo 在部分构建中不可用时）
        setStage(t('aiTools.fallbackBlur'));
        const blurFilters = rects.map((rect) => {
          const { x, y, w, h } = toDelogoCoords(rect);
          const strength = Math.max(8, Math.round(Math.min(w, h) / 4));
          return [
            `split=2[base${x}_${y}][crop_src${x}_${y}]`,
            `[crop_src${x}_${y}]crop=${w}:${h}:${x}:${y},boxblur=luma_radius=${strength}:luma_power=2[blurred${x}_${y}]`,
            `[base${x}_${y}][blurred${x}_${y}]overlay=${x}:${y}`,
          ].join(';');
        });
        // filter_complex 形式（分号链），需用 -filter_complex
        const ffmpeg = await getFFmpeg();
        const { fetchFile } = await import('@ffmpeg/util');
        const progressHandler = ({ progress }: { progress: number }) => {
          setProgress(Math.min(99, Math.round(progress * 100)));
        };
        ffmpeg.on('progress', progressHandler as never);
        try {
          await ffmpeg.writeFile('input.mp4', await fetchFile(fileRef.current!));
          const fc = blurFilters.join(';');
          const code = await ffmpeg.exec([
            '-i', 'input.mp4',
            '-filter_complex', fc,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'copy',
            '-y', 'output.mp4',
          ]);
          const data = await ffmpeg.readFile('output.mp4');
          if (code !== 0 || typeof data === 'string' || data.byteLength < 1024) {
            throw new Error('ffmpeg fallback failed');
          }
          blob = new Blob([new Uint8Array(data as ArrayBuffer)], { type: 'video/mp4' });
        } finally {
          ffmpeg.off?.('progress', progressHandler as never);
          try { await ffmpeg.deleteFile?.('input.mp4'); } catch { /* ignore */ }
          try { await ffmpeg.deleteFile?.('output.mp4'); } catch { /* ignore */ }
        }
      }

      setProgress(100);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(blob));
      setResultSize(blob.size);
    } catch (e) {
      setError(`${t('aiTools.processFailed')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProcessing(false);
      setStage('');
      setProgress(0);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const link = document.createElement('a');
    link.href = resultUrl;
    link.download = 'dewatermarked.mp4';
    link.click();
  };

  const reset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setVideoUrl(null);
    setResultUrl(null);
    setVideoSize(null);
    setRects([]);
    fileRef.current = null;
  };

  return (
    <div className="space-y-6">
      {!videoUrl && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl">
            <Video className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">{t('aiTools.uploadVideoHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button onClick={() => fileInputRef.current?.click()}>{t('aiTools.selectVideo')}</Button>
          </CardContent>
        </Card>
      )}

      {videoUrl && !resultUrl && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setRects([])} disabled={rects.length === 0}>
              <Trash2 className="h-4 w-4 mr-1" /> {t('aiTools.clearRegions')}
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              {t('aiTools.changeVideo')}
            </Button>
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground">{t('aiTools.regionsSelected')}: {rects.length}</span>
            <Button onClick={handleProcess} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {processing ? t('aiTools.processing') : t('aiTools.removeWatermark')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t('aiTools.videoDewatermarkHint')}</p>

          <div ref={videoWrapRef} className="relative inline-block max-w-full rounded-lg overflow-hidden border select-none touch-none">
            <video
              src={videoUrl}
              className="block max-w-full max-h-[55vh] w-auto"
              controls
              muted
              onLoadedMetadata={onVideoLoaded}
              draggable={false}
            />
            {videoSize && (
              <canvas
                ref={overlayRef}
                width={videoSize.w}
                height={videoSize.h}
                className="absolute inset-0 w-full h-full cursor-crosshair"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              />
            )}
          </div>

          {processing && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> {stage} · {progress}%
              </p>
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground">{t('aiTools.videoProcessTimeHint')}</p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {videoUrl && resultUrl && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" /> {t('aiTools.downloadMp4')} ({formatBytes(resultSize)})
            </Button>
            <Button variant="outline" onClick={() => { setResultUrl(null); }}>
              <Square className="h-4 w-4 mr-2" /> {t('aiTools.editAgain')}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t('aiTools.newVideo')}
            </Button>
          </div>
          <video src={resultUrl} className="max-w-full max-h-[60vh] rounded-lg border" controls />
        </div>
      )}
    </div>
  );
}
