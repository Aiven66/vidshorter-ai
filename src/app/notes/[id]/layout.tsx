import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Notes Detail',
  description: 'Your saved Clipop AI video notes and transcripts.',
  path: '/notes/detail',
  noindex: true,
});

export default function NoteDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}