'use client';

/**
 * AI 黑白照片变彩色 — 云端推理
 * 服务端模型部署，用户零下载；色彩强度混合在客户端完成
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import {
  AiToolError,
  callAiTool,
  uploadAiInput,
  type AiImageResult,
} from '@/lib/ai-tools/client-api';
import {
  canvasToBlob,
  createCanvas,
  downloadBlob,
  loadImageElement,
} from '@/lib/ai-tools/image-utils';
import { Download, Loader2, ImagePlus, Sparkles, LogIn } from 'lucide-react';
import Link from 'next/link';

export function ImageColorization() {
  const { t } = useLocale();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [serverResult, setServerResult] = useState<AiImageResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [colorStrength, setColorStrength] = useState(100);
  const [comparePos, setComparePos] = useState(50);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const handleFile = async (file: File) => {
    setError(null);
    setServerResult(null);
    setResultUrl(null);
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImageElement(url);
      imageRef.current = img;
      setFile(file);
      setImageUrl(url);
      objectUrlsRef.current.push(url);
    } catch {
      URL.revokeObjectURL(url);
      setError(t('aiTools.loadImageFailed'));
    }
  };

  /** 色彩强度混合：黑白原图 + 上色结果按比例混合 */
  const applyStrength = async (
    strength: number,
    result: AiImageResult,
    source: HTMLImageElement
  ) => {
    const colorImg = await loadImageElement(result.resultUrl);
    if (strength >= 100) {
      setResultUrl(result.resultUrl);
      return;
    }
    const mix = strength / 100;
    const w = colorImg.naturalWidth;
    const h = colorImg.naturalHeight;
    const blended = createCanvas(w, h);
    const bctx = blended.getContext('2d', { willReadFrequently: true })!;
    bctx.drawImage(source, 0, 0, w, h);
    const base = bctx.getImageData(0, 0, w, h);
    const cctx = createCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
    cctx.drawImage(colorImg, 0, 0);
    const colorData = cctx.getImageData(0, 0, w, h);
    for (let i = 0; i < base.data.length; i += 4) {
      base.data[i] = Math.round(base.data[i] * (1 - mix) + colorData.data[i] * mix);
      base.data[i + 1] = Math.round(base.data[i + 1] * (1 - mix) + colorData.data[i + 1] * mix);
      base.data[i + 2] = Math.round(base.data[i + 2] * (1 - mix) + colorData.data[i + 2] * mix);
    }
    bctx.putImageData(base, 0, 0);
    const blob = await canvasToBlob(blended, 'image/png');
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.push(url);
    setResultUrl(url);
  };

  const handleProcess = async () => {
    if (!file || !imageRef.current) return;
    if (!user || !accessToken) {
      setError(t('aiTools.needsLogin'));
      return;
    }
    setProcessing(true);
    setError(null);

    try {
      setStage(t('aiTools.uploading'));
      const upload = await uploadAiInput(
        accessToken,
        user.id,
        file,
        file.name || 'image.png',
        file.type || 'image/png'
      );

      setStage(t('aiTools.serverProcessing'));
      const result = await callAiTool<AiImageResult>(accessToken, 'image-colorization', {
        imageUrl: upload.signedUrl,
      });
      setServerResult(result);

      setStage(t('aiTools.processing'));
      await applyStrength(colorStrength, result, imageRef.current);
      setComparePos(50);
    } catch (e) {
      if (e instanceof AiToolError && (e.code === 'UNAUTHORIZED' || e.code === 'UPLOAD_FAILED')) {
        setError(e.code === 'UNAUTHORIZED' ? t('aiTools.needsLogin') : `${t('aiTools.processFailed')}: ${e.message}`);
      } else {
        setError(`${t('aiTools.processFailed')}: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      setProcessing(false);
      setStage('');
    }
  };

  /** 调整强度：基于服务端结果重新混合（无需再次请求） */
  const handleStrengthChange = async (strength: number) => {
    setColorStrength(strength);
    if (!serverResult || !imageRef.current) return;
    try {
      await applyStrength(strength, serverResult, imageRef.current);
    } catch {
      /* 混合失败保持当前结果 */
    }
  };

  const handleDownload = async () => {
    if (!resultUrl) return;
    const blob = await (await fetch(resultUrl)).blob();
    downloadBlob(blob, 'colorized.png');
  };

  const reset = () => {
    setFile(null);
    setImageUrl(null);
    setServerResult(null);
    setResultUrl(null);
    imageRef.current = null;
  };

  const needsLogin = !authLoading && !user;

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
            {needsLogin ? (
              <Button asChild>
                <Link href="/login">
                  <LogIn className="h-4 w-4 mr-2" /> {t('aiTools.signInToUse')}
                </Link>
              </Button>
            ) : (
              <Button onClick={() => fileInputRef.current?.click()}>{t('aiTools.selectImage')}</Button>
            )}
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
                disabled={processing}
              />
              <span className="w-10 tabular-nums">{colorStrength}%</span>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              {t('aiTools.changeImage')}
            </Button>
            <div className="flex-1" />
            <Button onClick={handleProcess} disabled={processing || needsLogin}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {processing ? stage || t('aiTools.processing') : t('aiTools.colorizeImage')}
            </Button>
          </div>

          <div className="inline-block max-w-full rounded-lg overflow-hidden border">
            <img src={imageUrl} alt="input" className="block max-w-full max-h-[55vh] w-auto grayscale" draggable={false} />
          </div>

          {processing && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {stage}
            </p>
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
              <span className="whitespace-nowrap">{t('aiTools.colorStrength')}</span>
              <Slider
                value={[colorStrength]}
                min={10}
                max={100}
                step={5}
                onValueChange={([v]) => handleStrengthChange(v)}
                className="w-32"
              />
              <span className="w-10 tabular-nums">{colorStrength}%</span>
            </div>
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
