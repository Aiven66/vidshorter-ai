import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Highlight Clipper - Long Video to Vertical Clips',
  description:
    'Paste a YouTube or Bilibili link, or upload a local video. Clipop AI detects the strongest highlights, auto reframes to 9:16, adds captions and exports ready-to-post shorts.',
  path: '/video-clips',
  keywords: [
    'AI highlight clipper',
    'long video to short video',
    'YouTube to shorts',
    'Bilibili clip downloader',
    'auto caption video',
    'vertical video converter',
  ],
});

export default function VideoClipsLayout({ children }: { children: React.ReactNode }) {
  return children;
}