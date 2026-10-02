/**
 * 模型配置（管理后台可改）——服务端唯一读取入口。
 *
 * 存储选型：Supabase Storage 的**私有桶**内放一个 JSON（零 DDL，无需建表 / 迁移）。
 *  - 桶 `clipop-config` 为 private，匿名角色不可读，仅服务端用 service role key 读写；
 *  - 读取带 60s 内存缓存，避免每次出片都打一次 Storage；
 *  - 写入后立即失效缓存，管理后台保存即刻生效（无需重新部署）。
 *
 * 解析优先级：**管理后台配置（桶内 JSON）> 进程环境变量**。
 * 这样既能在后台热改密钥，也保留 Vercel env 作为兜底通道。
 */

import { createClient } from '@supabase/supabase-js';

export type ModelKind = 'llm' | 'tts' | 'digital-human' | 'workflow';
export type ModelProviderId = 'deepseek' | 'dashscope' | 'minimax' | 'runninghub';

export interface ModelField {
  /** 存储键 = 环境变量名（便于与 Vercel env 通道互换） */
  key: string;
  label: { zh: string; en: string };
  /** 密钥类字段：读取时打码，写入时留空表示「不修改」 */
  secret: boolean;
  placeholder?: string;
  help?: { zh: string; en: string };
}

export interface ModelProvider {
  id: ModelProviderId;
  name: { zh: string; en: string };
  kind: ModelKind;
  description: { zh: string; en: string };
  fields: ModelField[];
}

const BUCKET = 'clipop-config';
const OBJECT = 'model-config.json';
const CACHE_TTL_MS = 60_000;

/** 管理后台展示与保存的 provider 注册表（前端只拿到元数据，拿不到真实密钥）。 */
export const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: 'deepseek',
    name: { zh: 'DeepSeek（基座大模型）', en: 'DeepSeek (LLM)' },
    kind: 'llm',
    description: {
      zh: 'AI 成片的文案/分镜脚本生成。OpenAI 兼容接口，零 Key 时回落模版本地脚本。',
      en: 'Script & storyboard generation for AI videos. OpenAI-compatible; falls back to local templates without a key.',
    },
    fields: [
      { key: 'DEEPSEEK_API_KEY', label: { zh: 'API Key', en: 'API Key' }, secret: true, placeholder: 'sk-...' },
      {
        key: 'DEEPSEEK_BASE_URL',
        label: { zh: 'Base URL', en: 'Base URL' },
        secret: false,
        placeholder: 'https://api.deepseek.com',
      },
      {
        key: 'DEEPSEEK_MODEL',
        label: { zh: '模型', en: 'Model' },
        secret: false,
        placeholder: 'deepseek-chat',
      },
    ],
  },
  {
    id: 'dashscope',
    name: { zh: '阿里云百炼 DashScope', en: 'Alibaba DashScope' },
    kind: 'digital-human',
    description: {
      zh: '数字人口播（wan2.7-r2v 参考图生视频）、AI 成片配图（通义万相文生图）与音色克隆。',
      en: 'Digital-human talking video (wan2.7-r2v), AI video illustrations (Tongyi Wanxiang text-to-image) and voice cloning.',
    },
    fields: [
      { key: 'DASHSCOPE_API_KEY', label: { zh: 'API Key', en: 'API Key' }, secret: true, placeholder: 'sk-...' },
      {
        key: 'DASHSCOPE_BASE_URL',
        label: { zh: 'Base URL', en: 'Base URL' },
        secret: false,
        placeholder: 'https://dashscope.aliyuncs.com',
      },
      {
        key: 'DASHSCOPE_DIGITAL_HUMAN_MODEL',
        label: { zh: '数字人模型', en: 'Digital-human model' },
        secret: false,
        placeholder: 'wan2.7-r2v',
      },
      {
        key: 'DASHSCOPE_IMAGE_MODEL',
        label: { zh: '成片配图模型', en: 'AI video image model' },
        secret: false,
        placeholder: 'wanx2.1-t2i-turbo',
        help: {
          zh: 'AI 成片逐分镜生成插画（通义万相文生图）。留空用 wanx2.1-t2i-turbo。',
          en: 'Per-scene illustration model for AI videos. Defaults to wanx2.1-t2i-turbo.',
        },
      },
    ],
  },
  {
    id: 'minimax',
    name: { zh: 'MiniMax（语音）', en: 'MiniMax (Voice)' },
    kind: 'tts',
    description: {
      zh: '语音合成（TTS）与声音克隆，用于「个人成长 / 情感」等需要克隆音色的模版。',
      en: 'Text-to-speech and voice cloning for templates that need a cloned voice.',
    },
    fields: [
      { key: 'MINIMAX_API_KEY', label: { zh: 'API Key', en: 'API Key' }, secret: true, placeholder: 'sk-api-...' },
      {
        key: 'MINIMAX_GROUP_ID',
        label: { zh: 'Group ID', en: 'Group ID' },
        secret: false,
        placeholder: '可选',
        help: { zh: '部分接口需要 GroupId', en: 'Required by some endpoints' },
      },
      {
        key: 'MINIMAX_VOICE_MODEL',
        label: { zh: '语音模型', en: 'Voice model' },
        secret: false,
        placeholder: 'speech-02-hd',
      },
    ],
  },
  {
    id: 'runninghub',
    name: { zh: 'RunningHub 工作流（可选）', en: 'RunningHub Workflow (optional)' },
    kind: 'workflow',
    description: {
      zh: 'Pixelle-Video 原版的云工作流通道，可作为数字人的替代 provider。',
      en: 'The original Pixelle-Video cloud workflow channel; alternative digital-human provider.',
    },
    fields: [
      { key: 'RUNNINGHUB_API_KEY', label: { zh: 'API Key', en: 'API Key' }, secret: true },
      { key: 'RUNNINGHUB_WORKFLOW_ID', label: { zh: 'Workflow ID', en: 'Workflow ID' }, secret: false },
    ],
  },
];

export interface ModelConfigData {
  values: Record<string, string>;
  activeLlm: ModelProviderId;
  updatedAt?: string;
  updatedBy?: string;
}

const EMPTY: ModelConfigData = { values: {}, activeLlm: 'deepseek' };

interface ServiceCreds {
  url: string;
  key: string;
}

function serviceCreds(): ServiceCreds | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return { url, key };
}

let cache: { at: number; data: ModelConfigData } | null = null;

function normalize(raw: unknown): ModelConfigData {
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const obj = raw as Record<string, unknown>;
  const rawValues = (obj.values && typeof obj.values === 'object' ? obj.values : {}) as Record<
    string,
    unknown
  >;
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawValues)) {
    if (typeof v === 'string') values[k] = v;
  }
  const activeLlm = MODEL_PROVIDERS.some((p) => p.id === obj.activeLlm && p.kind === 'llm')
    ? (obj.activeLlm as ModelProviderId)
    : 'deepseek';
  return {
    values,
    activeLlm,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : undefined,
    updatedBy: typeof obj.updatedBy === 'string' ? obj.updatedBy : undefined,
  };
}

/** 读取后台配置（带 60s 缓存）。未配置 Storage 时返回空配置（后续全部走 env）。 */
export async function readModelConfig(): Promise<ModelConfigData> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const creds = serviceCreds();
  if (!creds) return { ...EMPTY };
  try {
    const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${OBJECT}`, {
      headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      cache = { at: Date.now(), data: { ...EMPTY } };
      return { ...EMPTY };
    }
    const data = normalize(await res.json());
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return { ...EMPTY };
  }
}

/** 覆盖写入后台配置（合并 values）。返回写入后的完整配置。 */
export async function writeModelConfig(patch: {
  values?: Record<string, string>;
  activeLlm?: ModelProviderId;
  updatedBy?: string;
}): Promise<ModelConfigData> {
  const creds = serviceCreds();
  if (!creds) throw new Error('model-config: supabase service role not configured');

  const current = await readModelConfig();
  const values = { ...current.values };
  for (const [k, v] of Object.entries(patch.values || {})) {
    const trimmed = String(v ?? '').trim();
    // 空字符串 = 显式清除该键（前端密钥留空表示「不修改」，由路由层过滤后再传进来）
    if (trimmed === '') delete values[k];
    else values[k] = trimmed;
  }
  const next: ModelConfigData = {
    values,
    activeLlm: patch.activeLlm || current.activeLlm,
    updatedAt: new Date().toISOString(),
    updatedBy: patch.updatedBy || current.updatedBy,
  };

  const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${OBJECT}`, {
    method: 'POST',
    headers: {
      apikey: creds.key,
      Authorization: `Bearer ${creds.key}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body: JSON.stringify(next, null, 2),
  });
  if (!res.ok) {
    throw new Error(`model-config: write failed ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  cache = { at: Date.now(), data: next };
  return next;
}

/** 单个键的解析值：后台配置优先，其次环境变量。 */
export function resolveModelValue(data: ModelConfigData, key: string): string | null {
  const v = data.values[key];
  if (typeof v === 'string' && v.trim()) return v.trim();
  const env = process.env[key];
  return env && env.trim() ? env.trim() : null;
}

/** 该键的来源（用于后台展示与排障）。 */
export function modelValueSource(data: ModelConfigData, key: string): 'db' | 'env' | 'none' {
  const v = data.values[key];
  if (typeof v === 'string' && v.trim()) return 'db';
  const env = process.env[key];
  return env && env.trim() ? 'env' : 'none';
}

export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 10) return '••••••';
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

/** 便捷读值（内部会命中 60s 缓存）。 */
export async function getModelValue(key: string): Promise<string | null> {
  return resolveModelValue(await readModelConfig(), key);
}

// ── 各 provider 的强类型读取 ────────────────────────────────────────────────

export interface LlmProviderConfig {
  provider: ModelProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const LLM_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  dashscope: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
};

/**
 * 当前生效的 LLM 基座（activeLlm 决定用哪家；该家没有 Key 时按 deepseek → dashscope 顺序找）。
 * 仅收录**已验证 OpenAI 兼容**的两家（DeepSeek / 百炼）；MiniMax 走自有 TTS 协议，不作为文本基座。
 * 全部没有 Key → 返回 null（调用方回落模版本地脚本，不静默用假的）。
 */
export async function getLlmConfig(): Promise<LlmProviderConfig | null> {
  const data = await readModelConfig();
  const order: ModelProviderId[] = [data.activeLlm, 'deepseek', 'dashscope'];
  const seen = new Set<ModelProviderId>();
  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (!(id in LLM_DEFAULTS)) continue;
    const keyEnv = id === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'DASHSCOPE_API_KEY';
    const apiKey = resolveModelValue(data, keyEnv);
    if (!apiKey) continue;
    const d = LLM_DEFAULTS[id];
    const baseKey = id === 'deepseek' ? 'DEEPSEEK_BASE_URL' : 'DASHSCOPE_BASE_URL';
    const modelKey = id === 'deepseek' ? 'DEEPSEEK_MODEL' : 'DASHSCOPE_LLM_MODEL';
    return {
      provider: id,
      apiKey,
      baseUrl: resolveModelValue(data, baseKey) || d.baseUrl,
      model: resolveModelValue(data, modelKey) || d.model,
    };
  }
  return null;
}

export async function getDashscopeConfig(): Promise<{ apiKey: string; baseUrl: string; digitalHumanModel: string } | null> {
  const data = await readModelConfig();
  const apiKey = resolveModelValue(data, 'DASHSCOPE_API_KEY');
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: resolveModelValue(data, 'DASHSCOPE_BASE_URL') || 'https://dashscope.aliyuncs.com',
    digitalHumanModel:
      resolveModelValue(data, 'DASHSCOPE_DIGITAL_HUMAN_MODEL') || 'wan2.7-r2v',
  };
}

/** AI 成片配图（通义万相文生图）配置；未配置 Key 时返回 null（调用方回落 SVG 版式）。 */
export async function getDashscopeImageConfig(): Promise<{
  apiKey: string;
  baseUrl: string;
  imageModel: string;
} | null> {
  const data = await readModelConfig();
  const apiKey = resolveModelValue(data, 'DASHSCOPE_API_KEY');
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: resolveModelValue(data, 'DASHSCOPE_BASE_URL') || 'https://dashscope.aliyuncs.com',
    imageModel: resolveModelValue(data, 'DASHSCOPE_IMAGE_MODEL') || 'wanx2.1-t2i-turbo',
  };
}

export async function getMinimaxConfig(): Promise<{ apiKey: string; groupId: string | null; voiceModel: string } | null> {
  const data = await readModelConfig();
  const apiKey = resolveModelValue(data, 'MINIMAX_API_KEY');
  if (!apiKey) return null;
  return {
    apiKey,
    groupId: resolveModelValue(data, 'MINIMAX_GROUP_ID'),
    voiceModel: resolveModelValue(data, 'MINIMAX_VOICE_MODEL') || 'speech-02-hd',
  };
}

export async function getRunningHubConfig(): Promise<{ apiKey: string; workflowId: string } | null> {
  const data = await readModelConfig();
  const apiKey = resolveModelValue(data, 'RUNNINGHUB_API_KEY');
  const workflowId = resolveModelValue(data, 'RUNNINGHUB_WORKFLOW_ID');
  if (!apiKey || !workflowId) return null;
  return { apiKey, workflowId };
}

/** 管理后台 GET 用的打码视图。 */
export async function getMaskedModelConfig(): Promise<{
  providers: Array<
    ModelProvider & { fields: Array<ModelField & { masked: string; source: 'db' | 'env' | 'none' }> }
  >;
  activeLlm: ModelProviderId;
  updatedAt?: string;
  updatedBy?: string;
}> {
  const data = await readModelConfig();
  return {
    providers: MODEL_PROVIDERS.map((p) => ({
      ...p,
      fields: p.fields.map((f) => {
        const source = modelValueSource(data, f.key);
        const raw = resolveModelValue(data, f.key) || '';
        return { ...f, masked: f.secret ? maskSecret(raw) : raw, source };
      }),
    })),
    activeLlm: data.activeLlm,
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy,
  };
}