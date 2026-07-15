'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Download, AlertCircle, Loader2, ExternalLink, Volume2, VolumeX } from 'lucide-react';
import { useLocale } from '@/lib/locale-context';
import { buildStreamProxyUrl, parseResolvedStream } from '@/lib/youtube-clip-download';

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
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [useFallbackEmbed, setUseFallbackEmbed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Determine if this clip should use YouTube embed
  const useYouTubeEmbed = (clip.isFallback === true || clip.status === 'link_only') && clip.linkOnlyUrl;
  const ytInfo = useYouTubeEmbed && clip.linkOnlyUrl ? parseYouTubeLink(clip.linkOnlyUrl) : null;
  // IMPORTANT: Use clip.startTime (the actual highlight start), NOT ytInfo.startTime.
  // linkOnlyUrl is often just the original YouTube URL without a ?t= param,
  // so ytInfo.startTime would be 0 (video plays from the beginning).
  // clip.startTime is always the correct highlight start time.
  const embedUrl = ytInfo ? buildYouTubeEmbedUrl(ytInfo.videoId, clip.startTime, clip.endTime) : '';

  // Whether the clip has a real downloadable MP4 (not fallback)
  const hasRealMp4 = clip.videoUrl && clip.status === 'completed' && clip.isFallback !== true;

  // Build CF Worker /stream URL for link_only clips (with audio!)
  // This replaces the old YouTube iframe embed (which had no audio due to autoplay policies)
  const cfWorkerStreamUrl = useMemo(() => {
    if (!ytInfo) return null;
    try {
      const cfWorkerUrl = typeof window !== 'undefined' ? window.__CF_WORKER_URL__ : '';
      if (!cfWorkerUrl) return null;
      // Build /stream URL with muxed=1 to get combined video+audio stream
      const u = new URL(cfWorkerUrl);
      u.pathname = `${u.pathname.replace(/\/$/, '')}/stream`;
      u.searchParams.set('videoId', ytInfo.videoId);
      u.searchParams.set('maxHeight', '720');
      u.searchParams.set('muxed', '1');
      return u.toString();
    } catch {
      return null;
    }
  }, [ytInfo]);

  // Reset state when clip changes or dialog opens
  useEffect(() => {
    if (open) {
      setStreamUrl(null);
      setStreamError(null);
      setUseFallbackEmbed(false);
      setStreamLoading(false);
    }
  }, [open, clip.id]);

  // For link_only clips: load CF Worker /stream URL on demand
  // This gives us a playable video with AUDIO (unlike YouTube iframe embed)
  const handleLoadStream = async () => {
    if (!cfWorkerStreamUrl) {
      setStreamError('CF Worker not configured');
      setUseFallbackEmbed(true);
      return;
    }
    setStreamLoading(true);
    setStreamError(null);
    try {
      // First, resolve the stream to get streamUrl (for fast path)
      const cfWorkerUrl = typeof window !== 'undefined' ? window.__CF_WORKER_URL__ : '';
      if (!cfWorkerUrl) throw new Error('CF Worker not configured');

      const resolveUrl = new URL(cfWorkerUrl);
      resolveUrl.pathname = `${resolveUrl.pathname.replace(/\/$/, '')}/resolve`;
      if (ytInfo) resolveUrl.searchParams.set('videoId', ytInfo.videoId);
      resolveUrl.searchParams.set('maxHeight', '720');
      resolveUrl.searchParams.set('muxed', '1');

      const res = await fetch(resolveUrl.toString(), { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Resolve failed: HTTP ${res.status}`);
      const data = await res.json();
      if (!data.streamUrl) throw new Error('No stream URL');

      // Build /stream URL with the resolved streamUrl (fast path)
      const resolved = parseResolvedStream(data);
      const streamProxyUrl = buildStreamProxyUrl(ytInfo!.videoId, resolved);
      setStreamUrl(streamProxyUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Preview] Failed to load stream:', msg);
      setStreamError(msg.slice(0, 100));
      setUseFallbackEmbed(true);
    } finally {
      setStreamLoading(false);
    }
  };

  // Auto-load stream when dialog opens for link_only clips
  useEffect(() => {
    if (open && useYouTubeEmbed && ytInfo && !hasRealMp4 && !streamUrl && !streamLoading && !streamError && !useFallbackEmbed) {
      handleLoadStream();
    }
  }, [open, useYouTubeEmbed, ytInfo, hasRealMp4, streamUrl, streamLoading, streamError, useFallbackEmbed]);

  // 清理
  useEffect(() => {
    if (!open) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
      }
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl w-[94vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">{clip.title}</span>
          </DialogTitle>
          <DialogDescription className="line-clamp-2">{clip.summary}</DialogDescription>
        </DialogHeader>

        {/* Video player area — fixed aspect ratio to prevent layout overflow */}
        {hasRealMp4 ? (
          <div className="relative bg-black rounded-lg overflow-hidden w-full aspect-video">
            <video
              key={clip.id}
              src={proxyUrl(clip)}
              controls
              playsInline
              preload="metadata"
              className="absolute inset-0 w-full h-full"
            />
          </div>
        ) : useYouTubeEmbed && ytInfo ? (
          // link_only clips: use CF Worker /stream (with audio) instead of YouTube iframe embed
          <div className="relative bg-black rounded-lg overflow-hidden w-full aspect-video">
            {streamLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                <Loader2 className="h-10 w-10 animate-spin mb-3" />
                <p className="text-sm">Loading video stream...</p>
                <p className="text-xs text-white/60 mt-1">Resolving from YouTube...</p>
              </div>
            ) : streamUrl && !useFallbackEmbed ? (
              <video
                key={`stream-${clip.id}-${streamUrl.slice(-20)}`}
                ref={videoRef}
                src={streamUrl}
                controls
                playsInline
                autoPlay
                className="absolute inset-0 w-full h-full"
                crossOrigin="anonymous"
                // SEEK to clip.startTime when metadata loads — without this,
                // the video plays from 0:00 (the beginning of the full video),
                // not from the highlight's start position.
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (clip.startTime > 0 && v.currentTime < clip.startTime - 1) {
                    try {
                      v.currentTime = clip.startTime;
                    } catch (err) {
                      console.warn('[Preview] Seek to startTime failed:', err);
                    }
                  }
                }}
                onError={(e) => {
                  console.warn('[Preview] Video error:', e);
                  setStreamError('Video failed to load');
                  setUseFallbackEmbed(true);
                }}
              />
            ) : useFallbackEmbed ? (
              <iframe
                key={`embed-${clip.id}-${ytInfo.startTime}`}
                src={embedUrl}
                title={clip.title}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : streamError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4">
                <AlertCircle className="h-10 w-10 mb-3 text-yellow-400" />
                <p className="text-sm font-medium mb-1">Stream unavailable</p>
                <p className="text-xs text-white/60 mb-3 text-center">{streamError}</p>
                <Button size="sm" variant="secondary" onClick={handleLoadStream} className="mb-2">
                  Retry
                </Button>
                <Button size="sm" variant="outline" onClick={() => setUseFallbackEmbed(true)}>
                  Use YouTube embed instead
                </Button>
              </div>
            ) : null}
          </div>
        ) : clip.videoUrl ? (
          <div className="relative bg-black rounded-lg overflow-hidden w-full aspect-video">
            <video
              key={clip.id}
              src={proxyUrl(clip)}
              controls
              playsInline
              preload="metadata"
              className="absolute inset-0 w-full h-full"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mb-4" />
            <p className="font-medium">{t('video.videoPreviewNotAvailable')}</p>
            <p className="text-sm mt-1">{t('video.clipMayStillProcessing')}</p>
          </div>
        )}

        {/* Stream status / loading indicator */}
        {streamLoading && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Loading video stream with audio...
            </span>
          </div>
        )}

        {/* Audio availability indicator for link_only clips */}
        {useYouTubeEmbed && ytInfo && streamUrl && !streamLoading && !useFallbackEmbed && (
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
            <Volume2 className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              Video loaded with audio. Use the player controls to watch the highlight.
            </span>
          </div>
        )}

        {/* Fallback to YouTube embed notice */}
        {useFallbackEmbed && (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <VolumeX className="h-4 w-4 text-yellow-500" />
            <span className="text-sm text-yellow-700 dark:text-yellow-300">
              Using YouTube embed (may not have audio due to browser autoplay policies).
              Click download to get a video with audio.
            </span>
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
      </DialogContent>
    </Dialog>
  );
}
