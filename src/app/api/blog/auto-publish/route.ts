import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBuiltInBlogPosts, normalizeLocale, type Locale } from '@/lib/blog-content';

function getServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_TOKEN ||
    ''
  );
}

async function getAdminAuthorId(client: ReturnType<typeof createClient>) {
  const { data: adminUser } = await client
    .from('users')
    .select('id')
    .eq('email', 'admin@vidshorter.ai')
    .maybeSingle();

  if (adminUser?.id) return adminUser.id as string;

  const { data: created, error } = await client
    .from('users')
    .insert({
      email: 'admin@vidshorter.ai',
      name: 'Clipop Team',
      role: 'admin',
      is_active: true,
    })
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return (created?.id as string) || 'admin-default-id';
}

async function getPublishedPostIds(client: ReturnType<typeof createClient>) {
  const { data, error } = await client
    .from('blogs')
    .select('id');

  if (error) throw error;
  return new Set((data || []).map(row => row.id as string));
}

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const authorId = await getAdminAuthorId(client);
    const publishedIds = await getPublishedPostIds(client);

    const allBuiltInPosts: any[] = [];
    const locales: Locale[] = ['en', 'zh', 'zh-Hant'];
    
    for (const locale of locales) {
      const posts = getBuiltInBlogPosts(locale);
      allBuiltInPosts.push(...posts.map(p => ({ ...p, originalLocale: locale })));
    }

    const unpublishedPosts = allBuiltInPosts.filter(post => !publishedIds.has(post.id));
    
    if (unpublishedPosts.length === 0) {
      return NextResponse.json({ 
        message: 'All built-in posts have been published',
        published: 0,
        totalBuiltIn: allBuiltInPosts.length 
      });
    }

    const shuffled = unpublishedPosts.sort(() => Math.random() - 0.5);
    const toPublish = shuffled.slice(0, Math.min(3, shuffled.length));

    const rows = toPublish.map(post => ({
      id: post.id,
      title: post.title,
      category: post.category,
      content: post.content,
      cover_image: post.cover_image || post.coverImage,
      author_id: authorId,
      is_published: true,
      view_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client
      .from('blogs')
      .insert(rows);

    if (error) throw error;

    return NextResponse.json({
      message: `Successfully published ${toPublish.length} posts`,
      published: toPublish.length,
      posts: toPublish.map(p => ({ id: p.id, title: p.title, locale: p.locale })),
      remaining: unpublishedPosts.length - toPublish.length,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to auto-publish posts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}