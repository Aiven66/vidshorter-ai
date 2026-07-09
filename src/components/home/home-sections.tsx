'use client';

import { useLocale } from '@/lib/locale-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Film, Zap, Video, Scissors, Download, Play, UploadCloud, WandSparkles, Captions, ArrowRight, Gift, Link2, Clapperboard } from 'lucide-react';
import { HomeStartButton } from '@/components/home/home-start-button';

const features = [
  { Icon: Sparkles, titleKey: 'home.features.auto.title', descKey: 'home.features.auto.desc' },
  { Icon: Film, titleKey: 'home.features.multi.title', descKey: 'home.features.multi.desc' },
  { Icon: Zap, titleKey: 'home.features.quick.title', descKey: 'home.features.quick.desc' },
];

const valueHighlights = [
  { Icon: Link2, titleKey: 'home.highlights.bilibili.title', descKey: 'home.highlights.bilibili.desc' },
  { Icon: UploadCloud, titleKey: 'home.highlights.local.title', descKey: 'home.highlights.local.desc' },
  { Icon: WandSparkles, titleKey: 'home.highlights.ai.title', descKey: 'home.highlights.ai.desc' },
  { Icon: Clapperboard, titleKey: 'home.highlights.shorts.title', descKey: 'home.highlights.shorts.desc' },
];

const steps = [
  { step: '1', titleKey: 'home.howItWorks.step1.title', descKey: 'home.howItWorks.step1.desc', Icon: Video },
  { step: '2', titleKey: 'home.howItWorks.step2.title', descKey: 'home.howItWorks.step2.desc', Icon: Sparkles },
  { step: '3', titleKey: 'home.howItWorks.step3.title', descKey: 'home.howItWorks.step3.desc', Icon: Scissors },
  { step: '4', titleKey: 'home.howItWorks.step4.title', descKey: 'home.howItWorks.step4.desc', Icon: Download },
];

export function HomeHero() {
  const { t } = useLocale();
  return (
    <div className="mb-6 text-center">
        <Badge variant="outline" className="mb-4 px-4 py-1.5 text-sm">
          <Sparkles className="mr-2 h-4 w-4 text-primary" />
          {t('home.hero.badge')}
        </Badge>
        <h1 className="mx-auto mb-4 max-w-5xl text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
          {t('home.hero.title')}
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          {t('home.hero.subtitle')}
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <HomeStartButton label={t('home.hero.startFree')} />
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Gift className="h-4 w-4 text-primary" />
            {t('home.hero.freeCredits')}
          </div>
        </div>
      </div>
  );
}

export function HomeValueHighlights() {
  const { t } = useLocale();
  return (
    <section className="mb-10">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {valueHighlights.map(({ Icon, titleKey, descKey }) => (
          <div
            key={titleKey}
            className="rounded-lg border bg-background/85 p-4 shadow-sm transition-colors hover:bg-muted/30"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="mb-1 text-sm font-semibold">{t(titleKey)}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{t(descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomeEditingShowcase() {
  const { t } = useLocale();
  return (
    <section className="py-14">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold md:text-3xl">{t('home.visual.title')}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{t('home.visual.subtitle')}</p>
        </div>
        <div className="overflow-hidden rounded-lg border bg-background/90 shadow-lg">
          <div className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="relative min-h-[300px] bg-muted/35 p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
                    <Play className="h-4 w-4 fill-current" />
                  </span>
                  58:24 {t('home.visual.longVideo')}
                </div>
                <Badge variant="secondary" className="rounded-full">
                  <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                  URL / MP4
                </Badge>
              </div>

              <div className="aspect-video overflow-hidden rounded-lg border bg-gradient-to-br from-slate-950 via-slate-800 to-slate-700 p-4 text-white shadow-inner">
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-white/70">
                    <span>{t('home.visual.source')}</span>
                    <span>00:14:28</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 1, 2, 3].map((item) => (
                      <div key={item} className="h-16 rounded-lg bg-white/10 ring-1 ring-white/10">
                        <div className="h-full rounded-lg bg-gradient-to-br from-white/15 to-transparent" />
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs text-white/75">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      {t('home.visual.scanning')}
                    </div>
                    <div className="h-2 rounded-full bg-white/15">
                      <div className="h-2 w-2/3 animate-pulse rounded-full bg-emerald-400" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="h-2 rounded-full bg-muted-foreground/15">
                  <div className="h-2 w-4/5 rounded-full bg-foreground" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
                <div className="flex gap-1.5">
                  <span className="h-8 flex-1 rounded-md bg-primary/25" />
                  <span className="h-8 flex-1 rounded-md bg-chart-4/30" />
                  <span className="h-8 flex-1 rounded-md bg-chart-3/25" />
                </div>
              </div>
            </div>

            <div className="relative flex min-h-[300px] flex-col justify-center gap-4 p-5 sm:p-6">
              <div className="absolute right-6 top-6 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                3 {t('home.visual.clipsReady')}
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <WandSparkles className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{t('home.visual.engine')}</p>
                  <p className="text-xs text-muted-foreground">{t('home.visual.signals')}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="rounded-lg border bg-card p-2 shadow-sm">
                    <div className="mb-2 aspect-[9/16] rounded-lg bg-gradient-to-b from-foreground to-muted-foreground/70" />
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 w-3/4 rounded-full bg-primary" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                <Captions className="h-4 w-4 text-primary" />
                <span className="font-medium">{t('home.visual.exports')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeFeatures() {
  const { t } = useLocale();
  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl font-bold text-center mb-10">{t('home.features.title')}</h2>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map(({ Icon, titleKey, descKey }) => (
            <Card key={titleKey} className="border-0 shadow-lg">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>{t(titleKey)}</CardTitle>
              </CardHeader>
              <CardContent><CardDescription className="text-base">{t(descKey)}</CardDescription></CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomeHowItWorks() {
  const { t } = useLocale();
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl font-bold text-center mb-10">{t('home.howItWorks.title')}</h2>
        <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {steps.map(({ step, titleKey, descKey }) => (
            <div key={step} className="text-center">
              <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                {step}
              </div>
              <h3 className="font-semibold mb-2">{t(titleKey)}</h3>
              <p className="text-sm text-muted-foreground">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
