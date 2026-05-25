'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, type ReactNode, Suspense, useState } from 'react';
import { useAuth } from './auth-context';

interface PostHogProviderProps {
  children: ReactNode;
}

const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

let posthogInstance: any = null;

if (typeof window !== 'undefined') {
  try {
    const posthogModule = require('posthog-js');
    posthogInstance = posthogModule.default || posthogModule;
  } catch (e) {
    console.error('Failed to load posthog-js:', e);
  }
}

function PostHogProviderContent({ children }: PostHogProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!POSTHOG_API_KEY || !posthogInstance || initialized) return;

    posthogInstance.init(POSTHOG_API_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
    });
    
    setInitialized(true);

    return () => {
      if (posthogInstance) {
        posthogInstance.reset();
      }
    };
  }, [initialized]);

  useEffect(() => {
    if (!POSTHOG_API_KEY || !user || !posthogInstance) return;

    posthogInstance.identify(user.id, {
      email: user.email,
      name: user.name,
      role: user.role,
    });
  }, [user]);

  useEffect(() => {
    if (!POSTHOG_API_KEY || !pathname || !posthogInstance || !initialized) return;

    const url = window.location.origin + pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    posthogInstance.capture('$pageview', {
      $current_url: url,
    });
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
    if (typeof window !== 'undefined' && posthogInstance) {
      posthogInstance.capture(event, properties);
    }
  },
  identify: (userId: string, properties?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && posthogInstance) {
      posthogInstance.identify(userId, properties);
    }
  },
  reset: () => {
    if (typeof window !== 'undefined' && posthogInstance) {
      posthogInstance.reset();
    }
  },
};