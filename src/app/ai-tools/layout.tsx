import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI Video Toolkit - Watermark Removal, Upscale & More',
  description:
    'Clipop AI toolkit: remove watermarks, upscale and enhance video quality, colorize footage and run smart AI edits on your clips directly in the browser.',
  path: '/ai-tools',
  keywords: ['AI video toolkit', 'watermark remover', 'video upscaler', 'video colorization', 'AI video editing tools'],
});

export default function AiToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}