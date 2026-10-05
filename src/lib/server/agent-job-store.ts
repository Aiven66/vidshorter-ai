import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type AgentJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

/**
 * 任务类型。本地 agent 按自身能力拉取，避免把 transcribe 派发给无 ASR 的机器。
 *  - highlight：抓取/分析 + 本地剪辑（原默认行为）
 *  - transcribe：本地 ASR 转写
 *  - render：本地成片渲染
 */
export type AgentJobType = 'highlight' | 'transcribe' | 'render';

export const AGENT_JOB_TYPES: AgentJobType[] = ['highlight', 'transcribe', 'render'];

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
  type: AgentJobType;
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
  type?: AgentJobType;
}): Promise<AgentJob> {
  return withWriteLock(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    const desiredClipCount =
      typeof params.desiredClipCount === 'number' && Number.isFinite(params.desiredClipCount)
        ? Math.floor(params.desiredClipCount)
        : 0;
    const job: AgentJob = {
      id: `job-${randomUUID()}`,
      type: AGENT_JOB_TYPES.includes(params.type as AgentJobType) ? (params.type as AgentJobType) : 'highlight',
      videoUrl: params.videoUrl,
      userId: params.userId,
      desiredClipCount: desiredClipCount > 0 ? Math.max(1, Math.min(10, desiredClipCount)) : 0,
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

export async function pullNextAgentJob(
  agentId: string,
  capabilities?: AgentJobType[],
): Promise<AgentJob | null> {
  return withWriteLock(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    const allowed = Array.isArray(capabilities) && capabilities.length > 0
      ? new Set(capabilities)
      : null;
    const job = store.jobs.find((j) => {
      if (j.status !== 'queued') return false;
      if (!allowed) return true;
      const type: AgentJobType = AGENT_JOB_TYPES.includes(j.type) ? j.type : 'highlight';
      return allowed.has(type);
    });
    if (!job) return null;
    if (!AGENT_JOB_TYPES.includes(job.type)) job.type = 'highlight';
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
