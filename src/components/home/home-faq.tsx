'use client';

import { useLocale } from '@/lib/locale-context';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { HelpCircle } from 'lucide-react';
import { HomeStartButton } from '@/components/home/home-start-button';

const faqItems = [
  { questionKey: 'home.faq.q1', answerKey: 'home.faq.a1' },
  { questionKey: 'home.faq.q2', answerKey: 'home.faq.a2' },
  { questionKey: 'home.faq.q3', answerKey: 'home.faq.a3' },
  { questionKey: 'home.faq.q4', answerKey: 'home.faq.a4' },
  { questionKey: 'home.faq.q5', answerKey: 'home.faq.a5' },
];

export default function HomeFAQ() {
  const { t } = useLocale();
  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 text-center">
            <Badge variant="outline" className="mb-4 px-4 py-1.5 text-sm">
              <HelpCircle className="mr-2 h-4 w-4 text-primary" />
              FAQ
            </Badge>
            <h2 className="text-2xl font-bold md:text-3xl">{t('home.faq.title')}</h2>
            <p className="mt-3 text-muted-foreground">{t('home.faq.subtitle')}</p>
          </div>
          <Accordion type="single" collapsible className="rounded-lg border bg-background px-4">
            {faqItems.map((item, index) => (
              <AccordionItem key={item.questionKey} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-base font-semibold">
                  {t(item.questionKey)}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {t(item.answerKey)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <HomeStartButton label={t('home.hero.startFree')} />
            <span className="text-sm text-muted-foreground">{t('home.hero.freeCredits')}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
