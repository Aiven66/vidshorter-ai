import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Pricing & Plans',
  description:
    'Clipop AI pricing: start free with 60 credits per day, upgrade to Starter or Pro for 1080p/4K exports, no watermark, batch rendering and digital human videos. One-time credit packs available.',
  path: '/pricing',
  keywords: ['Clipop AI pricing', 'AI video clipper pricing', 'video clipper subscription', 'AI video credits'],
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}