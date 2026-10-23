/**
 * GEO / SEO 内容真源。
 *
 * 这里集中维护「机器可读 + 可被引用」的品牌事实、产品规格与 FAQ。
 * llms.txt、/ai/summary.json、/ai/faq.json、首页 FAQ 与 /faq 页共用同一份数据，
 * 避免站内表述不一致（GEO 报告里 S 维度满分，回退风险主要来自术语漂移）。
 *
 * 注意：所有数字必须与 src/lib/plan-credits.ts、src/lib/server/video-clipper.ts
 * 以及 /pricing 页面保持一致。修改定价/额度时请同步更新此处。
 */

export const BRAND = {
  name: 'Clipop AI',
  url: 'https://www.clipopai.com',
  tagline: 'Turn long videos into viral vertical shorts',
  description:
    'Clipop AI is an AI video clipping platform that turns long videos, podcasts and articles into vertical short clips with automatic highlight detection, subject reframing and multilingual captions.',
  category: 'AI video clipping software',
  audience: [
    'content creators',
    'podcasters and interview hosts',
    'MCN teams and social media managers',
    'educators and course creators',
    'e-commerce brands and product marketers',
  ],
  supportEmail: 'support@clipop.ai',
  privacyEmail: 'aiven666666@gmail.com',
  abuseEmail: 'abuse@clipop.ai',
  sameAs: [
    'https://x.com/Aiven66',
    'https://www.youtube.com/channel/UCtw5ImAi8jpawfXcMJmXr1A',
    'https://www.instagram.com/clipopai/',
    'https://podcastai.clipopai.com/',
  ],
} as const;

export type FaqItem = { question: string; answer: string };

/** 首页与 FAQ 页共用的核心问答（英文 SSR 正文，供搜索引擎与 AI 抽取）。 */
export const CORE_FAQS: FaqItem[] = [
  {
    question: 'What is Clipop AI?',
    answer:
      'Clipop AI is an AI video clipping platform that analyzes long videos and exports short vertical clips. It detects highlight moments, reframes the subject to 9:16, burns in captions and produces MP4 files ready for YouTube Shorts, TikTok and Instagram Reels.',
  },
  {
    question: 'Which video sources can I use?',
    answer:
      'You can paste a public YouTube or Bilibili link, or upload a local video file in MP4, MOV or AVI format. If a source platform blocks server access, upload the file or use the Clipop desktop app.',
  },
  {
    question: 'How long are the generated clips?',
    answer:
      'Clip length adapts to the source video. Short sources produce clips around 20–45 seconds, 8–20 minute sources around 35–60 seconds, and longer sources target about 60 seconds with a 65-second cap. Shorts Studio targets shorter vertical clips.',
  },
  {
    question: 'What output do I get?',
    answer:
      'Each clip is rendered as a 9:16 vertical MP4 with burned-in AI captions. Free exports are 720p with a watermark, Starter exports are 1080p without a watermark, and Pro exports support up to 4K.',
  },
  {
    question: 'How do credits and pricing work?',
    answer:
      'One clip costs 60 credits. New free accounts get 180 credits on signup (3 clips); after that the Free plan grants 60 credits per day, capped at 600 credits per month. Starter is $9.9 per month with 6,000 credits per month, and Pro is $19.9 per month with 20,000 credits per month. Free credits reset daily; paid credits reset monthly at 00:00 UTC and do not roll over.',
  },
  {
    question: 'Do I need to install software?',
    answer:
      'The web app runs in a browser with no installation. Optional desktop apps for macOS and Windows add local processing and are recommended when YouTube access from the cloud is unstable. The local engine can run speech recognition and highlight detection on your own machine.',
  },
  {
    question: 'Which languages are supported?',
    answer:
      'The Clipop AI interface is available in 32 languages, and the platform supports multilingual captions. Caption availability depends on the source audio and the caption language you select.',
  },
  {
    question: 'Can I use the clips commercially?',
    answer:
      'You must own the source video or have permission from the rights holder. Clipop AI is a processing tool and does not grant rights to third-party content. Clips you are authorized to create can be published on social platforms, subject to the Terms of Service.',
  },
  {
    question: 'What happens to my uploaded videos?',
    answer:
      'Source files are processed to generate clips and are not kept longer than necessary. Generated clips, transcripts and account records are stored so you can preview and download them. The Privacy Policy describes retention, deletion and your data rights.',
  },
  {
    question: 'How do I contact Clipop AI?',
    answer:
      'Email support@clipop.ai for product and billing questions, aiven666666@gmail.com for privacy or data requests, and abuse@clipop.ai for content violations. The contact page lists what to include in your message.',
  },
];

/** /faq 页额外展开的产品问题（在核心问答之外）。 */
export const EXTENDED_FAQS: FaqItem[] = [
  ...CORE_FAQS,
  {
    question: 'Is there a free plan?',
    answer:
      'Yes. The Free plan gives you 180 credits at signup (3 clips), then 60 credits per day up to 600 per month, with 720p exports and a watermark. You can start without paying.',
  },
  {
    question: 'What is the difference between Highlight Clips, Shorts Studio and AI Video Maker?',
    answer:
      'Highlight Clips extracts highlights from a long video you provide. Shorts Studio focuses on 9:16 vertical shorts from a long video link. AI Video Maker generates a vertical video from a text topic using templates, narration and visuals.',
  },
  {
    question: 'Does Clipop AI support batch processing?',
    answer:
      'Starter includes a batch queue for up to 10 videos per run. Pro adds 20,000 monthly credits, 4K exports and Recap Studio for AI narrated films.',
  },
  {
    question: 'Is there a desktop version?',
    answer:
      'Yes. macOS and Windows desktop apps are available from the download page. The desktop app can run local transcription and highlight detection and is useful when cloud access to YouTube is rate-limited.',
  },
  {
    question: 'Does Clipop AI work with podcasts and articles?',
    answer:
      'Yes. The AI Podcast workflow turns podcast audio or video into clips and narrated content, Article to Video converts articles or news into short videos, and YouTube Video Summarizer produces transcripts, summaries and notes from long videos.',
  },
];

export const PRODUCT_SPECS: Array<{ label: string; value: string }> = [
  { label: 'Video sources', value: 'YouTube and Bilibili links, public video links, local MP4 / MOV / AVI uploads' },
  { label: 'Clip length', value: 'About 20–65 seconds, adapted to the source length; Shorts Studio targets shorter vertical clips' },
  { label: 'Aspect ratio', value: '9:16 vertical with automatic subject reframing' },
  { label: 'Captions', value: 'AI-generated captions burned into the video; multilingual captions supported' },
  { label: 'Export quality', value: 'Free 720p with watermark · Starter 1080p without watermark · Pro up to 4K' },
  { label: 'Credits', value: '60 credits per clip · Free 180 on signup, then 60/day (600/month cap) · Starter 6,000/month · Pro 20,000/month' },
  { label: 'Platforms', value: 'Web app, macOS desktop app, Windows desktop app, Android app' },
  { label: 'Interface languages', value: '32 languages' },
];

export const WORKFLOW_STEPS: Array<{ name: string; text: string }> = [
  {
    name: 'Add a video source',
    text: 'Paste a YouTube or Bilibili link, or upload a local video file in MP4, MOV or AVI format.',
  },
  {
    name: 'Let AI detect highlights',
    text: 'Clipop AI scores hooks, topic shifts, emotion and motion to select the strongest moments in the source video.',
  },
  {
    name: 'Reframe and caption',
    text: 'Selected moments are reframed to 9:16, captions are generated and burned in, and the clip is rendered as an MP4.',
  },
  {
    name: 'Review and export',
    text: 'Preview each clip in the browser, then download individual clips or a ZIP package for batch publishing.',
  },
];

/**
 * 统一构造 FAQPage JSON-LD。
 * 只传当前页面上真实可见的问答，避免结构化数据与正文不一致。
 */
export function buildFaqJsonLd(faqs: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

/** 统一构造 BreadcrumbList JSON-LD。path 以 / 开头；空字符串表示首页。 */
export function buildBreadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.path ? `${BRAND.url}${item.path}` : BRAND.url,
    })),
  };
}

/** 机器可读品牌摘要（/ai/summary.json 与 llms.txt 共用）。 */
export function buildAiSummary() {
  return {
    name: BRAND.name,
    url: BRAND.url,
    tagline: BRAND.tagline,
    description: BRAND.description,
    category: BRAND.category,
    audience: [...BRAND.audience],
    capabilities: [
      'AI highlight detection for long videos',
      'Automatic 9:16 subject reframing',
      'AI captions and multilingual captions',
      'Vertical short export to MP4',
      'YouTube Video Summarizer with transcripts, summaries and notes',
      'AI Podcast clip generation',
      'Text-to-video AI Video Maker',
      'Digital human talking-head video generation',
      'Batch queue and ZIP export',
    ],
    inputs: {
      links: ['YouTube', 'Bilibili', 'public video links'],
      files: ['MP4', 'MOV', 'AVI'],
    },
    output: {
      aspectRatio: '9:16',
      format: 'MP4 with burned-in captions',
      clipLength: 'about 20–65 seconds, adapted to source length',
      quality: '720p free, 1080p Starter, up to 4K Pro',
    },
    pricing: {
      currency: 'USD',
      creditCostPerClip: 60,
      free: { price: 0, period: 'month', dailyCredits: 60 },
      starter: { price: 9.9, period: 'month', monthlyCredits: 6000 },
      pro: { price: 19.9, period: 'month', monthlyCredits: 20000 },
      creditPacks: [
        { credits: 120, price: 2.99 },
        { credits: 300, price: 6.99 },
        { credits: 900, price: 16.99 },
      ],
      pricingPage: `${BRAND.url}/pricing`,
    },
    platforms: ['Web', 'macOS', 'Windows', 'Android'],
    languages: 32,
    trust: {
      about: `${BRAND.url}/about`,
      contact: `${BRAND.url}/contact`,
      faq: `${BRAND.url}/faq`,
      terms: `${BRAND.url}/terms`,
      privacy: `${BRAND.url}/privacy`,
    },
    contact: {
      support: BRAND.supportEmail,
      privacy: BRAND.privacyEmail,
      abuse: BRAND.abuseEmail,
    },
    sameAs: [...BRAND.sameAs],
    updated: '2026-10-22',
  };
}

/** 核心页面清单（llms.txt 与 AI 摘要共用，保持链接与描述一致）。 */
export const CORE_PAGES: Array<{ path: string; title: string; description: string }> = [
  { path: '/', title: 'Home', description: 'AI video clipper: turn long videos into vertical shorts.' },
  { path: '/video-clips', title: 'Highlight Clips', description: 'Extract highlight clips from YouTube, Bilibili or local videos.' },
  { path: '/shorts', title: 'Shorts Studio', description: 'Generate 9:16 YouTube Shorts from a long video link.' },
  { path: '/ai-video', title: 'AI Video Maker', description: 'Generate a vertical video from a text topic with templates and narration.' },
  { path: '/video-notes', title: 'YouTube Video Summarizer', description: 'Transcript, summary, notes and translation for long videos.' },
  { path: '/podcast', title: 'AI Podcast', description: 'Turn podcasts into clips and narrated content.' },
  { path: '/ai-tools', title: 'AI Toolbox', description: 'Watermark removal, upscaling, colorization and smart edits.' },
  { path: '/tiktok-remix', title: 'TikTok Remix', description: 'Analyze and remix TikTok videos into original short content.' },
  { path: '/digital-human-live', title: 'Digital Human Selling', description: 'Talking-head product videos with digital humans.' },
  { path: '/article-to-video', title: 'Article to Video', description: 'Convert articles into short vertical videos.' },
  { path: '/news-video', title: 'News Video', description: 'Convert news content into short videos.' },
  { path: '/download', title: 'Download', description: 'Download the macOS and Windows desktop apps.' },
  { path: '/pricing', title: 'Pricing', description: 'Free, Starter and Pro plans with credits and export quality.' },
  { path: '/blog', title: 'Blog', description: 'Guides and tutorials on AI video clipping.' },
  { path: '/faq', title: 'FAQ', description: 'Answers about sources, output, credits, privacy and support.' },
  { path: '/about', title: 'About', description: 'Company, product facts and the AI models Clipop AI uses.' },
  { path: '/contact', title: 'Contact', description: 'Support, privacy and abuse contact details.' },
];
