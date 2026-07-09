import { HomeHero, HomeValueHighlights, HomeFeatures, HomeHowItWorks, HomeEditingShowcase } from '@/components/home/home-sections';
import ClientVideoProcessor from '@/components/home/client-video-processor';
import ClientFAQ from '@/components/home/client-faq';
import { defaultLocale, useTranslation, flattenTranslations, commonTranslations } from '@/lib/i18n/index';

// Static English translations — computed at build time (no cookies() = static rendering)
const enTranslations = flattenTranslations(commonTranslations);
const t = useTranslation(defaultLocale, enTranslations);

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/30">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <div className="mx-auto max-w-6xl">
            <HomeHero t={t} />
            <div id="core-video-processor" className="mx-auto max-w-5xl scroll-mt-24">
              <ClientVideoProcessor />
            </div>
            <HomeValueHighlights t={t} />
            <HomeEditingShowcase t={t} />
            <HomeFeatures t={t} />
            <HomeHowItWorks t={t} />
            <ClientFAQ />
          </div>
        </div>
      </section>
    </div>
  );
}
