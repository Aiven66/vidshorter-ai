'use client';

/**
 * 我的笔记（视频高光笔记库）—— 可复用列表组件。
 *
 * 同一份 UI 同时服务两个入口：
 *   - `/notes` 页面（笔记库主页，带页面头部）
 *   - 控制台「我的笔记」页签（内嵌展示，方便在控制台直接查看 / 操作）
 *
 * 数据来自 `/api/video-notes`（同源 cookie + Bearer 身份）。
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FileText,
  Loader2,
  Youtube,
  ExternalLink,
  Trash2,
  Download,
  Clock,
  FileQuestion,
  Search,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';

type NoteHighlight = {
  timestamp?: string;
  text?: string;
  level?: string;
};

type NoteCorePoint = {
  index?: number;
  title?: string;
  detail?: string;
};

type NoteContent = {
  summary?: string;
  highlights?: NoteHighlight[];
  corePoints?: NoteCorePoint[];
  takeaways?: string[];
};

type VideoNote = {
  id: string;
  video_url: string;
  source_type: string;
  video_title?: string;
  thumbnail_url?: string;
  content_json?: NoteContent;
  raw_markdown?: string;
  created_at: string;
};

type FilterType = 'all' | 'youtube' | 'bilibili' | 'local';

export function NotesLibrary() {
  const { user, accessToken, loading } = useAuth();
  const { t, locale } = useLocale();

  const [notes, setNotes] = useState<VideoNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const tr = useCallback((key: string, vars?: Record<string, string | number>) => {
    let s = t(key);
    if (s === key) return key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(`{${k}}`, String(v));
      }
    }
    return s;
  }, [t]);

  const fetchNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/video-notes', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load notes');
      const data = await res.json();
      setNotes(data.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load notes');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (user && accessToken) {
      void fetchNotes();
    }
  }, [user, accessToken, fetchNotes]);

  async function handleDelete(id: string) {
    if (!confirm(tr('notes.libraryDeleteConfirm'))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/video-notes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(tr('notes.libraryDeleteFail'));
      setNotes((prev) => prev.filter((n) => n.id !== id));
      toast.success(tr('notes.libraryDeleted'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr('notes.libraryDeleteFail'));
    } finally {
      setDeletingId(null);
    }
  }

  function handleDownload(note: VideoNote) {
    const md = note.raw_markdown || renderFromJson(note.content_json, note.video_title);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFilename(note.video_title) || 'video-note'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const filteredNotes = useMemo(() => {
    let result = notes;
    if (filter !== 'all') {
      result = result.filter((n) => n.source_type === filter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          (n.video_title || '').toLowerCase().includes(q) ||
          (n.content_json?.summary || '').toLowerCase().includes(q) ||
          (n.video_url || '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [notes, filter, searchQuery]);

  const filterTabs: { key: FilterType; label: string }[] = [
    { key: 'all', label: tr('notes.libraryFilterAll') },
    { key: 'youtube', label: tr('notes.libraryFilterYouTube') },
    { key: 'bilibili', label: tr('notes.libraryFilterBilibili') },
    { key: 'local', label: tr('notes.libraryFilterLocal') },
  ];

  if (!loading && !user) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        {tr('notes.errorLoginRequired')}
      </div>
    );
  }

  if (loading || isLoading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        <p className="mt-2 text-sm text-muted-foreground">{tr('notes.libraryLoading')}</p>
      </div>
    );
  }

  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'zh-Hant' ? 'zh-TW' : 'en-US';

  return (
    <div>
      {/* 搜索 & 筛选 */}
      {notes.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr('notes.librarySearch')}
              className="h-9 pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center whitespace-nowrap text-xs text-muted-foreground">
            {tr('notes.libraryCount', { n: filteredNotes.length })}
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-12 text-center">
          <FileQuestion className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium">{tr('notes.libraryEmpty')}</p>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">{tr('notes.libraryEmptyHint')}</p>
          <Button asChild>
            <Link href="/video-notes">
              <FileText className="mr-2 h-4 w-4" />
              {tr('notes.libraryCreate')}
            </Link>
          </Button>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-12 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{`No results for "${searchQuery}"`}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={() => handleDelete(note.id)}
              onDownload={() => handleDownload(note)}
              deleting={deletingId === note.id}
              tr={tr}
              dateLocale={dateLocale}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  onDelete,
  onDownload,
  deleting,
  tr,
  dateLocale,
}: {
  note: VideoNote;
  onDelete: () => void;
  onDownload: () => void;
  deleting: boolean;
  tr: (key: string, vars?: Record<string, string | number>) => string;
  dateLocale: string;
}) {
  const content = note.content_json;
  const summary = content?.summary || '';
  const highlights = content?.highlights || [];
  const corePoints = content?.corePoints || [];
  const criticalCount = highlights.filter((h) => h.level === 'critical').length;
  const importantCount = highlights.filter((h) => h.level === 'important').length;
  const isYoutube = note.source_type === 'youtube';
  const isBilibili = note.source_type === 'bilibili';

  const dateStr = new Date(note.created_at).toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="group flex flex-col rounded-xl border border-border bg-background p-4 transition-shadow hover:shadow-md">
      <Link href={`/notes/${note.id}`} className="block flex-1 text-left">
        <div className="mb-2 flex items-center gap-2">
          {isYoutube ? (
            <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-950/30 dark:text-red-400">
              <Youtube className="h-3 w-3" /> YouTube
            </span>
          ) : isBilibili ? (
            <span className="inline-flex items-center gap-1 rounded bg-pink-50 px-1.5 py-0.5 text-[10px] font-medium text-pink-600 dark:bg-pink-950/30 dark:text-pink-400">
              <span className="h-1.5 w-1.5 rounded-full bg-pink-500" /> Bilibili
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {note.source_type.toUpperCase()}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {dateStr}
          </span>
        </div>

        <h3 className="mb-2 line-clamp-2 text-sm font-semibold">
          {note.video_title || tr('notes.libraryUntitled')}
        </h3>

        {summary && (
          <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{summary}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {highlights.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {criticalCount} {tr('notes.libraryCritical')}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                {importantCount} {tr('notes.libraryImportant')}
              </span>
            </>
          )}
          {corePoints.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3" />
              {corePoints.length} {tr('notes.libraryCorePoints')}
            </span>
          )}
        </div>
      </Link>

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={onDownload} className="h-8 flex-1">
          <Download className="mr-1 h-3.5 w-3.5" />
          .md
        </Button>
        <Button variant="ghost" size="sm" asChild className="h-8">
          <a href={note.video_url} target="_blank" rel="noopener noreferrer" aria-label="Open source video">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={deleting}
          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label="Delete note"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function renderFromJson(note: NoteContent | undefined, title?: string): string {
  if (!note) return '';
  let md = `# ${title || 'Video Note'}\n\n`;
  if (note.summary) md += `## Summary\n\n${note.summary}\n\n`;
  if (note.corePoints?.length) {
    md += `## Core Points\n\n`;
    note.corePoints.forEach((cp) => {
      md += `### ${cp.index}. ${cp.title}\n\n${cp.detail}\n\n`;
    });
  }
  if (note.highlights?.length) {
    md += `## Highlights\n\n`;
    note.highlights.forEach((h) => {
      const mark = h.level === 'critical' ? '🔴' : '🟡';
      md += `- ${mark} **[${h.timestamp}]** ${h.text}\n`;
    });
    md += '\n';
  }
  if (note.takeaways?.length) {
    md += `## Takeaways\n\n`;
    note.takeaways.forEach((q) => (md += `- ${q}\n`));
  }
  return md;
}

function safeFilename(name?: string): string {
  if (!name) return '';
  return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
}
