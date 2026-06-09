'use client';

/**
 * PayPal 支付组件
 * 
 * 提供 PayPal Checkout 功能
 * 
 * @example
 * ```tsx
 * import { PayPalCheckout } from './base/payment/PayPalCheckout';
 * 
 * function PaymentPage() {
 *   return (
 *     <PayPalCheckout
 *       planId="pro"
 *       userId="user_123"
 *       onSuccess={() => console.log('Payment successful')}
 *       onError={(msg) => console.error(msg)}
 *     />
 *   );
 * }
 * ```
 */

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: any) => {
        render: (el: HTMLElement) => Promise<void>;
      };
    };
  }
}

export interface PayPalCheckoutProps {
  /** 订阅计划 ID */
  planId: string;
  /** 用户 ID */
  userId: string;
  /** 支付成功回调 */
  onSuccess: () => void;
  /** 支付失败回调 */
  onError: (msg: string) => void;
  /** 自定义类名 */
  className?: string;
}

export function PayPalCheckout({
  planId,
  userId,
  onSuccess,
  onError,
  className = '',
}: PayPalCheckoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'disabled'>('loading');
  const [config, setConfig] = useState<{ clientId: string; currency: string; environment: string } | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    fetch('/api/payment/paypal')
      .then(res => res.json())
      .then((data: any) => {
        if (!mounted) return;
        console.log('[PayPal] Config loaded:', data);
        if (!data.enabled || !data.clientId) {
          setState('disabled');
          setError('PayPal is not available');
        } else {
          setConfig(data);
          setState('ready');
        }
      })
      .catch(() => {
        if (!mounted) return;
        setState('error');
        setError('Failed to load PayPal configuration');
      });

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (state !== 'ready' || !config || !containerRef.current) return;

    const loadSDK = async () => {
      if (window.paypal) {
        renderButtons();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${config.clientId}&currency=${config.currency}&intent=capture`;
      script.onload = () => renderButtons();
      script.onerror = () => {
        setState('error');
        setError('PayPal failed to load');
        onError('PayPal failed to load');
      };
      document.body.appendChild(script);
    };

    const renderButtons = () => {
      if (!containerRef.current || !window.paypal) return;

      containerRef.current.innerHTML = '';

      window.paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', height: 45 },
        createOrder: async () => {
          const response = await fetch('/api/payment/paypal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', planId, userId }),
          });
          const data = await response.json();
          if (!response.ok || !data.orderId) {
            throw new Error(data.error || 'Failed to create order');
          }
          return data.orderId;
        },
        onApprove: async (data: any) => {
          const response = await fetch('/api/payment/paypal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'capture', planId, userId, orderId: data.orderID }),
          });
          const result = await response.json();
          if (response.ok && result.paid) {
            onSuccess();
          } else {
            onError(result.error || 'Payment failed');
          }
        },
        onError: () => {
          onError('PayPal payment failed');
        },
      }).render(containerRef.current);
    };

    loadSDK();
  }, [state, config, planId, userId, onSuccess, onError]);

  if (state === 'loading') {
    return (
      <div className={`rounded-xl border bg-muted/30 p-6 ${className}`}>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading PayPal...
        </div>
      </div>
    );
  }

  if (state === 'disabled') {
    return (
      <div className={`rounded-xl border border-dashed bg-muted/30 p-4 ${className}`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 w-5 h-5 text-muted-foreground" />
          <div>
            <p className="font-medium">PayPal not available</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={`rounded-xl border border-destructive/30 bg-destructive/5 p-4 ${className}`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 w-5 h-5 text-destructive" />
          <div>
            <p className="font-medium text-destructive">PayPal error</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 rounded-xl border bg-muted/20 p-4 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle className="w-4 h-4 text-green-600" />
        PayPal Checkout
        {config?.environment === 'sandbox' && (
          <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Sandbox</Badge>
        )}
      </div>
      <div ref={containerRef} className="min-h-[45px]" />
    </div>
  );
}
