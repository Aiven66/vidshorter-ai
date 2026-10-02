import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Terms of Service',
  description:
    'Clipop AI terms of service: usage rules, subscription and credit policy, content ownership and acceptable use for the Clipop AI video clipping platform.',
  path: '/terms',
});

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}