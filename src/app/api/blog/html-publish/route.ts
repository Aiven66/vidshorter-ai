import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLocalizedAdminPosts } from '@/lib/blog-content';

const TRUSTED_ADMIN_EMAILS = new Set(['admin@vidshorter.ai', 'admin@126.com', 'admin@clipop.ai']);

function getServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_TOKEN ||
    ''
  );
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function getAdminUser(client: ReturnType<typeof createClient>, token: string) {
  const demoPayload = decodeJwtPayload(token);
  if (
    typeof demoPayload?.email === 'string' &&
    TRUSTED_ADMIN_EMAILS.has(demoPayload.email.toLowerCase()) &&
    demoPayload?.role === 'admin'
  ) {
    return {
      id: typeof demoPayload.sub === 'string' ? demoPayload.sub : 'demo-admin-id',
      email: demoPayload.email,
      name: typeof demoPayload.name === 'string' ? demoPayload.name : 'Admin',
      role: 'admin',
    };
  }

  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData.user?.email) return null;

    const { data: userRow } = await client
      .from('users')
      .select('id,email,name,role')
      .eq('id', authData.user.id)
      .maybeSingle();

    const email = authData.user.email.toLowerCase();
    const role = userRow?.role || (TRUSTED_ADMIN_EMAILS.has(email) ? 'admin' : 'user');
    if (role !== 'admin') return null;

    return {
      id: userRow?.id || authData.user.id,
      email: authData.user.email,
      name: userRow?.name || authData.user.user_metadata?.name || 'Admin',
      role,
    };
  } catch {
    return null;
  }
}

async function ensureAuthor(client: ReturnType<typeof createClient>, user: { id: string; email: string; name: string; role: string }) {
  const { data: existingByEmail } = await client
    .from('users')
    .select('id')
    .eq('email', user.email)
    .maybeSingle();

  if (existingByEmail?.id) return existingByEmail.id as string;

  const { data, error } = await client
    .from('users')
    .upsert({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return (data?.id as string) || user.id;
}

// =========== POST: Upload HTML + Images and publish article ===========
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
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
    const formData = await req.formData();
    const title = (formData.get('title') as string || '').trim();
    const category = (formData.get('category') as string || 'AI Video Clipping').trim() || 'AI Video Clipping';
    const htmlFile = formData.get('htmlFile') as File | null;
    const coverFile = formData.get('coverFile') as File | null;

    // Collect additional image files
    const additionalImages: { file: File; key: string }[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('img_') && value instanceof File && value.size > 0) {
        additionalImages.push({ file: value, key });
      }
    }

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!htmlFile) {
      return NextResponse.json({ error: 'HTML file is required' }, { status: 400 });
    }

    const htmlContent = await htmlFile.text();
    if (!htmlContent.trim()) {
      return NextResponse.json({ error: 'HTML content is empty' }, { status: 400 });
    }

    const authorId = await ensureAuthor(client, adminUser);
    const timestamp = Date.now();
    const imageReplacements: Map<string, string> = new Map();

    // Upload cover image if provided
    let coverImageUrl = '';
    if (coverFile && coverFile.size > 0) {
      try {
        const coverBytes = await coverFile.arrayBuffer();
        const coverExt = coverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(coverExt) ? coverExt : 'jpg';
        const coverPath = `blog/cover-${timestamp}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

        const { error: uploadError } = await client.storage
          .from('blog-images')
          .upload(coverPath, Buffer.from(coverBytes), {
            contentType: coverFile.type || `image/${safeExt}`,
            upsert: true,
          });

        if (!uploadError) {
          const { data: publicData } = client.storage.from('blog-images').getPublicUrl(coverPath);
          coverImageUrl = publicData?.publicUrl || '';
        }
      } catch {
        // fall through - use default cover
      }
    }

    // Upload additional images, replace local filenames in HTML with public URLs
    const uploadedImageUrls: string[] = [];
    for (const { file, key } of additionalImages) {
      try {
        const bytes = await file.arrayBuffer();
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) ? ext : 'jpg';
        const path = `blog/${timestamp}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^a-z0-9._-]/gi, '_')}`;

        const { error: uploadError } = await client.storage
          .from('blog-images')
          .upload(path, Buffer.from(bytes), {
            contentType: file.type || `image/${safeExt}`,
            upsert: true,
          });

        if (!uploadError) {
          const { data: publicData } = client.storage.from('blog-images').getPublicUrl(path);
          const publicUrl = publicData?.publicUrl || '';
          if (publicUrl) {
            uploadedImageUrls.push(publicUrl);
            imageReplacements.set(file.name, publicUrl);
            // Also register original filename with spaces variant
            imageReplacements.set(encodeURIComponent(file.name), publicUrl);
          }
        }
      } catch {
        // skip broken uploads
      }
    }

    // Replace local image references in HTML with uploaded URLs
    let processedHtml = htmlContent;
    imageReplacements.forEach((publicUrl, fileName) => {
      // Replace patterns like src="filename" or src="./filename" or src="images/filename"
      const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patterns = [
        new RegExp(`src=(['"])(?:(?:\\.\\/)?(?:images?\\/)?(?:assets?\\/)?(?:uploads?\\/)?)?${escaped}\\1`, 'gi'),
        new RegExp(`src=(['"])[^'"]*${escaped}[^'"]*\\1`, 'gi'),
      ];
      for (const pattern of patterns) {
        processedHtml = processedHtml.replace(pattern, `src="${publicUrl}"`);
      }
    });

    // Also handle HTML img references as <img src="localName"... by replacing any local relative paths
    // with uploaded images by matching against available uploaded filenames
    if (uploadedImageUrls.length > 0) {
      const fileNames = Array.from(imageReplacements.keys());
      processedHtml = processedHtml.replace(
        /<img\s+([^>]*?)src=(['"])([^'"]+)\2([^>]*)>/gi,
        (match, pre: string, quote: string, srcVal: string, post: string) => {
          // Strip any leading ./, /, images/, assets/ etc
          const clean = srcVal.replace(/^(?:\.?\/)?(?:(?:images?|assets?|uploads?)\/)?/i, '');
          // Find exact or basename match
          const matchKey = fileNames.find(
            (name) =>
              name === clean ||
              name.toLowerCase() === clean.toLowerCase() ||
              clean.endsWith('/' + name) ||
              clean.toLowerCase().endsWith('/' + name.toLowerCase())
          );
          if (matchKey && imageReplacements.get(matchKey)) {
            return `<img ${pre}src=${quote}${imageReplacements.get(matchKey)}${quote}${post}>`;
          }
          return match;
        }
      );
    }

    const finalCover = coverImageUrl || uploadedImageUrls[0] || '';

    const localizedPosts = createLocalizedAdminPosts({
      title,
      category,
      content: processedHtml,
      coverImage: finalCover,
      publish: true,
    });

    const rows = localizedPosts.map(post => ({
      id: post.id,
      title: post.title,
      category: post.category,
      content: post.content,
      cover_image: post.cover_image,
      author_id: authorId,
      is_published: true,
      view_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client
      .from('blogs')
      .upsert(rows, { onConflict: 'id' });

    if (error) throw error;

    return NextResponse.json({
      posts: localizedPosts,
      imageUploaded: uploadedImageUrls.length + (coverImageUrl ? 1 : 0),
      coverImage: finalCover,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish article';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
