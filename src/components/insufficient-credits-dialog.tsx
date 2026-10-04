'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  Coins,
  Sparkles,
  Zap,
  TrendingUp,
  Shield,
  ArrowRight,
  Clock,
  Plus,
  Gift,
} from 'lucide-react';
import { PaymentModal } from '@/components/payment-modal';
import { useCredits } from '@/lib/credits-context';
import { useLocale } from '@/lib/locale-context';

const ReferralDialog = dynamic(
  () => import('@/components/referral-dialog').then(m => ({ default: m.ReferralDialog })),
  { ssr: false }
);

interface InsufficientCreditsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentBalance?: number;
  requiredCredits?: number;
  /** 'credits'（默认）= 积分不足；'export' = 免费用户导出拦截（导出即付费墙） */
  reason?: 'credits' | 'export';
}

/** 弹窗内可直接购买的低价一次性积分包（ids 与 CREDIT_PACKS 保持一致）。 */
const MINI_PACKS = [
  { id: 'credits_120', name: 'Starter Pack', credits: 120, priceIntl: 2.99, priceCn: 19 },
  { id: 'credits_300', name: 'Boost Pack', credits: 300, priceIntl: 6.99, priceCn: 49 },
];

/**
 * 积分不足时的强付费引导对话框
 *
 * UX 设计原则:
 *  - 不显示"错误"字样,而是用积极的措辞引导("升级解锁更多")
 *  - 突出 Starter 套餐的性价比 (Most Popular, $9.9/月)
 *  - 对比 Free vs Starter,让用户清楚感知升级价值
 *  - 双 CTA: 主按钮"立即升级"跳转定价页,次按钮"稍后再说"
 *  - 添加信任徽章 (PayPal/Creem/SSL) 降低付费焦虑
 *  - 使用 Framer 风格的入场动画 (由 Radix Dialog 提供)
 */
export function InsufficientCreditsDialog({
  open,
  onOpenChange,
  currentBalance = 0,
  requiredCredits = 60,
  reason = 'credits',
}: InsufficientCreditsDialogProps) {
  const { t } = useLocale();
  const isExport = reason === 'export';
  const [redirecting, setRedirecting] = useState(false);
  const { refreshCredits } = useCredits();
  const [selectedPack, setSelectedPack] = useState<(typeof MINI_PACKS)[number] | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  // 邀请好友弹窗（为本弹窗提供一个「不花钱也能拿积分」的替代路径）
  const [inviteOpen, setInviteOpen] = useState(false);

  // 重置 redirecting 状态
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setRedirecting(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleBuyPack = (pack: (typeof MINI_PACKS)[number]) => {
    setSelectedPack(pack);
    setPaymentOpen(true);
  };

  // 支付成功后：刷新积分并关闭弹窗
  const handlePackPaid = () => {
    refreshCredits().catch(() => {});
    setPaymentOpen(false);
    onOpenChange(false);
  };

  const handleUpgrade = () => {
    setRedirecting(true);
    // 跳转到定价页,并在 URL 中带上 source 参数,便于分析转化路径
    if (typeof window !== 'undefined') {
      window.location.href = isExport
        ? '/pricing?source=export_paywall'
        : '/pricing?source=insufficient_credits';
    }
  };

  const handleLater = () => {
    onOpenChange(false);
  };

  // 计算需要补充的积分
  const creditsShort = Math.max(0, requiredCredits - currentBalance);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden gap-0">
        {/* Hero 区域: 渐变背景 + 醒目图标 */}
        <div className="relative bg-gradient-to-br from-primary/15 via-primary/10 to-transparent px-6 pt-7 pb-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-12 translate-x-12 blur-2xl pointer-events-none" />
          <DialogHeader className="relative space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 ring-4 ring-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold leading-tight">
                  {isExport ? t('exportPaywall.title') : 'Unlock More Highlights'}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isExport ? t('exportPaywall.subtitle') : 'Upgrade to keep creating'}
                </p>
              </div>
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              {isExport ? (
                t('exportPaywall.desc')
              ) : (
                <>
                  You have{' '}
                  <span className="font-semibold text-foreground">{currentBalance} credits</span>{' '}
                  but need{' '}
                  <span className="font-semibold text-foreground">{requiredCredits}</span>{' '}
                  to generate this clip.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* 方案对比卡片 */}
        <div className="px-6 pb-4 pt-2">
          <div className="rounded-xl border bg-card overflow-hidden">
            {/* Starter 方案 - 推荐 */}
            <div className="relative p-4 bg-gradient-to-r from-primary/5 to-transparent border-b">
              <div className="absolute top-3 right-3">
                <Badge className="bg-primary text-primary-foreground text-[10px] px-2 py-0.5 h-auto font-semibold">
                  <TrendingUp className="h-2.5 w-2.5 mr-1" />
                  BEST VALUE
                </Badge>
              </div>
              <div className="flex items-center gap-2 mb-1.5">
                <Zap className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Starter Plan</span>
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-2xl font-bold tracking-tight">$9.9</span>
                <span className="text-xs text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-1.5">
                {[
                  { icon: Coins, text: '6,000 credits monthly (100 clips)' },
                  { icon: Zap, text: 'Priority processing speed' },
                  { icon: CheckCircle, text: 'No watermark · 1080p export' },
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <item.icon className="h-3 w-3 text-primary flex-shrink-0" />
                    <span className="text-foreground/80">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Free 方案 - 当前 */}
            <div className="p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Free Plan (current)
                </span>
                <span className="text-muted-foreground">
                  Resets {new Intl.DateTimeFormat('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'UTC',
                  }).format(new Date(Date.now() + 24 * 60 * 60 * 1000))} UTC
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 低价积分包快捷购买 */}
        <div className="px-6 pb-3 pt-1">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
            <Plus className="h-3.5 w-3.5" />
            Or buy a small credit pack — no subscription
          </p>
          <div className="grid grid-cols-2 gap-2">
            {MINI_PACKS.map((pack) => (
              <button
                key={pack.id}
                onClick={() => handleBuyPack(pack)}
                className="rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-primary/5 p-3 text-left transition-all duration-200"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Coins className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-sm font-semibold">{pack.credits} credits</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold">${pack.priceIntl}</span>
                  <span className="text-[10px] text-muted-foreground">one-time</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 邀请好友引导：邀请好友各得 100 积分，为积分不足用户提供「不花钱」的替代路径 */}
        <div className="px-6 pb-2">
          <Button
            variant="outline"
            className="w-full h-9 text-xs gap-1.5"
            onClick={() => { onOpenChange(false); setInviteOpen(true); }}
          >
            <Gift className="h-3.5 w-3.5 text-primary" />
            {t('referral.paywallCta')}
          </Button>
        </div>

        {/* CTA 区域 */}
        <div className="px-6 pb-5 pt-1 space-y-2.5">
          <Button
            onClick={handleUpgrade}
            disabled={redirecting}
            className="w-full h-11 text-sm font-semibold group"
          >
            {redirecting ? (
              <>
                <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-1.5 group-hover:scale-110 transition-transform" />
                Upgrade Now — Just $9.9/mo
                <ArrowRight className="h-4 w-4 ml-1.5 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </Button>
          <Button
            onClick={handleLater}
            variant="ghost"
            className="w-full h-9 text-xs text-muted-foreground hover:text-foreground"
          >
            {isExport ? t('exportPaywall.later') : <>Maybe later, I&apos;ll wait for tomorrow&apos;s credits</>}
          </Button>
        </div>

        {/* 信任徽章 */}
        <div className="bg-muted/30 border-t px-6 py-3">
          <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-7 h-4 bg-[#003087] rounded flex items-center justify-center">
                <span className="text-white text-[7px] font-bold">PP</span>
              </div>
              <span>PayPal</span>
            </div>
            <div className="w-px h-3 bg-border" />
            <div className="flex items-center gap-1">
              <div className="w-7 h-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded flex items-center justify-center">
                <span className="text-white text-[7px] font-bold">CR</span>
              </div>
              <span>Creem</span>
            </div>
            <div className="w-px h-3 bg-border" />
            <div className="flex items-center gap-1">
              <Shield className="h-2.5 w-2.5" />
              <span>SSL Secured</span>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* 内嵌支付弹窗：购买一次性积分包 */}
      <PaymentModal
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        plan={
          selectedPack
            ? {
                id: selectedPack.id,
                name: selectedPack.name,
                price: { cn: selectedPack.priceCn, intl: selectedPack.priceIntl },
                period: 'one-time',
                credits: selectedPack.credits,
              }
            : null
        }
        onSuccess={handlePackPaid}
      />

      {/* 邀请好友弹窗 */}
      <ReferralDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </Dialog>
  );
}
