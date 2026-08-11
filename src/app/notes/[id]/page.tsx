'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Loader2,
  Youtube,
  Link2,
  Save,
  Download,
  Printer,
  Copy,
  ArrowLeft,
  Clock,
  Sparkles,
  Quote,
  Target,
  PlayCircle,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';

const VideoPlayer = dynamic(() => import('@/components/video-notes/video-player'), {
  ssr: false,
});
const CorePointsAnnotator = dynamic(
  () => import('@/components/video-notes/core-points-annotator'),
  { ssr: false, loading: () => null },
);
const SharePosterModal = dynamic(
  () => import('@/components/video-notes/share-poster-modal'),
  { ssr: false, loading: () => null },
);

type HighlightItem = {
  timestamp: string;
  startSeconds: number;
  text: string;
  level: 'critical' | 'important';
};

type CorePoint = {
  index: number;
  title: string;
  detail: string;
  sourceTimestamps?: string[];
  weight?: number;
};
type AnnotationColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple';
type CorePointAnnotation = {
  index: number;
  color?: AnnotationColor | null;
  note?: string;
};

type VideoNoteContent = {
  summary: string;
  highlights: HighlightItem[];
  takeaways: string[];
  corePoints: CorePoint[];
  annotations?: CorePointAnnotation[];
  hasTranscript?: boolean;
  totalDuration?: number;
};

type NoteDetail = {
  id: string;
  video_url: string;
  source_type: 'youtube' | 'bilibili' | 'local';
  video_title?: string;
  thumbnail_url?: string;
  content_json: VideoNoteContent;
  raw_markdown?: string;
  created_at: string;
};

export default function NoteDetailPage() {
  const params = useParams<{ id: string }>();
  const { user, accessToken, loading } = useAuth();
  const { t } = useLocale();
  const router = useRouter();

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeHighlightIndex, setActiveHighlightIndex] = useState<number | null>(null);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [annotations, setAnnotations] = useState<CorePointAnnotation[]>([]);
  const [posterOpen, setPosterOpen] = useState(false);

  const playerRef = useRef<{
    seekTo: (t: number, autoplay?: boolean) => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    playVideo: () => void;
    pauseVideo: () => void;
  } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && accessToken && params?.id) {
      fetchNote(params.id);
    }
  }, [user, accessToken, params?.id]);

  async function fetchNote(id: string) {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/video-notes/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          toast.error('Note not found');
          router.push('/notes');
          return;
        }
        throw new Error('Failed to load note');
      }
      const data = (await res.json()) as NoteDetail;
      if (!data.content_json.corePoints) data.content_json.corePoints = [];
      if (!data.content_json.annotations) data.content_json.annotations = [];
      setNote(data);
      setAnnotations(data.content_json.annotations);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load note');
    } finally {
      setIsLoading(false);
    }
  }

  const sourceVideoId = useMemo(() => {
    if (!note) return null;
    if (note.source_type === 'youtube') return getYoutubeId(note.video_url);
    if (note.source_type === 'bilibili') return getBilibiliId(note.video_url);
    return null;
  }, [note]);

  const sourceEmbedUrl = useMemo(() => {
    if (!note || !sourceVideoId) return null;
    if (note.source_type === 'youtube') {
      return `https://www.youtube.com/embed/${sourceVideoId}?enablejsapi=1&rel=0&modestbranding=1`;
    }
    if (note.source_type === 'bilibili') {
      return `https://player.bilibili.com/player.html?bvid=${sourceVideoId}&autoplay=0&high_quality=1&danmaku=0`;
    }
    return null;
  }, [note, sourceVideoId]);

  const handleJumpToHighlight = useCallback((index: number) => {
    if (!note) return;
    const h = note.content_json.highlights[index];
    if (!h) return;
    setActiveHighlightIndex(index);
    const sec = h.startSeconds ?? parseTimestampToSeconds(h.timestamp);
    if (playerRef.current) {
      playerRef.current.seekTo(sec, true);
      toast.success(`Playing at ${h.timestamp}`);
    }
  }, [note]);

  const handleJumpTimestamp = useCallback(
    (timestamp: string) => {
      const sec = parseTimestampToSeconds(timestamp);
      if (playerRef.current) {
        playerRef.current.seekTo(sec, true);
        toast.success(`Playing at ${timestamp}`);
      }
    },
    [],
  );

  const handleAnnotationChange = useCallback((next: CorePointAnnotation[]) => {
    setAnnotations(next);
  }, []);

  const handleDownloadMarkdown = useCallback(() => {
    if (!note) return;
    const md = note.raw_markdown || renderFromJson(note.content_json, note.video_title);
    downloadBlob(md, `${safeFilename(note.video_title) || 'video-note'}.md`, 'text/markdown');
  }, [note]);

  const handleDownloadText = useCallback(() => {
    if (!note) return;
    const txt = renderPlainText(note);
    downloadBlob(txt, `${safeFilename(note.video_title) || 'video-note'}.txt`, 'text/plain');
  }, [note]);

  const handleCopyMarkdown = useCallback(() => {
    if (!note) return;
    const md = note.raw_markdown || renderFromJson(note.content_json, note.video_title);
    navigator.clipboard.writeText(md).then(
      () => toast.success('Markdown copied'),
      () => toast.error('Copy failed'),
    );
  }, [note]);

  if (loading || isLoading || !note) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground mt-2">Loading note...</p>
      </div>
    );
  }

  const { content_json: content } = note;
  const totalDuration = playerDuration || content.totalDuration || estimateDuration(content.highlights);

  const tr = (key: string) => {
    const v = t(key);
    // fall back to key if no translation (since this page still has hard-coded en)
    return typeof v === 'string' ? v : key;
  };

  const corePointsAnnotator = (content.corePoints && content.corePoints.length > 0 && CorePointsAnnotator) ? (
    <CorePointsAnnotator
      corePoints={content.corePoints}
      annotations={annotations}
      onAnnotationChange={handleAnnotationChange}
      onJumpTimestamp={handleJumpTimestamp}
      t={tr}
      noteId={note.id}
      accessToken={accessToken}
      onSaved={() => {
        // optimistic refresh
        setNote((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            content_json: { ...prev.content_json, annotations },
          };
        });
        toast.success('Annotations saved');
      }}
    />
  ) : null;

  return (
    <div className="container mx-auto px-4 py-6 md:py-8">
      <div className="mx-auto max-w-7xl">
        {/* 顶部返回 */}
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/notes">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Notes
            </Link>
          </Button>
        </div>

        {/* 操作栏 */}
        <div className="bg-background border border-border rounded-xl shadow-sm overflow-hidden print:shadow-none print:border-0">
          <div className="px-4 md:px-6 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <SourceBadge sourceType={note.source_type} />
                <span className="text-xs text-muted-foreground truncate max-w-[40ch]">{note.video_url}</span>
              </div>
              <h1 className="font-semibold text-base truncate">
                📺 {note.video_title || 'Video Highlight Note'}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Saved: {new Date(note.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setPosterOpen(true)} title={tr('notes.sharePosterDesc')}>
                <Share2 className="h-3.5 w-3.5 mr-1.5" />
                Share
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopyMarkdown}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadMarkdown}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                .md
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadText}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                .txt
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                PDF
              </Button>
            </div>
          </div>

          {/* 主体 */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
            {/* 左：视频 + 时间轴 */}
            <div className="lg:col-span-3 p-4 md:p-5 border-b lg:border-b-0 lg:border-r border-border print:hidden">
              <div className="relative rounded-lg overflow-hidden bg-black aspect-video mb-4">
                {sourceEmbedUrl ? (
                  <VideoPlayer
                    embedUrl={sourceEmbedUrl}
                    videoId={sourceVideoId}
                    sourceType={note.source_type}
                    onReady={(api) => {
                      playerRef.current = api;
                    }}
                    onTimeUpdate={(t, d, playing) => {
                      setPlayerCurrentTime(t);
                      if (d > 0) setPlayerDuration(d);
                      setIsPlaying(playing);
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                    Video preview not available
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="font-mono">
                    {formatSeconds(playerCurrentTime)} / {formatSeconds(totalDuration)}
                  </span>
                  {isPlaying && (
                    <span className="inline-flex items-center gap-1 text-primary ml-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      Now playing
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <LegendItem colorClass="bg-red-500" label="Critical" />
                  <LegendItem colorClass="bg-amber-400" label="Important" />
                </div>
              </div>

              {content.highlights.length > 0 && (
                <HighlightTimeline
                  highlights={content.highlights}
                  totalDuration={totalDuration}
                  currentTime={playerCurrentTime}
                  activeIndex={activeHighlightIndex}
                  onJump={handleJumpToHighlight}
                />
              )}
            </div>

            {/* 右：笔记 */}
            <div className="lg:col-span-2 p-4 md:p-5 max-h-[75vh] overflow-y-auto print:max-h-none print:overflow-visible">
              {content.summary && (
                <section className="mb-5">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Overview
                  </h3>
                  <p className="text-sm leading-relaxed text-foreground/90">{content.summary}</p>
                </section>
              )}

              {content.highlights?.length > 0 && (
                <section className="mb-5">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" />
                    Highlights
                    <span className="text-xs text-muted-foreground/60 ml-1">({content.highlights.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {content.highlights.map((h, i) => (
                      <HighlightRow
                        key={`${h.timestamp}-${i}`}
                        item={h}
                        active={activeHighlightIndex === i}
                        onClick={() => handleJumpToHighlight(i)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {content.takeaways?.length > 0 && (
                <section className="mb-5">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Quote className="h-3.5 w-3.5" />
                    Quotes
                  </h3>
                  <div className="space-y-2">
                    {content.takeaways.map((q, i) => (
                      <div
                        key={i}
                        className="border-l-4 border-purple-400 bg-purple-50/50 dark:bg-purple-950/10 px-3 py-2 rounded-r"
                      >
                        <span className="text-sm leading-relaxed">{q}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 核心讲义要点（含颜色标注 & 笔记） */}
              {corePointsAnnotator}

              <div className="hidden print:block mt-8 pt-4 border-t text-xs text-muted-foreground">
                <p>Source: {note.video_url}</p>
                <p>Generated: {new Date(note.created_at).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 分享海报模态框 */}
        {SharePosterModal && (
          <SharePosterModal
            open={posterOpen}
            onClose={() => setPosterOpen(false)}
            videoTitle={note.video_title}
            sourceType={note.source_type}
            videoUrl={note.video_url}
            summary={content.summary}
            corePoints={content.corePoints || []}
            annotations={annotations}
            t={tr}
            shareUrl={typeof window !== 'undefined' ? window.location.href : ''}
          />
        )}
      </div>
    </div>
  );
}

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

function LegendItem({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${colorClass}`} />
      {label}
    </span>
  );
}

function HighlightTimeline({
  highlights,
  totalDuration,
  currentTime,
  activeIndex,
  onJump,
}: {
  highlights: HighlightItem[];
  totalDuration: number;
  currentTime: number;
  activeIndex: number | null;
  onJump: (index: number) => void;
}) {
  const progress = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  return (
    <div className="w-full">
      <div className="relative h-6 w-full group">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-muted rounded-full" />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 bg-primary rounded-full transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
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
              aria-label={`Play at ${h.timestamp}`}
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

function HighlightRow({
  item,
  active,
  onClick,
}: {
  item: HighlightItem;
  active: boolean;
  onClick: () => void;
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

// 工具函数
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

function renderFromJson(note: VideoNoteContent, title?: string): string {
  if (!note) return '';
  let md = `# ${title || 'Video Note'}\n\n`;
  if (note.summary) md += `## Summary\n\n${note.summary}\n\n`;
  if (note.highlights?.length) {
    md += `## Highlights\n\n`;
    note.highlights.forEach((h) => {
      const mark = h.level === 'critical' ? '🔴' : '🟡';
      md += `- ${mark} **[${h.timestamp}]** ${h.text}\n`;
    });
    md += '\n';
  }
  if (note.takeaways?.length) {
    md += `## Quotes\n\n`;
    note.takeaways.forEach((q) => (md += `- ${q}\n`));
  }
  return md;
}

function renderPlainText(note: NoteDetail): string {
  const content = note.content_json;
  let txt = `${note.video_title || 'Video Note'}\n`;
  txt += `Source: ${note.video_url}\n\n`;
  if (content.summary) txt += `== Summary ==\n\n${content.summary}\n\n`;
  if (content.highlights?.length) {
    txt += `== Highlights ==\n\n`;
    content.highlights.forEach((h) => {
      const mark = h.level === 'critical' ? '[Critical]' : '[Important]';
      txt += `• ${mark} [${h.timestamp}] ${h.text}\n`;
    });
    txt += '\n';
  }
  if (content.takeaways?.length) {
    txt += `== Quotes ==\n\n`;
    content.takeaways.forEach((q) => (txt += `• ${q}\n`));
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
