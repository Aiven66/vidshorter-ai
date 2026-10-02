import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Clipop AI - AI Video Clipper',
    short_name: 'Clipop AI',
    description:
      'Turn long videos and podcasts into viral vertical shorts with AI highlight detection, auto captions and digital human videos.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'portrait-primary',
    categories: ['video', 'productivity', 'multimedia'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}