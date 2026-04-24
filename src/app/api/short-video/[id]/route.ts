import { NextRequest } from 'next/server';
import { readFile, unlink } from 'fs/promises';
import videoClipper from '@/lib/server/video-clipper';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearerToken) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = params;
  if (!id) return new Response('Not found', { status: 404 });

  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  const client = getSupabaseClient(bearerToken);
  const { data: { user } } = await client.auth.getUser();
  if (!user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: profile } = await client
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = profile?.role === 'admin';

  const baseQuery = client
    .from('short_videos')
    .select('id, user_id, start_time, end_time, highlight_title, videos(original_url, source_type)')
    .eq('id', id);

  const { data: clipRow } = isAdmin
    ? await baseQuery.maybeSingle()
    : await baseQuery.eq('user_id', user.id).maybeSingle();

  if (!clipRow || !clipRow.videos?.original_url) {
    return new Response('Not found', { status: 404 });
  }

  const originalUrl = clipRow.videos.original_url as string;
  const title = (clipRow.highlight_title as string) || 'Clip';
  const startTime = Number(clipRow.start_time ?? 0);
  const endTime = Number(clipRow.end_time ?? 0);

  const source = await videoClipper.downloadSourceVideo(originalUrl);
  const result = await videoClipper.createLocalClip({
    inputPath: source.inputPath,
    inputHeaders: source.ffmpegHeaders,
    startTime,
    endTime,
    title,
  });

  if (result.dataUrl?.startsWith('data:video/mp4;base64,')) {
    const base64 = result.dataUrl.slice('data:video/mp4;base64,'.length);
    const buf = Buffer.from(base64, 'base64');
    return new Response(buf, {
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'private, max-age=0, no-cache',
      },
    });
  }

  try {
    const buf = await readFile(result.outputPath);
    unlink(result.outputPath).catch(() => {});
    return new Response(buf, {
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'private, max-age=0, no-cache',
      },
    });
  } catch {
    return new Response('Failed to generate clip', { status: 500 });
  }
}
