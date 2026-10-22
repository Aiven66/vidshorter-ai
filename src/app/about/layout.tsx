import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { BRAND, buildBreadcrumbJsonLd } from '@/lib/geo-content';

export const metadata: Metadata = buildMetadata({
  title: 'About Clipop AI',
  description:
    'Clipop AI is an AI video clipping platform that turns long videos, podcasts and articles into viral vertical shorts with automatic highlight detection, captions and digital human videos.',
  path: '/about',
  keywords: ['About Clipop AI', 'AI video clipping platform', 'video AI company'],
});

/** AboutPage + Breadcrumb：让搜索引擎与 AI 明确「谁在提供这个产品、有哪些可核对事实」。 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'AboutPage',
      name: 'About Clipop AI',
      url: `${BRAND.url}/about`,
      description: BRAND.description,
      isPartOf: { '@type': 'WebSite', name: BRAND.name, url: BRAND.url },
      about: {
        '@type': 'Organization',
        name: BRAND.name,
        url: BRAND.url,
        email: BRAND.supportEmail,
        sameAs: [...BRAND.sameAs],
      },
    },
    buildBreadcrumbJsonLd([
      { name: 'Home', path: '' },
      { name: 'About', path: '/about' },
    ]),
  ],
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        // 结构化数据为静态常量，无用户输入
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
