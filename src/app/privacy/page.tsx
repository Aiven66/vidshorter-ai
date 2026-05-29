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
        </div>
      </div>
    </div>
  );
}
