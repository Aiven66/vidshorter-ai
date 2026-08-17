/**
 * AI 工具箱 — 服务端存储与鉴权
 *
 * 输入: 前端上传到 uploads 桶 users/{uid}/ai-tools/ 路径（复用现有直传模式）
 * 输出: service role 写入 users/{uid}/ai-results/，返回 24h 签名 URL
 * 鉴权: Authorization Bearer JWT → anon 客户端 auth.getUser 校验
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const UPLOADS_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'uploads';

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('SUPABASE_NOT_CONFIGURED');
  return { url, anonKey };
}

function getServiceRoleClient() {
  const { url, anonKey } = supabaseConfig();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) throw new Error('SERVICE_KEY_MISSING');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

/** 从请求头校验用户，返回 user id */
export async function requireUserId(req: NextRequest): Promise<string> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw new ApiError(401, 'UNAUTHORIZED');

  const { url, anonKey } = supabaseConfig();
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.id) throw new ApiError(401, 'UNAUTHORIZED');
  return data.user.id;
}

/**
 * 校验输入 URL 是本项目的 Supabase Storage 签名 URL 且属于该用户路径
 * （防止服务端任意 URL 抓取 SSRF）
 */
export function assertUserStorageUrl(rawUrl: string, userId: string, kind: 'ai-tools' | 'ai-results'): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiError(400, 'INVALID_URL');
  }

  const { url } = supabaseConfig();
  const supabaseHost = new URL(url).hostname;
  const isStorageHost =
    parsed.hostname === supabaseHost || parsed.hostname.endsWith(`.${supabaseHost}`);
  if (parsed.protocol !== 'https:' || !isStorageHost) {
    throw new ApiError(400, 'INVALID_URL');
  }
  if (!parsed.pathname.includes(`/object/sign/${UPLOADS_BUCKET}/users/${userId}/${kind}/`)) {
    throw new ApiError(403, 'FORBIDDEN_URL');
  }
  return parsed.toString();
}

/** 校验对象路径属于该用户的 ai-tools 目录（防路径穿越/越权） */
export function assertUserObjectPath(objectPath: string, userId: string): string {
  const prefix = `users/${userId}/ai-tools/`;
  if (
    typeof objectPath !== 'string' ||
    !objectPath.startsWith(prefix) ||
    objectPath.includes('..') ||
    objectPath.length > 512
  ) {
    throw new ApiError(403, 'FORBIDDEN_PATH');
  }
  return objectPath;
}

/**
 * 为用户输入文件签发直传票据。
 * uploads 桶未开放 RLS 写策略，客户端无法带 JWT 直传；
 * service role 预签 upload/sign 票据，客户端匿名 PUT 直传 Supabase，
 * 文件不过服务器（Vercel 4.5MB 请求体限制 + 大视频带宽）。
 */
export async function createUploadTicket(
  userId: string,
  filename: string
): Promise<{ uploadUrl: string; objectPath: string }> {
  const client = getServiceRoleClient();
  const safeName = filename.replace(/[^\w.\-]+/g, '_').slice(-80) || 'upload.bin';
  const objectPath = `users/${userId}/ai-tools/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${safeName}`;

  const { data, error } = await client.storage.from(UPLOADS_BUCKET).createSignedUploadUrl(objectPath);
  if (error || !data) throw new ApiError(500, 'TICKET_FAILED', error?.message);

  // storage-js 可能返回相对路径（/object/upload/sign/...），归一化为绝对 URL
  const uploadUrl = /^https?:\/\//.test(data.signedUrl)
    ? data.signedUrl
    : `${supabaseConfig().url.replace(/\/$/, '')}/storage/v1${data.signedUrl}`;
  return { uploadUrl, objectPath };
}

/** 为已上传的输入对象签发 1h 读取 URL（service role，绕过 RLS 读） */
export async function createInputSignedUrl(userId: string, objectPath: string): Promise<string> {
  assertUserObjectPath(objectPath, userId);
  const client = getServiceRoleClient();
  const { data, error } = await client.storage
    .from(UPLOADS_BUCKET)
    .createSignedUrl(objectPath, 60 * 60);
  if (error || !data?.signedUrl) throw new ApiError(500, 'SIGN_FAILED', error?.message);
  // 同样归一化：相对路径 → 绝对
  return /^https?:\/\//.test(data.signedUrl)
    ? data.signedUrl
    : `${supabaseConfig().url.replace(/\/$/, '')}/storage/v1${data.signedUrl}`;
}

/** 上传处理结果，返回 24h 签名 URL */
export async function uploadResult(
  userId: string,
  ext: 'png' | 'mp4',
  data: Buffer,
  contentType: string
): Promise<{ signedUrl: string; sizeBytes: number }> {
  const client = getServiceRoleClient();
  const objectPath = `users/${userId}/ai-results/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await client.storage.from(UPLOADS_BUCKET).upload(objectPath, data, {
    contentType,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw new ApiError(500, 'RESULT_UPLOAD_FAILED', error.message);

  const { data: signed, error: signError } = await client.storage
    .from(UPLOADS_BUCKET)
    .createSignedUrl(objectPath, 60 * 60 * 24);
  if (signError || !signed?.signedUrl) {
    throw new ApiError(500, 'RESULT_SIGN_FAILED', signError?.message);
  }
  return { signedUrl: signed.signedUrl, sizeBytes: data.byteLength };
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : String(error);
  const code = ['EMPTY_MASK', 'MASK_SIZE_MISMATCH'].includes(message) ? message : 'INTERNAL';
  console.error('[ai-tools]', message);
  return Response.json({ error: code, message }, { status: code === 'INTERNAL' ? 500 : 400 });
}
