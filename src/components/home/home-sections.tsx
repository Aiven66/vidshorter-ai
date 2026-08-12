'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Film, Zap, Video, Scissors, Download, Play, UploadCloud, WandSparkles, Captions, ArrowRight, Gift, Link2, Clapperboard } from 'lucide-react';
import { HomeStartButton } from '@/components/home/home-start-button';
import { useLocale } from '@/lib/locale-context';

const features = [
  { Icon: Sparkles, titleKey: 'home.features.auto.title', descKey: 'home.features.auto.desc', color: '#667eea' },
  { Icon: Film, titleKey: 'home.features.multi.title', descKey: 'home.features.multi.desc', color: '#764ba2' },
  { Icon: Zap, titleKey: 'home.features.quick.title', descKey: 'home.features.quick.desc', color: '#f093fb' },
];

const valueHighlights = [
  { Icon: Link2, titleKey: 'home.highlights.bilibili.title', descKey: 'home.highlights.bilibili.desc', color: '#667eea' },
  { Icon: UploadCloud, titleKey: 'home.highlights.local.title', descKey: 'home.highlights.local.desc', color: '#764ba2' },
  { Icon: WandSparkles, titleKey: 'home.highlights.ai.title', descKey: 'home.highlights.ai.desc', color: '#f093fb' },
  { Icon: Clapperboard, titleKey: 'home.highlights.shorts.title', descKey: 'home.highlights.shorts.desc', color: '#4facfe' },
];

const steps = [
  { step: '1', titleKey: 'home.howItWorks.step1.title', descKey: 'home.howItWorks.step1.desc', Icon: Video, color: '#667eea' },
  { step: '2', titleKey: 'home.howItWorks.step2.title', descKey: 'home.howItWorks.step2.desc', Icon: Sparkles, color: '#764ba2' },
  { step: '3', titleKey: 'home.howItWorks.step3.title', descKey: 'home.howItWorks.step3.desc', Icon: Scissors, color: '#f093fb' },
  { step: '4', titleKey: 'home.howItWorks.step4.title', descKey: 'home.howItWorks.step4.desc', Icon: Download, color: '#4facfe' },
];

export function HomeHero() {
  const { t } = useLocale();
  return (
    <div className="relative mb-8 text-center">
      {/* Subtle ambient background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full opacity-30 blur-[120px]"
          style={{
            background: 'radial-gradient(ellipse, rgba(102,126,234,0.35) 0%, rgba(118,75,162,0.2) 40%, transparent 70%)',
          }}
        />
      </div>

      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/80 px-4 py-1.5 text-sm shadow-sm backdrop-blur-sm">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full text-white"
          style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
        >
          <Sparkles className="h-3 w-3" />
        </span>
        <span className="font-medium text-foreground">{t('home.hero.badge')}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">NEW</span>
      </div>

      <h1 className="mx-auto mb-5 max-w-5xl text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl">
        <span className="bg-gradient-to-r from-foreground via-foreground to-foreground bg-clip-text text-transparent">
          {t('home.hero.title')}
        </span>
      </h1>

      <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
        {t('home.hero.subtitle')}
      </p>

      <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
        <HomeStartButton label={t('home.hero.startFree')} />
        <div className="flex items-center gap-2 rounded-full border border-border/50 bg-card/60 px-4 py-2 text-sm font-medium text-muted-foreground backdrop-blur-sm">
          <Gift className="h-4 w-4 text-primary" />
          {t('home.hero.freeCredits')}
        </div>
      </div>

      {/* Social proof */}
      <div className="mt-6 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-1.5">
            {['#667eea', '#764ba2', '#f093fb', '#4facfe'].map((c, i) => (
              <div
                key={i}
                className="h-6 w-6 rounded-full border-2 border-background"
                style={{ background: c }}
              />
            ))}
          </div>
          <span>10,000+ creators</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div>★★★★★ 4.9/5</div>
        <div className="hidden sm:block">No credit card required</div>
      </div>
    </div>
  );
}

export function HomeValueHighlights() {
  const { t } = useLocale();
  return (
    <section className="mb-12">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {valueHighlights.map(({ Icon, titleKey, descKey, color }) => (
          <div
            key={titleKey}
            className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/60 p-5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-lg"
          >
            {/* Hover gradient accent */}
            <div
              className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-20"
              style={{ background: color }}
            />
            <div
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-md"
              style={{
                background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
                boxShadow: `0 4px 16px -4px ${color}60`,
              }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t(titleKey)}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{t(descKey)}</p>
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
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            <span className="bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              {t('home.visual.title')}
            </span>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{t('home.visual.subtitle')}</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm">
          <div className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
            {/* Left: Long video simulation */}
            <div className="relative min-h-[320px] bg-muted/30 p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                    style={{ background: 'linear-gradient(135deg, #334155, #1e293b)' }}
                  >
                    <Play className="h-4 w-4 fill-current" />
                  </span>
                  58:24 {t('home.visual.longVideo')}
                </div>
                <Badge variant="secondary" className="rounded-full border-border/50 bg-muted/50">
                  <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                  URL / MP4
                </Badge>
              </div>

              <div className="aspect-video overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-slate-950 via-slate-800 to-slate-700 p-4 text-white shadow-inner">
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-white/70">
                    <span>{t('home.visual.source')}</span>
                    <span>00:14:28</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 1, 2, 3].map((item) => (
                      <div key={item} className="h-16 rounded-lg bg-white/10 ring-1 ring-white/10 transition-all hover:ring-white/20">
                        <div className="h-full rounded-lg bg-gradient-to-br from-white/15 to-transparent" />
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs text-white/75">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                      {t('home.visual.scanning')}
                    </div>
                    <div className="h-2 rounded-full bg-white/15">
                      <div className="h-2 w-2/3 animate-pulse rounded-full bg-gradient-to-r from-emerald-400 to-emerald-300" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="h-2 rounded-full bg-muted-foreground/15">
                  <div className="h-2 w-4/5 rounded-full bg-gradient-to-r from-foreground to-foreground/80" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
                <div className="flex gap-1.5">
                  <span className="h-8 flex-1 rounded-md bg-primary/25" />
                  <span className="h-8 flex-1 rounded-md bg-chart-4/30" />
                  <span className="h-8 flex-1 rounded-md bg-chart-3/25" />
                </div>
              </div>
            </div>

            {/* Right: Clips output */}
            <div className="relative flex min-h-[320px] flex-col justify-center gap-5 bg-muted/20 p-5 sm:p-6">
              <div className="absolute right-5 top-5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                3 {t('home.visual.clipsReady')}
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-md"
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    boxShadow: '0 4px 16px -4px rgba(102,126,234,0.5)',
                  }}
                >
                  <WandSparkles className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t('home.visual.engine')}</p>
                  <p className="text-xs text-muted-foreground">{t('home.visual.signals')}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="group rounded-xl border border-border/50 bg-card p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div className="mb-2 aspect-[9/16] rounded-lg bg-gradient-to-b from-foreground to-muted-foreground/70 transition-opacity group-hover:opacity-90" />
                    <div className="h-1.5 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${60 + item * 10}%`,
                          background: 'linear-gradient(90deg, #667eea, #764ba2)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/80 px-4 py-3 text-sm shadow-sm">
                <Captions className="h-4 w-4 text-primary" />
                <span className="font-medium text-foreground">{t('home.visual.exports')}</span>
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
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            <span className="bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              {t('home.features.title')}
            </span>
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
          {features.map(({ Icon, titleKey, descKey, color }) => (
            <Card
              key={titleKey}
              className="group relative overflow-hidden border border-border/50 bg-card/60 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              {/* Top gradient accent line */}
              <div
                className="absolute left-0 right-0 top-0 h-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: `linear-gradient(90deg, ${color}, ${color}80)` }}
              />
              <CardHeader>
                <div
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-md"
                  style={{
                    background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
                    boxShadow: `0 4px 16px -4px ${color}60`,
                  }}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <CardTitle className="text-lg font-semibold">{t(titleKey)}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed text-muted-foreground">
                  {t(descKey)}
                </CardDescription>
              </CardContent>
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
    <section className="py-16">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            <span className="bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              {t('home.howItWorks.title')}
            </span>
          </h2>
        </div>
        <div className="grid gap-8 md:grid-cols-4 max-w-5xl mx-auto">
          {steps.map(({ step, titleKey, descKey, Icon, color }, idx) => (
            <div key={step} className="relative text-center">
              {/* Connector line (except last) */}
              {idx < steps.length - 1 && (
                <div
                  className="absolute left-[calc(50%+32px)] top-8 hidden h-[2px] w-[calc(100%-64px)] bg-gradient-to-r from-border to-border/30 md:block"
                />
              )}
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white text-xl font-bold shadow-lg transition-transform hover:scale-105"
                style={{
                  background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
                  boxShadow: `0 8px 24px -6px ${color}60`,
                }}
              >
                <Icon className="h-7 w-7" />
              </div>
              <div
                className="mx-auto mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: color }}
              >
                {step}
              </div>
              <h3 className="mb-2 text-base font-semibold text-foreground">{t(titleKey)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
