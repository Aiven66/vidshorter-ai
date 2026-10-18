/**
 * AI 工具箱 — 前端云服务调用
 *
 * 范式: 服务端签发直传票据 → 文件 PUT 直传 Supabase Storage（users/{uid}/ai-tools/）
 *       → 读取签名 URL → POST /api/ai-tools/* → 服务端推理 → 结果签名 URL
 * 用户无需下载任何模型；文件不经过应用服务器。
 */

export class AiToolError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message || code);
    this.code = code;
  }
}

export interface AiUpload {
  signedUrl: string;
  objectPath: string;
}

/**
 * token 提供者：由调用方（React 侧）给出「当前可用的 access token」。
 *
 * 之所以不直接传 token：用户常见反馈是「界面明明已登录，工具却提示请先登录」。
 * 根因是本地持有的 token 缺失或已被服务端判为过期，把「取 token」做成回调后，
 * 这里就能在 401 时回调一次 `forceRefresh=true` 无感刷新会话并重试。
 */
export type AiToolTokenProvider = (forceRefresh?: boolean) => Promise<string | null>;

/** 取 token → 执行 → 仅当 401（UNAUTHORIZED）时刷新一次并重试。 */
async function withAuthToken<T>(
  getToken: AiToolTokenProvider,
  run: (token: string) => Promise<T>
): Promise<T> {
  const token = await getToken();
  if (!token) throw new AiToolError('UNAUTHORIZED');
  try {
    return await run(token);
  } catch (e) {
    if (!(e instanceof AiToolError) || e.code !== 'UNAUTHORIZED') throw e;
    const refreshed = await getToken(true);
    if (!refreshed || refreshed === token) throw e;
    return await run(refreshed);
  }
}

async function callUploadApi(
  token: string,
  body: Record<string, unknown>
): Promise<Record<string, string>> {
  const resp = await fetch('/api/ai-tools/upload', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, string>;
  if (!resp.ok) {
    throw new AiToolError(data.error || `HTTP_${resp.status}`, data.message || data.error);
  }
  return data;
}

/** 上传输入文件（图片/视频/掩码），需登录：票据 → 直传 → 读签名 */
export async function uploadAiInput(
  getToken: AiToolTokenProvider,
  _userId: string,
  blob: Blob,
  filename: string,
  contentType: string
): Promise<AiUpload> {
  return withAuthToken(getToken, async (token) => {
    // 1. 服务端签发直传票据（含 objectPath）
    const ticket = await callUploadApi(token, { action: 'ticket', filename });
    if (!ticket.uploadUrl || !ticket.objectPath) {
      throw new AiToolError('TICKET_FAILED', 'Malformed upload ticket.');
    }

    // 2. 匿名 PUT 直传 Supabase（票据即凭证）
    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': contentType || 'application/octet-stream' },
      body: blob,
    });
    if (!put.ok) {
      const text = await put.text().catch(() => '');
      throw new AiToolError('UPLOAD_FAILED', `HTTP ${put.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
    }

    // 3. 读取签名 URL（供 /api/ai-tools/* 服务端拉取）
    const { signedUrl } = await callUploadApi(token, {
      action: 'read-url',
      objectPath: ticket.objectPath,
    });
    if (!signedUrl) throw new AiToolError('SIGN_FAILED', 'Missing signed URL.');
    return { signedUrl, objectPath: ticket.objectPath };
  });
}

/** 调用服务端 AI 工具 */
export async function callAiTool<T>(
  getToken: AiToolTokenProvider,
  tool: 'image-dewatermark' | 'video-dewatermark' | 'image-upscale' | 'image-colorization' | 'image-remove-bg' | 'chat-video-edit',
  body: Record<string, unknown>
): Promise<T> {
  return withAuthToken(getToken, async (token) => {
    const resp = await fetch(`/api/ai-tools/${tool}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await resp.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!resp.ok) {
      throw new AiToolError(data.error || `HTTP_${resp.status}`, data.message || data.error);
    }
    return data as T;
  });
}

export interface AiImageResult {
  resultUrl: string;
  width: number;
  height: number;
}

export interface AiVideoResult {
  resultUrl: string;
  sizeBytes: number;
}

export interface AiChatVideoEditResult {
  reply: string;
  ffmpegCommand: string;
  resultUrl?: string;
  sizeBytes?: number;
  error?: string;
}
