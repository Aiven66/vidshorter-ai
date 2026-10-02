'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { Check, Coins, Sparkles, Zap } from 'lucide-react';
import Link from 'next/link';
import { PaymentModal } from '@/components/payment-modal';
import { useRouter } from 'next/navigation';
import { trackEvent, setAnalyticsUser, SUBSCRIBE_FUNNEL } from '@/lib/analytics';

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
      'pricing.starter.feature6',
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
      'pricing.pro.feature7',
    ],
    ctaKey: 'pricing.pro.cta',
    popular: false,
    price: { cn: 99, intl: 19.9 },
    period: 'month',
  },
];

// One-time (non-recurring) credit packs. Ids/prices must stay in sync with
// src/lib/server/subscriptions.ts CREDIT_PACKS.
interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price: { cn: number; intl: number };
  badge?: string;
}

const creditPacks: CreditPack[] = [
  { id: 'credits_120', name: 'Starter Pack', credits: 120, price: { cn: 19, intl: 2.99 } },
  { id: 'credits_300', name: 'Boost Pack', credits: 300, price: { cn: 49, intl: 6.99 }, badge: 'BEST VALUE' },
  { id: 'credits_900', name: 'Creator Pack', credits: 900, price: { cn: 119, intl: 16.99 } },
];

const faqKeys = ['q1', 'q2', 'q3', 'q4', 'q5'];

export default function PricingPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const router = useRouter();
  const [payingPlan, setPayingPlan] = useState<PlanConfig | null>(null);
  const [payingPack, setPayingPack] = useState<CreditPack | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // 同步当前用户信息到 analytics SDK
  useEffect(() => {
    setAnalyticsUser(user ? { id: user.id, email: user.email } : null);
  }, [user]);

  // 行为埋点：访问价格页 (subscription funnel step 1)
  useEffect(() => {
    trackEvent(SUBSCRIBE_FUNNEL.PAGE_VIEW_PRICING);
  }, []);

  const handleSubscribe = (plan: PlanConfig) => {
    // 行为埋点：点击付费按钮 (subscription funnel step 2)
    trackEvent(SUBSCRIBE_FUNNEL.CLICK_SUBSCRIBE, {
      data: {
        plan_id: plan.id,
        plan_name: plan.name,
        plan_price_cn: plan.price.cn,
        plan_price_intl: plan.price.intl,
      },
    });

    if (!user) {
      router.push('/register');
      return;
    }
    setPayingPlan(plan);
    setModalOpen(true);
  };

  const handleBuyPack = (pack: CreditPack) => {
    // 行为埋点：点击积分包购买 (复用订阅点击 funnel step)
    trackEvent(SUBSCRIBE_FUNNEL.CLICK_SUBSCRIBE, {
      data: {
        plan_id: pack.id,
        plan_name: pack.name,
        pack_credits: pack.credits,
        pack_price_intl: pack.price.intl,
      },
    });

    if (!user) {
      router.push('/register');
      return;
    }
    setPayingPlan(null);
    setPayingPack(pack);
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

        {/* 一次性积分包 */}
        <div className="max-w-4xl mx-auto mt-20">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 text-2xl font-bold">
              <Coins className="h-7 w-7 text-amber-500" />
              <h2>Buy Credits</h2>
            </div>
            <p className="text-muted-foreground mt-2">
              One-time top-up. No subscription needed. Credits are added to your balance instantly and never expire monthly.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {creditPacks.map((pack) => (
              <Card
                key={pack.id}
                className={`relative overflow-hidden hover:border-primary/50 transition-colors ${
                  pack.badge ? 'border-primary shadow-xl scale-105' : ''
                }`}
              >
                {pack.badge && (
                  <Badge className="absolute top-4 right-4 bg-amber-500 hover:bg-amber-600 text-white">
                    <Zap className="h-3 w-3 mr-1" />
                    {pack.badge}
                  </Badge>
                )}
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-2xl flex items-center justify-center gap-2">
                    <Coins className="h-6 w-6 text-amber-500" />
                    {pack.credits} credits
                  </CardTitle>
                  <CardDescription className="mt-1">{pack.name}</CardDescription>
                  <div className="mt-3">
                    <span className="text-4xl font-bold">${pack.price.intl}</span>
                    {pack.price.cn > 0 && (
                      <span className="text-muted-foreground text-sm"> / ¥{pack.price.cn}</span>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      ≈ ${(pack.price.intl / pack.credits).toFixed(2)} / credit
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    className="w-full"
                    variant={pack.badge ? 'default' : 'outline'}
                    onClick={() => handleBuyPack(pack)}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Buy Now
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-8 h-5 bg-[#003087] rounded flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">PP</span>
            </div>
            <span>PayPal</span>
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
        plan={
          payingPack
            ? {
                id: payingPack.id,
                name: payingPack.name,
                price: payingPack.price,
                period: 'one-time',
                credits: payingPack.credits,
              }
            : payingPlan
        }
      />
    </div>
  );
}
