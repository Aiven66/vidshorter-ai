'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, type ReactNode, Suspense, useState } from 'react';
import { useAuth } from './auth-context';

interface PostHogProviderProps {
  children: ReactNode;
}

const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';
const isPostHogEnabled = !!POSTHOG_API_KEY;

let posthogInstance: any = null;

if (typeof window !== 'undefined' && isPostHogEnabled) {
  try {
    const posthogModule = require('posthog-js');
    posthogInstance = posthogModule.default || posthogModule;
  } catch (e) {
    console.warn('Failed to load posthog-js:', e);
    posthogInstance = null;
  }
}

function PostHogProviderContent({ children }: PostHogProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!isPostHogEnabled || !posthogInstance || initialized) return;

    try {
      posthogInstance.init(POSTHOG_API_KEY, {
        api_host: POSTHOG_HOST,
        person_profiles: 'identified_only',
      });
      
      setInitialized(true);

      return () => {
        try {
          if (posthogInstance) {
            posthogInstance.reset();
          }
        } catch (e) {
          console.warn('PostHog cleanup error:', e);
        }
      };
    } catch (e) {
      console.warn('PostHog initialization error:', e);
    }
  }, [initialized]);

  useEffect(() => {
    if (!isPostHogEnabled || !user || !posthogInstance || !initialized) return;

    try {
      posthogInstance.identify(user.id, {
        email: user.email,
        name: user.name,
        role: user.role,
      });
    } catch (e) {
      console.warn('PostHog identify error:', e);
    }
  }, [user, initialized]);

  useEffect(() => {
    if (!isPostHogEnabled || !pathname || !posthogInstance || !initialized) return;

    try {
      const url = window.location.origin + pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
      posthogInstance.capture('$pageview', {
        $current_url: url,
      });
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
    if (typeof window !== 'undefined' && posthogInstance && isPostHogEnabled) {
      try {
        posthogInstance.capture(event, properties);
      } catch (e) {
        console.warn('PostHog capture error:', e);
      }
    }
  },
  identify: (userId: string, properties?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && posthogInstance && isPostHogEnabled) {
      try {
        posthogInstance.identify(userId, properties);
      } catch (e) {
        console.warn('PostHog identify error:', e);
      }
    }
  },
  reset: () => {
    if (typeof window !== 'undefined' && posthogInstance && isPostHogEnabled) {
      try {
        posthogInstance.reset();
      } catch (e) {
        console.warn('PostHog reset error:', e);
      }
    }
  },
};