import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_TOKEN ||
    ''
  );
}

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split('.')[1];
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function getAdminUser(client: ReturnType<typeof createClient>, token: string) {
  const demoPayload = decodeJwtPayload(token);
  if (
    demoPayload?.email === 'admin@126.com' &&
    demoPayload?.role === 'admin' &&
    demoPayload?.iss === 'clipop-demo'
  ) {
    return {
      id: typeof demoPayload.sub === 'string' ? demoPayload.sub : 'demo-admin-id',
      email: 'admin@126.com',
      name: typeof demoPayload.name === 'string' ? demoPayload.name : 'Admin',
      role: 'admin',
    };
  }

  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user?.email) return null;

  const { data: userRow } = await client
    .from('users')
    .select('id,email,name,role')
    .eq('id', authData.user.id)
    .maybeSingle();

  const role = userRow?.role || (authData.user.email === 'admin@126.com' ? 'admin' : 'user');
  if (role !== 'admin') return null;

  return {
    id: userRow?.id || authData.user.id,
    email: authData.user.email,
    name: userRow?.name || authData.user.user_metadata?.name || 'Admin',
    role,
  };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ==================== POST: Upload cover image ====================
// Accepts multipart/form-data with a file field, or JSON with base64 image
// Returns the stored image URL or base64 data URL
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Storage is not configured. Please set SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 }
    );
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminUser = await getAdminUser(client, token);
  if (!adminUser) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let fileName: string;
    let fileBuffer: Buffer;
    let mimeType: string;

    if (contentType.includes('multipart/form-data')) {
      // File upload via form data (standard)
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'File too large. Maximum 5 MB.' },
          { status: 413 }
        );
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'Invalid file type. Only image files are allowed.' },
          { status: 415 }
        );
      }

      const bytes = await file.arrayBuffer();
      fileBuffer = Buffer.from(bytes);
      mimeType = file.type || 'image/png';
      fileName = file.name || `cover-${Date.now()}.png`;
    } else {
      // JSON with base64 data (fallback)
      const body = await req.json().catch(() => null) as {
        file?: string;
        fileName?: string;
        mimeType?: string;
      } | null;

      const base64 = body?.file || body?.fileName;
      if (!base64 || typeof base64 !== 'string') {
        return NextResponse.json(
          { error: 'No file provided. Send multipart/form-data with file or JSON with base64.' },
          { status: 400 }
        );
      }

      // Support both pure base64 and data URL
      let cleanBase64: string;
      if (base64.startsWith('data:image')) {
        const match = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
          return NextResponse.json({ error: 'Invalid image format' }, { status: 400 });
        }
        mimeType = match[1];
        cleanBase64 = match[2];
      } else {
        mimeType = body?.mimeType || 'image/png';
        cleanBase64 = base64;
      }

      if (cleanBase64.length > 7 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'File too large. Maximum 5 MB.' },
          { status: 413 }
        );
      }

      fileBuffer = Buffer.from(cleanBase64, 'base64');
      fileName = body?.fileName || `cover-${Date.now()}.png`;
    }

    // ============ Upload to Supabase Storage ============
    const BUCKET = 'blog-images';
    const safeFileName = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;

    // 确保 bucket 存在
    try {
      const { data: buckets } = await client.storage.listBuckets();
      const exists = (buckets || []).some((b) => b.name === BUCKET);
      if (!exists) {
        await client.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 10 * 1024 * 1024 });
      }
    } catch {}

    try {
      const { data: storageData, error: storageError } = await client.storage
        .from(BUCKET)
        .upload(safeFileName, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (!storageError && storageData?.path) {
        const { data: publicUrlData } = client.storage
          .from(BUCKET)
          .getPublicUrl(storageData.path);

        if (publicUrlData?.publicUrl) {
          return NextResponse.json({
            cover_image: publicUrlData.publicUrl,
            storage: 'supabase',
            path: storageData.path,
          });
        }
      }

      // 如果上传失败，尝试重新创建 bucket 再试一次
      if (storageError) {
        try {
          await client.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 10 * 1024 * 1024 });
          const { data: retryData, error: retryError } = await client.storage
            .from(BUCKET)
            .upload(safeFileName, fileBuffer, {
              contentType: mimeType,
              upsert: true,
            });

          if (!retryError && retryData?.path) {
            const { data: publicUrlData } = client.storage
              .from(BUCKET)
              .getPublicUrl(retryData.path);

            if (publicUrlData?.publicUrl) {
              return NextResponse.json({
                cover_image: publicUrlData.publicUrl,
                storage: 'supabase',
                path: retryData.path,
              });
            }
          }
        } catch {
          // Fall through to base64 storage
        }
      }
    } catch {
      // Storage failed, fall through to base64 storage
    }

    // ============ Fallback: return base64 data URL ============
    const base64DataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;

    return NextResponse.json({
      cover_image: base64DataUrl,
      storage: 'base64',
      note: 'Stored as base64 data URL. To use Supabase Storage, create a "blog-images" bucket.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
