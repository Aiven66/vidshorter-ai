import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.dev.coze.site'],
  // Externalize large server-only packages to avoid bundling them into the lambda
  serverExternalPackages: [
    '@aws-sdk/client-s3',
    '@aws-sdk/lib-storage',
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
  // Expose Supabase environment variables to client
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.COZE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
