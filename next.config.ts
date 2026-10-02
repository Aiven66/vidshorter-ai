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
    // AI 工具箱服务端推理：原生 NAPI 绑定必须保持外部化，打包会破坏 .node 加载
    'onnxruntime-node',
    'onnxruntime-common',
    'nodemailer',
    'pg',
    // uuid@11 native.js accesses crypto.randomUUID at module top-level;
    // webpack's CJS interop wraps .default incorrectly causing build-time crash.
    'uuid',
    'coze-coding-dev-sdk',
    'msedge-tts',
    // ffmpeg-static 必须外部化: 源码里的 require('ffmpeg-static') 让 nft 把
    // 二进制打进 Vercel 函数（path.join 导出若被打包会指向错误路径）
    'ffmpeg-static',
    '@langchain/core',
    '@langchain/openai',
    'langsmith',
    '@smithy/node-config-provider',
    '@smithy/credential-provider',
    '@smithy/middleware-retry',
    '@smithy/util-utf8',
    '@smithy/util-stream',
  ],
  // 注意: 不能用 outputFileTracingIncludes 打包 onnxruntime/ffmpeg 原生库 ——
  // 任何路由级 tracing 配置都会让 Vercel 取消函数批处理（73 条路由逐个成函数），
  // 触发 Hobby 计划 "No more than 12 Serverless Functions" 部署失败。
  // 原生库（libonnxruntime.so.1 / libvips）由 scripts/patch-native-nft.mjs
  // 在构建后写入 .nft.json 清单解决（dlopen 依赖对 nft 静态分析不可见）。
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
    // The desktop standalone server runs from the signed macOS app bundle.
    // Persisting ISR/fetch cache there mutates sealed resources after launch
    // and makes Gatekeeper report the app as damaged on subsequent starts.
    isrFlushToDisk: process.env.NEXT_PUBLIC_DESKTOP !== '1',
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
