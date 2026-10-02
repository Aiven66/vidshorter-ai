import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Batch Production Queue',
  description: 'Paste multiple video links and render shorts in a server-side queue.',
  path: '/batch',
  noindex: true,
});

export default function BatchLayout({ children }: { children: React.ReactNode }) {
  return children;
}