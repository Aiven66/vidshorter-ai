'use client';

import { ReactNode, useState, useEffect } from 'react';
import { useLocale } from '@/lib/locale-context';
import { HomeHero, HomeFeatures, HomeHowItWorks } from './home-sections';
import dynamic from 'next/dynamic';

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

export default function ClientHomeContent({
  heroSlot,
  featuresSlot,
  howItWorksSlot,
}: {
  heroSlot: ReactNode;
  featuresSlot: ReactNode;
  howItWorksSlot: ReactNode;
}) {
  const { t, locale } = useLocale();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const useClientRender = mounted && locale !== 'en';

  return (
    <>
      {useClientRender ? <HomeHero t={t} /> : heroSlot}
      <div style={{ minHeight: '420px' }}>
        <VideoProcessor />
      </div>
      {useClientRender ? <HomeFeatures t={t} /> : featuresSlot}
      {useClientRender ? <HomeHowItWorks t={t} /> : howItWorksSlot}
    </>
  );
}
