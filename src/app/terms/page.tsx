'use client';

import { useLocale } from '@/lib/locale-context';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TermsPage() {
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

        <h1 className="text-3xl font-bold mb-2">{t('terms.title')}</h1>
        <p className="text-sm text-muted-foreground mb-8">{t('terms.lastUpdated')}</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">{t('terms.section1Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('terms.section1Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('terms.section2Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('terms.section2Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('terms.section3Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('terms.section3Content')}</p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-muted-foreground">
              <li className="leading-relaxed">{t('terms.section3Item1')}</li>
              <li className="leading-relaxed font-semibold text-foreground">{t('terms.section3Item2')}</li>
              <li className="leading-relaxed font-semibold text-foreground">{t('terms.section3Item3')}</li>
              <li className="leading-relaxed">{t('terms.section3Item4')}</li>
            </ul>
          </section>

          <section className="border-l-4 border-primary pl-4 py-2 bg-primary/5 rounded-r-lg">
            <h2 className="text-xl font-semibold mb-3">{t('terms.section4Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('terms.section4Content')}</p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-muted-foreground">
              <li className="leading-relaxed font-semibold text-foreground">{t('terms.section4Item1')}</li>
              <li className="leading-relaxed font-semibold text-foreground">{t('terms.section4Item2')}</li>
              <li className="leading-relaxed">{t('terms.section4Item3')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('terms.section5Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('terms.section5Content')}</p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-muted-foreground">
              <li className="leading-relaxed font-semibold text-foreground">{t('terms.section5Item1')}</li>
              <li className="leading-relaxed font-semibold text-foreground">{t('terms.section5Item2')}</li>
              <li className="leading-relaxed">{t('terms.section5Item3')}</li>
              <li className="leading-relaxed">{t('terms.section5Item4')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('terms.section6Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('terms.section6Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('terms.section7Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('terms.section7Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('terms.section8Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('terms.section8Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('terms.section9Title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('terms.section9Content')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
