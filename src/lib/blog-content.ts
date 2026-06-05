import { Locale, locales } from '@/lib/i18n/index';

export interface BlogPost {
  id: string;
  title: string;
  category: string;
  content: string;
  cover_image: string | null;
  created_at: string;
  view_count?: number;
  is_published?: boolean;
  locale?: Locale;
  translation_group?: string;
}

type BlogRow = Partial<BlogPost> & {
  coverImage?: string | null;
  cover_image?: string | null;
  viewCount?: number;
  view_count?: number;
  isPublished?: boolean;
  is_published?: boolean;
  createdAt?: string;
  created_at?: string;
  translationGroup?: string;
  translation_group?: string;
};

type BlogArticleSeed = {
  slug: string;
  category: {
    en: string;
    zh: string;
    'zh-Hant': string;
  };
  cover: string;
  daysAgo: number;
  views: number;
  en: {
    title: string;
    content: string;
  };
  zh: {
    title: string;
    content: string;
  };
  'zh-Hant': {
    title: string;
    content: string;
  };
};

export const BLOG_STORAGE_KEY = 'clipop_blog_posts_v3';

const localeCopy: Record<string, {
  intro: string;
  keywords: string;
  practical: string;
  faq: string;
  cta: string;
  originalTitle: string;
}> = {
  en: {
    intro: 'This guide explains how clipopai turns long video links or local long videos into short highlight clips with AI.',
    keywords: 'Target keywords',
    practical: 'Practical workflow',
    faq: 'FAQ',
    cta: 'Start with a long video URL or upload a local video and let clipopai find the strongest moments.',
    originalTitle: 'Original English article',
  },
  zh: {
    intro: '这篇指南介绍 clipopai 如何把长视频链接或本地长视频，通过 AI 转成高光时刻短视频。',
    keywords: '目标关键词',
    practical: '实操流程',
    faq: '常见问题',
    cta: '现在输入长视频链接或上传本地长视频，让 clipopai 自动提取最精彩的高光片段。',
    originalTitle: '英文原文标题',
  },
  'zh-Hant': {
    intro: '這篇指南介紹 clipopai 如何把長影片連結或本機長影片，透過 AI 轉成高光時刻短影片。',
    keywords: '目標關鍵字',
    practical: '實作流程',
    faq: '常見問題',
    cta: '現在輸入長影片連結或上傳本機長影片，讓 clipopai 自動提取最精彩的高光片段。',
    originalTitle: '英文原文標題',
  },
  ja: {
    intro: 'This localized guide explains how clipopai turns long video URLs or local long videos into short highlight clips with AI.',
    keywords: 'SEO keywords',
    practical: 'Workflow',
    faq: 'FAQ',
    cta: 'Paste a long video URL or upload a local video to generate AI highlights with clipopai.',
    originalTitle: 'Original English article',
  },
};

const seoSeeds: BlogArticleSeed[] = [
  {
    slug: 'turn-long-videos-into-ai-highlight-shorts',
    category: { en: 'AI Video Clipping', zh: 'AI视频剪辑', 'zh-Hant': 'AI影片剪輯' },
    cover: 'https://picsum.photos/800/400?random=101',
    daysAgo: 1,
    views: 842,
    en: {
      title: 'How to Turn Long Videos into AI Highlight Shorts with clipopai',
      content: `<p>clipopai helps creators convert long YouTube videos, webinars, podcasts, tutorials, and local video files into short highlight clips. The workflow is simple: paste a long video link or upload a local long video, let AI analyze the content, then download short clips that are ready for Shorts, Reels, TikTok, or social ads.</p><h2>Why this matters for creators</h2><p>Long-form content contains ideas, hooks, lessons, and emotional moments, but those moments are often buried inside 30 to 120 minutes of footage. AI highlight detection makes repurposing faster and more consistent.</p><h2>Best workflow</h2><ol><li>Paste a long video URL or upload a local video.</li><li>Let clipopai detect high-energy moments, topic changes, and strong statements.</li><li>Review generated short clips and choose the best ones.</li><li>Publish with a strong hook, caption, and platform-specific title.</li></ol><h2>SEO takeaway</h2><p>If you publish educational or expert content, every long video can become a cluster of short clips that target related search queries.</p>`,
    },
    zh: {
      title: '如何用 clipopai 把长视频转成 AI 高光短视频',
      content: `<p>clipopai 可以帮助创作者把 YouTube 长视频、播客、教程、访谈和本地长视频文件，快速转成适合 Shorts、Reels、TikTok、抖音、小红书等平台发布的高光短视频。</p><h2>为什么长视频需要二次剪辑</h2><p>长视频里往往包含观点、金句、教程步骤和情绪高点，但这些内容被埋在几十分钟的视频里。AI 高光识别可以让内容复用更快、更稳定。</p><h2>推荐流程</h2><ol><li>粘贴长视频链接或上传本地视频。</li><li>让 clipopai 分析高能片段、话题转折和关键表达。</li><li>预览生成的短视频，挑选最适合发布的版本。</li><li>配合标题、字幕和封面发布到目标平台。</li></ol><h2>SEO 价值</h2><p>每一条长视频都可以拆成多个短视频内容点，覆盖更多长尾搜索需求。</p>`,
    },
    'zh-Hant': {
      title: '如何用 clipopai 把長影片轉成 AI 高光短影片',
      content: `<p>clipopai 可以協助創作者把 YouTube 長影片、Podcast、教學、訪談和本機長影片檔案，快速轉成適合 Shorts、Reels、TikTok 等平台發布的高光短影片。</p><h2>為什麼長影片需要二次剪輯</h2><p>長影片裡常有觀點、金句、教學步驟和情緒高點，但這些內容被埋在數十分鐘的影片中。AI 高光識別可以讓內容複用更快、更穩定。</p><h2>推薦流程</h2><ol><li>貼上長影片連結或上傳本機影片。</li><li>讓 clipopai 分析高能片段、話題轉折和關鍵表達。</li><li>預覽生成的短影片，挑選最適合發布的版本。</li><li>配合標題、字幕和封面發布到目標平台。</li></ol><h2>SEO 價值</h2><p>每一支長影片都可以拆成多個短影片內容點，覆蓋更多長尾搜尋需求。</p>`,
    },
  },
  {
    slug: 'best-ai-video-clipper-for-youtube-shorts',
    category: { en: 'YouTube Shorts', zh: 'YouTube Shorts', 'zh-Hant': 'YouTube Shorts' },
    cover: 'https://picsum.photos/800/400?random=102',
    daysAgo: 2,
    views: 693,
    en: { title: 'Best AI Video Clipper for YouTube Shorts: What to Look For', content: `<p>The best AI video clipper for YouTube Shorts should do more than cut random 60-second clips. It should detect hooks, speaker emphasis, topic transitions, and moments that can stand alone as useful short videos.</p><h2>Key features</h2><ul><li>Support for YouTube links and local video uploads.</li><li>AI highlight scoring instead of simple timestamp slicing.</li><li>Fast export for repeated content workflows.</li><li>Consistent quality for creators and marketing teams.</li></ul><p>clipopai is built for this exact workflow: long video in, highlight shorts out.</p>` },
    zh: { title: '适合 YouTube Shorts 的 AI 视频剪辑工具应该具备什么', content: `<p>真正适合 YouTube Shorts 的 AI 视频剪辑工具，不能只是随机切出 60 秒片段，而应该能识别开场钩子、说话重点、话题转折和可以独立传播的高光内容。</p><h2>核心能力</h2><ul><li>支持 YouTube 链接和本地视频上传。</li><li>通过 AI 评分识别高光，而不是机械按时间切片。</li><li>快速导出，适合持续内容生产。</li><li>输出质量稳定，适合创作者和营销团队。</li></ul><p>clipopai 正是围绕“长视频输入，高光短视频输出”构建的工具。</p>` },
    'zh-Hant': { title: '適合 YouTube Shorts 的 AI 影片剪輯工具應該具備什麼', content: `<p>真正適合 YouTube Shorts 的 AI 影片剪輯工具，不能只是隨機切出 60 秒片段，而應該能識別開場鉤子、說話重點、話題轉折和可以獨立傳播的高光內容。</p><h2>核心能力</h2><ul><li>支援 YouTube 連結和本機影片上傳。</li><li>透過 AI 評分識別高光，而不是機械按時間切片。</li><li>快速匯出，適合持續內容生產。</li><li>輸出品質穩定，適合創作者和行銷團隊。</li></ul><p>clipopai 正是圍繞「長影片輸入，高光短影片輸出」打造的工具。</p>` },
  },
  {
    slug: 'repurpose-webinars-into-short-video-clips',
    category: { en: 'Content Repurposing', zh: '内容复用', 'zh-Hant': '內容複用' },
    cover: 'https://picsum.photos/800/400?random=103',
    daysAgo: 3,
    views: 511,
    en: { title: 'How to Repurpose Webinars into Short Video Clips', content: `<p>Webinars are rich with proof points, customer questions, demos, and expert answers. With clipopai, marketers can turn one webinar recording into a library of short clips for email, landing pages, and social media.</p><h2>What to clip</h2><p>Look for problem statements, before-and-after explanations, product demos, objections, and concise expert answers.</p><h2>Publishing strategy</h2><p>Use each short clip as a focused answer to one search query or buyer objection.</p>` },
    zh: { title: '如何把网络研讨会转成可传播的短视频片段', content: `<p>网络研讨会通常包含客户问题、产品演示、专家回答和真实案例。使用 clipopai，营销团队可以把一场直播或录播转成一组适合邮件、落地页和社交媒体分发的短视频。</p><h2>应该剪什么</h2><p>重点寻找痛点描述、前后对比、产品演示、异议处理和专家的简短回答。</p><h2>发布策略</h2><p>每条短视频都应该对应一个搜索问题或购买顾虑。</p>` },
    'zh-Hant': { title: '如何把網路研討會轉成可傳播的短影片片段', content: `<p>網路研討會通常包含客戶問題、產品示範、專家回答和真實案例。使用 clipopai，行銷團隊可以把一場直播或錄播轉成一組適合郵件、落地頁和社群媒體分發的短影片。</p><h2>應該剪什麼</h2><p>重點尋找痛點描述、前後對比、產品示範、異議處理和專家的簡短回答。</p><h2>發布策略</h2><p>每支短影片都應該對應一個搜尋問題或購買顧慮。</p>` },
  },
  {
    slug: 'local-video-upload-to-ai-shorts',
    category: { en: 'Local Video Upload', zh: '本地视频上传', 'zh-Hant': '本機影片上傳' },
    cover: 'https://picsum.photos/800/400?random=104',
    daysAgo: 4,
    views: 478,
    en: { title: 'Turn Local Long Video Files into AI Shorts', content: `<p>Not every useful video is already online. Many creators have Zoom recordings, training sessions, camera footage, or exported MP4 files. clipopai supports local video upload so you can convert private long videos into highlight shorts without first publishing them elsewhere.</p><h2>When local upload is best</h2><ul><li>Private customer calls.</li><li>Internal training recordings.</li><li>Original camera footage.</li><li>Videos blocked by platform access rules.</li></ul>` },
    zh: { title: '如何把本地长视频文件转成 AI 高光短视频', content: `<p>并不是所有有价值的视频都已经发布到线上。很多创作者和团队手里有会议录像、培训视频、相机素材或导出的 MP4 文件。clipopai 支持本地视频上传，可以直接把私有长视频转成高光短视频。</p><h2>什么时候适合本地上传</h2><ul><li>客户访谈录像。</li><li>内部培训视频。</li><li>相机原始素材。</li><li>平台链接受限的视频。</li></ul>` },
    'zh-Hant': { title: '如何把本機長影片檔案轉成 AI 高光短影片', content: `<p>並不是所有有價值的影片都已經發布到線上。很多創作者和團隊手上有會議錄影、培訓影片、相機素材或匯出的 MP4 檔案。clipopai 支援本機影片上傳，可以直接把私有長影片轉成高光短影片。</p><h2>什麼時候適合本機上傳</h2><ul><li>客戶訪談錄影。</li><li>內部培訓影片。</li><li>相機原始素材。</li><li>平台連結受限的影片。</li></ul>` },
  },
  {
    slug: 'ai-highlight-detection-explained',
    category: { en: 'AI Technology', zh: 'AI技术', 'zh-Hant': 'AI技術' },
    cover: 'https://picsum.photos/800/400?random=105',
    daysAgo: 5,
    views: 721,
    en: { title: 'AI Highlight Detection Explained for Video Creators', content: `<p>AI highlight detection combines audio cues, transcript meaning, visual changes, and pacing signals to find moments that are likely to work as standalone short videos.</p><h2>Signals that matter</h2><p>Strong hooks, topic shifts, emotional emphasis, clear demonstrations, and concise answers usually produce better clips.</p><p>clipopai uses these signals to reduce editing time while keeping the creator in control of the final selection.</p>` },
    zh: { title: '视频创作者需要了解的 AI 高光识别原理', content: `<p>AI 高光识别会综合音频变化、字幕语义、画面变化和节奏信号，寻找适合独立传播的短视频片段。</p><h2>重要信号</h2><p>强开场、话题转折、情绪强调、清晰演示和简短回答，通常更容易形成高质量短视频。</p><p>clipopai 通过这些信号减少剪辑时间，同时保留创作者的最终选择权。</p>` },
    'zh-Hant': { title: '影片創作者需要了解的 AI 高光識別原理', content: `<p>AI 高光識別會綜合音訊變化、字幕語義、畫面變化和節奏信號，尋找適合獨立傳播的短影片片段。</p><h2>重要信號</h2><p>強開場、話題轉折、情緒強調、清晰示範和簡短回答，通常更容易形成高品質短影片。</p><p>clipopai 透過這些信號減少剪輯時間，同時保留創作者的最終選擇權。</p>` },
  },
  {
    slug: 'short-video-seo-strategy',
    category: { en: 'SEO Strategy', zh: 'SEO策略', 'zh-Hant': 'SEO策略' },
    cover: 'https://picsum.photos/800/400?random=106',
    daysAgo: 6,
    views: 654,
    en: { title: 'Short Video SEO Strategy for Long-Form Creators', content: `<p>Short video SEO is about matching one clip to one intent. Instead of publishing random highlights, use each clip to answer a specific question from your audience.</p><h2>How to plan clips</h2><ol><li>Choose a search topic from the long video.</li><li>Generate clips with clipopai.</li><li>Rename each clip around one keyword.</li><li>Use captions and descriptions that reinforce the search intent.</li></ol>` },
    zh: { title: '长视频创作者的短视频 SEO 策略', content: `<p>短视频 SEO 的核心，是让每条短视频对应一个明确搜索意图。不要随机发布片段，而要让每个高光短视频回答用户的一个具体问题。</p><h2>如何规划短视频</h2><ol><li>从长视频里选择一个搜索主题。</li><li>用 clipopai 生成高光片段。</li><li>围绕一个关键词命名每条短视频。</li><li>用字幕和简介强化搜索意图。</li></ol>` },
    'zh-Hant': { title: '長影片創作者的短影片 SEO 策略', content: `<p>短影片 SEO 的核心，是讓每支短影片對應一個明確搜尋意圖。不要隨機發布片段，而要讓每個高光短影片回答使用者的一個具體問題。</p><h2>如何規劃短影片</h2><ol><li>從長影片裡選擇一個搜尋主題。</li><li>用 clipopai 生成高光片段。</li><li>圍繞一個關鍵字命名每支短影片。</li><li>用字幕和簡介強化搜尋意圖。</li></ol>` },
  },
  {
    slug: 'podcast-to-video-shorts',
    category: { en: 'Podcast Clips', zh: '播客短视频', 'zh-Hant': 'Podcast短影片' },
    cover: 'https://picsum.photos/800/400?random=107',
    daysAgo: 7,
    views: 533,
    en: { title: 'How to Turn Podcast Episodes into Short Video Clips', content: `<p>Podcast episodes often contain the strongest short-form content: sharp opinions, stories, frameworks, and answers. If your podcast has video, clipopai can turn each episode into a set of shareable shorts.</p><h2>Best moments to extract</h2><p>Look for personal stories, surprising insights, tactical advice, and memorable quotes.</p>` },
    zh: { title: '如何把播客节目转成短视频片段', content: `<p>播客节目里经常包含非常适合短视频传播的内容：鲜明观点、故事、方法论和问答。只要你的播客有视频版本，clipopai 就能把每期节目转成一组可发布的短视频。</p><h2>最适合提取的片段</h2><p>重点寻找个人故事、反常识观点、实操建议和金句。</p>` },
    'zh-Hant': { title: '如何把 Podcast 節目轉成短影片片段', content: `<p>Podcast 節目裡經常包含非常適合短影片傳播的內容：鮮明觀點、故事、方法論和問答。只要你的 Podcast 有影片版本，clipopai 就能把每期節目轉成一組可發布的短影片。</p><h2>最適合提取的片段</h2><p>重點尋找個人故事、反常識觀點、實作建議和金句。</p>` },
  },
  {
    slug: 'marketing-teams-ai-video-repurposing',
    category: { en: 'Marketing Teams', zh: '营销团队', 'zh-Hant': '行銷團隊' },
    cover: 'https://picsum.photos/800/400?random=108',
    daysAgo: 8,
    views: 619,
    en: { title: 'AI Video Repurposing Workflow for Marketing Teams', content: `<p>Marketing teams need a reliable way to turn webinars, demos, interviews, and founder videos into reusable content. clipopai gives teams a repeatable workflow for extracting short clips from every long-form asset.</p><h2>Team process</h2><p>Assign one person to upload long videos, one person to review generated clips, and one person to publish across channels with campaign-specific captions.</p>` },
    zh: { title: '营销团队如何用 AI 复用长视频内容', content: `<p>营销团队需要一种稳定流程，把网络研讨会、产品演示、访谈和创始人视频转成可复用内容。clipopai 可以让团队从每个长视频资产中批量提取短视频。</p><h2>团队流程</h2><p>一个人负责上传长视频，一个人审核生成片段，一个人结合不同渠道发布标题和文案。</p>` },
    'zh-Hant': { title: '行銷團隊如何用 AI 複用長影片內容', content: `<p>行銷團隊需要一種穩定流程，把網路研討會、產品示範、訪談和創辦人影片轉成可複用內容。clipopai 可以讓團隊從每個長影片資產中批量提取短影片。</p><h2>團隊流程</h2><p>一個人負責上傳長影片，一個人審核生成片段，一個人結合不同渠道發布標題和文案。</p>` },
  },
  {
    slug: 'clipopai-vs-manual-editing',
    category: { en: 'Comparison', zh: '工具对比', 'zh-Hant': '工具比較' },
    cover: 'https://picsum.photos/800/400?random=109',
    daysAgo: 9,
    views: 704,
    en: { title: 'clipopai vs Manual Editing: Speed, Cost, and Quality', content: `<p>Manual editing gives full creative control, but it is slow for repeatable highlight extraction. clipopai is designed for the volume work: identifying strong moments and exporting clean short clips from long videos.</p><h2>When AI wins</h2><p>AI is best when you need many short clips from structured long-form content such as tutorials, interviews, webinars, podcasts, and talks.</p>` },
    zh: { title: 'clipopai 与手动剪辑对比：速度、成本和质量', content: `<p>手动剪辑拥有完整创意控制，但对于重复性的高光提取来说效率较低。clipopai 更适合批量工作：从长视频中识别精彩时刻，并导出干净的短视频片段。</p><h2>什么时候 AI 更适合</h2><p>当你需要从教程、访谈、网络研讨会、播客和演讲等结构化长视频里批量生成短视频时，AI 更有优势。</p>` },
    'zh-Hant': { title: 'clipopai 與手動剪輯比較：速度、成本和品質', content: `<p>手動剪輯擁有完整創意控制，但對於重複性的高光提取來說效率較低。clipopai 更適合批量工作：從長影片中識別精彩時刻，並匯出乾淨的短影片片段。</p><h2>什麼時候 AI 更適合</h2><p>當你需要從教學、訪談、網路研討會、Podcast 和演講等結構化長影片裡批量生成短影片時，AI 更有優勢。</p>` },
  },
  {
    slug: 'best-practices-for-ai-generated-shorts',
    category: { en: 'Best Practices', zh: '最佳实践', 'zh-Hant': '最佳實踐' },
    cover: 'https://picsum.photos/800/400?random=110',
    daysAgo: 10,
    views: 588,
    en: { title: 'Best Practices for Publishing AI-Generated Highlight Shorts', content: `<p>AI can generate strong highlight clips, but publishing strategy still matters. The best results come from combining clipopai automation with human review, clear captions, strong thumbnails, and platform-specific titles.</p><h2>Checklist</h2><ul><li>Choose clips with a strong first three seconds.</li><li>Add captions for silent viewing.</li><li>Use one clear idea per clip.</li><li>Link back to the full long video when relevant.</li></ul>` },
    zh: { title: '发布 AI 高光短视频的最佳实践', content: `<p>AI 可以生成高质量高光片段，但发布策略同样重要。最佳效果来自 clipopai 自动化、人工审核、清晰字幕、强封面和适配平台的标题组合。</p><h2>发布清单</h2><ul><li>选择前三秒足够强的片段。</li><li>添加字幕，适配静音观看。</li><li>每条短视频只表达一个清晰观点。</li><li>必要时引导用户观看完整长视频。</li></ul>` },
    'zh-Hant': { title: '發布 AI 高光短影片的最佳實踐', content: `<p>AI 可以生成高品質高光片段，但發布策略同樣重要。最佳效果來自 clipopai 自動化、人工審核、清晰字幕、強封面和適配平台的標題組合。</p><h2>發布清單</h2><ul><li>選擇前三秒足夠強的片段。</li><li>添加字幕，適配靜音觀看。</li><li>每支短影片只表達一個清晰觀點。</li><li>必要時引導使用者觀看完整長影片。</li></ul>` },
  },
];

function getLocaleVariant(seed: BlogArticleSeed, locale: Locale) {
  if (locale === 'zh') return seed.zh;
  if (locale === 'zh-Hant') return seed['zh-Hant'];
  return seed.en;
}

function getCategory(seed: BlogArticleSeed, locale: Locale) {
  if (locale === 'zh') return seed.category.zh;
  if (locale === 'zh-Hant') return seed.category['zh-Hant'];
  return seed.category.en;
}

function getDate(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}

export function getBuiltInBlogPosts(locale: Locale): BlogPost[] {
  return seoSeeds.map(seed => {
    const variant = getLocaleVariant(seed, locale);
    return {
      id: `${seed.slug}-${locale}`,
      title: variant.title,
      category: getCategory(seed, locale),
      content: variant.content,
      cover_image: seed.cover,
      created_at: getDate(seed.daysAgo),
      view_count: seed.views,
      is_published: true,
      locale,
      translation_group: seed.slug,
    };
  });
}

function getBlogSlugFromId(id: string) {
  const matchingLocale = [...locales]
    .sort((a, b) => b.length - a.length)
    .find(locale => id.endsWith(`-${locale}`));
  return matchingLocale ? id.slice(0, -matchingLocale.length - 1) : id;
}

export function getBuiltInBlogPost(id: string, locale: Locale): BlogPost | null {
  const posts = getBuiltInBlogPosts(locale);
  const exactPost = posts.find(post => post.id === id);
  if (exactPost) return exactPost;

  const requestedSlug = getBlogSlugFromId(id);
  return posts.find(post => post.translation_group === requestedSlug || getBlogSlugFromId(post.id) === requestedSlug) || null;
}

export function isPostForLocale(post: Pick<BlogPost, 'id' | 'locale'>, locale: Locale) {
  if (post.locale) return post.locale === locale;
  return post.id.endsWith(`-${locale}`);
}

export function normalizeBlogRow(row: BlogRow): BlogPost {
  const id = String(row.id || '');
  const inferredLocale = [...locales].sort((a, b) => b.length - a.length).find(locale => id.endsWith(`-${locale}`));
  return {
    id,
    title: String(row.title || ''),
    category: String(row.category || 'AI Video Clipping'),
    content: String(row.content || ''),
    cover_image: row.cover_image ?? row.coverImage ?? null,
    created_at: String(row.created_at || row.createdAt || new Date().toISOString()),
    view_count: row.view_count ?? row.viewCount ?? 0,
    is_published: row.is_published ?? row.isPublished ?? true,
    locale: row.locale || inferredLocale,
    translation_group: row.translation_group || row.translationGroup,
  };
}

export function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeLocale(locale: string | undefined | null): Locale {
  if (locale && (locales as string[]).includes(locale)) return locale as Locale;
  return 'en';
}

export function createLocalizedAdminPosts(input: {
  title: string;
  category: string;
  content: string;
  coverImage?: string;
  publish?: boolean;
}): BlogPost[] {
  const now = new Date().toISOString();
  const group = `admin-${Date.now()}`;
  const originalText = stripHtml(input.content);
  const coverImage = input.coverImage || `https://picsum.photos/800/400?random=${Math.floor(Math.random() * 1000)}`;

  return locales.map(locale => {
    const copy = localeCopy[locale] || localeCopy.en;
    const title = locale === 'zh'
      ? `${input.title}：AI 高光短视频指南`
      : locale === 'zh-Hant'
        ? `${input.title}：AI 高光短影片指南`
        : input.title;
    const content = locale === 'en'
      ? input.content
      : `<p>${copy.intro}</p><h2>${copy.originalTitle}</h2><p><strong>${input.title}</strong></p><h2>${copy.practical}</h2><p>${originalText}</p><h2>${copy.faq}</h2><p>${copy.cta}</p>`;

    return {
      id: `${group}-${locale}`,
      title,
      category: locale === 'zh' ? 'AI视频剪辑' : locale === 'zh-Hant' ? 'AI影片剪輯' : input.category,
      content,
      cover_image: coverImage,
      created_at: now,
      view_count: 0,
      is_published: input.publish !== false,
      locale,
      translation_group: group,
    };
  });
}

export function getStoredBlogPosts(locale: Locale): BlogPost[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BLOG_STORAGE_KEY);
    const posts = raw ? JSON.parse(raw) as BlogPost[] : [];
    return posts.filter(post => post.locale === locale && post.is_published !== false);
  } catch {
    localStorage.removeItem(BLOG_STORAGE_KEY);
    return [];
  }
}

export function saveAdminBlogPosts(posts: BlogPost[]) {
  if (typeof window === 'undefined') return;
  const raw = localStorage.getItem(BLOG_STORAGE_KEY);
  const existing = raw ? JSON.parse(raw) as BlogPost[] : [];
  const existingIds = new Set(existing.map(post => post.id));
  const merged = [...posts.filter(post => !existingIds.has(post.id)), ...existing];
  localStorage.setItem(BLOG_STORAGE_KEY, JSON.stringify(merged));
}
