import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { composeCover } from '@/lib/server/video-cover';
import { verifyStarterEligibility } from '@/lib/server/plan-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const execFileAsync = promisify(execFile);

/** 与 cut-clip / remux-mp4 一致：取 ffmpeg-static（新构建，支持现代 TLS）。 */
async function findFfmpegBinary(): Promise<string | null> {
  try {
    const ffmpegStatic: string = require('ffmpeg-static');
    const { existsSync } = await import('fs');
    if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  } catch {}
  try {
    const r = await execFileAsync('which', ['ffmpeg']);
    if (r.stdout.trim()) return r.stdout.trim();
  } catch {}
  return null;
}

export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const videoId = String(body.videoId || '').trim();
  const streamUrl = String(body.streamUrl || '').trim();
  const title = String(body.title || 'Highlight').trim().slice(0, 120);
  const startTime = Number(body.startTime) || 0;
  const orientation: '16:9' | '9:16' = body.orientation === '9:16' ? '9:16' : '16:9';
  const plan = String(body.plan || '');

  if (!videoId || !streamUrl) {
    return NextResponse.json(
      { error: 'Missing videoId or streamUrl. Please re-open/process the video and try again.' },
      { status: 400 },
    );
  }

  // Starter+ 门控
  const elig = await verifyStarterEligibility(request, plan, 'cover');
  if (!elig.ok) {
    return NextResponse.json({ error: elig.reason, detail: 'Keyframe cover generation requires Starter or Pro.' }, { status: 403 });
  }

  const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim().replace(/\/$/, '');
  if (!cfWorkerUrl) {
    return NextResponse.json({ error: 'CF_WORKER_URL not configured' }, { status: 500 });
  }

  const ffmpegPath = await findFfmpegBinary();
  if (!ffmpegPath) {
    return NextResponse.json({ error: 'ffmpeg binary not found' }, { status: 500 });
  }

  // 与 cutFromStreamUrl 一致：muxed=1 + streamUrl fast path，避免 CF colo 重新解析超时
  const muxedEndpoint = new URL(cfWorkerUrl + '/stream');
  muxedEndpoint.searchParams.set('videoId', videoId);
  muxedEndpoint.searchParams.set('maxHeight', '360');
  muxedEndpoint.searchParams.set('muxed', '1');
  muxedEndpoint.searchParams.set('streamUrl', streamUrl);
  if (body.userAgent) muxedEndpoint.searchParams.set('userAgent', String(body.userAgent));
  if (body.visitorData) muxedEndpoint.searchParams.set('visitorData', String(body.visitorData));
  if (body.xClientName != null) muxedEndpoint.searchParams.set('xClientName', String(body.xClientName));
  if (body.clientVersion) muxedEndpoint.searchParams.set('clientVersion', String(body.clientVersion));
  if (body.clientName) muxedEndpoint.searchParams.set('clientName', String(body.clientName));

  const httpHeaders = 'Accept: */*\r\nAccept-Encoding: identity\r\n';

  try {
    // ── 用 ffmpeg 精确抽取 startTime 处的关键帧（-ss 快速 seek + 单帧 PNG 到 stdout）──
    // 输出读进内存 buffer（单帧小，无 OOM 风险），交给 sharp 合成封面。
    const frameArgs = [
      '-ss', String(startTime),
      '-headers', httpHeaders,
      '-i', muxedEndpoint.toString(),
      '-frames:v', '1',
      '-vf', 'scale=trunc(min(1600\\,iw)/2)*2:-2',
      '-f', 'image2pipe',
      '-c:v', 'png',
      '-', // 输出到 stdout
    ];
    const { stdout: frameBuf } = await execFileAsync(ffmpegPath, frameArgs, {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 60_000,
      encoding: 'buffer',
    } as any);

    if (!frameBuf || (frameBuf as Buffer).byteLength < 1000) {
      return NextResponse.json({ error: 'Failed to extract keyframe (stream unavailable or encoder missing)' }, { status: 502 });
    }

    const jpeg = await composeCover({
      frame: frameBuf,
      title,
      orientation,
      startTime,
    });

    // ⚠️ filename 必须是纯 ASCII：HTTP 头不允许非 Latin-1 字节，
    //    若保留 CJK 会触发 "Cannot convert argument to a ByteString"。
    const safeName = title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40) || 'cover';
    return new NextResponse(jpeg, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=300',
        'Content-Length': String(jpeg.byteLength),
        'Content-Disposition': `attachment; filename="${safeName}.jpg"`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[generate-cover] error:', msg.slice(0, 800));
    return NextResponse.json({ error: `Cover generation failed: ${msg.slice(0, 300)}` }, { status: 500 });
  }
}