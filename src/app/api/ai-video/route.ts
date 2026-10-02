import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { unlink, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import { resolveBearerUserId } from '@/lib/server/plan-gate';
import { isAdminUser, ensureCreditsAndCheck } from '@/lib/server/video-job';
import { decideEntitlement, type SubscriptionSnapshot } from '@/lib/server/effective-plan';
import { generateAiVideoScript } from '@/lib/server/ai-video/script';
import { renderAiVideo } from '@/lib/server/ai-video/render';
import { AI_VIDEO_COST, AI_VIDEO_MAX_TOPIC_CHARS, resolveAiVideoTarget } from '@/lib/ai-video';
import { isAiVideoTemplateId, resolveAiVideoTemplate } from '@/lib/ai-video-templates';
import { isVoiceCloneAvailable } from '@/lib/server/digital-human/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 同步渲染：≤6 分镜（TTS + sharp + 逐段编码 + xfade + 单 pass 合成），与 vercel.json 的 300s 一致
export const maxDuration = 300;

/** 各语言的旁白声线（msedge-tts 神经声线）；未覆盖的语言回落英语声线。 */
const VOICE_BY_LOCALE: Record<string, string> = {
  zh: 'zh-CN-XiaoxiaoNeural',
  'zh-Hant': 'zh-TW-HsiaoChenNeural',
  en: 'en-US-AriaNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  it: 'it-IT-ElsaNeural',
  pt: 'pt-BR-FranciscaNeural',
  ru: 'ru-RU-SvetlanaNeural',
  ar: 'ar-EG-SalmaNeural',
  hi: 'hi-IN-SwaraNeural',
  id: 'id-ID-GadisNeural',
  th: 'th-TH-PremwadeeNeural',
  vi: 'vi-VN-HoaiMyNeural',
  tr: 'tr-TR-EmelNeural',
  nl: 'nl-NL-FennaNeural',
  pl: 'pl-PL-ZofiaNeural',
};

function resolveVoice(locale: string): string {
  if (VOICE_BY_LOCALE[locale]) return VOICE_BY_LOCALE[locale];
  const base = locale.split('-')[0];
  return VOICE_BY_LOCALE[base] || VOICE_BY_LOCALE.en;
}

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** 成功后一次性扣费（一次生成一条流水；失败不扣）。 */
async function chargeOnce(client: SupabaseClient, userId: string, jobId: string): Promise<void> {
  const { data: creditsRow } = await client.from('credits').select('balance').eq('user_id', userId).maybeSingle();
  const balance = creditsRow?.balance ?? 0;
  if (balance < AI_VIDEO_COST) return;
  await client.from('credits').update({ balance: balance - AI_VIDEO_COST }).eq('user_id', userId);
  await client.from('credit_transactions').insert({
    user_id: userId,
    amount: -AI_VIDEO_COST,
    type: 'video_process',
    description: 'AI video generation',
    related_id: jobId,
  });
}

export async function POST(request: NextRequest) {
  const tempPaths: string[] = [];
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outPath = join(tmpdir(), `aivideo-out-${runId}.mp4`);

  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const topic = String(body.topic || '').trim().slice(0, AI_VIDEO_MAX_TOPIC_CHARS);
    const locale = String(body.locale || 'en');
    if (!topic) return NextResponse.json({ error: 'topic_required' }, { status: 400 });

    // 模版：白名单校验，非法值回落默认模版（服务端绝不采信前端任意字符串）
    const template = resolveAiVideoTemplate(isAiVideoTemplateId(body.template) ? body.template : null);

    // BGM 心绪：白名单校验（public/bgm/{mood}.mp3）；'none' = 明确不加 BGM；缺省回落模版自带
    const bgmRaw = typeof body.bgmMood === 'string' ? body.bgmMood.trim() : '';
    const bgmMood: string | null | undefined =
      bgmRaw === 'none'
        ? null
        : ['calm', 'energetic', 'warm'].includes(bgmRaw)
          ? bgmRaw
          : undefined;

    // 身份：必须携带可核验 token（同源请求自动带 clipop_access_token cookie）
    const userId = await resolveBearerUserId(request);
    if (!userId || !isSupabaseConfigured()) {
      return NextResponse.json({ error: 'login_required' }, { status: 401 });
    }
    const client = serviceRoleClient();
    if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

    // 权益与额度一律服务端裁定（绝不采信请求体里的 plan）
    const [subRes, admin] = await Promise.all([
      client.from('subscriptions').select('plan_type, status, current_period_end').eq('user_id', userId).maybeSingle(),
      isAdminUser(client, userId),
    ]);
    const effectivePlan = admin
      ? 'pro'
      : decideEntitlement(subRes.data as SubscriptionSnapshot | null).plan;
    const target = resolveAiVideoTarget(effectivePlan);

    if (!admin) {
      const balance = await ensureCreditsAndCheck(client, userId);
      if (balance < AI_VIDEO_COST) {
        return NextResponse.json(
          { error: 'insufficient_credits', required: AI_VIDEO_COST, balance },
          { status: 402 },
        );
      }
    }

    const script = await generateAiVideoScript({ topic, locale, templateId: template.id });
    const voice = resolveVoice(locale);
    const voiceClone = template.prefersClonedVoice && (await isVoiceCloneAvailable());
    console.log(
      `[ai-video] user=${userId} template=${template.id} engine=${script.engine} scenes=${script.scenes.length} plan=${effectivePlan} voiceClone=${voiceClone}`,
    );

    const durationSec = await renderAiVideo({
      scenes: script.scenes,
      voice,
      target,
      outPath,
      runId,
      tempPaths,
      bgmMood: bgmMood === undefined ? template.bgmMood : bgmMood,
      templateId: template.id,
    });

    if (!admin) {
      try {
        await chargeOnce(client, userId, runId);
      } catch (e) {
        console.warn('[ai-video] charge failed (non-fatal):', e instanceof Error ? e.message.slice(0, 160) : e);
      }
    }

    const outStat = await stat(outPath);
    return streamMp4(outPath, outStat.size, {
      engine: script.engine,
      watermark: target.watermark,
      duration: durationSec,
      template: template.id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[ai-video] error:', msg.slice(0, 800));
    await unlink(outPath).catch(() => {});
    return NextResponse.json({ error: 'render_failed', detail: msg.slice(0, 300) }, { status: 500 });
  } finally {
    // 成片不能在这里删：流式响应此刻尚未被消费（next/server 返回后客户端才开始读）。
    // 成片的删除交给 streamMp4 的流 close 回调（错误路径见上方 catch）。
    for (const p of tempPaths) await unlink(p).catch(() => {});
  }
}

/** 流式返回 MP4（勿整块 readFile，防 serverless OOM）；流关闭后删除成片。 */
function streamMp4(
  filePath: string,
  size: number,
  meta: { engine: string; watermark: boolean; duration: number; template: string },
): NextResponse {
  const rs = createReadStream(filePath);
  rs.on('close', () => {
    unlink(filePath).catch(() => {});
  });
  const webStream = Readable.toWeb(rs) as unknown as BodyInit;
  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'inline; filename="ai-video.mp4"',
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
      'X-Ai-Video-Engine': meta.engine,
      'X-Ai-Video-Watermark': meta.watermark ? '1' : '0',
      'X-Ai-Video-Duration': meta.duration.toFixed(2),
      'X-Ai-Video-Template': meta.template,
    },
  });
}