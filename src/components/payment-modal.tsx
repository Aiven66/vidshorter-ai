'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Loader2,
  Lock,
  Shield,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { posthog } from '@/lib/posthog';
import { trackEvent, trackCustomEvent, SUBSCRIBE_FUNNEL, CONVERSION_FUNNEL, CONVERSION_EVENTS } from '@/lib/analytics';

interface PlanInfo {
  id: string;
  name: string;
  price: { cn: number; intl: number };
  period: string;
  /** When present, this is a one-time credit pack (not a subscription). */
  credits?: number;
}

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: PlanInfo | null;
  /** Fired once when a payment completes successfully (any channel). */
  onSuccess?: () => void;
}

type PayMethod = 'creem' | 'waffo';
type PayState = 'selecting' | 'pending' | 'success' | 'failed';

export function PaymentModal({ open, onOpenChange, plan, onSuccess }: PaymentModalProps) {
  const { user } = useAuth();
  // 支付主路径：Waffo 为默认，Creem 保留为可选通道（两者都可用，不再出现 PayPal 等死通道）。
  const [method, setMethod] = useState<PayMethod>('waffo');
  const [payState, setPayState] = useState<PayState>('selecting');
  const [paymentError, setPaymentError] = useState('');
  const [redirectPollUrl, setRedirectPollUrl] = useState('');
  const [pollingPayment, setPollingPayment] = useState(false);
  const [manualCheck, setManualCheck] = useState(false);
  // 支付摩擦观测：记录失败通道（用于引导切换到另一条通道）与是否已上报放弃。
  const [failedMethod, setFailedMethod] = useState<PayMethod | null>(null);
  const abandonedTrackedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setMethod('waffo');
    setPayState('selecting');
    setPaymentError('');
    setRedirectPollUrl('');
    setPollingPayment(false);
    setManualCheck(false);
    setFailedMethod(null);
    abandonedTrackedRef.current = false;
  }, [open]);

  // 放弃结算：进入支付中状态 30 秒仍未完成 → 记一次 checkout_abandoned。
  // 只在模态仍打开、且尚未上报时触发，避免与「关闭弹窗」重复计数。
  useEffect(() => {
    if (!open || payState !== 'pending' || abandonedTrackedRef.current) return undefined;
    const timer = setTimeout(() => {
      if (abandonedTrackedRef.current) return;
      abandonedTrackedRef.current = true;
      trackCustomEvent(CONVERSION_EVENTS.CHECKOUT_ABANDONED, {
        plan_id: plan?.id || null,
        payment_method: method,
        is_credit_pack: !!plan?.credits,
        reason: 'timeout_30s',
      });
    }, 30_000);
    return () => clearTimeout(timer);
  }, [open, payState, method, plan]);

  // 关闭弹窗时若仍在支付中，同样视为放弃（用户主动离开）。
  const handleOpenChange = useCallback((next: boolean) => {
    if (!next && payState === 'pending' && !abandonedTrackedRef.current) {
      abandonedTrackedRef.current = true;
      trackCustomEvent(CONVERSION_EVENTS.CHECKOUT_ABANDONED, {
        plan_id: plan?.id || null,
        payment_method: method,
        is_credit_pack: !!plan?.credits,
        reason: 'closed_dialog',
      });
    }
    onOpenChange(next);
  }, [payState, method, plan, onOpenChange]);

  const trackPaymentCompleted = useCallback((paymentMethod: PayMethod) => {
    if (!posthog || !plan) return;
    posthog.capture('payment_completed', {
      amount: plan.price.intl,
      currency: 'USD',
      plan: plan.id,
      payment_method: paymentMethod,
    });

    // 行为埋点：付费订阅成功 (subscription funnel step 3)
    trackEvent(SUBSCRIBE_FUNNEL.SUBSCRIBE_SUCCESS, {
      data: {
        plan_id: plan.id,
        plan_name: plan.name,
        amount_usd: plan.price.intl,
        payment_method: paymentMethod,
      },
    });

    // 一次性积分包与订阅分开计数：P0-3 的漏斗验收需要「credit_pack_paid」独立可测，
    // 否则低价首单会被混进订阅成功，看不清首单转化。
    if (plan.credits) {
      trackCustomEvent(CONVERSION_EVENTS.CREDIT_PACK_PAID, {
        plan_id: plan.id,
        credits: plan.credits,
        amount_usd: plan.price.intl,
        payment_method: paymentMethod,
      });
    }
  }, [plan]);

  // 支付成功时触发 onSuccess（用于刷新积分等副作用）
  useEffect(() => {
    if (payState === 'success') {
      // 已成功即不再算放弃，避免 30 秒计时器误报。
      abandonedTrackedRef.current = true;
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payState]);

  const verifyRedirectPayment = useCallback(async (pollUrl: string, setAsSuccess = true) => {
    if (!pollUrl) return false;
    try {
      const res = await fetch(pollUrl);
      const data = await res.json();
      if (data.paid) {
        if (setAsSuccess) {
          trackPaymentCompleted(method);
          setPollingPayment(false);
          setPayState('success');
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [trackPaymentCompleted, method]);

  const pollRedirectPayment = useCallback((pollUrl: string) => {
    if (!pollUrl) return undefined;
    setPollingPayment(true);
    let attempts = 0;
    const maxAttempts = 60;

    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        setPollingPayment(false);
        return;
      }

      const paid = await verifyRedirectPayment(pollUrl, true);
      if (paid) clearInterval(interval);
    }, 5000);

    return () => clearInterval(interval);
  }, [verifyRedirectPayment]);

  useEffect(() => {
    if (payState !== 'pending') return undefined;
    if (method !== 'creem' && method !== 'waffo') return undefined;
    if (!redirectPollUrl) return undefined;
    return pollRedirectPayment(redirectPollUrl);
  }, [payState, method, redirectPollUrl, pollRedirectPayment]);

  const handleManualPaymentCheck = useCallback(async () => {
    if (!redirectPollUrl) return;
    setManualCheck(true);
    setPaymentError('');
    const paid = await verifyRedirectPayment(redirectPollUrl, false);
    if (paid) {
      trackPaymentCompleted(method);
      setPayState('success');
    } else {
      setPaymentError('Payment not confirmed. Please complete payment in the checkout window.');
    }
    setManualCheck(false);
  }, [redirectPollUrl, trackPaymentCompleted, verifyRedirectPayment, method]);

  const handleRedirectPay = async () => {
    setPaymentError('');
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (!plan) return;

    setPayState('pending');
    try {
      const res = await fetch(`/api/payment/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          userId: user.id,
          userEmail: user.email,
        }),
      });
      const data = await res.json();

      if (data.error || !data.checkoutUrl) {
        // 支付断路可观测：创建 checkout 失败必须留痕，否则「付费为零」无法定位到通道。
        const reason = data.error || 'missing_checkout_url';
        trackCustomEvent('payment_checkout_failed', {
          plan_id: plan.id,
          payment_method: method,
          http_status: res.status,
          reason: String(reason).slice(0, 200),
        });
        setPaymentError(
          `${reason}${method === 'creem' ? ' Try Waffo instead — it is our primary checkout channel.' : ' Please try again.'}`,
        );
        setFailedMethod(method);
        setPayState('selecting');
        return;
      }

      if (data.demo) {
        window.location.href = data.checkoutUrl;
        return;
      }

      // 转化漏斗 step 7：结算开始（本地与远程支付同口径）
      trackEvent(CONVERSION_FUNNEL.CHECKOUT_STARTED, {
        data: {
          plan_id: plan.id,
          payment_method: method,
          is_credit_pack: !!plan.credits,
        },
      });

      // Creem polls by session_id; Waffo polls by user_id (subscription status)
      const pollUrl = method === 'creem'
        ? `/api/payment/creem?session_id=${encodeURIComponent(data.sessionId || '')}`
        : `/api/payment/waffo?user_id=${encodeURIComponent(user.id)}`;
      setRedirectPollUrl(pollUrl);
      window.open(data.checkoutUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setPaymentError('Network error, please try again');
      setFailedMethod(method);
      setPayState('selecting');
    }
  };

  const handleBack = () => {
    setPayState('selecting');
    setPaymentError('');
  };

  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70">
              <CreditCard className="h-5 w-5 text-primary-foreground" />
            </div>
            {plan.credits ? `Buy ${plan.credits} credits` : `Subscribe to ${plan.name}`}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-sm">
            {plan.credits ? (
              <span className="font-semibold text-primary">
                ${plan.price.intl} · one-time
              </span>
            ) : (
              <>
                <span className="font-semibold text-primary">${plan.price.intl}</span> / {plan.period}
              </>
            )}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Secure Payment
            </span>
          </DialogDescription>
        </DialogHeader>

        {payState === 'success' ? (
          <div className="flex flex-col items-center gap-5 py-8">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600 shadow-lg shadow-green-500/30">
              <CheckCircle className="h-12 w-12 text-white" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="text-xl font-bold text-foreground">Payment Successful!</h3>
              <p className="text-sm text-muted-foreground">
                {plan.credits
                  ? `Your ${plan.credits} credits have been added to your balance.`
                  : `Your ${plan.name} subscription is now active.<br />Credits have been added to your account.`}
              </p>
            </div>
            <div className="w-full space-y-2 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
              <p className="flex items-start gap-2">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  {plan.credits
                    ? 'One-time purchase — credits never auto-renew.'
                    : 'Auto-renews monthly. Cancel anytime from your dashboard; access continues until the end of the period.'}
                </span>
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>7-day money-back guarantee on your first subscription.</span>
              </p>
              <p className="flex items-start gap-2">
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  Questions or refunds: <a className="text-primary underline" href="mailto:support@clipop.ai">support@clipop.ai</a>
                </span>
              </p>
            </div>
            <Button className="mt-2 h-12 w-full text-base font-medium" onClick={() => onOpenChange(false)}>
              Continue Using Clipop AI
            </Button>
          </div>
        ) : payState === 'failed' ? (
          <div className="flex flex-col items-center gap-5 py-8">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-400 to-red-600 shadow-lg shadow-red-500/30">
              <XCircle className="h-12 w-12 text-white" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="text-xl font-bold text-foreground">Payment Failed</h3>
              <p className="text-sm text-muted-foreground">Payment was not completed successfully. Please try again.</p>
            </div>
            <Button className="mt-2 h-12 w-full text-base font-medium" onClick={handleBack}>
              Try Again
            </Button>
          </div>
        ) : payState === 'pending' && (method === 'creem' || method === 'waffo') ? (
          <div className="space-y-6 py-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 self-start p-0 text-muted-foreground hover:text-foreground"
              onClick={handleBack}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to payment methods
            </Button>

            {paymentError && (
              <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{paymentError}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-6 py-8">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-gold-light to-gold-dim shadow-lg shadow-gold/30">
                <ExternalLink className="h-10 w-10 text-primary-foreground" />
              </div>

              <div className="space-y-3 text-center">
                <h4 className="text-lg font-semibold">Checkout Page Opened</h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Complete your payment in the {method === 'waffo' ? 'Waffo' : 'Creem'} checkout window.<br />
                  This dialog will automatically detect when payment is complete.
                </p>
              </div>

              {pollingPayment && (
                <Badge variant="outline" className="gap-2 px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking payment status...
                </Badge>
              )}

              <div className="flex w-full gap-3">
                <Button variant="outline" className="flex-1" onClick={handleBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleManualPaymentCheck} disabled={manualCheck}>
                  {manualCheck ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Verify Payment
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>Your payment information is encrypted and secure</span>
            </div>

            {paymentError && (
              <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{paymentError}</span>
                </div>
                {failedMethod === 'waffo' && (
                  <Button
                    variant="outline"
                    className="mt-3 w-full gap-2 border-destructive/40 text-foreground"
                    onClick={() => {
                      // 通道兜底：Waffo 创建订单失败 → 让用户改走 Creem，而不是只能反复重试。
                      setMethod('creem');
                      setPaymentError('');
                      setFailedMethod(null);
                      setPayState('selecting');
                    }}
                  >
                    <CreditCard className="h-4 w-4" />
                    Pay with Creem instead
                    <ChevronRight className="ml-auto h-4 w-4" />
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Choose payment method</p>

              <button
                onClick={() => setMethod('creem')}
                className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                  method === 'creem'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md">
                      <CreditCard className="h-6 w-6 text-white" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Creem</span>
                        <Badge variant="secondary" className="bg-green-100 text-xs text-green-700">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Secure
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Visa, Mastercard, Apple Pay, Google Pay</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-primary">
                      ${plan.price.intl}{plan.credits ? '' : `/${plan.period}`}
                    </span>
                    <ChevronRight className={`h-5 w-5 ${method === 'creem' ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                </div>
              </button>

              {!plan.credits && (
                <button
                  onClick={() => setMethod('waffo')}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                    method === 'waffo'
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-md">
                        <Wallet className="h-6 w-6 text-white" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Waffo</span>
                          <Badge variant="secondary" className="bg-blue-100 text-xs text-blue-700">
                            Global
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Cards, Apple Pay, Google Pay</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-primary">
                        ${plan.price.intl}/{plan.period}
                      </span>
                      <ChevronRight className={`h-5 w-5 ${method === 'waffo' ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                  </div>
                </button>
              )}
            </div>

            {method === 'creem' && (
              <Button className="h-12 w-full gap-2 text-base font-medium" onClick={handleRedirectPay}>
                <CreditCard className="h-5 w-5" />
                Pay with Creem
                <ChevronRight className="ml-auto h-4 w-4" />
              </Button>
            )}

            {method === 'waffo' && (
              <Button className="h-12 w-full gap-2 text-base font-medium" onClick={handleRedirectPay}>
                <Wallet className="h-5 w-5" />
                Pay with Waffo
                <ChevronRight className="ml-auto h-4 w-4" />
              </Button>
            )}

            <div className="flex items-center justify-center gap-4 border-t border-muted pt-4">
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-8 items-center justify-center rounded bg-gradient-to-r from-violet-600 to-indigo-600">
                  <span className="text-[8px] font-bold text-white">CR</span>
                </div>
                <span className="text-xs text-muted-foreground">Creem</span>
              </div>
              {!plan.credits && (
                <div className="flex items-center gap-2">
                  <div className="flex h-5 w-8 items-center justify-center rounded bg-gradient-to-r from-amber-500 to-orange-600">
                    <span className="text-[8px] font-bold text-white">WF</span>
                  </div>
                  <span className="text-xs text-muted-foreground">Waffo</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Lock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">256-bit TLS</span>
              </div>
            </div>

            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              By subscribing, you agree to our Terms of Service.
              Payments are securely processed by the respective payment platform.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
