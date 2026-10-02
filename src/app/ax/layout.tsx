import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Model Configuration',
  description: 'Clipop AI administration console.',
  path: '/ax',
  noindex: true,
});

export default function AxLayout({ children }: { children: React.ReactNode }) {
  return children;
}