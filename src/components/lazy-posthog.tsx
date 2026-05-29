'use client';

import { useEffect } from 'react';

export default function LazyPostHog() {
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
    if (!apiKey) return;

    const timer = setTimeout(() => {
      import('posthog-js').then((mod) => {
        const ph = mod.default || mod;
        try {
          ph.init(apiKey, {
            api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
            person_profiles: 'identified_only',
            disable_session_recording: true,
            disable_surveys: true,
            capture_performance: false,
            autocapture: false,
          });
        } catch {}
      }).catch(() => {});
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
