import { randomUUID } from 'node:crypto';
import videoClipper from '../lib/server/video-clipper';

type AgentJob = {
  id: string;
  videoUrl: string;
  userId: string;
  desiredClipCount: number;
};

type AgentHighlight = {
  title: string;
  start_time: number;
  end_time: number;
  summary: string;
  engagement_score: number;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function mustGetEnv(name: string, fallback = '') {
  const v = (process.env[name] || fallback).trim();
  return v;
}

async function postJson<T>(url: string, body: unknown, headers: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function reportWithRetry(serverUrl: string, headers: Record<string, string>, payload: Record<string, unknown>) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await postJson(`${serverUrl}/api/agent/jobs/report`, payload, headers);
      return;
    } catch (err) {
      lastErr = err;
      const delay = Math.min(4000, 300 * Math.pow(2, attempt));
      await sleep(delay);
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message.slice(0, 200) : String(lastErr).slice(0, 200);
  throw new Error(`report failed after retries: ${msg}`);
}

async function report(serverUrl: string, headers: Record<string, string>, payload: Record<string, unknown>) {
  await reportWithRetry(serverUrl, headers, payload);
}

async function processJob(serverUrl: string, headers: Record<string, string>, job: AgentJob) {
  await report(serverUrl, headers, {
    jobId: job.id,
    status: 'processing',
    stage: 'ai_analysis',
    progress: 10,
    message: 'Analyzing video and generating highlights...',
  });

  const analysis = await videoClipper.analyzeVideo(job.videoUrl);
  const autoCount = (() => {
    const d = Math.max(0, Math.floor(Number(analysis.duration) || 0));
    if (d >= 2 * 60 * 60) return 10;
    if (d >= 90 * 60) return 9;
    if (d >= 60 * 60) return 8;
    if (d >= 40 * 60) return 7;
    if (d >= 25 * 60) return 6;
    if (d >= 15 * 60) return 5;
    if (d >= 8 * 60) return 4;
    return 3;
  })();
  const desired = typeof job.desiredClipCount === 'number' && job.desiredClipCount > 0
    ? Math.max(1, Math.min(10, Math.floor(job.desiredClipCount)))
    : autoCount;
  const highlights = (analysis.highlights as AgentHighlight[]).slice(0, desired);

  await report(serverUrl, headers, {
    jobId: job.id,
    status: 'processing',
    stage: 'analysis_complete',
    progress: 35,
    message: `Found ${highlights.length} highlight moments.`,
    result: { title: analysis.title, duration: analysis.duration, highlights },
  });

  await report(serverUrl, headers, {
    jobId: job.id,
    status: 'processing',
    stage: 'generating_clip',
    progress: 40,
    message: 'Preparing source video...',
  });

  const source = await videoClipper.downloadSourceVideo(job.videoUrl);

  const clips: unknown[] = [];
  for (let i = 0; i < highlights.length; i += 1) {
    const h = highlights[i];
    const start = Math.max(0, Math.floor(h.start_time));
    const end = Math.max(start + 1, Math.ceil(h.end_time));
    const draft = {
      id: `${job.id}-clip-${i}`,
      title: h.title,
      startTime: start,
      endTime: end,
      duration: end - start,
      summary: h.summary,
      engagementScore: h.engagement_score,
      thumbnailUrl: '',
      videoUrl: null,
      status: 'processing',
    };

    await report(serverUrl, headers, {
      jobId: job.id,
      status: 'processing',
      stage: 'generating_clip',
      progress: 45 + Math.floor((i / highlights.length) * 45),
      message: `Generating clip ${i + 1}/${highlights.length}: "${h.title}"`,
      result: { title: analysis.title, duration: analysis.duration, highlights, clips: [...clips, draft] },
    });

    try {
      const result = await videoClipper.createLocalClip({
        inputPath: source.inputPath,
        audioInputPath: source.audioInputPath,
        inputHeaders: source.ffmpegHeaders,
        startTime: start,
        endTime: end,
        title: h.title,
      });
      const done = {
        ...draft,
        status: 'completed',
        thumbnailUrl: result.thumbnailUrl || '',
        videoUrl: result.dataUrl || result.publicUrl,
      };
      clips.push(done);
    } catch (err) {
      clips.push({
        ...draft,
        status: 'failed',
        error: err instanceof Error ? err.message.slice(-800) : String(err).slice(-800),
      });
    }
  }

  const completed = clips.filter((c) => typeof c === 'object' && c && (c as { status?: string }).status === 'completed');
  if (completed.length === 0) {
    await report(serverUrl, headers, {
      jobId: job.id,
      status: 'failed',
      stage: 'error',
      progress: 0,
      message: 'All clips failed to generate.',
      error: 'All clips failed to generate.',
      result: { title: analysis.title, duration: analysis.duration, highlights, clips },
    });
    return;
  }

  await report(serverUrl, headers, {
    jobId: job.id,
    status: 'completed',
    stage: 'complete',
    progress: 100,
    message: `Generated ${completed.length} clips.`,
    result: { title: analysis.title, duration: analysis.duration, highlights, clips },
  });
}

async function main() {
  const serverUrl = mustGetEnv('VIDSHORTER_SERVER_URL', 'http://localhost:5100').replace(/\/$/, '');
  const agentId = mustGetEnv('VIDSHORTER_AGENT_ID', `agent-${randomUUID()}`);
  const secret = mustGetEnv('AGENT_SECRET');
  const headers = secret ? { 'x-agent-secret': secret } : {};

  process.env.APP_BASE_URL = serverUrl;
  if (!process.env.PREFER_EDGE_YOUTUBE) process.env.PREFER_EDGE_YOUTUBE = '0';
  if (!process.env.INLINE_CLIPS) process.env.INLINE_CLIPS = '0';

  console.log(`agent runner started: agentId=${agentId} server=${serverUrl}`);

  for (;;) {
    try {
      const { job } = await postJson<{ job: AgentJob | null }>(
        `${serverUrl}/api/agent/jobs/pull`,
        { agentId },
        headers,
      );
      if (!job) {
        await sleep(2000);
        continue;
      }
      console.log(`job claimed: ${job.id}`);
      await processJob(serverUrl, headers, job);
      console.log(`job done: ${job.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400);
      console.warn(`agent loop error: ${msg}`);
      await sleep(1500);
    }
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400);
  console.error(`agent fatal error: ${msg}`);
});
