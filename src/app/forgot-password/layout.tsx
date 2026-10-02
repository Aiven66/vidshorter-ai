import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Reset Password',
  description: 'Reset the password for your Clipop AI account.',
  path: '/forgot-password',
  noindex: true,
});

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}