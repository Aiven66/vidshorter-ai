import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Article to Video - Convert Any Article into a Video',
  description:
    'Paste an article URL or text and Clipop AI turns it into a vertical video with generated scenes, key points, quotes, voiceover and captions in minutes.',
  path: '/article-to-video',
  keywords: ['article to video', 'blog post to video', 'text to video AI', 'content repurposing video'],
});

export default function ArticleToVideoLayout({ children }: { children: React.ReactNode }) {
  return children;
}