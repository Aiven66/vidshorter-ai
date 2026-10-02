import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI News Video Generator',
  description:
    'Turn news articles or data into short vertical news videos. Clipop AI builds headlines, key points, charts and voiceover automatically for social publishing.',
  path: '/news-video',
  keywords: ['AI news video', 'news video generator', 'data chart video', 'vertical news shorts'],
});

export default function NewsVideoLayout({ children }: { children: React.ReactNode }) {
  return children;
}