import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  ...(process.env.NEXT_STANDALONE === '1' ? { output: 'standalone' } : {}),
  allowedDevOrigins: ['*.dev.coze.site'],
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [
    '@aws-sdk/client-s3',
    '@aws-sdk/lib-storage',
    '@ffmpeg-installer/ffmpeg',
    '@ffmpeg-installer/linux-x64',
    '@ffmpeg-installer/darwin-arm64',
    '@ffmpeg-installer/darwin-x64',
    '@ffmpeg-installer/win32-x64',
    'youtubei.js',
    'sharp',
    'nodemailer',
    'pg',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lf-coze-web-cdn.coze.cn',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**',
        pathname: '/**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.COZE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_ALIPAY_CONFIGURED: process.env.ALIPAY_APP_ID ? 'true' : '',
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
