import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Recap Studio - AI Commentary Video',
  description: 'Turn a long video into a narrated commentary short with AI script, voiceover and captions.',
  path: '/recap',
  noindex: true,
});

export default function RecapLayout({ children }: { children: React.ReactNode }) {
  return children;
}