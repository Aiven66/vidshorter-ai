import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Local AI Engine',
  description: 'Manage the on-device AI models that power Clipop AI local transcription and highlight detection.',
  path: '/local-engine',
  noindex: true,
});

export default function LocalEngineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
