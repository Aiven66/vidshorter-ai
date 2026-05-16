import { NextRequest } from 'next/server';
import { pullNextAgentJob } from '@/lib/server/agent-job-store';

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

  const body = (await req.json().catch(() => null)) as null | { agentId?: string };
  const agentId = typeof body?.agentId === 'string' && body.agentId.trim()
    ? body.agentId.trim()
    : 'agent-unknown';

  const job = await pullNextAgentJob(agentId);
  return new Response(JSON.stringify({ job }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

