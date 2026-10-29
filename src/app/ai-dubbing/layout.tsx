import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Dubbing — Keep the Original Voice, Switch the Language',
  description:
    'Dub any video into Chinese or English while keeping the original speaker timbre. Local voice cloning on macOS keeps the voice, timing and subtitles in sync.',
  path: '/ai-dubbing',
  keywords: [
    'AI dubbing',
    'voice cloning video',
    'video translation',
    'keep original voice',
    'YouTube video dubbing',
    'multilingual video',
  ],
});

export default function AiDubbingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
