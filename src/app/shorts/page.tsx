import type { Metadata } from 'next';
import ClientShortsProcessor from '@/components/home/client-shorts-processor';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'YouTube Shorts Studio - Long Video to 9:16 Shorts',
  description:
    'Paste a long YouTube or Bilibili link and Clipop AI extracts the strongest highlights, reframes them to 9:16 and exports vertical YouTube Shorts with AI captions.',
  path: '/shorts',
  keywords: [
    'YouTube Shorts generator',
    'long video to Shorts',
    'AI Shorts maker',
    '9:16 video converter',
    'vertical video editor',
  ],
});

export default function ShortsPage() {
  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/30">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <div className="mx-auto max-w-5xl">
            <ClientShortsProcessor />
          </div>
        </div>
      </section>
    </div>
  );
}