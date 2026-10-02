import type { MetadataRoute } from 'next';

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.clipopai.com').replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 注意：绝不能屏蔽 /_next/ —— 否则 Googlebot 无法抓取 JS/CSS，
        // 无法正常渲染页面（本项目大量页面为首屏水合的客户端组件）。
        disallow: [
          '/api/',
          '/dashboard',
          '/admin',
          '/ax',
          '/notes',
          '/batch',
          '/recap',
          '/login',
          '/register',
          '/forgot-password',
          '/auth/',
          '/desktop/',
        ],
      },
      {
        userAgent: 'GPTBot',
        allow: '/',
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}