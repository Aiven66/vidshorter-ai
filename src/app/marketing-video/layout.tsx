import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Marketing Video Generator',
  description:
    'Create product marketing videos in minutes: paste your product info or link, and Clipop AI writes the script, generates scenes, voiceover and captions as a 9:16 vertical ad.',
  path: '/marketing-video',
  keywords: ['AI marketing video', 'product video generator', 'ecommerce video ads', 'AI ad creative'],
});

export default function MarketingVideoLayout({ children }: { children: React.ReactNode }) {
  return children;
}