import { flattenTranslations, commonTranslations } from '@/lib/i18n';
import { HomeHero, HomeFeatures, HomeHowItWorks } from '@/components/home/home-sections';
import ClientVideoProcessor from '@/components/home/client-video-processor';

const en = flattenTranslations(commonTranslations);
const defaultT = (key: string) => en[key] || key;

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/30">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-32 h-96 w-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-32 h-96 w-96 bg-primary/5 rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 py-12 md:py-20">
          <div className="max-w-4xl mx-auto">
            <HomeHero t={defaultT} />
            <ClientVideoProcessor />
            <HomeFeatures t={defaultT} />
            <HomeHowItWorks t={defaultT} />
          </div>
        </div>
      </section>
    </div>
  );
}
