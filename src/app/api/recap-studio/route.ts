import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { unlink, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, getSupabaseClient } from '@/storage/database/supabase-client';
import {
  RECAP_ERROR_CODES,
  RECAP_MAX_TOTAL_SEC,
  normalizeRecapScript,
  normalizeRecapTargetSec,
  type RecapScript,
} from '@/lib/recap';
import { fetchFullTranscript, normalizeSubtitleStyle } from '@/lib/server/subtitles';
import { synthesizeVoiceover, isVoiceId } from '@/lib/server/voiceover';
import {
  buildLocalRecapDraft,
  generateRecapScript,
  resolveRecapLlmConfig,
  type RecapAiConfig,
} from '@/lib/server/recap/script';
import {
  buildNarrationCues,
  chapterNarrationTexts,
  planRecapTimeline,
  type RecapRange,
} from '@/lib/server/recap/align';
import { RECAP_XFADE_SEC, renderRecapFilm, probeDuration, findFfmpegBinary, type RecapBgmMood } from '@/lib/server/recap/render';
import { decideEntitlement, type SubscriptionSnapshot } from '@/lib/server/effective-plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 同步渲染：≤6 章 / ≤12 片 / 旁白 ≤200s（14 次左右 ffmpeg 调用），与 vercel.json 的 300s 一致
export const maxDuration = 300;

const DEFAULT_VOICES: Record<'zh' | 'en', string> = {
  zh: 'zh-CN-YunxiNeural',
  en: 'en-US-GuyNeural',
};

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Recap Studio 门控（Pro）——最高客单价功能，不复刻 `verifyStarterEligibility`
 * 的"clientPlan 命中即放行"弱点：**只要带了 Bearer token 就一律以服务端裁定**。
 * 仅无 token（本地/SSR/未登录）时才回落信任 clientPlan==='pro'。
 */
async function verifyProEligibility(
  request: NextRequest,
  clientPlan: string,
): Promise<{ ok: boolean; reason?: string }> {
  const deny = (): { ok: false; reason: string } => ({ ok: false, reason: RECAP_ERROR_CODES.requiresPro });

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || !isSupabaseConfigured()) return clientPlan === 'pro' ? { ok: true } : deny();

  try {
    const userClient = getSupabaseClient(token);
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user?.id) return deny();

    const service = serviceRoleClient();
    if (!service) return deny(); // 有 token 却无法服务端核验 → 拒绝（不放行）

    const [subRes, profileRes] = await Promise.all([
      service.from('subscriptions').select('plan_type, status, current_period_end').eq('user_id', user.id).maybeSingle(),
      service.from('users').select('role').eq('id', user.id).maybeSingle(),
    ]);
    if (profileRes.data?.role === 'admin') return { ok: true };
    // 本功能是 Pro 专属（recap_requires_pro）。生效判定必须看 status + current_period_end：
    // 旧实现把 status === 'active' 当放行条件，而每个注册用户的行都是 free + active。
    if (decideEntitlement(subRes.data as SubscriptionSnapshot | null).plan === 'pro') return { ok: true };
    return deny();
  } catch (e) {
    console.warn('[recap-studio] eligibility error:', e instanceof Error ? e.message.slice(0, 200) : e);
    return deny();
  }
}

type RecapBody = {
  mode?: string;
  plan?: string;
  videoId?: string;
  streamUrl?: string;
  audioUrl?: string;
  userAgent?: string;
  visitorData?: string;
  xClientName?: string | number;
  clientVersion?: string;
  clientName?: string;
  sourceDuration?: number;
  targetDurationSec?: number;
  videoTitle?: string;
  locale?: string;
  preferredLang?: string | null;
  voice?: string;
  orientation?: string;
  style?: unknown;
  originalVolume?: number;
  bgmMood?: string | null;
  highlights?: unknown;
  script?: unknown;
  aiConfig?: unknown;
  allowLocalDraft?: boolean;
};

/** 客户端高光区间白名单归一化（≤60 条、合法区间） */
function normalizeHighlights(raw: unknown): RecapRange[] {
  if (!Array.isArray(raw)) return [];
  const out: RecapRange[] = [];
  for (const item of raw.slice(0, 60)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const start = Number(r.start);
    const end = Number(r.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) continue;
    out.push({ start, end: Math.min(end, start + 600) });
  }
  return out;
}

/** 流式返回 MP4，勿整块 readFile（防 serverless OOM）；文件由流 close 后 unlink */
function streamMp4Response(filePath: string, size: number): NextResponse {
  const rs = createReadStream(filePath);
  rs.on('close', () => {
    unlink(filePath).catch(() => {});
  });
  const webStream = Readable.toWeb(rs) as unknown as BodyInit;
  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="recap.mp4"',
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: NextRequest) {
  // ★ 声明在 try 外：Turbopack 代码分割后 try 内的 let 对 finally 不可见
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempPaths: string[] = [];
  // ★ 成片输出绝不进 tempPaths：必须由 streamMp4Response 在流 close 后清理，
  //   finally 提前 unlink 会让 Vercel 消费流时 ENOENT → 客户端收到 500 HTML。
  const outPath = join(tmpdir(), `recap-out-${runId}.mp4`);

  try {
    let body: RecapBody;
    try {
      body = (await request.json()) as RecapBody;
    } catch {
      return NextResponse.json({ error: RECAP_ERROR_CODES.invalidRequest, detail: 'Invalid JSON body' }, { status: 400 });
    }

    const mode = body.mode === 'render' ? 'render' : 'script';
    const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
    if (!videoId) {
      return NextResponse.json({ error: RECAP_ERROR_CODES.invalidRequest, detail: 'videoId required' }, { status: 400 });
    }

    const elig = await verifyProEligibility(request, String(body.plan || ''));
    if (!elig.ok) {
      return NextResponse.json(
        { error: elig.reason, detail: 'Recap Studio requires a Pro plan.' },
        { status: 403 },
      );
    }

    const locale = typeof body.locale === 'string' ? body.locale : undefined;
    const preferredLang = body.preferredLang ?? locale ?? null;

    // 全量字幕：解说稿生成与音画对齐都需要
    const { cues, lang } = await fetchFullTranscript(videoId, preferredLang);
    const segments = cues.map((c) => ({ start: c.start, duration: Math.max(0.01, c.end - c.start), text: c.text }));

    // ── mode: 'script' — 出解说稿（可编辑，供前端二次请求 render） ─────────────
    if (mode === 'script') {
      if (segments.length === 0) {
        return NextResponse.json(
          { error: RECAP_ERROR_CODES.transcriptUnavailable, detail: 'No subtitles available for this video.' },
          { status: 422 },
        );
      }

      const targetDurationSec = normalizeRecapTargetSec(body.targetDurationSec);
      const videoTitle = typeof body.videoTitle === 'string' ? body.videoTitle : undefined;

      const cfg = resolveRecapLlmConfig(body.aiConfig as RecapAiConfig | undefined);
      let script: RecapScript | null = null;
      let engineReason = '';

      if (cfg) {
        script = await generateRecapScript({ cfg, segments, videoTitle, targetDurationSec, locale });
        if (!script) engineReason = 'AI script generation failed (bad response or network).';
      } else if (body.allowLocalDraft === true) {
        script = buildLocalRecapDraft({
          segments,
          videoTitle,
          targetDurationSec,
          locale,
          sourceType: 'youtube',
        });
        if (!script) engineReason = 'Local heuristic draft could not be built from this transcript.';
      } else {
        // ★ 绝不静默降级：无可用 AI 通道时明确返回 503 + 可操作提示
        return NextResponse.json(
          {
            error: RECAP_ERROR_CODES.aiUnavailable,
            detail: 'No AI provider configured. Set COZE_WORKLOAD_IDENTITY_API_KEY, or retry with allowLocalDraft:true for a local heuristic draft.',
          },
          { status: 503 },
        );
      }

      if (!script) {
        return NextResponse.json(
          { error: RECAP_ERROR_CODES.scriptInvalid, detail: engineReason || 'Could not build a recap script.' },
          { status: 502 },
        );
      }

      const sourceDuration = Math.max(
        Number.isFinite(Number(body.sourceDuration)) ? Number(body.sourceDuration) : 0,
        cues[cues.length - 1]?.end || 0,
      );

      console.log(`[recap-studio] script ok: engine=${script.engine} chapters=${script.chapters.length} cues=${cues.length} lang=${lang}`);

      return NextResponse.json({
        script,
        engine: script.engine,
        transcript: { cueCount: cues.length, lang },
        sourceDuration,
      });
    }

    // ── mode: 'render' — 解说稿 → 音画对齐 → 出片 ───────────────────────────
    const script = normalizeRecapScript(body.script);
    if (!script) {
      return NextResponse.json(
        { error: RECAP_ERROR_CODES.scriptInvalid, detail: 'Invalid recap script payload.' },
        { status: 400 },
      );
    }

    const anchors: Array<RecapRange | null> = script.chapters.map((c) =>
      c.sourceStart != null && c.sourceEnd != null ? { start: c.sourceStart, end: c.sourceEnd } : null,
    );
    const hasAnchor = anchors.some((a) => a != null);
    if (cues.length === 0 && !hasAnchor) {
      return NextResponse.json(
        { error: RECAP_ERROR_CODES.transcriptUnavailable, detail: 'No subtitles and no source anchors: cannot align narration to video.' },
        { status: 422 },
      );
    }

    const ffmpegPath = await findFfmpegBinary();
    if (!ffmpegPath) {
      return NextResponse.json({ error: RECAP_ERROR_CODES.renderFailed, detail: 'FFmpeg not available' }, { status: 500 });
    }

    // 1) 逐章 TTS —— 量出真实解说时长 D_i（音画对齐的输入）
    const localeZh = (locale || '').toLowerCase().startsWith('zh');
    const voice = isVoiceId(String(body.voice || ''))
      ? String(body.voice)
      : localeZh
        ? DEFAULT_VOICES.zh
        : DEFAULT_VOICES.en;

    const narrationTexts = chapterNarrationTexts(script);
    const narrationPaths: string[] = [];
    const chapterDurations: number[] = [];

    for (let i = 0; i < narrationTexts.length; i++) {
      const text = narrationTexts[i];
      let audio: Buffer;
      try {
        audio = await synthesizeVoiceover(text, voice);
      } catch (e) {
        console.error(`[recap-studio] tts failed for chapter ${i + 1}:`, e instanceof Error ? e.message : e);
        return NextResponse.json(
          { error: RECAP_ERROR_CODES.renderFailed, detail: `Narration synthesis failed for chapter ${i + 1}.` },
          { status: 502 },
        );
      }
      const audioPath = join(tmpdir(), `recap-nar-${runId}-${i}.mp3`);
      await writeFile(audioPath, audio);
      tempPaths.push(audioPath);

      const dur = await probeDuration(ffmpegPath, audioPath);
      if (!(dur > 0)) {
        return NextResponse.json(
          { error: RECAP_ERROR_CODES.renderFailed, detail: `Narration audio for chapter ${i + 1} is unreadable.` },
          { status: 502 },
        );
      }
      narrationPaths.push(audioPath);
      chapterDurations.push(dur);
    }

    const totalNarration = chapterDurations.reduce((a, b) => a + b, 0);
    if (totalNarration > RECAP_MAX_TOTAL_SEC) {
      return NextResponse.json(
        {
          error: RECAP_ERROR_CODES.renderFailed,
          detail: `Narration is too long (${Math.round(totalNarration)}s > ${RECAP_MAX_TOTAL_SEC}s). Please shorten the script.`,
        },
        { status: 422 },
      );
    }

    // 2) 音画对齐：Σ 每章片时长 == 该章解说时长 D_i
    const sourceDuration = Math.max(
      Number.isFinite(Number(body.sourceDuration)) ? Number(body.sourceDuration) : 0,
      cues[cues.length - 1]?.end || 0,
      totalNarration,
    );
    const plan = planRecapTimeline({
      chapterDurations,
      chapterTexts: narrationTexts,
      cues,
      sourceDuration,
      highlights: normalizeHighlights(body.highlights),
      anchors,
      headroomSec: RECAP_XFADE_SEC,
    });
    if (!plan) {
      return NextResponse.json(
        { error: RECAP_ERROR_CODES.sourceUnavailable, detail: 'Not enough source information to align the timeline.' },
        { status: 422 },
      );
    }

    // 3) 解说字幕（成片相对时间）
    const narrationCues = buildNarrationCues(
      plan.chapters.map((c, i) => ({ text: narrationTexts[i], start: c.start, duration: chapterDurations[i] })),
    );

    // 4) 源视频 muxed 流
    const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim().replace(/\/$/, '');
    if (!cfWorkerUrl) {
      return NextResponse.json({ error: RECAP_ERROR_CODES.renderFailed, detail: 'CF_WORKER_URL not configured' }, { status: 500 });
    }
    const streamUrl = new URL(`${cfWorkerUrl}/stream`);
    streamUrl.searchParams.set('videoId', videoId);
    streamUrl.searchParams.set('maxHeight', '360');
    streamUrl.searchParams.set('muxed', '1');
    if (body.streamUrl) streamUrl.searchParams.set('streamUrl', String(body.streamUrl));
    if (body.userAgent) streamUrl.searchParams.set('userAgent', String(body.userAgent));
    if (body.visitorData) streamUrl.searchParams.set('visitorData', String(body.visitorData));
    streamUrl.searchParams.set('xClientName', String(body.xClientName ?? '1'));
    if (body.clientVersion) streamUrl.searchParams.set('clientVersion', String(body.clientVersion));
    if (body.clientName) streamUrl.searchParams.set('clientName', String(body.clientName));

    const vertical = body.orientation === 'vertical';
    const style = normalizeSubtitleStyle(body.style);
    const originalVolumeRaw = Number(body.originalVolume);
    // 原声默认压到 20%（解说是主线），用户可 0-100 调
    const originalVolume = Math.min(1, Math.max(0, (Number.isFinite(originalVolumeRaw) ? originalVolumeRaw : 20) / 100));
    const bgmMood = typeof body.bgmMood === 'string' ? body.bgmMood : null;

    console.log(`[recap-studio] render start: chapters=${script.chapters.length} pieces=${plan.chapters.reduce((s, c) => s + c.pieces.length, 0)} narration=${totalNarration.toFixed(1)}s vertical=${vertical} voice=${voice}`);

    const result = await renderRecapFilm({
      muxedUrl: streamUrl.toString(),
      plan,
      narrationPaths,
      cues: narrationCues,
      style,
      vertical,
      originalVolume,
      bgmMood: (bgmMood as RecapBgmMood | null),
      outPath,
      runId,
      tempPaths,
    });

    const outStat = await stat(outPath).catch(() => null);
    if (!outStat || outStat.size < 20_000) {
      return NextResponse.json({ error: RECAP_ERROR_CODES.renderFailed, detail: 'Recap output too small or missing' }, { status: 502 });
    }

    console.log(`[recap-studio] render ok: ${outStat.size} bytes, ${result.durationSec.toFixed(1)}s, xfade=${result.usedXfade}, pieces=${result.pieceCount}`);
    return streamMp4Response(outPath, outStat.size);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[recap-studio] Error:', msg.slice(0, 1000));
    return NextResponse.json(
      { error: RECAP_ERROR_CODES.renderFailed, detail: msg.slice(0, 500) },
      { status: 500 },
    );
  } finally {
    for (const p of tempPaths) await unlink(p).catch(() => {});
  }
}