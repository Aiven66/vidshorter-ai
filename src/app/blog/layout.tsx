import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Blog - AI Video Clipping Guides & Tips',
  description:
    'Guides, tutorials and comparisons on AI video clipping: how to turn long videos into shorts, grow on TikTok, Reels and YouTube Shorts, and build an AI video workflow.',
  path: '/blog',
  keywords: ['AI video clipping blog', 'video to shorts guide', 'TikTok growth tips', 'AI video tutorials'],
});

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}