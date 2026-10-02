'use client';

/**
 * 管理后台 · 模型配置
 *
 * 把 DeepSeek / 阿里云百炼 / MiniMax / RunningHub 的密钥统一在后台维护，
 * 保存后落库到私有桶，服务端**即时生效（无需重新部署）**。
 * 密钥读取时一律打码（只回显前 4 + 后 4），保存时留空表示「不修改」。
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { Loader2, Save, PlugZap, KeyRound, CheckCircle2, XCircle } from 'lucide-react';
import { type Locale } from './admin-layout';

interface FieldView {
  key: string;
  label: { zh: string; en: string };
  secret: boolean;
  placeholder?: string;
  help?: { zh: string; en: string };
  masked: string;
  source: 'db' | 'env' | 'none';
}

interface ProviderView {
  id: string;
  name: { zh: string; en: string };
  kind: string;
  description: { zh: string; en: string };
  fields: FieldView[];
}

interface ModelsPageProps {
  locale: Locale;
}

export function ModelsPage({ locale }: ModelsPageProps) {
  const { accessToken } = useAuth();
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const zh = locale === 'zh';

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/models', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProviders(data.providers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const onEdit = (key: string, value: string) => setEdits((p) => ({ ...p, [key]: value }));

  const saveProvider = async (provider: ProviderView) => {
    setBusy(provider.id);
    setNotice(null);
    try {
      const values: Record<string, string> = {};
      for (const f of provider.fields) {
        const v = edits[f.key];
        if (typeof v === 'string' && v.trim()) values[f.key] = v.trim();
      }
      const res = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProviders(data.providers || []);
      setEdits((p) => {
        const next = { ...p };
        for (const f of provider.fields) delete next[f.key];
        return next;
      });
      setNotice({ id: provider.id, ok: true, text: zh ? '已保存，服务端即时生效' : 'Saved — effective immediately' });
    } catch (e) {
      setNotice({ id: provider.id, ok: false, text: e instanceof Error ? e.message : 'save failed' });
    } finally {
      setBusy(null);
    }
  };

  const testProvider = async (provider: ProviderView) => {
    setBusy(provider.id);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'test', providerId: provider.id }),
      });
      const data = await res.json().catch(() => ({}));
      setNotice({ id: provider.id, ok: !!data.ok, text: data.detail || (data.ok ? 'ok' : 'failed') });
    } catch (e) {
      setNotice({ id: provider.id, ok: false, text: e instanceof Error ? e.message : 'test failed' });
    } finally {
      setBusy(null);
    }
  };

  const clearProvider = async (provider: ProviderView) => {
    setBusy(provider.id);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ clear: provider.fields.map((f) => f.key) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProviders(data.providers || []);
      setNotice({ id: provider.id, ok: true, text: zh ? '已清除该 provider 的后台配置（回落环境变量）' : 'Cleared (falls back to env)' });
    } catch (e) {
      setNotice({ id: provider.id, ok: false, text: e instanceof Error ? e.message : 'clear failed' });
    } finally {
      setBusy(null);
    }
  };

  const sourceBadge = (f: FieldView) => {
    if (f.source === 'db') return <Badge variant="default">{zh ? '后台已配置' : 'From admin'}</Badge>;
    if (f.source === 'env') return <Badge variant="secondary">{zh ? '来自环境变量' : 'From env'}</Badge>;
    return <Badge variant="outline">{zh ? '未配置' : 'Not set'}</Badge>;
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{zh ? '模型配置' : 'Model Configuration'}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {zh
            ? '配置各模型服务的 API Key。保存后服务端即时生效，无需重新部署；密钥仅服务端可读，界面只回显打码值。'
            : 'Configure API keys for model providers. Changes take effect server-side immediately (no redeploy). Keys are server-only and shown masked.'}
        </p>
      </div>

      {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}

      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {providers.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-primary" />
                      {p.name[locale]}
                    </CardTitle>
                    <CardDescription className="mt-2">{p.description[locale]}</CardDescription>
                  </div>
                  <Badge variant="outline" className="shrink-0 uppercase">
                    {p.kind}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                {p.fields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`${p.id}-${f.key}`} className="text-sm">
                        {f.label[locale]}
                      </Label>
                      {sourceBadge(f)}
                    </div>
                    <Input
                      id={`${p.id}-${f.key}`}
                      type={f.secret ? 'password' : 'text'}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={f.secret ? f.masked || f.placeholder : f.masked || f.placeholder}
                      value={edits[f.key] ?? ''}
                      onChange={(e) => onEdit(f.key, e.target.value)}
                    />
                    <div className="text-xs text-muted-foreground">
                      {f.secret
                        ? zh
                          ? '留空 = 不修改；填入新值即覆盖'
                          : 'Leave blank to keep unchanged'
                        : f.help
                          ? f.help[locale]
                          : zh
                            ? '留空 = 保持默认'
                            : 'Leave blank to keep default'}
                    </div>
                  </div>
                ))}

                {notice?.id === p.id && (
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

                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <Button onClick={() => saveProvider(p)} disabled={busy === p.id}>
                    {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span className="ml-2">{zh ? '保存' : 'Save'}</span>
                  </Button>
                  <Button variant="secondary" onClick={() => testProvider(p)} disabled={busy === p.id}>
                    <PlugZap className="w-4 h-4" />
                    <span className="ml-2">{zh ? '测试连通' : 'Test'}</span>
                  </Button>
                  <Button variant="ghost" onClick={() => clearProvider(p)} disabled={busy === p.id}>
                    {zh ? '清除' : 'Clear'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}