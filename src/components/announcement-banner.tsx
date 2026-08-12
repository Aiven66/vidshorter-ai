'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Zap, Gift } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from '@/lib/locale-context';

const DISMISS_KEY = 'clipop_announcement_dismissed_v1';

export function AnnouncementBanner() {
  const { t } = useLocale();
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

  if (!mounted || dismissed) return null;

  const announceText = t('announcement.text') === 'announcement.text'
    ? 'New: Article-to-Video now supports WeChat articles & Bilibili links. Try it free →'
    : t('announcement.text');

  const ctaText = t('announcement.cta') === 'announcement.cta'
    ? 'Try Now'
    : t('announcement.cta');

  return (
    <div className="relative w-full overflow-hidden">
      {/* Gradient background with subtle animation */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            'linear-gradient(90deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #667eea 100%)',
          backgroundSize: '200% 100%',
          animation: 'banner-shimmer 8s linear infinite',
        }}
      />
      {/* Noise overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 flex items-center justify-between gap-4 px-4 py-2.5 text-white">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">{announceText}</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/article-to-video"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm transition-all hover:bg-white/30"
          >
            <Zap className="h-3 w-3" />
            {ctaText}
          </Link>
          <button
            onClick={handleDismiss}
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Dismiss announcement"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes banner-shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
    </div>
  );
}
