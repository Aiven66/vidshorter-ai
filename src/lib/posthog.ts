'use client';

import { useEffect, useState } from 'react';

const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';
const isPostHogEnabled = !!POSTHOG_API_KEY;

export function usePostHog() {
  const [initialized, setInitialized] = useState(false);
  const [posthogInstance, setPosthogInstance] = useState<any>(null);

  useEffect(() => {
    if (!isPostHogEnabled) return;

    let mounted = true;

    import('posthog-js').then((mod) => {
      if (!mounted) return;
      const ph = mod.default || mod;
      try {
        ph.init(POSTHOG_API_KEY, {
          api_host: POSTHOG_HOST,
          capture_pageview: true,
          capture_pageleave: true,
        });
        setPosthogInstance(ph);
        setInitialized(true);
      } catch (e) {
        console.warn('PostHog init error:', e);
      }
    }).catch((e) => {
      console.warn('PostHog load error:', e);
    });

    return () => {
      mounted = false;
      if (posthogInstance) {
        try { posthogInstance.dispose(); } catch (e) { /* ignore */ }
      }
    };
  }, []);

  const identifyUser = (userId: string, properties?: Record<string, unknown>) => {
    if (!posthogInstance) return;
    try { posthogInstance.identify(userId, properties); } catch (e) { /* ignore */ }
  };

  const track = (event: string, properties?: Record<string, unknown>) => {
    if (!posthogInstance) return;
    try { posthogInstance.capture(event, properties); } catch (e) { /* ignore */ }
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

export const posthog = {
  capture: (event: string, properties?: Record<string, unknown>) => {
    if (typeof window === 'undefined' || !isPostHogEnabled) return;
    try {
      import('posthog-js').then((mod) => {
        const ph = mod.default || mod;
        ph.capture(event, properties);
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  },
  identify: (userId: string, properties?: Record<string, unknown>) => {
    if (typeof window === 'undefined' || !isPostHogEnabled) return;
    try {
      import('posthog-js').then((mod) => {
        const ph = mod.default || mod;
        ph.identify(userId, properties);
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  },
};
