'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { useEffect, type ReactNode, Suspense } from 'react';
import { useAuth } from './auth-context';

interface PostHogProviderProps {
  children: ReactNode;
}

const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

function PostHogProviderContent({ children }: PostHogProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  useEffect(() => {
    if (!POSTHOG_API_KEY) return;

    posthog.init(POSTHOG_API_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
    });

    return () => {
      posthog.reset();
    };
  }, []);

  useEffect(() => {
    if (!POSTHOG_API_KEY || !user) return;

    posthog.identify(user.id, {
      email: user.email,
      name: user.name,
      role: user.role,
    });
  }, [user]);

  useEffect(() => {
    if (!POSTHOG_API_KEY || !pathname) return;

    const url = window.location.origin + pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    posthog.capture('$pageview', {
      $current_url: url,
    });
  }, [pathname, searchParams]);

  return <>{children}</>;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  return (
    <Suspense fallback={null}>
      <PostHogProviderContent>{children}</PostHogProviderContent>
    </Suspense>
  );
}

export { posthog };