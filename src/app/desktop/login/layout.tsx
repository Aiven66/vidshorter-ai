import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Desktop Sign In',
  description: 'Sign in to the Clipop AI desktop app.',
  path: '/desktop/login',
  noindex: true,
});

export default function DesktopLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}