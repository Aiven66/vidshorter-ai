'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { FileText, Sparkles } from 'lucide-react';
import { NotesLibrary } from '@/components/notes-library';

/**
 * 我的笔记 · 笔记库主页。
 *
 * 列表本身由可复用的 `NotesLibrary` 渲染（控制台「我的笔记」页签复用同一组件），
 * 本页只负责页面头部与登录重定向。
 */
export default function NotesLibraryPage() {
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  return (
    <div className="container mx-auto px-4 py-6 md:py-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <FileText className="h-3.5 w-3.5" />
            {t('notes.libraryTitle')}
          </div>
          <h1 className="text-2xl font-bold md:text-3xl">{t('notes.libraryTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('notes.librarySubtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/video-notes">
            <Sparkles className="mr-2 h-4 w-4" />
            {t('notes.libraryGenerate')}
          </Link>
        </Button>
      </div>

      <NotesLibrary />
    </div>
  );
}
