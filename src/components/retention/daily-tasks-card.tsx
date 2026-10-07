'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { useCredits } from '@/lib/credits-context';
import { CheckCircle2, Circle, Flame, Loader2, Sparkles, Trophy } from 'lucide-react';
import type { RetentionStatus, RetentionTaskId } from '@/lib/retention';

/**
 * 每日创作任务卡片 —— 留存引擎的 UI 入口。
 *
 * 数据全部来自 `/api/retention/daily`（服务端从既有表派生，无新表）。身份沿用
 * 同源 cookie（`clipop_access_token`），必要时补 Bearer 头以防 cookie 场景缺失。
 *
 * 领取成功后刷新积分余额，让用户立刻看到数字变化 —— 这是整个奖励闭环的收口。
 */

const TASK_LABEL_KEY: Record<RetentionTaskId, string> = {
  checkin: 'retention.taskCheckin',
  create: 'retention.taskCreate',
  export: 'retention.taskExport',
};

export function DailyTasksCard() {
  const { t } = useLocale();
  const { user, accessToken, loading: authLoading } = useAuth();
  const { refreshCredits } = useCredits();

  const [status, setStatus] = useState<RetentionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'checkin' | 'claim' | null>(null);
  const [justClaimed, setJustClaimed] = useState(0);

  const authHeaders = useCallback((): HeadersInit => {
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }, [accessToken]);

  const load = useCallback(async () => {
    if (!user) {
      setStatus(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/retention/daily', {
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) {
        setStatus(null);
        return;
      }
      const data = (await res.json()) as { status?: RetentionStatus };
      setStatus(data.status ?? null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [user, authHeaders]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  // 桌面通知：不做权限申请（避免首屏打扰），仅在用户此前已授权时每天最多提示一次。
  // 两种情况值得提醒：①奖励已可领取（正向激励）②连续纪录今天将断（损失厌恶）。
  useEffect(() => {
    if (!status || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return;
    }
    const key = `clipop_retention_notified_${status.dayKey}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return;
    }
    const checkedIn = Boolean(status.tasks.find((task) => task.id === 'checkin')?.done);
    const atRisk = !checkedIn && status.streak >= 1;
    const message = status.canClaim
      ? `${t('retention.claimCta')} +${status.claimableCredits}`
      : atRisk
        ? t('retention.streakKeep')
        : '';
    if (!message) return;
    try {
      new Notification(t('retention.cardTitle'), { body: message, tag: key });
      localStorage.setItem(key, '1');
    } catch {
      // 通知失败不影响页面
    }
  }, [status, t]);

  const post = useCallback(
    async (action: 'checkin' | 'claim') => {
      if (busy) return;
      setBusy(action);
      try {
        const res = await fetch('/api/retention/daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ action }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          credits?: number;
          status?: RetentionStatus;
        };
        if (res.ok && data.status) {
          setStatus(data.status);
          if (action === 'claim' && (data.credits ?? 0) > 0) {
            setJustClaimed(data.credits ?? 0);
            void refreshCredits();
          }
        }
      } catch {
        // 静默失败：下一次交互会重新拉取真实状态
      } finally {
        setBusy(null);
      }
    },
    [busy, authHeaders, refreshCredits],
  );

  // 未登录：展示引导而不是空白，避免卡片"消失"造成功能不可见
  if (!authLoading && !user) {
    return (
      <Card className="mb-8 border-dashed">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('retention.loginRequired')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-primary" />
            {t('retention.cardTitle')}
          </CardTitle>
          <CardDescription className="mt-1">{t('retention.cardDesc')}</CardDescription>
        </div>
        {status && status.streak > 0 && (
          <Badge variant="secondary" className="flex-shrink-0 gap-1 text-xs">
            <Flame className="h-3 w-3 text-orange-500" />
            {t('retention.streakLabel')} {status.streak} {t('retention.streakDay')}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </p>
        ) : !status ? (
          <p className="text-sm text-muted-foreground">{t('retention.loginRequired')}</p>
        ) : (
          <>
            {/* 三项任务：签到 / 生成 / 导出 */}
            <div className="grid gap-2 sm:grid-cols-3">
              {status.tasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    task.done ? 'border-primary/40 bg-primary/5' : 'bg-muted/30'
                  }`}
                >
                  {task.done ? (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  )}
                  <span className={task.done ? 'font-medium' : 'text-muted-foreground'}>
                    {t(TASK_LABEL_KEY[task.id])}
                  </span>
                  {task.id !== 'checkin' && task.count > 1 && (
                    <span className="ml-auto text-xs text-muted-foreground">×{task.count}</span>
                  )}
                </div>
              ))}
            </div>

            {/* 连续创作提示 */}
            <p className="text-xs text-muted-foreground">
              {status.streak === 0 || !status.tasks[0]?.done
                ? t('retention.streakKeep')
                : status.daysToMilestone === 0
                  ? t('retention.milestoneHint')
                  : `${t('retention.streakNext')} ${status.daysToMilestone} ${t('retention.streakDay')}`}
              {' · '}
              {t('retention.milestoneHint')}
            </p>

            {/* 操作区：签到 → 全部完成 → 领取 */}
            <div className="flex flex-wrap items-center gap-2">
              {!status.tasks[0]?.done && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void post('checkin')}
                >
                  {busy === 'checkin' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {t('retention.checkinCta')}
                </Button>
              )}
              {status.tasks[0]?.done && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                  {t('retention.checkedIn')}
                </Badge>
              )}

              {status.claimed ? (
                <Badge variant="secondary" className="text-xs">
                  {t('retention.claimed')}
                </Badge>
              ) : status.canClaim ? (
                <Button size="sm" disabled={busy !== null} onClick={() => void post('claim')}>
                  {busy === 'claim' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {t('retention.claimCta')} +{status.claimableCredits}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">{t('retention.claimLocked')}</span>
              )}

              {justClaimed > 0 && (
                <Badge className="gap-1 bg-primary text-primary-foreground">
                  <Sparkles className="h-3 w-3" />
                  +{justClaimed}
                </Badge>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
