'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { useCredits } from '@/lib/credits-context';
import { useRouter } from 'next/navigation';
import { Textarea } from '@/components/ui/textarea';
import {
  CreditCard, Video, History, Settings, ArrowRight, Play, FileVideo,
  Download, ChevronDown, ChevronRight, Image as ImageIcon, Film, ExternalLink,
  Loader2, Gift, CheckCircle2, BarChart3, Search, RotateCcw, Layers, Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import {
  downloadYouTubeClip,
  downloadClipViaBrowser,
  extractYouTubeVideoId,
} from '@/lib/youtube-clip-download';
import { isAdminUser } from '@/lib/admin-gate';
import { InsufficientCreditsDialog } from '@/components/insufficient-credits-dialog';
import {
  getPublishMap, setPublishInfo, summarizePublish, type PublishInfo,
} from '@/lib/publish-tracker';
import { MarkPublishedDialog } from '@/components/mark-published-dialog';
import { DailyTasksCard } from '@/components/retention/daily-tasks-card';
import { trackEvent, trackCustomEvent, takeVisitGapDays, setAnalyticsUser, VIDEO_FUNNEL, LOCAL_EVENTS } from '@/lib/analytics';

const ReferralDialog = dynamic(
  () => import('@/components/referral-dialog').then(m => ({ default: m.ReferralDialog })),
  { ssr: false }
);

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
      const m = u.pathname.match(/\/(?:embed|shorts)\/([a-zA-Z0-9_-]{7,15})/);
      if (m) videoId = m[1];
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

interface VideoRecord {
  id: string;
  original_url: string;
  source_type: string;
  title: string | null;
  status: string;
  clips_count?: number;
  clips?: VideoClip[];
  created_at: string;
}

type DbShortVideoRow = {
  id: string;
  url: string;
  start_time: number | string;
  end_time: number | string;
  duration: number | string;
  highlight_title: string | null;
  highlight_summary: string | null;
  thumbnail_url: string | null;
};

type DbVideoRow = {
  id: string;
  original_url: string;
  source_type: string;
  title: string | null;
  status: string;
  created_at: string;
  short_videos?: DbShortVideoRow[];
};

// Demo video storage – keyed per user for isolation
function getDemoVideosKey(userId: string): string {
  return `clipop_demo_videos_${userId}`;
}

function getDemoVideos(userId: string): VideoRecord[] {
  if (typeof window === 'undefined') return [];
  const userKey = getDemoVideosKey(userId);
  const stored = localStorage.getItem(userKey);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      localStorage.removeItem(userKey);
      return [];
    }
  }
  const legacy = localStorage.getItem('clipop_demo_videos');
  if (!legacy) return [];
  try {
    return JSON.parse(legacy);
  } catch {
    localStorage.removeItem('clipop_demo_videos');
    return [];
  }
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// 播放/点赞等大数压缩显示：1200 → 1.2K，1500000 → 1.5M
function fmtCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.floor(n));
}

// 创作中心筛选：DB 的 pending 也归入「处理中」，避免进行中的作品在筛选下消失
function normalizeStatusForFilter(status: string): 'completed' | 'processing' | 'failed' {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  return 'processing';
}

/* ── Clip Video Player Dialog ── */
function ClipPlayerDialog({
  clip, open, onClose,
}: { clip: VideoClip | null; open: boolean; onClose: () => void }) {
    const { accessToken, user } = useAuth();
    const { plan } = useCredits();
    const { t } = useLocale();
  const [resolved, setResolved] = useState<string>('');
  const [resolving, setResolving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  // 导出即付费墙：免费用户导出时弹出升级引导
  const [exportPaywallOpen, setExportPaywallOpen] = useState(false);

  useEffect(() => {
    if (open) return;
    setResolved(prev => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return '';
    });
  }, [open]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!open || !clip) return;
      if (!clip.videoUrl) {
        setResolved('');
        return;
      }

      if (clip.videoUrl.startsWith('regenerate:')) {
        if (!accessToken) {
          setResolved('');
          return;
        }
        setResolving(true);
        try {
          const id = clip.videoUrl.slice('regenerate:'.length);
          const res = await fetch(`/api/short-video/${encodeURIComponent(id)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setResolved(prev => {
            if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
            return url;
          });
        } catch {
          if (!cancelled) setResolved('');
        } finally {
          if (!cancelled) setResolving(false);
        }
        return;
      }

      setResolved('');
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [open, clip?.id, clip?.videoUrl, accessToken]);

  if (!clip) return null;

  const resolveUrl = (c: VideoClip) => {
    if (!c.videoUrl) return '';
    if (c.videoUrl.includes('bilibili-fallback')) return 'https://samplelib.com/preview/mp4/sample-5s.mp4';
    if (c.videoUrl.startsWith('data:')) return c.videoUrl;
    if (c.videoUrl.startsWith('regenerate:')) return resolved;
    if (c.videoUrl.startsWith('/')) return c.videoUrl;
    if (c.videoUrl.startsWith('http://127.0.0.1') || c.videoUrl.startsWith('http://localhost')) return c.videoUrl;
    const q = new URLSearchParams({ url: c.videoUrl, title: c.title });
    return `/api/video-proxy?${q.toString()}`;
  };

  const downloadUrl = clip.videoUrl?.startsWith('data:')
    ? clip.videoUrl
    : clip.videoUrl?.startsWith('regenerate:')
      ? resolved
    : clip.videoUrl?.startsWith('/')
      ? clip.videoUrl
      : clip.videoUrl?.startsWith('http://127.0.0.1') || clip.videoUrl?.startsWith('http://localhost')
        ? clip.videoUrl
      : clip.videoUrl
        ? `/api/video-proxy?${new URLSearchParams({ url: clip.videoUrl, title: clip.title, download: 'true' })}`
        : '';

  // link_only clips：使用 YouTube IFrame embed 播放（参考 home 页面 preview-dialog.tsx）
  // 保存到 localStorage 时 data URL 被移除以避免超限，clips 变成 link_only 状态。
  // 数据库中的 clips 如果 url 是 youtu.be/youtube.com 也会被标记为 link_only。
  // IMPORTANT: Use clip.startTime (the actual highlight start), NOT ytInfo.startTime.
  // linkOnlyUrl is often just the original YouTube URL without a ?t= param,
  // so ytInfo.startTime would be 0 (video plays from the beginning).
  const useYouTubeEmbed = (clip.status === 'link_only' || clip.isFallback === true) && clip.linkOnlyUrl;
  const ytInfo = useYouTubeEmbed && clip.linkOnlyUrl ? parseYouTubeLink(clip.linkOnlyUrl) : null;
  const embedUrl = ytInfo ? buildYouTubeEmbedUrl(ytInfo.videoId, clip.startTime, clip.endTime) : '';

  // On-demand download for ALL YouTube clips (v50).
  // Strategy: use downloadClipViaBrowser which routes through /api/cut-clip
  // (server-side ffmpeg cut) to produce a standard progressive MP4 that
  // plays in ALL desktop players (QuickTime, VLC, Windows Media Player).
  //
  // v50 fix: previously, completed clips with videoUrl were downloaded directly,
  // but that videoUrl could be fMP4 (from MediaRecorder) or webm — unplayable
  // in desktop players. Now ALL YouTube clips go through server-side ffmpeg.
  const handleDownload = async () => {
    // 导出即付费墙：免费用户只能在线预览，导出前先弹升级引导（管理员豁免）
    if (plan === 'free' && !isAdminUser(user)) {
      setExportPaywallOpen(true);
      return;
    }
    // linkOnlyUrl first, videoUrl fallback — covers records where only the
    // youtu.be page URL was saved in videoUrl.
    const ytVideoId = extractYouTubeVideoId(clip.linkOnlyUrl) || extractYouTubeVideoId(clip.videoUrl || undefined);
    if (!ytVideoId) {
      if (clip.linkOnlyUrl) window.open(clip.linkOnlyUrl, '_blank');
      return;
    }
    setDownloading(true);
    setDownloadProgress('Preparing download (server-side ffmpeg cut)...');
    let success = false;
    try {
      await downloadClipViaBrowser({
        videoId: ytVideoId,
        startTime: clip.startTime,
        endTime: clip.endTime,
        title: clip.title,
        // P0 导出即付费墙：服务端据此门控
        exportPlan: plan,
        onProgress: (msg) => setDownloadProgress(msg),
      });
      success = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[Dashboard Download] Server cut failed:', msg);
      if (msg.includes('export_requires_paid')) {
        setExportPaywallOpen(true);
        setDownloading(false);
        setDownloadProgress(null);
        return;
      }
    }

    // Fallback 1: downloadYouTubeClip (alternative server path)
    if (!success) {
      setDownloadProgress('Trying alternative server path...');
      try {
        await downloadYouTubeClip({
          videoId: ytVideoId,
          startTime: clip.startTime,
          endTime: clip.endTime,
          title: clip.title,
          // P0 导出即付费墙：服务端据此门控
          exportPlan: plan,
          onProgress: (msg) => setDownloadProgress(msg),
        });
        success = true;
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        console.warn('[Dashboard Download] Fallback failed:', msg2);
        if (msg2.includes('export_requires_paid')) {
          setExportPaywallOpen(true);
          setDownloading(false);
          setDownloadProgress(null);
          return;
        }
      }
    }

    // Fallback 2: open YouTube embed
    if (!success) {
      setDownloadProgress('Opening highlight on YouTube...');
      const embedUrl = `https://www.youtube.com/embed/${ytVideoId}?start=${Math.floor(clip.startTime)}&end=${Math.floor(clip.endTime)}&autoplay=1`;
      window.open(embedUrl, '_blank');
    } else {
      // 留存引擎：导出任务以 clip_download 事件计数（与首页导出同一口径）
      trackEvent(VIDEO_FUNNEL.CLIP_DOWNLOAD, {
        userId: user?.id,
        userEmail: user?.email,
        data: { clip_id: clip.id, clip_title: clip.title, source: 'dashboard' },
      });
    }
    setDownloading(false);
    setTimeout(() => setDownloadProgress(null), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 min-w-0">
          <DialogTitle className="text-sm truncate">{clip.title}</DialogTitle>
        </DialogHeader>
        <div className="bg-black min-w-0 w-full overflow-hidden">
          {useYouTubeEmbed && ytInfo ? (
            <iframe
              key={`embed-${clip.id}-${ytInfo.startTime}`}
              src={embedUrl}
              title={clip.title}
              className="block w-full h-auto aspect-video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : clip.videoUrl && (!clip.videoUrl.startsWith('regenerate:') || !!resolved) ? (
            <video
              key={clip.id}
              controls
              autoPlay
              className="block w-full h-auto max-h-[50vh]"
              src={resolveUrl(clip)}
            >
              <source src={resolveUrl(clip)} type="video/mp4" />
            </video>
          ) : resolving ? (
            <div className="flex items-center justify-center h-48 text-white/40">
              <Film className="h-12 w-12" />
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-white/40">
              <Film className="h-12 w-12" />
            </div>
          )}
        </div>
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>{fmt(clip.startTime)} – {fmt(clip.endTime)} · {fmt(clip.duration)}</p>
            <p className="line-clamp-2">{clip.summary}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {useYouTubeEmbed && clip.linkOnlyUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={clip.linkOnlyUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />YouTube
                </a>
              </Button>
            )}
            {/* v50: YouTube clips always go through server-side ffmpeg cut */}
            {(() => {
              // linkOnlyUrl first, videoUrl fallback — a videoUrl holding a
              // youtu.be page URL must NOT be direct-downloaded via video-proxy
              // (it would save the YouTube HTML page as .mp4 — unplayable).
              const ytId = extractYouTubeVideoId(clip.linkOnlyUrl) || extractYouTubeVideoId(clip.videoUrl || undefined);
              if (ytId) {
                return (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownload}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-pulse" />{downloadProgress || t('common.saving')}</>
                    ) : (
                      <><Download className="h-4 w-4 mr-1" />{t('video.download')}</>
                    )}
                  </Button>
                );
              }
              // Non-YouTube clip (本地上传) — direct download，同样受导出即付费墙约束
              if (downloadUrl) {
                return (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (plan === 'free' && !isAdminUser(user)) {
                        setExportPaywallOpen(true);
                        return;
                      }
                      const a = document.createElement('a');
                      a.href = downloadUrl;
                      a.download = `${clip.title}.mp4`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" />{t('video.download')}
                  </Button>
                );
              }
              return null;
            })()}
          </div>
        </div>
      </DialogContent>

      {/* 导出即付费墙：免费用户导出拦截（订阅优先 + 积分包兜底） */}
      <InsufficientCreditsDialog
        open={exportPaywallOpen}
        onOpenChange={setExportPaywallOpen}
        reason="export"
      />
    </Dialog>
  );
}

/* ── Clip Thumbnail Card ── */
function ClipCard({ clip, onPlay, publish, onMarkPublished }: {
  clip: VideoClip;
  onPlay: () => void;
  publish?: PublishInfo;
  onMarkPublished?: () => void;
}) {
  const { t } = useLocale();
  const [imgErr, setImgErr] = useState(false);
  // link_only 或 isFallback 的 clip 使用 YouTube embed 播放（无本地 MP4）
  const isLinkOnly = clip.status === 'link_only' || clip.isFallback === true;
  return (
    <div className="relative group rounded-lg overflow-hidden bg-muted border cursor-pointer" onClick={(e) => { e.stopPropagation(); onPlay(); }}>
      {/* Thumbnail */}
      <div className="aspect-video relative">
        {clip.thumbnailUrl && !imgErr ? (
          <img
            src={clip.thumbnailUrl}
            alt={clip.title}
            className="w-full h-full object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="h-5 w-5 text-black ml-0.5" />
          </div>
        </div>
        {/* Duration badge */}
        <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
          {fmt(clip.duration)}
        </div>
        {/* Score badge */}
        <div className="absolute top-1.5 left-1.5 bg-primary/80 text-primary-foreground text-[10px] px-1.5 py-0.5 rounded">
          ★ {Math.round(clip.engagementScore * 100)}
        </div>
        {/* link_only 标识：右上角 YouTube 标签 */}
        {isLinkOnly && (
          <div className="absolute top-1.5 right-1.5 bg-red-600/90 text-white text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
            <ExternalLink className="h-2.5 w-2.5" />YouTube
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-medium truncate">{clip.title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{clip.summary}</p>
        {/* P1-2 发布标记：未发布可标记，已发布显示徽标 + 指标并可更新 */}
        {onMarkPublished && (
          publish ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <Badge variant="secondary" className="gap-0.5 px-1.5 py-0 text-[10px]">
                <CheckCircle2 className="h-2.5 w-2.5" />{t('dashboard.published')}
              </Badge>
              {(publish.views !== undefined || publish.likes !== undefined) && (
                <span className="truncate text-[10px] text-muted-foreground">
                  {publish.views !== undefined && `${fmtCompact(publish.views)} ${t('dashboard.metricViews').toLowerCase()}`}
                  {publish.views !== undefined && publish.likes !== undefined && ' · '}
                  {publish.likes !== undefined && `${fmtCompact(publish.likes)} ${t('dashboard.metricLikes').toLowerCase()}`}
                </span>
              )}
              <button
                type="button"
                className="ml-auto shrink-0 text-[10px] text-primary hover:underline"
                onClick={(e) => { e.stopPropagation(); onMarkPublished(); }}
              >
                {t('dashboard.updateMetrics')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="mt-1.5 text-[10px] text-primary hover:underline"
              onClick={(e) => { e.stopPropagation(); onMarkPublished(); }}
            >
              {t('dashboard.markPublished')}
            </button>
          )
        )}
      </div>
    </div>
  );
}

/* ── Video Record Row ── */
function VideoRecordRow({ video, formatDate, getStatusBadge, t, publishMap, onMarkPublished, selected, onToggleSelect, onRerun, onContinue }: {
  video: VideoRecord;
  formatDate: (s: string) => string;
  getStatusBadge: (s: string) => React.ReactNode;
  t: (key: string) => string;
  publishMap: Record<string, PublishInfo>;
  onMarkPublished: (clip: VideoClip) => void;
  selected?: boolean;
  onToggleSelect?: () => void;
  onRerun?: () => void;
  onContinue?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [playingClip, setPlayingClip] = useState<VideoClip | null>(null);
  const hasClips = (video.clips?.length ?? 0) > 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header row */}
      <div
        className={`flex items-center justify-between p-4 ${hasClips ? 'cursor-pointer hover:bg-muted/30 transition-colors' : ''}`}
        onClick={() => hasClips && setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* 批量选择：点击需阻止冒泡，否则会误触展开/收起 */}
          {onToggleSelect && (
            <div className="flex items-center pr-1" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={!!selected}
                onCheckedChange={() => onToggleSelect()}
                aria-label="select"
              />
            </div>
          )}
          {/* Thumbnail from first clip or placeholder */}
          <div className="h-12 w-20 bg-muted rounded overflow-hidden flex-shrink-0 relative">
            {video.clips?.[0]?.thumbnailUrl ? (
              <img
                src={video.clips[0].thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Video className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate max-w-sm">
              {video.title || video.original_url.split('/').pop() || t('dashboard.untitled')}
            </p>
            <p className="text-xs text-muted-foreground">
              {video.source_type.toUpperCase()} · {formatDate(video.created_at)}
            </p>
            <p className="text-[11px] text-muted-foreground truncate max-w-sm opacity-70">{video.original_url}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {/* 复跑：复用原链接走既有处理链路，不调用大模型 */}
          {onRerun && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs gap-1"
              title={t('creationCenter.rerunHint')}
              onClick={(e) => { e.stopPropagation(); onRerun(); }}
            >
              <RotateCcw className="h-3 w-3" />{t('creationCenter.rerun')}
            </Button>
          )}
          {/* 续作：仅 YouTube 来源，语义上「用同一来源再跑一次」 */}
          {onContinue && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs gap-1 text-primary"
              title={t('creationCenter.continueSeriesHint')}
              onClick={(e) => { e.stopPropagation(); onContinue(); }}
            >
              <Sparkles className="h-3 w-3" />{t('creationCenter.continueSeries')}
            </Button>
          )}
          {getStatusBadge(video.status)}
          {hasClips && (
            <Badge variant="outline" className="text-xs gap-1">
              <FileVideo className="h-3 w-3" />{video.clips!.length} {t('dashboard.clipsCount')}
            </Badge>
          )}
          {hasClips && (
            expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded clips grid */}
      {expanded && hasClips && (
        <div className="border-t bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground mb-3">
            {t('dashboard.clipsHint')} · {video.clips!.length} {t('dashboard.clipsCount')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {video.clips!.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                onPlay={() => setPlayingClip(clip)}
                publish={publishMap[clip.id]}
                onMarkPublished={() => onMarkPublished(clip)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Video player dialog */}
      <ClipPlayerDialog
        clip={playingClip}
        open={!!playingClip}
        onClose={() => setPlayingClip(null)}
      />
    </div>
  );
}

/* ── Dashboard Page ── */
export default function DashboardPage() {
  const { t, locale } = useLocale();
  const { user, accessToken, loading: authLoading } = useAuth();
  const { balance, plan, loading: creditsLoading } = useCredits();
  const router = useRouter();
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [isFromDesktop, setIsFromDesktop] = useState(false);
  // 邀请好友弹窗
  const [referralOpen, setReferralOpen] = useState(false);
  // P1-2 发布标记（localStorage，按 userId 隔离）
  const [publishMap, setPublishMap] = useState<Record<string, PublishInfo>>({});
  const [publishDialogClip, setPublishDialogClip] = useState<VideoClip | null>(null);

  // P0-2 创作中心：筛选 / 搜索 / 排序 / 批量选择与导出（纯客户端，基于已加载的 videos）
  const [sourceFilter, setSourceFilter] = useState<'all' | 'youtube' | 'bilibili' | 'upload'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'processing' | 'failed'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchExporting, setBatchExporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  // 批量导出为付费档权益：免费用户拦截后弹升级引导
  const [batchPaywallOpen, setBatchPaywallOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.id) setPublishMap(getPublishMap(user.id));
  }, [user?.id]);

  // 留存埋点：登录态回访间隔。首页 video-processor 只覆盖落地页，直接回到
  // dashboard 的老用户此前完全没有回访信号，导致 D1/D7/D30 与复访链路失真。
  useEffect(() => {
    if (authLoading || !user) return;
    setAnalyticsUser({ id: user.id, email: user.email });
    const gapDays = takeVisitGapDays();
    // 仅记「跨天回访」，同一天重复打开不再重复计数（首页已覆盖当日访问）
    if (gapDays !== null && gapDays >= 1) {
      trackCustomEvent(LOCAL_EVENTS.RETURN_VISIT, {
        gap_days: gapDays,
        returning: true,
        source: 'dashboard',
      });
    }
  }, [authLoading, user]);

  useEffect(() => {
    const check = () => {
      const fromDesktop = localStorage.getItem('clipop_desktop_login') === 'true';
      setIsFromDesktop(fromDesktop);
    };
    check();
  }, []);

  const handleReturnToDesktop = () => {
    try {
      window.location.href = 'clipop://auth/complete';
    } catch (e) {
      console.error('Failed to redirect to desktop app', e);
    }
  };

  useEffect(() => {
    if (user) {
      fetchVideos();
    }
  }, [user]);

  async function fetchVideos() {
    if (
      !isSupabaseConfigured() ||
      user?.id === 'demo-admin-id' ||
      user?.id?.startsWith('demo-') ||
      user?.id?.startsWith('google-demo-')
    ) {
      setVideos(getDemoVideos(user?.id || 'anonymous'));
      setVideosLoading(false);
      return;
    }

    if (!user?.id) {
      setVideos(getDemoVideos('anonymous'));
      setVideosLoading(false);
      return;
    }

    try {
      const { getSupabaseClient } = await import('@/storage/database/supabase-client');
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('videos')
        .select('*, short_videos(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      const rows = (data || []) as unknown as DbVideoRow[];
      const mapped: VideoRecord[] = rows.map((v) => {
        const clips: VideoClip[] = (v.short_videos || []).map((c) => {
          const url = typeof c.url === 'string' && c.url.startsWith('data-url:')
            ? `regenerate:${c.id}`
            : (c.url || null);
          return {
            id: c.id,
            title: c.highlight_title || t('dashboard.clip'),
            startTime: Number(c.start_time ?? 0),
            endTime: Number(c.end_time ?? 0),
            duration: Number(c.duration ?? 0),
            summary: c.highlight_summary || '',
            engagementScore: 0,
            thumbnailUrl: c.thumbnail_url || '',
            videoUrl: url,
            status: url ? (url.startsWith('https://youtu.be/') || url.startsWith('https://www.youtube.com/') ? 'link_only' : 'completed') : 'failed',
            linkOnlyUrl: url && (url.startsWith('https://youtu.be/') || url.startsWith('https://www.youtube.com/')) ? url : undefined,
          };
        });

        return {
          id: v.id,
          original_url: v.original_url,
          source_type: v.source_type,
          title: v.title || null,
          status: v.status,
          clips_count: clips.length,
          clips,
          created_at: v.created_at,
        };
      });
      setVideos(mapped);
    } catch (error) {
      console.warn('Videos fetch error, using demo mode');
      setVideos(getDemoVideos(user?.id || 'anonymous'));
    } finally {
      setVideosLoading(false);
    }
  }

  async function submitFeedback() {
    if (!user) return;
    const content = feedbackContent.trim();
    if (!content) return;

    setFeedbackSending(true);
    setFeedbackDone(false);
    setFeedbackError('');

    const useDemoMode =
      !isSupabaseConfigured()
      || user?.id === 'demo-admin-id'
      || user?.id?.startsWith('demo-')
      || user?.id?.startsWith('google-demo-')
      || !accessToken;

    try {
      if (useDemoMode) {
        const key = `clipop_demo_feedbacks_${user.id}`;
        const stored = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
        const list = stored ? JSON.parse(stored) : [];
        list.unshift({ id: `fb-${Date.now()}`, content, created_at: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(list));
      } else {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ content }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || t('dashboard.feedbackFailed'));
      }

      setFeedbackContent('');
      setFeedbackDone(true);
    } catch (e) {
      setFeedbackError(e instanceof Error ? e.message : t('dashboard.feedbackFailed'));
    } finally {
      setFeedbackSending(false);
    }
  }

  const formatDate = (dateString: string) => {
    const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'zh-Hant' ? 'zh-TW' : locale === 'en' ? 'en-US' : locale;
    return new Date(dateString).toLocaleDateString(dateLocale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pending:    { variant: 'secondary',    label: t('dashboard.statusPending') },
      processing: { variant: 'default',      label: t('dashboard.statusProcessing') },
      completed:  { variant: 'outline',      label: t('dashboard.statusCompleted') },
      failed:     { variant: 'destructive',  label: t('dashboard.statusFailed') },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const totalClips = videos.reduce((sum, v) => sum + (v.clips_count ?? v.clips?.length ?? 0), 0);

  // P1-2 发布汇总：仅统计当前作品库中实际存在的 clip
  const allClipIds = useMemo(
    () => videos.flatMap((v) => (v.clips ?? []).map((c) => c.id)),
    [videos],
  );
  const publishSummary = useMemo(
    () => summarizePublish(user?.id || '', allClipIds),
    [user?.id, allClipIds, publishMap],
  );

  const handlePublishSave = (clipId: string, info: PublishInfo) => {
    if (!user?.id) return;
    setPublishMap(setPublishInfo(user.id, clipId, info));
  };

  // P0-2 筛选 + 搜索 + 排序（全部在客户端基于已加载的 videos 计算）
  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return videos
      .filter((v) => sourceFilter === 'all' || v.source_type === sourceFilter)
      .filter((v) => statusFilter === 'all' || normalizeStatusForFilter(v.status) === statusFilter)
      .filter((v) => {
        if (!q) return true;
        return (v.title || '').toLowerCase().includes(q)
          || (v.original_url || '').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        return sortOrder === 'newest' ? tb - ta : ta - tb;
      });
  }, [videos, sourceFilter, statusFilter, searchQuery, sortOrder]);

  const selectedVideos = useMemo(
    () => videos.filter((v) => selectedIds.includes(v.id)),
    [videos, selectedIds],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  // 「全选当前筛选结果」：用筛选结果替换当前选择，避免选中被筛掉后仍然计数
  const selectAllFiltered = () => setSelectedIds(filteredVideos.map((v) => v.id));
  const clearSelection = () => setSelectedIds([]);

  // 复跑 / 续作：都复用「原链接 → 首页处理器」的既有约定 /video-clips?url=<encoded>
  // （video-clips/page.tsx 读取 searchParams.url 并透传给 processor，见该文件注释）
  const handleRerun = (video: VideoRecord) => {
    router.push(`/video-clips?url=${encodeURIComponent(video.original_url)}`);
  };

  // 批量导出：对每条选中记录取第一个「已完成且有可下载来源」的片段，串行复用既有导出链路
  const handleBatchExport = async () => {
    // 付费门控：批量导出仅面向非免费档（管理员豁免）
    if (plan === 'free' && !isAdminUser(user)) {
      setBatchPaywallOpen(true);
      return;
    }
    const jobs = selectedVideos
      .map((v) => ({
        clip: (v.clips ?? []).find((c) => c.status === 'completed' && (c.videoUrl || c.linkOnlyUrl)) ?? null,
      }))
      .filter((j): j is { clip: VideoClip } => j.clip !== null);
    if (jobs.length === 0) {
      setBatchResult(t('creationCenter.batchNothing'));
      return;
    }
    setBatchExporting(true);
    setBatchResult(null);
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < jobs.length; i++) {
      const clip = jobs[i].clip;
      setBatchProgress(
        t('creationCenter.batchProgress')
          .replace('{i}', String(i + 1))
          .replace('{n}', String(jobs.length)),
      );
      const ytId = extractYouTubeVideoId(clip.linkOnlyUrl) || extractYouTubeVideoId(clip.videoUrl || undefined);
      let success = false;
      if (ytId) {
        try {
          await downloadClipViaBrowser({
            videoId: ytId,
            startTime: clip.startTime,
            endTime: clip.endTime,
            title: clip.title,
            exportPlan: plan,
          });
          success = true;
        } catch {
          // 主链路失败 → 回退到既有备用导出函数
          try {
            await downloadYouTubeClip({
              videoId: ytId,
              startTime: clip.startTime,
              endTime: clip.endTime,
              title: clip.title,
              exportPlan: plan,
            });
            success = true;
          } catch {
            success = false;
          }
        }
      }
      if (success) {
        ok++;
        trackEvent(VIDEO_FUNNEL.CLIP_DOWNLOAD, {
          userId: user?.id,
          userEmail: user?.email,
          data: { clip_id: clip.id, clip_title: clip.title, source: 'dashboard_batch' },
        });
      } else {
        fail++;
      }
      // 串行 + 间隔，避免并发请求打爆服务端切片接口
      if (i < jobs.length - 1) await new Promise((r) => setTimeout(r, 800));
    }
    setBatchProgress(null);
    setBatchExporting(false);
    setBatchResult(
      t('creationCenter.batchDone')
        .replace('{ok}', String(ok))
        .replace('{fail}', String(fail)),
    );
  };

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          {isFromDesktop && (
            <div className="mb-4 p-4 border border-primary/30 bg-primary/5 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{t('dashboard.desktopLoginDetected')}</h3>
                  <p className="text-sm text-muted-foreground">{t('dashboard.desktopLoginHint')}</p>
                </div>
                <Button onClick={handleReturnToDesktop}>
                  {t('dashboard.returnToDesktop')}
                </Button>
              </div>
            </div>
          )}
          <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground">{t('dashboard.welcomeBack')}, {user.name || user.email}!</p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.credits')}</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{creditsLoading ? '...' : balance.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('dashboard.creditsReset')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.videosProcessed')}</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{videos.length}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('dashboard.videosProcessedDesc')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.clipsGenerated')}</CardTitle>
              <Film className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalClips}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('dashboard.clipsGeneratedDesc')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.currentPlan')}</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{user.role === 'admin' ? t('nav.admin') : t('pricing.free.title')}</div>
              <Button variant="link" className="p-0 h-auto text-xs" asChild>
                <Link href="/pricing">{t('dashboard.upgradePlan')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* 邀请好友卡片：双方各得 100 积分 */}
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 p-5">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Gift className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{t('referral.cardTitle')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('referral.cardDesc')}</p>
            </div>
            <Button onClick={() => setReferralOpen(true)} className="flex-shrink-0">
              <Gift className="h-4 w-4 mr-1.5" />
              {t('referral.cardCta')}
            </Button>
          </CardContent>
        </Card>

        {/* 每日创作任务：签到 + 生成 + 导出 → 领取奖励，维持连续创作 Streak */}
        <DailyTasksCard />

        {/* Main Content */}
        <Tabs defaultValue="history" className="space-y-6">
          <TabsList>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              {t('dashboard.history')}
              {videos.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 text-xs">{videos.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-2">
              <Video className="h-4 w-4" />
              {t('dashboard.processNewVideo')}
            </TabsTrigger>
            <TabsTrigger value="feedback" className="gap-2">
              <Settings className="h-4 w-4" />
              {t('dashboard.feedback')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>{t('creationCenter.title')}</CardTitle>
                <CardDescription>
                  {t('creationCenter.subtitle')}
                </CardDescription>
                {/* P1-2 发布汇总条 */}
                {publishSummary.published > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <BarChart3 className="h-3.5 w-3.5" />
                      {t('dashboard.published')} {publishSummary.published}
                    </span>
                    <span>{t('dashboard.totalViews')} {fmtCompact(publishSummary.views)}</span>
                    <span>{t('dashboard.totalLikes')} {fmtCompact(publishSummary.likes)}</span>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {videosLoading ? (
                  <p className="text-muted-foreground">{t('common.loading')}</p>
                ) : videos.length === 0 ? (
                  <div className="text-center py-12">
                    <FileVideo className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">{t('dashboard.noVideos')}</p>
                    <Button asChild>
                      <Link href="/#process">
                        {t('dashboard.startProcessing')}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* 筛选 / 搜索 / 排序工具条 */}
                    <div className="mb-4 space-y-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('creationCenter.searchPlaceholder')}
                            className="pl-8"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={sourceFilter}
                            onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
                            aria-label={t('creationCenter.filterSource')}
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                          >
                            <option value="all">{t('creationCenter.sourceAll')}</option>
                            <option value="youtube">{t('creationCenter.sourceYoutube')}</option>
                            <option value="bilibili">{t('creationCenter.sourceBilibili')}</option>
                            <option value="upload">{t('creationCenter.sourceUpload')}</option>
                          </select>
                          <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                            aria-label={t('creationCenter.filterStatus')}
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                          >
                            <option value="all">{t('creationCenter.statusAll')}</option>
                            <option value="completed">{t('creationCenter.statusCompleted')}</option>
                            <option value="processing">{t('creationCenter.statusProcessing')}</option>
                            <option value="failed">{t('creationCenter.statusFailed')}</option>
                          </select>
                          <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                            aria-label={t('creationCenter.sortLabel')}
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                          >
                            <option value="newest">{t('creationCenter.sortNewest')}</option>
                            <option value="oldest">{t('creationCenter.sortOldest')}</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {t('creationCenter.showingCount')
                            .replace('{shown}', String(filteredVideos.length))
                            .replace('{total}', String(videos.length))}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={selectAllFiltered}
                            disabled={filteredVideos.length === 0}
                          >
                            {t('creationCenter.selectAll')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={clearSelection}
                            disabled={selectedIds.length === 0}
                          >
                            {t('creationCenter.clearSelection')}
                          </Button>
                        </div>
                      </div>

                      {/* 选中 ≥1 时出现的批量操作条 */}
                      {selectedIds.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                          <span className="text-sm font-medium">
                            {t('creationCenter.selectedCount').replace('{n}', String(selectedIds.length))}
                            {plan === 'free' && !isAdminUser(user) && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                {t('creationCenter.batchExportFreeHint')}
                              </span>
                            )}
                          </span>
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={handleBatchExport}
                            disabled={batchExporting}
                          >
                            {batchExporting
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Layers className="h-4 w-4" />}
                            {t('creationCenter.batchExport')}
                          </Button>
                        </div>
                      )}

                      {/* 导出进度 / 结果反馈（不静默） */}
                      {(batchProgress || batchResult) && (
                        <p className="text-xs text-muted-foreground">
                          {batchProgress || batchResult}
                        </p>
                      )}
                    </div>

                    {filteredVideos.length === 0 ? (
                      <div className="text-center py-12">
                        <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">{t('creationCenter.emptyFiltered')}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t('creationCenter.emptyFilteredHint')}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredVideos.map((video) => (
                          <VideoRecordRow
                            key={video.id}
                            video={video}
                            formatDate={formatDate}
                            getStatusBadge={getStatusBadge}
                            t={t}
                            publishMap={publishMap}
                            onMarkPublished={setPublishDialogClip}
                            selected={selectedIds.includes(video.id)}
                            onToggleSelect={() => toggleSelect(video.id)}
                            onRerun={() => handleRerun(video)}
                            onContinue={video.source_type === 'youtube' ? () => handleRerun(video) : undefined}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="new">
            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.processNewVideo')}</CardTitle>
                <CardDescription>{t('dashboard.processNewVideoDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/#process">
                    {t('dashboard.goToProcessor')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.userFeedback')}</CardTitle>
                <CardDescription>{t('dashboard.feedbackDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={feedbackContent}
                  onChange={(e) => { setFeedbackContent(e.target.value); setFeedbackError(''); setFeedbackDone(false); }}
                  placeholder={t('dashboard.feedbackPlaceholder')}
                  disabled={feedbackSending}
                />
                {feedbackError && (
                  <p className="text-sm text-destructive">{feedbackError}</p>
                )}
                {feedbackDone && (
                  <p className="text-sm text-green-600">{t('dashboard.feedbackSubmitted')}</p>
                )}
                <Button
                  onClick={submitFeedback}
                  disabled={feedbackSending || !feedbackContent.trim()}
                >
                  {feedbackSending ? t('common.loading') : t('dashboard.submitFeedback')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* 邀请好友弹窗 */}
      <ReferralDialog open={referralOpen} onOpenChange={setReferralOpen} />

      {/* P1-2 发布标记 / 更新数据弹窗 */}
      <MarkPublishedDialog
        open={!!publishDialogClip}
        onOpenChange={(o) => { if (!o) setPublishDialogClip(null); }}
        initial={publishDialogClip ? (publishMap[publishDialogClip.id] ?? null) : null}
        onSave={(info) => {
          if (publishDialogClip) handlePublishSave(publishDialogClip.id, info);
        }}
      />

      {/* P0-2 批量导出付费门控：免费用户弹升级引导（订阅优先 + 积分包兜底） */}
      <InsufficientCreditsDialog
        open={batchPaywallOpen}
        onOpenChange={setBatchPaywallOpen}
        reason="export"
      />
    </div>
  );
}
