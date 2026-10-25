import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Dubbing — Keep the Original Voice, Switch the Language',
  description:
    'Dub any video into another language with the original speaker timbre. Local voice cloning on macOS keeps the voice, timing and subtitles in sync.',
  path: '/ai-dubbing',
  noindex: true,
});

export default function AiDubbingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
