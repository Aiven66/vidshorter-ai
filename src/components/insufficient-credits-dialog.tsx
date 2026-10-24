'use client';

import { useState } from 'react';
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
import { formatSavedTime } from '@/lib/value-estimate';

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
  /** 本次已为用户节省的剪辑时间（分钟）：把「已经拿到的价值」放在付费决策之前。 */
  savedMinutes?: number;
  /** 已生成片段的缩略图：模糊预览，让用户看到「成品已经在这里了」。 */
  previewImage?: string;
  /** 支付成功（就地解锁）后回调。creditsPurchase=true 表示买的是一次性积分包而非订阅。 */
  onUnlocked?: (info: { creditsPurchase: boolean }) => void;
}

/** 弹窗内可直接购买的一次性积分包（ids 与 CREDIT_PACKS 保持一致）。 */
const MINI_PACKS = [
  { id: 'credits_120', name: 'Starter Pack', credits: 120, priceIntl: 2.99, priceCn: 19 },
  { id: 'credits_300', name: 'Boost Pack', credits: 300, priceIntl: 6.99, priceCn: 49 },
];

/** 就地订阅的套餐信息（与 PaymentModal 的 PlanInfo 对齐，id 与后端 plan 一致）。 */
const STARTER_PLAN = {
  id: 'starter',
  name: 'Starter',
  price: { cn: 49, intl: 9.9 },
  period: 'month',
};

type PayPlan = {
  id: string;
  name: string;
  price: { cn: number; intl: number };
  period: string;
  credits?: number;
};

/**
 * 积分不足 / 导出被拦截时的强付费引导对话框
 *
 * UX 设计原则:
 *  - 不显示"错误"字样,而是用积极的措辞引导("升级解锁更多")
 *  - 先展示已经拿到的价值（已节省时间 + 成片模糊预览），再谈价格
 *  - 突出 Starter 套餐的性价比 (Most Popular, $9.9/月)
 *  - 就地成交：主按钮直接打开支付弹窗（不再跳转定价页），支付后原地解锁并自动重放被拦截的操作
 *  - 双 CTA: 主按钮"立即升级",次按钮"稍后再说",底部保留「对比全部套餐」的次级入口
 *  - 添加信任徽章 (Waffo/Creem/SSL) 降低付费焦虑
 *  - 使用 Framer 风格的入场动画 (由 Radix Dialog 提供)
 */
export function InsufficientCreditsDialog({
  open,
  onOpenChange,
  currentBalance = 0,
  requiredCredits = 60,
  reason = 'credits',
  savedMinutes,
  previewImage,
  onUnlocked,
}: InsufficientCreditsDialogProps) {
  const { t, locale } = useLocale();
  const isExport = reason === 'export';
  const { refreshCredits } = useCredits();
  const [payPlan, setPayPlan] = useState<PayPlan | null>(null);
  // 邀请好友弹窗（为本弹窗提供一个「不花钱也能拿积分」的替代路径）
  const [inviteOpen, setInviteOpen] = useState(false);

  const handleBuyPack = (pack: (typeof MINI_PACKS)[number]) => {
    setPayPlan({
      id: pack.id,
      name: pack.name,
      price: { cn: pack.priceCn, intl: pack.priceIntl },
      period: 'one-time',
      credits: pack.credits,
    });
  };

  // 支付成功后：刷新额度/套餐状态 → 关闭两层弹窗 → 通知调用方原地重放被拦截的操作
  const handlePaid = async () => {
    const creditsPurchase = !!payPlan?.credits;
    setPayPlan(null);
    try {
      await refreshCredits();
    } catch {
      /* 刷新失败不阻塞解锁流程；服务端才是额度的真源 */
    }
    onOpenChange(false);
    onUnlocked?.({ creditsPurchase });
  };

  // 主 CTA：就地打开订阅支付（不再跳 /pricing，避免漏斗断在页面切换）
  const handleUpgrade = () => {
    setPayPlan(STARTER_PLAN);
  };

  const handleLater = () => {
    onOpenChange(false);
  };

  const goToAllPlans = () => {
    if (typeof window === 'undefined') return;
    window.location.href = isExport
      ? '/pricing?source=export_paywall'
      : '/pricing?source=insufficient_credits';
  };

  // 计算需要补充的积分
  const creditsShort = Math.max(0, requiredCredits - currentBalance);
  const showValue = typeof savedMinutes === 'number' && savedMinutes > 0;

  // 积分包：一次性付费、不自动续费。导出场景下积分包**不能**解锁本次下载（服务端按套餐门控），
  // 因此文案只承诺「继续生成」；订阅才是解锁导出的路径。
  const packsBlock = (
    <div className="px-6 pb-3 pt-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-2">
        <Plus className="h-3.5 w-3.5 text-primary" />
        {isExport
          ? (locale === 'zh' ? '想继续做更多？买积分包 —— 无需订阅' : 'Need more clips? Buy credits — no subscription')
          : (locale === 'zh' ? '一步解锁 —— 一次付费，无需订阅' : 'Unlock in one click — pay once, no subscription')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {MINI_PACKS.map((pack, idx) => (
          <button
            key={pack.id}
            onClick={() => handleBuyPack(pack)}
            className="relative rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-primary/5 p-3 text-left transition-all duration-200"
          >
            {idx === 0 && !isExport && (
              <Badge className="absolute -top-2 right-2 bg-primary text-primary-foreground text-[9px] px-1.5 py-0 h-4 font-semibold">
                {locale === 'zh' ? '够 2 条' : '2 clips'}
              </Badge>
            )}
            <div className="flex items-center gap-1.5 mb-1">
              <Coins className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-sm font-semibold">{pack.credits} credits</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold">${pack.priceIntl}</span>
              <span className="text-[10px] text-muted-foreground">one-time</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {locale === 'zh'
                ? `约 ${Math.max(1, Math.floor(pack.credits / requiredCredits))} 条成片`
                : `~${Math.max(1, Math.floor(pack.credits / requiredCredits))} clips`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const subscriptionBlock = (
    <div className="px-6 pb-4 pt-1">
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
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] p-0 overflow-y-auto max-h-[92vh] gap-0">
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

        {/* 价值前置：已经拿到的成果 + 已节省的剪辑时间（P0-3 / P0-4） */}
        {(previewImage || showValue) && (
          <div className="px-6 pt-3">
            {previewImage && (
              <div className="relative overflow-hidden rounded-xl border bg-muted">
                <img
                  src={previewImage}
                  alt="Your generated highlight"
                  className="h-28 w-full scale-110 object-cover blur-[5px]"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-background/35">
                  <span className="flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1 text-[11px] font-medium text-foreground shadow-sm">
                    <Zap className="h-3 w-3 text-primary" />
                    {locale === 'zh' ? '成片已生成，解锁即可下载' : 'Ready to download — locked'}
                  </span>
                </div>
              </div>
            )}
            {showValue && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-primary" />
                {locale === 'zh'
                  ? `已为你节省约 ${formatSavedTime(savedMinutes as number, locale)} 剪辑时间`
                  : `We already saved you about ${formatSavedTime(savedMinutes as number, locale)} of editing`}
              </p>
            )}
          </div>
        )}

        {/* ③④ 积分包 / 订阅：导出场景订阅在前（积分包不解锁下载），积分不足场景积分包在前 */}
        {isExport ? (
          <>
            {subscriptionBlock}
            {packsBlock}
          </>
        ) : (
          <>
            {packsBlock}
            {subscriptionBlock}
          </>
        )}

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
            className="w-full h-11 text-sm font-semibold group"
          >
            <Zap className="h-4 w-4 mr-1.5 group-hover:scale-110 transition-transform" />
            {locale === 'zh' ? '立即解锁 ｜ 只需 $9.9/月' : 'Unlock Now — Just $9.9/mo'}
            <ArrowRight className="h-4 w-4 ml-1.5 group-hover:translate-x-0.5 transition-transform" />
          </Button>
          <Button
            onClick={handleLater}
            variant="ghost"
            className="w-full h-9 text-xs text-muted-foreground hover:text-foreground"
          >
            {isExport ? t('exportPaywall.later') : <>Maybe later, I&apos;ll wait for tomorrow&apos;s credits</>}
          </Button>
          <button
            type="button"
            onClick={goToAllPlans}
            className="w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            {locale === 'zh' ? '对比全部套餐' : 'Compare all plans'}
          </button>
        </div>

        {/* 信任徽章 */}
        <div className="bg-muted/30 border-t px-6 py-3">
          <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-7 h-4 bg-primary rounded flex items-center justify-center">
                <span className="text-primary-foreground text-[7px] font-bold">WF</span>
              </div>
              <span>Waffo</span>
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

      {/* 内嵌支付弹窗：订阅或一次性积分包，均在本弹窗内完成（不跳页） */}
      <PaymentModal
        open={!!payPlan}
        onOpenChange={(v) => { if (!v) setPayPlan(null); }}
        plan={payPlan}
        onSuccess={handlePaid}
      />

      {/* 邀请好友弹窗 */}
      <ReferralDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </Dialog>
  );
}
