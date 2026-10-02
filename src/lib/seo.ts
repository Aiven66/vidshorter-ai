import type { Metadata } from 'next';

/** 站点根 URL（结尾不带斜杠） */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.clipopai.com').replace(/\/$/, '');

export type RouteSeo = {
  /** 页面标题（根 layout 会追加 " | Clipop AI" 模板后缀） */
  title: string;
  description: string;
  /** 路由路径，如 '/pricing'；'/' 表示首页 */
  path: string;
  keywords?: string[];
  /** 不需要被搜索引擎收录的页面设为 true */
  noindex?: boolean;
};

/** 默认社交分享图（由 app/opengraph-image.tsx 构建期静态生成） */
export const DEFAULT_OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Clipop AI - Turn long videos into viral vertical shorts',
};

/**
 * 统一构造页面级 SEO 元数据。
 * 说明：Next.js 的 metadata 按「字段级浅合并」，子路由一旦声明 openGraph
 * 就会整体覆盖父级的 openGraph，因此这里显式带上默认分享图，避免子页面丢失 og:image。
 */
export function buildMetadata({ title, description, path, keywords, noindex }: RouteSeo): Metadata {
  const canonical = path === '/' ? '/' : path;
  const url = `${SITE_URL}${path === '/' ? '' : path}`;

  return {
    title,
    description,
    ...(keywords && keywords.length ? { keywords } : {}),
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Clipop AI',
      type: 'website',
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [DEFAULT_OG_IMAGE.url],
    },
    ...(noindex ? { robots: { index: false, follow: false, nocache: true } } : {}),
  };
}