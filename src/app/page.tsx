'use client';

import { useLocale } from '@/lib/locale-context';
import { HomeHero, HomeFeatures, HomeHowItWorks } from '@/components/home/home-sections';
import ClientVideoProcessor from '@/components/home/client-video-processor';

export default function HomePage() {
  const { t } = useLocale();

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/30">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-chart-4/10 blur-3xl" />
        </div>
        <div className="container mx-auto px-4 py-12 md:py-20">
          <div className="mx-auto max-w-6xl">
            <HomeHero t={t} />
            <div className="mx-auto max-w-4xl">
            <ClientVideoProcessor />
            </div>
            <HomeFeatures t={t} />
            <HomeHowItWorks t={t} />
          </div>
        </div>
      </section>
    </div>
  );
}
