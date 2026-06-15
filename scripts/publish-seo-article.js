// SEO Article Publisher for Clipop AI
// Usage: node scripts/publish-seo-article.js
// This script directly publishes a blog article to the Supabase database
// using the same logic as the admin POST /api/blog/posts route

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLocalizedAdminPosts, generateCoverImageUrl } from '../src/lib/blog-content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_TOKEN ||
    process.env.COZE_SUPABASE_SERVICE_ROLE ||
    ''
  );
}

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
}

// ===== Article content (English) =====
const SEO_TITLE = "How to Turn Long YouTube Videos into Viral Short Clips with AI";
const SEO_CATEGORY = "YouTube Shorts";
const SEO_CONTENT = `<p>Long-form YouTube videos are an incredible content asset. A single 30-minute interview, webinar, or tutorial already contains enough material to fuel weeks of short-form posting — if you can find the right moments. The problem is that manual clipping is slow, inconsistent, and expensive. In this guide, we break down a practical workflow for turning long YouTube videos into short clips that actually perform.</p>
<h2>Why repurposing long video is the highest-leverage content play</h2>
<p>Every piece of long-form content you publish already contains the hooks, stories, and lessons your audience cares about. The challenge is not creating more — it is surfacing what is already there. A 60-minute podcast, product demo, or expert interview typically contains 10 to 20 moments that could stand alone as short-form clips. Repurposing is not about cutting corners. It is about making the value in your existing content visible to more people, in the places they already spend time.</p>
<h2>How AI identifies moments worth clipping</h2>
<p>Modern video analysis tools look at multiple signals together: audio energy, speech emphasis, topic transitions, pauses before punchlines, and even visual changes in the frame. These signals are combined to score segments of the video. The top-scoring segments become candidate clips. The key insight is that what makes a clip travel is not simply volume or excitement — it is the presence of a clear, self-contained idea that works without the surrounding context. A good clip should feel like a complete thought, not a random cut.</p>
<h2>A practical step-by-step workflow</h2>
<p><strong>Step 1 — Prepare your source video.</strong> Use the original YouTube link or a local video file. Higher-quality source material produces better clips, so always work from the best file you have.</p>
<p><strong>Step 2 — Run highlight detection.</strong> The tool analyzes the video and produces a list of candidate segments. Each segment includes a start time, end time, and a brief description of what happens in that moment.</p>
<p><strong>Step 3 — Select the moments you want.</strong> Look for segments with a clear hook in the first three seconds. Short-form platforms reward fast starts. If the clip does not grab attention immediately, it will not perform — even if the content itself is excellent.</p>
<p><strong>Step 4 — Export and publish.</strong> Export the selected clips. Most creators publish across YouTube Shorts, TikTok, Instagram Reels, and Chinese platforms like Xiaohongshu and Douyin. Add captions to match the platform tone, and use the hook as the opening line of your description.</p>
<h2>The 3-second rule for short-form</h2>
<p>The single most common mistake creators make when repurposing is choosing the wrong starting point. A clip that begins mid-sentence or opens with generic filler will stop scrolling. The opening three seconds must contain something the viewer wants to see — a surprising statement, a before-and-after, a clear question, or a confident take. If you cannot identify the hook in those first seconds, the clip is not ready to publish.</p>
<h2>What makes a clip shareable</h2>
<p>Not every segment is equally shareable. The best clips usually fit one of these patterns: a clear before-and-after, a short story with an unexpected ending, a counterintuitive tip, a strong opinion, or a quick how-to. These patterns work because they give the viewer a reason to watch until the end and a reason to share. A clip that is just "interesting content" will not travel. A clip that delivers a specific, actionable result — or a strong emotional response — will.</p>
<h2>How many clips per video</h2>
<p>As a rough guide, expect 8 to 15 usable clips per hour of high-quality content. The exact number depends on how dense the source material is. A tightly edited interview will produce more clips than a casual conversation. Rather than forcing a fixed number, focus on quality: take only the segments where the clip works as a standalone piece without needing the full video for context.</p>
<h2>Text overlays are not decoration</h2>
<p>Short videos are often watched without sound. Subtitles and text overlays are not decoration — they are the primary way viewers follow what is happening. A well-titled clip with clear text overlays will dramatically outperform the same clip without them. Make sure your titles and on-screen text are large enough to read on a phone and appear early enough to catch the scrolling viewer.</p>
<h2>Measuring what actually works</h2>
<p>Track two numbers per clip: watch-through rate and share rate. Watch-through tells you if the opening three seconds are doing their job. Share rate tells you if the content resonates strongly enough to be passed along. Over time, you will see which formats perform best for your audience. Use that signal to decide what kind of clips to extract from your next long video.</p>
<h2>Start without overthinking</h2>
<p>The biggest barrier to repurposing is not technical — it is deciding to start. Pick one video you have already published. Run it through a clipping tool. Select three to five segments. Publish them across the platforms where your audience lives. Treat this first attempt as a learning exercise. The data from those initial clips will teach you more than any theoretical guide ever could.</p>`;

async function publish() {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('Set environment variables before running this script.');
    process.exit(1);
  }

  console.log('📝 Publishing SEO Article...');
  console.log(`Title: ${SEO_TITLE}`);
  console.log(`Category: ${SEO_CATEGORY}`);

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create admin author entry
  const adminUser = {
    id: 'demo-admin-id',
    email: 'admin@126.com',
    name: 'Admin',
    role: 'admin',
  };

  try {
    const { data: existingByEmail } = await client
      .from('users')
      .select('id')
      .eq('email', adminUser.email)
      .maybeSingle();

    let authorId;
    if (existingByEmail?.id) {
      authorId = existingByEmail.id;
    } else {
      const { data, error } = await client
        .from('users')
        .upsert({
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
        .select('id')
        .maybeSingle();

      if (error) throw error;
      authorId = (data?.id as string) || adminUser.id;
    }

    console.log(`✓ Author ID: ${authorId}`);

    const coverImage = generateCoverImageUrl(SEO_TITLE, SEO_CATEGORY, 1);
    console.log(`✓ Cover image generated`);

    const localizedPosts = createLocalizedAdminPosts({
      title: SEO_TITLE,
      category: SEO_CATEGORY,
      content: SEO_CONTENT,
      coverImage,
      publish: true,
    });

    console.log(`✓ Created ${localizedPosts.length} localized versions`);

    const rows = localizedPosts.map(post => ({
      id: post.id,
      title: post.title,
      category: post.category,
      content: post.content,
      cover_image: post.cover_image,
      author_id: authorId,
      is_published: post.is_published !== false,
      view_count: post.view_count || 0,
      created_at: post.created_at,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client
      .from('blogs')
      .upsert(rows, { onConflict: 'id' });

    if (error) throw error;

    console.log('\n✅ SUCCESS! Article published to database.');
    console.log(`📊 Stats: ${localizedPosts.length} language versions`);
    console.log('🌐 View in admin: Management → Blog Management');
    console.log('🔗 View on site: Blog page');
  } catch (err) {
    console.error('\n❌ Failed to publish:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

publish();
