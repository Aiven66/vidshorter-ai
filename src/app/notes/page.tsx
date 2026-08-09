'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
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

export default function NotesLibraryPage() {
  const { user, accessToken, loading } = useAuth();
  const { t } = useLocale();
  const router = useRouter();

  const [notes, setNotes] = useState<VideoNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    if (!confirm('Delete this note? This action cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/video-notes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      setNotes((prev) => prev.filter((n) => n.id !== id));
      toast.success('Note deleted');
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
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

  if (loading || isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground mt-2">Loading notes...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-2">
            <FileText className="h-3.5 w-3.5" />
            My Notes
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">Saved Video Notes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Access all your previously generated video highlight notes. Click any note to view.
          </p>
        </div>
        <Button asChild>
          <Link href="/video-notes">
            <Sparkles className="h-4 w-4 mr-2" />
            Generate New Note
          </Link>
        </Button>
      </div>

      {notes.length === 0 ? (
        <div className="bg-background border border-border rounded-xl p-12 text-center">
          <FileQuestion className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <p className="text-lg font-medium">No notes yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-6">
            Generate your first video highlight note to build your library.
          </p>
          <Button asChild>
            <Link href="/video-notes">
              <FileText className="h-4 w-4 mr-2" />
              Create Note
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={() => handleDelete(note.id)}
              onDownload={() => handleDownload(note)}
              deleting={deletingId === note.id}
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
}: {
  note: VideoNote;
  onDelete: () => void;
  onDownload: () => void;
  deleting: boolean;
}) {
  const content = note.content_json;
  const summary = content?.summary || '';
  const highlights = content?.highlights || [];
  const hasYoutube = note.source_type === 'youtube';

  const dateStr = new Date(note.created_at).toLocaleDateString(undefined, {
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
          {hasYoutube ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
              <Youtube className="h-3 w-3" /> YouTube
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
          {note.video_title || 'Untitled Note'}
        </h3>

        {summary && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {summary}
          </p>
        )}

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {highlights.filter((h: any) => h.level === 'critical').length} critical
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {highlights.filter((h: any) => h.level === 'important').length} important
          </span>
          <span className="inline-flex items-center gap-1">· {highlights.length} total</span>
        </div>

        <p className="text-[10px] text-muted-foreground mt-3 truncate">
          {note.video_url}
        </p>
      </Link>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onDownload} className="flex-1">
          <Download className="h-3.5 w-3.5 mr-1" />
          .md
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={note.video_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={deleting}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function renderFromJson(note: any, title?: string): string {
  if (!note) return '';
  let md = `# ${title || 'Video Note'}\n\n`;
  if (note.summary) md += `## Summary\n\n${note.summary}\n\n`;
  if (note.highlights?.length) {
    md += `## Highlights\n\n`;
    note.highlights.forEach((h: any) => {
      const mark = h.level === 'critical' ? '🔴' : '🟡';
      md += `- ${mark} **[${h.timestamp}]** ${h.text}\n`;
    });
    md += '\n';
  }
  if (note.takeaways?.length) {
    md += `## Quotes\n\n`;
    note.takeaways.forEach((q: string) => (md += `- ${q}\n`));
  }
  return md;
}

function safeFilename(name?: string): string {
  if (!name) return '';
  return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
}
