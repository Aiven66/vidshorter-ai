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

async function report(serverUrl: string, headers: Record<string, string>, payload: Record<string, unknown>) {
  await postJson(`${serverUrl}/api/agent/jobs/report`, payload, headers);
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
  const highlights = (analysis.highlights as AgentHighlight[]).slice(0, Math.max(1, Math.min(10, job.desiredClipCount || 3)));

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
  process.env.PREFER_EDGE_YOUTUBE = '1';
  process.env.INLINE_CLIPS = '1';

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
      await processJob(serverUrl, headers, job);
    } catch (err) {
      await sleep(1500);
    }
  }
}

main();

