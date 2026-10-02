'use client';

/**
 * AI 背景消除 — 云端 MODNet 推理
 * 交互: 上传人像/商品图 → 服务端抠图 → 透明 PNG 预览 + 下载
 */

import { useRef, useState } from 'react';
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
import { useAiToolCredit, AI_TOOL_COST } from '@/lib/ai-tools/use-ai-tool-credit';
import { InsufficientCreditsDialog } from '@/components/insufficient-credits-dialog';
import { Download, Loader2, ImagePlus, Sparkles, LogIn } from 'lucide-react';
import Link from 'next/link';

// 透明棋盘格背景，方便预览透明边缘
const CHECKER_CSS = 'conic-gradient(#e5e7eb 25%, transparent 0 50%, #e5e7eb 0 75%, transparent 0)';

export function ImageRemoveBg() {
  const { t } = useLocale();
  const { user, accessToken, loading: authLoading } = useAuth();
  const { requestSpend, insufficientOpen, setInsufficientOpen, balance } = useAiToolCredit();
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    setError(null);
    setResultUrl(null);
    try {
      const url = URL.createObjectURL(f);
      await loadImageElement(url);
      if (imageUrl && imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
      setFile(f);
      setImageUrl(url);
    } catch {
      setError(t('aiTools.loadImageFailed'));
    }
  };

  const handleProcess = async () => {
    if (!file) return;
    if (!user || !accessToken) {
      setError(t('aiTools.needsLogin'));
      return;
    }
    // P0: AI 工具积分化 — 每次推理前扣积分
    if (!(await requestSpend())) return;
    setProcessing(true);
    setError(null);
    try {
      setStage(t('aiTools.uploading'));
      const imageUpload = await uploadAiInput(
        accessToken,
        user.id,
        file,
        file.name || 'image.png',
        file.type || 'image/png'
      );

      setStage(t('aiTools.serverProcessing'));
      const result = await callAiTool<AiImageResult>(accessToken, 'image-remove-bg', {
        imageUrl: imageUpload.signedUrl,
      });

      setResultUrl(result.resultUrl);
    } catch (e) {
      if (e instanceof AiToolError) {
        if (e.code === 'UNAUTHORIZED') setError(t('aiTools.needsLogin'));
        else setError(`${t('aiTools.processFailed')}: ${e.message}`);
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
    const resp = await fetch(resultUrl);
    const blob = await resp.blob();
    downloadBlob(blob, 'no-background.png');
  };

  const reset = () => {
    if (imageUrl && imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setResultUrl(null);
    setFile(null);
    setError(null);
  };

  const needsLogin = !authLoading && !user;

  return (
    <div className="space-y-6">
      {!imageUrl && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl">
            <ImagePlus className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">{t('aiTools.removeBgHint')}</p>
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
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('aiTools.removeBgHint')}</p>
            </div>
            <Button variant="ghost" onClick={reset}>
              {t('aiTools.changeImage')}
            </Button>
            <Button onClick={handleProcess} disabled={processing || needsLogin}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {processing ? stage || t('aiTools.processing') : t('aiTools.removeBgProcess')}
            </Button>
          </div>

          <div className="relative inline-block max-w-full rounded-lg overflow-hidden border select-none">
            <div
              className="rounded-lg"
              style={{ backgroundImage: CHECKER_CSS, backgroundSize: '24px 24px' }}
            >
              <img src={imageUrl} alt="input" className="block max-w-full max-h-[60vh] w-auto" draggable={false} />
            </div>
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
          </div>

          <div className="relative inline-block max-w-full rounded-lg overflow-hidden border select-none">
            <div
              className="rounded-lg"
              style={{ backgroundImage: CHECKER_CSS, backgroundSize: '24px 24px' }}
            >
              <img src={resultUrl} alt="result" className="block max-w-full max-h-[60vh] w-auto" draggable={false} />
            </div>
          </div>
          {resultUrl && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t('aiTools.removeBgSuccess')}</p>}
        </div>
      )}

      <InsufficientCreditsDialog
        open={insufficientOpen}
        onOpenChange={setInsufficientOpen}
        currentBalance={balance}
        requiredCredits={AI_TOOL_COST}
      />
    </div>
  );
}