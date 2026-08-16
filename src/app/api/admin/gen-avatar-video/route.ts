import { NextRequest, NextResponse } from 'next/server';

/**
 * 临时管理工具：用 Seedance（首帧=形象照）生成真人主播说话视频素材。
 * 仅管理员（ADMIN_API_KEY）可调用；素材生成完成后本路由可移除。
 *
 * 两段式（避免 Serverless 函数超时）：
 * - { mode: 'submit', photoUrl, prompt } → 创建任务，立即返回 taskId
 * - { mode: 'poll', taskId }            → 查询任务状态 / videoUrl
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function cozeConfig() {
  const apiKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  const baseUrl = process.env.COZE_INTEGRATION_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error('COZE_WORKLOAD_IDENTITY_API_KEY / COZE_INTEGRATION_BASE_URL not configured');
  }
  return { apiKey, baseUrl };
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('x-admin-key');
  if (!process.env.ADMIN_API_KEY || auth !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { apiKey, baseUrl } = cozeConfig();
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    if (body?.mode === 'poll') {
      const taskId = String(body.taskId || '');
      if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });
      const resp = await fetch(`${baseUrl}/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers,
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        return NextResponse.json({ error: `poll failed (${resp.status})`, detail: data }, { status: 502 });
      }
      return NextResponse.json({
        taskId,
        status: data?.status ?? 'unknown',
        videoUrl: data?.content?.video_url ?? null,
        error: data?.error_message ?? null,
        raw: data,
      });
    }

    // mode: submit（默认）
    const { photoUrl, prompt } = body;
    if (typeof photoUrl !== 'string' || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'photoUrl and prompt required' }, { status: 400 });
    }

    const payload = {
      model: 'doubao-seedance-1-5-pro-251215',
      content: [
        { type: 'image_url', image_url: { url: photoUrl }, role: 'first_frame' },
        { type: 'text', text: prompt },
      ],
      resolution: '720p',
      ratio: '3:4',
      duration: 5,
      camerafixed: true,
      watermark: false,
      generate_audio: false,
    };

    const resp = await fetch(`${baseUrl}/api/v3/contents/generations/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data?.id) {
      return NextResponse.json({ error: `submit failed (${resp.status})`, detail: data }, { status: 502 });
    }
    return NextResponse.json({ taskId: data.id, status: data.status ?? 'queued' });
  } catch (err) {
    console.error('[gen-avatar-video] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'generation failed' },
      { status: 500 },
    );
  }
}
