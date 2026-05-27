'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { PaymentModal } from '@/components/payment-modal';

interface PlanConfig {
  id: string;
  name: string;
  titleKey: string;
  priceKey: string;
  periodKey: string;
  descKey: string;
  features: string[];
  ctaKey: string;
  popular: boolean;
  price: { cn: number; intl: number };
  period: string;
}

const plans: PlanConfig[] = [
  {
    id: 'free',
    name: 'Free',
    titleKey: 'pricing.free.title',
    priceKey: 'pricing.free.price',
    periodKey: 'pricing.free.period',
    descKey: 'pricing.free.desc',
    features: [
      'pricing.free.feature1',
      'pricing.free.feature2',
      'pricing.free.feature3',
      'pricing.free.feature4',
    ],
    ctaKey: 'pricing.free.cta',
    popular: false,
    price: { cn: 0, intl: 0 },
    period: 'month',
  },
  {
    id: 'starter',
    name: 'Starter',
    titleKey: 'pricing.starter.title',
    priceKey: 'pricing.starter.price',
    periodKey: 'pricing.starter.period',
    descKey: 'pricing.starter.desc',
    features: [
      'pricing.starter.feature1',
      'pricing.starter.feature2',
      'pricing.starter.feature3',
      'pricing.starter.feature4',
      'pricing.starter.feature5',
    ],
    ctaKey: 'pricing.starter.cta',
    popular: true,
    price: { cn: 49, intl: 9.9 },
    period: 'month',
  },
  {
    id: 'pro',
    name: 'Pro',
    titleKey: 'pricing.pro.title',
    priceKey: 'pricing.pro.price',
    periodKey: 'pricing.pro.period',
    descKey: 'pricing.pro.desc',
    features: [
      'pricing.pro.feature1',
      'pricing.pro.feature2',
      'pricing.pro.feature3',
      'pricing.pro.feature4',
      'pricing.pro.feature5',
      'pricing.pro.feature6',
    ],
    ctaKey: 'pricing.pro.cta',
    popular: false,
    price: { cn: 99, intl: 19.9 },
    period: 'month',
  },
];

const faqKeys = ['q1', 'q2', 'q3', 'q4', 'q5'];

export default function PricingPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [payingPlan, setPayingPlan] = useState<PlanConfig | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleSubscribe = (plan: PlanConfig) => {
    if (!user) {
      window.location.href = '/register';
      return;
    }
    setPayingPlan(plan);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl font-bold mb-4">{t('pricing.title')}</h1>
          <p className="text-xl text-muted-foreground">{t('pricing.subtitle')}</p>
          <p className="text-sm text-muted-foreground mt-2">
            {t('pricing.paymentNote')}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`relative overflow-hidden ${
                plan.popular ? 'border-primary shadow-xl scale-105' : ''
              }`}
            >
              {plan.popular && (
                <Badge className="absolute top-4 right-4">
                  {t('pricing.mostPopular')}
                </Badge>
              )}
              <CardHeader className="text-center pb-8">
                <CardTitle className="text-2xl">{t(plan.titleKey)}</CardTitle>
                <div className="mt-4">
                  <span className="text-5xl font-bold">{t(plan.priceKey)}</span>
                  <span className="text-muted-foreground">{t(plan.periodKey)}</span>
                </div>
                {plan.id !== 'free' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {plan.price.cn > 0 ? `¥${plan.price.cn}/月 · $${plan.price.intl}/mo` : ''}
                  </p>
                )}
                <CardDescription className="mt-2">
                  {t(plan.descKey)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-sm">{t(feature)}</span>
                    </li>
                  ))}
                </ul>
                {plan.id === 'free' ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    asChild
                  >
                    <Link href={user ? '/dashboard' : '/register'}>
                      {t(plan.ctaKey)}
                    </Link>
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={plan.popular ? 'default' : 'outline'}
                    onClick={() => handleSubscribe(plan)}
                  >
                    {t(plan.ctaKey)}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-8 h-5 bg-[#1677FF] rounded flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">ALI</span>
            </div>
            <span>支付宝</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-5 bg-gradient-to-r from-violet-600 to-indigo-600 rounded flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">CR</span>
            </div>
            <span>Creem</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span>🔒 {t('pricing.secureNote')}</span>
          </div>
        </div>

        <div className="max-w-3xl mx-auto mt-20">
          <h2 className="text-2xl font-bold text-center mb-8">{t('pricing.faqTitle')}</h2>
          <div className="grid gap-6">
            {faqKeys.map((key) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="text-lg">{t(`pricing.faq.${key}`)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{t(`pricing.faq.a${key.slice(1)}`)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <PaymentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        plan={payingPlan}
      />
    </div>
  );
}
