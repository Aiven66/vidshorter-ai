'use client';

/**
 * 支付模态框组件
 * 
 * 支持 Creem 和 PayPal 两种支付方式
 * 
 * @example
 * ```tsx
 * import { PaymentModal } from './base/payment/PaymentModal';
 * 
 * function PricingPage() {
 *   const [open, setOpen] = useState(false);
 *   const [plan, setPlan] = useState(null);
 * 
 *   return (
 *     <>
 *       <Button onClick={() => { setPlan({ id: 'pro', name: 'Pro', price: { intl: 19.9 }, period: 'month' }); setOpen(true); }}>
 *         Subscribe
 *       </Button>
 *       <PaymentModal open={open} onOpenChange={setOpen} plan={plan} />
 *     </>
 *   );
 * }
 * ```
 */

import { useCallback, useEffect, useState } from 'react';
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
  WalletCards,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { PayPalCheckout } from './PayPalCheckout';

export interface PlanInfo {
  id: string;
  name: string;
  price: { cn: number; intl: number };
  period: string;
}

export interface PaymentModalProps {
  /** 控制模态框打开/关闭 */
  open: boolean;
  /** 模态框状态变化回调 */
  onOpenChange: (v: boolean) => void;
  /** 要订阅的计划信息 */
  plan: PlanInfo | null;
  /** 支付成功回调 */
  onPaymentSuccess?: () => void;
}

type PayMethod = 'creem' | 'paypal';
type PayState = 'selecting' | 'pending' | 'success' | 'failed';

export function PaymentModal({
  open,
  onOpenChange,
  plan,
  onPaymentSuccess,
}: PaymentModalProps) {
  const { user } = useAuth();
  const [method, setMethod] = useState<PayMethod>('creem');
  const [payState, setPayState] = useState<PayState>('selecting');
  const [paymentError, setPaymentError] = useState('');
  const [creemSessionId, setCreemSessionId] = useState('');
  const [pollingPayment, setPollingPayment] = useState(false);
  const [manualCheck, setManualCheck] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMethod('creem');
    setPayState('selecting');
    setPaymentError('');
    setCreemSessionId('');
    setPollingPayment(false);
    setManualCheck(false);
  }, [open]);

  const trackPaymentCompleted = useCallback((paymentMethod: PayMethod) => {
    // Analytics tracking if needed
    console.log('[Payment] Completed:', paymentMethod, plan);
  }, [plan]);

  const verifyCreemPayment = useCallback(async (sessionId: string, setAsSuccess = true) => {
    if (!sessionId) return false;
    try {
      const res = await fetch(`/api/payment/creem?session_id=${sessionId}`);
      const data = await res.json();
      if (data.paid) {
        if (setAsSuccess) {
          trackPaymentCompleted('creem');
          setPollingPayment(false);
          setPayState('success');
          onPaymentSuccess?.();
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [trackPaymentCompleted, onPaymentSuccess]);

  const pollCreemPayment = useCallback((sessionId: string) => {
    if (!sessionId) return undefined;
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

      const paid = await verifyCreemPayment(sessionId, true);
      if (paid) clearInterval(interval);
    }, 5000);

    return () => clearInterval(interval);
  }, [verifyCreemPayment]);

  useEffect(() => {
    if (payState !== 'pending' || method !== 'creem' || !creemSessionId) return undefined;
    return pollCreemPayment(creemSessionId);
  }, [payState, method, creemSessionId, pollCreemPayment]);

  const handleManualPaymentCheck = useCallback(async () => {
    if (!creemSessionId) return;
    setManualCheck(true);
    setPaymentError('');
    const paid = await verifyCreemPayment(creemSessionId, false);
    if (paid) {
      trackPaymentCompleted('creem');
      setPayState('success');
      onPaymentSuccess?.();
    } else {
      setPaymentError('Payment not confirmed. Please complete payment in the Creem window.');
    }
    setManualCheck(false);
  }, [creemSessionId, trackPaymentCompleted, verifyCreemPayment, onPaymentSuccess]);

  const handlePay = async () => {
    setPaymentError('');
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (!plan || method !== 'creem') return;

    setPayState('pending');
    try {
      const res = await fetch('/api/payment/creem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          userId: user.id,
          userEmail: user.email,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setPaymentError(data.error);
        setPayState('selecting');
        return;
      }

      if (!data.checkoutUrl) {
        setPaymentError('Failed to create checkout session');
        setPayState('selecting');
        return;
      }

      if (data.demo) {
        window.location.href = data.checkoutUrl;
        return;
      }

      setCreemSessionId(data.sessionId || '');
      window.open(data.checkoutUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setPaymentError('Network error, please try again');
      setPayState('selecting');
    }
  };

  const handleBack = () => {
    setPayState('selecting');
    setPaymentError('');
  };

  const handlePayPalSuccess = useCallback(() => {
    trackPaymentCompleted('paypal');
    setPayState('success');
    onPaymentSuccess?.();
  }, [trackPaymentCompleted, onPaymentSuccess]);

  const handlePayPalError = useCallback((message: string) => {
    setPaymentError(message);
  }, []);

  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70">
              <CreditCard className="h-5 w-5 text-primary-foreground" />
            </div>
            Subscribe to {plan.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-primary">${plan.price.intl}</span> / {plan.period}
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
                Your {plan.name} subscription is now active.<br />Credits have been added to your account.
              </p>
            </div>
            <Button className="mt-2 h-12 w-full text-base font-medium" onClick={() => onOpenChange(false)}>
              Continue
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
        ) : payState === 'pending' && method === 'creem' ? (
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
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30">
                <ExternalLink className="h-10 w-10 text-white" />
              </div>

              <div className="space-y-3 text-center">
                <h4 className="text-lg font-semibold">Checkout Page Opened</h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Complete your payment in the Creem checkout window.<br />
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
                    <span className="font-semibold text-primary">${plan.price.intl}/{plan.period}</span>
                    <ChevronRight className={`h-5 w-5 ${method === 'creem' ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                </div>
              </button>

              <button
                onClick={() => setMethod('paypal')}
                className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                  method === 'paypal'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#003087] shadow-md">
                      <WalletCards className="h-6 w-6 text-white" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">PayPal</span>
                        <Badge variant="secondary" className="bg-blue-100 text-xs text-blue-700">
                          Secure
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">PayPal balance, cards, and PayPal wallet</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-primary">${plan.price.intl}/{plan.period}</span>
                    <ChevronRight className={`h-5 w-5 ${method === 'paypal' ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                </div>
              </button>
            </div>

            {method === 'paypal' && user && (
              <PayPalCheckout
                planId={plan.id}
                userId={user.id}
                onSuccess={handlePayPalSuccess}
                onError={handlePayPalError}
              />
            )}

            {method === 'paypal' && !user && (
              <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                Please sign in before using PayPal checkout.
              </div>
            )}

            {method === 'creem' && (
              <Button className="h-12 w-full gap-2 text-base font-medium" onClick={handlePay}>
                <CreditCard className="h-5 w-5" />
                Pay with Creem
                <ChevronRight className="ml-auto h-4 w-4" />
              </Button>
            )}

            <div className="flex items-center justify-center gap-4 border-t border-muted pt-4">
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-8 items-center justify-center rounded bg-[#003087]">
                  <span className="text-[8px] font-bold text-white">PP</span>
                </div>
                <span className="text-xs text-muted-foreground">PayPal</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-8 items-center justify-center rounded bg-gradient-to-r from-violet-600 to-indigo-600">
                  <span className="text-[8px] font-bold text-white">CR</span>
                </div>
                <span className="text-xs text-muted-foreground">Creem</span>
              </div>
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
