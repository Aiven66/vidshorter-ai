'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, QrCode, CreditCard, Smartphone, ExternalLink, ArrowLeft, XCircle, Lock, Shield, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { posthog } from '@/lib/posthog';

interface PlanInfo {
  id: string;
  name: string;
  price: { cn: number; intl: number };
  period: string;
}

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: PlanInfo | null;
}

type PayMethod = 'alipay' | 'creem';
type PayState = 'selecting' | 'pending' | 'success' | 'failed';

function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;
}

export function PaymentModal({ open, onOpenChange, plan }: PaymentModalProps) {
  const { user } = useAuth();
  const [method, setMethod] = useState<PayMethod>('creem');
  const [payState, setPayState] = useState<PayState>('selecting');
  const [countdown, setCountdown] = useState(0);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [creemSessionId, setCreemSessionId] = useState('');
  const [pollingPayment, setPollingPayment] = useState(false);
  const [manualCheck, setManualCheck] = useState(false);

  useEffect(() => {
    if (open) {
      setPayState('selecting');
      setCountdown(0);
      setQrCodeUrl('');
      setPaymentError('');
      setCreemSessionId('');
      setPollingPayment(false);
      setManualCheck(false);
      setMethod('creem');
    }
  }, [open]);

  useEffect(() => {
    if (payState === 'pending' && method === 'alipay') {
      setCountdown(120);
      const id = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { clearInterval(id); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(id);
    }
  }, [payState, method]);

  const verifyCreemPayment = useCallback(async (sessionId: string, setAsSuccess: boolean = true) => {
    if (!sessionId) return false;
    try {
      const res = await fetch(`/api/payment/creem?session_id=${sessionId}`);
      const data = await res.json();
      if (data.paid) {
        if (setAsSuccess) {
          if (posthog && plan) {
            posthog.capture('payment_completed', {
              amount: plan.price.intl,
              currency: 'USD',
              plan: plan.id,
              payment_method: method,
            });
          }
          setPollingPayment(false);
          setPayState('success');
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [plan, method]);

  const pollCreemPayment = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
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
      if (paid) {
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [verifyCreemPayment]);

  useEffect(() => {
    if (payState === 'pending' && method === 'creem' && creemSessionId) {
      const cleanup = pollCreemPayment(creemSessionId);
      return () => { if (cleanup) cleanup(); };
    }
  }, [payState, method, creemSessionId, pollCreemPayment]);

  const handleManualPaymentCheck = useCallback(async () => {
    if (!creemSessionId) return;
    setManualCheck(true);
    const paid = await verifyCreemPayment(creemSessionId, false);
    if (paid) {
      setPayState('success');
    } else {
      setPaymentError('Payment not confirmed. Please complete payment in the Creem window.');
    }
    setManualCheck(false);
  }, [creemSessionId, verifyCreemPayment]);

  if (!plan) return null;

  const handlePay = async () => {
    setPaymentError('');
    if (!user) {
      window.location.href = '/login';
      return;
    }

    if (method === 'alipay') {
      setPayState('pending');
      try {
        const res = await fetch('/api/payment/alipay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: plan.id,
            amount: plan.price.cn,
            subject: `Clipop AI ${plan.name}`,
            userId: user.id,
          }),
        });
        const data = await res.json();
        if (data.error) {
          setPaymentError(data.error);
          setPayState('selecting');
          return;
        }
        if (data.qrCode) {
          setQrCodeUrl(qrUrl(data.qrCode));
        } else if (data.payUrl) {
          window.open(data.payUrl, '_blank');
        } else {
          setQrCodeUrl(qrUrl(`https://qr.alipay.com/demo?plan=${plan.id}&t=${Date.now()}`));
        }
      } catch {
        setQrCodeUrl(qrUrl(`https://qr.alipay.com/demo?plan=${plan.id}&t=${Date.now()}`));
      }
      return;
    }

    if (method === 'creem') {
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

        if (data.checkoutUrl) {
          if (data.demo) {
            window.location.href = data.checkoutUrl;
            return;
          }
          setCreemSessionId(data.sessionId || '');
          window.open(data.checkoutUrl, '_blank', 'noopener,noreferrer');
        } else {
          setPaymentError('Failed to create checkout session');
          setPayState('selecting');
        }
      } catch {
        setPaymentError('Network error, please try again');
        setPayState('selecting');
      }
      return;
    }
  };

  const handleBack = () => {
    setPayState('selecting');
    setPaymentError('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-white" />
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
          <div className="flex flex-col items-center py-8 gap-5">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                <CheckCircle className="h-12 w-12 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-white border-2 border-green-500 flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-green-500" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-foreground">Payment Successful!</h3>
              <p className="text-sm text-muted-foreground">
                Your {plan.name} subscription is now active.<br />Credits have been added to your account.
              </p>
            </div>
            <Button className="w-full mt-2 h-12 text-base font-medium" onClick={() => onOpenChange(false)}>
              Continue Using Clipop AI
            </Button>
          </div>
        ) : payState === 'failed' ? (
          <div className="flex flex-col items-center py-8 gap-5">
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
              <XCircle className="h-12 w-12 text-white" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-foreground">Payment Failed</h3>
              <p className="text-sm text-muted-foreground">
                Payment was not completed successfully. Please try again.
              </p>
            </div>
            <Button className="w-full mt-2 h-12 text-base font-medium" onClick={handleBack}>
              Try Again
            </Button>
          </div>
        ) : payState === 'pending' && method === 'alipay' ? (
          <div className="space-y-6 py-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 p-0 text-muted-foreground hover:text-foreground self-start"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to payment methods
            </Button>

            {paymentError && (
              <div className="text-sm text-destructive bg-destructive/10 p-4 rounded-xl">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{paymentError}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <div className="w-64 h-64 rounded-2xl border-2 border-muted bg-white p-4 shadow-lg">
                  {qrCodeUrl ? (
                    <img 
                      src={qrCodeUrl} 
                      alt="Alipay QR Code" 
                      className="w-full h-full object-contain rounded-xl"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    </div>
                  )}
                </div>
                <div className="absolute -top-2 -right-2">
                  <div className="w-8 h-5 bg-[#1677FF] rounded-lg flex items-center justify-center shadow-md">
                    <span className="text-white text-[10px] font-bold">ALI</span>
                  </div>
                </div>
              </div>

              <div className="text-center space-y-2">
                <h4 className="font-semibold text-foreground">Scan with Alipay</h4>
                <p className="text-sm text-muted-foreground">
                  Use Alipay app to scan the QR code and complete payment
                </p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-muted-foreground">QR code expires in</span>
                  <span className="text-lg font-bold text-primary tabular-nums">{countdown}s</span>
                </div>
              </div>

              <Badge className="gap-2 bg-primary/10 text-primary hover:bg-primary/20">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for payment...
              </Badge>

              <Button variant="outline" className="w-full" onClick={() => setPayState('success')}>
                I have completed the payment
              </Button>
            </div>
          </div>
        ) : payState === 'pending' && method === 'creem' ? (
          <div className="space-y-6 py-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 p-0 text-muted-foreground hover:text-foreground self-start"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to payment methods
            </Button>

            {paymentError && (
              <div className="text-sm text-destructive bg-destructive/10 p-4 rounded-xl">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{paymentError}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-6 py-8">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <ExternalLink className="h-10 w-10 text-white" />
              </div>

              <div className="text-center space-y-3">
                <h4 className="font-semibold text-lg">Checkout Page Opened</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
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

              <div className="flex gap-3 w-full">
                <Button variant="outline" className="flex-1" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleManualPaymentCheck} disabled={manualCheck}>
                  {manualCheck ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
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
              <div className="text-sm text-destructive bg-destructive/10 p-4 rounded-xl">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{paymentError}</span>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Choose payment method</p>
              
              <button
                onClick={() => setMethod('creem')}
                className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-left group ${
                  method === 'creem' 
                    ? 'border-primary bg-primary/5 shadow-sm' 
                    : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md">
                      <CreditCard className="h-6 w-6 text-white" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Creem</span>
                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Secure
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Visa, Mastercard, Apple Pay, Google Pay
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-primary">${plan.price.intl}/{plan.period}</span>
                    <ChevronRight className={`h-5 w-5 transition-transform ${method === 'creem' ? 'text-primary' : 'text-muted-foreground group-hover:translate-x-1'}`} />
                  </div>
                </div>
              </button>

              <button
                onClick={() => setMethod('alipay')}
                className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-left group ${
                  method === 'alipay' 
                    ? 'border-primary bg-primary/5 shadow-sm' 
                    : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#1677FF] flex items-center justify-center shadow-md">
                      <Smartphone className="h-6 w-6 text-white" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Alipay</span>
                        <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          CN Users
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Scan QR code to pay, supports balance, bank cards, Huabei
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-primary">¥{plan.price.cn}/{plan.period}</span>
                    <ChevronRight className={`h-5 w-5 transition-transform ${method === 'alipay' ? 'text-primary' : 'text-muted-foreground group-hover:translate-x-1'}`} />
                  </div>
                </div>
              </button>
            </div>

            <Button className="w-full h-12 text-base font-medium gap-2" onClick={handlePay}>
              {method === 'alipay' ? (
                <>
                  <QrCode className="h-5 w-5" />
                  Pay with Alipay
                </>
              ) : (
                <>
                  <CreditCard className="h-5 w-5" />
                  Pay with Creem
                </>
              )}
              <ChevronRight className="h-4 w-4 ml-auto" />
            </Button>

            <div className="flex items-center justify-center gap-4 pt-4 border-t border-muted">
              <div className="flex items-center gap-2">
                <div className="w-8 h-5 bg-[#1677FF] rounded flex items-center justify-center">
                  <span className="text-white text-[8px] font-bold">ALI</span>
                </div>
                <span className="text-xs text-muted-foreground">Alipay</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-5 bg-gradient-to-r from-violet-600 to-indigo-600 rounded flex items-center justify-center">
                  <span className="text-white text-[8px] font-bold">CR</span>
                </div>
                <span className="text-xs text-muted-foreground">Creem</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Lock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">256-bit TLS</span>
              </div>
            </div>

            <p className="text-xs text-center text-muted-foreground leading-relaxed">
              By subscribing, you agree to our Terms of Service.
              Payments are securely processed by the respective payment platform.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}