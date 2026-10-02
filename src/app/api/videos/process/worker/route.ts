import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashRequest, type VideoJobMessage } from '@/lib/server/video-queue';
import { runVideoJob } from '@/lib/server/video-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * QStash webhook: executes a single queued video micro-task.
 *
 * QStash delivers { step: 'analyze' } and { step: 'clip' } messages here. Each
 * invocation runs one bounded micro-task (analysis, or one short clip), then
 * persists progress. Because work is split per-clip, no single invocation ever
 * approaches the function timeout for long videos.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get('upstash-signature');
  const raw = await request.text();
  try {
    const ok = await verifyQStashRequest(signature, raw);
    if (!ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  let msg: VideoJobMessage;
  try {
    msg = JSON.parse(raw) as VideoJobMessage;
  } catch {
    return NextResponse.json({ error: 'Invalid message body' }, { status: 400 });
  }

  if (msg.step !== 'analyze' && msg.step !== 'clip') {
    return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
  }
  if (!msg.videoId || !msg.videoUrl) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    await runVideoJob(msg);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Returning a non-2xx lets QStash retry the micro-task (durable by design).
    const message = e instanceof Error ? e.message : 'Worker failed';
    console.error('[videos/worker] job failed:', msg.step, msg.videoId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}