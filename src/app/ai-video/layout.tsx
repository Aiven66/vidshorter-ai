import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Video Maker - Turn a Topic into a Vertical Video',
  description:
    'Type a topic keyword and let Clipop AI generate a ready-to-post 9:16 vertical video with AI script, AI voiceover, captions, background music and digital human presenters. No editing skills required.',
  path: '/ai-video',
  keywords: [
    'AI video maker',
    'text to video AI',
    'topic to video',
    'AI voiceover video',
    'faceless video generator',
    'digital human video',
  ],
});

export default function AiVideoLayout({ children }: { children: React.ReactNode }) {
  return children;
}