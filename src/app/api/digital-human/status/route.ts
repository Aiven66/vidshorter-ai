import { NextRequest, NextResponse } from 'next/server';
import { resolveBearerUserId } from '@/lib/server/plan-gate';
import { uploadResult } from '@/lib/server/ai-tools/storage';
import { pollTalkingVideo, requireDashscopeConfig, DashscopeError, describeFetchError } from '@/lib/server/digital-human/dashscope';
import { getTask, saveTask, type DigitalHumanTask } from '@/lib/server/digital-human/task-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 终态不再轮询。 */
function isTerminal(t: DigitalHumanTask): boolean {
  return t.status === 'succeeded' || t.status === 'failed';
}

/** 把百炼原始视频转存到 Supabase，返回 24h 签名 URL（百炼 URL 会过期）。 */
async function persistVideo(task: DigitalHumanTask, providerVideoUrl: string): Promise<DigitalHumanTask> {
  const r = await fetch(providerVideoUrl, { cache: 'no-store' });
  if (!r.ok) throw new Error(`下载生成视频失败 ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const { signedUrl } = await uploadResult(task.userId, 'mp4', buf, 'video/mp4');
  return { ...task, status: 'succeeded', videoUrl: signedUrl, providerVideoUrl, error: undefined };
}

/**
 * 数字人口播 —— 查询任务状态。
 * GET /api/digital-human/status?taskId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await resolveBearerUserId(request);
    if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

    const taskId = request.nextUrl.searchParams.get('taskId') || '';
    if (!taskId) return NextResponse.json({ error: 'MISSING_TASK_ID' }, { status: 400 });

    let task = await getTask(taskId);
    if (!task) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    if (task.userId !== userId) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    if (isTerminal(task)) {
      return NextResponse.json({ status: task.status, videoUrl: task.videoUrl, error: task.error });
    }

    const creds = await requireDashscopeConfig();
    const result = await pollTalkingVideo(creds, task.providerTaskId);

    if (result.status === 'SUCCEEDED') {
      if (!result.videoUrl) {
        task = { ...task, status: 'failed', error: '百炼返回成功但缺少 video_url', updatedAt: new Date().toISOString() };
      } else {
        try {
          task = await persistVideo(task, result.videoUrl);
        } catch (e) {
          // 转存失败不算生成失败：把百炼原始 URL 透出，至少可即时预览
          task = {
            ...task,
            status: 'succeeded',
            providerVideoUrl: result.videoUrl,
            error: `视频转存失败（链接将过期）：${e instanceof Error ? e.message : String(e)}`,
          };
        }
      }
    } else if (result.status === 'FAILED' || result.status === 'UNKNOWN') {
      task = { ...task, status: 'failed', error: result.message || '百炼任务失败', updatedAt: new Date().toISOString() };
    } else {
      task = { ...task, status: 'processing', updatedAt: new Date().toISOString() };
    }

    await saveTask(task);
    return NextResponse.json({ status: task.status, videoUrl: task.videoUrl, error: task.error });
  } catch (e) {
    if (e instanceof DashscopeError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    }
    const message = describeFetchError(e);
    console.error('[digital-human/status]', message);
    return NextResponse.json({ error: 'INTERNAL', message }, { status: 500 });
  }
}