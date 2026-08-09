import { HomeHero, HomeValueHighlights, HomeFeatures, HomeHowItWorks, HomeEditingShowcase } from '@/components/home/home-sections';
import ClientVideoProcessor from '@/components/home/client-video-processor';
import ClientFAQ from '@/components/home/client-faq';

export default function VideoClipsPage() {
  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/30">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <div className="mx-auto max-w-6xl">
            <HomeHero />
            <div id="core-video-processor" className="mx-auto max-w-5xl scroll-mt-24">
              <ClientVideoProcessor />
            </div>
            <HomeValueHighlights />
            <HomeEditingShowcase />
            <HomeFeatures />
            <HomeHowItWorks />
            <ClientFAQ />
          </div>
        </div>
      </section>
    </div>
  );
}
