'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Film, Zap, Video, Scissors, Download } from 'lucide-react';
import { useLocale } from '@/lib/locale-context';
import VideoProcessor from '@/components/home/video-processor';

export default function HomePage() {
  const { t } = useLocale();

  const features = [
    { Icon: Sparkles, title: t('home.features.auto.title'), desc: t('home.features.auto.desc') },
    { Icon: Film, title: t('home.features.multi.title'), desc: t('home.features.multi.desc') },
    { Icon: Zap, title: t('home.features.quick.title'), desc: t('home.features.quick.desc') },
  ];

  const steps = [
    { step: '1', title: t('home.howItWorks.step1.title'), desc: t('home.howItWorks.step1.desc'), icon: Video },
    { step: '2', title: t('home.howItWorks.step2.title'), desc: t('home.howItWorks.step2.desc'), icon: Sparkles },
    { step: '3', title: t('home.howItWorks.step3.title'), desc: t('home.howItWorks.step3.desc'), icon: Scissors },
    { step: '4', title: t('home.howItWorks.step4.title'), desc: t('home.howItWorks.step4.desc'), icon: Download },
  ];

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/30">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-32 h-96 w-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-32 h-96 w-96 bg-primary/5 rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-4 py-12 md:py-20">
          <div className="max-w-4xl mx-auto">
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

            <VideoProcessor />
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">{t('home.features.title')}</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map(({ Icon, title, desc }) => (
              <Card key={title} className="border-0 shadow-lg">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent><CardDescription className="text-base">{desc}</CardDescription></CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">{t('home.howItWorks.title')}</h2>
          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {steps.map(item => (
              <div key={item.step} className="text-center">
                <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
