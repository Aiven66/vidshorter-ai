import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'About Clipop AI',
  description:
    'Clipop AI is an AI video clipping platform that turns long videos, podcasts and articles into viral vertical shorts with automatic highlight detection, captions and digital human videos.',
  path: '/about',
  keywords: ['About Clipop AI', 'AI video clipping platform', 'video AI company'],
});

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}