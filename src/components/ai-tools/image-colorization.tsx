'use client';

/**
 * AI 黑白照片变彩色 — colorful_image_colorization
 * 模型小（~10MB），保留原图分辨率细节，仅色彩由 AI 生成
 */

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { useLocale } from '@/lib/locale-context';
import { colorizeImage, COLORIZE_REPO } from '@/lib/ai-tools/colorize';
import { getOrtSession, type ModelProgress } from '@/lib/ai-tools/model-loader';
import {
  canvasToBlob,
  createCanvas,
  downloadBlob,
  formatBytes,
  loadImageElement,
} from '@/lib/ai-tools/image-utils';
import { Download, Loader2, ImagePlus, Sparkles } from 'lucide-react';

export function ImageColorization() {
  const { t } = useLocale();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [modelProgress, setModelProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [colorStrength, setColorStrength] = useState(100);
  const [comparePos, setComparePos] = useState(50);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setResultUrl(null);
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImageElement(url);
      imageRef.current = img;
      setImageUrl(url);
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
      // 预触发模型下载（带进度）
      await getOrtSession('colorize', COLORIZE_REPO, (loaded, total) => {
        setModelProgress({ loaded, total });
        if (total > 0 && loaded < total) {
          setStage(`${t('aiTools.downloadingModel')} (${Math.round((loaded / total) * 100)}%)`);
        }
      });
      setModelProgress(null);
      setStage(t('aiTools.processing'));

      const src = createCanvas(imageRef.current.naturalWidth, imageRef.current.naturalHeight);
      src.getContext('2d')!.drawImage(imageRef.current, 0, 0);

      const canvas = await colorizeImage(src);

      // 色彩强度混合（原图黑白 + 上色结果）
      let finalCanvas = canvas;
      if (colorStrength < 100) {
        const mix = colorStrength / 100;
        const blended = createCanvas(canvas.width, canvas.height);
        const bctx = blended.getContext('2d', { willReadFrequently: true })!;
        bctx.drawImage(src, 0, 0, canvas.width, canvas.height);
        const base = bctx.getImageData(0, 0, canvas.width, canvas.height);
        const colorData = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < base.data.length; i += 4) {
          base.data[i] = Math.round(base.data[i] * (1 - mix) + colorData.data[i] * mix);
          base.data[i + 1] = Math.round(base.data[i + 1] * (1 - mix) + colorData.data[i + 1] * mix);
          base.data[i + 2] = Math.round(base.data[i + 2] * (1 - mix) + colorData.data[i + 2] * mix);
        }
        bctx.putImageData(base, 0, 0);
        finalCanvas = blended;
      }

      const blob = await canvasToBlob(finalCanvas, 'image/png');
      setResultUrl(URL.createObjectURL(blob));
      setComparePos(50);
    } catch (e) {
      setError(`${t('aiTools.processFailed')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProcessing(false);
      setModelProgress(null);
      setStage('');
    }
  };

  const handleDownload = async () => {
    if (!resultUrl) return;
    const blob = await (await fetch(resultUrl)).blob();
    downloadBlob(blob, 'colorized.png');
  };

  const reset = () => {
    setImageUrl(null);
    setResultUrl(null);
    imageRef.current = null;
  };

  return (
    <div className="space-y-6">
      {!imageUrl && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl">
            <ImagePlus className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">{t('aiTools.colorizeHint')}</p>
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

      {imageUrl && !resultUrl && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="whitespace-nowrap">{t('aiTools.colorStrength')}</span>
              <Slider
                value={[colorStrength]}
                min={10}
                max={100}
                step={5}
                onValueChange={([v]) => setColorStrength(v)}
                className="w-32"
              />
              <span className="w-10 tabular-nums">{colorStrength}%</span>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              {t('aiTools.changeImage')}
            </Button>
            <div className="flex-1" />
            <Button onClick={handleProcess} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {processing ? stage || t('aiTools.processing') : t('aiTools.colorizeImage')}
            </Button>
          </div>

          <div className="inline-block max-w-full rounded-lg overflow-hidden border">
            <img src={imageUrl} alt="input" className="block max-w-full max-h-[55vh] w-auto grayscale" draggable={false} />
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

      {imageUrl && resultUrl && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" /> {t('aiTools.downloadPng')}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t('aiTools.newImage')}
            </Button>
          </div>

          <div className="relative inline-block max-w-full rounded-lg overflow-hidden border select-none">
            <img src={resultUrl} alt="result" className="block max-w-full max-h-[60vh] w-auto" draggable={false} />
            <div
              className="absolute inset-0 overflow-hidden grayscale"
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
