'use client';

import { useLocale } from '@/lib/locale-context';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrivacyPage() {
  const { t } = useLocale();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Button variant="ghost" asChild className="mb-6">
          <Link href="/" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t('common.cancel')}
          </Link>
        </Button>

        <h1 className="text-3xl font-bold mb-2">{t('privacy.title')}</h1>
        <p className="text-sm text-muted-foreground mb-8">{t('privacy.lastUpdated')}</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section1Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section1Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section2Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section2Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section3Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section3Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section4Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section4Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section5Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section5Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section6Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section6Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section7Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section7Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section8Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section8Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section9Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section9Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section10Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section10Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section11Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section11Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section12Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section12Content')}</p>
          </section>

          <section className="border-l-4 border-primary pl-4 py-2 bg-primary/5 rounded-r-lg">
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section13Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section13Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section14Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section14Content')}</p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-muted-foreground">
              <li className="leading-relaxed">{t('privacy.section14Item1')}</li>
              <li className="leading-relaxed">{t('privacy.section14Item2')}</li>
              <li className="leading-relaxed">{t('privacy.section14Item3')}</li>
              <li className="leading-relaxed">{t('privacy.section14Item4')}</li>
              <li className="leading-relaxed">{t('privacy.section14Item5')}</li>
              <li className="leading-relaxed font-semibold text-foreground">{t('privacy.section14Item6')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section15Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section15Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('privacy.section16Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('privacy.section16Content')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
