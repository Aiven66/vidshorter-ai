'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/locale-context';
import { Calendar, ArrowRight, FileText } from 'lucide-react';
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

// Demo posts for when Supabase is not configured
const demoPosts: BlogPost[] = [
  {
    id: 'demo-1',
    title: 'How AI is Revolutionizing Video Content Creation',
    category: 'AI Technology',
    content: '<p>AI-powered video tools are transforming how content creators produce and edit their videos...</p>',
    cover_image: 'https://picsum.photos/800/400?random=1',
    created_at: new Date().toISOString(),
    view_count: 150,
  },
  {
    id: 'demo-2',
    title: '5 Tips for Creating Viral Short Videos',
    category: 'Tips & Tricks',
    content: '<p>Creating viral short videos requires a combination of creativity, timing, and understanding your audience...</p>',
    cover_image: 'https://picsum.photos/800/400?random=2',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    view_count: 230,
  },
  {
    id: 'demo-3',
    title: 'VidShorter AI 2.0: New Features and Improvements',
    category: 'Product Updates',
    content: '<p>We are excited to announce VidShorter AI 2.0 with many new features...</p>',
    cover_image: 'https://picsum.photos/800/400?random=3',
    created_at: new Date(Date.now() - 172800000).toISOString(),
    view_count: 180,
  },
];

export default function BlogPage() {
  const { t } = useLocale();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      // Use demo posts
      setPosts(demoPosts);
      setLoading(false);
      return;
    }

    try {
      const { getSupabaseClient } = await import('@/storage/database/supabase-client');
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('blogs')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setPosts(data && data.length > 0 ? data : demoPosts);
    } catch (error) {
      // Network error - fall back to demo posts silently
      console.warn('Blog posts fetch error, using demo mode');
      setPosts(demoPosts);
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const stripHtml = (html: string) => {
    if (typeof window === 'undefined') return html.replace(/<[^>]*>/g, '');
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">{t('blog.title')}</h1>
          <p className="text-muted-foreground mb-12">
            Latest news, tips, and updates from VidShorter AI
          </p>

          {posts.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('blog.noPosts')}</p>
            </div>
          ) : (
            <div className="grid gap-8">
              {posts.map((post) => (
                <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="md:flex">
                    {post.cover_image && (
                      <div className="md:w-1/3">
                        <img
                          src={post.cover_image}
                          alt={post.title}
                          className="w-full h-48 md:h-full object-cover"
                        />
                      </div>
                    )}
                    <div className={`p-6 ${post.cover_image ? 'md:w-2/3' : 'w-full'}`}>
                      <div className="flex items-center gap-4 mb-3">
                        <Badge variant="secondary">{post.category}</Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(post.created_at)}
                        </span>
                      </div>
                      <h2 className="text-2xl font-bold mb-3">
                      <Link href={`/blog/${post.id}`} className="text-primary hover:text-primary/80 transition-colors">
                        {post.title}
                      </Link>
                    </h2>
                      <p className="text-muted-foreground mb-4 line-clamp-3">
                        {stripHtml(post.content).substring(0, 200)}...
                      </p>
                      <Button variant="link" className="p-0 h-auto" asChild>
                        <Link href={`/blog/${post.id}`} className="flex items-center gap-1">
                          {t('blog.readMore')}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
