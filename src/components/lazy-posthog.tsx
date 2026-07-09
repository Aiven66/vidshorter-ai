'use client';

import { useEffect } from 'react';

export default function LazyPostHog() {
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
    if (!apiKey) return;

    let loaded = false;
    function loadPostHog() {
      if (loaded) return;
      loaded = true;
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
    }

    // Load on first user interaction (defers ~50KB JS from initial page load)
    const events = ['click', 'scroll', 'keydown', 'touchstart'];
    events.forEach(e => window.addEventListener(e, loadPostHog, { once: true, passive: true }));
    // Fallback: load after 5s if no interaction
    const timer = setTimeout(loadPostHog, 5000);

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, loadPostHog));
    };
  }, []);

  return null;
}
