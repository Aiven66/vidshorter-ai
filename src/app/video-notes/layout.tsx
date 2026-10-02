import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Video Notes - Transcript, Summary & Translation',
  description:
    'Paste a video link and Clipop AI generates a full transcript, structured summary and multi-language translation in a side panel, so you can capture and reuse knowledge from any long video.',
  path: '/video-notes',
  keywords: ['AI video notes', 'video transcript generator', 'video summary AI', 'YouTube transcript translator'],
});

export default function VideoNotesLayout({ children }: { children: React.ReactNode }) {
  return children;
}