'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';

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
  environment: string;
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
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Stable callbacks to avoid re-rendering PayPal buttons
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const handleSuccess = useCallback(() => {
    onSuccessRef.current();
  }, []);

  const handleError = useCallback((message: string) => {
    onErrorRef.current(message);
  }, []);

  // Fetch PayPal config
  useEffect(() => {
    let active = true;
    fetch('/api/payment/paypal')
      .then(res => res.json())
      .then((data: PayPalConfig) => {
        if (active) setConfig(data);
      })
      .catch(() => {
        if (active) {
          setConfig({ enabled: false, clientId: null, currency: 'USD', environment: 'sandbox', status: 'pending_configuration' });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [retryCount]);

  // Load and render PayPal buttons
  useEffect(() => {
    if (!config?.enabled || !config.clientId || !containerRef.current) return;

    let active = true;
    setSdkError(null);

    loadPaypalScript(config.clientId, config.currency)
      .then(async () => {
        if (!active || !containerRef.current || !window.paypal) return;

        // Clear previous buttons
        containerRef.current.innerHTML = '';

        const buttons = window.paypal.Buttons({
          style: {
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'paypal',
            height: '45',
          },
          createOrder: async () => {
            try {
              const response = await fetch('/api/payment/paypal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', planId, userId }),
              });
              const data = await response.json();
              if (!response.ok || !data.orderId) {
                const errMsg = data.error || 'Failed to create PayPal order';
                handleError(errMsg);
                throw new Error(errMsg);
              }
              return data.orderId;
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Failed to create order';
              handleError(msg);
              throw err;
            }
          },
          onApprove: async (data) => {
            try {
              const response = await fetch('/api/payment/paypal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'capture', planId, userId, orderId: data.orderID }),
              });
              const result = await response.json();
              if (!response.ok || !result.paid) {
                handleError(result.error || 'Failed to confirm PayPal payment');
                return;
              }
              handleSuccess();
            } catch {
              handleError('Failed to confirm payment. Please contact support.');
            }
          },
          onError: (error) => {
            console.error('[PayPal] Buttons error:', error);
            handleError('PayPal payment failed. Please try again.');
          },
        });

        buttonsRef.current = buttons;
        await buttons.render(containerRef.current);
      })
      .catch((error) => {
        console.error('[PayPal] SDK load/render failed:', error);
        setSdkError('PayPal SDK failed to load. Please refresh and try again.');
        handleError('PayPal is not available right now. Please try Creem or refresh the page.');
      });

    return () => {
      active = false;
      buttonsRef.current?.close?.();
      buttonsRef.current = null;
    };
  }, [config, handleSuccess, handleError, planId, userId]);

  const handleRetry = () => {
    setSdkError(null);
    setRetryCount(prev => prev + 1);
    // Reset the script promise to allow re-loading
    paypalScriptPromise = null;
    const existing = document.querySelector('script[data-clipop-paypal-sdk="true"]');
    if (existing) existing.remove();
    // Clear paypal global
    if (typeof window !== 'undefined') {
      delete (window as Record<string, unknown>).paypal;
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-muted/30 p-6">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading PayPal checkout...
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
              <p className="font-medium">PayPal needs configuration</p>
              <Badge variant="secondary">Pending</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              PayPal checkout is prepared but not yet enabled. Please configure the PayPal Client ID and Secret in Vercel environment variables.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (sdkError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
          <div className="space-y-3">
            <p className="text-sm font-medium text-destructive">{sdkError}</p>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <RefreshCw className="mr-2 h-3 w-3" />
              Retry
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
        {config.environment === 'sandbox' && (
          <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Sandbox</Badge>
        )}
      </div>
      <div ref={containerRef} className="min-h-[45px]" />
    </div>
  );
}
