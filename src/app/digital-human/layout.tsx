import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Digital Human Video - Talking Avatar Clips',
  description:
    'Create realistic digital human talking videos from a photo and a script. Clipop AI generates lip-synced avatar videos with cloned voices for product demos and live selling.',
  path: '/digital-human',
  keywords: ['AI digital human', 'talking avatar video', 'photo to talking video', 'AI presenter video'],
});

export default function DigitalHumanLayout({ children }: { children: React.ReactNode }) {
  return children;
}