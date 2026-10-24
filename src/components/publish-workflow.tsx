'use client';

/**
 * 发布工作流（v6 路径 B）。
 *
 * 把「剪完就结束」升级成「剪完 → 文案 → 排期 → 交接发布 → 数据回收」的闭环：
 *   ① 选片 → 一次生成 YouTube / TikTok / Reels / LinkedIn 四套差异化文案（可编辑）
 *   ② 复制并深链打开平台上传页（半自动交接，无需平台密钥）
 *   ③ 排期到点提醒；发完回填链接与数据
 *   ④ 涨粉榜单：哪条片带来的粉丝最多
 *
 * 平台直发的接入点集中在 `PUBLISH_TARGETS[].composerUrl`，未来拿到开发者密钥后
 * 可在此替换为真实上传 API，其余链路无需改动。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import {
  PUBLISH_TARGETS, SCHEDULE_PLATFORMS, isDue, sortSchedule,
  type SchedulePlatform, type ScheduledPost,
} from '@/lib/publish-schedule';
import {
  type PublishInfo, type PublishPlatform,
} from '@/lib/publish-tracker';
import { MarkPublishedDialog } from '@/components/mark-published-dialog';
import { trackCustomEvent, CONVERSION_EVENTS } from '@/lib/analytics';
import {
  Sparkles, Copy, CheckCircle2, ExternalLink, CalendarClock, Loader2,
  TrendingUp, Trash2, ClipboardCheck, Clock,
} from 'lucide-react';

export interface WorkflowClip {
  id: string;
  title: string;
  summary: string;
  duration: number;
  thumbnailUrl?: string;
}

interface PublishWorkflowProps {
  clips: WorkflowClip[];
  /** clipId → 发布记录（由父级从服务端/本地合并而来） */
  publishMap: Record<string, PublishInfo>;
  onSavePublish: (clipId: string, info: PublishInfo) => void;
}

interface PlatformCopy {
  title: string;
  caption: string;
  hashtags: string[];
  source?: 'llm' | 'template';
}

const PLATFORM_TO_PUBLISH: Record<SchedulePlatform, PublishPlatform> = {
  youtube: 'shorts',
  tiktok: 'tiktok',
  instagram: 'reels',
  linkedin: 'other',
};

function localKey(userId: string): string {
  return `clipop_schedule_${userId || 'anonymous'}`;
}

function readLocalSchedule(userId: string): ScheduledPost[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(localKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ScheduledPost[]) : [];
  } catch {
    return [];
  }
}

function writeLocalSchedule(userId: string, posts: ScheduledPost[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(localKey(userId), JSON.stringify(posts));
  } catch {
    // 隐私模式/配额：静默忽略
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

/** datetime-local 需要的本地时间字符串（YYYY-MM-DDTHH:mm）。 */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function PublishWorkflow({ clips, publishMap, onSavePublish }: PublishWorkflowProps) {
  const { locale } = useLocale();
  const { user } = useAuth();
  const zh = locale === 'zh';

  const [clipId, setClipId] = useState<string>(clips[0]?.id ?? '');
  const [copies, setCopies] = useState<Partial<Record<SchedulePlatform, PlatformCopy>>>({});
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [schedule, setSchedule] = useState<ScheduledPost[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>(() =>
    toLocalInput(new Date(Date.now() + 60 * 60 * 1000).toISOString()),
  );

  const [metricClipId, setMetricClipId] = useState<string | null>(null);
  const [metricOpen, setMetricOpen] = useState(false);

  const selectedClip = useMemo(() => clips.find((c) => c.id === clipId) ?? null, [clips, clipId]);
  const clipTitle = useMemo(() => {
    const map = new Map(clips.map((c) => [c.id, c.title]));
    return map;
  }, [clips]);

  const userId = user?.id || '';

  // 排期：先服务端，失败回落本地
  useEffect(() => {
    let cancelled = false;
    setScheduleLoading(true);
    (async () => {
      let remote: ScheduledPost[] | null = null;
      try {
        const res = await fetch('/api/publish/schedule', { credentials: 'include' });
        if (res.ok) {
          const data = (await res.json()) as { posts?: ScheduledPost[] };
          if (Array.isArray(data.posts)) remote = data.posts;
        }
      } catch {
        remote = null;
      }
      if (cancelled) return;
      if (remote) {
        setSchedule(remote);
        writeLocalSchedule(userId, remote);
      } else {
        setSchedule(readLocalSchedule(userId));
      }
      setScheduleLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persistSchedule = useCallback(
    async (action: 'upsert' | 'delete', payload: Record<string, unknown>) => {
      setSavingSchedule(true);
      try {
        const res = await fetch('/api/publish/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action, ...payload }),
        });
        if (res.ok) {
          const data = (await res.json()) as { posts?: ScheduledPost[] };
          if (Array.isArray(data.posts)) {
            setSchedule(data.posts);
            writeLocalSchedule(userId, data.posts);
            return data.posts;
          }
        }
        return null;
      } catch {
        return null;
      } finally {
        setSavingSchedule(false);
      }
    },
    [userId],
  );

  const generateAll = async () => {
    if (!selectedClip || generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const results = await Promise.all(
        SCHEDULE_PLATFORMS.map(async (platform) => {
          try {
            const res = await fetch('/api/publish/ai-copy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                title: selectedClip.title,
                summary: selectedClip.summary,
                duration: selectedClip.duration,
                platform,
                locale: zh ? 'zh' : 'en',
              }),
            });
            if (!res.ok) return [platform, null] as const;
            const data = (await res.json()) as { copy?: PlatformCopy };
            return [platform, data.copy ?? null] as const;
          } catch {
            return [platform, null] as const;
          }
        }),
      );
      const next: Partial<Record<SchedulePlatform, PlatformCopy>> = {};
      for (const [platform, copy] of results) {
        if (copy) next[platform] = copy;
      }
      if (Object.keys(next).length === 0) {
        setGenerateError(zh ? '生成失败，请重试' : 'Generation failed, please retry');
      } else {
        setCopies(next);
        trackCustomEvent(CONVERSION_EVENTS.WORKFLOW_COPY_GENERATED, {
          clip_id: selectedClip.id,
          platforms: Object.keys(next).length,
          llm: Object.values(next).some((c) => c?.source === 'llm'),
        });
      }
    } finally {
      setGenerating(false);
    }
  };

  const updateCopy = (platform: SchedulePlatform, patch: Partial<PlatformCopy>) => {
    setCopies((prev) => {
      const cur = prev[platform];
      if (!cur) return prev;
      return { ...prev, [platform]: { ...cur, ...patch } };
    });
  };

  const copyText = async (platform: SchedulePlatform, copy: PlatformCopy) => {
    const text = `${copy.title}\n\n${copy.caption}\n\n${copy.hashtags.join(' ')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(platform);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      setCopiedKey(null);
    }
  };

  const schedulePost = async (platform: SchedulePlatform, copy: PlatformCopy) => {
    if (!selectedClip) return;
    const iso = scheduleAt ? new Date(scheduleAt).toISOString() : new Date().toISOString();
    const post: ScheduledPost = {
      id: newId(),
      clipId: selectedClip.id,
      platform,
      scheduledAt: iso,
      title: copy.title,
      caption: copy.caption,
      hashtags: copy.hashtags,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };
    const remote = await persistSchedule('upsert', { post });
    if (!remote) {
      const next = [{ ...post }, ...schedule];
      setSchedule(next);
      writeLocalSchedule(userId, next);
    }
    trackCustomEvent(CONVERSION_EVENTS.WORKFLOW_SCHEDULED, {
      platform,
      clip_id: selectedClip.id,
    });
  };

  /** 复制文案 + 打开平台上传页（半自动交接）。 */
  const handoff = async (post: ScheduledPost) => {
    const text = `${post.title}\n\n${post.caption}\n\n${post.hashtags.join(' ')}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 剪贴板不可用时仍然打开平台，用户可手动复制
    }
    window.open(PUBLISH_TARGETS[post.platform].composerUrl, '_blank', 'noopener,noreferrer');
    trackCustomEvent(CONVERSION_EVENTS.WORKFLOW_HANDOFF_OPENED, { platform: post.platform });
    // 到点后打开上传页即视为「开始发布」：先置为已发布占位，用户可再补链接
    if (post.status === 'scheduled' && isDue(post)) {
      await markPublished(post);
    }
  };

  const markPublished = async (post: ScheduledPost, info?: PublishInfo) => {
    const nowIso = new Date().toISOString();
    const next: ScheduledPost = {
      ...post,
      status: 'published',
      postUrl: info?.postUrl ?? post.postUrl,
    };
    const remote = await persistSchedule('upsert', { post: next });
    if (!remote) {
      const merged = schedule.map((p) => (p.id === post.id ? next : p));
      setSchedule(merged);
      writeLocalSchedule(userId, merged);
    }
    if (post.clipId) {
      const record: PublishInfo = info ?? {
        platform: PLATFORM_TO_PUBLISH[post.platform],
        postedAt: nowIso,
        metricsUpdatedAt: nowIso,
      };
      onSavePublish(post.clipId, record);
    }
    trackCustomEvent(CONVERSION_EVENTS.WORKFLOW_PUBLISHED, { platform: post.platform });
  };

  const cancelPost = async (post: ScheduledPost) => {
    const remote = await persistSchedule('delete', { id: post.id });
    if (!remote) {
      const next = schedule.filter((p) => p.id !== post.id);
      setSchedule(next);
      writeLocalSchedule(userId, next);
    }
  };

  const handleMetricSave = (info: PublishInfo) => {
    if (!metricClipId) return;
    onSavePublish(metricClipId, info);
    setMetricClipId(null);
  };

  const sorted = useMemo(() => sortSchedule(schedule), [schedule]);
  const dueCount = useMemo(() => schedule.filter((p) => isDue(p)).length, [schedule]);
  const publishedCount = useMemo(
    () => schedule.filter((p) => p.status === 'published').length,
    [schedule],
  );

  const leaderboard = useMemo(() => {
    return Object.entries(publishMap)
      .map(([id, info]) => ({ id, info, followers: Number(info.followers) || 0 }))
      .filter((row) => row.followers > 0 || (Number(row.info.views) || 0) > 0)
      .sort((a, b) => b.followers - a.followers || (Number(b.info.views) || 0) - (Number(a.info.views) || 0))
      .slice(0, 10);
  }, [publishMap]);

  const totalFollowers = useMemo(
    () => Object.values(publishMap).reduce((sum, info) => sum + (Number(info.followers) || 0), 0),
    [publishMap],
  );

  return (
    <div className="space-y-6">
      {/* 概览 */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: zh ? '排期总数' : 'Scheduled', value: schedule.length, icon: CalendarClock },
          { label: zh ? '已到点待发' : 'Due now', value: dueCount, icon: Clock },
          { label: zh ? '已发布' : 'Published', value: publishedCount, icon: CheckCircle2 },
          { label: zh ? '累计涨粉' : 'Followers gained', value: totalFollowers, icon: TrendingUp },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{item.value}</div>
          </div>
        ))}
      </div>

      {/* ① 生成文案 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            {zh ? 'AI 生成多平台文案' : 'AI copy for every platform'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">{zh ? '选择片段' : 'Pick a clip'}</label>
              <Select value={clipId} onValueChange={setClipId}>
                <SelectTrigger>
                  <SelectValue placeholder={zh ? '选择一条成片' : 'Select a clip'} />
                </SelectTrigger>
                <SelectContent>
                  {clips.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title || c.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generateAll} disabled={!selectedClip || generating}>
              {generating ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" />
              )}
              {zh ? '生成 4 平台文案' : 'Generate 4 platform versions'}
            </Button>
          </div>

          {clips.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {zh ? '还没有成片，先去首页生成一条再回来。' : 'No clips yet — generate one first.'}
            </p>
          )}

          {generateError && <p className="text-sm text-destructive">{generateError}</p>}

          {Object.keys(copies).length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">{zh ? '排期时间' : 'Schedule time'}</label>
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="w-auto"
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {SCHEDULE_PLATFORMS.map((platform) => {
                  const copy = copies[platform];
                  if (!copy) return null;
                  const target = PUBLISH_TARGETS[platform];
                  return (
                    <div key={platform} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{target.label}</Badge>
                          {copy.source === 'template' && (
                            <span className="text-[10px] text-muted-foreground">
                              {zh ? '模板文案' : 'template fallback'}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyText(platform, copy)}
                        >
                          {copiedKey === platform ? (
                            <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
                          ) : (
                            <Copy className="mr-1 h-3.5 w-3.5" />
                          )}
                          {copiedKey === platform ? (zh ? '已复制' : 'Copied') : (zh ? '复制' : 'Copy')}
                        </Button>
                      </div>

                      <Input
                        value={copy.title}
                        maxLength={target.titleMax}
                        onChange={(e) => updateCopy(platform, { title: e.target.value })}
                        placeholder={zh ? '标题' : 'Title'}
                      />
                      <Textarea
                        value={copy.caption}
                        maxLength={target.captionMax}
                        rows={4}
                        onChange={(e) => updateCopy(platform, { caption: e.target.value })}
                        placeholder={zh ? '正文' : 'Caption'}
                      />
                      <Input
                        value={copy.hashtags.join(' ')}
                        onChange={(e) =>
                          updateCopy(platform, {
                            hashtags: e.target.value.split(/\s+/).filter(Boolean).slice(0, 10),
                          })
                        }
                        placeholder="#tag1 #tag2"
                      />

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={savingSchedule}
                          onClick={() => schedulePost(platform, copy)}
                        >
                          <CalendarClock className="mr-1 h-3.5 w-3.5" />
                          {zh ? '加入排期' : 'Add to schedule'}
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            await copyText(platform, copy);
                            window.open(target.composerUrl, '_blank', 'noopener,noreferrer');
                            trackCustomEvent(CONVERSION_EVENTS.WORKFLOW_HANDOFF_OPENED, { platform });
                          }}
                        >
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />
                          {zh ? '复制并打开上传页' : 'Copy & open uploader'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ② 内容日历 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5 text-primary" />
            {zh ? '发布排期' : 'Publishing schedule'}
            {dueCount > 0 && (
              <Badge className="ml-1">{zh ? `${dueCount} 条已到点` : `${dueCount} due`}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scheduleLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {zh ? '加载中…' : 'Loading…'}
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {zh ? '还没有排期。生成文案后点「加入排期」即可。' : 'Nothing scheduled yet — generate copy and add to schedule.'}
            </p>
          ) : (
            <div className="space-y-2">
              {sorted.map((post) => {
                const due = isDue(post);
                const clip = post.clipId ? clipTitle.get(post.clipId) : undefined;
                return (
                  <div
                    key={post.id}
                    className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
                      due ? 'border-primary/40 bg-primary/[0.03]' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{PUBLISH_TARGETS[post.platform].label}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {fmtDateTime(post.scheduledAt, locale)}
                        </span>
                        {post.status === 'published' && (
                          <Badge variant="secondary">{zh ? '已发布' : 'Published'}</Badge>
                        )}
                        {post.status === 'canceled' && (
                          <Badge variant="outline">{zh ? '已取消' : 'Canceled'}</Badge>
                        )}
                        {due && <Badge>{zh ? '已到点' : 'Due'}</Badge>}
                      </div>
                      <p className="mt-1 truncate text-sm font-medium">{post.title || clip || '—'}</p>
                      {post.caption && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{post.caption}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {post.status !== 'published' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handoff(post)}>
                            <ExternalLink className="mr-1 h-3.5 w-3.5" />
                            {zh ? '去发布' : 'Open uploader'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => markPublished(post)}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            {zh ? '标记已发' : 'Mark published'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => cancelPost(post)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ③ 涨粉榜单 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            {zh ? '哪条片涨粉最多' : 'Clips that grew your channel'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {zh
                ? '发布后回填播放/涨粉数据，这里会按涨粉排出榜单。'
                : 'Backfill views and followers after publishing — the leaderboard sorts by follower growth.'}
            </p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((row, i) => {
                const title = clipTitle.get(row.id) || row.id;
                return (
                  <div key={row.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <span className="w-6 text-center text-sm font-semibold text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{title}</p>
                      <p className="text-xs text-muted-foreground">
                        {PUBLISH_TARGETS[
                          (Object.keys(PUBLISH_TARGETS) as SchedulePlatform[]).find(
                            (p) => PLATFORM_TO_PUBLISH[p] === row.info.platform,
                          ) || 'tiktok'
                        ].label}
                        {row.info.views !== undefined && ` · ${row.info.views} ${zh ? '播放' : 'views'}`}
                        {row.info.likes !== undefined && ` · ${row.info.likes} ${zh ? '赞' : 'likes'}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">
                        +{row.followers} {zh ? '粉' : 'followers'}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1 text-xs"
                        onClick={() => {
                          setMetricClipId(row.id);
                          setMetricOpen(true);
                        }}
                      >
                        {zh ? '更新数据' : 'Update'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {clips.length > 0 && (
            <div className="mt-3">
              <label className="mr-2 text-xs text-muted-foreground">
                {zh ? '给其他作品补数据：' : 'Backfill another clip:'}
              </label>
              <Select
                value={metricClipId ?? ''}
                onValueChange={(v) => {
                  setMetricClipId(v);
                  setMetricOpen(true);
                }}
              >
                <SelectTrigger className="mt-1 w-full sm:w-64">
                  <SelectValue placeholder={zh ? '选择作品' : 'Select clip'} />
                </SelectTrigger>
                <SelectContent>
                  {clips.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title || c.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <MarkPublishedDialog
        open={metricOpen && !!metricClipId}
        onOpenChange={setMetricOpen}
        initial={metricClipId ? publishMap[metricClipId] ?? null : null}
        onSave={handleMetricSave}
      />
    </div>
  );
}
