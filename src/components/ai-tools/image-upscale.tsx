'use client';

/**
 * AI 图片变高清 — 云端推理
 * 服务端 Swin2SR 超分（支持 2x / 4x），用户零下载
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import {
  AiToolError,
  callAiTool,
  uploadAiInput,
  type AiImageResult,
} from '@/lib/ai-tools/client-api';
import { downloadBlob, loadImageElement } from '@/lib/ai-tools/image-utils';
import { Download, Loader2, ImagePlus, Sparkles, LogIn } from 'lucide-react';
import Link from 'next/link';

export function ImageUpscale() {
  const { t } = useLocale();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultDims, setResultDims] = useState<{ w: number; h: number } | null>(null);
  const [scaleFactor, setScaleFactor] = useState(2);
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    setResultUrl(null);
    setResultDims(null);
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImageElement(url);
      imageRef.current = img;
      setFile(file);
      setDims({ w: img.naturalWidth, h: img.naturalHeight });
      setImageUrl(url);
      objectUrlsRef.current.push(url);
    } catch {
      URL.revokeObjectURL(url);
      setError(t('aiTools.loadImageFailed'));
    }
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
      const result = await callAiTool<AiImageResult>(accessToken, 'image-upscale', {
        imageUrl: upload.signedUrl,
        scale: scaleFactor,
      });

      setResultUrl(result.resultUrl);
      setResultDims({ w: result.width, h: result.height });
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

  const handleDownload = async () => {
    if (!resultUrl) return;
    const blob = await (await fetch(resultUrl)).blob();
    downloadBlob(blob, `upscaled-${scaleFactor}x.png`);
  };

  const reset = () => {
    setFile(null);
    setImageUrl(null);
    setResultUrl(null);
    setDims(null);
    setResultDims(null);
    imageRef.current = null;
  };

  const needsLogin = !authLoading && !user;

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
            <Button onClick={handleProcess} disabled={processing || needsLogin}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {processing ? stage || t('aiTools.processing') : t('aiTools.upscaleImage')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {dims.w} × {dims.h} → {Math.round(dims.w * scaleFactor)} × {Math.round(dims.h * scaleFactor)}
          </p>

          <div className="inline-block max-w-full rounded-lg overflow-hidden border">
            <img src={imageUrl} alt="input" className="block max-w-full max-h-[55vh] w-auto" draggable={false} />
          </div>

          {processing && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {stage}
            </p>
          )}

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
