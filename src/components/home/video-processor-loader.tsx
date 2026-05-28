'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const VideoProcessor = dynamic(
  () => import('@/components/home/video-processor'),
  {
    ssr: false,
    loading: () => (
      <Card className="border-0 shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="h-6 bg-muted animate-pulse rounded w-48 mx-auto mb-2" />
          <div className="h-4 bg-muted animate-pulse rounded w-32 mx-auto" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 h-10 bg-muted animate-pulse rounded" />
            <div className="h-10 w-[140px] bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    ),
  }
);

export default function VideoProcessorLoader() {
  return <VideoProcessor />;
}
