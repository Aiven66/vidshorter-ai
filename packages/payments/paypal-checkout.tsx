'use client';

/**
 * @clipop/payments - PayPal Checkout (frontend SDK buttons)
 *
 * Dynamically loads the PayPal SDK script and renders PayPal Buttons.
 * createOrder → POST /api/payment/paypal { action:'create', planId, userId }
 * onApprove  → POST /api/payment/paypal { action:'capture', planId, userId, orderId }
 *
 * No react-paypal-js dependency — keeps bundle size minimal.
 */

import { useEffect, useRef, useState } from 'react';
import { useAppConfig, type AppConfig } from '@clipop/core';

export interface PayPalCheckoutProps {
  planId: string;
  userId: string;
  onSuccess: (orderId?: string) => void;
  onError: (message: string) => void;
  /** Optional override for the PayPal SDK base URL. */
  sdkBaseUrl?: string;
}

interface PayPalButtonsHandle {
  render: (el: HTMLElement) => Promise<void>;
  close?: () => Promise<void>;
}

interface PayPalSdk {
  Buttons: (options: PayPalButtonsOptions) => PayPalButtonsHandle;
}

interface PayPalButtonsOptions {
  style?: {
    layout?: 'vertical' | 'horizontal';
    color?: 'gold' | 'blue' | 'silver' | 'white' | 'black';
    shape?: 'rect' | 'pill';
    height?: number;
  };
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onError?: (err: unknown) => void;
  onCancel?: () => void;
}

declare global {
  interface Window {
    paypal?: PayPalSdk;
    __paypalSdkLoaded?: boolean;
  }
}

const DEFAULT_SDK_BASE = 'https://www.paypal.com/sdk/js';

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.paypal) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[data-paypal-sdk="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('PayPal SDK failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.paypalSdk = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('PayPal SDK failed to load'));
    document.body.appendChild(script);
  });
}

export function PayPalCheckout({
  planId,
  userId,
  onSuccess,
  onError,
  sdkBaseUrl = DEFAULT_SDK_BASE,
}: PayPalCheckoutProps) {
  const config = useAppConfig();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'disabled'>('loading');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [sandbox, setSandbox] = useState(false);

  const { clientId, currency } = findPayPalConfig(config);

  useEffect(() => {
    let cancelled = false;
    if (!clientId) {
      setState('disabled');
      setStatusMessage('PayPal is not configured');
      return;
    }

    const src = `${sdkBaseUrl}?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency || 'USD')}&intent=capture`;
    loadScriptOnce(src)
      .then(() => {
        if (cancelled) return;
        if (!window.paypal) {
          setState('error');
          setStatusMessage('PayPal SDK unavailable');
          onError('PayPal SDK unavailable');
          return;
        }
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setState('error');
        setStatusMessage(err instanceof Error ? err.message : 'PayPal SDK load failed');
        onError(err instanceof Error ? err.message : 'PayPal SDK load failed');
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, currency, sdkBaseUrl, onError]);

  useEffect(() => {
    if (state !== 'ready' || !containerRef.current) return;
    if (!window.paypal) return;

    const container = containerRef.current;
    container.innerHTML = '';

    const env = config.paymentChannels.find((c) => c.provider === 'paypal')?.config;
    setSandbox(env?.environment === 'sandbox' || env?.env === 'sandbox');

    let buttonsHandle: PayPalButtonsHandle | null = null;

    try {
      buttonsHandle = window.paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', height: 45 },
        createOrder: async () => {
          const res = await fetch('/api/payment/paypal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', planId, userId }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.orderId) {
            const msg = data.error || 'Failed to create PayPal order';
            onError(msg);
            throw new Error(msg);
          }
          return data.orderId as string;
        },
        onApprove: async (approval) => {
          const res = await fetch('/api/payment/paypal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'capture',
              planId,
              userId,
              orderId: approval.orderID,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.paid) {
            onSuccess(approval.orderID);
          } else {
            const msg = data.error || 'PayPal capture failed';
            onError(msg);
          }
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'PayPal payment failed';
          onError(msg);
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to render PayPal buttons';
      setState('error');
      setStatusMessage(msg);
      onError(msg);
      return;
    }

    buttonsHandle?.render(container).catch((err) => {
      const msg = err instanceof Error ? err.message : 'PayPal render failed';
      onError(msg);
    });

    return () => {
      try {
        buttonsHandle?.close?.();
      } catch {
        // ignore cleanup errors
      }
    };
  }, [state, planId, userId, onSuccess, onError, config]);

  if (state === 'loading') {
    return (
      <div className="rounded-xl border bg-muted/30 p-6">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
          Loading PayPal...
        </div>
      </div>
    );
  }

  if (state === 'disabled') {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-4">
        <p className="font-medium">PayPal not available</p>
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="font-medium text-destructive">PayPal error</p>
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="inline-block h-4 w-4 text-green-600">✓</span>
        PayPal Checkout
        {sandbox && (
          <span className="rounded border border-orange-300 px-1 text-xs text-orange-600">
            Sandbox
          </span>
        )}
      </div>
      <div ref={containerRef} className="min-h-[45px]" />
    </div>
  );
}

function findPayPalConfig(config: AppConfig): { clientId: string; currency: string } {
  const channel = config.paymentChannels.find((c) => c.provider === 'paypal');
  if (!channel) return { clientId: '', currency: 'USD' };
  return {
    clientId: channel.config.clientId || channel.config.client_id || '',
    currency: channel.config.currency || 'USD',
  };
}
