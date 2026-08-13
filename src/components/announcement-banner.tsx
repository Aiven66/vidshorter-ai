'use client';

import { useState, useEffect } from 'react';
import { X, Crown, Zap, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';

const DISMISS_KEY = 'clipop_subscription_banner_dismissed_v1';

export function AnnouncementBanner() {
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

  // 未挂载前不渲染，避免 hydration 不匹配
  if (!mounted || dismissed) return null;

  // 文案兜底（i18n 缺失时使用内置文案）
  const textEn = 'Upgrade to Pro — Unlimited AI video processing, priority queue & 4K exports';
  const textZh = '升级 Pro 会员 — 无限 AI 视频处理、优先队列 & 4K 超清导出';
  const ctaEn = 'View Plans';
  const ctaZh = '查看套餐';

  const rawText = t('announcement.text');
  const rawCta = t('announcement.cta');
  const isZh = rawText === 'announcement.text' || rawText === textZh;
  const announceText = rawText === 'announcement.text' ? textEn : rawText;
  const ctaText = rawCta === 'announcement.cta' ? ctaEn : rawCta;

  // 未登录用户显示免费注册福利；已登录用户显示升级 Pro
  const isLoggedIn = !!user;
  const displayText = isLoggedIn ? announceText : (isZh ? textZh : textEn);

  return (
    <div className="relative w-full overflow-hidden">
      {/* 渐变背景 - 金色调突出付费感 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, #1a1a2e 0%, #16213e 20%, #0f3460 40%, #533483 60%, #0f3460 80%, #16213e 100%)',
          backgroundSize: '200% 100%',
          animation: 'banner-shimmer 12s linear infinite',
        }}
      />
      {/* 金色光效叠加 */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            'radial-gradient(ellipse at left, rgba(255, 215, 0, 0.2) 0%, transparent 50%), radial-gradient(ellipse at right, rgba(255, 165, 0, 0.15) 0%, transparent 50%)',
        }}
      />
      {/* 噪点纹理 */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 flex items-center justify-between gap-4 px-4 py-2.5 text-white">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {/* 金色皇冠图标 */}
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{
              background: 'linear-gradient(135deg, #ffd700 0%, #ffaa00 100%)',
              boxShadow: '0 0 12px rgba(255, 215, 0, 0.5)',
            }}
          >
            <Crown className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="truncate">{displayText}</span>
          {/* 折扣标签 */}
          <span
            className="ml-2 hidden shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold sm:inline-flex"
            style={{
              background: 'linear-gradient(135deg, #ffd700 0%, #ffaa00 100%)',
              color: '#1a1a2e',
            }}
          >
            -20% OFF
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/pricing"
            className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all"
            style={{
              background: 'linear-gradient(135deg, #ffd700 0%, #ffaa00 100%)',
              color: '#1a1a2e',
              boxShadow: '0 2px 8px rgba(255, 215, 0, 0.4)',
            }}
          >
            <Zap className="h-3 w-3" />
            {ctaText}
            <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <button
            onClick={handleDismiss}
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Dismiss subscription banner"
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
