'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth-context';
import { useCredits } from '@/lib/credits-context';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FileText,
  Youtube,
  Link2,
  Loader2,
  Save,
  Download,
  Printer,
  Copy,
  RefreshCw,
  Lock,
  ChevronLeft,
  PlayCircle,
  Clock,
  Sparkles,
  Quote,
  Target,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

const VideoPlayer = dynamic(() => import('@/components/video-notes/video-player'), { ssr: false });

type HighlightLevel = 'critical' | 'important';

type HighlightItem = {
  timestamp: string;
  startSeconds: number;
  text: string;
  level: HighlightLevel;
};

type VideoNote = {
  summary: string;
  highlights: HighlightItem[];
  takeaways: string[];
  hasTranscript?: boolean;
  totalDuration?: number;
};

type GenerateResponse = {
  note: VideoNote;
  videoTitle?: string;
  videoUrl: string;
  sourceType: 'youtube' | 'bilibili' | 'local';
};

interface AiConfig {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  modelBaseUrl?: string;
  model?: string;
}

function detectSourceType(url: string): 'youtube' | 'bilibili' | 'local' | null {
  if (!url) return null;
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/bilibili\.com|b23\.tv/i.test(url)) return 'bilibili';
  if (/\.(mp4|mov|avi|webm|mkv)$/i.test(url)) return 'local';
  return null;
}

function getYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '').trim();
      return /^[a-zA-Z0-9_-]{7,15}$/.test(id) ? id : null;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{7,15}$/.test(v)) return v;
      const m = u.pathname.match(/\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{7,15})/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

function getBilibiliId(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
    if (m) return m[1];
    return null;
  } catch {
    return null;
  }
}

function parseTimestampToSeconds(ts: string): number {
  const m = ts.match(/^(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return 0;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const mi = parseInt(m[2], 10);
  const s = parseInt(m[3], 10);
  return h * 3600 + mi * 60 + s;
}

function formatSeconds(sec: number): string {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getAdminAiConfig(): AiConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('clipop_ai_config');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export default function VideoNotesPage() {
  const { user, accessToken } = useAuth();
  const { balance } = useCredits();
  const { t, locale } = useLocale();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [activeHighlightIndex, setActiveHighlightIndex] = useState<number | null>(null);
  const [activeTakeawayIndex, setActiveTakeawayIndex] = useState<number | null>(null);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const playerRef = useRef<{
    seekTo: (t: number, autoplay?: boolean) => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    playVideo: () => void;
    pauseVideo: () => void;
  } | null>(null);

  const NOTE_COST = 30;

  const tr = (key: string, vars?: Record<string, string | number>) => {
    let s = t(key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(`{${k}}`, String(v));
      }
    }
    return s;
  };

  const handleGenerate = useCallback(async () => {
    if (!user || !accessToken) {
      toast.error(tr('notes.errorLoginRequired'));
      return;
    }
    if (!url.trim()) {
      toast.error(tr('notes.errorEmptyUrl'));
      return;
    }
    const sourceType = detectSourceType(url);
    if (!sourceType) {
      toast.error(tr('notes.errorInvalidUrl'));
      return;
    }
    if (balance < NOTE_COST) {
      toast.error(tr('notes.errorInsufficientCredits', { n: NOTE_COST }));
      return;
    }
    setLoading(true);
    setResult(null);
    setSavedId(null);
    setActiveHighlightIndex(null);
    setActiveTakeawayIndex(null);
    try {
      const res = await fetch('/api/video-notes/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          url: url.trim(),
          aiConfig: getAdminAiConfig(),
          locale,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tr('notes.errorGenerateFailed'));
      }
      const data = (await res.json()) as GenerateResponse;
      setResult(data);
      toast.success(tr('notes.successGenerated'));
    } catch (e: any) {
      toast.error(e?.message || tr('notes.errorGenerateFailed'));
    } finally {
      setLoading(false);
    }
  }, [url, user, accessToken, balance, locale, t]);

  const handleSave = useCallback(async () => {
    if (!result || !accessToken) return;
    setSaving(true);
    try {
      const rawMarkdown = renderMarkdown(result, t);
      const res = await fetch('/api/video-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          videoUrl: result.videoUrl,
          sourceType: result.sourceType,
          videoTitle: result.videoTitle,
          contentJson: result.note,
          rawMarkdown,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tr('notes.errorSaveFailed'));
      }
      const data = await res.json();
      setSavedId(data.id);
      toast.success(tr('notes.successSaved'));
    } catch (e: any) {
      toast.error(e?.message || tr('notes.errorSaveFailed'));
    } finally {
      setSaving(false);
    }
  }, [result, accessToken, t]);

  const handleCopyMarkdown = useCallback(() => {
    if (!result) return;
    const md = renderMarkdown(result, t);
    navigator.clipboard.writeText(md).then(
      () => toast.success(tr('notes.successCopied')),
      () => toast.error(tr('notes.errorCopyFailed')),
    );
  }, [result, t]);

  const handleDownloadMarkdown = useCallback(() => {
    if (!result) return;
    const md = renderMarkdown(result, t);
    downloadBlob(md, `${safeFilename(result.videoTitle) || 'video-note'}.md`, 'text/markdown');
  }, [result, t]);

  const handleDownloadText = useCallback(() => {
    if (!result) return;
    const txt = renderPlainText(result, t);
    downloadBlob(txt, `${safeFilename(result.videoTitle) || 'video-note'}.txt`, 'text/plain');
  }, [result, t]);

  const handlePrintPDF = useCallback(() => {
    window.print();
  }, []);

  const handleJumpToHighlight = useCallback((index: number) => {
    if (!result) return;
    const h = result.note.highlights[index];
    if (!h) return;
    setActiveHighlightIndex(index);
    setActiveTakeawayIndex(null);
    const sec = h.startSeconds ?? parseTimestampToSeconds(h.timestamp);
    if (playerRef.current) {
      playerRef.current.seekTo(sec, true);
      toast.success(tr('notes.jumpToast', { t: h.timestamp }));
    }
  }, [result, t]);

  const handleJumpToTakeaway = useCallback((index: number) => {
    if (!result) return;
    // Find nearest highlight that is visually connected - we just highlight
    setActiveTakeawayIndex(index);
    setActiveHighlightIndex(null);
    // takeaways don't have timestamps; still scroll the list to it
    const el = document.getElementById(`takeaway-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [result]);

  const sourceVideoId = useMemo(() => {
    if (!result) return null;
    if (result.sourceType === 'youtube') return getYoutubeId(result.videoUrl);
    if (result.sourceType === 'bilibili') return getBilibiliId(result.videoUrl);
    return null;
  }, [result]);

  const sourceEmbedUrl = useMemo(() => {
    if (!result || !sourceVideoId) return null;
    if (result.sourceType === 'youtube') {
      return `https://www.youtube.com/embed/${sourceVideoId}?enablejsapi=1&rel=0&modestbranding=1`;
    }
    if (result.sourceType === 'bilibili') {
      return `https://player.bilibili.com/player.html?bvid=${sourceVideoId}&autoplay=0&high_quality=1&danmaku=0`;
    }
    return null;
  }, [result, sourceVideoId]);

  const totalDuration = useMemo(() => {
    if (playerDuration > 0) return playerDuration;
    return result?.note.totalDuration || 0;
  }, [playerDuration, result]);

  return (
    <div className="container mx-auto px-4 py-6 md:py-8">
      <div className="mx-auto max-w-7xl">
        {/* Hero */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-2">
            <FileText className="h-3.5 w-3.5" />
            {tr('notes.badge')}
          </div>
          <h1 className="text-xl md:text-2xl font-bold mb-1.5">
            {tr('notes.heroTitle')}
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            {tr('notes.heroSubtitle')}
          </p>
        </div>

        {/* 输入卡片 */}
        <div className="bg-background border border-border rounded-xl p-4 md:p-5 shadow-sm mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={tr('notes.placeholder')}
                className="pl-10 h-11"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !loading) handleGenerate();
                }}
                disabled={loading}
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={loading || !url.trim()}
              className="h-11 px-6"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {tr('notes.generating')}
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  {tr('notes.generate')}
                </>
              )}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Youtube className="h-3.5 w-3.5" />
              {tr('notes.supportYouTube')}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-pink-500" />
              {tr('notes.supportBilibili')}
            </span>
            <span>·</span>
            <span>{tr('notes.costPerUse', { n: NOTE_COST })}</span>
            <span>·</span>
            <span>{tr('notes.currentBalance', { n: balance })}</span>
          </div>

          {!user && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 text-xs">
              <Lock className="h-3.5 w-3.5" />
              {tr('notes.loginRequired')}
              <Link href="/login" className="font-medium underline">{tr('notes.loginLink')}</Link>
            </div>
          )}
        </div>

        {/* 加载中 */}
        {loading && !result && (
          <div className="bg-background border border-border rounded-xl p-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-sm text-muted-foreground">
              {tr('notes.analyzing')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{tr('notes.analyzingHint')}</p>
          </div>
        )}

        {/* 空状态 */}
        {!loading && !result && (
          <div className="text-center py-14 text-muted-foreground text-sm">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-base">{tr('notes.emptyTitle')}</p>
            <p className="text-xs mt-2">{tr('notes.emptyHint')}</p>
          </div>
        )}

        {/* 结果区：新 UI */}
        {result && (
          <NoteResultView
            result={result}
            saving={saving}
            savedId={savedId}
            onSave={handleSave}
            onCopyMarkdown={handleCopyMarkdown}
            onDownloadMarkdown={handleDownloadMarkdown}
            onDownloadText={handleDownloadText}
            onPrintPDF={handlePrintPDF}
            onRegenerate={handleGenerate}
            sourceEmbedUrl={sourceEmbedUrl}
            sourceVideoId={sourceVideoId}
            onPlayerReady={(api) => { playerRef.current = api; }}
            onTimeUpdate={(t, d, playing) => {
              setPlayerCurrentTime(t);
              if (d > 0) setPlayerDuration(d);
              setIsPlaying(playing);
            }}
            activeHighlightIndex={activeHighlightIndex}
            activeTakeawayIndex={activeTakeawayIndex}
            onJumpToHighlight={handleJumpToHighlight}
            onJumpToTakeaway={handleJumpToTakeaway}
            playerCurrentTime={playerCurrentTime}
            playerDuration={totalDuration}
            isPlaying={isPlaying}
            t={t}
            tr={tr}
          />
        )}
      </div>
    </div>
  );
}

// ==================== 结果视图 ====================
function NoteResultView({
  result,
  saving,
  savedId,
  onSave,
  onCopyMarkdown,
  onDownloadMarkdown,
  onDownloadText,
  onPrintPDF,
  onRegenerate,
  sourceEmbedUrl,
  sourceVideoId,
  onPlayerReady,
  onTimeUpdate,
  activeHighlightIndex,
  activeTakeawayIndex,
  onJumpToHighlight,
  onJumpToTakeaway,
  playerCurrentTime,
  playerDuration,
  isPlaying,
  t,
  tr,
}: {
  result: GenerateResponse;
  saving: boolean;
  savedId: string | null;
  onSave: () => void;
  onCopyMarkdown: () => void;
  onDownloadMarkdown: () => void;
  onDownloadText: () => void;
  onPrintPDF: () => void;
  onRegenerate: () => void;
  sourceEmbedUrl: string | null;
  sourceVideoId: string | null;
  onPlayerReady: (api: any) => void;
  onTimeUpdate: (t: number, duration: number, playing: boolean) => void;
  activeHighlightIndex: number | null;
  activeTakeawayIndex: number | null;
  onJumpToHighlight: (i: number) => void;
  onJumpToTakeaway: (i: number) => void;
  playerCurrentTime: number;
  playerDuration: number;
  isPlaying: boolean;
  t: (key: string) => string;
  tr: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const { note, videoTitle, videoUrl, sourceType } = result;

  return (
    <div className="bg-background border border-border rounded-xl shadow-sm overflow-hidden print:shadow-none print:border-0">
      {/* 顶部操作栏 */}
      <div className="px-4 md:px-6 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <SourceBadge sourceType={sourceType} />
            <span className="text-xs text-muted-foreground truncate max-w-[40ch]">{videoUrl}</span>
          </div>
          <h2 className="font-semibold text-base truncate">
            📺 {videoTitle || t('notes.noteTitle')}
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onCopyMarkdown}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            {t('notes.copyMarkdown')}
          </Button>
          <Button variant="outline" size="sm" onClick={onDownloadMarkdown}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            .md
          </Button>
          <Button variant="outline" size="sm" onClick={onDownloadText}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            .txt
          </Button>
          <Button variant="outline" size="sm" onClick={onPrintPDF}>
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            PDF
          </Button>
          {savedId ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/notes/${savedId}`}>
                {t('notes.viewSaved')}
              </Link>
            </Button>
          ) : (
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  {t('notes.saving')}
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {t('notes.saveToNotes')}
                </>
              )}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onRegenerate} title={t('notes.regenerate')}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 主体：视频 + 高光时间轴 + 笔记 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
        {/* 左：视频 + 时间轴 */}
        <div className="lg:col-span-3 p-4 md:p-5 border-b lg:border-b-0 lg:border-r border-border print:hidden">
          {/* 视频播放器 */}
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video mb-4">
            {sourceEmbedUrl ? (
              <VideoPlayer
                embedUrl={sourceEmbedUrl}
                videoId={sourceVideoId}
                sourceType={sourceType}
                onReady={onPlayerReady}
                onTimeUpdate={onTimeUpdate}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                {t('notes.emptyHint')}
              </div>
            )}
          </div>

          {/* 当前时间 / 时长 */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-mono">
                {formatSeconds(playerCurrentTime)} / {formatSeconds(playerDuration)}
              </span>
              {isPlaying && (
                <span className="inline-flex items-center gap-1 text-primary ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {t('notes.currentTime')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <LegendItem colorClass="bg-red-500" label={t('notes.colorCritical')} />
              <LegendItem colorClass="bg-amber-400" label={t('notes.colorImportant')} />
            </div>
          </div>

          {/* 高光时间轴 */}
          {note.highlights.length > 0 && (
            <HighlightTimeline
              highlights={note.highlights}
              totalDuration={playerDuration || note.totalDuration || estimateDuration(note.highlights)}
              currentTime={playerCurrentTime}
              activeIndex={activeHighlightIndex}
              onJump={onJumpToHighlight}
              t={t}
            />
          )}
        </div>

        {/* 右：笔记（带颜色标记） */}
        <div className="lg:col-span-2 p-4 md:p-5 max-h-[75vh] overflow-y-auto print:max-h-none print:overflow-visible">
          {/* 概述 */}
          {note.summary && (
            <section className="mb-5">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                {t('notes.sectionSummary')}
              </h3>
              <p className="text-sm leading-relaxed text-foreground/90">
                {note.summary}
              </p>
            </section>
          )}

          {/* 高光列表（颜色标记） */}
          {note.highlights?.length > 0 && (
            <section className="mb-5">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" />
                {t('notes.sectionHighlights')}
                <span className="text-xs text-muted-foreground/60 ml-1">({note.highlights.length})</span>
              </h3>
              <div className="space-y-2">
                {note.highlights.map((h, i) => (
                  <HighlightRow
                    key={`${h.timestamp}-${i}`}
                    item={h}
                    active={activeHighlightIndex === i}
                    onClick={() => onJumpToHighlight(i)}
                    onJumpLabel={t('notes.jump')}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 金句 / Takeaways */}
          {note.takeaways?.length > 0 && (
            <section className="mb-2">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Quote className="h-3.5 w-3.5" />
                {t('notes.sectionTakeaways')}
              </h3>
              <div className="space-y-2">
                {note.takeaways.map((quote, i) => (
                  <div
                    id={`takeaway-${i}`}
                    key={i}
                    className={
                      activeTakeawayIndex === i
                        ? 'border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-950/20 px-3 py-2 rounded-r transition-colors'
                        : 'border-l-4 border-purple-400 bg-purple-50/50 dark:bg-purple-950/10 px-3 py-2 rounded-r hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors cursor-pointer'
                    }
                    onClick={() => onJumpToTakeaway(i)}
                  >
                    <span className="text-sm leading-relaxed">{quote}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 打印时显示的元信息（只在打印时展示） */}
          <div className="hidden print:block mt-8 pt-4 border-t text-xs text-muted-foreground">
            <p>Source: {videoUrl}</p>
            <p>Generated: {new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${colorClass}`} />
      {label}
    </span>
  );
}

// ==================== 高光时间轴 ====================
function HighlightTimeline({
  highlights,
  totalDuration,
  currentTime,
  activeIndex,
  onJump,
  t,
}: {
  highlights: HighlightItem[];
  totalDuration: number;
  currentTime: number;
  activeIndex: number | null;
  onJump: (index: number) => void;
  t: (key: string) => string;
}) {
  const progress = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  return (
    <div className="w-full">
      {/* 轨道 */}
      <div className="relative h-6 w-full group">
        {/* 背景轨 */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-muted rounded-full" />
        {/* 当前进度 */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 bg-primary rounded-full transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
        {/* 节点 */}
        {highlights.map((h, i) => {
          const pct = totalDuration > 0
            ? (h.startSeconds / totalDuration) * 100
            : (i / Math.max(1, highlights.length - 1)) * 100;
          const isCritical = h.level === 'critical';
          const isActive = activeIndex === i;
          return (
            <button
              key={`${h.timestamp}-${i}`}
              onClick={() => onJump(i)}
              title={`${h.timestamp} · ${h.text}`}
              aria-label={t('notes.playAt', { t: h.timestamp })}
              className={
                'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white shadow-md transition-all hover:scale-125 ' +
                (isActive
                  ? (isCritical ? 'w-4 h-4 bg-red-500 ring-2 ring-red-500/40 ring-offset-1' : 'w-4 h-4 bg-amber-400 ring-2 ring-amber-400/40 ring-offset-1')
                  : (isCritical ? 'w-3.5 h-3.5 bg-red-500 hover:bg-red-600' : 'w-3.5 h-3.5 bg-amber-400 hover:bg-amber-500'))
              }
              style={{ left: `${Math.max(0, Math.min(100, pct))}%` }}
            />
          );
        })}
      </div>

      {/* 高光列表（带进度位置） */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-1.5">
        {highlights.map((h, i) => {
          const isCritical = h.level === 'critical';
          const isActive = activeIndex === i;
          return (
            <button
              key={`cell-${h.timestamp}-${i}`}
              onClick={() => onJump(i)}
              className={
                'text-left flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors border ' +
                (isActive
                  ? (isCritical
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-amber-400 text-amber-950 border-amber-400')
                  : (isCritical
                    ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 hover:bg-red-100'
                    : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100'))
              }
            >
              <span className="font-mono font-medium whitespace-nowrap">{h.timestamp}</span>
              <span className="truncate text-[11px] leading-tight opacity-90">{h.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 高光行（右侧笔记列表） ====================
function HighlightRow({
  item,
  active,
  onClick,
  onJumpLabel,
}: {
  item: HighlightItem;
  active: boolean;
  onClick: () => void;
  onJumpLabel: string;
}) {
  const isCritical = item.level === 'critical';
  return (
    <button
      onClick={onClick}
      className={
        'w-full text-left flex gap-2.5 px-3 py-2.5 rounded-md border transition-all group ' +
        (active
          ? (isCritical
            ? 'border-red-500 bg-red-50 dark:bg-red-950/30 shadow-sm'
            : 'border-amber-400 bg-amber-50 dark:bg-amber-950/20 shadow-sm')
          : (isCritical
            ? 'border-red-200/60 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/10 hover:border-red-400 hover:bg-red-50'
            : 'border-amber-200/60 dark:border-amber-900/30 bg-amber-50/40 dark:bg-amber-950/10 hover:border-amber-300 hover:bg-amber-50'))
      }
    >
      <div className="flex flex-col items-center shrink-0 pt-0.5">
        <span
          className={
            'inline-flex items-center gap-1 font-mono text-xs font-semibold px-1.5 py-0.5 rounded ' +
            (isCritical
              ? 'bg-red-500 text-white'
              : 'bg-amber-400 text-amber-950')
          }
        >
          {item.timestamp}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={
          'text-sm leading-relaxed ' +
          (isCritical ? 'text-red-900 dark:text-red-100' : 'text-foreground')
        }>
          {item.text}
        </p>
      </div>
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <PlayCircle className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}

// ==================== 辅助组件 ====================
function SourceBadge({ sourceType }: { sourceType: 'youtube' | 'bilibili' | 'local' }) {
  if (sourceType === 'youtube') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
        <Youtube className="h-3 w-3" /> YouTube
      </span>
    );
  }
  if (sourceType === 'bilibili') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400">
        <span className="w-1.5 h-1.5 rounded-full bg-pink-500" /> Bilibili
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
      Local
    </span>
  );
}

// ==================== 工具函数 ====================
function renderMarkdown(result: GenerateResponse, t: (key: string) => string): string {
  const { note, videoTitle, videoUrl } = result;
  let md = `# ${videoTitle || t('notes.noteTitle')}\n\n`;
  md += `> Source: ${videoUrl}\n\n`;
  if (note.summary) {
    md += `## ${t('notes.sectionSummary')}\n\n${note.summary}\n\n`;
  }
  if (note.highlights?.length) {
    md += `## ${t('notes.sectionHighlights')}\n\n`;
    note.highlights.forEach((h) => {
      const mark = h.level === 'critical' ? '🔴' : '🟡';
      md += `- ${mark} **[${h.timestamp}]** ${h.text}\n`;
    });
    md += `\n`;
  }
  if (note.takeaways?.length) {
    md += `## ${t('notes.sectionTakeaways')}\n\n`;
    note.takeaways.forEach((q) => {
      md += `- 🔴 ${q}\n`;
    });
  }
  return md;
}

function renderPlainText(result: GenerateResponse, t: (key: string) => string): string {
  const { note, videoTitle, videoUrl } = result;
  let txt = `${videoTitle || t('notes.noteTitle')}\n`;
  txt += `Source: ${videoUrl}\n\n`;
  if (note.summary) {
    txt += `== ${t('notes.sectionSummary')} ==\n\n${note.summary}\n\n`;
  }
  if (note.highlights?.length) {
    txt += `== ${t('notes.sectionHighlights')} ==\n\n`;
    note.highlights.forEach((h) => {
      const mark = h.level === 'critical' ? '[Critical]' : '[Important]';
      txt += `• ${mark} [${h.timestamp}] ${h.text}\n`;
    });
    txt += `\n`;
  }
  if (note.takeaways?.length) {
    txt += `== ${t('notes.sectionTakeaways')} ==\n\n`;
    note.takeaways.forEach((q) => {
      txt += `• ${q}\n`;
    });
  }
  return txt;
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeFilename(name?: string): string {
  if (!name) return '';
  return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
}

function estimateDuration(highlights: HighlightItem[]): number {
  if (highlights.length === 0) return 0;
  const last = highlights[highlights.length - 1];
  return last.startSeconds + 10;
}
