'use client';

import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Sparkles, Users, Zap, Shield, ArrowRight, Target, Award, Globe, TrendingUp, Video, Lightbulb } from 'lucide-react';

export default function AboutPage() {
  const { t } = useLocale();

  const stats = [
    { value: '50K+', label: t('about.stats.activeUsers'), icon: Users },
    { value: '1M+', label: t('about.stats.videosProcessed'), icon: Video },
    { value: '98%', label: t('about.stats.userSatisfaction'), icon: Award },
    { value: '32', label: t('about.stats.languages'), icon: Globe },
  ];

  const features = [
    {
      icon: Lightbulb,
      title: t('about.features.aiIntelligence.title'),
      desc: t('about.features.aiIntelligence.desc'),
    },
    {
      icon: Zap,
      title: t('about.features.fastProcessing.title'),
      desc: t('about.features.fastProcessing.desc'),
    },
    {
      icon: TrendingUp,
      title: t('about.features.multiPlatform.title'),
      desc: t('about.features.multiPlatform.desc'),
    },
    {
      icon: Shield,
      title: t('about.features.privacyFirst.title'),
      desc: t('about.features.privacyFirst.desc'),
    },
  ];

  const values = [
    {
      icon: Target,
      title: t('about.values.userCentric.title'),
      desc: t('about.values.userCentric.desc'),
    },
    {
      icon: Zap,
      title: t('about.values.continuous.title'),
      desc: t('about.values.continuous.desc'),
    },
    {
      icon: Users,
      title: t('about.values.community.title'),
      desc: t('about.values.community.desc'),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-chart-4/5">
      {/* Hero Section */}
      <section className="relative py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-64 -right-64 w-[500px] h-[500px] bg-gradient-to-br from-primary/15 to-transparent rounded-full blur-3xl"></div>
          <div className="absolute -bottom-64 -left-64 w-[400px] h-[400px] bg-gradient-to-tr from-chart-4/20 to-transparent rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <Sparkles className="w-4 h-4" />
              {t('about.hero.badge')}
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-7xl font-black tracking-tight mb-8 bg-gradient-to-r from-foreground via-primary/80 to-foreground bg-clip-text text-transparent">
              {t('about.hero.title')}
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed">
              {t('about.hero.subtitle')}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="text-base px-8" asChild>
                <Link href="/">
                  {t('about.hero.getStarted')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>

            {/* Stats */}
            <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <div key={index} className="text-center group">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="text-3xl md:text-4xl font-bold mb-1">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Product Vision Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('about.productVision.title')}</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{t('about.productVision.subtitle')}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1">
                <h3 className="text-2xl md:text-3xl font-bold mb-6">{t('about.productVision.futureTitle')}</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">{t('about.productVision.futurePara1')}</p>
                <p className="text-muted-foreground mb-8 leading-relaxed">{t('about.productVision.futurePara2')}</p>
                <ul className="space-y-4">
                  {t('about.productVision.benefits').map((benefit, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary"></div>
                      <span className="font-medium">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="order-1 md:order-2">
                <div className="relative">
                  <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl">
                    <img 
                      src="https://neeko-copilot.bytedance.net/api/text-to-image?prompt=modern%20AI%20video%20editing%20interface%20with%20neon%20blue%20accents%20showing%20video%20timeline%20with%20AI%20highlight%20markers%2C%20professional%20dark%20theme%2C%20futuristic%20design&imageSize=landscape-16-9" 
                      alt="AI Video Editing" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-gradient-to-br from-primary/20 to-chart-4/20 rounded-2xl blur-2xl"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('about.features.title')}</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{t('about.features.subtitle')}</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div 
                    key={index} 
                    className="group p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                  >
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-chart-4/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Icon className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-gradient-to-br from-primary/5 via-background to-chart-4/5">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('about.values.title')}</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{t('about.values.subtitle')}</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {values.map((value, index) => {
                const Icon = value.icon;
                return (
                  <div key={index} className="text-center p-8 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-all duration-300">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Icon className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3">{value.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{value.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* SEO/GEO Content Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('about.geo.title')}</h2>
              <p className="text-lg text-muted-foreground">{t('about.geo.subtitle')}</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-6 rounded-2xl bg-primary/5 border border-primary/10">
                <h3 className="text-lg font-semibold mb-3">{t('about.geo.seo.title')}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{t('about.geo.seo.desc')}</p>
              </div>
              <div className="p-6 rounded-2xl bg-chart-4/5 border border-chart-4/10">
                <h3 className="text-lg font-semibold mb-3">{t('about.geo.multiLang.title')}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{t('about.geo.multiLang.desc')}</p>
              </div>
              <div className="p-6 rounded-2xl bg-chart-3/5 border border-chart-3/10">
                <h3 className="text-lg font-semibold mb-3">{t('about.geo.regional.title')}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{t('about.geo.regional.desc')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-chart-4 p-12 md:p-16">
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
              </div>
              <div className="relative z-10 text-center text-white">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('about.cta.title')}</h2>
                <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">{t('about.cta.subtitle')}</p>
                <Button size="lg" className="bg-white text-primary hover:bg-white/90 text-base px-8" asChild>
                  <Link href="/">
                    {t('about.cta.button')}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
