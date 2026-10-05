/**
 * TikTok 二创落地页 —— 三语文案与子页内容数据（en / zh / zh-Hant）。
 *
 * 为什么独立于此文件而不塞进 i18n.ts：
 *  1) 这是 SEO 内容（长正文 + FAQ + 子页正文），与 UI 短文案的生命周期不同；
 *  2) 只做三语，其余 29 语由 i18n 的 defaultLocale 回落机制自动回落英文。
 */

export type RemixLocale = 'en' | 'zh' | 'zh-Hant';

/** 把任意 locale 归到三语桶。 */
export function remixLocale(locale?: string): RemixLocale {
  const l = (locale || '').toLowerCase();
  if (l.startsWith('zh-hant') || l.startsWith('zh-tw') || l.startsWith('zh-hk')) return 'zh-Hant';
  if (l.startsWith('zh')) return 'zh';
  return 'en';
}

export interface RemixFaqItem {
  q: string;
  a: string;
}

export interface RemixCopy {
  meta: { title: string; description: string; keywords: string[] };
  hero: {
    badge: string;
    h1: string;
    sub: string;
    inputPlaceholder: string;
    analyzeCta: string;
    analyzing: string;
    topicHintPlaceholder: string;
  };
  complianceInput: string;
  how: { title: string; steps: Array<{ title: string; desc: string }> };
  result: {
    title: string;
    topicLabel: string;
    hookLabel: string;
    structureLabel: string;
    emotionLabel: string;
    anglesLabel: string;
    keywordsLabel: string;
    useCta: string;
    generateCta: string;
    attribution: string;
    originalVideo: string;
    degradedNote: string;
    engineLlm: string;
    engineLocal: string;
    errorInvalid: string;
    errorRate: string;
    errorGeneric: string;
  };
  complianceResult: string;
  faq: { title: string; items: RemixFaqItem[] };
  bottomCta: { title: string; sub: string; cta: string };
}

export const REMIX_COPY: Record<RemixLocale, RemixCopy> = {
  en: {
    meta: {
      title: 'TikTok Video Remaker - Break Down Any TikTok & Make Your Own',
      description:
        'Paste a TikTok link and AI breaks down its topic, first-3-second hook and narrative structure, then turns it into your own original vertical short video. Free analysis, no download needed.',
      keywords: [
        'tiktok video remaker',
        'tiktok hook analyzer',
        'rewrite tiktok video',
        'tiktok script breakdown',
        'tiktok video to original short',
      ],
    },
    hero: {
      badge: 'Free analysis · no download',
      h1: 'Turn any TikTok into your own original short',
      sub: 'Paste a TikTok link. We read its public info, break down the topic, the first-3-second hook and the story beats — then help you make an original video inspired by it. We never download or re-upload the original.',
      inputPlaceholder: 'https://www.tiktok.com/@creator/video/...',
      analyzeCta: 'Break it down',
      analyzing: 'Breaking it down...',
      topicHintPlaceholder: 'Optional: your own topic, e.g. saving money as a student',
    },
    complianceInput:
      'Only public metadata is read via TikTok\'s official oEmbed. We do not download, store or re-host any video. Please only analyze content you own or are authorized to use.',
    how: {
      title: 'How it works',
      steps: [
        { title: 'Paste a TikTok link', desc: 'A full video link or a short vm.tiktok.com link.' },
        { title: 'AI breaks down the structure', desc: 'Topic, first-3-second hook, story beats, emotion curve and remix angles.' },
        { title: 'Make your own original video', desc: 'One click pre-fills your topic into Clipop AI to generate an original vertical short.' },
      ],
    },
    result: {
      title: 'Breakdown',
      topicLabel: 'Derived topic',
      hookLabel: 'First-3-second hook',
      structureLabel: 'Narrative structure',
      emotionLabel: 'Emotion curve',
      anglesLabel: 'Remix angles',
      keywordsLabel: 'Related searches',
      useCta: 'Use this angle',
      generateCta: 'Generate my original video',
      attribution: 'Thumbnail and info come from TikTok\'s official oEmbed.',
      originalVideo: 'View original',
      degradedNote: 'We could not read that video\'s public info (it may be private, removed or region-locked). Here is a generic structure — you can type your own topic below.',
      engineLlm: 'AI breakdown',
      engineLocal: 'Starter structure',
      errorInvalid: 'That does not look like a valid TikTok video link. Please paste a full video URL.',
      errorRate: 'Too many requests. Please wait a minute and try again.',
      errorGeneric: 'Something went wrong. Please try again.',
    },
    complianceResult:
      'These are structural suggestions only. Your generated video is your own original work — review it before publishing, and never reuse someone else\'s footage or audio.',
    faq: {
      title: 'FAQ',
      items: [
        {
          q: 'Does it download the TikTok video?',
          a: 'No. We never download, store, watermark-strip or re-host any TikTok video. We only read public metadata through TikTok\'s official oEmbed endpoint.',
        },
        {
          q: 'Is the generated video a copy of the original?',
          a: 'No. It is a new original video written from scratch around the topic and structure, using your own narration and visuals.',
        },
        {
          q: 'Is the analysis free?',
          a: 'Yes, the breakdown is free and does not require an account. Generating the final video uses your Clipop AI credits.',
        },
        {
          q: 'What if the link is private or removed?',
          a: 'You still get a generic structure you can build on, and you can type your own topic instead.',
        },
      ],
    },
    bottomCta: {
      title: 'Ready to make your own version?',
      sub: 'Generate an original vertical short from this topic in seconds.',
      cta: 'Go to AI video',
    },
  },
  zh: {
    meta: {
      title: 'TikTok 视频拆解与二创 - 拆解爆款结构，生成你自己的原创短视频',
      description:
        '粘贴 TikTok 链接，AI 自动拆解它的选题、前 3 秒钩子与叙事结构，再帮你生成属于自己的原创竖屏短视频。免费拆解，无需下载视频。',
      keywords: [
        'TikTok 视频拆解',
        'TikTok 视频二创',
        '前3秒钩子分析',
        '短视频选题拆解工具',
        'TikTok 链接生成原创视频',
      ],
    },
    hero: {
      badge: '免费拆解 · 无需下载',
      h1: '把任意 TikTok 拆解成你自己的原创短视频',
      sub: '粘贴一条 TikTok 链接，我们读取它的公开信息，拆解选题、前 3 秒钩子与叙事节奏，再帮你做出受它启发的原创视频。我们绝不下载、绝不转存原视频。',
      inputPlaceholder: 'https://www.tiktok.com/@creator/video/...',
      analyzeCta: '开始拆解',
      analyzing: '正在拆解...',
      topicHintPlaceholder: '可选：你自己的选题，例如「学生怎么攒钱」',
    },
    complianceInput:
      '仅通过 TikTok 官方 oEmbed 读取公开元数据，不下载、不存储、不转存任何视频。请仅分析你拥有或已获授权的内容。',
    how: {
      title: '怎么用',
      steps: [
        { title: '粘贴 TikTok 链接', desc: '完整视频链接或 vm.tiktok.com 短链都可以。' },
        { title: 'AI 拆解结构', desc: '输出选题、前 3 秒钩子、叙事节拍、情绪曲线与二创角度。' },
        { title: '生成你的原创视频', desc: '一键把选题预填进 Clipop AI，生成原创竖屏短视频。' },
      ],
    },
    result: {
      title: '拆解结果',
      topicLabel: '派生选题',
      hookLabel: '前 3 秒钩子',
      structureLabel: '叙事结构',
      emotionLabel: '情绪曲线',
      anglesLabel: '二创角度',
      keywordsLabel: '相关搜索',
      useCta: '用这个角度',
      generateCta: '生成我的原创视频',
      attribution: '封面与信息来自 TikTok 官方 oEmbed。',
      originalVideo: '查看原视频',
      degradedNote: '没能读到这条视频的公开信息（可能已设为私密、已删除或地区受限）。下面是通用结构，你也可以在下方填写自己的选题。',
      engineLlm: 'AI 拆解',
      engineLocal: '基础结构',
      errorInvalid: '这不像是一个有效的 TikTok 视频链接，请粘贴完整的视频地址。',
      errorRate: '请求过于频繁，请等待一分钟后重试。',
      errorGeneric: '出错了，请重试。',
    },
    complianceResult:
      '以上仅为结构建议。生成的内容是你自己的原创作品——发布前请自行审核，切勿直接使用他人的画面或音频。',
    faq: {
      title: '常见问题',
      items: [
        {
          q: '会下载这条 TikTok 视频吗？',
          a: '不会。我们不下载、不存储、不去水印、不转存任何 TikTok 视频，只通过官方 oEmbed 接口读取公开元数据。',
        },
        {
          q: '生成的视频是原视频的复制吗？',
          a: '不是。它是围绕该选题与结构从零创作的原创视频，使用你自己的旁白与画面。',
        },
        {
          q: '拆解收费吗？',
          a: '拆解免费且无需注册。生成最终成片时才会使用你的 Clipop AI 积分。',
        },
        {
          q: '链接是私密或已删除怎么办？',
          a: '你仍然能得到一份通用结构作为起点，也可以直接填写自己的选题。',
        },
      ],
    },
    bottomCta: {
      title: '准备好做你自己的版本了吗？',
      sub: '几秒钟把这条选题生成原创竖屏短视频。',
      cta: '前往 AI 成片',
    },
  },
  'zh-Hant': {
    meta: {
      title: 'TikTok 影片拆解與二創 - 拆解爆款結構，生成你自己的原創短影音',
      description:
        '貼上 TikTok 連結，AI 自動拆解它的選題、前 3 秒鉤子與敘事結構，再幫你生成屬於自己的原創豎屏短影音。免費拆解，無需下載影片。',
      keywords: [
        'TikTok 影片拆解',
        'TikTok 影片二創',
        '前3秒鉤子分析',
        '短影音選題拆解工具',
        'TikTok 連結生成原創影片',
      ],
    },
    hero: {
      badge: '免費拆解 · 無需下載',
      h1: '把任意 TikTok 拆解成你自己的原創短影音',
      sub: '貼上一條 TikTok 連結，我們讀取它的公開資訊，拆解選題、前 3 秒鉤子與敘事節奏，再幫你做出受它啟發的原創影片。我們絕不下載、絕不轉存原影片。',
      inputPlaceholder: 'https://www.tiktok.com/@creator/video/...',
      analyzeCta: '開始拆解',
      analyzing: '正在拆解...',
      topicHintPlaceholder: '可選：你自己的選題，例如「學生怎麼存錢」',
    },
    complianceInput:
      '僅透過 TikTok 官方 oEmbed 讀取公開中繼資料，不下載、不儲存、不轉存任何影片。請僅分析你擁有或已獲授權的內容。',
    how: {
      title: '怎麼用',
      steps: [
        { title: '貼上 TikTok 連結', desc: '完整影片連結或 vm.tiktok.com 短鏈都可以。' },
        { title: 'AI 拆解結構', desc: '輸出選題、前 3 秒鉤子、敘事節拍、情緒曲線與二創角度。' },
        { title: '生成你的原創影片', desc: '一鍵把選題預填進 Clipop AI，生成原創豎屏短影音。' },
      ],
    },
    result: {
      title: '拆解結果',
      topicLabel: '衍生選題',
      hookLabel: '前 3 秒鉤子',
      structureLabel: '敘事結構',
      emotionLabel: '情緒曲線',
      anglesLabel: '二創角度',
      keywordsLabel: '相關搜尋',
      useCta: '用這個角度',
      generateCta: '生成我的原創影片',
      attribution: '封面與資訊來自 TikTok 官方 oEmbed。',
      originalVideo: '查看原影片',
      degradedNote: '沒能讀到這條影片的公開資訊（可能已設為私密、已刪除或地區受限）。下面是通用結構，你也可以在下方填寫自己的選題。',
      engineLlm: 'AI 拆解',
      engineLocal: '基礎結構',
      errorInvalid: '這不像是一個有效的 TikTok 影片連結，請貼上完整的影片位址。',
      errorRate: '請求過於頻繁，請等待一分鐘後重試。',
      errorGeneric: '出錯了，請重試。',
    },
    complianceResult:
      '以上僅為結構建議。生成的內容是你自己的原創作品——發布前請自行審核，切勿直接使用他人的畫面或音訊。',
    faq: {
      title: '常見問題',
      items: [
        {
          q: '會下載這條 TikTok 影片嗎？',
          a: '不會。我們不下載、不儲存、不去水印、不轉存任何 TikTok 影片，只透過官方 oEmbed 介面讀取公開中繼資料。',
        },
        {
          q: '生成的影片是原影片的複製嗎？',
          a: '不是。它是圍繞該選題與結構從零創作的原創影片，使用你自己的旁白與畫面。',
        },
        {
          q: '拆解收費嗎？',
          a: '拆解免費且無需註冊。生成最終成片時才會使用你的 Clipop AI 積分。',
        },
        {
          q: '連結是私密或已刪除怎麼辦？',
          a: '你仍然能得到一份通用結構作為起點，也可以直接填寫自己的選題。',
        },
      ],
    },
    bottomCta: {
      title: '準備好做你自己的版本了嗎？',
      sub: '幾秒鐘把這條選題生成原創豎屏短影音。',
      cta: '前往 AI 成片',
    },
  },
};

/* ───────────────────────── 模版子页（SEO 长尾） ───────────────────────── */

export type RemixTemplateSlug =
  | 'growth'
  | 'deep-thinking'
  | 'emotion'
  | 'novel'
  | 'science'
  | 'side-hustle'
  | 'history'
  | 'digital-human';

export interface RemixTemplatePage {
  slug: RemixTemplateSlug;
  /** 该子页的生成入口：普通模版走 /api/ai-video；数字人走 /digital-human-live */
  entry: { type: 'ai-video' } | { type: 'digital-human' };
  accent: string;
  h1: Record<RemixLocale, string>;
  intro: Record<RemixLocale, string>;
  bullets: Record<RemixLocale, string[]>;
  keywords: Record<RemixLocale, string[]>;
}

export const REMIX_TEMPLATE_PAGES: RemixTemplatePage[] = [
  {
    slug: 'growth',
    entry: { type: 'ai-video' },
    accent: '#3ddc84',
    h1: {
      'en': 'TikTok personal-growth video remaker',
      'zh': 'TikTok 个人成长类视频二创',
      'zh-Hant': 'TikTok 個人成長類影片二創',
    },
    intro: {
      'en': 'Break down a personal-growth TikTok — the pain-point hook, the counter-intuitive turn, the one minimum action — and generate your own growth short with your own voice.',
      'zh': '拆解一条个人成长类 TikTok：痛点钩子、反常识转折、最小行动，然后用你自己的口吻生成属于你的成长短视频。',
      'zh-Hant': '拆解一條個人成長類 TikTok：痛點鉤子、反常識轉折、最小行動，然後用你自己的口吻生成屬於你的成長短影音。',
    },
    bullets: {
      'en': ['Pain-point opening that stops the scroll', 'Counter-intuitive turn to hold retention', 'One concrete action the viewer can take today'],
      'zh': ['痛点开场，第一时间抓住注意力', '反常识转折，把观众留下来', '给出一个今天就能做的具体行动'],
      'zh-Hant': ['痛點開場，第一時間抓住注意力', '反常識轉折，把觀眾留下來', '給出一個今天就能做的具體行動'],
    },
    keywords: {
      'en': ['tiktok growth video remaker', 'personal growth short video ai', 'motivational video script generator'],
      'zh': ['TikTok 个人成长视频二创', '成长类短视频脚本生成', '励志短视频 AI 生成'],
      'zh-Hant': ['TikTok 個人成長影片二創', '成長類短影音腳本生成', '勵志短影音 AI 生成'],
    },
  },
  {
    slug: 'deep-thinking',
    entry: { type: 'ai-video' },
    accent: '#4f8cff',
    h1: {
      'en': 'TikTok deep-thinking video remaker',
      'zh': 'TikTok 深度思考类视频二创',
      'zh-Hant': 'TikTok 深度思考類影片二創',
    },
    intro: {
      'en': 'Turn a deep-thinking TikTok into your own calm, structured short — one idea per beat, no filler.',
      'zh': '把一条深度思考类 TikTok 变成你自己的、节奏克制的结构化短视频：一拍一个观点，没有废话。',
      'zh-Hant': '把一條深度思考類 TikTok 變成你自己的、節奏克制的結構化短影音：一拍一個觀點，沒有廢話。',
    },
    bullets: {
      'en': ['One clear idea per beat', 'Calm, low-noise pacing', 'A closing line worth remembering'],
      'zh': ['一拍只讲一个观点', '克制、低噪音的节奏', '一句值得记住的收尾'],
      'zh-Hant': ['一拍只講一個觀點', '克制、低噪音的節奏', '一句值得記住的收尾'],
    },
    keywords: {
      'en': ['tiktok deep thinking video remaker', 'thought provoking short video ai', 'idea video script generator'],
      'zh': ['TikTok 深度思考视频二创', '观点类短视频生成', '思考类口播脚本'],
      'zh-Hant': ['TikTok 深度思考影片二創', '觀點類短影音生成', '思考類口播腳本'],
    },
  },
  {
    slug: 'emotion',
    entry: { type: 'ai-video' },
    accent: '#ff6b9d',
    h1: {
      'en': 'TikTok emotion video remaker',
      'zh': 'TikTok 情感类视频二创',
      'zh-Hant': 'TikTok 情感類影片二創',
    },
    intro: {
      'en': 'Break down an emotional TikTok — how the tension builds and where it lands — and make your own emotional short.',
      'zh': '拆解一条情感类 TikTok：张力如何累积、情绪落在哪一个点上，然后做出属于你的情感短视频。',
      'zh-Hant': '拆解一條情感類 TikTok：張力如何累積、情緒落在哪一個點上，然後做出屬於你的情感短影音。',
    },
    bullets: {
      'en': ['Emotional tension built step by step', 'A landing point that earns the share', 'Soft, warm pacing and voice'],
      'zh': ['情绪张力逐层累积', '一个值得被转发的落点', '温柔、有温度的节奏'],
      'zh-Hant': ['情緒張力逐層累積', '一個值得被轉傳的落點', '溫柔、有溫度的節奏'],
    },
    keywords: {
      'en': ['tiktok emotional video remaker', 'emotional short video script ai', 'storytelling video generator'],
      'zh': ['TikTok 情感视频二创', '情感短视频脚本生成', '故事类短视频 AI'],
      'zh-Hant': ['TikTok 情感影片二創', '情感短影音腳本生成', '故事類短影音 AI'],
    },
  },
  {
    slug: 'novel',
    entry: { type: 'ai-video' },
    accent: '#ffb020',
    h1: {
      'en': 'TikTok novel-recap video remaker',
      'zh': 'TikTok 小说解说类视频二创',
      'zh-Hant': 'TikTok 小說解說類影片二創',
    },
    intro: {
      'en': 'Break down a novel-recap TikTok into a repeatable structure, then generate your own recap short.',
      'zh': '把一条小说解说类 TikTok 拆成可复用的结构，然后生成属于你自己的解说短视频。',
      'zh-Hant': '把一條小說解說類 TikTok 拆成可重複使用的結構，然後生成屬於你自己的解說短影音。',
    },
    bullets: {
      'en': ['A hook that promises a payoff', 'Escalating beats that keep viewers watching', 'A cliffhanger close'],
      'zh': ['用钩子承诺回报', '逐拍升级，留住观众', '悬念收尾'],
      'zh-Hant': ['用鉤子承諾回報', '逐拍升級，留住觀眾', '懸念收尾'],
    },
    keywords: {
      'en': ['tiktok novel recap remaker', 'story recap video ai', 'novel narration short video'],
      'zh': ['TikTok 小说解说二创', '小说解说视频生成', '故事解说短视频 AI'],
      'zh-Hant': ['TikTok 小說解說二創', '小說解說影片生成', '故事解說短影音 AI'],
    },
  },
  {
    slug: 'science',
    entry: { type: 'ai-video' },
    accent: '#25d0c0',
    h1: {
      'en': 'TikTok knowledge & science video remaker',
      'zh': 'TikTok 知识科普类视频二创',
      'zh-Hant': 'TikTok 知識科普類影片二創',
    },
    intro: {
      'en': 'Break down a knowledge TikTok into question → mechanism → takeaway, then generate your own explainer short.',
      'zh': '把一条知识科普 TikTok 拆成「提问 → 讲机制 → 给结论」，然后生成属于你的科普短视频。',
      'zh-Hant': '把一條知識科普 TikTok 拆成「提問 → 講機制 → 給結論」，然後生成屬於你的科普短影音。',
    },
    bullets: {
      'en': ['Open with a question worth answering', 'Explain the mechanism in plain words', 'Land on one clean takeaway'],
      'zh': ['用一个值得回答的问题开场', '用大白话讲清机制', '落到一个干净的结论'],
      'zh-Hant': ['用一個值得回答的問題開場', '用大白話講清機制', '落到一個乾淨的結論'],
    },
    keywords: {
      'en': ['tiktok science video remaker', 'knowledge short video ai', 'explainer video script generator'],
      'zh': ['TikTok 科普视频二创', '知识类短视频生成', '科普口播脚本'],
      'zh-Hant': ['TikTok 科普影片二創', '知識類短影音生成', '科普口播腳本'],
    },
  },
  {
    slug: 'side-hustle',
    entry: { type: 'ai-video' },
    accent: '#a06bff',
    h1: {
      'en': 'TikTok side-hustle video remaker',
      'zh': 'TikTok 副业赚钱类视频二创',
      'zh-Hant': 'TikTok 副業賺錢類影片二創',
    },
    intro: {
      'en': 'Break down a side-hustle TikTok — the promise, the proof, the first step — and generate your own version.',
      'zh': '拆解一条副业赚钱类 TikTok：承诺、证明、第一步，然后生成属于你自己的版本。',
      'zh-Hant': '拆解一條副業賺錢類 TikTok：承諾、證明、第一步，然後生成屬於你自己的版本。',
    },
    bullets: {
      'en': ['A concrete promise, no vague hype', 'Proof or a believable example', 'A first step that is doable this week'],
      'zh': ['给出具体的承诺，不画大饼', '用证据或可信例子支撑', '一个本周就能执行的第一步'],
      'zh-Hant': ['給出具體的承諾，不畫大餅', '用證據或可信例子支撐', '一個本週就能執行的第一步'],
    },
    keywords: {
      'en': ['tiktok side hustle video remaker', 'make money online short video ai', 'business short video script'],
      'zh': ['TikTok 副业视频二创', '赚钱类短视频生成', '副业口播脚本 AI'],
      'zh-Hant': ['TikTok 副業影片二創', '賺錢類短影音生成', '副業口播腳本 AI'],
    },
  },
  {
    slug: 'history',
    entry: { type: 'ai-video' },
    accent: '#d4a24a',
    h1: {
      'en': 'TikTok history video remaker',
      'zh': 'TikTok 历史解说类视频二创',
      'zh-Hant': 'TikTok 歷史解說類影片二創',
    },
    intro: {
      'en': 'Break down a history TikTok into a tension-driven timeline, then generate your own history short.',
      'zh': '把一条历史解说 TikTok 拆成张力驱动的时间线，然后生成属于你的历史短视频。',
      'zh-Hant': '把一條歷史解說 TikTok 拆成張力驅動的時間線，然後生成屬於你的歷史短影音。',
    },
    bullets: {
      'en': ['A moment of tension to open on', 'A timeline that keeps moving', 'A closing insight, not just facts'],
      'zh': ['用一个有张力的瞬间开场', '一条持续推进的时间线', '以洞见收尾，而不只是罗列事实'],
      'zh-Hant': ['用一個有張力的瞬間開場', '一條持續推進的時間線', '以洞見收尾，而不只是羅列事實'],
    },
    keywords: {
      'en': ['tiktok history video remaker', 'history short video ai', 'historical storytelling video'],
      'zh': ['TikTok 历史解说二创', '历史类短视频生成', '历史故事解说 AI'],
      'zh-Hant': ['TikTok 歷史解說二創', '歷史類短影音生成', '歷史故事解說 AI'],
    },
  },
  {
    slug: 'digital-human',
    entry: { type: 'digital-human' },
    accent: '#f5c542',
    h1: {
      'en': 'TikTok digital-human talking video remaker',
      'zh': 'TikTok 数字人口播带货视频二创',
      'zh-Hant': 'TikTok 數字人口播帶貨影片二創',
    },
    intro: {
      'en': 'Break down a talking-head TikTok into a four-beat selling script, then generate a digital-human presenter video in your own cloned voice.',
      'zh': '把一条口播带货 TikTok 拆成四拍销售脚本，然后用你自己的克隆音色生成数字人口播视频。',
      'zh-Hant': '把一條口播帶貨 TikTok 拆成四拍銷售腳本，然後用你自己的克隆音色生成數字人口播影片。',
    },
    bullets: {
      'en': ['A four-beat selling structure', 'Your own cloned voice, not a stock voice', 'Ready-to-post 9:16 vertical output'],
      'zh': ['四拍销售结构', '使用你自己的克隆音色，而非通用音色', '直接可发布的 9:16 竖屏成片'],
      'zh-Hant': ['四拍銷售結構', '使用你自己的克隆音色，而非通用音色', '直接可發布的 9:16 豎屏成片'],
    },
    keywords: {
      'en': ['tiktok digital human video', 'ai talking head video generator', 'voice clone product video'],
      'zh': ['TikTok 数字人口播', 'AI 口播视频生成', '克隆音色带货视频'],
      'zh-Hant': ['TikTok 數字人口播', 'AI 口播影片生成', '克隆音色帶貨影片'],
    },
  },
];

export function findRemixTemplatePage(slug: string): RemixTemplatePage | undefined {
  return REMIX_TEMPLATE_PAGES.find((p) => p.slug === slug);
}