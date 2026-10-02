import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Login',
  description: 'Sign in to the Clipop AI admin console.',
  path: '/ax/login',
  noindex: true,
});

export default function AxLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}