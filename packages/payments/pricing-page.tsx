'use client';

/**
 * @clipop/payments - Pricing Page
 *
 * Renders a 3-column grid of subscription cards from useAppConfig().plans.
 * Subscribe buttons open a PaymentModal for paid plans; free plan triggers
 * onSubscribe callback (or no-op if not provided).
 *
 * Pure native HTML + Tailwind — no shadcn/ui dependency.
 */

import { useState } from 'react';
import { useAppConfig, type PlanConfig } from '@clipop/core';
import { PaymentModal } from './payment-modal';

export interface PricingPageProps {
  /** Optional callback fired when user clicks Subscribe (free plan or pre-check). */
  onSubscribe?: (plan: PlanConfig) => void;
  /** Show the page header. Default true. */
  showHeader?: boolean;
  /** Display locale: 'zh' shows CNY price, otherwise USD. */
  locale?: 'zh' | 'en' | string;
  /** Logged-in user id (passed to PaymentModal). Required to start payment. */
  userId?: string;
  /** Optional list of feature overrides per plan id. */
  featuresByPlan?: Record<string, string[]>;
}

export function PricingPage({
  onSubscribe,
  showHeader = true,
  locale,
  userId,
  featuresByPlan,
}: PricingPageProps) {
  const config = useAppConfig();
  const displayLocale = locale || config.defaultLocale || 'en';
  const isZh = displayLocale === 'zh';

  const [payingPlan, setPayingPlan] = useState<PlanConfig | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleSubscribe = (plan: PlanConfig) => {
    onSubscribe?.(plan);
    if (plan.id === 'free' || plan.priceIntl === 0) {
      // Free plan: do not open payment modal
      return;
    }
    if (!userId) {
      // Host should handle redirect to login via onSubscribe
      return;
    }
    setPayingPlan(plan);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-16">
        {showHeader && (
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <h1 className="mb-3 text-4xl font-bold">
              {isZh ? '选择适合您的方案' : 'Choose the plan that fits you'}
            </h1>
            <p className="text-muted-foreground">
              {isZh
                ? '灵活的定价，随时升级或取消。'
                : 'Flexible pricing. Upgrade or cancel anytime.'}
            </p>
          </div>
        )}

        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {config.plans.map((plan) => {
            const features = featuresByPlan?.[plan.id] ?? plan.features ?? [];
            const isPopular = !!plan.badge;
            const price = isZh ? plan.priceCny : plan.priceIntl;
            const currencySymbol = isZh ? '¥' : '$';

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col overflow-hidden rounded-2xl border bg-background p-6 shadow-sm transition ${
                  isPopular ? 'border-primary shadow-lg md:scale-[1.03]' : 'border-border'
                }`}
              >
                {plan.badge && (
                  <span className="absolute right-4 top-4 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    {plan.badge}
                  </span>
                )}

                <div className="mb-6 text-center">
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                  <div className="mt-3">
                    <span className="text-4xl font-bold">
                      {currencySymbol}
                      {price}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {' '}
                      / {isZh ? '月' : 'mo'}
                    </span>
                  </div>
                  {plan.unlimitedCredits && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {isZh ? '无限积分' : 'Unlimited credits'}
                    </p>
                  )}
                </div>

                <ul className="mb-6 space-y-3 text-sm">
                  {features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-4 w-4 flex-none rounded-full bg-primary/10 text-primary">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => handleSubscribe(plan)}
                  className={`mt-auto h-11 w-full rounded-lg text-sm font-medium transition ${
                    isPopular
                      ? 'bg-primary text-primary-foreground hover:opacity-90'
                      : 'border border-border bg-background text-foreground hover:bg-muted/40'
                  }`}
                >
                  {plan.id === 'free' || plan.priceIntl === 0
                    ? isZh
                      ? '免费开始'
                      : 'Get Started'
                    : isZh
                      ? '订阅'
                      : 'Subscribe'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
          <span>🔒 {isZh ? '256 位 TLS 加密' : '256-bit TLS encryption'}</span>
          <span>{isZh ? '随时取消' : 'Cancel anytime'}</span>
          <span>{isZh ? '安全支付' : 'Secure payment'}</span>
        </div>
      </div>

      {userId && (
        <PaymentModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          plan={payingPlan}
          userId={userId}
        />
      )}
    </div>
  );
}
