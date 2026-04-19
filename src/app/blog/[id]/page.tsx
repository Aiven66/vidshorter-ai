'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/locale-context';
import { Calendar, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

interface BlogPost {
  id: string;
  title: string;
  category: string;
  content: string;
  cover_image: string | null;
  created_at: string;
  view_count: number;
}

// Demo posts storage key (same as admin/page.tsx and blog/page.tsx)
const DEMO_POSTS_KEY = 'vidshorter_demo_posts';

function getLocalPost(id: string): BlogPost | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(DEMO_POSTS_KEY);
  if (!stored) return null;
  const posts: BlogPost[] = JSON.parse(stored);
  return posts.find(p => p.id === id) || null;
}

export default function BlogDetailPage() {
  const { t } = useLocale();
  const params = useParams();
  const router = useRouter();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPost();
  }, [params.id]);

  async function fetchPost() {
    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      // Read from localStorage (admin + SEO seeded posts)
      const localPost = getLocalPost(params.id as string);
      setPost(localPost || null);
      setLoading(false);
      return;
    }

    try {
      const { getSupabaseClient } = await import('@/storage/database/supabase-client');
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('blogs')
        .select('*')
        .eq('id', params.id)
        .eq('is_published', true)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setPost(data);
        // Increment view count
        try {
          await client
            .from('blogs')
            .update({ view_count: (data.view_count || 0) + 1 })
            .eq('id', data.id);
        } catch {
          // Ignore view count update errors
        }
      }
    } catch (error) {
      // Network error - try localStorage posts
      console.warn('Post fetch error, checking local posts');
      const localPost = getLocalPost(params.id as string);
      setPost(localPost || null);
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Post not found</h1>
        <Button asChild>
          <Link href="/blog">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Blog
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <article className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto">
          {/* Back button */}
          <Button variant="ghost" className="mb-8" asChild>
            <Link href="/blog">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Blog
            </Link>
          </Button>

          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <Badge variant="secondary">{post.category}</Badge>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(post.created_at)}
              </span>
            </div>
            <h1 className="text-4xl font-bold mb-4">{post.title}</h1>
          </header>

          {/* Cover image */}
          {post.cover_image && (
            <div className="mb-8 rounded-lg overflow-hidden">
              <img
                src={post.cover_image}
                alt={post.title}
                className="w-full h-auto"
              />
            </div>
          )}

          {/* Content */}
          <Card>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none p-8">
              <div dangerouslySetInnerHTML={{ __html: post.content }} />
            </CardContent>
          </Card>

          {/* Related posts section could go here */}
        </div>
      </article>
    </div>
  );
}
