'use client';

import { useEffect, useState } from 'react';

let posthogInstance: any = null;

if (typeof window !== 'undefined') {
  // 只在客户端动态导入
  const posthogModule = require('posthog-js');
  posthogInstance = posthogModule.default || posthogModule;
}

const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

export function usePostHog() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!POSTHOG_API_KEY || !posthogInstance || initialized) return;

    posthogInstance.init(POSTHOG_API_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      capture_pageleave: true,
    });

    setInitialized(true);

    return () => {
      if (posthogInstance) {
        posthogInstance.dispose();
      }
    };
  }, [initialized]);

  const identifyUser = (userId: string, properties?: Record<string, unknown>) => {
    if (!POSTHOG_API_KEY || !posthogInstance) return;
    posthogInstance.identify(userId, properties);
  };

  const track = (event: string, properties?: Record<string, unknown>) => {
    if (!POSTHOG_API_KEY || !posthogInstance) return;
    posthogInstance.capture(event, properties);
  };

  const trackSignup = (email: string, plan: string = 'free') => {
    track('user_signed_up', { email, plan, source: 'clipop_ai' });
  };

  const trackLogin = (email: string) => {
    track('user_logged_in', { email });
  };

  const trackPayment = (amount: number, currency: string, plan: string, paymentMethod: string) => {
    track('payment_completed', { amount, currency, plan, payment_method: paymentMethod });
  };

  const trackVideoProcess = (userId: string, videoLength: number) => {
    track('video_processed', { user_id: userId, video_length: videoLength });
  };

  return {
    identifyUser,
    track,
    trackSignup,
    trackLogin,
    trackPayment,
    trackVideoProcess,
  };
}

// 安全导出，避免服务器端导入问题
export const posthog = {
  capture: (event: string, properties?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && posthogInstance) {
      posthogInstance.capture(event, properties);
    }
  },
  identify: (userId: string, properties?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && posthogInstance) {
      posthogInstance.identify(userId, properties);
    }
  },
};