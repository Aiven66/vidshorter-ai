/**
 * 免登录试跑的持久化（零 DDL）。
 *
 * 访客试跑**不落 `videos` 表** —— `videos.user_id` 有 FK 约束，虚构 userId 会
 * 触发 23503 崩溃（项目血泪史）。因此试跑产物全部放 Supabase Storage 私有桶：
 *   - `guest-trials/<trialId>.mp4`           : 试跑预览片段（短 TTL 签名 URL）
 *   - `guest-trials/<trialId>.analysis.json` : 完整分析结果（注册后继承，跳过 LLM）
 *   - `guest-trials/limit-<ipHash>-<ymd>.json`: 每 IP 每日一次的限制标记
 *
 * 复用 site-config.ts 的「私有桶 + service role REST」既有模式：无 SDK 依赖、
 * 无新表、无 DDL。任何存储异常都向上抛，由调用方决定降级/报错。
 */

import { createHash } from 'crypto';

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'uploads';
const PREFIX = 'guest-trials';
/** 分析结果的有效期：注册后 24h 内可继承，超时回落正常分析。 */
export const TRIAL_TTL_MS = 24 * 60 * 60 * 1000;
/** 预览签名 URL 的有效期（2h）——足够访客看完并决定注册。 */
const PREVIEW_URL_TTL_SEC = 2 * 60 * 60;

interface ServiceCreds {
  url: string;
  key: string;
}

function serviceCreds(): ServiceCreds | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

function authHeaders(key: string, extra?: Record<string, string>): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, ...(extra || {}) };
}

/** 试跑分析结果（注册后可原样复用，跳过 LLM 分析）。 */
export interface TrialAnalysis {
  videoUrl: string;
  title: string;
  duration: number;
  highlights: Array<{
    title: string;
    start_time: number;
    end_time: number;
    summary: string;
    engagement_score: number;
  }>;
  createdAt: string;
}

/** 每 IP 每日限一次的日期键（UTC，与积分重置口径一致）。 */
export function trialDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

/** IP → 不可逆哈希（避免把明文 IP 写进对象名）。 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(ip || 'unknown').digest('hex').slice(0, 16);
}

function limitPath(ipHash: string, dayKey: string): string {
  return `${PREFIX}/limit-${ipHash}-${dayKey}.json`;
}

function analysisPath(trialId: string): string {
  return `${PREFIX}/${trialId}.analysis.json`;
}

function videoPath(trialId: string): string {
  return `${PREFIX}/${trialId}.mp4`;
}

/** 对象是否存在（HEAD）。网络异常保守返回 true，避免误放行无限制试跑。 */
async function objectExists(path: string): Promise<boolean> {
  const creds = serviceCreds();
  if (!creds) throw new Error('guest-trial: storage not configured');
  const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'HEAD',
    headers: authHeaders(creds.key),
    cache: 'no-store',
  });
  if (res.status === 404) return false;
  if (res.ok) return true;
  // 其它状态（鉴权/网络）无法判定 —— 保守视为已用，防止绕过限流。
  return true;
}

/** 该 IP 今日是否已用过试跑。 */
export async function isTrialUsed(ipHash: string): Promise<boolean> {
  return objectExists(limitPath(ipHash, trialDayKey()));
}

/** 预占今日试跑名额（写入标记）。失败抛错，由调用方决定是否放行。 */
export async function reserveTrial(ipHash: string): Promise<void> {
  const creds = serviceCreds();
  if (!creds) throw new Error('guest-trial: storage not configured');
  const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${limitPath(ipHash, trialDayKey())}`, {
    method: 'POST',
    headers: authHeaders(creds.key, { 'Content-Type': 'application/json', 'x-upsert': 'true' }),
    body: JSON.stringify({ at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`guest-trial: reserve failed ${res.status}`);
}

/** 释放今日名额（试跑失败时调用，让用户可重试）。best-effort。 */
export async function releaseTrial(ipHash: string): Promise<void> {
  const creds = serviceCreds();
  if (!creds) return;
  await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${limitPath(ipHash, trialDayKey())}`, {
    method: 'DELETE',
    headers: authHeaders(creds.key),
  }).catch(() => {});
}

/** 上传试跑预览片段并返回 2h 签名 URL。 */
export async function uploadTrialVideo(trialId: string, buf: Buffer): Promise<string> {
  const creds = serviceCreds();
  if (!creds) throw new Error('guest-trial: storage not configured');
  const up = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${videoPath(trialId)}`, {
    method: 'POST',
    headers: authHeaders(creds.key, { 'Content-Type': 'video/mp4', 'x-upsert': 'true' }),
    body: new Uint8Array(buf),
  });
  if (!up.ok) throw new Error(`guest-trial: video upload failed ${up.status} ${(await up.text()).slice(0, 160)}`);

  const sign = await fetch(`${creds.url}/storage/v1/object/sign/${BUCKET}/${videoPath(trialId)}`, {
    method: 'POST',
    headers: authHeaders(creds.key, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: PREVIEW_URL_TTL_SEC }),
  });
  if (!sign.ok) throw new Error(`guest-trial: sign failed ${sign.status}`);
  const data = (await sign.json()) as { signedURL?: string };
  if (!data.signedURL) throw new Error('guest-trial: sign returned no url');
  return `${creds.url}${data.signedURL}`;
}

/** 写入完整分析结果（供注册后继承）。best-effort —— 失败不影响试跑返回值。 */
export async function writeTrialAnalysis(trialId: string, analysis: TrialAnalysis): Promise<void> {
  const creds = serviceCreds();
  if (!creds) return;
  await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${analysisPath(trialId)}`, {
    method: 'POST',
    headers: authHeaders(creds.key, { 'Content-Type': 'application/json', 'x-upsert': 'true' }),
    body: JSON.stringify(analysis),
  }).catch(() => {});
}

/**
 * 读取可继承的试跑分析。校验 videoUrl 一致且未超过 24h，否则返回 null
 * （调用方静默回落正常分析，绝不阻断主流程）。
 */
export async function readTrialAnalysis(trialId: string, videoUrl: string): Promise<TrialAnalysis | null> {
  const creds = serviceCreds();
  if (!creds) return null;
  try {
    const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${analysisPath(trialId)}`, {
      headers: authHeaders(creds.key),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as TrialAnalysis;
    if (!data || typeof data !== 'object') return null;
    if (data.videoUrl !== videoUrl) return null;
    if (!Array.isArray(data.highlights) || data.highlights.length === 0) return null;
    const created = Date.parse(data.createdAt || '');
    if (!Number.isFinite(created) || Date.now() - created > TRIAL_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}
