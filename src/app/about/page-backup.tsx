'use client';

import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Sparkles, Users, Zap, Shield, ArrowRight, Calendar, Video, ChevronRight } from 'lucide-react';

export default function AboutPage() {
  const { t } = useLocale();

  const valueIcons = {
    sparkles: Sparkles,
    users: Users,
    zap: Zap,
    shield: Shield,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-chart-4/5">
      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-chart-4/20 rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              {t('about.hero.badge')}
            </span>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              {t('about.hero.title')}
            </h1>

            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              {t('about.hero.subtitle')}
            </p>

            <Button size="lg" asChild>
              <Link href="/">
                {t('about.cta.button')}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
              {t('about.mission.title')}
            </h2>

            <p className="text-lg text-muted-foreground text-center max-w-3xl mx-auto mb-16">
              {t('about.mission.content')}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {t('about.mission.values').map((value, index) => {
                const IconComponent = valueIcons[value.icon as keyof typeof valueIcons] || Sparkles;
                return (
                  <div
                    key={index}
                    className="p-6 rounded-2xl bg-muted/30 hover:bg-muted/50 transition-all duration-300 hover:-translate-y-1 group"
                  >
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <IconComponent className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">{value.title}</h3>
                    <p className="text-muted-foreground">{value.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* What We Do Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-6">
              {t('about.whatWeDo.title')}
            </h2>

            <p className="text-lg text-muted-foreground text-center max-w-3xl mx-auto mb-16">
              {t('about.whatWeDo.intro')}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {t('about.whatWeDo.features').map((feature, index) => (
                <div
                  key={index}
                  className="p-8 rounded-3xl bg-gradient-to-br from-card to-muted/30 border border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-xl"
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-chart-4/20 flex items-center justify-center mb-6">
                    <Video className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
              {t('about.whyChoose.title')}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {t('about.whyChoose.features').map((feature, index) => (
                <div
                  key={index}
                  className="p-6 rounded-2xl border border-border/50 flex items-start gap-4 hover:border-primary/30 hover:bg-muted/20 transition-all duration-300"
                >
                  <div className="w-3 h-3 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="text-lg font-semibold mb-1">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
              {t('about.timeline.title')}
            </h2>

            <div className="relative">
              {/* Timeline Line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary/50 to-transparent hidden md:block"></div>

              <div className="space-y-12">
                {t('about.timeline.events').map((event, index) => (
                  <div
                    key={index}
                    className={`flex flex-col md:flex-row items-center gap-8 ${index % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
                  >
                    {/* Year Badge */}
                    <div className="w-full md:w-1/2 flex justify-center">
                      <div className="relative">
                        <div className="hidden md:block absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary border-4 border-background"></div>
                        <span className="text-3xl font-bold text-primary">{event.year}</span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="w-full md:w-1/2">
                      <div className="p-6 rounded-2xl bg-card border border-border/50">
                        <h3 className="text-xl font-bold mb-2">{event.title}</h3>
                        <p className="text-muted-foreground">{event.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              {t('about.team.title')}
            </h2>

            <p className="text-lg text-muted-foreground">
              {t('about.team.intro')}
            </p>

            <div className="mt-12 flex justify-center gap-24 flex-wrap">
              {[
                { icon: Sparkles, label: 'AI' },
                { icon: Video, label: 'Video' },
                { icon: Users, label: 'Team' },
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={index} className="text-center">
                    <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-chart-4/20 flex items-center justify-center mb-3">
                      <Icon className="w-10 h-10 text-primary" />
                    </div>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="p-12 md:p-16 rounded-3xl bg-gradient-to-br from-primary/10 via-background to-chart-4/10 border border-primary/20">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                {t('about.cta.title')}
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                {t('about.cta.subtitle')}
              </p>
              <Button size="lg" asChild>
                <Link href="/">
                  {t('about.cta.button')}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
