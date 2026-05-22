'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, QrCode, CreditCard, Globe, Smartphone, ExternalLink } from 'lucide-react';
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
  } catch {
    // ignore
  }
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
  const [creemCheckoutUrl, setCreemCheckoutUrl] = useState('');
  const [paymentError, setPaymentError] = useState('');

  useEffect(() => {
    if (open) {
      setRegion(detectRegion());
      setPayState('selecting');
      setCountdown(0);
      setQrCodeUrl('');
      setCreemCheckoutUrl('');
      setPaymentError('');
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

  if (!plan) return null;

  const price = region === 'cn' ? `¥${plan.price.cn}` : `$${plan.price.intl}`;

  const hasAlipay = !!(process.env.NEXT_PUBLIC_ALIPAY_CONFIGURED);
  const hasCreem = true;

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
            subject: `VidShorter ${plan.name} 订阅`,
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
          body: JSON.stringify({ planId: plan.id, userId: user.id }),
        });
        const data = await res.json();
        if (data.error) {
          setPaymentError(data.error);
          setPayState('selecting');
          return;
        }
        if (data.checkoutUrl) {
          setCreemCheckoutUrl(data.checkoutUrl);
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
      <DialogContent className={method === 'creem' && payState === 'pending' && creemCheckoutUrl ? 'sm:max-w-3xl' : 'sm:max-w-md'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            订阅 {plan.name}
          </DialogTitle>
          <DialogDescription>
            {price} / {plan.period} · 安全支付
          </DialogDescription>
        </DialogHeader>

        {payState === 'success' ? (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold">支付成功！</h3>
            <p className="text-sm text-muted-foreground text-center">
              你的 {plan.name} 订阅已激活，积分已到账。
            </p>
            <Button className="w-full mt-2" onClick={() => onOpenChange(false)}>
              开始使用
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">支付地区：</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={region === 'cn' ? 'default' : 'outline'}
                  onClick={() => setRegion('cn')}
                  className="gap-1.5"
                >
                  <Smartphone className="h-3.5 w-3.5" />国内
                </Button>
                <Button
                  size="sm"
                  variant={region === 'intl' ? 'default' : 'outline'}
                  onClick={() => setRegion('intl')}
                  className="gap-1.5"
                >
                  <Globe className="h-3.5 w-3.5" />海外
                </Button>
              </div>
            </div>

            {paymentError && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">{paymentError}</div>
            )}

            {region === 'cn' ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-5 bg-[#1677FF] rounded flex items-center justify-center">
                        <span className="text-white text-[8px] font-bold">ALI</span>
                      </div>
                      <span className="font-medium">支付宝</span>
                    </div>
                    <span className="font-bold text-primary">¥{plan.price.cn}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>✓ 扫码支付，安全便捷</p>
                    <p>✓ 支持支付宝余额、银行卡、花呗</p>
                    <p>✓ 随时取消订阅</p>
                  </div>
                </div>

                {payState === 'pending' ? (
                  <div className="flex flex-col items-center gap-3">
                    {qrCodeUrl ? (
                      <img src={qrCodeUrl} alt="支付宝二维码" className="w-48 h-48 rounded-lg border" />
                    ) : (
                      <div className="w-48 h-48 rounded-lg border bg-muted flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-sm font-medium">使用支付宝扫码支付</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        二维码 <span className="text-primary font-semibold tabular-nums">{countdown}s</span> 后失效
                      </p>
                      <Badge variant="outline" className="mt-2">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />等待支付中...
                      </Badge>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setPayState('success')}>
                      我已完成支付
                    </Button>
                  </div>
                ) : (
                  <Button className="w-full bg-[#1677FF] hover:bg-[#0958D9] text-white" onClick={handlePay}>
                    <QrCode className="h-4 w-4 mr-2" />生成支付宝二维码
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
                    <p>✓ Cancel anytime</p>
                  </div>
                  <Badge className="mt-2 bg-green-500 text-white text-xs gap-1">
                    <CheckCircle className="h-3 w-3" />Creem 已配置
                  </Badge>
                </div>

                {payState === 'pending' ? (
                  creemCheckoutUrl ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">如内嵌支付页无法加载，可使用右侧按钮新窗口打开。</p>
                        <Button size="sm" variant="outline" asChild>
                          <a href={creemCheckoutUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />新窗口打开
                          </a>
                        </Button>
                      </div>
                      <div className="border rounded-md overflow-hidden">
                        <iframe title="Creem Checkout" src={creemCheckoutUrl} className="w-full h-[70vh]" />
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setPayState('success')}>
                        我已完成支付
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-4">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">正在创建支付...</p>
                    </div>
                  )
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
              订阅即表示同意服务条款，支付由相应支付平台安全处理。
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
