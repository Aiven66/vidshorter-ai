/**
 * 高光笔记 — LLM 优先生成器
 *
 * 在本地启发式算法（TextRank-like）之上，优先用 doubao LLM 生成结构化高光笔记：
 * - LLM 走 coze-coding-dev-sdk（与博客自动分类 categorize.ts 一致的鉴权与调用方式），
 *   环境变量: COZE_WORKLOAD_IDENTITY_API_KEY / COZE_INTEGRATION_BASE_URL
 *            / COZE_INTEGRATION_MODEL_BASE_URL。
 * - 字幕先降采样（≤60 段、总字符 ≤6000、每段带 [MM:SS] 时间锚点）再进 prompt，
 *   控制 token 成本并保留时间轴信息。
 * - 任何失败（未配置 key / 网络 / 解析 / 校验）都返回 null，由调用方回落本地算法，
 *   保证功能端到端可用（与 categorize.ts 的 LLM 优先 + 启发式兜底同构）。
 */

import { LLMClient, Config } from 'coze-coding-dev-sdk';
import type {
  TranscriptSegment,
  LocalVideoNote,
} from '../../../app/api/video-notes/generate/local-note-generator';

const LLM_MODEL = 'doubao-seed-1-8-251228';

/** 笔记生成来源标记：llm = doubao 生成，local = 本地启发式兜底 */
export type NoteEngine = 'llm' | 'local';

/** 构造（或复用）Coze LLM 客户端；未配置密钥时返回 null 以便优雅降级 */
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

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 字幕降采样：等距抽样至 ≤maxSegments 段，同时总字符 ≤maxChars（保首行）。
 * 输出 `[MM:SS] text` 行，供 prompt 使用并保留时间锚点。
 */
export function downsampleSegments(
  segments: TranscriptSegment[],
  maxSegments = 60,
  maxChars = 6000,
): string[] {
  if (segments.length === 0) return [];

  const sampled: TranscriptSegment[] =
    segments.length > maxSegments
      ? Array.from({ length: maxSegments }, (_, i) => segments[Math.floor((i * segments.length) / maxSegments)])
      : segments;

  const lines: string[] = [];
  let total = 0;
  for (const seg of sampled) {
    const line = `[${formatTimestamp(seg.start)}] ${seg.text}`;
    total += line.length;
    if (lines.length > 0 && total > maxChars) break;
    lines.push(line);
  }
  return lines;
}

const VALID_LEVELS = new Set(['critical', 'important']);

function clampWeight(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0.5;
  return Math.min(1, Math.max(0, v));
}

/**
 * 解析 LLM 返回的文本为笔记结构，返回 LocalVideoNote（hasTranscript/totalDuration 由调用方补全）。
 * 容错处理：剥离 markdown 代码围栏 / 前后杂文只取首个 {...} 块；level 非法值回落 'important'；
 * 逐条裁剪超长字段。结构不合法（缺 summary / 无高光 / 无金句 / 无要点）时返回 null，交由本地算法兜底。
 */
export function parseNoteJson(
  raw: string,
): Omit<LocalVideoNote, 'hasTranscript' | 'totalDuration'> | null {
  if (!raw || typeof raw !== 'string') return null;

  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) text = fence[1].trim();
  const open = text.indexOf('{');
  const close = text.lastIndexOf('}');
  if (open === -1 || close <= open) return null;

  let data: any;
  try {
    data = JSON.parse(text.slice(open, close + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  if (typeof data.summary !== 'string' || !data.summary.trim()) return null;
  const summary = data.summary.trim().slice(0, 800);

  if (!Array.isArray(data.highlights)) return null;
  const highlights: Array<{
    timestamp: string;
    startSeconds: number;
    text: string;
    level: 'critical' | 'important';
  }> = [];
  for (const h of data.highlights.slice(0, 15)) {
    if (!h || typeof h !== 'object') continue;
    if (typeof h.text !== 'string' || !h.text.trim()) continue;
    if (typeof h.timestamp !== 'string') continue;
    const levelOk = typeof h.level === 'string' && VALID_LEVELS.has(h.level);
    const ss = typeof h.startSeconds === 'number' && Number.isFinite(h.startSeconds) ? h.startSeconds : 0;
    highlights.push({
      timestamp: h.timestamp.slice(0, 20),
      startSeconds: Math.max(0, Math.floor(ss)),
      text: h.text.trim().slice(0, 200),
      level: levelOk ? (h.level as 'critical' | 'important') : 'important',
    });
  }
  if (highlights.length === 0) return null;

  const takeaways: string[] = [];
  if (Array.isArray(data.takeaways)) {
    for (const t of data.takeaways.slice(0, 8)) {
      if (typeof t === 'string' && t.trim()) takeaways.push(t.trim().slice(0, 160));
    }
  }
  if (takeaways.length === 0) return null;

  if (!Array.isArray(data.corePoints)) return null;
  const corePoints: Array<{
    index: number;
    title: string;
    detail: string;
    sourceTimestamps?: string[];
    weight?: number;
  }> = [];
  let idx = 0;
  for (const p of data.corePoints.slice(0, 8)) {
    if (!p || typeof p !== 'object') continue;
    if (typeof p.title !== 'string' || !p.title.trim()) continue;
    if (typeof p.detail !== 'string' || !p.detail.trim()) continue;
    idx += 1;
    const sts = Array.isArray(p.sourceTimestamps)
      ? p.sourceTimestamps.filter((s: unknown) => typeof s === 'string').slice(0, 3).map((s: string) => s.slice(0, 20))
      : [];
    corePoints.push({
      index: idx,
      title: p.title.trim().slice(0, 100),
      detail: p.detail.trim().slice(0, 600),
      sourceTimestamps: sts,
      weight: clampWeight(p.weight),
    });
  }
  if (corePoints.length === 0) return null;

  return { summary, highlights, takeaways, corePoints };
}

/**
 * 用 doubao LLM 生成高光笔记。
 * 未配置 COZE key / 无字幕 / LLM 调用失败 / 解析校验失败 → 一律返回 null（调用方回落本地算法）。
 */
export async function generateNoteWithLLM(
  segments: TranscriptSegment[],
  videoTitle: string | undefined,
  videoUrl: string,
  sourceType: 'youtube' | 'bilibili' | 'local',
  locale: string | undefined,
): Promise<LocalVideoNote | null> {
  const llm = createLlmClient();
  if (!llm || segments.length === 0) return null;

  const lines = downsampleSegments(segments);
  if (lines.length === 0) return null;

  const totalDuration =
    segments[segments.length - 1].start + (segments[segments.length - 1].duration || 0);

  const langHint =
    locale && locale.toLowerCase().startsWith('zh')
      ? '简体中文'
      : locale && locale.toLowerCase().startsWith('ja')
        ? '日本語'
        : 'English';

  const prompt = [
    'You are an expert video note-taking assistant. Produce a structured study note in JSON from the transcript below (each line prefixed with [MM:SS]).',
    `Video title: ${videoTitle || '(untitled)'}`,
    `Source: ${sourceType}`,
    '',
    'Output a SINGLE JSON object with exactly these fields:',
    '{',
    '  "summary": "2-4 sentence overview of the video",',
    '  "highlights": [ {"timestamp":"[MM:SS] copied from the transcript","startSeconds":<seconds as number>,"text":"short quote from the transcript","level":"critical"|"important"} ] (8-15 entries spread across the whole video, with the most important moments marked critical),',
    '  "takeaways": ["3-6 concise actionable takeaways"],',
    '  "corePoints": [ {"index":1,"title":"one-line point title","detail":"2-4 sentence explanation","sourceTimestamps":["[MM:SS]","[MM:SS]"],"weight":0.0-1.0} ] (5-8 numbered lecture points in chronological order)',
    '}',
    `Write all human-readable text (summary, highlight text, takeaways, core point titles and details) in ${langHint}.`,
    'Reply with ONLY the JSON object — no markdown fences, no comments, no extra text.',
    '',
    'TRANSCRIPT:',
    ...lines,
  ].join('\n');

  try {
    const resp = await llm.invoke(
      [{ role: 'user', content: prompt }],
      // max_tokens 未声明在 SDK 的 LLMConfig 类型里，但服务端 API 接受该参数（与 categorize.ts 一致）
      { model: LLM_MODEL, temperature: 0.4, max_tokens: 2000 } as never,
    );
    const rawContent = typeof resp?.content === 'string' ? resp.content : '';
    const parsed = parseNoteJson(rawContent);
    if (!parsed) return null;

    return {
      ...parsed,
      hasTranscript: true,
      totalDuration: Math.max(1, Math.round(totalDuration)),
    };
  } catch (error) {
    console.error('[video-notes/llm] LLM failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
