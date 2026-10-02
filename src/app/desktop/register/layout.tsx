import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Desktop Sign Up',
  description: 'Create a Clipop AI account for the desktop app.',
  path: '/desktop/register',
  noindex: true,
});

export default function DesktopRegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}