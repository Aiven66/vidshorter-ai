'use client';

import { useState, useEffect } from 'react';
import { X, Gift, Sparkles, CheckCircle2, ArrowRight, Crown, Zap } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';

const DISMISS_KEY = 'clipop_registration_banner_dismissed_v1';

export function RegistrationBanner() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(DISMISS_KEY);
      if (saved === 'true') setDismissed(true);
    } catch {}
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {}
  };

  if (!mounted || dismissed || user) return null;

  const titleText = t('registerBanner.title') === 'registerBanner.title'
    ? 'Register & Get'
    : t('registerBanner.title');

  const creditsText = t('registerBanner.credits') === 'registerBanner.credits'
    ? '200 Credits'
    : t('registerBanner.credits');

  const valueText = t('registerBanner.value') === 'registerBanner.value'
    ? '$6 Value'
    : t('registerBanner.value');

  const feature1 = t('registerBanner.feature1') === 'registerBanner.feature1'
    ? 'Instant 200 credits on signup'
    : t('registerBanner.feature1');

  const feature2 = t('registerBanner.feature2') === 'registerBanner.feature2'
    ? 'Free AI video processing'
    : t('registerBanner.feature2');

  const feature3 = t('registerBanner.feature3') === 'registerBanner.feature3'
    ? 'No credit card required'
    : t('registerBanner.feature3');

  const ctaText = t('registerBanner.cta') === 'registerBanner.cta'
    ? 'Register Free'
    : t('registerBanner.cta');

  const subtitleText = t('registerBanner.subtitle') === 'registerBanner.subtitle'
    ? 'Start creating viral shorts today'
    : t('registerBanner.subtitle');

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] animate-banner-in">
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl">
        {/* Top accent bar */}
        <div
          className="h-1 w-full"
          style={{
            background: 'linear-gradient(90deg, #667eea, #764ba2, #f093fb, #4facfe)',
          }}
        />

        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dismiss registration banner"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-5">
          {/* Header */}
          <div className="mb-4 flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                boxShadow: '0 8px 24px -6px rgba(102, 126, 234, 0.5)',
              }}
            >
              <Gift className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-bold text-foreground">{titleText}</h3>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span
                  className="text-2xl font-extrabold tracking-tight"
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {creditsText}
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {valueText}
                </span>
              </div>
            </div>
          </div>

          <p className="mb-4 text-sm text-muted-foreground">{subtitleText}</p>

          {/* Feature list */}
          <ul className="mb-4 space-y-2">
            {[feature1, feature2, feature3].map((feat, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-foreground/90">{feat}</span>
              </li>
            ))}
          </ul>

          {/* CTA buttons */}
          <div className="space-y-2">
            <Link
              href="/register"
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                boxShadow: '0 8px 24px -6px rgba(102, 126, 234, 0.5)',
              }}
            >
              <Crown className="h-4 w-4" />
              {ctaText}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Zap className="h-3.5 w-3.5" />
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes banner-in {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-banner-in {
          animation: banner-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
