import { NextRequest } from 'next/server';
import { LLMClient, Config } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LLM_MODEL = 'doubao-seed-1-8-251228';

/** 单次请求可翻译的最大行数（与 generate 的逐字稿上限一致） */
const MAX_SEGMENTS = 1500;
/** 每个 LLM 批次的行数 / 字符数上限（控制 token 与超时） */
const BATCH_MAX_ROWS = 25;
const BATCH_MAX_CHARS = 2000;
/** 并发批次数：兼顾速度与 LLM 限流 */
const CONCURRENCY = 4;

export interface TranscriptSegmentLite {
  start: number;
  duration: number;
  text: string;
}

/** 支持的目标语言白名单（code → 给 LLM 的语言名） */
const TARGET_LANGS: Record<string, string> = {
  'zh-Hans': 'Simplified Chinese (简体中文)',
  'zh-Hant': 'Traditional Chinese (繁體中文)',
  en: 'English',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  ru: 'Russian (Русский)',
  pt: 'Portuguese (Português)',
  it: 'Italian (Italiano)',
  ar: 'Arabic (العربية)',
  hi: 'Hindi (हिन्दी)',
  th: 'Thai (ไทย)',
  vi: 'Vietnamese (Tiếng Việt)',
};

function createLlmClient(): LLMClient | null {
  const apiKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  if (!apiKey) return null;
  const config = new Config({
    apiKey,
    baseUrl: process.env.COZE_INTEGRATION_BASE_URL,
    modelBaseUrl: process.env.COZE_INTEGRATION_MODEL_BASE_URL,
  });
  return new LLMClient(config, {});
}

/** 轻量鉴权：仅要求可解析出 sub 的 bearer JWT（与 generate 路由一致的信任策略） */
function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as Record<string, unknown>;
    return typeof decoded.sub === 'string' && decoded.sub ? decoded.sub : null;
  } catch {
    return null;
  }
}

/** 从 LLM 返回文本中提取 JSON 数组；容忍 markdown 围栏与前后杂文 */
export function parseTranslationArray(raw: string): Array<{ i?: unknown; text?: unknown }> {
  if (!raw || typeof raw !== 'string') return [];
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) text = fence[1].trim();
  const open = text.indexOf('[');
  const close = text.lastIndexOf(']');
  if (open === -1 || close <= open) return [];
  try {
    const data = JSON.parse(text.slice(open, close + 1));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

interface BatchRow {
  /** 全局行号（1-based），用于回填与对齐 */
  i: number;
  text: string;
}

/** 按行数 / 字符数切批 */
export function buildBatches(segments: TranscriptSegmentLite[]): BatchRow[][] {
  const batches: BatchRow[][] = [];
  let cur: BatchRow[] = [];
  let chars = 0;
  for (let idx = 0; idx < segments.length; idx++) {
    const text = String(segments[idx]?.text ?? '').trim();
    if (!text) continue;
    const row: BatchRow = { i: idx + 1, text: text.slice(0, 1200) };
    if (cur.length > 0 && (cur.length >= BATCH_MAX_ROWS || chars + row.text.length > BATCH_MAX_CHARS)) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(row);
    chars += row.text.length;
  }
  if (cur.length > 0) batches.push(cur);
  return batches;
}

async function translateBatch(
  llm: LLMClient,
  rows: BatchRow[],
  targetName: string,
): Promise<Map<number, string>> {
  const prompt = [
    `You are a professional subtitle translator. Translate the transcript lines below into ${targetName}.`,
    'Rules:',
    '- Keep the exact same line numbers (the number inside [ ]).',
    '- Translate faithfully and naturally; do not summarize, merge, omit, or add lines.',
    '- Keep numbers, names and brand names accurate. Output only the translation of each line.',
    'Reply with ONLY a JSON array, no markdown fences, no comments:',
    '[{"i":1,"text":"translated line"}]',
    '',
    'LINES:',
    ...rows.map((r) => `[${r.i}] ${r.text}`),
  ].join('\n');

  const resp = await llm.invoke([{ role: 'user', content: prompt }], {
    model: LLM_MODEL,
    temperature: 0.2,
    max_tokens: 4000,
  } as never);
  const raw = typeof resp?.content === 'string' ? resp.content : '';
  const out = new Map<number, string>();
  for (const item of parseTranslationArray(raw)) {
    const i = Number(item?.i);
    const text = typeof item?.text === 'string' ? item.text.trim() : '';
    if (Number.isFinite(i) && text) out.set(i, text);
  }
  return out;
}

/** /api/video-notes/translate — 把逐字稿翻译成目标语言（LLM 分批翻译，不额外扣积分） */
export async function POST(request: NextRequest) {
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || !decodeJwtSub(token)) {
    return Response.json({ error: '请先登录后使用翻译', code: 'unauthorized' }, { status: 401 });
  }

  const segments: TranscriptSegmentLite[] = Array.isArray(body?.segments)
    ? (body.segments as TranscriptSegmentLite[])
        .filter((s) => s && typeof s === 'object')
        .slice(0, MAX_SEGMENTS)
        .map((s) => ({
          start: Number.isFinite(Number(s.start)) ? Number(s.start) : 0,
          duration: Number.isFinite(Number(s.duration)) ? Number(s.duration) : 0,
          text: String(s.text ?? '').slice(0, 2000),
        }))
    : [];
  if (segments.length === 0) {
    return Response.json({ error: '逐字稿为空，无法翻译', code: 'empty_transcript' }, { status: 400 });
  }

  const targetLang = String(body?.targetLang || '').trim();
  const targetName = TARGET_LANGS[targetLang];
  if (!targetName) {
    return Response.json(
      { error: `不支持的目标语言：${targetLang || '(空)'}`, code: 'unsupported_language' },
      { status: 400 },
    );
  }

  const llm = createLlmClient();
  if (!llm) {
    // 绝不静默降级：明确告知翻译服务不可用（对应环境未配置 LLM key）
    return Response.json(
      { error: '翻译服务暂不可用（未配置 LLM 密钥），请稍后重试', code: 'llm_unavailable' },
      { status: 503 },
    );
  }

  const batches = buildBatches(segments);
  const translated = new Map<number, string>();

  try {
    // 并发池：每批失败重试一次，仍失败则该批行保持未翻译（最终明文报告行数）
    let cursor = 0;
    const worker = async () => {
      while (cursor < batches.length) {
        const batch = batches[cursor++];
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const part = await translateBatch(llm, batch, targetName);
            if (part.size > 0) {
              for (const [i, text] of part) translated.set(i, text);
              break;
            }
          } catch (err) {
            console.warn(
              `[video-notes/translate] batch failed (attempt ${attempt + 1}):`,
              err instanceof Error ? err.message.slice(0, 160) : err,
            );
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker()));
  } catch (err) {
    console.error('[video-notes/translate] error:', err);
    return Response.json(
      {
        error: '翻译失败，请稍后重试',
        code: 'translate_failed',
        detail: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      },
      { status: 500 },
    );
  }

  // 一行都没翻出来 → 视为失败（避免前端把原文当译文显示）
  if (translated.size === 0) {
    return Response.json(
      { error: '翻译失败：翻译服务未返回有效结果，请稍后重试', code: 'translate_empty' },
      { status: 502 },
    );
  }

  let untranslated = 0;
  const out: Array<TranscriptSegmentLite & { translated: boolean }> = segments.map((s, idx) => {
    const hit = translated.get(idx + 1);
    if (!hit) untranslated++;
    return { ...s, text: hit || s.text, translated: !!hit };
  });

  return Response.json({ segments: out, targetLang, untranslated });
}