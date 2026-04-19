'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
  view_count?: number;
  is_published?: boolean;
}

// Demo posts storage key (same as admin/page.tsx)
const DEMO_POSTS_KEY = 'vidshorter_demo_posts';

/* ── SEO/GEO Article Seeds ─────────────────────────────────────────────── */
const SEO_SEED_KEY = 'vidshorter_seo_seeded_v2';

const seoPosts: BlogPost[] = [
  {
    id: 'seo-1',
    title: 'How to Turn Long YouTube Videos into Viral Short Clips with AI',
    category: 'AI Technology',
    content: `<h1>How to Turn Long YouTube Videos into Viral Short Clips with AI</h1>
<p>In the age of TikTok, Instagram Reels, and YouTube Shorts, <strong>short-form video content</strong> has become the dominant format for reaching audiences online. Yet most creators still record long-form content — interviews, tutorials, vlogs, and live streams. The challenge? Manually clipping hours of footage into compelling 60-second highlights is time-consuming and inconsistent.</p>
<p>That's where <strong>VidShorter AI</strong> comes in. Our AI-powered platform analyzes your long videos and automatically identifies the most engaging moments, then exports them as polished short clips — ready to upload.</p>
<h2>Why Short-Form Video Dominates in 2025</h2>
<p>Studies show that <strong>73% of consumers</strong> prefer short-form video when learning about a product or service. Platforms like YouTube Shorts, TikTok, and Instagram Reels each have over 1 billion monthly active users. Creators who repurpose long content into shorts see up to <strong>300% more reach</strong> compared to long-form posts alone.</p>
<h2>How VidShorter AI Works</h2>
<ol>
  <li><strong>Paste your video URL</strong> — supports YouTube, Bilibili, and direct video files (MP4, MOV)</li>
  <li><strong>AI analyzes content</strong> — our model scans transcript, audio peaks, and visual activity to find high-engagement segments</li>
  <li><strong>Get 6–10 highlight clips</strong> — each 45–65 seconds, perfectly trimmed with high-quality encoding (CRF 18)</li>
  <li><strong>Download and publish</strong> — one-click download or share directly to your social channels</li>
</ol>
<h2>Key Features</h2>
<ul>
  <li>✅ Supports <strong>YouTube</strong> and <strong>Bilibili</strong> — the two largest video platforms worldwide</li>
  <li>✅ <strong>AI-powered highlight detection</strong> using multi-modal analysis (visual + audio + text)</li>
  <li>✅ <strong>High-quality output</strong> — 1080p video with 192kbps audio</li>
  <li>✅ <strong>Automatic thumbnail generation</strong> for each clip</li>
  <li>✅ <strong>60-second average clip length</strong> — optimized for maximum engagement</li>
</ul>
<h2>Best Practices for Viral Short Clips</h2>
<p>Even with AI assistance, applying these principles will maximize your clip performance:</p>
<ul>
  <li><strong>Hook within 3 seconds</strong> — viewers decide whether to keep watching almost instantly</li>
  <li><strong>Add captions</strong> — 85% of social video is watched without sound</li>
  <li><strong>End with a call-to-action</strong> — drive viewers to your full video or channel</li>
  <li><strong>Post consistently</strong> — platforms reward regular uploaders with algorithmic boosts</li>
</ul>
<h2>Start for Free Today</h2>
<p>VidShorter AI offers a <strong>free tier with 300 credits</strong> — enough to process several videos and see the results for yourself. No credit card required.</p>
<p><a href="/register">Create your free account →</a></p>`,
    cover_image: 'https://picsum.photos/800/400?random=10',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    view_count: 312,
    is_published: true,
  },
  {
    id: 'seo-2',
    title: 'VidShorter AI vs Manual Editing: Why AI Wins Every Time',
    category: 'Product Updates',
    content: `<h1>VidShorter AI vs Manual Editing: Why AI Wins Every Time</h1>
<p>Video editors spend an average of <strong>4–8 hours</strong> cutting a single hour of footage into usable short clips. With VidShorter AI, that same process takes under <strong>5 minutes</strong>. Here's a head-to-head comparison.</p>
<h2>Time Investment</h2>
<table>
  <tr><th>Task</th><th>Manual Editing</th><th>VidShorter AI</th></tr>
  <tr><td>Watch source video</td><td>60+ minutes</td><td>0 minutes</td></tr>
  <tr><td>Identify highlights</td><td>30–60 minutes</td><td>~30 seconds (AI)</td></tr>
  <tr><td>Export clips</td><td>15–30 minutes</td><td>2–4 minutes</td></tr>
  <tr><td><strong>Total</strong></td><td><strong>2–3 hours</strong></td><td><strong>~5 minutes</strong></td></tr>
</table>
<h2>Quality Comparison</h2>
<p>AI doesn't get tired. Every clip processed by VidShorter AI is encoded at the same high quality — <strong>CRF 18 (near-lossless)</strong>, with optimized audio at 192kbps. Manual exports often suffer from inconsistent settings or rushed decisions.</p>
<h2>Scalability</h2>
<p>One human editor can process perhaps 2–3 videos per day. VidShorter AI can process <strong>dozens simultaneously</strong> — ideal for agencies, media companies, and high-volume content creators.</p>
<h2>The Verdict</h2>
<p>For routine highlight extraction from structured content (interviews, tutorials, lectures, podcasts), AI wins on speed, consistency, and cost. Manual editing remains valuable for highly creative, narrative-driven projects where human judgment adds unique value.</p>
<p>Use both: let AI handle the volume work, and reserve human editing for your hero content.</p>
<p><a href="/pricing">View pricing plans →</a></p>`,
    cover_image: 'https://picsum.photos/800/400?random=11',
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    view_count: 228,
    is_published: true,
  },
  {
    id: 'seo-3',
    title: 'Best AI Video Clipping Tools in 2025: Complete Comparison',
    category: 'Tips & Tricks',
    content: `<h1>Best AI Video Clipping Tools in 2025: Complete Comparison</h1>
<p>The AI video editing market has exploded in 2025. From simple clip extractors to full production suites, there are now dozens of options. We've reviewed the top tools and compared them on the features that matter most to content creators.</p>
<h2>What to Look For in an AI Clipping Tool</h2>
<ul>
  <li><strong>Clip quality</strong> — bitrate, resolution, and encoding settings</li>
  <li><strong>Platform support</strong> — which video sources does it handle?</li>
  <li><strong>Clip count per video</strong> — more clips = more content to choose from</li>
  <li><strong>Speed</strong> — how long does processing take?</li>
  <li><strong>Pricing</strong> — per-clip, subscription, or credits?</li>
</ul>
<h2>VidShorter AI Highlights</h2>
<p>VidShorter AI stands out for its <strong>multi-platform support</strong> (YouTube + Bilibili), <strong>high clip count</strong> (6–10 per video), and <strong>professional-grade encoding</strong>. It's particularly strong for educational content, interviews, and tech tutorials where key moments are clearly defined.</p>
<h2>Tips for Getting the Best Results</h2>
<ol>
  <li><strong>Use structured content</strong> — AI performs best with clear chapters, distinct speakers, or well-defined topics</li>
  <li><strong>Check thumbnail quality</strong> — VidShorter generates thumbnails at 25% into each clip for maximum visual interest</li>
  <li><strong>Review all clips</strong> — even AI makes selection choices; reviewing all 6–10 clips lets you pick the best 2–3 to publish</li>
  <li><strong>Add platform-specific edits</strong> — after AI extraction, add captions or music in a lightweight editor like CapCut</li>
</ol>
<h2>Free Trial Available</h2>
<p>Every new VidShorter AI account gets <strong>300 free credits</strong> — no credit card required. Try it on your next long-form video and see the results in minutes.</p>
<p><a href="/">Try VidShorter AI free →</a></p>`,
    cover_image: 'https://picsum.photos/800/400?random=12',
    created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    view_count: 445,
    is_published: true,
  },
  {
    id: 'seo-4',
    title: '如何用AI将B站长视频自动剪辑成高光片段',
    category: 'Tips & Tricks',
    content: `<h1>如何用AI将B站长视频自动剪辑成高光片段</h1>
<p>在短视频时代，B站创作者面临一个共同挑战：如何将数小时的长视频内容快速转化为适合发布到各平台的短视频高光片段？VidShorter AI 提供了完美的解决方案。</p>
<h2>为什么需要AI剪辑？</h2>
<p>传统手动剪辑的痛点：</p>
<ul>
  <li>耗时：剪辑1小时视频通常需要2-4小时</li>
  <li>主观性强：不同编辑对"精彩时刻"的判断各不相同</li>
  <li>效率低：高重复性工作消耗大量创意精力</li>
</ul>
<p>VidShorter AI 通过多模态分析（视觉+音频+文字转录），自动识别视频中的高潮、转折、知识点等精彩片段，并输出6-10条高质量短视频。</p>
<h2>操作步骤</h2>
<ol>
  <li><strong>复制B站视频链接</strong> — 支持 bilibili.com 和 b23.tv 短链</li>
  <li><strong>粘贴到VidShorter AI输入框</strong> — 点击"开始分析"</li>
  <li><strong>AI自动处理</strong> — 提取帧、分析内容、识别高光时刻，全程约3-5分钟</li>
  <li><strong>下载高光片段</strong> — 每条约60秒，1080p高清输出，自动生成封面图</li>
</ol>
<h2>适合哪类内容？</h2>
<p>VidShorter AI 最适合以下类型的B站视频：</p>
<ul>
  <li>📚 知识科普类（技术讲解、历史科普）</li>
  <li>🎮 游戏实况（精彩操作、高能时刻）</li>
  <li>🎤 访谈对话（金句提取、观点碰撞）</li>
  <li>📡 直播录像（精彩片段二次传播）</li>
</ul>
<h2>免费开始使用</h2>
<p>注册即获得 <strong>300免费积分</strong>，无需绑定银行卡。立即体验AI视频剪辑的魔力！</p>
<p><a href="/register">免费注册 →</a></p>`,
    cover_image: 'https://picsum.photos/800/400?random=13',
    created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
    view_count: 567,
    is_published: true,
  },
  {
    id: 'seo-5',
    title: 'Understanding AI Video Analysis: How VidShorter Finds Your Best Moments',
    category: 'AI Technology',
    content: `<h1>Understanding AI Video Analysis: How VidShorter Finds Your Best Moments</h1>
<p>What makes a video moment "engaging"? That's the core question our AI team set out to answer when building VidShorter. Here's a technical deep-dive into how our system works.</p>
<h2>The Multi-Modal Analysis Pipeline</h2>
<p>VidShorter doesn't rely on a single signal — it combines multiple data sources to build a comprehensive engagement map of your video.</p>
<h3>1. Frame Analysis</h3>
<p>We extract keyframes at regular intervals and analyze them for visual complexity, motion, and scene changes. High visual activity often correlates with engaging content — demonstrations, on-screen graphics, or dynamic action sequences.</p>
<h3>2. Audio Analysis</h3>
<p>Speech rate, volume variation, and emotional tone in audio are strong predictors of engagement. A presenter who speeds up and raises their voice is likely making an important point. Laughter, applause, or dramatic pauses are also flagged as high-engagement markers.</p>
<h3>3. Transcript Analysis</h3>
<p>When a transcript is available, our NLP model identifies:</p>
<ul>
  <li>Topic transitions and chapter boundaries</li>
  <li>Key statements and definitions</li>
  <li>Questions and answers (Q&A sessions)</li>
  <li>Emotional language and emphasis markers</li>
</ul>
<h2>Engagement Scoring</h2>
<p>Each segment receives a composite engagement score from 0.0 to 1.0. We then select the top-scoring non-overlapping segments, targeting <strong>6–10 clips of 45–65 seconds each</strong> — the sweet spot for social media consumption.</p>
<h2>Continuous Improvement</h2>
<p>Our models are continuously refined based on aggregated (anonymized) engagement data. As more creators use VidShorter and we see which clips perform well on social platforms, the AI gets smarter.</p>
<p>The result: clips that don't just look good — they <strong>perform</strong>.</p>`,
    cover_image: 'https://picsum.photos/800/400?random=14',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    view_count: 189,
    is_published: true,
  },
  {
    id: 'seo-6',
    title: '2025年内容创作者必备的10个AI工具',
    category: 'Tips & Tricks',
    content: `<h1>2025年内容创作者必备的10个AI工具</h1>
<p>AI工具正在彻底改变内容创作的工作流程。作为创作者，善用这些工具可以将工作效率提升10倍。以下是2025年最值得使用的10个AI工具。</p>
<h2>视频创作类</h2>
<h3>1. VidShorter AI — 视频高光剪辑</h3>
<p>自动将长视频剪辑成6-10条高光短视频，支持YouTube和B站，适合所有类型的内容创作者。</p>
<h3>2. CapCut — 短视频编辑</h3>
<p>抖音母公司出品，AI自动字幕、背景移除、特效添加，免费且功能强大。</p>
<h3>3. Runway — AI视频生成</h3>
<p>文字生成视频、视频风格迁移，电影级AI创作工具。</p>
<h2>文字创作类</h2>
<h3>4. Claude — AI写作助手</h3>
<p>长文档处理能力强，适合撰写深度文章、分析报告、创意写作。</p>
<h3>5. Notion AI — 知识管理+写作</h3>
<p>在知识库中直接调用AI，总结、改写、翻译一气呵成。</p>
<h2>图像创作类</h2>
<h3>6. Midjourney — AI绘画</h3>
<p>商业插画、社交媒体配图、品牌视觉，质量业界最高。</p>
<h3>7. Adobe Firefly — 专业图像编辑</h3>
<p>与Photoshop深度集成，生成填充、背景替换、局部改写。</p>
<h2>效率工具类</h2>
<h3>8. Floatboat AOE — AI工作环境</h3>
<p>将所有AI工具整合到一个工作区，消灭AI应用之间的上下文碎片问题。</p>
<h3>9. Descript — 播客&视频转录编辑</h3>
<p>像编辑文档一样编辑视频，AI转录、去除口癖、自动视频剪辑。</p>
<h3>10. ElevenLabs — AI配音</h3>
<p>超真实语音克隆和配音，支持中文，适合视频旁白和有声内容。</p>
<h2>总结</h2>
<p>这10个工具的组合，可以让单人创作者完成一个小团队的工作量。其中，<strong>VidShorter AI</strong> 是视频内容再利用效率最高的工具之一——将一条长视频变成10条短视频，触达更多受众，是2025年内容增长的核心策略。</p>
<p><a href="/">立即体验VidShorter AI →</a></p>`,
    cover_image: 'https://picsum.photos/800/400?random=15',
    created_at: new Date(Date.now() - 12 * 86400000).toISOString(),
    view_count: 892,
    is_published: true,
  },
];

/* ── Seed SEO articles to localStorage if not already done ── */
function seedSeoArticles() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(SEO_SEED_KEY)) return; // already seeded
  const existing: BlogPost[] = JSON.parse(localStorage.getItem(DEMO_POSTS_KEY) || '[]');
  // Only add seed posts that don't already exist
  const existingIds = new Set(existing.map(p => p.id));
  const toAdd = seoPosts.filter(p => !existingIds.has(p.id));
  if (toAdd.length > 0) {
    localStorage.setItem(DEMO_POSTS_KEY, JSON.stringify([...existing, ...toAdd]));
  }
  localStorage.setItem(SEO_SEED_KEY, '1');
}

/* ── Read posts from localStorage (demo mode) ── */
function getLocalPosts(): BlogPost[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(DEMO_POSTS_KEY);
  return stored ? JSON.parse(stored) : [];
}

export default function BlogPage() {
  const { t } = useLocale();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    // Always seed SEO articles first (idempotent)
    seedSeoArticles();

    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      // Read from localStorage (includes admin-created + SEO seed)
      const localPosts = getLocalPosts().filter(p => p.is_published !== false);
      setPosts(localPosts);
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
      // If Supabase has data, show Supabase + merge local
      if (data && data.length > 0) {
        setPosts(data);
      } else {
        // Supabase empty – fall back to local
        const localPosts = getLocalPosts().filter(p => p.is_published !== false);
        setPosts(localPosts);
      }
    } catch (error) {
      console.warn('Blog posts fetch error, using local posts');
      const localPosts = getLocalPosts().filter(p => p.is_published !== false);
      setPosts(localPosts);
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
                        {post.view_count && post.view_count > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {post.view_count} views
                          </span>
                        )}
                      </div>
                      <h2 className="text-2xl font-bold mb-3">{post.title}</h2>
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
