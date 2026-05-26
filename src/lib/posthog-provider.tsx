'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, type ReactNode, Suspense, useState, useRef } from 'react';
import { useAuth } from './auth-context';

interface PostHogProviderProps {
  children: ReactNode;
}

const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';
const isPostHogEnabled = !!POSTHOG_API_KEY;

function PostHogProviderContent({ children }: PostHogProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [initialized, setInitialized] = useState(false);
  const posthogRef = useRef<any>(null);

  useEffect(() => {
    if (!isPostHogEnabled) return;

    let mounted = true;

    import('posthog-js').then((mod) => {
      if (!mounted) return;
      const ph = mod.default || mod;
      try {
        ph.init(POSTHOG_API_KEY, {
          api_host: POSTHOG_HOST,
          person_profiles: 'identified_only',
        });
        posthogRef.current = ph;
        setInitialized(true);
      } catch (e) {
        console.warn('PostHog init error:', e);
      }
    }).catch((e) => {
      console.warn('PostHog load error:', e);
    });

    return () => {
      mounted = false;
      if (posthogRef.current) {
        try { posthogRef.current.reset(); } catch (e) { /* ignore */ }
        posthogRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!initialized || !user || !posthogRef.current) return;
    try {
      posthogRef.current.identify(user.id, {
        email: user.email,
        name: user.name,
        role: user.role,
      });
    } catch (e) {
      console.warn('PostHog identify error:', e);
    }
  }, [user, initialized]);

  useEffect(() => {
    if (!initialized || !pathname || !posthogRef.current) return;
    try {
      const url = window.location.origin + pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
      posthogRef.current.capture('$pageview', { $current_url: url });
    } catch (e) {
      console.warn('PostHog pageview error:', e);
    }
  }, [pathname, searchParams, initialized]);

  return <>{children}</>;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  return (
    <Suspense fallback={null}>
      <PostHogProviderContent>{children}</PostHogProviderContent>
    </Suspense>
  );
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
  reset: () => {
    if (typeof window === 'undefined' || !isPostHogEnabled) return;
    try {
      import('posthog-js').then((mod) => {
        const ph = mod.default || mod;
        ph.reset();
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  },
};
