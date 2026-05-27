'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Download, AlertCircle, Loader2 } from 'lucide-react';
import { useLocale } from '@/lib/locale-context';

interface VideoClip {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  summary: string;
  engagementScore: number;
  thumbnailUrl: string;
  videoUrl: string | null;
  status: 'processing' | 'completed' | 'failed';
}

interface PreviewDialogProps {
  clip: VideoClip;
  open: boolean;
  onOpenChange: () => void;
  proxyUrl: (clip: VideoClip, download?: boolean) => string;
  onDownload: (clip: VideoClip) => void;
  downloadingId: string | null;
  fmt: (sec: number) => string;
}

export default function PreviewDialog({
  clip,
  open,
  onOpenChange,
  proxyUrl,
  onDownload,
  downloadingId,
  fmt,
}: PreviewDialogProps) {
  const { t } = useLocale();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[92vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            {clip.title}
          </DialogTitle>
          <DialogDescription>{clip.summary}</DialogDescription>
        </DialogHeader>

        {clip.videoUrl ? (
          <div className="relative bg-black rounded-lg overflow-hidden">
            <video
              key={clip.id}
              src={proxyUrl(clip)}
              controls
              playsInline
              preload="metadata"
              className="w-full aspect-video"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mb-4" />
            <p className="font-medium">{t('video.videoPreviewNotAvailable')}</p>
            <p className="text-sm mt-1">{t('video.clipMayStillProcessing')}</p>
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{fmt(clip.startTime)} - {fmt(clip.endTime)}</span>
            <Badge variant="outline">{t('common.score')}: {clip.engagementScore}/10</Badge>
          </div>
          {clip.videoUrl && (
            <Button
              onClick={() => onDownload(clip)}
              disabled={downloadingId === clip.id}
              className="gap-2"
            >
              {downloadingId === clip.id ? (
                <><Loader2 className="h-4 w-4 animate-pulse" />{t('common.saving')}</>
              ) : (
                <><Download className="h-4 w-4" />{t('video.download')}</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
