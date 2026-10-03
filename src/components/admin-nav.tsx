'use client';

/**
 * 管理后台 · 导航配置
 *
 * 控制前台左侧菜单栏各入口的显示 / 隐藏与顺序，保存后写入私有桶，
 * 前台最多 60 秒内自动生效（公开接口带 s-maxage=60 缓存）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/lib/auth-context';
import { Loader2, Save, RotateCcw, ChevronUp, ChevronDown, CheckCircle2, XCircle, PanelLeft } from 'lucide-react';
import {
  DEFAULT_NAV_CONFIG,
  NAV_LABELS,
  allNavKeys,
  normalizeNavConfig,
  type NavConfig,
  type NavKey,
} from '@/lib/nav-config';
import { type Locale } from './admin-layout';

interface NavPageProps {
  locale: Locale;
}

export function NavPage({ locale }: NavPageProps) {
  const { accessToken } = useAuth();
  const [nav, setNav] = useState<NavConfig>(DEFAULT_NAV_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const zh = locale === 'zh';

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/nav', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNav(normalizeNavConfig(data.nav));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  // 完整顺序列表：order 中已有的排前面，其余 NavKey 追加到末尾（保证隐藏项也能被配置）
  const orderedKeys = useMemo<NavKey[]>(() => {
    const seen = new Set<string>();
    const out: NavKey[] = [];
    for (const k of nav.order) {
      if (!seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
    for (const k of allNavKeys()) {
      if (!seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
    return out;
  }, [nav.order]);

  const isHidden = (key: NavKey) => nav.hidden.includes(key);

  const toggleHidden = (key: NavKey) => {
    setNotice(null);
    setNav((prev) => {
      const hidden = prev.hidden.includes(key)
        ? prev.hidden.filter((k) => k !== key)
        : [...prev.hidden, key];
      return { ...prev, hidden };
    });
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= orderedKeys.length) return;
    setNotice(null);
    setNav((prev) => {
      const order = [...orderedKeys];
      [order[index], order[target]] = [order[target], order[index]];
      return { ...prev, order };
    });
  };

  const save = useCallback(
    async (cfg: NavConfig) => {
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch('/api/admin/nav', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ order: cfg.order, hidden: cfg.hidden }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setNav(normalizeNavConfig(data.nav));
        setNotice({
          ok: true,
          text: zh
            ? '已保存，前台即时生效（最多 60 秒缓存）'
            : 'Saved — live on the site within 60 seconds',
        });
      } catch (e) {
        setNotice({ ok: false, text: e instanceof Error ? e.message : 'save failed' });
      } finally {
        setBusy(false);
      }
    },
    [accessToken, zh],
  );

  const resetDefault = () => save(normalizeNavConfig(DEFAULT_NAV_CONFIG));

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{zh ? '导航配置' : 'Navigation'}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {zh
            ? '控制前台左侧菜单栏各入口的显示 / 隐藏与顺序，保存后最多 60 秒内在前台生效。'
            : 'Control the visibility and order of entries in the site sidebar. Changes go live within 60 seconds.'}
        </p>
      </div>

      {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}

      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PanelLeft className="w-4 h-4 text-primary" />
              {zh ? '前台左侧菜单栏' : 'Site sidebar'}
            </CardTitle>
            <CardDescription className="mt-2">
              {zh
                ? '开关控制显示 / 隐藏，箭头调整顺序（越靠上越靠前）。'
                : 'Toggle to show/hide, use arrows to reorder (top shows first).'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {orderedKeys.map((key, index) => {
                const hidden = isHidden(key);
                return (
                  <div key={key} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex-1 min-w-0">
                      <span
                        className={`text-sm font-medium ${hidden ? 'text-muted-foreground line-through' : ''}`}
                      >
                        {NAV_LABELS[key][locale]}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">{key}</span>
                    </span>

                    {/* 显示 / 隐藏：Switch 开启 = 显示 */}
                    <Switch
                      checked={!hidden}
                      onCheckedChange={() => toggleHidden(key)}
                      aria-label={zh ? '显示 / 隐藏' : 'Show / hide'}
                    />

                    {/* 上移 / 下移 */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        title={zh ? '上移' : 'Move up'}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={index === orderedKeys.length - 1}
                        onClick={() => move(index, 1)}
                        title={zh ? '下移' : 'Move down'}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {notice && (
              <div
                className={`flex items-start gap-2 text-sm rounded-lg p-3 ${
                  notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {notice.ok ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                )}
                <span className="break-all">{notice.text}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={() => save(nav)} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span className="ml-2">{zh ? '保存' : 'Save'}</span>
              </Button>
              <Button variant="secondary" onClick={resetDefault} disabled={busy}>
                <RotateCcw className="w-4 h-4" />
                <span className="ml-2">{zh ? '恢复默认' : 'Reset to default'}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
