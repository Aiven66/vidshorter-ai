'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/lib/locale-context';
import {
  PUBLISH_PLATFORMS, parseMetric, type PublishInfo, type PublishPlatform,
} from '@/lib/publish-tracker';

interface MarkPublishedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 已有发布信息时进入「更新数据」模式 */
  initial?: PublishInfo | null;
  onSave: (info: PublishInfo) => void;
}

export function MarkPublishedDialog({ open, onOpenChange, initial, onSave }: MarkPublishedDialogProps) {
  const { t } = useLocale();
  const [platform, setPlatform] = useState<PublishPlatform>('tiktok');
  const [postUrl, setPostUrl] = useState('');
  const [views, setViews] = useState('');
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');

  const isUpdate = !!initial;

  useEffect(() => {
    if (!open) return;
    setPlatform(initial?.platform ?? 'tiktok');
    setPostUrl(initial?.postUrl ?? '');
    setViews(initial?.views !== undefined ? String(initial.views) : '');
    setLikes(initial?.likes !== undefined ? String(initial.likes) : '');
    setComments(initial?.comments !== undefined ? String(initial.comments) : '');
  }, [open, initial]);

  const handleSave = () => {
    const nowIso = new Date().toISOString();
    const info: PublishInfo = {
      platform,
      postedAt: initial?.postedAt ?? nowIso,
      ...(postUrl.trim() ? { postUrl: postUrl.trim() } : {}),
      ...(parseMetric(views) !== undefined ? { views: parseMetric(views) } : {}),
      ...(parseMetric(likes) !== undefined ? { likes: parseMetric(likes) } : {}),
      ...(parseMetric(comments) !== undefined ? { comments: parseMetric(comments) } : {}),
      metricsUpdatedAt: nowIso,
    };
    onSave(info);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isUpdate ? t('dashboard.updateMetrics') : t('dashboard.markPublished')}
          </DialogTitle>
          <DialogDescription>{t('dashboard.publishDialogHint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('dashboard.publishPlatform')}</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as PublishPlatform)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PUBLISH_PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`dashboard.platform.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="publish-url">{t('dashboard.publishPostUrl')}</Label>
            <Input
              id="publish-url"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="publish-views">{t('dashboard.metricViews')}</Label>
              <Input
                id="publish-views"
                inputMode="numeric"
                value={views}
                onChange={(e) => setViews(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="publish-likes">{t('dashboard.metricLikes')}</Label>
              <Input
                id="publish-likes"
                inputMode="numeric"
                value={likes}
                onChange={(e) => setLikes(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="publish-comments">{t('dashboard.metricComments')}</Label>
              <Input
                id="publish-comments"
                inputMode="numeric"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
