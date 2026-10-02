'use client';

import dynamic from 'next/dynamic';
import { useLocale } from '@/lib/locale-context';

const VideoProcessor = dynamic(
  () => import('@/components/home/video-processor'),
  {
    ssr: false,
    loading: () => (
      <div className="border-0 shadow-xl rounded-lg border bg-card text-card-foreground">
        <div className="text-center pb-2 p-6">
          <div className="h-6 bg-muted animate-pulse rounded w-48 mx-auto mb-2" />
          <div className="h-4 bg-muted animate-pulse rounded w-32 mx-auto" />
        </div>
        <div className="p-6 pt-0 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 h-10 bg-muted animate-pulse rounded" />
            <div className="h-10 w-[140px] bg-muted animate-pulse rounded" />
          </div>
        </div>
      </div>
    ),
  }
);

/**
 * 「YouTube Shorts 成片」——极简模式：
 * 只输入长视频链接，输出 9:16 竖屏高光成片（3 条 × ≤60s，含 AI 字幕）。
 * 复用现有高光管线（VideoProcessor variant="shorts"）。
 */
export default function ClientShortsProcessor() {
  const { t } = useLocale();
  return (
    <div style={{ minHeight: '420px' }}>
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('shorts.hero.title')}</h1>
        <p className="mt-3 text-sm text-muted-foreground md:text-base">{t('shorts.hero.subtitle')}</p>
      </div>
      <VideoProcessor variant="shorts" />
    </div>
  );
}