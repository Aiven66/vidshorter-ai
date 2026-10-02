import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Dashboard',
  description: 'Your Clipop AI workspace: credits, videos and generated shorts.',
  path: '/dashboard',
  noindex: true,
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}