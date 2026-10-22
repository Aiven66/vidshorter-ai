import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { buildBreadcrumbJsonLd } from '@/lib/geo-content';

export const metadata: Metadata = buildMetadata({
  title: 'Blog - AI Video Clipping Guides & Tips',
  description:
    'Guides, tutorials and comparisons on AI video clipping: how to turn long videos into shorts, grow on TikTok, Reels and YouTube Shorts, and build an AI video workflow.',
  path: '/blog',
  keywords: ['AI video clipping blog', 'video to shorts guide', 'TikTok growth tips', 'AI video tutorials'],
});

/** Blog 列表页用 Blog + CollectionPage，说明该页是内容合集入口。 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': ['Blog', 'CollectionPage'],
      '@id': 'https://www.clipopai.com/blog',
      name: 'Blog - AI Video Clipping Guides & Tips',
      url: 'https://www.clipopai.com/blog',
      publisher: {
        '@type': 'Organization',
        name: 'Clipop AI',
        url: 'https://www.clipopai.com',
      },
    },
    buildBreadcrumbJsonLd([
      { name: 'Home', path: '' },
      { name: 'Blog', path: '/blog' },
    ]),
  ],
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}