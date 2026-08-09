'use client';

import { useLocale } from '@/lib/locale-context';
import { Mic, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function PodcastPage() {
  const { t } = useLocale();

  return (
    <div className="container mx-auto px-4 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-6">
          <Mic className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-4">
          🎙️ {t('nav.podcast')}
        </h1>
        <p className="text-muted-foreground text-base md:text-lg mb-8">
          AI 驱动的播客合成功能正在开发中。即将推出：脚本撰写 → AI 多角色朗读 → 自动合成 Podcast 音频。
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm text-muted-foreground mb-8">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Coming Soon
        </div>
        <div>
          <Button asChild variant="outline">
            <Link href="/video-clips">
              返回高光剪辑
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
