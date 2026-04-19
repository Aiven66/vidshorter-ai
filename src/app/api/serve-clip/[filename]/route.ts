/**
 * /api/serve-clip/[filename]/route.ts
 * Serves generated video clips and thumbnails stored in /tmp/generated-clips/.
 * Needed for serverless environments (Vercel) where public/ is read-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

const CLIP_DIR = '/tmp/generated-clips';

// Allowed extensions for security
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.jpg', '.jpeg', '.png', '.webm']);

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  };
  return mimes[ext] || 'application/octet-stream';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  // Security: only allow safe filenames (no path traversal)
  const safeName = path.basename(filename);
  const ext = path.extname(safeName).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 403 });
  }

  const filePath = path.join(CLIP_DIR, safeName);

  try {
    await access(filePath, fsConstants.R_OK);
  } catch {
    return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  }

  try {
    const stat = statSync(filePath);
    const mimeType = getMimeType(safeName);
    const rangeHeader = request.headers.get('range');

    if (rangeHeader && mimeType.startsWith('video/')) {
      // Support range requests for video seeking
      const fileSize = stat.size;
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const readStream = createReadStream(filePath, { start, end });
      const chunks: Uint8Array[] = [];

      await new Promise<void>((resolve, reject) => {
        readStream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        readStream.on('end', resolve);
        readStream.on('error', reject);
      });

      const body = Buffer.concat(chunks);

      return new Response(body, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Non-range: stream full file
    const readStream = createReadStream(filePath);
    const chunks: Uint8Array[] = [];

    await new Promise<void>((resolve, reject) => {
      readStream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      readStream.on('end', resolve);
      readStream.on('error', reject);
    });

    const body = Buffer.concat(chunks);

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Length': String(stat.size),
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
        'Content-Disposition': `inline; filename="${safeName}"`,
      },
    });
  } catch (err) {
    console.error('Error serving clip:', err);
    return NextResponse.json({ error: 'Failed to serve clip' }, { status: 500 });
  }
}
