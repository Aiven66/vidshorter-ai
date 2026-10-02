import { NextRequest, NextResponse } from 'next/server';
import { resolveBearerUserId } from '@/lib/server/plan-gate';
import { createInputSignedUrl } from '@/lib/server/ai-tools/storage';
import { detectDigitalHumanCapability } from '@/lib/server/digital-human/provider';
import {
  DashscopeError,
  MAX_NARRATION_CHARS,
  hostOnDashscope,
  requireDashscopeConfig,
  submitTalkingVideo,
  synthesizeNarrationUrl,
} from '@/lib/server/digital-human/dashscope';
import { saveTask, type DigitalHumanTask } from '@/lib/server/digital-human/task-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** 允许 service 端抓取的图片 URL：仅 https，且拒绝本机/私网字面量（基础 SSRF 防护）。 */
function assertFetchableImageUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'https:') throw new DashscopeError('INVALID_IMAGE_URL', '图片 URL 必须为 https', 400);
  const host = u.hostname.toLowerCase();
  const isPrivate =
    host === 'localhost' ||
    host.endsWith('.local') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '[::1]';
  if (isPrivate) throw new DashscopeError('INVALID_IMAGE_URL', '图片 URL 不允许指向内网地址', 400);
  return u;
}

function extFromContentType(ct: string, fallbackUrl: string): { ext: string; mime: string } {
  const c = ct.split(';')[0].trim().toLowerCase();
  if (c === 'image/png') return { ext: 'png', mime: c };
  if (c === 'image/webp') return { ext: 'webp', mime: c };
  if (c === 'image/bmp') return { ext: 'bmp', mime: c };
  if (c === 'image/jpeg' || c === 'image/jpg') return { ext: 'jpg', mime: 'image/jpeg' };
  const m = /\.(png|webp|bmp|jpe?g)(?:\?|$)/i.exec(fallbackUrl);
  const e = m?.[1]?.toLowerCase();
  if (e === 'png' || e === 'webp' || e === 'bmp') return { ext: e, mime: `image/${e}` };
  return { ext: 'jpg', mime: 'image/jpeg' };
}

async function loadImage(
  userId: string,
  body: { imageObjectPath?: string; imageUrl?: string },
): Promise<{ buf: Buffer; ext: string; mime: string }> {
  let url: string;
  if (body.imageObjectPath) {
    url = await createInputSignedUrl(userId, String(body.imageObjectPath));
  } else if (body.imageUrl) {
    url = assertFetchableImageUrl(String(body.imageUrl)).toString();
  } else {
    throw new DashscopeError('MISSING_IMAGE', '请提供参考图（imageObjectPath 或 imageUrl）', 400);
  }

  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new DashscopeError('IMAGE_FETCH_FAILED', `图片读取失败 ${r.status}`, 400);
  const ct = r.headers.get('content-type') || '';
  if (ct && !ct.startsWith('image/')) {
    throw new DashscopeError('INVALID_IMAGE_TYPE', `参考图不是图片（content-type: ${ct}）`, 400);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw new DashscopeError('EMPTY_IMAGE', '参考图为空', 400);
  if (buf.length > MAX_IMAGE_BYTES) throw new DashscopeError('IMAGE_TOO_LARGE', '参考图超过 10MB', 400);
  return { buf, ...extFromContentType(ct, url) };
}

/**
 * 数字人口播 —— 提交生成任务。
 *
 * body: { imageObjectPath? | imageUrl?, text, voice, resolution?: '480P'|'720P' }
 * 返回: { taskId }，随后轮询 GET /api/digital-human/status?taskId=
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await resolveBearerUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: '请先登录后再生成数字人视频' }, { status: 401 });
    }

    const cap = await detectDigitalHumanCapability();
    if (!cap.available) {
      return NextResponse.json({ error: 'PROVIDER_UNAVAILABLE', message: cap.reason, missingEnv: cap.missingEnv }, { status: 503 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    }

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const voice = typeof body.voice === 'string' && body.voice.trim() ? body.voice.trim() : 'Cherry';
    const resolution = body.resolution === '720P' ? '720P' : '480P';
    if (!text) return NextResponse.json({ error: 'MISSING_TEXT', message: '请填写口播文案' }, { status: 400 });
    if (text.length > MAX_NARRATION_CHARS) {
      return NextResponse.json(
        { error: 'TEXT_TOO_LONG', message: `口播文案过长（${text.length} 字），单次须 ≤ ${MAX_NARRATION_CHARS} 字（对应音频 <20 秒）` },
        { status: 400 },
      );
    }

    const creds = await requireDashscopeConfig();
    const image = await loadImage(userId, {
      imageObjectPath: typeof body.imageObjectPath === 'string' ? body.imageObjectPath : undefined,
      imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
    });

    // 1) 合成旁白 → 公网音频 URL；2) 参考图托管为 oss://
    const [audioUrl, imageOssUrl] = await Promise.all([
      synthesizeNarrationUrl(creds, { text, voice }),
      hostOnDashscope(creds, image.buf, image.ext, image.mime),
    ]);

    // 3) 提交 wan2.2-s2v
    const providerTaskId = await submitTalkingVideo(creds, { imageUrl: imageOssUrl, audioUrl, resolution });

    const now = new Date().toISOString();
    const task: DigitalHumanTask = {
      id: `dh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      providerTaskId,
      status: 'submitted',
      resolution,
      voice,
      createdAt: now,
      updatedAt: now,
    };
    await saveTask(task);

    return NextResponse.json({ taskId: task.id, status: task.status, resolution, voice });
  } catch (e) {
    if (e instanceof DashscopeError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error('[digital-human/generate]', message);
    return NextResponse.json({ error: 'INTERNAL', message }, { status: 500 });
  }
}