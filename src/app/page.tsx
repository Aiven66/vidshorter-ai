'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { useCredits } from '@/lib/credits-context';
import {
  Video, Upload, Link2, Sparkles, Download, Play,
  Film, Scissors, Zap, ArrowRight, CheckCircle,
  AlertCircle, Loader2, Clock, Eye
} from 'lucide-react';
import Link from 'next/link';

/** Read AI config saved by admin panel */
function getAdminAiConfig() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('vidshorter_ai_config');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/* ── Types ─────────────────────────────────────── */

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

interface SSEData {
  stage: string;
  progress: number;
  message: string;
  data?: {
    highlights?: Array<{
      title: string;
      start_time: number;
      end_time: number;
      summary: string;
      engagement_score: number;
    }>;
    clips?: VideoClip[];
    clip?: VideoClip;
    clipIndex?: number;
    error?: boolean;
    frameCount?: number;
    estimatedDuration?: number;
    title?: string;
    recommendedClipCount?: number;
    totalHighlights?: number;
    clipOffset?: number;
    clipLimit?: number;
    nextOffset?: number;
    done?: boolean;
    jobId?: string;
    videoId?: string;
  };
}

/* ── Helpers ───────────────────────────────────── */

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isHttpVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

const STAGE_META: Record<string, { icon: typeof Video; label: string }> = {
  init:              { icon: Loader2,  label: 'Initializing...' },
  extract_frames:    { icon: Film,     label: 'Extracting video frames...' },
  frames_extracted:  { icon: Film,     label: 'Frames extracted successfully' },
  frames_unavailable:{ icon: Film,     label: 'Proceeding with analysis' },
  ai_analysis:       { icon: Sparkles, label: 'AI analyzing video content...' },
  analysis_complete:  { icon: Sparkles, label: 'Analysis complete' },
  generating_clip:   { icon: Scissors, label: 'Creating highlight clip...' },
  clip_ready:        { icon: CheckCircle, label: 'Highlight clip ready' },
  saving:            { icon: Loader2,  label: 'Saving results...' },
  complete:          { icon: CheckCircle, label: 'Processing complete!' },
  error:             { icon: AlertCircle, label: 'Error occurred' },
};

/* ── Demo history persistence ── */
const DEMO_VIDEOS_KEY = 'vidshorter_demo_videos';

function getDemoVideosKey(userId?: string): string {
  return userId ? `vidshorter_demo_videos_${userId}` : DEMO_VIDEOS_KEY;
}

function saveDemoVideoRecord(url: string, title: string | null, clips: VideoClip[], userId?: string) {
  try {
    const videoId = `video-${Date.now()}`;
    const key = getDemoVideosKey(userId);
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    const completedClips = clips.filter(c => c.status === 'completed' && c.videoUrl);
    const record = {
      id: videoId,
      original_url: url,
      source_type: url.includes('bilibili') || url.includes('b23.tv') ? 'bilibili' : url.includes('youtube') || url.includes('youtu.be') ? 'youtube' : 'url',
      title: title || null,
      status: completedClips.length > 0 ? 'completed' : 'failed',
      clips_count: completedClips.length,
      clips: completedClips, // ← include full clip data
      created_at: new Date().toISOString(),
    };
    const updated = [record, ...existing].slice(0, 50); // keep last 50
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {
    // ignore localStorage errors
  }
}

function mergeClips(prev: VideoClip[], next: VideoClip[]) {
  const map = new Map<string, VideoClip>();
  for (const clip of prev) map.set(clip.id, clip);
  for (const clip of next) map.set(clip.id, clip);
  return Array.from(map.values());
}

/* ── Component ─────────────────────────────────── */

export default function HomePage() {
  const { t } = useLocale();
  const { user, accessToken } = useAuth();
  const { balance, refreshCredits } = useCredits();

  // State
  const [videoUrl, setVideoUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<SSEData | null>(null);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewClip, setPreviewClip] = useState<VideoClip | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trimmedVideoUrl = videoUrl.trim();
  const completedClips = clips.filter(clip => clip.status === 'completed' && clip.videoUrl);

  /* ── Proxy URL builder ── */
  const proxyUrl = (clip: VideoClip, download = false) => {
    if (!clip || !clip.videoUrl) return '';
    
    // For Bilibili fallback, use a placeholder video
    if (clip.videoUrl.includes('bilibili-fallback')) {
      console.log('Bilibili fallback detected, using placeholder video');
      // Use a more reliable placeholder video URL
      return 'https://samplelib.com/preview/mp4/sample-5s.mp4';
    }

    if (clip.videoUrl.startsWith('data:')) {
      return clip.videoUrl;
    }
    
    // Handle local paths
    if (clip.videoUrl.startsWith('/')) {
      console.log('Local path detected:', clip.videoUrl);
      return clip.videoUrl;
    }
    
    // Handle external URLs
    console.log('External URL detected:', clip.videoUrl);
    const q = new URLSearchParams({
      url: clip.videoUrl,
      title: clip.title,
      ...(download ? { download: 'true' } : {}),
    });
    return `/api/video-proxy?${q.toString()}`;
  };

  /* ── Process video ── */
  const handleProcess = useCallback(async () => {
    if (!user) { window.location.href = '/login'; return; }
    if (!trimmedVideoUrl) { setError('Please enter a video URL'); return; }
    if (!isHttpVideoUrl(trimmedVideoUrl)) {
      setError('Please enter a valid public http(s) video URL.');
      return;
    }
    const latestBalance = await refreshCredits();
    if (latestBalance < 30) { setError('Insufficient credits. You need at least 30 credits.'); return; }

    setIsProcessing(true);
    setProgress({ stage: 'init', progress: 0, message: 'Starting...' });
    setClips([]);
    setError(null);

    try {
      let allHighlights: NonNullable<SSEData['data']>['highlights'] = [];
      let analysisDuration = 0;
      let analysisTitle: string | null = null;
      let jobId: string | null = null;
      let videoId: string | null = null;
      let nextOffset = 0;
      let done = false;
      let batchLimit = 3;
      const clipMap = new Map<string, VideoClip>();

      const runBatch = async (payload: Record<string, unknown>) => {
        const res = await fetch('/api/process-video', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done: readDone, value } = await reader.read();
          if (readDone) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const d: SSEData = JSON.parse(line.slice(6));
              setProgress(d);

              if (d.data?.jobId && !jobId) jobId = d.data.jobId;
              if (d.data?.videoId) videoId = d.data.videoId;
              if (d.data?.estimatedDuration) analysisDuration = d.data.estimatedDuration;
              if (typeof d.data?.title === 'string' && d.data.title.trim()) analysisTitle = d.data.title.trim();
              if (d.data?.highlights && d.data.highlights.length > 0) allHighlights = d.data.highlights;
              if (typeof d.data?.clipLimit === 'number' && d.data.clipLimit > 0) batchLimit = d.data.clipLimit;
              if (typeof d.data?.nextOffset === 'number') nextOffset = d.data.nextOffset;
              if (typeof d.data?.done === 'boolean') done = d.data.done;

              if (d.data?.clips) {
                for (const clip of d.data.clips) clipMap.set(clip.id, clip);
                setClips(prev => mergeClips(prev, d.data!.clips!));
              }
              if (d.data?.clip) {
                clipMap.set(d.data.clip.id, d.data.clip);
                setClips(prev => mergeClips(prev, [d.data!.clip!]));
              }
              if (d.data?.error) setError(d.message);
            } catch {}
          }
        }

        if (buf.startsWith('data: ')) {
          try {
            const d: SSEData = JSON.parse(buf.slice(6));
            setProgress(d);
            if (d.data?.jobId && !jobId) jobId = d.data.jobId;
            if (d.data?.videoId) videoId = d.data.videoId;
            if (d.data?.estimatedDuration) analysisDuration = d.data.estimatedDuration;
            if (typeof d.data?.title === 'string' && d.data.title.trim()) analysisTitle = d.data.title.trim();
            if (d.data?.highlights && d.data.highlights.length > 0) allHighlights = d.data.highlights;
            if (typeof d.data?.clipLimit === 'number' && d.data.clipLimit > 0) batchLimit = d.data.clipLimit;
            if (typeof d.data?.nextOffset === 'number') nextOffset = d.data.nextOffset;
            if (typeof d.data?.done === 'boolean') done = d.data.done;
            if (d.data?.clips) {
              for (const clip of d.data.clips) clipMap.set(clip.id, clip);
              setClips(prev => mergeClips(prev, d.data!.clips!));
            }
            if (d.data?.clip) {
              clipMap.set(d.data.clip.id, d.data.clip);
              setClips(prev => mergeClips(prev, [d.data!.clip!]));
            }
            if (d.data?.error) setError(d.message);
          } catch {}
        }
      };

      await runBatch({
        videoUrl: trimmedVideoUrl,
        userId: user.id,
        sourceType: 'url',
        aiConfig: getAdminAiConfig(),
      });

      while (!done && allHighlights && allHighlights.length > 0 && nextOffset < allHighlights.length) {
        await runBatch({
          videoUrl: trimmedVideoUrl,
          userId: user.id,
          sourceType: 'url',
          aiConfig: getAdminAiConfig(),
          highlights: allHighlights,
          duration: analysisDuration,
          title: analysisTitle,
          clipOffset: nextOffset,
          clipLimit: batchLimit,
          jobId,
          videoId,
        });
      }

      if (done) {
        const videoTitle = analysisTitle || null;
        saveDemoVideoRecord(trimmedVideoUrl, videoTitle, Array.from(clipMap.values()), user?.id);
      }
    } catch (err) {
      console.error('Processing error:', err);
      setError(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setIsProcessing(false);
    }
  }, [user, trimmedVideoUrl, accessToken, refreshCredits]);

  /* ── Download ── */
  const handleDownload = async (clip: VideoClip) => {
    if (!clip.videoUrl) return;
    setDownloadingId(clip.id);
    try {
      if (clip.videoUrl.startsWith('data:')) {
        const res = await fetch(clip.videoUrl);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${clip.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        return;
      }

      const url = proxyUrl(clip, true);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${clip.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error('Download error:', e);
      window.open(clip.videoUrl, '_blank');
    } finally {
      setDownloadingId(null);
    }
  };

  /* ── File upload (placeholder) ── */
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setError(`Local upload for "${f.name}" is not wired into the clipping pipeline yet. Please use a direct video URL for now.`);
    }
  };

  /* ── Stage icon & label ── */
  const stageMeta = STAGE_META[progress?.stage || 'init'] || STAGE_META.init;
  const StageIcon = stageMeta.icon;

  /* ── Render ── */
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/30 py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="outline" className="mb-6 px-4 py-1.5 text-sm">
              <Sparkles className="h-4 w-4 mr-2 text-primary" />
              AI-Powered Video Processing
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              {t('home.hero.title')}
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              {t('home.hero.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="text-lg px-8" asChild>
                <Link href={user ? '#process' : '/register'}>
                  {t('home.hero.cta')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8">
                <Play className="mr-2 h-5 w-5" />
                {t('home.hero.secondary')}
              </Button>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-32 h-96 w-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-32 h-96 w-96 bg-primary/5 rounded-full blur-3xl" />
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">{t('features.title')}</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { Icon: Sparkles, title: t('features.auto.title'), desc: t('features.auto.desc') },
              { Icon: Film, title: t('features.multi.title'), desc: t('features.multi.desc') },
              { Icon: Zap, title: t('features.quick.title'), desc: t('features.quick.desc') },
            ].map(({ Icon, title, desc }) => (
              <Card key={title} className="border-0 shadow-lg">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent><CardDescription className="text-base">{desc}</CardDescription></CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section id="process" className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <Card className="border-0 shadow-xl">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">{t('video.input.title')}</CardTitle>
                <CardDescription>
                  {user ? (
                    <span className="flex items-center justify-center gap-2 mt-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      {balance} {t('nav.credits')} available
                    </span>
                  ) : (
                    <span className="mt-2">
                      <Link href="/login" className="text-primary hover:underline">Sign in</Link> to start processing videos
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* URL input */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Paste a video URL (MP4, MOV, AVI...)"
                      value={videoUrl}
                      onChange={e => { setVideoUrl(e.target.value); setError(null); }}
                      className="pl-9"
                      disabled={isProcessing}
                    />
                  </div>
                  <Button
                    onClick={handleProcess}
                    disabled={!trimmedVideoUrl || isProcessing || !user}
                    className="gap-2 min-w-[140px]"
                  >
                    {isProcessing ? (
                      <><Scissors className="h-4 w-4 animate-spin" />Processing...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" />Analyze</>
                    )}
                  </Button>
                </div>

                {/* File upload (secondary) */}
                <div
                  className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                  <p className="text-sm text-muted-foreground">local upload is next; link-based clipping is available now</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={onFileChange}
                    disabled={isProcessing}
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="p-4 bg-destructive/10 rounded-lg flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-destructive">Error</p>
                      <p className="text-sm text-muted-foreground">{error}</p>
                    </div>
                  </div>
                )}

                {/* Progress */}
                {isProcessing && progress && (
                  <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                    <div className="flex items-center gap-3">
                      <StageIcon className={`h-5 w-5 text-primary ${progress.stage !== 'complete' && progress.stage !== 'error' ? 'animate-spin' : ''}`} />
                      <span className="font-medium text-sm flex-1">{progress.message}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{progress.progress}%</span>
                    </div>
                    <Progress value={progress.progress} className="h-2" />
                    <p className="text-xs text-muted-foreground">{stageMeta.label}</p>

                    {/* Live clip list while processing */}
                    {clips.length > 0 && (
                      <div className="mt-3 pt-3 border-t space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Clips being generated:</p>
                        {clips.map(c => (
                          <div key={c.id} className="flex items-center gap-2 text-xs">
                            {c.status === 'completed' ? (
                              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                            ) : c.status === 'failed' ? (
                              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                            ) : (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            )}
                            <span className="flex-1 truncate">{c.title}</span>
                            <span className="text-muted-foreground">{fmt(c.startTime)} - {fmt(c.endTime)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Results ── */}
            {clips.length > 0 && !isProcessing && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold">{t('video.results')}</h3>
                  <Badge variant="secondary">
                    {completedClips.length}/{clips.length} clips ready
                  </Badge>
                </div>
                <Card className="mb-6 border-border/60 bg-muted/20">
                  <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">AI has finished selecting the strongest moments from your source video.</p>
                      <p className="text-sm text-muted-foreground">Open any ready clip to preview it inline, or download the MP4 directly.</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">{completedClips.length} playable clips</Badge>
                      <Badge variant="outline">{clips.filter(clip => clip.status === 'failed').length} failed</Badge>
                    </div>
                  </CardContent>
                </Card>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {clips.map(clip => (
                    <Card key={clip.id} className="overflow-hidden group">
                      {/* Thumbnail */}
                      <div className="relative aspect-video bg-muted cursor-pointer" onClick={() => clip.status === 'completed' && setPreviewClip(clip)}>
                        {clip.thumbnailUrl ? (
                          <img src={clip.thumbnailUrl} alt={clip.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="h-10 w-10 text-muted-foreground/40" />
                          </div>
                        )}
                        {/* Hover play overlay */}
                        {clip.status === 'completed' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="h-14 w-14 rounded-full bg-white/90 flex items-center justify-center">
                              <Play className="h-7 w-7 text-primary ml-1" />
                            </div>
                          </div>
                        )}
                        {/* Duration badge */}
                        <Badge className="absolute bottom-2 right-2 text-xs">
                          <Clock className="h-3 w-3 mr-1" />{fmt(clip.duration)}
                        </Badge>
                        {/* Status */}
                        {clip.status === 'completed' && (
                          <Badge className="absolute top-2 left-2 bg-green-500 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />Ready
                          </Badge>
                        )}
                        {clip.status === 'failed' && (
                          <Badge className="absolute top-2 left-2 bg-destructive text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />Failed
                          </Badge>
                        )}
                      </div>

                      {/* Info */}
                      <CardContent className="pt-4 space-y-3">
                        <h4 className="font-semibold leading-tight">{clip.title}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-2">{clip.summary}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{fmt(clip.startTime)}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span>{fmt(clip.endTime)}</span>
                          <Badge variant="outline" className="ml-auto text-xs">
                            Score {clip.engagementScore}/10
                          </Badge>
                        </div>
                        {/* Actions */}
                        <div className="flex gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-1.5"
                            onClick={() => clip.status === 'completed' && setPreviewClip(clip)}
                            disabled={clip.status !== 'completed'}
                          >
                            <Eye className="h-4 w-4" />Preview
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 gap-1.5"
                            onClick={() => handleDownload(clip)}
                            disabled={clip.status !== 'completed' || downloadingId === clip.id}
                          >
                            {downloadingId === clip.id ? (
                              <><Loader2 className="h-4 w-4 animate-pulse" />Saving...</>
                            ) : (
                              <><Download className="h-4 w-4" />Download</>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { step: '1', title: 'Input Video', desc: 'Paste URL or upload your video', icon: Video },
              { step: '2', title: 'AI Analysis', desc: 'AI detects highlights automatically', icon: Sparkles },
              { step: '3', title: 'Generate Clips', desc: 'Short videos are created', icon: Scissors },
              { step: '4', title: 'Download', desc: 'Export and share anywhere', icon: Download },
            ].map(item => (
              <div key={item.step} className="text-center">
                <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Preview Dialog ── */}
      <Dialog open={!!previewClip} onOpenChange={() => setPreviewClip(null)}>
        <DialogContent className="max-w-4xl w-[92vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" />
              {previewClip?.title}
            </DialogTitle>
            <DialogDescription>{previewClip?.summary}</DialogDescription>
          </DialogHeader>

          {previewClip && previewClip.videoUrl ? (
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                key={previewClip.id}
                src={proxyUrl(previewClip)}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="w-full aspect-video"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mb-4" />
              <p className="font-medium">Video preview not available</p>
              <p className="text-sm mt-1">The clip may still be processing or failed to generate.</p>
            </div>
          )}

          {previewClip && (
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{fmt(previewClip.startTime)} - {fmt(previewClip.endTime)}</span>
                <Badge variant="outline">Score: {previewClip.engagementScore}/10</Badge>
              </div>
              {previewClip.videoUrl && (
                <Button
                  onClick={() => handleDownload(previewClip)}
                  disabled={downloadingId === previewClip.id}
                  className="gap-2"
                >
                  {downloadingId === previewClip.id ? (
                    <><Loader2 className="h-4 w-4 animate-pulse" />Saving...</>
                  ) : (
                    <><Download className="h-4 w-4" />Download</>
                  )}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
