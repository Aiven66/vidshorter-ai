'use client';

/**
 * AI 工具箱 — 四大浏览器端 AI 工具
 * 图片去水印(LaMa) / 视频去水印(ffmpeg delogo) / 图片超分(Swin2SR) / 黑白上色(Colorization)
 * 全部本地推理，图片视频不上传服务器
 */

import { Suspense, lazy, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/lib/locale-context';
import { Eraser, Video, Wand2, Palette, ShieldCheck } from 'lucide-react';

const ImageDewatermark = lazy(() =>
  import('@/components/ai-tools/image-dewatermark').then((m) => ({ default: m.ImageDewatermark }))
);
const VideoDewatermark = lazy(() =>
  import('@/components/ai-tools/video-dewatermark').then((m) => ({ default: m.VideoDewatermark }))
);
const ImageUpscale = lazy(() =>
  import('@/components/ai-tools/image-upscale').then((m) => ({ default: m.ImageUpscale }))
);
const ImageColorization = lazy(() =>
  import('@/components/ai-tools/image-colorization').then((m) => ({ default: m.ImageColorization }))
);

function ToolSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-10 w-48" />
    </div>
  );
}

export default function AIToolsPage() {
  const { t } = useLocale();
  const [tab, setTab] = useState('image-dewatermark');

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('aiTools.privacyBadge')}
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">{t('aiTools.title')}</h1>
        <p className="text-muted-foreground">{t('aiTools.subtitle')}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto mb-6">
          <TabsTrigger value="image-dewatermark" className="flex flex-col gap-1 py-2.5 sm:flex-row sm:gap-2">
            <Eraser className="h-4 w-4" />
            <span className="text-xs sm:text-sm">{t('aiTools.tabImageDewatermark')}</span>
          </TabsTrigger>
          <TabsTrigger value="video-dewatermark" className="flex flex-col gap-1 py-2.5 sm:flex-row sm:gap-2">
            <Video className="h-4 w-4" />
            <span className="text-xs sm:text-sm">{t('aiTools.tabVideoDewatermark')}</span>
          </TabsTrigger>
          <TabsTrigger value="image-upscale" className="flex flex-col gap-1 py-2.5 sm:flex-row sm:gap-2">
            <Wand2 className="h-4 w-4" />
            <span className="text-xs sm:text-sm">{t('aiTools.tabUpscale')}</span>
          </TabsTrigger>
          <TabsTrigger value="image-colorization" className="flex flex-col gap-1 py-2.5 sm:flex-row sm:gap-2">
            <Palette className="h-4 w-4" />
            <span className="text-xs sm:text-sm">{t('aiTools.tabColorize')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="image-dewatermark">
          <Suspense fallback={<ToolSkeleton />}>
            <ImageDewatermark />
          </Suspense>
        </TabsContent>
        <TabsContent value="video-dewatermark">
          <Suspense fallback={<ToolSkeleton />}>
            <VideoDewatermark />
          </Suspense>
        </TabsContent>
        <TabsContent value="image-upscale">
          <Suspense fallback={<ToolSkeleton />}>
            <ImageUpscale />
          </Suspense>
        </TabsContent>
        <TabsContent value="image-colorization">
          <Suspense fallback={<ToolSkeleton />}>
            <ImageColorization />
          </Suspense>
        </TabsContent>
      </Tabs>

      <p className="mt-8 text-xs text-muted-foreground">{t('aiTools.footerNote')}</p>
    </div>
  );
}
