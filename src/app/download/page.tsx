'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/lib/locale-context';
import { Download, Monitor, HardDrive, Apple, ChevronRight, ArrowDownToLine, Shield, Zap, Server } from 'lucide-react';

interface ReleaseInfo {
  available: boolean;
  version?: string;
  dmgUrl?: string;
  dmgSize?: number;
  releaseUrl?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function DownloadPage() {
  const { t } = useLocale();
  const [release, setRelease] = useState<ReleaseInfo>({ available: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/download/latest')
      .then((res) => res.json())
      .then((data) => {
        setRelease(data);
        setLoading(false);
      })
      .catch(() => {
        setRelease({ available: false });
        setLoading(false);
      });
  }, []);

  const features = [
    { Icon: Shield, titleKey: 'downloadPage.features.stable.title', descKey: 'downloadPage.features.stable.desc' },
    { Icon: Zap, titleKey: 'downloadPage.features.fast.title', descKey: 'downloadPage.features.fast.desc' },
    { Icon: Server, titleKey: 'downloadPage.features.local.title', descKey: 'downloadPage.features.local.desc' },
  ];

  const steps = [
    { num: 1, key: 'downloadPage.step1' },
    { num: 2, key: 'downloadPage.step2' },
    { num: 3, key: 'downloadPage.step3' },
    { num: 4, key: 'downloadPage.step4' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 px-4 py-1.5 text-sm">
              <Monitor className="h-4 w-4 mr-2 text-primary" />
              {t('downloadPage.badge')}
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              {t('downloadPage.title')}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('downloadPage.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <Card className="relative overflow-hidden border-2 border-primary/20 hover:border-primary/40 transition-colors">
              <div className="absolute top-4 right-4">
                <Badge className="bg-primary text-primary-foreground">
                  <Apple className="h-3 w-3 mr-1" />
                  {t('downloadPage.macTitle')}
                </Badge>
              </div>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Apple className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">{t('downloadPage.macTitle')}</CardTitle>
                    <CardDescription>{t('downloadPage.macDesc')}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="space-y-3">
                    <div className="h-12 bg-muted animate-pulse rounded-lg" />
                    <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
                  </div>
                ) : release.available && release.dmgUrl ? (
                  <>
                    <Button asChild className="w-full h-12 text-base" size="lg">
                      <a href={release.dmgUrl}>
                        <ArrowDownToLine className="h-5 w-5 mr-2" />
                        {t('downloadPage.downloadButton')}
                      </a>
                    </Button>
                    <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                      {release.version && (
                        <span>{t('downloadPage.version')} {release.version}</span>
                      )}
                      {release.dmgSize ? (
                        <>
                          <span>·</span>
                          <span>{formatFileSize(release.dmgSize)}</span>
                        </>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      {t('downloadPage.requirements')}
                    </p>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground text-sm">
                      {t('downloadPage.notAvailable')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-primary" />
                  {t('downloadPage.installing')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {steps.map((step) => (
                    <li key={step.num} className="flex items-start gap-3">
                      <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center mt-0.5">
                        {step.num}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {t(step.key)}
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>

          <div className="mb-16">
            <h2 className="text-2xl font-bold text-center mb-8">
              {t('downloadPage.whyDesktopTitle')}
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {features.map(({ Icon, titleKey, descKey }) => (
                <Card key={titleKey} className="text-center">
                  <CardContent className="pt-6">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">{t(titleKey)}</h3>
                    <p className="text-sm text-muted-foreground">{t(descKey)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="text-center">
            <Link href="/">
              <Button variant="ghost" className="text-muted-foreground">
                <ChevronRight className="h-4 w-4 mr-1 rotate-180" />
                {t('downloadPage.backToHome')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
