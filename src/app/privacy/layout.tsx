import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Privacy Policy',
  description:
    'Read the Clipop AI privacy policy: what data we collect, how videos and account data are processed, and the choices you have over your information.',
  path: '/privacy',
});

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}