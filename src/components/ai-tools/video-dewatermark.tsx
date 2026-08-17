'use client';

/**
 * AI 视频去水印 — 云端 ffmpeg delogo
 * 交互: 上传视频 → 框选水印区域（支持多个）→ 上传 + 服务端处理 → 下载
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import {
  AiToolError,
  callAiTool,
  uploadAiInput,
  type AiVideoResult,
} from '@/lib/ai-tools/client-api';
import { formatBytes } from '@/lib/ai-tools/image-utils';
import { Download, Loader2, Trash2, Video, Square, Sparkles, LogIn } from 'lucide-react';
import Link from 'next/link';

interface Rect {
  x: number; // 归一化 0..1
  y: number;
  w: number;
  h: number;
}

const MAX_VIDEO_BYTES = 48 * 1024 * 1024; // Supabase 桶单文件上限 50MB

export function VideoDewatermark() {
  const { t } = useLocale();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
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
    setResultSize(0);
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

  const handleProcess = async () => {
    if (!fileRef.current || !videoSize || rects.length === 0) {
      setError(t('aiTools.rectRequired'));
      return;
    }
    if (!user || !accessToken) {
      setError(t('aiTools.needsLogin'));
      return;
    }
    setProcessing(true);
    setError(null);
    setStage(t('aiTools.uploading'));

    try {
      // 上传视频（直传 Storage，避免大文件经 API 中转）
      const upload = await uploadAiInput(
        accessToken,
        user.id,
        fileRef.current,
        fileRef.current.name || 'video.mp4',
        fileRef.current.type || 'video/mp4'
      );

      // 服务端 ffmpeg delogo 处理
      setStage(t('aiTools.processingVideo'));
      const result = await callAiTool<AiVideoResult>(accessToken, 'video-dewatermark', {
        videoUrl: upload.signedUrl,
        rects: rects.map(({ x, y, w, h }) => ({ x, y, w, h })),
      });

      setResultUrl(result.resultUrl);
      setResultSize(result.sizeBytes);
    } catch (e) {
      if (e instanceof AiToolError) {
        if (e.code === 'UNAUTHORIZED') {
          setError(t('aiTools.needsLogin'));
        } else if (e.code === 'VIDEO_TOO_LARGE') {
          setError(t('aiTools.videoTooLarge'));
        } else if (e.code === 'VIDEO_TOO_LONG') {
          setError(t('aiTools.videoTooLong'));
        } else if (e.code === 'RECT_REQUIRED') {
          setError(t('aiTools.rectRequired'));
        } else {
          setError(`${t('aiTools.processFailed')}: ${e.message}`);
        }
      } else {
        setError(`${t('aiTools.processFailed')}: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      setProcessing(false);
      setStage('');
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
    setVideoUrl(null);
    setResultUrl(null);
    setResultSize(0);
    setVideoSize(null);
    setRects([]);
    fileRef.current = null;
  };

  const needsLogin = !authLoading && !user;

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
            {needsLogin ? (
              <Button asChild>
                <Link href="/login">
                  <LogIn className="h-4 w-4 mr-2" /> {t('aiTools.signInToUse')}
                </Link>
              </Button>
            ) : (
              <Button onClick={() => fileInputRef.current?.click()}>{t('aiTools.selectVideo')}</Button>
            )}
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
            <Button onClick={handleProcess} disabled={processing || needsLogin}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {processing ? stage || t('aiTools.processing') : t('aiTools.removeWatermark')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t('aiTools.videoDewatermarkHint')}</p>

          <div className="relative inline-block max-w-full rounded-lg overflow-hidden border select-none touch-none">
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
                <Loader2 className="h-4 w-4 animate-spin" /> {stage}
              </p>
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
