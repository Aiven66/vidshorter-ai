import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type AgentJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface AgentClip {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  summary: string;
  engagementScore: number;
  thumbnailUrl: string;
  videoUrl: string | null;
  status: 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface AgentHighlight {
  title: string;
  start_time: number;
  end_time: number;
  summary: string;
  engagement_score: number;
}

export interface AgentJob {
  id: string;
  videoUrl: string;
  userId: string;
  desiredClipCount: number;
  createdAt: string;
  updatedAt: string;
  status: AgentJobStatus;
  stage: string;
  progress: number;
  message: string;
  claimedBy?: string;
  error?: string;
  result?: {
    title?: string;
    duration?: number;
    highlights?: AgentHighlight[];
    clips?: AgentClip[];
  };
}

const DATA_DIR = path.join(process.cwd(), '.data');
const JOBS_PATH = path.join(DATA_DIR, 'agent-jobs.json');

let writeQueue: Promise<void> = Promise.resolve();

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(JOBS_PATH, 'utf8');
  } catch {
    await writeFile(JOBS_PATH, JSON.stringify({ jobs: [] }, null, 2));
  }
}

async function readStore(): Promise<{ jobs: AgentJob[] }> {
  await ensureStore();
  const raw = await readFile(JOBS_PATH, 'utf8');
  const parsed = JSON.parse(raw || '{}') as { jobs?: AgentJob[] };
  return { jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [] };
}

async function writeStore(data: { jobs: AgentJob[] }) {
  await ensureStore();
  await writeFile(JOBS_PATH, JSON.stringify(data, null, 2));
}

async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const start = writeQueue;
  let release: () => void;
  writeQueue = new Promise<void>((resolve) => { release = resolve; });
  await start;
  try {
    return await fn();
  } finally {
    release!();
  }
}

export async function createAgentJob(params: {
  videoUrl: string;
  userId: string;
  desiredClipCount?: number;
}): Promise<AgentJob> {
  return withWriteLock(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    const job: AgentJob = {
      id: `job-${randomUUID()}`,
      videoUrl: params.videoUrl,
      userId: params.userId,
      desiredClipCount: Math.max(1, Math.min(10, params.desiredClipCount || 3)),
      createdAt: now,
      updatedAt: now,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      message: 'Queued',
    };
    store.jobs.unshift(job);
    await writeStore(store);
    return job;
  });
}

export async function getAgentJob(jobId: string): Promise<AgentJob | null> {
  const store = await readStore();
  return store.jobs.find(j => j.id === jobId) || null;
}

export async function pullNextAgentJob(agentId: string): Promise<AgentJob | null> {
  return withWriteLock(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    const job = store.jobs.find(j => j.status === 'queued');
    if (!job) return null;
    job.status = 'processing';
    job.claimedBy = agentId;
    job.updatedAt = now;
    job.stage = 'init';
    job.progress = Math.max(job.progress, 1);
    job.message = 'Claimed by agent';
    await writeStore(store);
    return job;
  });
}

export async function updateAgentJob(jobId: string, patch: Partial<AgentJob>): Promise<AgentJob | null> {
  return withWriteLock(async () => {
    const store = await readStore();
    const job = store.jobs.find(j => j.id === jobId);
    if (!job) return null;
    Object.assign(job, patch);
    job.updatedAt = new Date().toISOString();
    await writeStore(store);
    return job;
  });
}

