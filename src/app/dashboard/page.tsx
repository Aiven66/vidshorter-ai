'use client';

import { useState, useEffect } from 'react';
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
  Download, ChevronDown, ChevronRight, Image as ImageIcon, Film,
} from 'lucide-react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

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
  status: 'processing' | 'completed' | 'failed';
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
  return `vidshorter_demo_videos_${userId}`;
}

function getDemoVideos(userId: string): VideoRecord[] {
  if (typeof window === 'undefined') return [];
  const userKey = getDemoVideosKey(userId);
  const stored = localStorage.getItem(userKey);
  if (stored) return JSON.parse(stored);
  const legacy = localStorage.getItem('vidshorter_demo_videos');
  return legacy ? JSON.parse(legacy) : [];
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ── Clip Video Player Dialog ── */
function ClipPlayerDialog({
  clip, open, onClose,
}: { clip: VideoClip | null; open: boolean; onClose: () => void }) {
  const { accessToken } = useAuth();
  const [resolved, setResolved] = useState<string>('');
  const [resolving, setResolving] = useState(false);

  if (!clip) return null

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

  const resolveUrl = (c: VideoClip) => {
    if (!c.videoUrl) return '';
    if (c.videoUrl.includes('bilibili-fallback')) return 'https://samplelib.com/preview/mp4/sample-5s.mp4';
    if (c.videoUrl.startsWith('data:')) return c.videoUrl;
    if (c.videoUrl.startsWith('regenerate:')) return resolved;
    if (c.videoUrl.startsWith('/')) return c.videoUrl;
    const q = new URLSearchParams({ url: c.videoUrl, title: c.title });
    return `/api/video-proxy?${q.toString()}`;
  };

  const downloadUrl = clip.videoUrl?.startsWith('data:')
    ? clip.videoUrl
    : clip.videoUrl?.startsWith('regenerate:')
      ? resolved
    : clip.videoUrl?.startsWith('/')
      ? clip.videoUrl
      : clip.videoUrl
        ? `/api/video-proxy?${new URLSearchParams({ url: clip.videoUrl, title: clip.title, download: 'true' })}`
        : '';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-sm truncate">{clip.title}</DialogTitle>
        </DialogHeader>
        <div className="bg-black">
          {clip.videoUrl && (!clip.videoUrl.startsWith('regenerate:') || !!resolved) ? (
            <video
              key={clip.id}
              controls
              autoPlay
              className="w-full max-h-[50vh]"
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
          {downloadUrl && (
            <Button size="sm" variant="outline" asChild className="flex-shrink-0">
              <a href={downloadUrl} download={`${clip.title}.mp4`}>
                <Download className="h-4 w-4 mr-1" />Download
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Clip Thumbnail Card ── */
function ClipCard({ clip, onPlay }: { clip: VideoClip; onPlay: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div className="relative group rounded-lg overflow-hidden bg-muted border cursor-pointer" onClick={onPlay}>
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
      </div>
      <div className="p-2">
        <p className="text-xs font-medium truncate">{clip.title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{clip.summary}</p>
      </div>
    </div>
  );
}

/* ── Video Record Row ── */
function VideoRecordRow({ video, formatDate, getStatusBadge }: {
  video: VideoRecord;
  formatDate: (s: string) => string;
  getStatusBadge: (s: string) => React.ReactNode;
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
              {video.title || video.original_url.split('/').pop() || 'Untitled'}
            </p>
            <p className="text-xs text-muted-foreground">
              {video.source_type.toUpperCase()} · {formatDate(video.created_at)}
            </p>
            <p className="text-[11px] text-muted-foreground truncate max-w-sm opacity-70">{video.original_url}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {getStatusBadge(video.status)}
          {hasClips && (
            <Badge variant="outline" className="text-xs gap-1">
              <FileVideo className="h-3 w-3" />{video.clips!.length} 条高光
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
            点击任意片段可播放 · 共 {video.clips!.length} 条高光短视频
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {video.clips!.map((clip) => (
              <ClipCard key={clip.id} clip={clip} onPlay={() => setPlayingClip(clip)} />
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
  const { t } = useLocale();
  const { user, accessToken, loading: authLoading } = useAuth();
  const { balance, loading: creditsLoading } = useCredits();
  const router = useRouter();
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

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
        .limit(20);

      if (error) throw error;
      const rows = (data || []) as unknown as DbVideoRow[];
      const mapped: VideoRecord[] = rows.map((v) => {
        const clips: VideoClip[] = (v.short_videos || []).map((c) => {
          const url = typeof c.url === 'string' && c.url.startsWith('data-url:')
            ? `regenerate:${c.id}`
            : (c.url || null);
          return {
            id: c.id,
            title: c.highlight_title || 'Clip',
            startTime: Number(c.start_time ?? 0),
            endTime: Number(c.end_time ?? 0),
            duration: Number(c.duration ?? 0),
            summary: c.highlight_summary || '',
            engagementScore: 0,
            thumbnailUrl: c.thumbnail_url || '',
            videoUrl: url,
            status: url ? 'completed' : 'failed',
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
        const key = `vidshorter_demo_feedbacks_${user.id}`;
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
        if (!res.ok) throw new Error(data.error || 'Failed to submit feedback');
      }

      setFeedbackContent('');
      setFeedbackDone(true);
    } catch (e) {
      setFeedbackError(e instanceof Error ? e.message : 'Failed to submit feedback');
    } finally {
      setFeedbackSending(false);
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pending:    { variant: 'secondary',    label: '待处理' },
      processing: { variant: 'default',      label: '处理中' },
      completed:  { variant: 'outline',      label: '✓ 完成' },
      failed:     { variant: 'destructive',  label: '失败' },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const totalClips = videos.reduce((sum, v) => sum + (v.clips_count ?? v.clips?.length ?? 0), 0);

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
          <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground">Welcome back, {user.name || user.email}!</p>
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
              <p className="text-xs text-muted-foreground mt-1">{t('dashboard.credits.reset')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">已处理视频</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{videos.length}</div>
              <p className="text-xs text-muted-foreground mt-1">累计处理视频数</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">已生成高光片段</CardTitle>
              <Film className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalClips}</div>
              <p className="text-xs text-muted-foreground mt-1">累计高光短视频</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">当前套餐</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{user.role === 'admin' ? 'Admin' : 'Free'}</div>
              <Button variant="link" className="p-0 h-auto text-xs" asChild>
                <Link href="/pricing">升级套餐</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

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
              处理新视频
            </TabsTrigger>
            <TabsTrigger value="feedback" className="gap-2">
              <Settings className="h-4 w-4" />
              反馈
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.history')}</CardTitle>
                <CardDescription>
                  点击已完成的记录可展开查看高光短视频 · 点击片段可在线播放或下载
                </CardDescription>
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
                  <div className="space-y-3">
                    {videos.map((video) => (
                      <VideoRecordRow
                        key={video.id}
                        video={video}
                        formatDate={formatDate}
                        getStatusBadge={getStatusBadge}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="new">
            <Card>
              <CardHeader>
                <CardTitle>处理新视频</CardTitle>
                <CardDescription>前往首页处理新的长视频</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/#process">
                    前往视频处理器
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <CardTitle>用户反馈</CardTitle>
                <CardDescription>告诉我们你希望改进的功能或遇到的问题</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={feedbackContent}
                  onChange={(e) => { setFeedbackContent(e.target.value); setFeedbackError(''); setFeedbackDone(false); }}
                  placeholder="请输入你的反馈（建议、BUG、功能需求等）"
                  disabled={feedbackSending}
                />
                {feedbackError && (
                  <p className="text-sm text-destructive">{feedbackError}</p>
                )}
                {feedbackDone && (
                  <p className="text-sm text-green-600">已提交，感谢你的反馈！</p>
                )}
                <Button
                  onClick={submitFeedback}
                  disabled={feedbackSending || !feedbackContent.trim()}
                >
                  {feedbackSending ? t('common.loading') : '提交反馈'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
