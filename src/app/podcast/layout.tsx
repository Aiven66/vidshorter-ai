import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Podcast Clipping - Turn Podcasts into Shorts',
  description:
    'Turn podcasts and interviews into vertical highlight clips with Clipop AI: automatic highlight detection, speaker captions and ready-to-publish 9:16 shorts.',
  path: '/podcast',
  keywords: ['AI podcast clipping', 'podcast to shorts', 'podcast highlight generator', 'podcast video clips'],
});

export default function PodcastLayout({ children }: { children: React.ReactNode }) {
  return children;
}