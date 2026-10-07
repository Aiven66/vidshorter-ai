import { Client as QStashClient } from '@upstash/qstash';
import { Receiver } from '@upstash/qstash';

/**
 * QStash queue configuration for the async video pipeline.
 *
 * Env-driven: if QSTASH_TOKEN is present, jobs are dispatched through the durable
 * QStash queue (each clip runs as its own micro-task well under the function limit,
 * so long videos can never be killed by a single 300s/60s timeout again).
 * If QSTASH_TOKEN is absent, the caller falls back to running the job inline via
 * `after()` (local dev / before credentials are configured). Every public helper
 * here works in both modes.
 */

export interface VideoJobMessage {
  step: 'analyze' | 'clip';
  videoId: string;
  userId: string;
  videoUrl: string;
  sourceType?: string;
  quality?: 'sd' | 'hd';
  locale?: string;
  streamUrl?: string;
  streamMetadata?: Record<string, unknown>;
  /** For clip steps: which highlight to process. */
  index?: number;
  desiredClipCount?: number;
  /** 单条成片的目标时长（秒）。Shorts 成片传 30 等；缺省走 clipDurations 自动分级。 */
  clipTargetSeconds?: number;
  /**
   * P0-2 免登录试跑：注册后带上试跑 id，analyze 步骤可继承试跑时已算好的分析结果
   * （<24h 且 URL 匹配）而跳过 LLM。校验失败静默回落正常分析。
   */
  trialId?: string;
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

/** Absolute base URL the QStash webhook is reachable at. */
export function appBaseUrl(): string {
  const fromConst =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_DESKTOP_WEB_APP_URL ||
    '';
  if (fromConst.trim()) return stripTrailingSlash(fromConst.trim());
  if (process.env.VERCEL_URL) return `https://${stripTrailingSlash(process.env.VERCEL_URL)}`;
  return 'http://localhost:3000';
}

/** Public URL of the QStash worker webhook. */
export function workerWebhookUrl(): string {
  return `${appBaseUrl()}/api/videos/process/worker`;
}

/** True when a QStash token is configured and the durable queue should be used. */
export function qstashEnabled(): boolean {
  return !!process.env.QSTASH_TOKEN?.trim();
}

let clientSingleton: QStashClient | null = null;
function getClient(): QStashClient {
  if (!clientSingleton) {
    clientSingleton = new QStashClient({
      token: process.env.QSTASH_TOKEN || '',
    });
  }
  return clientSingleton;
}

/**
 * Enqueue a job message onto QStash (durable mode).
 * Returns false if QStash is not configured so the caller can fall back to inline.
 */
export async function enqueueJob(message: VideoJobMessage, opts?: { delaySec?: number; retries?: number }): Promise<boolean> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) return false; // not configured → caller runs inline
  await getClient().publishJSON({
    url: workerWebhookUrl(),
    body: message,
    retries: opts?.retries ?? 2,
    ...(opts?.delaySec ? { delay: opts.delaySec } : {}),
  });
  return true;
}

/**
 * Verify an incoming QStash webhook request. Safe to call for any POST; returns
 * true when the signature matches, and also returns true when QStash is not
 * configured (i.e. the worker was called directly in dev/fallback mode).
 */
export async function verifyQStashRequest(signatureHeader: string | null, body: string | Buffer): Promise<boolean> {
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY && !process.env.QSTASH_NEXT_SIGNING_KEY) {
    // Not configured to verify → allow (fallback / dev mode).
    return true;
  }
  if (!signatureHeader) return false;
  // The SDK Receiver always needs a signing key; when absent we tolerate.
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY ?? '';
  const next = process.env.QSTASH_NEXT_SIGNING_KEY ?? '';
  const receiver = new Receiver({ currentSigningKey: current, nextSigningKey: next });
  const plainBody = typeof body === 'string' ? body : body.toString('utf8');
  return receiver.verify({ signature: signatureHeader, body: plainBody });
}