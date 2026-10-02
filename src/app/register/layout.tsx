import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Create Your Free Account',
  description:
    'Create a free Clipop AI account and get 60 credits to turn long videos into vertical shorts with AI highlights and captions.',
  path: '/register',
  noindex: true,
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}