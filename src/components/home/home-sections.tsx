import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Film, Zap, Video, Scissors, Download } from 'lucide-react';

const features = [
  { Icon: Sparkles, titleKey: 'home.features.auto.title', descKey: 'home.features.auto.desc' },
  { Icon: Film, titleKey: 'home.features.multi.title', descKey: 'home.features.multi.desc' },
  { Icon: Zap, titleKey: 'home.features.quick.title', descKey: 'home.features.quick.desc' },
];

const steps = [
  { step: '1', titleKey: 'home.howItWorks.step1.title', descKey: 'home.howItWorks.step1.desc', Icon: Video },
  { step: '2', titleKey: 'home.howItWorks.step2.title', descKey: 'home.howItWorks.step2.desc', Icon: Sparkles },
  { step: '3', titleKey: 'home.howItWorks.step3.title', descKey: 'home.howItWorks.step3.desc', Icon: Scissors },
  { step: '4', titleKey: 'home.howItWorks.step4.title', descKey: 'home.howItWorks.step4.desc', Icon: Download },
];

export function HomeHero({ t }: { t: (key: string) => string }) {
  return (
    <div className="text-center mb-10">
      <Badge variant="outline" className="mb-4 px-4 py-1.5 text-sm">
        <Sparkles className="h-4 w-4 mr-2 text-primary" />
        {t('home.hero.badge')}
      </Badge>
      <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
        {t('home.hero.title')}
      </h1>
      <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
        {t('home.hero.subtitle')}
      </p>
    </div>
  );
}

export function HomeFeatures({ t }: { t: (key: string) => string }) {
  return (
    <section className="py-16 bg-muted/30">
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

export function HomeHowItWorks({ t }: { t: (key: string) => string }) {
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl font-bold text-center mb-10">{t('home.howItWorks.title')}</h2>
        <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {steps.map(({ step, titleKey, descKey, Icon }) => (
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
