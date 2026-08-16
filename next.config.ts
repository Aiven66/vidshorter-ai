import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  ...(process.env.NEXT_STANDALONE === '1' ? { output: 'standalone' } : {}),
  allowedDevOrigins: ['*.dev.coze.site'],
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // Handle .mjs files from node_modules (e.g., linkifyjs used by @tiptap/extension-link)
    // Without this, webpack fails to parse ESM .mjs files during --webpack builds
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules/,
      type: 'javascript/auto',
    });
    return config;
  },
  // Silence Next.js 16 "webpack config without turbopack config" error.
  // Turbopack handles .mjs natively; the webpack config above is only for --webpack builds (desktop client).
  turbopack: {},
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
    // uuid@11 native.js accesses crypto.randomUUID at module top-level;
    // webpack's CJS interop wraps .default incorrectly causing build-time crash.
    'uuid',
    'coze-coding-dev-sdk',
    'msedge-tts',
    '@langchain/core',
    '@langchain/openai',
    'langsmith',
    '@smithy/node-config-provider',
    '@smithy/credential-provider',
    '@smithy/middleware-retry',
    '@smithy/util-utf8',
    '@smithy/util-stream',
  ],
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
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
  experimental: {
    optimizeCss: true,
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-sheet',
      '@supabase/supabase-js',
      'date-fns',
    ],
  },
};

export default nextConfig;
