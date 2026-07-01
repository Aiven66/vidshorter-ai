import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/**
 * 接收前端浏览器通过 CF Worker /stream 下载并上传的视频片段，
 * 用 ffmpeg 生成真实短视频。
 *
 * 为什么要这个端点？
 * Vercel 的 IP 被 YouTube 限制（colo-mismatch + IP 绑定），无法直接从
 * CF Worker /stream 下载视频。但用户浏览器 IP 不受限，可以成功下载。
 * 所以前端下载视频片段后上传到这里，Vercel 用 ffmpeg 处理。
 *
 * POST multipart/form-data:
 *   - file: 视频片段文件（从 startTime 开始的视频）
 *   - startTime: 原始视频中的开始时间（秒）— 仅用于日志
 *   - endTime: 原始视频中的结束时间（秒）— 仅用于日志
 *   - clipDuration: 期望的片段时长（秒）= endTime - startTime
 *   - title: 片段标题
 *   - summary: 片段摘要
 *
 * 返回 JSON:
 *   - videoUrl: 短视频 data URL
 *   - thumbnailUrl: 缩略图 data URL
 */
export async function POST(request: NextRequest) {
  let tmpInputPath = '';
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const originalStartTime = Number(formData.get('startTime') || '0');
    const originalEndTime = Number(formData.get('endTime') || '60');
    const title = String(formData.get('title') || 'Regenerated Clip');
    const summary = String(formData.get('summary') || '');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // 限制文件大小 50MB（Vercel Pro 请求体限制）
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `File too large: ${file.size} bytes (max ${MAX_FILE_SIZE})`,
      }, { status: 413 });
    }

    console.log(`[regenerate-clip] Received file: ${file.size} bytes, title="${title}", originalRange=[${originalStartTime}-${originalEndTime}]`);

    // 保存上传的文件到 /tmp
    const tmpDir = os.tmpdir();
    const fileName = `uploaded-clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    tmpInputPath = path.join(tmpDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tmpInputPath, buffer);
    console.log(`[regenerate-clip] Saved to ${tmpInputPath} (${buffer.length} bytes)`);

    // 前端下载的是从 0 开始的视频（&begin= 参数只影响播放位置，不影响下载数据）。
    // 所以 ffmpeg 需要 -ss originalStartTime -t (originalEndTime - originalStartTime) 来截取。
    // createLocalClip 的 startTime/endTime 是相对于输入视频的，所以直接传入原始值。
    const videoClipper = (await import('@/lib/server/video-clipper')).default;
    const result = await videoClipper.createLocalClip({
      inputPath: tmpInputPath,
      startTime: originalStartTime,  // 从原始视频的 startTime 位置开始截取
      endTime: originalEndTime,      // 截取到原始视频的 endTime 位置
      title,
    });

    console.log(`[regenerate-clip] createLocalClip result:`, {
      hasOutputPath: !!result.outputPath,
      hasPublicUrl: !!result.publicUrl,
      hasDataUrl: !!result.dataUrl,
      dataUrlLength: result.dataUrl?.length || 0,
      hasThumbnail: !!result.thumbnailUrl,
    });

    // 优先返回 data URL（跨 Lambda 可靠）
    const clipDuration = Math.max(1, originalEndTime - originalStartTime);
    if (result.dataUrl) {
      return NextResponse.json({
        videoUrl: result.dataUrl,
        thumbnailUrl: result.thumbnailUrl || '',
        duration: clipDuration,
        title,
        summary,
      });
    }

    // 回退：读取 outputPath 并转成 data URL
    if (result.outputPath) {
      try {
        const clipBuffer = await readFile(result.outputPath);
        const dataUrl = `data:video/mp4;base64,${clipBuffer.toString('base64')}`;
        return NextResponse.json({
          videoUrl: dataUrl,
          thumbnailUrl: result.thumbnailUrl || '',
          duration: clipDuration,
          title,
          summary,
        });
      } catch (readErr) {
        console.error('[regenerate-clip] Failed to read outputPath:', readErr);
      }
    }

    // 最后回退：返回 publicUrl（可能跨 Lambda 失败，但比没有强）
    if (result.publicUrl) {
      return NextResponse.json({
        videoUrl: result.publicUrl,
        thumbnailUrl: result.thumbnailUrl || '',
        duration: clipDuration,
        title,
        summary,
      });
    }

    return NextResponse.json({ error: 'Failed to generate clip: no output' }, { status: 500 });
  } catch (error) {
    console.error('[regenerate-clip] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
    }, { status: 500 });
  } finally {
    // 清理临时文件
    if (tmpInputPath) {
      try { await unlink(tmpInputPath); } catch {}
    }
  }
}
