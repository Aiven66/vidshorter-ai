'use client';

/**
 * AI 图片变高清 — Swin2SR 超分辨率（transformers.js）
 * 支持 2x / 4x（4x = 两次 2x 级联）
 */

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useLocale } from '@/lib/locale-context';
import { getUpscaler } from '@/lib/ai-tools/model-loader';
import {
  canvasToBlob,
  createCanvas,
  downloadBlob,
  fitSize,
  loadImageElement,
} from '@/lib/ai-tools/image-utils';
import { Download, Loader2, ImagePlus, Sparkles } from 'lucide-react';

const MAX_INPUT_SIDE = 960; // Swin2SR wasm 推理约束（过慢/OOM）

export function ImageUpscale() {
  const { t } = useLocale();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultDims, setResultDims] = useState<{ w: number; h: number } | null>(null);
  const [scaleFactor, setScaleFactor] = useState(2);
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [usedFullRes, setUsedFullRes] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const handleFile = async (file: File) => {
    setError(null);
    setResultUrl(null);
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImageElement(url);
      imageRef.current = img;
      setDims({ w: img.naturalWidth, h: img.naturalHeight });
      setImageUrl(url);
      objectUrlsRef.current.push(url);
    } catch {
      setError(t('aiTools.loadImageFailed'));
    }
  };

  const handleProcess = async () => {
    if (!imageRef.current) return;
    setProcessing(true);
    setError(null);
    setStage(t('aiTools.loadingModel'));

    try {
      const upscaler = await getUpscaler((status) => {
        if (status === 'downloading') setStage(t('aiTools.downloadingModel'));
      });

      // 输入约束
      const fitted = fitSize(dims!.w, dims!.h, MAX_INPUT_SIDE);
      setUsedFullRes(fitted.w === dims!.w && fitted.h === dims!.h);
      let canvas = createCanvas(fitted.w, fitted.h);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imageRef.current, 0, 0, fitted.w, fitted.h);
      let inputUrl = canvas.toDataURL('image/png');

      // 级联放大 2x → 4x
      const passes = scaleFactor === 4 ? 2 : 1;
      let currentDims = { w: fitted.w, h: fitted.h };
      for (let i = 0; i < passes; i++) {
        setStage(`${t('aiTools.processing')} (${i + 1}/${passes})`);
        const output = await upscaler(inputUrl);
        canvas = createCanvas(output.width, output.height);
        const outCtx = canvas.getContext('2d')!;
        const imageData = new ImageData(
          new Uint8ClampedArray(output.data as Uint8ClampedArray),
          output.width,
          output.height
        );
        outCtx.putImageData(imageData, 0, 0);
        currentDims = { w: output.width, h: output.height };
        inputUrl = canvas.toDataURL('image/png');
      }

      const blob = await canvasToBlob(canvas, 'image/png');
      const result = URL.createObjectURL(blob);
      objectUrlsRef.current.push(result);
      setResultUrl(result);
      setResultDims(currentDims);
    } catch (e) {
      setError(`${t('aiTools.processFailed')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProcessing(false);
      setStage('');
    }
  };

  const handleDownload = async () => {
    if (!resultUrl) return;
    const blob = await (await fetch(resultUrl)).blob();
    downloadBlob(blob, `upscaled-${scaleFactor}x.png`);
  };

  const reset = () => {
    setImageUrl(null);
    setResultUrl(null);
    setDims(null);
    setResultDims(null);
    imageRef.current = null;
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  };

  return (
    <div className="space-y-6">
      {!imageUrl && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl">
            <ImagePlus className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">{t('aiTools.upscaleHint')}</p>
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

      {imageUrl && dims && !resultUrl && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border p-1">
              {[2, 4].map((factor) => (
                <button
                  key={factor}
                  onClick={() => setScaleFactor(factor)}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                    scaleFactor === factor
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {factor}x
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              {t('aiTools.changeImage')}
            </Button>
            <div className="flex-1" />
            <Button onClick={handleProcess} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {processing ? stage || t('aiTools.processing') : t('aiTools.upscaleImage')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {dims.w} × {dims.h}
            {scaleFactor === 4 ? ' → ' : ' → '}
            {Math.round((usedFullRes ? dims.w : Math.min(dims.w, MAX_INPUT_SIDE)) * scaleFactor)} ×{' '}
            {Math.round((usedFullRes ? dims.h : Math.min(dims.h, MAX_INPUT_SIDE)) * scaleFactor)}
            {' · '}
            {t('aiTools.upscaleTimeHint')}
          </p>

          <div className="inline-block max-w-full rounded-lg overflow-hidden border">
            <img src={imageUrl} alt="input" className="block max-w-full max-h-[55vh] w-auto" draggable={false} />
          </div>

          {processing && <Progress value={undefined} />}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {imageUrl && resultUrl && resultDims && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" /> {t('aiTools.downloadPng')}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t('aiTools.newImage')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {dims!.w}×{dims!.h} → <span className="font-medium text-foreground">{resultDims.w}×{resultDims.h}</span>
            </span>
          </div>
          <div className="inline-block max-w-full rounded-lg overflow-hidden border">
            <img src={resultUrl} alt="result" className="block max-w-full max-h-[65vh] w-auto" draggable={false} />
          </div>
        </div>
      )}
    </div>
  );
}
