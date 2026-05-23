'use client';

import posthog from 'posthog-js';
import { useEffect } from 'react';

const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

export function usePostHog() {
  useEffect(() => {
    if (!POSTHOG_API_KEY) return;

    posthog.init(POSTHOG_API_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      capture_pageleave: true,
    });

    return () => {
      posthog.dispose();
    };
  }, []);

  const identifyUser = (userId: string, properties?: Record<string, unknown>) => {
    if (!POSTHOG_API_KEY) return;
    posthog.identify(userId, properties);
  };

  const track = (event: string, properties?: Record<string, unknown>) => {
    if (!POSTHOG_API_KEY) return;
    posthog.capture(event, properties);
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

export { posthog };