'use client';

/**
 * @clipop/payments - Payment Method Selection Modal
 *
 * Renders a native dialog (no shadcn/ui) listing every enabled payment
 * channel from useAppConfig().paymentChannels:
 *   - paypal     → embedded PayPalCheckout component
 *   - creem      → POST /api/payment/creem, redirect to checkoutUrl
 *   - alipay     → POST /api/payment/alipay, redirect to payUrl
 *   - wechat      → POST /api/payment/wechat, render QR code from codeUrl/qrCodeUrl
 *   - custom     → POST /api/payment/custom, redirect to redirectUrl
 *
 * On success calls onPaymentSuccess(provider, orderId).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useAppConfig,
  type PaymentChannelConfig,
  type PaymentProvider,
  type PlanConfig,
} from '@clipop/core';
import { PayPalCheckout } from './paypal-checkout';

export interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanConfig | null;
  userId: string;
  onPaymentSuccess?: (provider: PaymentProvider, orderId?: string) => void;
}

type PayState = 'selecting' | 'pending' | 'success' | 'failed';

interface PaymentStartResponse {
  redirectUrl?: string;
  checkoutUrl?: string;
  payUrl?: string;
  codeUrl?: string;
  qrCodeUrl?: string;
  orderId: string;
  provider: PaymentProvider;
  error?: string;
  demo?: boolean;
}

export function PaymentModal({
  open,
  onOpenChange,
  plan,
  userId,
  onPaymentSuccess,
}: PaymentModalProps) {
  const config = useAppConfig();
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | null>(null);
  const [state, setState] = useState<PayState>('selecting');
  const [pendingQr, setPendingQr] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Reset on open
  useEffect(() => {
    if (open) {
      setState('selecting');
      setPendingQr(null);
      setOrderId(null);
      setErrorMessage('');
      setSelectedProvider(null);
    }
  }, [open]);

  const enabledChannels = useMemo<PaymentChannelConfig[]>(
    () => config.paymentChannels.filter((c) => c.enabled !== false),
    [config.paymentChannels],
  );

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handlePayPalSuccess = useCallback(
    (order?: string) => {
      setState('success');
      setOrderId(order ?? null);
      onPaymentSuccess?.('paypal', order);
    },
    [onPaymentSuccess],
  );

  const handlePayPalError = useCallback((msg: string) => {
    setErrorMessage(msg);
  }, []);

  const startPayment = useCallback(
    async (provider: PaymentProvider) => {
      if (!plan || !userId) return;
      setSelectedProvider(provider);
      setErrorMessage('');
      setPendingQr(null);
      setState('pending');

      const endpoint = `/api/payment/${provider}`;
      const successUrl = `${config.appUrl}/dashboard?payment=success&plan=${encodeURIComponent(plan.id)}&provider=${encodeURIComponent(provider)}`;
      const cancelUrl = `${config.appUrl}/pricing`;

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: plan.id,
            planName: plan.name,
            userId,
            amount: config.defaultLocale === 'zh' ? plan.priceCny : plan.priceIntl,
            currency: config.defaultLocale === 'zh' ? 'CNY' : 'USD',
            description: plan.name,
            subject: plan.name,
            successUrl,
            cancelUrl,
          }),
        });
        const data: PaymentStartResponse = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          setState('failed');
          setErrorMessage(data.error || `Payment request failed (${res.status})`);
          return;
        }

        // Prefer generic redirectUrl, then provider-specific URLs.
        const redirectUrl = data.redirectUrl || data.checkoutUrl || data.payUrl;
        const qrCodeUrl = data.qrCodeUrl || data.codeUrl;

        if (redirectUrl) {
          window.location.href = redirectUrl;
          return;
        }

        if (qrCodeUrl) {
          setPendingQr(qrCodeUrl);
          setOrderId(data.orderId);
          // Stay in pending state until webhook/redirect confirms.
          return;
        }

        // No redirect or QR — assume synchronous success.
        setState('success');
        setOrderId(data.orderId);
        onPaymentSuccess?.(provider, data.orderId);
      } catch (err) {
        setState('failed');
        setErrorMessage(err instanceof Error ? err.message : 'Network error');
      }
    },
    [plan, userId, config, onPaymentSuccess],
  );

  if (!plan) return null;

  return (
    <PaymentDialog open={open} onClose={close}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Subscribe to {plan.name}</h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                ${plan.priceIntl} / mo · ¥{plan.priceCny} / 月
              </span>
            </p>
          </div>
        </div>

        {state === 'success' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-9 w-9"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold">Payment Successful!</h3>
              <p className="text-sm text-muted-foreground">
                Your {plan.name} subscription is now active.
                {orderId && <span className="block text-xs">Order: {orderId}</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="h-11 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Continue
            </button>
          </div>
        )}

        {state === 'failed' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-9 w-9"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold">Payment Failed</h3>
              <p className="text-sm text-muted-foreground">
                {errorMessage || 'Payment was not completed. Please try again.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setState('selecting')}
              className="h-11 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Try Again
            </button>
          </div>
        )}

        {state === 'pending' && selectedProvider !== 'paypal' && (
          <div className="space-y-4 py-4">
            <button
              type="button"
              onClick={() => setState('selecting')}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to payment methods
            </button>

            {errorMessage && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {errorMessage}
              </div>
            )}

            {pendingQr ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-sm text-muted-foreground">
                  Scan the QR code with your {selectedProvider} app to complete payment.
                </p>
                <img
                  src={pendingQr}
                  alt="Payment QR code"
                  className="h-56 w-56 rounded border"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                {orderId && (
                  <p className="text-xs text-muted-foreground">Order ID: {orderId}</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-r-transparent" />
                <p className="text-sm text-muted-foreground">Processing your payment...</p>
              </div>
            )}
          </div>
        )}

        {state === 'pending' && selectedProvider === 'paypal' && (
          <div className="space-y-3">
            <PayPalCheckout
              planId={plan.id}
              userId={userId}
              onSuccess={handlePayPalSuccess}
              onError={handlePayPalError}
            />
          </div>
        )}

        {state === 'selecting' && (
          <div className="space-y-4">
            {enabledChannels.length === 0 && (
              <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                No payment channels configured.
              </div>
            )}

            <div className="space-y-2">
              {enabledChannels.map((channel) => (
                <button
                  key={channel.provider}
                  type="button"
                  onClick={() =>
                    channel.provider === 'paypal'
                      ? setSelectedProvider('paypal')
                      : startPayment(channel.provider)
                  }
                  className="flex w-full items-center justify-between rounded-xl border-2 border-border p-4 text-left transition hover:border-primary/40 hover:bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
                      style={{ background: channelColor(channel.provider) }}
                    >
                      {channelLabel(channel.provider).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold">{channelLabel(channel.provider)}</div>
                      <div className="text-xs text-muted-foreground">
                        {channelDescription(channel.provider)}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {config.defaultLocale === 'zh'
                      ? `¥${plan.priceCny}`
                      : `$${plan.priceIntl}`}
                  </span>
                </button>
              ))}
            </div>

            {selectedProvider === 'paypal' && (
              <PayPalCheckout
                planId={plan.id}
                userId={userId}
                onSuccess={handlePayPalSuccess}
                onError={handlePayPalError}
              />
            )}

            <div className="border-t border-border pt-3 text-center text-xs text-muted-foreground">
              Payments are processed securely by the respective provider.
            </div>
          </div>
        )}
      </div>
    </PaymentDialog>
  );
}

// ── Native dialog implementation (no shadcn/ui) ────────────────────────────────

interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function PaymentDialog({ open, onClose, children }: PaymentDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-2xl bg-background p-6 shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}

// ── Channel metadata helpers ──────────────────────────────────────────────────

function channelLabel(provider: PaymentProvider): string {
  switch (provider) {
    case 'paypal':
      return 'PayPal';
    case 'creem':
      return 'Creem';
    case 'alipay':
      return 'Alipay';
    case 'wechat':
      return 'WeChat Pay';
    case 'stripe':
      return 'Stripe';
    case 'custom':
      return 'Custom';
    default:
      return provider;
  }
}

function channelDescription(provider: PaymentProvider): string {
  switch (provider) {
    case 'paypal':
      return 'Pay with PayPal balance or cards';
    case 'creem':
      return 'Visa, Mastercard, Apple Pay, Google Pay';
    case 'alipay':
      return '支付宝网页支付 / 扫码支付';
    case 'wechat':
      return '微信扫码支付';
    case 'stripe':
      return 'Credit / debit card via Stripe';
    case 'custom':
      return 'Custom payment integration';
    default:
      return '';
  }
}

function channelColor(provider: PaymentProvider): string {
  switch (provider) {
    case 'paypal':
      return '#003087';
    case 'creem':
      return 'linear-gradient(to right, #7c3aed, #4f46e5)';
    case 'alipay':
      return '#1677ff';
    case 'wechat':
      return '#07c160';
    case 'stripe':
      return '#635bff';
    default:
      return '#6b7280';
  }
}
