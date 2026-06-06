'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: {
        style?: Record<string, string>;
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID?: string }) => Promise<void>;
        onError: (error: unknown) => void;
      }) => {
        render: (selector: HTMLElement) => Promise<void>;
        close?: () => void;
      };
    };
  }
}

interface PayPalCheckoutProps {
  planId: string;
  userId: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

type PayPalConfig = {
  enabled: boolean;
  clientId: string | null;
  currency: string;
  status: 'ready' | 'pending_configuration';
};

let paypalScriptPromise: Promise<void> | null = null;

function loadPaypalScript(clientId: string, currency: string) {
  if (window.paypal) return Promise.resolve();
  if (paypalScriptPromise) return paypalScriptPromise;

  paypalScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-clipop-paypal-sdk="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('PayPal SDK failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons`;
    script.async = true;
    script.dataset.clipopPaypalSdk = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('PayPal SDK failed to load'));
    document.head.appendChild(script);
  });

  return paypalScriptPromise;
}

export function PayPalCheckout({ planId, userId, onSuccess, onError }: PayPalCheckoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<{ close?: () => void } | null>(null);
  const [config, setConfig] = useState<PayPalConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/payment/paypal')
      .then(res => res.json())
      .then((data: PayPalConfig) => {
        if (active) setConfig(data);
      })
      .catch(() => {
        if (active) {
          setConfig({ enabled: false, clientId: null, currency: 'USD', status: 'pending_configuration' });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!config?.enabled || !config.clientId || !containerRef.current) return;

    let active = true;
    loadPaypalScript(config.clientId, config.currency)
      .then(async () => {
        if (!active || !containerRef.current || !window.paypal) return;
        containerRef.current.innerHTML = '';
        buttonsRef.current = window.paypal.Buttons({
          style: {
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'paypal',
          },
          createOrder: async () => {
            const response = await fetch('/api/payment/paypal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'create', planId, userId }),
            });
            const data = await response.json();
            if (!response.ok || !data.orderId) {
              throw new Error(data.error || 'Failed to create PayPal order');
            }
            return data.orderId;
          },
          onApprove: async (data) => {
            const response = await fetch('/api/payment/paypal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'capture', planId, userId, orderId: data.orderID }),
            });
            const result = await response.json();
            if (!response.ok || !result.paid) {
              onError(result.error || 'Failed to confirm PayPal payment');
              return;
            }
            onSuccess();
          },
          onError: (error) => {
            console.error('[PayPal] Buttons error:', error);
            onError('PayPal payment failed. Please try again.');
          },
        });
        await buttonsRef.current.render(containerRef.current);
      })
      .catch((error) => {
        console.error('[PayPal] SDK load/render failed:', error);
        onError('PayPal is not available right now. Please try Creem or check PayPal configuration.');
      });

    return () => {
      active = false;
      buttonsRef.current?.close?.();
      buttonsRef.current = null;
    };
  }, [config, onError, onSuccess, planId, userId]);

  if (loading) {
    return (
      <div className="rounded-xl border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking PayPal availability...
        </div>
      </div>
    );
  }

  if (!config?.enabled) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">PayPal is under review</p>
              <Badge variant="secondary">Coming soon</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              PayPal checkout is already prepared. It will become available after the PayPal application is approved and configured.
            </p>
            <Button variant="outline" size="sm" disabled>
              Waiting for PayPal approval
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle className="h-4 w-4 text-green-600" />
        PayPal secure checkout
      </div>
      <div ref={containerRef} />
    </div>
  );
}
