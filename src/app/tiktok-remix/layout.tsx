import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { REMIX_COPY } from '@/lib/tiktok-remix-content';

const copy = REMIX_COPY.en;

export const metadata: Metadata = buildMetadata({
  title: copy.meta.title,
  description: copy.meta.description,
  path: '/tiktok-remix',
  keywords: copy.meta.keywords,
});

export default function TiktokRemixLayout({ children }: { children: React.ReactNode }) {
  return children;
}