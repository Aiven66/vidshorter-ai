/**
 * 站点配置（导航配置）——服务端唯一读取入口。
 *
 * 与 model-config.ts 同构：复用同一私有桶 `clipop-config`，对象 `nav-config.json`，
 * 60s 内存缓存 + service role 读写，未配置时返回默认值而不抛错（零 DDL）。
 */

import { DEFAULT_NAV_CONFIG, normalizeNavConfig, type NavConfig } from '@/lib/nav-config';

const BUCKET = 'clipop-config';
const OBJECT = 'nav-config.json';
const CACHE_TTL_MS = 60_000;

interface ServiceCreds {
  url: string;
  key: string;
}

function serviceCreds(): ServiceCreds | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return { url, key };
}

interface NavConfigStored {
  nav: NavConfig;
  updatedAt?: string;
  updatedBy?: string;
}

let cache: { at: number; data: NavConfigStored } | null = null;

function defaultStored(): NavConfigStored {
  return { nav: { order: [...DEFAULT_NAV_CONFIG.order], hidden: [...DEFAULT_NAV_CONFIG.hidden] } };
}

function normalizeStored(raw: unknown): NavConfigStored {
  if (!raw || typeof raw !== 'object') return defaultStored();
  const obj = raw as Record<string, unknown>;
  // 兼容两种写法：{ nav: {...} } 或直接存 NavConfig
  const nav = normalizeNavConfig(obj.nav ?? obj);
  return {
    nav,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : undefined,
    updatedBy: typeof obj.updatedBy === 'string' ? obj.updatedBy : undefined,
  };
}

/** 读取导航配置（带 60s 缓存）。未配置 / 读取失败 / 解析失败 → 返回默认配置。 */
export async function readNavConfig(): Promise<NavConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data.nav;
  const creds = serviceCreds();
  if (!creds) return { ...DEFAULT_NAV_CONFIG, order: [...DEFAULT_NAV_CONFIG.order], hidden: [...DEFAULT_NAV_CONFIG.hidden] };
  try {
    const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${OBJECT}`, {
      headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const data = defaultStored();
      cache = { at: Date.now(), data };
      return data.nav;
    }
    const stored = normalizeStored(await res.json());
    cache = { at: Date.now(), data: stored };
    return stored.nav;
  } catch {
    return { ...DEFAULT_NAV_CONFIG, order: [...DEFAULT_NAV_CONFIG.order], hidden: [...DEFAULT_NAV_CONFIG.hidden] };
  }
}

/** 覆盖写入导航配置。返回写入后的完整视图（含 updatedAt / updatedBy）。 */
export async function writeNavConfig(
  cfg: NavConfig,
  updatedBy?: string,
): Promise<{ nav: NavConfig; updatedAt?: string; updatedBy?: string }> {
  const creds = serviceCreds();
  if (!creds) throw new Error('nav-config: supabase service role not configured');

  const current = cache?.data;
  const next: NavConfigStored = {
    nav: normalizeNavConfig(cfg),
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || current?.updatedBy,
  };

  const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${OBJECT}`, {
    method: 'POST',
    headers: {
      apikey: creds.key,
      Authorization: `Bearer ${creds.key}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body: JSON.stringify(next, null, 2),
  });
  if (!res.ok) {
    throw new Error(`nav-config: write failed ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  cache = { at: Date.now(), data: next };
  return { nav: next.nav, updatedAt: next.updatedAt, updatedBy: next.updatedBy };
}

/** 读取完整视图（供管理后台展示）。未配置时返回默认配置且无 updatedAt。 */
export async function getNavConfigView(): Promise<{
  nav: NavConfig;
  updatedAt?: string;
  updatedBy?: string;
}> {
  const creds = serviceCreds();
  if (!creds) return { nav: await readNavConfig() };
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { nav: cache.data.nav, updatedAt: cache.data.updatedAt, updatedBy: cache.data.updatedBy };
  }
  // 复用 readNavConfig 填充缓存，再从缓存取元数据
  const nav = await readNavConfig();
  return {
    nav,
    updatedAt: cache?.data.updatedAt,
    updatedBy: cache?.data.updatedBy,
  };
}
