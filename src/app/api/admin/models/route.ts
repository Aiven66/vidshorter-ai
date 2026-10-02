import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminEmail } from '@/lib/server/admin-auth';
import {
  MODEL_PROVIDERS,
  getMaskedModelConfig,
  readModelConfig,
  resolveModelValue,
  writeModelConfig,
  type ModelProviderId,
} from '@/lib/server/model-config';
import { openAiChat } from '@/lib/server/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 所有可写字段的白名单（同时包含密钥类字段），杜绝向进程注入任意键。 */
const ALLOWED_KEYS = new Set(MODEL_PROVIDERS.flatMap((p) => p.fields.map((f) => f.key)));
const SECRET_KEYS = new Set(
  MODEL_PROVIDERS.flatMap((p) => p.fields.filter((f) => f.secret).map((f) => f.key)),
);

export async function GET(request: NextRequest) {
  const admin = await resolveAdminEmail(request);
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const data = await getMaskedModelConfig();
  return NextResponse.json({ ok: true, ...data });
}

export async function POST(request: NextRequest) {
  const admin = await resolveAdminEmail(request);
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (body.action === 'test') {
    const providerId = String(body.providerId || '') as ModelProviderId;
    return NextResponse.json(await testProvider(providerId));
  }

  // ── 保存 ────────────────────────────────────────────────────────────────
  const patch: Record<string, string> = {};
  const rawValues = (body.values && typeof body.values === 'object' ? body.values : {}) as Record<
    string,
    unknown
  >;
  for (const [k, v] of Object.entries(rawValues)) {
    if (!ALLOWED_KEYS.has(k) || typeof v !== 'string') continue;
    // 空值 = 「不修改」（密钥留空是常见交互，不能误清）；清除请用 clear 列表
    if (!v.trim()) continue;
    patch[k] = v.trim();
  }
  // 显式清除
  const clear = Array.isArray(body.clear) ? body.clear : [];
  for (const k of clear) {
    if (typeof k === 'string' && ALLOWED_KEYS.has(k)) patch[k] = '';
  }

  const activeLlm =
    typeof body.activeLlm === 'string' &&
    MODEL_PROVIDERS.some((p) => p.id === body.activeLlm && p.kind === 'llm')
      ? (body.activeLlm as ModelProviderId)
      : undefined;

  try {
    await writeModelConfig({ values: patch, activeLlm, updatedBy: admin });
  } catch (e) {
    return NextResponse.json(
      { error: 'save_failed', detail: e instanceof Error ? e.message.slice(0, 300) : 'unknown' },
      { status: 500 },
    );
  }

  const data = await getMaskedModelConfig();
  return NextResponse.json({ ok: true, ...data });
}

/** provider 连通性测试（用真实密钥打一次最小请求）。 */
async function testProvider(providerId: ModelProviderId): Promise<{
  ok: boolean;
  provider: ModelProviderId;
  detail: string;
}> {
  const data = await readModelConfig();
  const has = (k: string) => !!resolveModelValue(data, k);

  try {
    switch (providerId) {
      case 'deepseek': {
        const key = resolveModelValue(data, 'DEEPSEEK_API_KEY');
        if (!key) return { ok: false, provider: providerId, detail: '未配置 DEEPSEEK_API_KEY' };
        const out = await openAiChat({
          baseUrl: resolveModelValue(data, 'DEEPSEEK_BASE_URL') || 'https://api.deepseek.com',
          apiKey: key,
          model: resolveModelValue(data, 'DEEPSEEK_MODEL') || 'deepseek-chat',
          messages: [{ role: 'user', content: 'ping' }],
          maxTokens: 8,
          timeoutMs: 20_000,
        });
        return { ok: true, provider: providerId, detail: `已连通，返回：${out.trim().slice(0, 40) || '(空)'}` };
      }
      case 'dashscope': {
        const key = resolveModelValue(data, 'DASHSCOPE_API_KEY');
        if (!key) return { ok: false, provider: providerId, detail: '未配置 DASHSCOPE_API_KEY' };
        const configured = resolveModelValue(data, 'DASHSCOPE_BASE_URL');
        // 配置项是站点根地址；OpenAI 兼容通道固定走 /compatible-mode/v1
        const base = configured
          ? configured.includes('/compatible-mode')
            ? configured
            : `${configured.replace(/\/+$/, '')}/compatible-mode/v1`
          : 'https://dashscope.aliyuncs.com/compatible-mode/v1';
        const out = await openAiChat({
          baseUrl: base,
          apiKey: key,
          model: 'qwen-turbo',
          messages: [{ role: 'user', content: 'ping' }],
          maxTokens: 8,
          timeoutMs: 20_000,
        });
        return { ok: true, provider: providerId, detail: `已连通，返回：${out.trim().slice(0, 40) || '(空)'}` };
      }
      case 'minimax': {
        const key = resolveModelValue(data, 'MINIMAX_API_KEY');
        if (!key) return { ok: false, provider: providerId, detail: '未配置 MINIMAX_API_KEY' };
        const res = await fetch('https://api.minimaxi.com/v1/text/chatcompletion_v2', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'MiniMax-Text-01',
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          }),
          cache: 'no-store',
        });
        const json = (await res.json().catch(() => ({}))) as { base_resp?: { status_msg?: string } };
        if (!res.ok || json.base_resp?.status_msg) {
          return { ok: false, provider: providerId, detail: json.base_resp?.status_msg || `HTTP ${res.status}` };
        }
        return { ok: true, provider: providerId, detail: '已连通（鉴权通过）' };
      }
      case 'runninghub': {
        const ok = has('RUNNINGHUB_API_KEY') && has('RUNNINGHUB_WORKFLOW_ID');
        return {
          ok,
          provider: providerId,
          detail: ok ? '已配置 Key 与 Workflow ID（未发起调用）' : '需要同时配置 API Key 与 Workflow ID',
        };
      }
      default:
        return { ok: false, provider: providerId, detail: '未知 provider' };
    }
  } catch (e) {
    return {
      ok: false,
      provider: providerId,
      detail: e instanceof Error ? e.message.slice(0, 200) : 'unknown error',
    };
  }
}