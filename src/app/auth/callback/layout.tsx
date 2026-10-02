import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Signing In',
  description: 'Completing sign-in.',
  path: '/auth/callback',
  noindex: true,
});

export default function AuthCallbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}