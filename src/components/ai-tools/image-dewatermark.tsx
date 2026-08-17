'use client';

/**
 * AI 图片去水印 — LaMa inpainting
 * 交互: 上传图片 → 画笔涂抹水印区域 → AI 修复 → 滑块对比 + 下载
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { useLocale } from '@/lib/locale-context';
import { lamaInpaint } from '@/lib/ai-tools/lama';
import {
  canvasToBlob,
  createCanvas,
  downloadBlob,
  formatBytes,
  loadImageElement,
} from '@/lib/ai-tools/image-utils';
import { Eraser, Download, Loader2, Paintbrush, Undo2, Trash2, ImagePlus, Sparkles } from 'lucide-react';

interface Stroke {
  points: { x: number; y: number }[];
  size: number;
}

export function ImageDewatermark() {
  const { t } = useLocale();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState(24);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [painting, setPainting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [modelProgress, setModelProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [stage, setStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [comparePos, setComparePos] = useState(50);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);

  const redrawOverlay = useCallback((allStrokes: Stroke[]) => {
    const overlay = overlayRef.current;
    const mask = maskRef.current;
    if (!overlay || !mask || !imageSize) return;
    const { w, h } = imageSize;

    const octx = overlay.getContext('2d')!;
    const mctx = mask.getContext('2d')!;
    octx.clearRect(0, 0, w, h);
    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, w, h);

    for (const stroke of allStrokes) {
      if (stroke.points.length === 0) continue;
      // 显示层（红色半透明）
      octx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.lineWidth = stroke.size;
      octx.beginPath();
      octx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const pt of stroke.points.slice(1)) octx.lineTo(pt.x, pt.y);
      if (stroke.points.length === 1) octx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y);
      octx.stroke();
      // 掩码层（白色）
      mctx.strokeStyle = '#ffffff';
      mctx.lineCap = 'round';
      mctx.lineJoin = 'round';
      mctx.lineWidth = stroke.size;
      mctx.beginPath();
      mctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const pt of stroke.points.slice(1)) mctx.lineTo(pt.x, pt.y);
      if (stroke.points.length === 1) mctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y);
      mctx.stroke();
    }
  }, [imageSize]);

  useEffect(() => {
    redrawOverlay(strokes);
  }, [strokes, redrawOverlay]);

  const toImageCoords = useCallback((clientX: number, clientY: number) => {
    const overlay = overlayRef.current;
    if (!overlay || !imageSize) return null;
    const rect = overlay.getBoundingClientRect();
    const scaleX = imageSize.w / rect.width;
    const scaleY = imageSize.h / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, [imageSize]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (processing || !imageUrl) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = toImageCoords(e.clientX, e.clientY);
    if (!pt) return;
    setPainting(true);
    activeStrokeRef.current = { points: [pt], size: brushSize };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!painting || !activeStrokeRef.current) return;
    const pt = toImageCoords(e.clientX, e.clientY);
    if (!pt) return;
    activeStrokeRef.current.points.push(pt);
    // 实时预览（当前笔画 + 历史笔画）
    redrawOverlay([...strokesRef.current, activeStrokeRef.current]);
  };

  const handlePointerUp = () => {
    if (!painting || !activeStrokeRef.current) return;
    setPainting(false);
    const next = [...strokesRef.current, activeStrokeRef.current];
    activeStrokeRef.current = null;
    strokesRef.current = next;
    setStrokes(next);
  };

  const handleUndo = () => {
    const next = strokesRef.current.slice(0, -1);
    strokesRef.current = next;
    setStrokes(next);
  };

  const handleClear = () => {
    strokesRef.current = [];
    setStrokes([]);
    setResultUrl(null);
  };

  const handleFile = async (file: File) => {
    setError(null);
    setResultUrl(null);
    strokesRef.current = [];
    setStrokes([]);
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImageElement(url);
      imageRef.current = img;
      setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImageUrl(url);
    } catch {
      setError(t('aiTools.loadImageFailed'));
      URL.revokeObjectURL(url);
    }
  };

  const handleProcess = async () => {
    if (!imageRef.current || !maskRef.current) return;
    if (strokesRef.current.length === 0) {
      setError(t('aiTools.maskRequired'));
      return;
    }
    setProcessing(true);
    setError(null);
    setStage(t('aiTools.loadingModel'));
    try {
      // 原图画布
      const src = createCanvas(imageRef.current.naturalWidth, imageRef.current.naturalHeight);
      src.getContext('2d')!.drawImage(imageRef.current, 0, 0);

      const { canvas } = await lamaInpaint(src, maskRef.current, (loaded, total) => {
        setModelProgress({ loaded, total });
        if (total > 0 && loaded < total) {
          setStage(`${t('aiTools.downloadingModel')} (${Math.round((loaded / total) * 100)}%)`);
        }
      });
      setModelProgress(null);
      setStage(t('aiTools.processing'));
      const blob = await canvasToBlob(canvas, 'image/png');
      const result = URL.createObjectURL(blob);
      setResultUrl(result);
      setComparePos(50);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message === 'EMPTY_MASK' ? t('aiTools.maskRequired') : `${t('aiTools.processFailed')}: ${message}`);
    } finally {
      setProcessing(false);
      setModelProgress(null);
      setStage('');
    }
  };

  const handleDownload = async () => {
    if (!resultUrl) return;
    const resp = await fetch(resultUrl);
    const blob = await resp.blob();
    downloadBlob(blob, 'dewatermarked.png');
  };

  const reset = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setImageUrl(null);
    setResultUrl(null);
    setImageSize(null);
    strokesRef.current = [];
    setStrokes([]);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* 上传区 */}
      {!imageUrl && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl">
            <ImagePlus className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">{t('aiTools.uploadImageHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button onClick={() => fileInputRef.current?.click()}>{t('aiTools.selectImage')}</Button>
          </CardContent>
        </Card>
      )}

      {/* 编辑区 */}
      {imageUrl && imageSize && !resultUrl && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Paintbrush className="h-4 w-4" />
              <span className="hidden sm:inline">{t('aiTools.brushSize')}</span>
              <Slider
                value={[brushSize]}
                min={4}
                max={80}
                step={2}
                onValueChange={([v]) => setBrushSize(v)}
                className="w-32"
              />
              <span className="w-8 tabular-nums">{brushSize}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleUndo} disabled={strokes.length === 0}>
              <Undo2 className="h-4 w-4 mr-1" /> {t('aiTools.undo')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleClear} disabled={strokes.length === 0}>
              <Trash2 className="h-4 w-4 mr-1" /> {t('aiTools.clearMask')}
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              {t('aiTools.changeImage')}
            </Button>
            <div className="flex-1" />
            <Button onClick={handleProcess} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {processing ? t('aiTools.processing') : t('aiTools.removeWatermark')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t('aiTools.dewatermarkHint')}</p>

          <div
            ref={displayRef}
            className="relative inline-block max-w-full rounded-lg overflow-hidden border select-none touch-none"
          >
            <img src={imageUrl} alt="input" className="block max-w-full max-h-[60vh] w-auto" draggable={false} />
            <canvas
              ref={overlayRef}
              width={imageSize.w}
              height={imageSize.h}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            {/* 隐藏的白色掩码层（推理用） */}
            <canvas ref={maskRef} width={imageSize.w} height={imageSize.h} className="hidden" />
          </div>

          {(processing || modelProgress) && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> {stage}
              </p>
              {modelProgress && modelProgress.total > 0 && (
                <Progress value={(modelProgress.loaded / modelProgress.total) * 100} />
              )}
              {modelProgress && (
                <p className="text-xs text-muted-foreground">
                  {formatBytes(modelProgress.loaded)} / {formatBytes(modelProgress.total)} · {t('aiTools.modelCacheHint')}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {/* 结果对比区 */}
      {imageUrl && resultUrl && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" /> {t('aiTools.downloadPng')}
            </Button>
            <Button variant="outline" onClick={handleClear}>
              <Eraser className="h-4 w-4 mr-2" /> {t('aiTools.editAgain')}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t('aiTools.newImage')}
            </Button>
          </div>

          <div className="relative inline-block max-w-full rounded-lg overflow-hidden border select-none">
            <img src={resultUrl} alt="result" className="block max-w-full max-h-[60vh] w-auto" draggable={false} />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - comparePos}% 0 0)` }}
            >
              <img src={imageUrl} alt="before" className="block w-full h-full object-cover" draggable={false} />
            </div>
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.6)]"
              style={{ left: `${comparePos}%` }}
            />
            <span className="absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
              {t('aiTools.before')}
            </span>
            <span className="absolute top-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
              {t('aiTools.after')}
            </span>
          </div>

          <div className="flex items-center gap-3 max-w-md">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t('aiTools.compare')}</span>
            <Slider value={[comparePos]} min={0} max={100} step={1} onValueChange={([v]) => setComparePos(v)} />
          </div>
        </div>
      )}
    </div>
  );
}
