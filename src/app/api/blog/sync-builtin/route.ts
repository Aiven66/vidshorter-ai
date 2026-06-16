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

export async function POST(req: NextRequest) {
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

    const { data: existingPosts, error: fetchError } = await client
      .from('blogs')
      .select('id');

    if (fetchError) throw fetchError;
    const existingIds = new Set((existingPosts || []).map(row => row.id as string));

    const allBuiltInPosts: any[] = [];
    const locales: Locale[] = ['en', 'zh', 'zh-Hant'];
    
    for (const locale of locales) {
      const posts = getBuiltInBlogPosts(locale);
      allBuiltInPosts.push(...posts.map(p => ({ ...p, originalLocale: locale })));
    }

    const newPosts = allBuiltInPosts.filter(post => !existingIds.has(post.id));
    
    if (newPosts.length === 0) {
      return NextResponse.json({ 
        message: 'All built-in posts are already in database',
        totalBuiltIn: allBuiltInPosts.length,
        alreadyExists: existingIds.size 
      });
    }

    const rows = newPosts.map(post => ({
      id: post.id,
      title: post.title,
      category: post.category,
      content: post.content,
      cover_image: post.cover_image || post.coverImage,
      author_id: authorId,
      is_published: true,
      view_count: post.view_count || post.views || 0,
      created_at: post.created_at || post.publishedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client
      .from('blogs')
      .insert(rows);

    if (error) throw error;

    return NextResponse.json({
      message: `Successfully synced ${newPosts.length} posts to database`,
      synced: newPosts.length,
      totalBuiltIn: allBuiltInPosts.length,
      posts: newPosts.map(p => ({ id: p.id, title: p.title, locale: p.locale })),
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync built-in posts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}