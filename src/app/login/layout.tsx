import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Sign In',
  description: 'Sign in to your Clipop AI account to clip long videos into viral shorts.',
  path: '/login',
  noindex: true,
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}