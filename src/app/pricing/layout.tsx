import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { buildFaqJsonLd, buildBreadcrumbJsonLd, type FaqItem } from '@/lib/geo-content';

export const metadata: Metadata = buildMetadata({
  title: 'Pricing & Plans',
  description:
    'Clipop AI pricing: start free with 60 credits per day, upgrade to Starter or Pro for 1080p/4K exports, no watermark, batch rendering and digital human videos. One-time credit packs available.',
  path: '/pricing',
  keywords: ['Clipop AI pricing', 'AI video clipper pricing', 'video clipper subscription', 'AI video credits'],
});

/**
 * 与 pricing 页面可见 FAQ（pricing.faq.q1-q5）保持一致的英文版本。
 * 页面正文由 useLocale() 渲染，服务端默认英文；此处不引入额外文案，避免结构化数据与正文不符。
 */
const PRICING_FAQS: FaqItem[] = [
  {
    question: 'What is a credit?',
    answer: 'Each credit represents processing power. Processing a video clip costs 60 credits.',
  },
  {
    question: 'How do credit resets work?',
    answer:
      "Free plans reset to 60 credits every day; paid plans reset to their monthly allowance (Starter 6,000 / Pro 20,000) on the 1st of each month. Everything resets at 00:00 UTC and unused credits don't carry over.",
  },
  {
    question: 'Can I upgrade or downgrade my plan?',
    answer: 'Yes, you can change your plan at any time. Changes take effect immediately.',
  },
  {
    question: 'What video sources are supported?',
    answer: 'We support YouTube, Bilibili, and direct video file uploads (MP4, MOV, AVI).',
  },
  {
    question: 'What payment methods are supported?',
    answer:
      'Creem is available for cards, Apple Pay, and Google Pay. PayPal checkout supports PayPal wallet and card payments once production credentials are configured.',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    buildFaqJsonLd(PRICING_FAQS),
    buildBreadcrumbJsonLd([
      { name: 'Home', path: '' },
      { name: 'Pricing', path: '/pricing' },
    ]),
  ],
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
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
