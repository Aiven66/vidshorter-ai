'use client';

/**
 * 首页处理器包装层。
 *
 * 历史实现把 `?url=` 通过服务端 searchParams 透传，导致 /video-clips 变成动态渲染
 * （Cache-Control: private, no-store），每次访问都要 SSR。这里改为客户端读取 query，
 * 页面因此可以静态化 + CDN 缓存，首字节显著更快；带 url 时仍会在挂载后自动开始解析。
 */

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const VideoProcessor = dynamic(
  () => import('@/components/home/video-processor'),
  {
    ssr: false,
    loading: () => (
      <div className="border-0 shadow-xl rounded-lg border bg-card text-card-foreground">
        <div className="text-center pb-2 p-6">
          <div className="h-6 bg-muted animate-pulse rounded w-48 mx-auto mb-2" />
          <div className="h-4 bg-muted animate-pulse rounded w-32 mx-auto" />
        </div>
        <div className="p-6 pt-0 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 h-10 bg-muted animate-pulse rounded" />
            <div className="h-10 w-[140px] bg-muted animate-pulse rounded" />
          </div>
        </div>
      </div>
    ),
  }
);

function readUrlFromLocation(): string {
  try {
    return new URL(window.location.href).searchParams.get('url') || '';
  } catch {
    return '';
  }
}

export default function ClientVideoProcessor({ initialUrl }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? '');
  // 无 initialUrl 时先等一次挂载，避免把空 URL 传给处理器后错过自动开始。
  const [ready, setReady] = useState(Boolean(initialUrl));

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
      setReady(true);
      return;
    }
    const fromQuery = readUrlFromLocation();
    if (fromQuery) setUrl(fromQuery);
    setReady(true);
  }, [initialUrl]);

  return (
    <div style={{ minHeight: '420px' }}>
      {ready ? (
        <VideoProcessor initialUrl={url} />
      ) : (
        <div className="space-y-4 rounded-lg border bg-card p-6 text-card-foreground shadow-xl">
          <div className="mx-auto mb-2 h-6 w-48 animate-pulse rounded bg-muted" />
          <div className="mx-auto h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="flex gap-2 pt-4">
            <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
            <div className="h-10 w-[140px] animate-pulse rounded bg-muted" />
          </div>
        </div>
      )}
    </div>
  );
}
