import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Digital Human Live Selling Video Generator',
  description:
    'Generate vertical digital human live-selling videos: pick an avatar, clone a voice, write a hook-driven script, and render a lip-synced 9:16 product pitch automatically.',
  path: '/digital-human-live',
  keywords: ['digital human live selling', 'AI livestream video', 'virtual host video', 'AI product pitch video'],
});

export default function DigitalHumanLiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}