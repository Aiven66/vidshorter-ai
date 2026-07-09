import { getServerTranslation } from '@/lib/i18n/server';
import { HomeHero, HomeValueHighlights, HomeFeatures, HomeHowItWorks, HomeEditingShowcase, HomeFAQ } from '@/components/home/home-sections';
import ClientVideoProcessor from '@/components/home/client-video-processor';

export default async function HomePage() {
  const { t } = await getServerTranslation();

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
            <HomeFAQ t={t} />
          </div>
        </div>
      </section>
    </div>
  );
}
