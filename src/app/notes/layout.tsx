import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Video Notes Library',
  description: 'Your saved Clipop AI video notes and transcripts.',
  path: '/notes',
  noindex: true,
});

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return children;
}