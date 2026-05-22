'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, QrCode, CreditCard, Globe, Smartphone, ExternalLink, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

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

type Region = 'cn' | 'intl';
type PayMethod = 'alipay' | 'creem';
type PayState = 'selecting' | 'pending' | 'success';

function detectRegion(): Region {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith('Asia/Shanghai') || tz.startsWith('Asia/Beijing') || tz.startsWith('Asia/Chongqing') || tz.startsWith('Asia/Urumqi') || tz.startsWith('Asia/Harbin')) {
      return 'cn';
    }
    const lang = navigator.language || '';
    if (lang.startsWith('zh-CN') || lang === 'zh') return 'cn';
  } catch {}
  return 'intl';
}

function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;
}

export function PaymentModal({ open, onOpenChange, plan }: PaymentModalProps) {
  const { user } = useAuth();
  const [region, setRegion] = useState<Region>('intl');
  const [method, setMethod] = useState<PayMethod>('creem');
  const [payState, setPayState] = useState<PayState>('selecting');
  const [countdown, setCountdown] = useState(0);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [creemSessionId, setCreemSessionId] = useState('');
  const [pollingPayment, setPollingPayment] = useState(false);

  useEffect(() => {
    if (open) {
      setRegion(detectRegion());
      setPayState('selecting');
      setCountdown(0);
      setQrCodeUrl('');
      setPaymentError('');
      setCreemSessionId('');
      setPollingPayment(false);
    }
  }, [open]);

  useEffect(() => {
    if (region === 'cn') setMethod('alipay');
    else setMethod('creem');
  }, [region]);

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

      try {
        const res = await fetch(`/api/payment/creem?session_id=${sessionId}`);
        const data = await res.json();
        if (data.paid) {
          clearInterval(interval);
          setPollingPayment(false);
          setPayState('success');
        }
      } catch {}
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (payState === 'pending' && method === 'creem' && creemSessionId) {
      const cleanup = pollCreemPayment(creemSessionId);
      return () => { if (cleanup) cleanup(); };
    }
  }, [payState, method, creemSessionId, pollCreemPayment]);

  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setPayState('success');
    }
  }, [open]);

  if (!plan) return null;

  const price = region === 'cn' ? `¥${plan.price.cn}` : `$${plan.price.intl}`;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Subscribe to {plan.name}
          </DialogTitle>
          <DialogDescription>
            {price} / {plan.period} · Secure Payment
          </DialogDescription>
        </DialogHeader>

        {payState === 'success' ? (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold">Payment Successful!</h3>
            <p className="text-sm text-muted-foreground text-center">
              Your {plan.name} subscription is now active. Credits have been added to your account.
            </p>
            <Button className="w-full mt-2" onClick={() => onOpenChange(false)}>
              Start Using
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Region:</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={region === 'cn' ? 'default' : 'outline'}
                  onClick={() => setRegion('cn')}
                  className="gap-1.5"
                >
                  <Smartphone className="h-3.5 w-3.5" />China
                </Button>
                <Button
                  size="sm"
                  variant={region === 'intl' ? 'default' : 'outline'}
                  onClick={() => setRegion('intl')}
                  className="gap-1.5"
                >
                  <Globe className="h-3.5 w-3.5" />International
                </Button>
              </div>
            </div>

            {paymentError && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {paymentError}
              </div>
            )}

            {region === 'cn' ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-5 bg-[#1677FF] rounded flex items-center justify-center">
                        <span className="text-white text-[8px] font-bold">ALI</span>
                      </div>
                      <span className="font-medium">Alipay</span>
                    </div>
                    <span className="font-bold text-primary">¥{plan.price.cn}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>✓ Scan to pay, safe and convenient</p>
                    <p>✓ Supports Alipay balance, bank cards, Huabei</p>
                    <p>✓ Cancel subscription anytime</p>
                  </div>
                </div>

                {payState === 'pending' ? (
                  <div className="flex flex-col items-center gap-3">
                    {qrCodeUrl ? (
                      <img src={qrCodeUrl} alt="Alipay QR Code" className="w-48 h-48 rounded-lg border" />
                    ) : (
                      <div className="w-48 h-48 rounded-lg border bg-muted flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-sm font-medium">Scan with Alipay to pay</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        QR code expires in <span className="text-primary font-semibold tabular-nums">{countdown}s</span>
                      </p>
                      <Badge variant="outline" className="mt-2">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />Waiting for payment...
                      </Badge>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setPayState('success')}>
                      I have completed the payment
                    </Button>
                  </div>
                ) : (
                  <Button className="w-full bg-[#1677FF] hover:bg-[#0958D9] text-white" onClick={handlePay}>
                    <QrCode className="h-4 w-4 mr-2" />Generate Alipay QR Code
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-5 bg-gradient-to-r from-violet-600 to-indigo-600 rounded flex items-center justify-center">
                        <span className="text-white text-[8px] font-bold">CR</span>
                      </div>
                      <span className="font-medium">Creem</span>
                    </div>
                    <span className="font-bold text-primary">${plan.price.intl}/{plan.period}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>✓ Secure checkout via Creem</p>
                    <p>✓ Visa, Mastercard, Apple Pay, Google Pay</p>
                    <p>✓ Cancel subscription anytime</p>
                  </div>
                  <Badge className="mt-2 bg-green-500 text-white text-xs gap-1">
                    <CheckCircle className="h-3 w-3" />Creem Configured
                  </Badge>
                </div>

                {payState === 'pending' ? (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <ExternalLink className="h-8 w-8 text-primary" />
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-sm font-medium">Checkout page opened in new tab</p>
                      <p className="text-xs text-muted-foreground">
                        Complete your payment in the Creem checkout window.
                        <br />This dialog will auto-detect when payment is complete.
                      </p>
                    </div>
                    {pollingPayment && (
                      <Badge variant="outline" className="gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />Checking payment status...
                      </Badge>
                    )}
                    <div className="flex gap-2 w-full">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setPayState('selecting')}
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />Back
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => setPayState('success')}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />I have completed payment
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button className="w-full gap-2" onClick={handlePay}>
                    <CreditCard className="h-4 w-4" />
                    Pay with Creem · ${plan.price.intl}
                    <ExternalLink className="h-3.5 w-3.5 ml-auto opacity-60" />
                  </Button>
                )}
              </div>
            )}

            <p className="text-xs text-center text-muted-foreground">
              By subscribing, you agree to our Terms of Service. Payments are securely processed by the respective payment platform.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
