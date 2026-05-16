import { NextRequest } from 'next/server';
import { createAgentJob } from '@/lib/server/agent-job-store';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as null | {
    videoUrl?: string;
    userId?: string;
    desiredClipCount?: number;
  };

  const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl.trim() : '';
  const requestedUserId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const desiredClipCount =
    typeof body?.desiredClipCount === 'number' ? body.desiredClipCount : undefined;

  if (!videoUrl) {
    return new Response(JSON.stringify({ error: 'Missing videoUrl' }), { status: 400 });
  }
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  let userId = requestedUserId || 'demo-user';
  if (isSupabaseConfigured()) {
    if (!bearerToken) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
    }
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const client = getSupabaseClient(bearerToken);
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.id) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
    }
    userId = user.id;
  }

  const job = await createAgentJob({
    videoUrl,
    userId,
    desiredClipCount,
  });

  return new Response(JSON.stringify({ job }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
