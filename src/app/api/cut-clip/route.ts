import { NextRequest, NextResponse } from 'next/server';
import { stat, writeFile, unlink, access, constants as fsConstants } from 'fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// v55: Increased from 60s to 300s to match vercel.json and allow ffmpeg direct
// stream read fallback (which can take longer but is more reliable).
// Previous 60s cap was the root cause of "download failed" — server downloads
// (80MB ~40s) + ffmpeg cut (~10s) = ~50s, dangerously close to the 60s limit.
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

import {
  resolveExportTarget,
  buildExportVf,
  buildVerticalComplex,
  getWatermarkPngPath,
  buildWatermarkArgs,
} from '@/lib/server/video-export';
import {
  buildAssFile,
  fetchClipCuesTranslated,
  setupFontConfig,
  normalizeSubtitleStyle,
  subtitleFilterForceStyle,
  DEFAULT_SUBTITLE_STYLE,
  type SubtitleCue,
  type SubtitleStyle,
} from '@/lib/server/subtitles';
import { planKeepSegments, buildJumpCutGraph, remapCuesForSegments, type KeepSegment } from '@/lib/server/jump-cut';
import {
  analyzeSubjectPath,
  buildReframeComplex,
  remapReframePath,
  type ReframePath,
} from '@/lib/server/reframe';
import { normalizeSubtitleLang } from '@/lib/subtitle-langs';
import { verifyPaidEligibility, verifyStarterEligibility, commitFreeExport } from '@/lib/server/plan-gate';

/** 竖屏门控（兼容旧调用）：统一走泛化函数。 */
async function verifyVerticalEligibility(
  request: NextRequest,
  clientPlan: string,
): Promise<{ ok: boolean; reason?: string }> {
  return verifyStarterEligibility(request, clientPlan, 'vertical');
}

/** 「导出即付费墙」：免费用户不得产出任何视频文件的统一 403 响应。 */
function exportPaywallResponse() {
  return NextResponse.json(
    {
      error: 'Exporting clips requires a paid plan (export_requires_paid). Upgrade to Starter or Pro to download.',
      reason: 'export_requires_paid',
    },
    { status: 403 },
  );
}

/**
 * P0 竖屏智能追焦：分析源画面里人物的水平位置，得到裁切路径。
 *
 * 返回 null 表示「不确定」（幻灯片/无人/置信度低/源比 9:16 还窄）→ 调用方回落 blur-fit。
 * 任何异常都吞掉并回落，绝不因为追焦分析失败而让整次导出失败。
 */
async function resolveReframePath(
  ffmpegPath: string,
  input: { source: string; inputArgs?: string[] },
  opts: { startTime: number; duration: number },
  enabled: boolean,
): Promise<ReframePath | null> {
  if (!enabled) return null;
  const t0 = Date.now();
  try {
    const path = await analyzeSubjectPath(ffmpegPath, input, opts);
    if (path) {
      console.log(
        `[cut-clip] reframe: tracking path ready (conf=${path.confidence}, knots=${path.times.length}, coverage=${path.coverage}, ${Date.now() - t0}ms)`,
      );
    } else {
      console.log(`[cut-clip] reframe: no confident subject → blur-fit (${Date.now() - t0}ms)`);
    }
    return path;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cut-clip] reframe: analysis error → blur-fit: ${msg.slice(0, 200)}`);
    return null;
  }
}

/**
 * /api/cut-clip — Server-side ffmpeg clip cutting (v58 muxed-single-input-audio-sync)
 *
 * APPROACH (v58 — always use muxed single input + ffmpeg -ss, audio synced):
 *   Browser sends streamUrl (resolved googlevideo.com URL) + metadata (JSON).
 *   Server ALWAYS uses a single muxed (combined video+audio) stream from CF
 *   Worker /stream?muxed=1, regardless of whether /resolve returned a separate
 *   audioUrl. ffmpeg reads directly from the CF Worker /stream URL using HTTP
 *   input, with `-ss startTime` BEFORE `-i` for fast seek to the correct
 *   position. Only ~5-10MB of data is downloaded.
 *
 *   Total time: ~10-15s.
 *
 * WHY muxed single-input (not dual-input):
 *   v56/v57 dual-input (video + separate audio) caused 5.353s audio/video
 *   drift because ffmpeg's `-ss` on dual inputs preserves original timestamps
 *   differently for each stream. v57 tried to use CF Worker's `begin` parameter
 *   to make YouTube return streams starting at startTime — but YouTube IGNORES
 *   the `begin` parameter (URL signature sig/lsig mismatch), so all outputs
 *   started from 0:00 (verified by comparing MD5 of outputs with begin=30s vs
 *   begin=60s — they were identical).
 *
 *   Local tests confirmed that muxed stream (itag 18, 360p) single input +
 *   `-ss 30` produces drift=0.056s (essentially perfect sync). This is the
 *   ONLY reliable approach. Trade-off: 360p quality instead of 720p, but
 *   audio sync is critical (user's "no sound" complaint).
 *
 * FALLBACK (v51 path — download + cut):
 *   If direct ffmpeg read fails (e.g., TLS issues, network errors), fall back
 *   to the v51 approach: download video bytes to local file, then ffmpeg cut.
 *   This is slower but more robust for edge cases.
 *
 * Input: JSON body
 *   - streamUrl: string (resolved googlevideo.com URL — video or muxed)
 *   - audioUrl?: string (IGNORED in v58 — kept for API compatibility)
 *   - userAgent: string (from /resolve response)
 *   - visitorData: string (from /resolve response)
 *   - xClientName?: string|number
 *   - clientVersion?: string
 *   - clientName?: string
 *   - videoId: string (YouTube video ID)
 *   - startTime: number (seconds)
 *   - endTime: number (seconds)
 *
 * Output: video/mp4 (standard progressive MP4 with +faststart)
 */
export async function POST(request: NextRequest) {
  const inputPath = join(tmpdir(), `cut-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);
  const audioPath = join(tmpdir(), `cut-audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`);
  const outputPath = join(tmpdir(), `cut-output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);
  let fontConfigPath: string | null = null;
  // ★ 必须在 POST 顶部（try 外）声明：finally 引用它，try 内 let 在 finally 不可见。
  let subtitlePath: string | null = null;

  try {
    const contentType = request.headers.get('content-type') || '';

    let streamUrl = '';
    let audioUrl = '';
    let userAgent = '';
    let visitorData = '';
    let xClientName: string | number = '1';
    let clientVersion = '';
    let clientName = 'direct';
    let videoId = '';
    let startTime = 0;
    let duration = 30;
    let plan = '';
    let vertical = false;
    let wantSubtitles = false;
    let subtitleStyle: SubtitleStyle = DEFAULT_SUBTITLE_STYLE;
    let subtitleLang: string | null = null;
    /** AI 粗剪清理（Starter+）：按逐字稿剪掉长停顿与纯语气词 */
    let jumpCut = false;

    // Support both JSON and multipart/form-data (for backwards compat)
    if (contentType.includes('application/json')) {
      const body = await request.json();
      plan = String(body.plan || '');
      vertical = body.orientation === 'vertical' || body.vertical === true;
      wantSubtitles = body.subtitles === true;
      jumpCut = body.jumpCut === true;
      subtitleStyle = normalizeSubtitleStyle(body.style); // 字幕样式（Starter+）
      subtitleLang = normalizeSubtitleLang(body.subtitleLang); // 字幕翻译（Starter+）
      streamUrl = body.streamUrl || '';
      audioUrl = body.audioUrl || '';
      userAgent = body.userAgent || '';
      visitorData = body.visitorData || '';
      xClientName = body.xClientName || '1';
      clientVersion = body.clientVersion || '';
      clientName = body.clientName || 'direct';
      videoId = body.videoId || '';
      startTime = Number(body.startTime) || 0;
      duration = Math.min(Number(body.duration) || (Number(body.endTime) - startTime) || 30, 90);
    } else {
      // Legacy multipart/form-data path (browser uploaded video bytes)
      const formData = await request.formData();
      const file = formData.get('file');
      if (file && file instanceof File) {
        if (file.size > 100 * 1024 * 1024) {
          return NextResponse.json({ error: `File too large: ${file.size} bytes (max 100MB)` }, { status: 413 });
        }
        if (file.size < 10_000) {
          return NextResponse.json({ error: `File too small: ${file.size} bytes` }, { status: 400 });
        }
        const arrayBuffer = await file.arrayBuffer();
        await writeFile(inputPath, Buffer.from(arrayBuffer));
        startTime = Number(formData.get('startTime')) || 0;
        duration = Math.min(Number(formData.get('duration')) || 30, 90);
        plan = String(formData.get('plan') || '');
        vertical = String(formData.get('orientation') || '') === 'vertical' || formData.get('vertical') === 'true';
        wantSubtitles = formData.get('subtitles') === 'true';
        jumpCut = formData.get('jumpCut') === 'true';
        subtitleLang = normalizeSubtitleLang(String(formData.get('subtitleLang') || ''));

        // 「导出即付费墙」：任何导出一律先过付费门控（在 ffmpeg/下载之前）。
        // allowSpentCredits：已消耗积分生成过视频的免费用户可直接下载（不消耗一次性额度）。
        const uploadPaid = await verifyPaidEligibility(request, plan, { allowSpentCredits: true });
        if (!uploadPaid.ok) return exportPaywallResponse();

        // 9:16 竖屏 = Starter+ 付费权益
        if (vertical) {
          const elig = await verifyVerticalEligibility(request, plan);
          if (!elig.ok) return NextResponse.json({ error: elig.reason, detail: '9:16 vertical export requires Starter or Pro.' }, { status: 403 });
        }
        // AI 粗剪清理 = Starter+ 付费权益
        if (jumpCut) {
          const elig = await verifyStarterEligibility(request, plan, 'jumpcut');
          if (!elig.ok) return NextResponse.json({ error: elig.reason, detail: 'AI jump-cut requires Starter or Pro.' }, { status: 403 });
        }

        // Skip the download step — file already uploaded
        const expTarget = resolveExportTarget(plan);
        const expWm = (expTarget.watermark && !vertical) ? await getWatermarkPngPath() : null;
        // 竖屏走 blur-fit 复合滤镜（vertical=true 时由 cutLocalFile 内部构建）；
        // 横屏走 plan 分辨率 cap + 水印。
        return await cutLocalFile(
          inputPath, outputPath, startTime, duration, null,
          vertical ? null : buildExportVf(expTarget), expWm, null, undefined, vertical,
          /*jumpCutSegments*/ undefined, request,
        );
      }
      streamUrl = String(formData.get('streamUrl') || '');
      audioUrl = String(formData.get('audioUrl') || '');
      userAgent = String(formData.get('userAgent') || '');
      visitorData = String(formData.get('visitorData') || '');
      videoId = String(formData.get('videoId') || '');
      startTime = Number(formData.get('startTime')) || 0;
      duration = Math.min(Number(formData.get('duration')) || 30, 90);
      plan = String(formData.get('plan') || '');
      vertical = String(formData.get('orientation') || '') === 'vertical' || formData.get('vertical') === 'true';
    }

    // 「导出即付费墙」：所有导出分支（横屏/竖屏/字幕）统一门控，在 ffmpeg/下载之前拦截。
    // 覆盖 JSON 与 multipart(streamUrl) 两种入参；multipart 文件直传分支已单独门控。
    // allowSpentCredits：已消耗积分生成过视频的免费用户可直接下载（不消耗一次性额度）。
    const paidElig = await verifyPaidEligibility(request, plan, { allowSpentCredits: true });
    if (!paidElig.ok) return exportPaywallResponse();

    if (!streamUrl) {
      return NextResponse.json({ error: 'No streamUrl provided' }, { status: 400 });
    }

    // P0: 按 plan 计算导出分辨率 cap + 水印（仅 free 需水印）
    const exportTarget = resolveExportTarget(plan);
    const exportVf = buildExportVf(exportTarget);
    // 9:16 竖屏 = Starter+ 付费权益：先服务端校验，再走专门滤镜（无水印）
    if (vertical) {
      const elig = await verifyVerticalEligibility(request, plan);
      if (!elig.ok) return NextResponse.json({ error: elig.reason, detail: '9:16 vertical export requires Starter or Pro.' }, { status: 403 });
    }
    // AI 粗剪清理（jump-cut）= Starter+ 付费权益：先服务端校验，再按逐字稿规划保留区间。
    // 无字幕/剪得太狠 → 安全阀返回 disabled，整段原样输出（宁可不动，不可毁片）。
    if (jumpCut) {
      const elig = await verifyStarterEligibility(request, plan, 'jumpcut');
      if (!elig.ok) return NextResponse.json({ error: elig.reason, detail: 'AI jump-cut requires Starter or Pro.' }, { status: 403 });
    }

    // P0-6 发布基线：AI 烧录字幕对所有用户开放 —— 免费用户也能拿到「发得出去」的成片。
    // 付费差异上移到「字幕样式 / 翻译语言」：非 Starter+ 一律回落默认样式与原文语言，
    // 不再直接 403 拒绝（旧行为会把免费用户挡在可发布门槛之外）。
    // 无字幕/拉取失败 → subtitlePath 为 null，优雅跳过（不致命）。
    if (wantSubtitles) {
      const elig = await verifyStarterEligibility(request, plan, 'subtitle');
      if (!elig.ok) {
        subtitleStyle = DEFAULT_SUBTITLE_STYLE;
        subtitleLang = null;
      }
    }

    // 逐字稿：字幕与粗剪共用同一份 cues（避免重复拉取 YouTube）。
    // 粗剪需要它来定位停顿与语气词；字幕需要它来烧录。
    let clipCues: SubtitleCue[] = [];
    if ((wantSubtitles || jumpCut) && videoId) {
      clipCues = await fetchClipCuesTranslated(videoId, startTime, duration, wantSubtitles ? subtitleLang : null);
    }

    // 粗剪保留区间（null = 不做粗剪：未请求，或被安全阀判定不该剪）
    let jumpSegments: KeepSegment[] | null = null;
    if (jumpCut) {
      const planJc = planKeepSegments(clipCues, duration);
      if (planJc.disabled) {
        console.log(`[cut-clip] jump-cut disabled: ${planJc.reason} — exporting the full clip`);
      } else {
        jumpSegments = planJc.segments;
        console.log(`[cut-clip] jump-cut planned: ${planJc.segments.length} segments, removed ${planJc.removedSec}s of ${duration}s`);
      }
    }

    if (wantSubtitles && videoId) {
      // 粗剪会把时间轴压短 → 字幕必须同步重映射，否则整体错位。
      const cues = jumpSegments ? remapCuesForSegments(clipCues, jumpSegments) : clipCues;
      subtitlePath = await buildAssFile(cues, subtitleStyle);
      // ★ serverless 无 fontconfig，libass 找不到字体 → 字幕静默不渲染。
      // setupFontConfig 写最小 config 指向捆绑字体，ffmpeg 子进程继承 env 生效。
      fontConfigPath = await setupFontConfig();
    }
    const watermarkPng = (exportTarget.watermark && !vertical) ? await getWatermarkPngPath() : null;
    if (exportTarget.watermark && !watermarkPng && !vertical) {
      console.warn('[cut-clip] Watermark requested but PNG could not be materialized — exporting without watermark (non-fatal).');
    }

    console.log(`[cut-clip] v59 videoId=${videoId}, startTime=${startTime}s, duration=${duration}s, hasAudioUrl=${!!audioUrl} (IGNORED — v59 uses muxed single input + streamUrl fast path)`);

    const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim().replace(/\/$/, '');
    if (!cfWorkerUrl) {
      return NextResponse.json({ error: 'CF_WORKER_URL not configured' }, { status: 500 });
    }

    // ── v58 PRIMARY PATH: direct ffmpeg read from CF Worker /stream (muxed) ──
    // Build CF Worker /stream URL with streamUrl param + muxed=1 (fast path).
    // ffmpeg reads this URL directly via HTTP input, using -ss fast seek
    // to jump to startTime. Only ~5-10MB of data is downloaded.
    // v58: ALWAYS use muxed single input (ignore audioUrl) to guarantee
    // audio/video sync. Dual-input + -ss caused 5.353s drift in v56/v57.
    // jump-cut 需要「先下载再本地多次裁剪」，直读快路径的流式 seek 不适用 → 主动让路。
    if (!jumpSegments) {
      try {
        const result = await cutFromStreamUrl({
          cfWorkerUrl,
          streamUrl,
          audioUrl,
          userAgent,
          visitorData,
          xClientName,
          clientVersion,
          clientName,
          videoId,
          startTime,
          duration,
          outputPath,
          exportVf: vertical ? null : exportVf, // 竖屏由 cutFromStreamUrl 内部构建 blur-fit 复合滤镜
          watermarkPng,
          vertical,
          subtitlePath,
          subtitleStyle,
          request,
        });
        if (result) return result;
      } catch (directErr) {
        const msg = directErr instanceof Error ? directErr.message : String(directErr);
        console.warn(`[cut-clip] v58 direct stream read failed, falling back to v51 download+cut: ${msg.slice(0, 300)}`);
      }
    } else {
      console.log(`[cut-clip] jump-cut active (${jumpSegments.length} segments) — skipping direct stream path, using download+cut`);
    }

    // ── v51 FALLBACK PATH: download + cut ──────────────────────────────────
    // Download video stream to local file, then ffmpeg cut.
    // Slower but more robust for edge cases (TLS issues, network errors).
    // v58: ALWAYS use single muxed input (download with muxed=1 in
    // downloadStreamViaCfWorker). Do NOT download audio separately —
    // dual-input cut caused 5.353s audio drift in v56/v57.
    let videoBuf = await downloadStreamViaCfWorker(
      cfWorkerUrl, videoId, streamUrl, userAgent, visitorData, /*audio*/ false, /*audioUrl*/ null,
    );
    if (!videoBuf || videoBuf.length < 50_000) {
      return NextResponse.json({
        error: `Video download failed or too small: ${videoBuf ? videoBuf.length : 0} bytes`,
      }, { status: 502 });
    }
    const videoBytes = videoBuf.length;
    await writeFile(inputPath, videoBuf);
    console.log(`[cut-clip] Video downloaded (muxed, contains audio): ${videoBytes} bytes (${(videoBytes / 1024 / 1024).toFixed(1)}MB)`);
    // 尽早释放 ~80MB 的 videoBuf，避免它与后续 ffmpeg 及流式响应叠加导致 serverless OOM。
    videoBuf = null;

    // v58: Skip separate audio download — the muxed stream already contains
    // audio. Using dual-input cutLocalFile would reintroduce the 5.353s drift
    // bug. Pass audioPath=null to force single-input cut.
    console.log(`[cut-clip] v58 fallback: using single-input cut (no separate audio)`);

    // Cut the clip using ffmpeg with single-input mode (audioPath=null)
    return await cutLocalFile(
      inputPath, outputPath, startTime, duration, /*audioPath*/ null,
      vertical ? null : exportVf, watermarkPng, subtitlePath, subtitleStyle, vertical,
      jumpSegments, request,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[cut-clip] Error:', msg.slice(0, 1000));
    return NextResponse.json(
      { error: `Cut clip failed: ${msg.slice(0, 2000)}` },
      { status: 500 },
    );
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(audioPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
    if (subtitlePath) await unlink(subtitlePath).catch(() => {});
    if (fontConfigPath) await unlink(fontConfigPath).catch(() => {});
  }
}

/**
 * v58: Cut clip by having ffmpeg read directly from CF Worker /stream URL.
 *
 * ALWAYS uses a single muxed (combined video+audio) input stream from CF Worker
 * /stream?muxed=1, with ffmpeg `-ss startTime` BEFORE `-i` for fast seek.
 *
 * This is the ONLY approach that produces audio/video sync reliably:
 *   - v55/v56 dual-input + `-ss` on both inputs → 5.353s audio drift
 *   - v57 CF Worker `begin` param → YouTube IGNORES begin (URL sig mismatch),
 *     all outputs started from 0:00 (verified by MD5 comparison)
 *   - v58 muxed single-input + `-ss` → drift 0.056s (essentially perfect)
 *
 * Trade-off: 360p quality (itag 18) instead of 720p, but audio sync is
 * critical (user's "no sound" complaint). 360p is acceptable for short
 * highlight clips.
 *
 * Uses ffmpeg-static binary which supports modern TLS (unlike @ffmpeg-installer
 * which uses a 2018 build with outdated gnutls).
 *
 * Returns NextResponse on success, null on failure (caller falls back to v51).
 */
async function cutFromStreamUrl(params: {
  cfWorkerUrl: string;
  streamUrl: string;
  audioUrl: string; // v58: IGNORED — kept for API compatibility
  userAgent: string;
  visitorData: string;
  xClientName: string | number;
  clientVersion: string;
  clientName: string;
  videoId: string;
  startTime: number;
  duration?: number;
  outputPath: string;
  exportVf?: string | null;
  watermarkPng?: string | null;
  /** 9:16 竖屏导出：cutFromStreamUrl 内 best-effort 计算人物跟踪取景 */
  vertical?: boolean;
  /** AI 自动字幕（Starter+）：已生成的 ASS 文件路径；无字幕时为 null（烧录可选） */
  subtitlePath?: string | null;
  /** 字幕样式（Starter+）：白名单归一化后透传给 ASS 生成 + force_style */
  subtitleStyle?: SubtitleStyle;
  /** 原始请求：成功出口据此消费「一次性免费导出额度」 */
  request: NextRequest;
}): Promise<NextResponse | null> {
  const {
    cfWorkerUrl, streamUrl, audioUrl, userAgent, visitorData,
    xClientName, clientVersion, clientName, videoId,
    startTime, duration, outputPath, exportVf, watermarkPng, vertical, subtitlePath, subtitleStyle,
    request,
  } = params;

  const ffmpegPath = await findFfmpegBinary();
  if (!ffmpegPath) {
    console.warn('[cut-clip] v58: ffmpeg binary not found');
    return null;
  }

  // v59: Build a SINGLE muxed (combined video+audio) stream URL.
  // - streamUrl (CRITICAL): Pass the frontend-resolved streamUrl as the
  //   fast-path param. The frontend's resolveYouTubeStream() calls
  //   CF Worker /resolve?muxed=1, which returns a MUXED stream (itag 18,
  //   360p with integrated audio). Passing streamUrl enables the CF Worker
  //   /stream fast path (direct proxy, no re-resolution) — this is the ONLY
  //   reliable way. Without it, /stream tries to re-resolve from YouTube
  //   InnerTube API which TIMES OUT (30s+) on rate-limited CF colos.
  // - muxed=1: Kept for the re-resolve fallback path (if fast path fails).
  // - maxHeight=360: Force itag 18 (360p) for fastest download.
  // - NO `begin` param: YouTube IGNORES begin (URL sig/lsig mismatch), so
  //   we use ffmpeg's `-ss` for seeking instead.
  // v58 comment claiming "frontend resolves VIDEO-ONLY streams" was WRONG —
  // the frontend requests muxed=1 from /resolve, so streamUrl is combined.
  const muxedStreamEndpoint = new URL(cfWorkerUrl.replace(/\/$/, '') + '/stream');
  muxedStreamEndpoint.searchParams.set('videoId', videoId);
  muxedStreamEndpoint.searchParams.set('maxHeight', '360');
  muxedStreamEndpoint.searchParams.set('muxed', '1');
  // v59: Pass streamUrl to enable fast path (avoids 30s+ re-resolution timeout)
  if (streamUrl) muxedStreamEndpoint.searchParams.set('streamUrl', streamUrl);
  if (userAgent) muxedStreamEndpoint.searchParams.set('userAgent', userAgent);
  if (visitorData) muxedStreamEndpoint.searchParams.set('visitorData', visitorData);
  muxedStreamEndpoint.searchParams.set('xClientName', String(xClientName));
  if (clientVersion) muxedStreamEndpoint.searchParams.set('clientVersion', clientVersion);
  if (clientName) muxedStreamEndpoint.searchParams.set('clientName', clientName);

  console.log(`[cut-clip] v59 direct read: ffmpeg=${ffmpegPath}, streamUrl fast-path (muxed itag 18), startTime=${startTime}s, duration=${duration}s`);

  // HTTP input headers for ffmpeg (CF Worker doesn't need special headers,
  // but we set Accept and Accept-Encoding for clean Range handling)
  const httpHeaders = 'Accept: */*\r\nAccept-Encoding: identity\r\n';
  // 供追焦抽帧复用同一套 HTTP 输入参数（-ss 会按 Range 做输入 seek，与裁切一致）。
  const urlInputArgs = [
    '-rw_timeout', '30000000', '-reconnect', '1', '-reconnect_at_eof', '1',
    '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-headers', httpHeaders,
  ];

  // 9:16 竖屏：blur-fit 合成（整幅 contain + 模糊背景），绝不裁切人物/内容。
  // 竖屏图必须走 filter_complex（含 split），字幕因此需在滤镜图内追加。
  let finalVf = exportVf;
  let verticalGraph: string | null = null;
  // AI 自动字幕（Starter+）：把 ASS 烧录进视频。subtitles 滤镜追加到最终滤镜之后，
  // 并设置 force_style 让其跟随输出分辨率（先 scale 再烧字幕，保证清晰）。
  // ★ execFile 不经 shell，filtergraph 无引号机制：force_style 值内逗号必须 \, 转义
  // （路径由我们生成，tmpdir 无空格/冒号/逗号，无需转义）。
  let subFilter: string | null = null;
  if (subtitlePath) {
    const assPath = subtitlePath.replace(/\\/g, '/');
    // ★ fontsdir：serverless 无 fontconfig，libass 靠 fontsdir 直扫字体目录渲染文字
    const fontsDir = join(process.cwd(), 'public', 'fonts');
    // force_style 由 subtitleStyle 生成（逗号必须 \, 转义：filtergraph 无引号机制）
    subFilter = `subtitles=${assPath}:fontsdir=${fontsDir}:force_style=${subtitleFilterForceStyle(subtitleStyle ?? DEFAULT_SUBTITLE_STYLE, false).replace(/,/g, '\\,')}`;
    console.log(`[cut-clip] subtitles enabled: ${assPath}`);
  }
  if (vertical) {
    // P0 竖屏智能追焦（Auto-Reframe）：先分析人物水平位置得到裁切路径；
    // 置信度不足（幻灯片/无人）时自动回落 blur-fit —— 绝不静默降级到错误裁切。
    const reframePath = await resolveReframePath(
      ffmpegPath,
      { source: muxedStreamEndpoint.toString(), inputArgs: urlInputArgs },
      { startTime, duration: duration && duration > 0 ? duration : 30 },
      true,
    );
    verticalGraph = reframePath
      ? buildReframeComplex(reframePath, subFilter)
      : buildVerticalComplex(subFilter);
    finalVf = null;
  } else if (subFilter) {
    finalVf = finalVf ? `${finalVf},${subFilter}` : subFilter;
  }

  let cutSuccess = false;
  let lastError = '';

  // Attempt 1: RE-ENCODE — guaranteed playable output.
  // v59 root-cause fix: the previous PRIMARY was `-c copy` on the CF Worker
  // LIVE HTTP stream. ffmpeg often exits 0 while silently producing a
  // container with a valid ftyp/moov but truncated/corrupt media (live-stream +
  // `-reconnect` packet-boundary issues). ftyp/audio checks still passed, so the
  // "unplayable download" shipped without any fallback triggering.
  // Re-encoding fully decodes the stream then re-wraps as H.264/AAC with
  // +faststart, eliminating container/timestamp corruption regardless of input
  // quirks. Slightly slower (ultrafast on ≤90s 360p is ~seconds) but definitive.
  try {
    const args: string[] = ['-y'];
    args.push('-ss', String(startTime));
    args.push('-rw_timeout', '30000000', '-reconnect', '1', '-reconnect_at_eof', '1',
               '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    args.push('-headers', httpHeaders);
    args.push('-i', muxedStreamEndpoint.toString());
    // free 水印：追加第二输入（水印 PNG，loop 覆盖整段，overlay eof_action=pass）
    const wmArg = watermarkPng ? buildWatermarkArgs(finalVf ?? null, watermarkPng) : null;
    if (wmArg) args.push(...wmArg.extraInputs);
    args.push('-t', String(duration));
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p');
    // P0: 按 plan 注入分辨率 cap / 9:16 竖屏滤镜 + 水印。watermark → 两输入 overlay；
    // 否则仅 scale/-crop -vf。滤镜失败会抛错并落到 -c copy 回退 → 非致命。
    if (wmArg) {
      args.push('-filter_complex', wmArg.filterComplex, '-map', '[out]', '-map', '0:a?');
    } else if (verticalGraph) {
      args.push('-filter_complex', verticalGraph, '-map', '[vout]', '-map', '0:a?');
    } else if (finalVf) {
      args.push('-vf', finalVf);
    }
    args.push('-c:a', 'aac', '-b:a', '128k');
    args.push('-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', outputPath);

    console.log(`[cut-clip] v59 attempt 1 (re-encode + -ss): ${args.length} args`);
    await execFileAsync(ffmpegPath, args, {
      maxBuffer: 50 * 1024 * 1024,
      // Increased to 210s: re-encode adds encode time on top of the stream
      // read/seek. CF Worker may resolve a fresh stream (30-60s cold cache).
      timeout: 210_000,
      env: { ...process.env, LANG: 'C' },
    });
    cutSuccess = true;
    console.log('[cut-clip] v59 re-encode succeeded');
  } catch (execErr: any) {
    const stderr = String(execErr?.stderr || '');
    lastError = `reencode: ${execErr?.message?.slice(0, 150)} | STDERR: ${stderr.slice(-800)}`;
    console.warn(`[cut-clip] v59 re-encode failed, trying -c copy: ${lastError.slice(0, 300)}`);
  }

  // Attempt 2: -c copy (last resort). Only reached if re-encode failed; on a
  // cleanly-decoded input this is fine, but we keep it strictly behind re-encode.
  // NOTE: vertical 无法 -c copy（copy 不能套 crop/scale 滤镜）→ 直接跳过，落到 v51
  // 下载+cut（cutLocalFile 的 re-encode 分支会应用竖屏滤镜）。
  if (!cutSuccess && !vertical) {
    try {
      const args: string[] = ['-y'];
      args.push('-ss', String(startTime));
      args.push('-rw_timeout', '30000000', '-reconnect', '1', '-reconnect_at_eof', '1',
                 '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
      args.push('-headers', httpHeaders);
      args.push('-i', muxedStreamEndpoint.toString());
      args.push('-t', String(duration));
      args.push('-c', 'copy');
      args.push('-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', outputPath);

      console.log(`[cut-clip] v59 attempt 2 (-c copy + -ss): ${args.length} args`);
      await execFileAsync(ffmpegPath, args, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 120_000,
        env: { ...process.env, LANG: 'C' },
      });
      cutSuccess = true;
      console.log('[cut-clip] v59 -c copy (fallback) succeeded');
    } catch (execErr2: any) {
      const stderr2 = String(execErr2?.stderr || '');
      lastError = `reencode+copy: ${lastError} || copy: ${execErr2?.message?.slice(0, 150)} | STDERR: ${stderr2.slice(-800)}`;
      console.warn(`[cut-clip] v59 -c copy failed: ${lastError.slice(0, 300)}`);
    }
  }

  if (!cutSuccess) {
    console.warn(`[cut-clip] v58 both attempts failed, will fall back to v51 path`);
    return null;
  }

  const outStat = await stat(outputPath).catch(() => null);
  if (!outStat) {
    console.warn('[cut-clip] v58 output stat failed, will fall back to v51 path');
    return null;
  }
  if (outStat.size < 5_000) {
    console.warn(`[cut-clip] v58 output too small: ${outStat.size} bytes`);
    return null;
  }

  // Validate output is a real MP4 (ftyp box at offset 4) — read only 8 header
  // bytes (metadata), not the whole file, to avoid loading it all into memory.
  const header = await readFileHead(outputPath, 8);
  if (header.length >= 8) {
    const boxType = String.fromCharCode(
      header[4], header[5], header[6], header[7],
    );
    if (boxType !== 'ftyp') {
      console.warn(`[cut-clip] v58 output missing ftyp header (got: ${boxType})`);
      return null;
    }
  }

  // v58: ALWAYS verify audio stream is present (single muxed input should
  // always have audio, but check anyway as a safety net).
  const probeOk = await verifyAudioVideoSync(ffmpegPath, outputPath);
  if (!probeOk) {
    console.warn(`[cut-clip] v58 audio stream missing, falling back to v51 path`);
    return null;
  }

  console.log(`[cut-clip] v58 success: ${outStat.size} bytes (streamed)`);

  return streamMp4Response(outputPath, outStat.size, request);
}

/**
 * v56: Quick probe to verify the output MP4 has an audio stream.
 * Uses ffmpeg -i (header-only, ~100ms) since ffmpeg-static doesn't bundle ffprobe.
 * Returns true if audio stream is present, false otherwise.
 *
 * Note: this checks audio EXISTS, not that it's perfectly in sync. The -ss fix
 * applied to both inputs in cutFromStreamUrl() handles sync. This probe is a
 * safety net to catch cases where audio merge silently failed.
 */
async function verifyAudioVideoSync(ffmpegPath: string, outputPath: string): Promise<boolean> {
  try {
    // ffmpeg -i without output spec exits with code 1, but writes stream
    // info (including audio stream presence) to stderr — fast header probe.
    await execFileAsync(ffmpegPath, ['-i', outputPath], {
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    });
    return true; // unreachable: ffmpeg -i always exits 1 without output
  } catch (err: any) {
    const stderr = String(err.stderr || '');
    const hasAudio = /Stream #\d+:\d+.*Audio:/.test(stderr);
    if (!hasAudio) {
      console.warn(`[cut-clip] v57 sync check: no audio stream in output`);
    } else {
      console.log(`[cut-clip] v57 sync check: audio stream present ✓`);
    }
    return hasAudio;
  }
}

/**
 * Download a stream (video or audio) via the CF Worker /stream proxy.
 * Returns Buffer on success, null on failure.
 *
 * For video (audio=false): uses /stream?streamUrl=<url>&muxed=1
 * For audio (audio=true):  uses /stream?audioUrl=<url>&audio=1
 *   — The CF Worker's fast path checks audioUrl param when wantAudio=true,
 *     so we MUST pass audioUrl as a query param (not just streamUrl).
 */
async function downloadStreamViaCfWorker(
  cfWorkerUrl: string,
  videoId: string,
  streamUrl: string,
  userAgent: string,
  visitorData: string,
  audio: boolean,
  audioUrl: string | null,
): Promise<Buffer | null> {
  const proxyUrl = new URL(cfWorkerUrl.replace(/\/$/, '') + '/stream');
  proxyUrl.searchParams.set('videoId', videoId);
  // v58: Always use maxHeight=360 for muxed streams to ensure itag 18
  // (360p combined video+audio) is returned. 720p muxed (itag 22) is rarely
  // available from YouTube, so 360p is the most reliable muxed format.
  proxyUrl.searchParams.set('maxHeight', '360');
  if (audio) {
    proxyUrl.searchParams.set('audio', '1');
    if (audioUrl) proxyUrl.searchParams.set('audioUrl', audioUrl);
    // For audio-only requests, the streamUrl param is not required —
    // doFetch() in worker.js uses audioUrl when wantAudio=true.
  } else {
    proxyUrl.searchParams.set('muxed', '1');
    // v59: Pass streamUrl to enable the fast path. The frontend's streamUrl
    // comes from /resolve?muxed=1 (itag 18, 360p with integrated audio),
    // so the fast path produces a correct video+audio download. Without
    // streamUrl, /stream re-resolves from InnerTube API which TIMES OUT.
    if (streamUrl) proxyUrl.searchParams.set('streamUrl', streamUrl);
  }
  if (userAgent) proxyUrl.searchParams.set('userAgent', userAgent);
  if (visitorData) proxyUrl.searchParams.set('visitorData', visitorData);

  console.log(`[cut-clip] Downloading ${audio ? 'audio' : 'video (muxed 360p, CF Worker resolves)'} via CF Worker /stream...`);

  // First HEAD to get content-length
  const headRes = await fetch(proxyUrl.toString(), {
    method: 'HEAD',
    signal: AbortSignal.timeout(15_000),
  }).catch((err) => {
    console.warn(`[cut-clip] HEAD (${audio ? 'audio' : 'video'}) failed:`, err instanceof Error ? err.message : err);
    return null;
  });

  let contentLength = 0;
  if (headRes && headRes.ok) {
    contentLength = parseInt(headRes.headers.get('content-length') || '0', 10);
  }

  // If HEAD failed or returned no content-length, fall back to a GET with Range 0-1
  if (!contentLength) {
    const probeRes = await fetch(proxyUrl.toString(), {
      headers: { Range: 'bytes=0-1' },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (probeRes) {
      const cr = probeRes.headers.get('content-range') || '';
      const match = cr.match(/\/(\d+)/);
      if (match) contentLength = parseInt(match[1], 10);
    }
  }

  if (!contentLength || contentLength < 5_000) {
    console.warn(`[cut-clip] Cannot determine ${audio ? 'audio' : 'video'} content length (HEAD returned ${contentLength}).`);
    return null;
  }

  console.log(`[cut-clip] ${audio ? 'Audio' : 'Video'} Content-Length: ${contentLength} bytes`);

  // Cap downloads to keep Vercel function under 60s.
  //   Video: 80MB (360p muxed ~470KB/s covers ~170s of video)
  //   Audio: 5MB  (audio streams are tiny, ~30KB/s)
  const maxDownloadBytes = Math.min(contentLength, audio ? 5 * 1024 * 1024 : 80 * 1024 * 1024);

  // Download in 2MB chunks (googlevideo.com per-request limit on CF Worker)
  const chunks: Buffer[] = [];
  let downloaded = 0;
  const MAX_CHUNK = 2 * 1024 * 1024;
  const totalChunks = Math.ceil(maxDownloadBytes / MAX_CHUNK);

  console.log(`[cut-clip] Will download ${totalChunks} chunks (${(maxDownloadBytes / 1024 / 1024).toFixed(1)}MB) for ${audio ? 'audio' : 'video'}`);

  for (let i = 0; i < totalChunks; i++) {
    const chunkStart = i * MAX_CHUNK;
    const chunkEnd = Math.min(chunkStart + MAX_CHUNK - 1, maxDownloadBytes - 1);

    const chunkRes = await fetch(proxyUrl.toString(), {
      headers: { Range: `bytes=${chunkStart}-${chunkEnd}` },
      signal: AbortSignal.timeout(30_000),
    });

    if (!chunkRes.ok && chunkRes.status !== 206) {
      console.warn(`[cut-clip] ${audio ? 'Audio' : 'Video'} chunk ${i + 1}/${totalChunks} failed: HTTP ${chunkRes.status}`);
      if (i === 0) return null;
      break;
    }

    const chunkBuf = Buffer.from(await chunkRes.arrayBuffer());
    if (chunkBuf.length === 0) {
      console.log(`[cut-clip] ${audio ? 'Audio' : 'Video'} chunk ${i + 1}: empty (end of file)`);
      break;
    }

    // Validate first chunk has ftyp header (skip for audio — may not start with ftyp)
    if (i === 0 && chunkBuf.length >= 8 && !audio) {
      const boxType = chunkBuf.slice(4, 8).toString('ascii');
      if (boxType !== 'ftyp') {
        console.warn(`[cut-clip] First video chunk missing ftyp header (got: "${boxType}"). Stream may be invalid.`);
        return null;
      }
      console.log(`[cut-clip] Video chunk 1: ftyp header OK`);
    }

    chunks.push(chunkBuf);
    downloaded += chunkBuf.length;

    // Short read = end of file
    if (chunkBuf.length < (chunkEnd - chunkStart + 1)) break;

    if (i % 10 === 0 || i === totalChunks - 1) {
      console.log(`[cut-clip] ${audio ? 'Audio' : 'Video'} chunk ${i + 1}/${totalChunks}: downloaded ${downloaded} bytes (${Math.round(downloaded / 1024 / 1024)}MB)`);
    }
  }

  if (downloaded < (audio ? 5_000 : 50_000)) {
    console.warn(`[cut-clip] ${audio ? 'Audio' : 'Video'} downloaded too little: ${downloaded} bytes`);
    return null;
  }

  return Buffer.concat(chunks);
}

/**
 * Cut a clip from a local MP4 file using ffmpeg.
 *
 * When audioPath is null: single-input `-i video -c copy` (muxed stream).
 * When audioPath is provided: dual-input `-i video -i audio -c:v copy -c:a aac`
 *   (merges video-only stream with separate audio stream).
 *
 * Tries -c copy first (fast remux); falls back to re-encode if that fails.
 */
async function cutLocalFile(
  inputPath: string,
  outputPath: string,
  startTime: number,
  duration: number,
  audioPath: string | null,
  exportVf?: string | null,
  watermarkPng?: string | null,
  subtitlePath?: string | null,
  subtitleStyle?: SubtitleStyle,
  vertical?: boolean,
  /** AI 粗剪清理（Starter+）：保留区间；null/undefined = 不做粗剪 */
  jumpCutSegments?: KeepSegment[] | null,
  /** 原始请求：成功出口据此消费「一次性免费导出额度」 */
  request?: NextRequest,
): Promise<NextResponse> {
  const ffmpegPath = await findFfmpegBinary();
  if (!ffmpegPath) {
    return NextResponse.json({ error: 'ffmpeg binary not found' }, { status: 500 });
  }

  console.log(`[cut-clip] ffmpeg=${ffmpegPath}, startTime=${startTime}s, duration=${duration}s, audioPath=${audioPath ? '(set)' : '(none)'}`);

  let cutSuccess = false;
  let lastError = '';
  // 诊断用：把本次实际交给 ffmpeg 的竖屏滤镜图原样回带到错误信息里，
  // 便于区分「服务端函数输出的图」与「ffmpeg 实际收到的图」是否一致。
  let verticalGraphEcho: string | null = null;

  // P0: 免费水印必须 re-encode（-c copy 无法叠加 overlay）。同理只要有滤镜要套
// （水印 / 分辨率 cap / 9:16 竖屏 / AI 粗剪）就跳过 copy 快速路径，强制 re-encode。
if (watermarkPng || exportVf || vertical || jumpCutSegments) {
    console.warn('[cut-clip] filter/watermark requested → skip -c copy fast path, force re-encode');
  } else {
    // Attempt 1: -c copy (fast remux) — single or dual input
  try {
    const args: string[] = ['-y', '-ss', String(startTime)];
    if (audioPath) {
      // v56: Dual-input — apply -ss to BOTH inputs so audio stays in sync.
      // v55 bug: -ss only applied to first input → audio started from 0s,
      // video from startTime → audio offset in output, perceived as "no sound".
      args.push('-i', inputPath);
      args.push('-ss', String(startTime));
      args.push('-i', audioPath, '-t', String(duration));
      // audioPath is .m4a (AAC, itag 139/140) → copy without re-encode
      args.push('-c:v', 'copy', '-c:a', 'copy');
      args.push('-map', '0:v:0', '-map', '1:a:0'); // explicitly select video + audio
    } else {
      // Single input: muxed stream (already has audio)
      args.push('-i', inputPath, '-t', String(duration));
      args.push('-c', 'copy');
    }
    args.push('-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', outputPath);

    await execFileAsync(ffmpegPath, args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30_000,
      env: { ...process.env, LANG: 'C' },
    });
    cutSuccess = true;
  } catch (execErr: any) {
    const stderr = String(execErr?.stderr || '');
    lastError = `copy: ${execErr?.message?.slice(0, 150)} | STDERR: ${stderr.slice(-800)}`;
    console.warn(`[cut-clip] -c copy failed, trying re-encode: ${lastError.slice(0, 200)}`);
  }
  }

  // Attempt 2: re-encode (fallback, slower but handles edge cases)
  if (!cutSuccess) {
    try {
      const args: string[] = ['-y', '-ss', String(startTime)];
      // AI 粗剪：把保留区间先拼成连贯的 [vjc]/[ajc]，后续滤镜一律挂到 [vjc] 上。
      // 输入已由 `-ss startTime`（在 -i 之前）seek 到 clip 起点，故 trim 用 clip 相对时间。
      const jc = jumpCutSegments && jumpCutSegments.length > 0 ? buildJumpCutGraph(jumpCutSegments) : null;
      const jcVLabel = jc ? jc.vLabel : '[0:v]';
      const audioMap = jc ? jc.aLabel : '0:a?';
      // P0 水印仅支持单输入（muxed）分支，避免改动双输入音频路径
      const wmArg = !audioPath && watermarkPng ? buildWatermarkArgs(exportVf ?? null, watermarkPng, jcVLabel) : null;
      if (audioPath) {
        // v56: seek audio input to startTime too (see attempt 1 comment)
        args.push('-i', inputPath);
        args.push('-ss', String(startTime));
        args.push('-i', audioPath, '-t', String(duration));
        args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28');
        args.push('-c:a', 'aac', '-b:a', '128k');
        args.push('-map', '0:v:0', '-map', '1:a:0');
      } else {
        args.push('-i', inputPath);
        if (wmArg) args.push(...wmArg.extraInputs); // 第二输入：水印 PNG（loop）
        args.push('-t', String(duration));
        args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28');
        args.push('-c:a', 'aac', '-b:a', '128k');
      }
      // P0: 按 plan 注入分辨率 cap + 水印（仅单输入分支叠加 overlay）。
      // AI 字幕（Starter+）：追加 subtitles 滤镜烧录 ASS 到视频（\, 转义 force_style 逗号，
      // fontsdir 直扫字体目录，serverless 无 fontconfig）。force_style 由 subtitleStyle 生成。
      const fontsDir = join(process.cwd(), 'public', 'fonts');
      const subFilter = subtitlePath
        ? `subtitles=${subtitlePath.replace(/\\/g, '/')}:fontsdir=${fontsDir}:force_style=${subtitleFilterForceStyle(subtitleStyle ?? DEFAULT_SUBTITLE_STYLE, false).replace(/,/g, '\\,')}`
        : null;
      // 9:16 竖屏：P0 智能追焦优先（裁切窗跟随人物水平移动），不可信时回落
      // blur-fit 复合滤镜（含 split → 必须 filter_complex）；双输入分支不走竖屏。
      let verticalGraph: string | null = null;
      if (vertical && !audioPath) {
        const rp = await resolveReframePath(
          ffmpegPath,
          { source: inputPath },
          { startTime, duration },
          true,
        );
        // 与 AI 粗剪组合时，裁切路径必须重映射到剪后时间轴，否则整体错位。
        const path = rp && jumpCutSegments && jumpCutSegments.length > 0
          ? remapReframePath(rp, jumpCutSegments)
          : rp;
        verticalGraph = path
          ? buildReframeComplex(path, subFilter, jcVLabel)
          : buildVerticalComplex(subFilter, jcVLabel);
      }
      verticalGraphEcho = verticalGraph;
      const finalVf = verticalGraph
        ? null
        : (subFilter ? `${exportVf ?? ''}${exportVf ? ',' : ''}${subFilter}` : exportVf);

      // 组装 filter_complex：粗剪前置链（若有）永远在最前。
      const graphParts: string[] = [];
      if (jc) graphParts.push(jc.videoChain, jc.audioChain);

      if (wmArg) {
        graphParts.push(wmArg.filterComplex);
        args.push('-filter_complex', graphParts.join(';'), '-map', '[out]', '-map', audioMap);
      } else if (verticalGraph) {
        graphParts.push(verticalGraph);
        args.push('-filter_complex', graphParts.join(';'), '-map', '[vout]', '-map', audioMap);
      } else if (finalVf) {
        if (jc) {
          // 有粗剪前置链时无法用 -vf（多链路图）→ 把 finalVf 显式挂到 [vjc] 之后。
          graphParts.push(`${jcVLabel}${finalVf}[vout]`);
          args.push('-filter_complex', graphParts.join(';'), '-map', '[vout]', '-map', audioMap);
        } else {
          args.push('-vf', finalVf);
        }
      } else if (jc) {
        // 纯粗剪（无其他滤镜）：直接输出拼接结果。
        args.push('-filter_complex', graphParts.join(';'), '-map', jcVLabel, '-map', audioMap);
      }
      args.push('-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', outputPath);

      await execFileAsync(ffmpegPath, args, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 45_000,
        env: { ...process.env, LANG: 'C' },
      });
      cutSuccess = true;
      console.log('[cut-clip] Re-encode fallback succeeded');
    } catch (execErr2: any) {
      const stderr2 = String(execErr2?.stderr || '');
      lastError = `copy+reencode: ${lastError} || reencode: ${execErr2?.message?.slice(0, 150)} | GRAPH: ${verticalGraphEcho ?? '(none)'} | STDERR: ${stderr2.slice(-800)}`;
    }
  }

  if (!cutSuccess) {
    return NextResponse.json(
      { error: `ffmpeg both attempts failed: ${lastError.slice(-1500)}` },
      { status: 500 },
    );
  }

  const outStat = await stat(outputPath);
  if (outStat.size < 5_000) {
    return NextResponse.json(
      { error: `Output file too small: ${outStat.size} bytes` },
      { status: 500 },
    );
  }

  console.log(`[cut-clip] Success: ${outStat.size} bytes (streamed)`);

  return streamMp4Response(outputPath, outStat.size, request);
}

/**
 * Find ffmpeg binary path using the same multi-level fallback as video-clipper.ts.
 * Prefers ffmpeg-static (newer build with modern TLS support) over @ffmpeg-installer.
 */
async function findFfmpegBinary(): Promise<string> {
  // 1. ffmpeg-static binary (newer build with modern TLS support)
  try {
    const ffmpegStatic: string = require('ffmpeg-static');
    if (ffmpegStatic) {
      await access(ffmpegStatic, fsConstants.X_OK);
      return ffmpegStatic;
    }
  } catch { /* fall through */ }

  // 2. @ffmpeg-installer/ffmpeg bundled binary
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer?.path) {
      await access(installer.path, fsConstants.X_OK);
      return installer.path;
    }
  } catch { /* fall through */ }

  // 3. System PATH ffmpeg (works on local dev, not Vercel)
  try {
    const { stdout } = await execFileAsync('which', ['ffmpeg']);
    const sysPath = stdout.trim();
    if (sysPath) {
      await access(sysPath, fsConstants.X_OK);
      return sysPath;
    }
  } catch { /* fall through */ }

  return '';
}

/**
 * Stream an MP4 from disk via a Web ReadableStream instead of loading the whole
 * file into memory. This avoids OOM in serverless envs where the ffmpeg output
 * could otherwise be read as one giant Buffer (successful but killed before the
 * response is sent, producing the "500 empty body" signature).
 *
 * Cleanup: the returned stream unlinks the temp file on `close` (then upload is
 * consumed / aborted). The outer POST `finally` also keeps a silent unlink as a
 * safe backstop — on POSIX an already-open fd keeps reading even after unlink.
 */
async function streamMp4Response(filePath: string, size: number, request?: NextRequest): Promise<NextResponse> {
  const rs = createReadStream(filePath);
  rs.on('close', () => {
    unlink(filePath).catch(() => {});
  });
  const webStream = Readable.toWeb(rs) as unknown as BodyInit;
  // 成功出口：若本次请求命中「一次性免费导出额度」，在此消费落库（失败仅告警，不阻断返回）。
  if (request) await commitFreeExport(request);
  return new NextResponse(webStream as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="clip.mp4"',
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
    },
  });
}

/** Read only the first `len` bytes of a file (metadata/payload header check). */
function readFileHead(filePath: string, len: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const rs = createReadStream(filePath, { start: 0, end: len - 1 });
    rs.on('data', (chunk) => chunks.push(chunk as Buffer));
    rs.on('end', () => resolve(Buffer.concat(chunks)));
    rs.on('error', reject);
  });
}
