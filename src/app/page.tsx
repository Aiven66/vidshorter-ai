import type { Metadata } from 'next';
import HomeLanding from '@/components/home/home-landing';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Video Clipper - Turn Long Videos into Viral Shorts',
  description:
    'Paste a YouTube, Bilibili or podcast link, or upload a long video. Clipop AI auto-detects highlights, adds multilingual captions and renders 9:16 vertical shorts. New users get 60 free credits.',
  path: '/',
  keywords: [
    'AI video clipper',
    'long video to short video',
    'YouTube to Shorts',
    'AI highlight generator',
    'vertical video generator',
    'auto caption video',
    'shorts maker',
  ],
});

export default function RootPage() {
  return <HomeLanding />;
}