'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Download, AlertCircle, Loader2, Video, ExternalLink, Circle } from 'lucide-react';
import { useLocale } from '@/lib/locale-context';

interface VideoClip {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  summary: string;
  engagementScore: number;
  thumbnailUrl: string;
  videoUrl: string | null;
  status: 'processing' | 'completed' | 'failed' | 'link_only';
  linkOnlyUrl?: string;
  isFallback?: boolean;
}

interface PreviewDialogProps {
  clip: VideoClip;
  open: boolean;
  onOpenChange: () => void;
  proxyUrl: (clip: VideoClip, download?: boolean) => string;
  onDownload: (clip: VideoClip) => void;
  onClipUpdated?: (clip: VideoClip) => void;
  downloadingId: string | null;
  fmt: (sec: number) => string;
}

// 从 linkOnlyUrl (https://youtu.be/<id>?t=<seconds>s) 提取 videoId 和 startTime
function parseYouTubeLink(url: string): { videoId: string; startTime: number } | null {
  try {
    const u = new URL(url);
    let videoId = '';
    let startTime = 0;
    if (u.hostname === 'youtu.be') {
      videoId = u.pathname.replace('/', '').trim();
    } else if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) videoId = v;
    }
    if (!/^[a-zA-Z0-9_-]{7,15}$/.test(videoId)) return null;
    const t = u.searchParams.get('t') || u.searchParams.get('start');
    if (t) {
      const n = parseInt(t.replace(/[^\d]/g, ''), 10);
      if (Number.isFinite(n)) startTime = n;
    }
    return { videoId, startTime };
  } catch {
    return null;
  }
}

function buildYouTubeEmbedUrl(videoId: string, startTime: number, endTime: number): string {
  const start = Math.max(0, Math.floor(startTime));
  const end = Math.max(start + 1, Math.floor(endTime));
  return `https://www.youtube.com/embed/${videoId}?start=${start}&end=${end}&autoplay=1&rel=0&modestbranding=1`;
}

export default function PreviewDialog({
  clip,
  open,
  onOpenChange,
  proxyUrl,
  onDownload,
  onClipUpdated,
  downloadingId,
  fmt,
}: PreviewDialogProps) {
  const { t } = useLocale();
  const [isRecording, setIsRecording] = useState(false);
  const [recordStatus, setRecordStatus] = useState<string>('');
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // Determine if this clip should use YouTube embed
  const useYouTubeEmbed = (clip.isFallback === true || clip.status === 'link_only') && clip.linkOnlyUrl;
  const ytInfo = useYouTubeEmbed && clip.linkOnlyUrl ? parseYouTubeLink(clip.linkOnlyUrl) : null;
  const embedUrl = ytInfo ? buildYouTubeEmbedUrl(ytInfo.videoId, ytInfo.startTime, clip.endTime) : '';

  // Whether the clip has a real downloadable MP4 (not fallback)
  const hasRealMp4 = clip.videoUrl && clip.status === 'completed' && clip.isFallback !== true;

  const handleRecordClip = useCallback(async () => {
    if (!ytInfo) return;
    setRecordStatus(t('video.recordAllowCapture'));
    setIsRecording(true);

    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    const chunks: BlobPart[] = [];

    try {
      // 1. 请求屏幕录制权限（让用户选择当前标签页）
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: true,
      });
      recordStreamRef.current = stream;

      // 检测用户是否取消了分享
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop();
        }
      });

      // 2. 同时捕获 YouTube iframe 的音频（如果可能）
      //    注意：我们无法直接捕获 iframe 音频，但 getDisplayMedia 的 audio track
      //    会捕获整个标签的音频（如果用户选择分享标签）
      const audioTracks = stream.getAudioTracks();
      const hasAudio = audioTracks.length > 0;

      // 3. 创建 MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm';

      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const clipDuration = Math.max(1, clip.endTime - clip.startTime);

      // 4. 开始录制
      recorder.start(1000);
      setRecordStatus(t('video.recordPlaying').replace('{duration}', String(clipDuration)));

      // 5. 等待录制完成（clip 时长 + 2 秒缓冲）
      await new Promise<void>((resolve) => {
        const totalMs = (clipDuration + 2) * 1000;
        const timer = setTimeout(() => {
          if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
          }
          resolve();
        }, totalMs);

        recorder!.onstop = () => {
          clearTimeout(timer);
          resolve();
        };
      });

      // 6. 停止屏幕共享
      stream.getTracks().forEach((track) => track.stop());
      recordStreamRef.current = null;

      // 7. 创建 blob 并更新 clip
      const blob = new Blob(chunks, { type: 'video/webm' });
      if (blob.size < 10_000) {
        throw new Error('Recording too small');
      }

      // 8. 转换为 data URL 并更新 clip
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const updatedClip: VideoClip = {
        ...clip,
        videoUrl: dataUrl,
        status: 'completed',
        isFallback: false,
      };
      onClipUpdated?.(updatedClip);

      setRecordStatus(t('video.recordComplete'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Permission denied') || msg.includes('NotAllowedError')) {
        setRecordStatus(t('video.recordPermissionDenied'));
      } else {
        setRecordStatus(t('video.recordFailed') + ': ' + msg.slice(0, 100));
      }
    } finally {
      setIsRecording(false);
      if (recordStreamRef.current) {
        recordStreamRef.current.getTracks().forEach((track) => track.stop());
        recordStreamRef.current = null;
      }
    }
  }, [clip, ytInfo, onClipUpdated, t]);

  // 清理：关闭对话框时停止录制
  useEffect(() => {
    if (!open && recordStreamRef.current) {
      recordStreamRef.current.getTracks().forEach((track) => track.stop());
      recordStreamRef.current = null;
      setIsRecording(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[92vw] overflow-hidden">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            {clip.title}
          </DialogTitle>
          <DialogDescription>{clip.summary}</DialogDescription>
        </DialogHeader>

        {/* Real MP4 video player */}
        {hasRealMp4 ? (
          <div className="relative bg-black rounded-lg overflow-hidden min-w-0 w-full">
            <video
              key={clip.id}
              src={proxyUrl(clip)}
              controls
              playsInline
              preload="metadata"
              className="block w-full h-auto aspect-video"
            />
          </div>
        ) : useYouTubeEmbed && ytInfo ? (
          /* YouTube IFrame embed for fallback/link_only clips */
          <div className="relative bg-black rounded-lg overflow-hidden min-w-0 w-full">
            <iframe
              key={`embed-${clip.id}-${ytInfo.startTime}`}
              src={embedUrl}
              title={clip.title}
              className="block w-full h-auto aspect-video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : clip.videoUrl ? (
          /* Fallback video player (zoompan pseudo-video - should rarely show) */
          <div className="relative bg-black rounded-lg overflow-hidden min-w-0 w-full">
            <video
              key={clip.id}
              src={proxyUrl(clip)}
              controls
              playsInline
              preload="metadata"
              className="block w-full h-auto aspect-video"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mb-4" />
            <p className="font-medium">{t('video.videoPreviewNotAvailable')}</p>
            <p className="text-sm mt-1">{t('video.clipMayStillProcessing')}</p>
          </div>
        )}

        {/* Recording status display */}
        {isRecording && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
            <Circle className="h-4 w-4 text-red-500 animate-pulse fill-red-500" />
            <span className="text-sm font-medium text-red-700 dark:text-red-300">{recordStatus}</span>
          </div>
        )}

        {/* Error/status message */}
        {!isRecording && recordStatus && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <Video className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{recordStatus}</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{fmt(clip.startTime)} - {fmt(clip.endTime)}</span>
            <Badge variant="outline">{t('common.score')}: {clip.engagementScore}/10</Badge>
          </div>
          <div className="flex items-center gap-2">
            {/* Watch on YouTube link */}
            {useYouTubeEmbed && ytInfo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(clip.linkOnlyUrl, '_blank')}
                className="gap-1.5"
              >
                <ExternalLink className="h-4 w-4" />YouTube
              </Button>
            )}
            {/* Record to MP4 button (for embed/fallback clips) */}
            {useYouTubeEmbed && ytInfo && !hasRealMp4 && (
              <Button
                size="sm"
                onClick={handleRecordClip}
                disabled={isRecording}
                className="gap-1.5"
              >
                {isRecording ? (
                  <><Loader2 className="h-4 w-4 animate-pulse" />{t('video.recording')}</>
                ) : (
                  <><Video className="h-4 w-4" />{t('video.recordMp4')}</>
                )}
              </Button>
            )}
            {/* Download button (for real MP4 clips) */}
            {hasRealMp4 && (
              <Button
                onClick={() => onDownload(clip)}
                disabled={downloadingId === clip.id}
                className="gap-2"
              >
                {downloadingId === clip.id ? (
                  <><Loader2 className="h-4 w-4 animate-pulse" />{t('common.saving')}</>
                ) : (
                  <><Download className="h-4 w-4" />{t('video.download')}</>
                )}
              </Button>
            )}
            {/* Download button for link_only clips: capture on-demand via CF Worker /stream */}
            {!hasRealMp4 && useYouTubeEmbed && (
              <Button
                onClick={() => onDownload(clip)}
                disabled={downloadingId === clip.id}
                className="gap-2"
              >
                {downloadingId === clip.id ? (
                  <><Loader2 className="h-4 w-4 animate-pulse" />{t('common.saving')}</>
                ) : (
                  <><Download className="h-4 w-4" />{t('video.download')}</>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Screen capture instructions */}
        {useYouTubeEmbed && ytInfo && !hasRealMp4 && !isRecording && !recordStatus && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
            {t('video.recordHint')}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
