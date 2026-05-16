import { NextRequest } from 'next/server';
import { updateAgentJob } from '@/lib/server/agent-job-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireAgentSecret(req: NextRequest) {
  const secret = (process.env.AGENT_SECRET || '').trim();
  if (!secret) return true;
  const got = (req.headers.get('x-agent-secret') || '').trim();
  return got && got === secret;
}

export async function POST(req: NextRequest) {
  if (!requireAgentSecret(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as null | {
    jobId?: string;
    status?: 'queued' | 'processing' | 'completed' | 'failed';
    stage?: string;
    progress?: number;
    message?: string;
    result?: unknown;
    error?: string;
  };

  const jobId = typeof body?.jobId === 'string' ? body.jobId.trim() : '';
  if (!jobId) {
    return new Response(JSON.stringify({ error: 'Missing jobId' }), { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body?.status) patch.status = body.status;
  if (typeof body?.stage === 'string') patch.stage = body.stage;
  if (typeof body?.progress === 'number' && Number.isFinite(body.progress)) patch.progress = body.progress;
  if (typeof body?.message === 'string') patch.message = body.message;
  if (typeof body?.error === 'string') patch.error = body.error;
  if (typeof body?.result === 'object' && body.result) patch.result = body.result;

  const job = await updateAgentJob(jobId, patch as never);
  if (!job) {
    return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 });
  }

  return new Response(JSON.stringify({ job }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

