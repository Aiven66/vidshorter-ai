/**
 * AI 成片 —— 竖屏模版注册表（客户端 / 服务端共用，**零依赖**）。
 *
 * 技术结构移植自开源框架 Pixelle-Video（Apache-2.0）：
 *   模版 = 「视觉风格（配色/字体/版式）」+「文案结构骨架」+「语气人设」+「BGM 心情」+「语速音色」。
 * 差异点：Pixelle 的模版是 HTML+CSS 由无头浏览器截图；本项目部署在 Vercel（无 headless 浏览器），
 * 因此把「视觉风格」翻译为 SVG 矢量版式（见 server/ai-video/frame.ts），文字仍交给 libass 烧录。
 *
 * 7 类模版全部 **零模型密钥可出片**（LLM 缺失时用 local 兜底脚本，TTS 用 Edge 神经声线）。
 * 只有「音色克隆」需要额外能力（IndexTTS2 本地 GPU / 云端 voice clone API）。
 */

export type AiVideoTemplateId =
  | 'growth'
  | 'deep-thinking'
  | 'emotion'
  | 'novel'
  | 'science'
  | 'side-hustle'
  | 'history'
  | 'digital-human';

/** 版式变体（frame.ts 按此绘制不同的背景构图）。 */
export type AiVideoLayout =
  | 'spotlight'
  | 'minimal'
  | 'aurora'
  | 'paper'
  | 'grid'
  | 'cinema'
  | 'scroll';

export interface AiVideoTemplateVisual {
  /** 背景渐变起止色（无 AI 配图时的 SVG 回落版式用） */
  from: string;
  to: string;
  /** 强调色（装饰图形 + 标题描边） */
  accent: string;
  /** 版式构图（无 AI 配图时的 SVG 回落版式用） */
  layout: AiVideoLayout;
  /** 标题字号（ASS PlayResY=1920 基准） */
  titleSize: number;
  /** 标题是否加粗 */
  bold: boolean;
  /** 有 AI 配图时的浅色纸底（Pixelle 式画卡版式的背景色） */
  paper: string;
  /** 有 AI 配图时的文字墨色（标题/字幕，浅底上保证可读） */
  ink: string;
}

export interface AiVideoTemplate {
  id: AiVideoTemplateId;
  /** 卡片主色（CSS 渐变预览用） */
  accent: string;
  visual: AiVideoTemplateVisual;
  /**
   * AI 配图风格前缀（英文，逐分镜拼在画面描述前）——决定整片视觉统一性，
   * 对应 Pixelle-Video 视觉设置里的「提示词前缀」。移植自其 demo 的极简线稿风格。
   */
  imageStyle: string;
  /** BGM 心情（public/bgm/{mood}.mp3） */
  bgmMood: 'calm' | 'energetic' | 'warm';
  /** Edge 神经声线的语速 / 音调微调（msedge-tts prosody 参数） */
  rate: string;
  pitch: string;
  /** 该模版期望「克隆音色」；克隆能力缺失时回落 Edge 神经声线并在 UI 提示 */
  prefersClonedVoice: boolean;
  /** LLM 提示词：人设与语气（英文，便于模型稳定遵循） */
  persona: string;
  /** LLM 提示词：结构骨架（分镜节奏，按序） */
  structure: string[];
  /** 本地兜底脚本：{topic} 会被替换为主题关键词 */
  local: Record<'zh' | 'zh-Hant' | 'en', Array<{ headline: string; narration: string }>>;
}

export const DEFAULT_AI_VIDEO_TEMPLATE: AiVideoTemplateId = 'deep-thinking';

export const AI_VIDEO_TEMPLATES: AiVideoTemplate[] = [
  {
    id: 'growth',
    accent: '#3ddc84',
    visual: { from: '#06170f', to: '#0f3d2a', accent: '#3ddc84', layout: 'spotlight', titleSize: 92, bold: true, paper: '#f4f8f2', ink: '#13281d' },
    imageStyle:
      'Cinematic photorealistic photography, warm golden morning light, shallow depth of field, aspirational documentary feel, natural film grain, no text',
    bgmMood: 'warm',
    rate: '+6%',
    pitch: '+2Hz',
    prefersClonedVoice: true,
    persona:
      'A seasoned personal-growth coach. Tone: warm but straight-talking, like a friend who has been through it. Use concrete everyday actions, never empty motivational slogans.',
    structure: [
      'Hook: call out a painful everyday gap the viewer feels about the topic',
      'Counter-intuitive point: the real cause is small and repeatable, not talent',
      'Mechanism: explain WHY it works in plain words',
      'Action: give one minimum viable step that cannot fail',
      'Close: one memorable line that pushes the viewer to start today',
    ],
    local: {
      zh: [
        { headline: '你可能一直低估了它', narration: '很多人努力了很久却始终没起色，问题往往不在能力，而在「{topic}」这件事上。' },
        { headline: '先说一个反常识', narration: '真正拉开差距的不是天赋，是每天重复的小动作。「{topic}」看起来很小，复利却很吓人。' },
        { headline: '为什么它真的有效', narration: '因为它降低了启动成本。你不需要下决心，只要一个固定的触发点，身体就会自动进入状态。' },
        { headline: '具体怎么开始', narration: '给自己一个最小版本，小到不可能失败：两分钟、一个动作、固定时间。先完成，再完美。' },
        { headline: '最后一句话', narration: '别等状态好了才开始，是开始了状态才会好。今天就把「{topic}」写进你的日程。' },
      ],
      'zh-Hant': [
        { headline: '你可能一直低估了它', narration: '很多人努力了很久卻始終沒起色，問題往往不在能力，而在「{topic}」這件事上。' },
        { headline: '先說一個反直覺', narration: '真正拉開差距的不是天賦，是每天重複的小動作。「{topic}」看起來很小，複利卻很嚇人。' },
        { headline: '為什麼它真的有效', narration: '因為它降低了啟動成本。你不需要下決心，只要一個固定的觸發點，身體就會自動進入狀態。' },
        { headline: '具體怎麼開始', narration: '給自己一個最小版本，小到不可能失敗：兩分鐘、一個動作、固定時間。先完成，再完美。' },
        { headline: '最後一句話', narration: '別等狀態好了才開始，是開始了狀態才會好。今天就把「{topic}」寫進你的日程。' },
      ],
      en: [
        { headline: 'You keep underestimating this', narration: 'Many people grind for months with no progress. The problem is rarely talent. It is "{topic}".' },
        { headline: 'Here is the counter-intuitive part', narration: 'What separates people is not talent. It is the tiny action repeated daily. "{topic}" looks small, but it compounds hard.' },
        { headline: 'Why it actually works', narration: 'Because it lowers the cost of starting. You do not need motivation, just a fixed trigger, and your body follows.' },
        { headline: 'How to start today', narration: 'Build the smallest version possible: two minutes, one action, same time daily. Done beats perfect.' },
        { headline: 'One last thing', narration: 'Do not wait to feel ready. Starting is what makes you ready. Put "{topic}" on your calendar today.' },
      ],
    },
  },
  {
    id: 'deep-thinking',
    accent: '#4f8cff',
    visual: { from: '#0b1224', to: '#1b2b5a', accent: '#4f8cff', layout: 'minimal', titleSize: 84, bold: true, paper: '#f3f5fa', ink: '#101a30' },
    imageStyle:
      'Cinematic photorealistic photography, cool blue-toned ambient light, minimalist modern interior, moody atmospheric haze, shallow depth of field, no text',
    bgmMood: 'calm',
    rate: '+0%',
    pitch: '+0Hz',
    prefersClonedVoice: false,
    persona:
      'A calm analytical thinker. Tone: composed, precise, slightly contrarian. Prefer questioning the frame over giving quick answers.',
    structure: [
      'Hook: point out that our first instinct about the topic is the lazy and inaccurate one',
      'Reframe: the valuable question is not the answer, but what problem we are really solving',
      'Layers: surface symptom, middle mechanism, bottom motivation',
      'Practice: a concrete daily exercise to think deeper',
      'Close: one line that redefines what deep thinking means',
    ],
    local: {
      zh: [
        { headline: '大多数人想错了', narration: '关于「{topic}」，我们习惯的第一反应，往往是最省力、也最不准确的那一个。' },
        { headline: '换一个问法', narration: '真正有价值的不是「答案是什么」，而是「我们到底在解决什么问题」。换个问法，问题常常自己消失一半。' },
        { headline: '它有三个层次', narration: '表层是现象，中层是机制，底层是动机。多数争论卡在表层，因为没人愿意往下走。' },
        { headline: '怎么练习', narration: '每天挑一件小事，先写下你的第一直觉，再强迫自己给出两个反对自己的理由。' },
        { headline: '一句话收尾', narration: '深度思考不是想得更久，而是问得更狠。想清楚「{topic}」，比急着回答它更重要。' },
      ],
      'zh-Hant': [
        { headline: '大多數人想錯了', narration: '關於「{topic}」，我們習慣的第一反應，往往是最省力、也最不準確的那一個。' },
        { headline: '換一個問法', narration: '真正有價值的不是「答案是什麼」，而是「我們到底在解決什麼問題」。換個問法，問題常常自己消失一半。' },
        { headline: '它有三個層次', narration: '表層是現象，中層是機制，底層是動機。多數爭論卡在表層，因為沒人願意往下走。' },
        { headline: '怎麼練習', narration: '每天挑一件小事，先寫下你的第一直覺，再強迫自己給出兩個反對自己的理由。' },
        { headline: '一句話收尾', narration: '深度思考不是想得更久，而是問得更狠。想清楚「{topic}」，比急著回答它更重要。' },
      ],
      en: [
        { headline: 'Most people get this wrong', narration: 'About "{topic}", our first instinct is usually the laziest and least accurate one.' },
        { headline: 'Change the question', narration: 'The real value is not "what is the answer", but "what problem are we actually solving". Reframe it and half the problem disappears.' },
        { headline: 'Three layers', narration: 'Surface is the symptom, middle is the mechanism, bottom is the motive. Most arguments stall at the surface because nobody goes deeper.' },
        { headline: 'How to practice', narration: 'Each day pick one small thing. Write your first instinct, then force yourself to give two reasons you could be wrong.' },
        { headline: 'One line to keep', narration: 'Deep thinking is not thinking longer, it is asking harder. Understanding "{topic}" matters more than answering it fast.' },
      ],
    },
  },
  {
    id: 'emotion',
    accent: '#ff6b9d',
    visual: { from: '#1a0f18', to: '#5a1f3f', accent: '#ff6b9d', layout: 'aurora', titleSize: 88, bold: false, paper: '#faf3f6', ink: '#2c1622' },
    imageStyle:
      'Cinematic photorealistic photography, soft warm sunset glow, tender backlit silhouette, dreamy bokeh, gentle film grain, no text',
    bgmMood: 'calm',
    rate: '-4%',
    pitch: '+0Hz',
    prefersClonedVoice: true,
    persona:
      'A gentle emotional storyteller. Tone: soft, honest, close to the listener. Speak about feelings plainly, no melodrama, no preaching.',
    structure: [
      'Hook: name the unsaid feeling around the topic',
      'Say it out loud: what really hurts is not conflict, but long silence',
      'Other side: the other person is also waiting for you to speak first',
      'Do this: one small honest sentence is enough, real beats perfect',
      'Close: a regret that one sentence could prevent, so say it now',
    ],
    local: {
      zh: [
        { headline: '有些话一直没说', narration: '关于「{topic}」，很多人不是不在意，而是不知道怎么说出口。' },
        { headline: '先说破它', narration: '关系里最伤人的，从来不是争吵，而是长时间的不表达。' },
        { headline: '换个角度看', narration: '你以为对方懂，其实对方也在等你先开口。沉默，很容易被误读成冷漠。' },
        { headline: '可以这样做', narration: '不用长篇大论。一句「我最近有点想你」就够了。真实，比完美更有用。' },
        { headline: '最后想说的', narration: '有些遗憾，只需要一句话就能避免。关于「{topic}」，现在就告诉他吧。' },
      ],
      'zh-Hant': [
        { headline: '有些話一直沒說', narration: '關於「{topic}」，很多人不是不在意，而是不知道怎麼說出口。' },
        { headline: '先說破它', narration: '關係裡最傷人的，從來不是爭吵，而是長時間的不表達。' },
        { headline: '換個角度看', narration: '你以為對方懂，其實對方也在等你先開口。沉默，很容易被誤讀成冷漠。' },
        { headline: '可以這樣做', narration: '不用長篇大論。一句「我最近有點想你」就夠了。真實，比完美更有用。' },
        { headline: '最後想說的', narration: '有些遺憾，只需要一句話就能避免。關於「{topic}」，現在就告訴他吧。' },
      ],
      en: [
        { headline: 'There is something unsaid', narration: 'About "{topic}", many people do care. They just do not know how to say it out loud.' },
        { headline: 'Let us name it', narration: 'What hurts relationships is never the argument. It is the long silence around it.' },
        { headline: 'Look from the other side', narration: 'You assume they understand. But they are waiting for you to speak first. Silence reads as coldness.' },
        { headline: 'What you can do', narration: 'It does not take a speech. One honest sentence is enough. Real beats perfect.' },
        { headline: 'One last thing', narration: 'Some regrets only need one sentence to avoid. About "{topic}", say it now.' },
      ],
    },
  },
  {
    id: 'novel',
    accent: '#ffb020',
    visual: { from: '#14100a', to: '#4a2c10', accent: '#ffb020', layout: 'paper', titleSize: 90, bold: true, paper: '#f7f2e8', ink: '#251c0d' },
    imageStyle:
      'Cinematic photorealistic photography, dramatic chiaroscuro lighting, dark moody film noir atmosphere, deep shadows, amber highlights, no text',
    bgmMood: 'calm',
    rate: '+2%',
    pitch: '-2Hz',
    prefersClonedVoice: false,
    persona:
      'A gripping novel narrator. Tone: cinematic, suspenseful, second person tension. Every scene must end with a hook that pulls the viewer forward.',
    structure: [
      'Hook: open with a dramatic year or moment around the topic',
      'Conflict: the protagonist thinks the exit is open, but it is not',
      'Twist: a small overlooked detail flips the whole story',
      'Climax: everyone thinks it is over, only one person knows the game just began',
      'Cliffhanger: end on an unfinished image, do not resolve it',
    ],
    local: {
      zh: [
        { headline: '故事从这一天开始', narration: '那一年，「{topic}」改变了所有人的命运，也让一个普通人再也回不到从前。' },
        { headline: '他以为还有退路', narration: '他以为只要守住底线就能全身而退，却没想到，退路早就被人堵死了。' },
        { headline: '转折藏在一个细节里', narration: '转折发生在一个不起眼的细节里——那封信的落款日期，比寄出时间还要晚。' },
        { headline: '所有人都以为结束了', narration: '所有人都以为结局已定，只有他知道，真正的棋局才刚刚开始。' },
        { headline: '而真正的悬念是', narration: '他抬起头，看见门口站着的那个人，忽然笑了。关于「{topic}」的故事，这才刚刚开始。' },
      ],
      'zh-Hant': [
        { headline: '故事從這一天開始', narration: '那一年，「{topic}」改變了所有人的命運，也讓一個普通人再也回不到從前。' },
        { headline: '他以為還有退路', narration: '他以為只要守住底線就能全身而退，卻沒想到，退路早就被人堵死了。' },
        { headline: '轉折藏在一個細節裡', narration: '轉折發生在一個不起眼的細節裡——那封信的落款日期，比寄出時間還要晚。' },
        { headline: '所有人都以為結束了', narration: '所有人都以為結局已定，只有他知道，真正的棋局才剛剛開始。' },
        { headline: '而真正的懸念是', narration: '他抬起頭，看見門口站著的那個人，忽然笑了。關於「{topic}」的故事，這才剛剛開始。' },
      ],
      en: [
        { headline: 'It started on that day', narration: 'That year, "{topic}" changed everyone\'s fate, and one ordinary man could never go back.' },
        { headline: 'He thought there was a way out', narration: 'He believed he could hold the line and walk away. He did not know the exit had been sealed long before.' },
        { headline: 'The twist hides in a detail', narration: 'It turned on a detail nobody noticed: the letter was dated later than the day it was sent.' },
        { headline: 'Everyone thought it was over', narration: 'Everyone thought the outcome was settled. Only he knew the real game had just begun.' },
        { headline: 'And the real hook is', narration: 'He looked up, saw the figure standing in the doorway, and smiled. The story of "{topic}" was only starting.' },
      ],
    },
  },
  {
    id: 'science',
    accent: '#25d0c0',
    visual: { from: '#08131a', to: '#0f4a52', accent: '#25d0c0', layout: 'grid', titleSize: 86, bold: true, paper: '#f1f7f7', ink: '#0b2427' },
    imageStyle:
      'Cinematic photorealistic macro photography, clean teal laboratory lighting, crisp focus, high-tech aesthetic, shallow depth of field, no text',
    bgmMood: 'calm',
    rate: '+2%',
    pitch: '+0Hz',
    prefersClonedVoice: false,
    persona:
      'A clear science communicator. Tone: curious, precise, friendly. Always give a mechanism with conditions, and correct one common misconception.',
    structure: [
      'Hook: a counter-intuitive fact about the topic',
      'Mechanism: it needs three conditions at once, and fails without any one',
      'Everyday proof: where the viewer already meets it without noticing',
      'Misconception: people mistake it for coincidence, it is actually predictable',
      'Close: understanding it saves you real-life tuition',
    ],
    local: {
      zh: [
        { headline: '先给你一个反直觉的结论', narration: '关于「{topic}」，先给你一个可能颠覆认知的结论，它和你的直觉大概率相反。' },
        { headline: '原理其实不复杂', narration: '背后的机制并不神秘：它需要三个条件同时成立，缺任何一个，都不会发生。' },
        { headline: '你每天都在接触它', narration: '你其实每天都在接触「{topic}」，只是从未注意——从早晨第一杯水，到睡前的最后一次滑动。' },
        { headline: '最大的误区', narration: '最大的误区是把它当作偶然。事实上它高度可预测，只是我们缺少观察它的角度。' },
        { headline: '记住这一点', narration: '理解「{topic}」，不是为了考试，而是为了在生活里少交学费。' },
      ],
      'zh-Hant': [
        { headline: '先給你一個反直覺的結論', narration: '關於「{topic}」，先給你一個可能顛覆認知的結論，它和你的直覺大概率相反。' },
        { headline: '原理其實不複雜', narration: '背後的機制並不神秘：它需要三個條件同時成立，缺任何一個，都不會發生。' },
        { headline: '你每天都在接觸它', narration: '你其實每天都在接觸「{topic}」，只是從未注意——從早晨第一杯水，到睡前的最後一次滑動。' },
        { headline: '最大的誤區', narration: '最大的誤區是把它當作偶然。事實上它高度可預測，只是我們缺少觀察它的角度。' },
        { headline: '記住這一點', narration: '理解「{topic}」，不是為了考試，而是為了在生活裡少交學費。' },
      ],
      en: [
        { headline: 'A counter-intuitive fact first', narration: 'About "{topic}", here is a conclusion that likely flips your intuition.' },
        { headline: 'The mechanism is simple', narration: 'Nothing mystical behind it: three conditions must hold at once. Remove any one and it never happens.' },
        { headline: 'You meet it every day', narration: 'You already meet "{topic}" daily without noticing, from your first glass of water to your last swipe before sleep.' },
        { headline: 'The biggest misconception', narration: 'The biggest mistake is treating it as coincidence. It is highly predictable. We just lack the angle to see it.' },
        { headline: 'Remember this one thing', narration: 'Understanding "{topic}" is not for passing tests. It is for paying less tuition in real life.' },
      ],
    },
  },
  {
    id: 'side-hustle',
    accent: '#a06bff',
    visual: { from: '#120f26', to: '#3a1f63', accent: '#a06bff', layout: 'cinema', titleSize: 88, bold: true, paper: '#f6f3fb', ink: '#1d1330' },
    imageStyle:
      'Cinematic photorealistic photography, urban dusk cityscape, vibrant neon and warm accent lighting, energetic entrepreneurial mood, no text',
    bgmMood: 'energetic',
    rate: '+8%',
    pitch: '+2Hz',
    prefersClonedVoice: false,
    persona:
      'A pragmatic money-making mentor. Tone: energetic, street-smart, zero hype. Always talk numbers, minimum cost, and validation before building.',
    structure: [
      'Hook: if you want your first income from the topic, do not quit your job yet',
      'Reality: a side hustle is a low-cost experiment, not a second job',
      'Method: sell before you build, find three people who will actually pay',
      'Pitfall: the usual failure is over-investing at the very start',
      'Close: run it like a small business, not a dream',
    ],
    local: {
      zh: [
        { headline: '先别急着辞职', narration: '如果你也想靠「{topic}」赚到第一笔钱，先别急着辞职，先把流程跑通。' },
        { headline: '副业的真相', narration: '副业不是第二份工作，而是一次低成本试验。用最小的投入，验证真实的需求。' },
        { headline: '先卖，再做', narration: '在动手之前，先找到三个愿意付钱的人。有人付钱，才叫需求；只是说好，那是客气。' },
        { headline: '最容易踩的坑', narration: '最常见的失败不是能力不够，而是一开始就投入太多，钱和时间都被套住了。' },
        { headline: '把它当成一门生意', narration: '从今天起，把「{topic}」当成一门小生意来经营，而不是一个梦想。算清楚成本和回报，再谈热爱。' },
      ],
      'zh-Hant': [
        { headline: '先別急著辭職', narration: '如果你也想靠「{topic}」賺到第一筆錢，先別急著辭職，先把流程跑通。' },
        { headline: '副業的真相', narration: '副業不是第二份工作，而是一次低成本試驗。用最小的投入，驗證真實的需求。' },
        { headline: '先賣，再做', narration: '在動手之前，先找到三個願意付錢的人。有人付錢，才叫需求；只是說好，那是客氣。' },
        { headline: '最容易踩的坑', narration: '最常見的失敗不是能力不夠，而是一開始就投入太多，錢和時間都被套住了。' },
        { headline: '把它當成一門生意', narration: '從今天起，把「{topic}」當成一門小生意來經營，而不是一個夢想。算清楚成本和回報，再談熱愛。' },
      ],
      en: [
        { headline: 'Do not quit your job yet', narration: 'If you want your first income from "{topic}", do not quit your job yet. First, make the process work.' },
        { headline: 'The truth about side hustles', narration: 'A side hustle is not a second job. It is a low-cost experiment. Invest the minimum to test real demand.' },
        { headline: 'Sell before you build', narration: 'Before you build anything, find three people who will actually pay. Paying means demand. Saying "sounds good" means politeness.' },
        { headline: 'The most common trap', narration: 'Most people fail not from lack of skill, but from over-investing at day one. Money and time both get locked up.' },
        { headline: 'Run it like a business', narration: 'Starting today, run "{topic}" as a small business, not a dream. Do the math on cost and return first, then talk about passion.' },
      ],
    },
  },
  {
    id: 'history',
    accent: '#d4a24a',
    visual: { from: '#0f0d08', to: '#3a2f18', accent: '#d4a24a', layout: 'scroll', titleSize: 90, bold: false, paper: '#f6f1e6', ink: '#241c0d' },
    imageStyle:
      'Cinematic photorealistic photography, sepia-toned vintage atmosphere, classical architecture, dust particles in dramatic light beams, no text',
    bgmMood: 'warm',
    rate: '-2%',
    pitch: '-2Hz',
    prefersClonedVoice: false,
    persona:
      'A well-read history narrator. Tone: measured, evocative, authoritative but never dry. Always zoom from a single moment out to the century it changed.',
    structure: [
      'Hook: start the story of the topic on an ordinary-looking day',
      'Context: the old order has not collapsed, the new rules are not written',
      'Key figure: the turning point lands on someone nobody expected',
      'Turning point: the decisive moment is short but rewrites centuries',
      'Close: history does not repeat, it rhymes, the answer may be in the past',
    ],
    local: {
      zh: [
        { headline: '一切从这一天开始', narration: '「{topic}」的故事，要从一个看似平常的日子说起。' },
        { headline: '那时的世界正在剧变', narration: '当时的世界正在剧烈变动：旧的秩序还没有崩塌，新的规则也尚未建立。' },
        { headline: '关键落在一个人身上', narration: '局势的走向，最终落在一个谁都没预料到的人身上。' },
        { headline: '决定性的时刻很短', narration: '真正决定走向的时刻往往很短，却改写了之后几百年的格局。' },
        { headline: '回望', narration: '历史从不重复，但它押韵。今天我们关于「{topic}」的难题，答案或许早就写在过去。' },
      ],
      'zh-Hant': [
        { headline: '一切從這一天開始', narration: '「{topic}」的故事，要從一個看似平常的日子說起。' },
        { headline: '那時的世界正在劇變', narration: '當時的世界正在劇烈變動：舊的秩序還沒有崩塌，新的規則也尚未建立。' },
        { headline: '關鍵落在一個人身上', narration: '局勢的走向，最終落在一個誰都沒預料到的人身上。' },
        { headline: '決定性的時刻很短', narration: '真正決定走向的時刻往往很短，卻改寫了之後幾百年的格局。' },
        { headline: '回望', narration: '歷史從不重複，但它押韻。今天我們關於「{topic}」的難題，答案或許早就寫在過去。' },
      ],
      en: [
        { headline: 'It began on an ordinary day', narration: 'The story of "{topic}" starts on a day that looked completely ordinary.' },
        { headline: 'The world was shifting', narration: 'The old order had not yet collapsed, and the new rules were not yet written.' },
        { headline: 'It landed on one person', narration: 'The course of events finally came down to a person nobody had expected.' },
        { headline: 'The decisive moment was short', narration: 'The moment that truly decided the outcome was brief, yet it rewrote the next few centuries.' },
        { headline: 'Looking back', narration: 'History never repeats, but it rhymes. The answer to our problem about "{topic}" may already be written in the past.' },
      ],
    },
  },
  {
    /**
     * 数字人带货短视频（第 8 类，参考 Pixelle-Video 的 digital-human 通道）。
     * 不走 renderAiVideo 渲染管线，由前端编排 /api/digital-human/* 真人级口播：
     * LLM 压缩口播稿（≤72 字）→ TTS 音色 → wan2.2-s2v 参考图生视频。
     * visual/imageStyle 等字段仅为类型完备（模板卡片预览用），不参与渲染。
     */
    id: 'digital-human',
    accent: '#f5c542',
    visual: { from: '#1a1206', to: '#4a3208', accent: '#f5c542', layout: 'cinema', titleSize: 88, bold: true, paper: '#f8f3e8', ink: '#2a1e08' },
    imageStyle: 'Cinematic photorealistic studio portrait, professional presenter, warm key lighting, e-commerce livestream aesthetic',
    bgmMood: 'energetic',
    rate: '+8%',
    pitch: '+2Hz',
    prefersClonedVoice: true,
    persona:
      'An energetic live-commerce host. Tone: enthusiastic but trustworthy, like a friend recommending something they genuinely use. Concrete benefits, honest urgency, zero hard-sell clichés.',
    structure: [
      'Hook: open with the strongest benefit of the topic in one sentence',
      'Pain: name the everyday problem the viewer faces without it',
      'Value: give the concrete reason it works, in plain words',
      'Action: tell the viewer exactly what to do next, right now',
    ],
    local: {
      zh: [
        { headline: '开场钩子', narration: '关于「{topic}」，今天必须告诉你它到底好在哪。' },
        { headline: '说痛点', narration: '没有它的日子，你是不是总在为同一个问题反复烦恼？' },
        { headline: '讲卖点', narration: '它真正厉害的地方，是又快又稳，用了都说回不去。' },
        { headline: '促行动', narration: '别犹豫了，现在就试一试「{topic}」，你会回来谢我。' },
      ],
      'zh-Hant': [
        { headline: '開場鉤子', narration: '關於「{topic}」，今天必須告訴你它到底好在哪。' },
        { headline: '說痛點', narration: '沒有它的日子，你是不是總在為同一個問題反覆煩惱？' },
        { headline: '講賣點', narration: '它真正厲害的地方，是又快又穩，用了都說回不去。' },
        { headline: '促行動', narration: '別猶豫了，現在就試一試「{topic}」，你會回來謝我。' },
      ],
      en: [
        { headline: 'Hook', narration: 'Here is why "{topic}" is the upgrade nobody told you about.' },
        { headline: 'Pain', narration: 'Without it, you keep fighting the same problem over and over.' },
        { headline: 'Value', narration: 'What makes it great: fast, reliable, and once you try it there is no going back.' },
        { headline: 'Action', narration: 'Stop waiting. Try "{topic}" now, and thank me later.' },
      ],
    },
  },
];

export function resolveAiVideoTemplate(id?: string | null): AiVideoTemplate {
  const found = AI_VIDEO_TEMPLATES.find((t) => t.id === id);
  return found || AI_VIDEO_TEMPLATES.find((t) => t.id === DEFAULT_AI_VIDEO_TEMPLATE)!;
}

export function isAiVideoTemplateId(id: unknown): id is AiVideoTemplateId {
  return typeof id === 'string' && AI_VIDEO_TEMPLATES.some((t) => t.id === id);
}