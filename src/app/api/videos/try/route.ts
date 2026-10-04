import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import videoClipper from '@/lib/server/video-clipper';
import { produceClip, type Highlight } from '@/lib/server/video-job';
import {
  hashIp,
  isTrialUsed,
  reserveTrial,
  releaseTrial,
  uploadTrialVideo,
  writeTrialAnalysis,
} from '@/lib/server/guest-trial';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * P0-2 免登录试跑。
 *
 * 访客不注册即可提交 YouTube 链接，服务端真跑 **1 条 Top1 高光低清预览**，
 * 其余高光在响应里以「锁定数量」呈现；完整分析结果写入 Storage 私有桶，
 * 注册后带 `trialId` 提交即可继承（跳过 LLM 分析），用户不会白等一次。
 *
 * 访客试跑**不写 `videos` 表**（FK 约束），产物全部落在 Supabase Storage。
 * 每 IP 每 24h 限 1 次（Storage 标记 + 请求内并发闸）。失败不占用名额。
 */

const PREFIX_RE = /^(https?):\/\//i;

/** 请求内并发闸：同一 IP 同时只允许一次试跑（跨实例不保证，Storage 标记兜底）。 */
const inFlight = new Set<string>();

function clientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0]?.trim();
  if (first) return first;
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function dataUrlToBuffer(url: string): Buffer | null {
  const m = /^data:video\/mp4;base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!m || !m[1]) return null;
  return Buffer.from(m[1], 'base64');
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  if (!videoUrl || !PREFIX_RE.test(videoUrl)) {
    return NextResponse.json({ error: 'Please provide a valid http(s) video URL' }, { status: 400 });
  }

  const ipHash = hashIp(clientIp(request));
  if (inFlight.has(ipHash)) {
    return NextResponse.json({ code: 'trial_busy', error: 'A trial is already running for this network.' }, { status: 429 });
  }

  try {
    if (await isTrialUsed(ipHash)) {
      return NextResponse.json({ code: 'trial_used', error: 'Free trial already used today.' }, { status: 429 });
    }
  } catch (e) {
    // 存储不可用：无法保证限流 → fail-closed，引导注册（不消耗任何资源）。
    console.warn('[videos/try] limit check failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ code: 'trial_unavailable', error: 'Free trial is temporarily unavailable.' }, { status: 503 });
  }

  inFlight.add(ipHash);
  let reserved = false;
  try {
    await reserveTrial(ipHash);
    reserved = true;

    // 1) 分析（不含 LLM 复用：访客即首次试跑）。
    let analysis: Awaited<ReturnType<typeof videoClipper.analyzeVideo>>;
    try {
      analysis = await videoClipper.analyzeVideo(videoUrl);
    } catch (e) {
      throw new Error(`Analysis failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
    const highlights = (analysis.highlights as Highlight[]).filter((h) => h && Number.isFinite(h.start_time));
    if (highlights.length === 0) throw new Error('No highlight moments found for this video.');

    // 2) Top1（按精彩度降序；无分数视为 0，保持原序稳定）。
    const ranked = [...highlights].sort((a, b) => (Number(b.engagement_score) || 0) - (Number(a.engagement_score) || 0));
    const top = ranked[0];

    // 3) 渲染 1 条低清预览（复用正式管线的 produceClip；无预解析流，走服务端自解析）。
    const { artifact } = await produceClip(videoUrl, top, {});
    if (!artifact || artifact.linkOnly) {
      throw new Error('Preview generation was blocked by the video source. Please sign up to try the full pipeline.');
    }

    const buf = dataUrlToBuffer(artifact.url);
    if (!buf) {
      // 非 data URL（相对 /api/serve-clip 等）无法跨 Lambda 提供给访客 → 视为失败。
      throw new Error('Preview could not be packaged. Please try again.');
    }
    if (buf.length > 60 * 1024 * 1024) throw new Error('Preview too large.');

    // 4) 上传预览 + 写入分析（供注册后继承）。
    const trialId = randomBytes(12).toString('hex');
    const previewUrl = await uploadTrialVideo(trialId, buf);
    await writeTrialAnalysis(trialId, {
      videoUrl,
      title: analysis.title || 'Video',
      duration: analysis.duration || 0,
      highlights,
      createdAt: new Date().toISOString(),
    });

    const top3 = ranked.slice(0, 3).map((h) => ({
      title: h.title,
      score: Number(h.engagement_score) || 0,
      startTime: h.start_time,
      endTime: h.end_time,
    }));

    return NextResponse.json({
      trialId,
      previewUrl,
      title: analysis.title || 'Video',
      duration: analysis.duration || 0,
      highlights: top3,
      reasonLabel: top.summary || top.title || '',
      totalHighlights: highlights.length,
      lockedCount: Math.max(0, highlights.length - 1),
    });
  } catch (e) {
    // 失败释放名额：用户可重试；成败都不消耗免费额度（访客本无积分）。
    if (reserved) await releaseTrial(ipHash);
    const msg = e instanceof Error ? e.message : 'Trial failed.';
    console.warn('[videos/try] failed:', msg.slice(0, 200));
    return NextResponse.json({ code: 'trial_failed', error: msg }, { status: 502 });
  } finally {
    inFlight.delete(ipHash);
  }
}
