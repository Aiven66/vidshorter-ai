import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Download Clipop AI for Windows, macOS & Android',
  description:
    'Download the Clipop AI desktop and mobile app for local GPU-accelerated video processing, offline AI analysis and batch short-video export. Available for Windows, macOS and Android.',
  path: '/download',
  keywords: ['Clipop AI download', 'AI video editor download', 'desktop video clipper', 'Android video clipper app'],
});

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return children;
}