'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Sparkles,
  FileQuestion,
  Search,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';

type VideoNote = {
  id: string;
  video_url: string;
  source_type: string;
  video_title?: string;
  thumbnail_url?: string;
  content_json?: any;
  raw_markdown?: string;
  created_at: string;
};

type FilterType = 'all' | 'youtube' | 'bilibili' | 'local';

export default function NotesLibraryPage() {
  const { user, accessToken, loading } = useAuth();
  const { t, locale } = useLocale();
  const router = useRouter();

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

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && accessToken) {
      fetchNotes();
    }
  }, [user, accessToken]);

  async function fetchNotes() {
    setIsLoading(true);
    try {
      const res = await fetch('/api/video-notes', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to load notes');
      const data = await res.json();
      setNotes(data.items || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load notes');
    } finally {
      setIsLoading(false);
    }
  }

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
    } catch (e: any) {
      toast.error(e.message || tr('notes.libraryDeleteFail'));
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

  if (loading || isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground mt-2">{tr('notes.libraryLoading')}</p>
      </div>
    );
  }

  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'zh-Hant' ? 'zh-TW' : 'en-US';

  return (
    <div className="container mx-auto px-4 py-6 md:py-8">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-2">
            <FileText className="h-3.5 w-3.5" />
            {tr('notes.libraryTitle')}
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">{tr('notes.libraryTitle')}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {tr('notes.librarySubtitle')}
          </p>
        </div>
        <Button asChild>
          <Link href="/video-notes">
            <Sparkles className="h-4 w-4 mr-2" />
            {tr('notes.libraryGenerate')}
          </Link>
        </Button>
      </div>

      {/* 搜索 & 筛选 */}
      {notes.length > 0 && (
        <div className="mb-5 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr('notes.librarySearch')}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filter === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground flex items-center whitespace-nowrap">
            {tr('notes.libraryCount', { n: filteredNotes.length })}
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="bg-background border border-border rounded-xl p-12 text-center">
          <FileQuestion className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <p className="text-lg font-medium">{tr('notes.libraryEmpty')}</p>
          <p className="text-sm text-muted-foreground mt-1 mb-6">
            {tr('notes.libraryEmptyHint')}
          </p>
          <Button asChild>
            <Link href="/video-notes">
              <FileText className="h-4 w-4 mr-2" />
              {tr('notes.libraryCreate')}
            </Link>
          </Button>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="bg-background border border-border rounded-xl p-12 text-center">
          <Search className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No results for "{searchQuery}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
  const criticalCount = highlights.filter((h: any) => h.level === 'critical').length;
  const importantCount = highlights.filter((h: any) => h.level === 'important').length;
  const isYoutube = note.source_type === 'youtube';
  const isBilibili = note.source_type === 'bilibili';

  const dateStr = new Date(note.created_at).toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="group bg-background border border-border rounded-xl p-4 hover:shadow-md transition-shadow flex flex-col">
      <Link
        href={`/notes/${note.id}`}
        className="block flex-1 text-left"
      >
        <div className="flex items-center gap-2 mb-2">
          {isYoutube ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
              <Youtube className="h-3 w-3" /> YouTube
            </span>
          ) : isBilibili ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500" /> Bilibili
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
              {note.source_type.toUpperCase()}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {dateStr}
          </span>
        </div>

        <h3 className="font-semibold text-sm line-clamp-2 mb-2">
          {note.video_title || tr('notes.libraryUntitled')}
        </h3>

        {summary && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {summary}
          </p>
        )}

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          {highlights.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {criticalCount} {tr('notes.libraryCritical')}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
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

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onDownload} className="flex-1 h-8">
          <Download className="h-3.5 w-3.5 mr-1" />
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
          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
          aria-label="Delete note"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function renderFromJson(note: any, title?: string): string {
  if (!note) return '';
  let md = `# ${title || 'Video Note'}\n\n`;
  if (note.summary) md += `## Summary\n\n${note.summary}\n\n`;
  if (note.corePoints?.length) {
    md += `## Core Points\n\n`;
    note.corePoints.forEach((cp: any) => {
      md += `### ${cp.index}. ${cp.title}\n\n${cp.detail}\n\n`;
    });
  }
  if (note.highlights?.length) {
    md += `## Highlights\n\n`;
    note.highlights.forEach((h: any) => {
      const mark = h.level === 'critical' ? '🔴' : '🟡';
      md += `- ${mark} **[${h.timestamp}]** ${h.text}\n`;
    });
    md += '\n';
  }
  if (note.takeaways?.length) {
    md += `## Takeaways\n\n`;
    note.takeaways.forEach((q: string) => (md += `- ${q}\n`));
  }
  return md;
}

function safeFilename(name?: string): string {
  if (!name) return '';
  return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
}
