import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Admin',
  description: 'Clipop AI administration console.',
  path: '/admin',
  noindex: true,
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}