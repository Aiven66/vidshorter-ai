import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Desktop Signing In',
  description: 'Completing desktop sign-in.',
  path: '/desktop/callback',
  noindex: true,
});

export default function DesktopCallbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}