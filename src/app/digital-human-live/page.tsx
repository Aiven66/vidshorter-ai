'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCredits } from '@/lib/credits-context';
import { UrlExtractor, preloadImage } from '@/components/video-templates';
import {
  TalkingVideoRenderer,
  PHOTO_AVATARS,
  VOICE_CATALOG,
  computeEnvelope,
  type PhotoAvatarSpec,
  type PhotoAvatarGender,
  type TalkingSceneData,
} from '@/components/video-templates/talking-avatar';
import { SocialShare } from '@/components/video-templates/social-share';
import { CloudDigitalHumanStudio } from '@/components/digital-human/cloud-studio';
import { useLocale } from '@/lib/locale-context';
import {
  Megaphone,
  Sparkles,
  Users,
  Link as LinkIcon,
  UserRound,
  User,
  Mic,
  RefreshCw,
  Loader2,
  ImagePlus,
  X,
  Plus,
  Play,
  Square,
  Package,
  Globe2,
  Clapperboard,
  PersonStanding,
  Download,
  MonitorDown,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* 类型                                                                */
/* ------------------------------------------------------------------ */

interface ProductHighlight {
  title: string;
  detail: string;
}

interface ProductApiResponse {
  ok: boolean;
  product?: {
    name: string;
    price?: string;
    originalPrice?: string;
    currency?: string;
    priceDisplay?: string;
    originalPriceDisplay?: string;
    image?: string;
    images?: string[];
    description?: string;
    brand?: string;
    highlights?: ProductHighlight[];
    rating?: string;
    reviewCount?: string;
  };
  error?: string;
}

/** 口播文案行（生成前，文本可编辑） */
interface ScriptLine {
  kind: 'greeting' | 'highlight' | 'price' | 'cta';
  text: string;
  label: string;
  highlight?: { title: string; detail?: string };
  price?: { display: string; original?: string };
}

/** 精简商品名（字幕/卡片用） */
function shortProductName(name: string): string {
  const firstSegment = name.split(/\s+[-–|]\s+/)[0].trim();
  const base = firstSegment.length >= 12 ? firstSegment : name.trim();
  return base.length > 60 ? base.slice(0, 60).replace(/\s+\S*$/, '') + '…' : base;
}

/* ------------------------------------------------------------------ */
/* 真人数字人模式（桌面端专属）                                          */
/* ------------------------------------------------------------------ */

interface DesktopBridge {
  realHumanStatus: () => Promise<RealHumanStatus>;
  realHumanDownloadModels: () => Promise<{ ok: boolean; cached?: boolean }>;
  realHumanListHosts: () => Promise<{ hosts: RealHumanHost[] }>;
  realHumanGenerate: (input: RealHumanGenerateInput) => Promise<RealHumanGenerateResult>;
  realHumanCancel: () => Promise<{ ok: boolean }>;
  onRealHumanEvent: (cb: (p: RealHumanEvent) => void) => () => void;
  getMediaBaseUrl: () => Promise<string>;
}

interface RealHumanHost {
  id: string;
  file: string;
  gender: string;
  region: string;
  label: string;
  available?: boolean;
}

interface RealHumanStatus {
  ready: boolean;
  downloaded: number;
  total: number;
  models?: { name: string; ready: boolean }[];
  hosts?: RealHumanHost[];
  generating?: boolean;
  engine?: { provider: string; local: boolean; ready: boolean; sizeBytes?: number };
}

interface RealHumanGenerateInput {
  script: string;
  hostId: string;
  locale: string;
  voice?: string;
  overlays?: { type: 'text'; from: number; to: number; text: string; size?: number; color?: string }[];
  productImages?: string[];
}

interface RealHumanGenerateResult {
  ok: boolean;
  outPath?: string;
  outUrl?: string;
  durationMs?: number;
}

interface RealHumanEvent {
  stage: 'download' | 'runtime' | 'models' | 'tts' | 'local-product' | 'local-lipsync' | 'quality-check' | 'done';
  pct?: number;
  file?: string;
  fileIndex?: number;
  fileTotal?: number;
  frame?: number;
  total?: number;
  outUrl?: string;
}

/** 桌面端 bridge（仅 macOS 客户端注入） */
function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { clipopDesktop?: DesktopBridge; vidshorterDesktop?: DesktopBridge };
  const b = w.clipopDesktop || w.vidshorterDesktop;
  return b && typeof b.realHumanStatus === 'function' ? b : null;
}

/** 按语种估算口播语速（字/秒），用于字幕 overlay 分配时间轴 */
function estimateLineSeconds(text: string, localeKey: string): number {
  const cjk = /^zh|ja|ko/i.test(localeKey);
  const rate = cjk ? 4.2 : 13;
  return Math.max(1.6, Math.min(12, text.length / rate + 0.5));
}

/* ------------------------------------------------------------------ */
/* 多语言带货口播文案模板（跟随所选声音语言）                              */
/* ------------------------------------------------------------------ */

interface LiveScriptTemplate {
  /** 声线试听语句 */
  sample: string;
  greeting: (name: string, brand: string) => string;
  hlPrefix: (n: number) => string;
  priceWith: (price: string, original: string) => string;
  priceOnly: (price: string) => string;
  cta: string;
  labelGreeting: string;
  labelHighlight: (n: number) => string;
  labelPrice: string;
  labelCta: string;
  /** 无卖点时的兜底口播（2 条） */
  fallbackHl: (name: string) => [string, string];
}

const EN_TEMPLATE: LiveScriptTemplate = {
  sample: 'Hello! Nice to meet you — this is my voice preview.',
  greeting: (n, b) => `Stop scrolling! This ${n} from ${b} is a total game-changer!`,
  hlPrefix: (n) => `Selling point number ${n}: `,
  priceWith: (p, o) => `Order now for just ${p}, down from ${o} — limited time offer!`,
  priceOnly: (p) => `Now only ${p} — don't miss out!`,
  cta: 'Love it? Tap the link below and grab yours now!',
  labelGreeting: 'Hot Pick',
  labelHighlight: (n) => `Point ${n}`,
  labelPrice: 'Special Price',
  labelCta: 'Shop Now',
  fallbackHl: (n) => [
    `The ${n} looks and feels premium — the details really stand out.`,
    `Customers keep coming back for this one — it's that good!`,
  ],
};

const SCRIPT_TEMPLATES: Record<string, LiveScriptTemplate> = {
  'zh-CN': {
    sample: '你好，很高兴认识你，这是我的声音预览。',
    greeting: (n, b) => `别划走！${b} 这款 ${n}，用过就回不去了！`,
    hlPrefix: (n) => `第${n}个卖点：`,
    priceWith: (p, o) => `现在下单只要 ${p}，原价 ${o}，限时特惠，手慢无！`,
    priceOnly: (p) => `现在下单只要 ${p}，手慢无！`,
    cta: '喜欢的宝子点击下方链接，马上把它带回家！',
    labelGreeting: '爆款好物',
    labelHighlight: (n) => `卖点 ${n}`,
    labelPrice: '限时特惠',
    labelCta: '立即下单',
    fallbackHl: (n) => [
      `这款 ${n} 做工细节非常在线，上手第一眼就有质感。`,
      '回购率超高的宝藏单品，用过都说值！',
    ],
  },
  'zh-TW': {
    sample: '你好，很高興認識你，這是我的聲音預覽。',
    greeting: (n, b) => `別滑走！${b} 這款 ${n}，用過就回不去了！`,
    hlPrefix: (n) => `第${n}個賣點：`,
    priceWith: (p, o) => `現在下單只要 ${p}，原價 ${o}，限時優惠，手慢無！`,
    priceOnly: (p) => `現在下單只要 ${p}，手慢無！`,
    cta: '喜歡的話點擊下方連結，馬上帶回家！',
    labelGreeting: '爆款好物',
    labelHighlight: (n) => `賣點 ${n}`,
    labelPrice: '限時優惠',
    labelCta: '立即下單',
    fallbackHl: (n) => [
      `這款 ${n} 做工細節非常在線，第一眼就有質感。`,
      '回購率超高的寶藏單品，用過都說值！',
    ],
  },
  'en-US': EN_TEMPLATE,
  'en-GB': EN_TEMPLATE,
  'ja-JP': {
    sample: 'こんにちは、はじめまして。これが私の声のプレビューです。',
    greeting: (n, b) => `スクロール停止！${b}の${n}、使ったら戻れません！`,
    hlPrefix: (n) => `おすすめポイント${n}つ目：`,
    priceWith: (p, o) => `今なら${p}、通常価格${o}の限定セール中です！`,
    priceOnly: (p) => `今なら${p}でご提供中！お見逃しなく！`,
    cta: '気になった方は下のリンクから今すぐチェック！',
    labelGreeting: 'おすすめ',
    labelHighlight: (n) => `ポイント${n}`,
    labelPrice: '特別価格',
    labelCta: '今すぐ購入',
    fallbackHl: (n) => [
      `${n}は仕上がりが高級感たっぷり。細部までこだわりを感じます。`,
      'リピート率の高い隠れた名品。使った人はみんな高評価！',
    ],
  },
  'ko-KR': {
    sample: '안녕하세요, 만나서 반갑습니다. 제 목소리 미리듣기입니다.',
    greeting: (n, b) => `잠깐만요! ${b}의 ${n}, 써보면 못 돌아가요!`,
    hlPrefix: (n) => `포인트 ${n}번: `,
    priceWith: (p, o) => `지금 주문하면 ${p}, 정가 ${o}에서 할인된 특가!`,
    priceOnly: (p) => `지금 ${p} 특가! 서두르세요!`,
    cta: '마음에 드셨나요? 아래 링크에서 바로 만나보세요!',
    labelGreeting: '추천템',
    labelHighlight: (n) => `포인트 ${n}`,
    labelPrice: '특가',
    labelCta: '지금 구매',
    fallbackHl: (n) => [
      `${n}은 마감이 고급스러워요. 디테일이 살아있습니다.`,
      '재구매율 높은 숨은 명품! 사용자들 모두 만족!',
    ],
  },
  'fr-FR': {
    sample: 'Bonjour, enchanté ! Voici un aperçu de ma voix.',
    greeting: (n, b) => `Ne partez pas ! Ce ${n} de ${b} va tout changer !`,
    hlPrefix: (n) => `Point fort numéro ${n} : `,
    priceWith: (p, o) => `Commandez maintenant pour ${p} au lieu de ${o} — offre limitée !`,
    priceOnly: (p) => `À seulement ${p} — ne passez pas à côté !`,
    cta: 'Tenté ? Cliquez sur le lien ci-dessous et commandez-le !',
    labelGreeting: 'Coup de cœur',
    labelHighlight: (n) => `Point ${n}`,
    labelPrice: 'Prix spécial',
    labelCta: 'Commander',
    fallbackHl: (n) => [
      `Le ${n} respire la qualité — les finitions sont impeccables.`,
      'Un best-seller que nos clients recommandent encore et encore !',
    ],
  },
  'de-DE': {
    sample: 'Hallo, schön, dich kennenzulernen — das ist meine Sprachvorschau.',
    greeting: (n, b) => `Nicht weiter scrollen! Dieses ${n} von ${b} ist ein absoluter Game-Changer!`,
    hlPrefix: (n) => `Highlight Nummer ${n}: `,
    priceWith: (p, o) => `Jetzt für nur ${p} statt ${o} sichern — nur für kurze Zeit!`,
    priceOnly: (p) => `Jetzt nur ${p} — nicht verpassen!`,
    cta: 'Überzeugt? Klicke auf den Link unten und hol ihn dir!',
    labelGreeting: 'Top-Tipp',
    labelHighlight: (n) => `Highlight ${n}`,
    labelPrice: 'Sonderpreis',
    labelCta: 'Jetzt kaufen',
    fallbackHl: (n) => [
      `Das ${n} wirkt hochwertig — die Details überzeugen auf ganzer Linie.`,
      'Ein Bestseller, den unsere Kunden immer wieder kaufen!',
    ],
  },
  'es-ES': {
    sample: '¡Hola! Encantado de conocerte, esta es la vista previa de mi voz.',
    greeting: (n, b) => `¡No te vayas! Este ${n} de ${b} lo cambia todo.`,
    hlPrefix: (n) => `Punto fuerte número ${n}: `,
    priceWith: (p, o) => `Pídelo ahora por solo ${p} en vez de ${o} — ¡oferta por tiempo limitado!`,
    priceOnly: (p) => `¡Ahora solo ${p} — no te lo pierdas!`,
    cta: '¿Te encanta? Toca el enlace de abajo y ¡pídelo ya!',
    labelGreeting: 'Top ventas',
    labelHighlight: (n) => `Punto ${n}`,
    labelPrice: 'Oferta',
    labelCta: 'Comprar ya',
    fallbackHl: (n) => [
      `El ${n} se ve premium — los detalles hablan por sí solos.`,
      '¡Un producto que nuestros clientes repiten una y otra vez!',
    ],
  },
  'pt-BR': {
    sample: 'Olá! Prazer em conhecê-lo, esta é a prévia da minha voz.',
    greeting: (n, b) => `Pare de rolar! Esse ${n} da ${b} é incrível!`,
    hlPrefix: (n) => `Ponto forte número ${n}: `,
    priceWith: (p, o) => `Peça agora por apenas ${p}, antes ${o} — por tempo limitado!`,
    priceOnly: (p) => `Por apenas ${p} — não perca!`,
    cta: 'Gostou? Toque no link abaixo e garanta o seu!',
    labelGreeting: 'Queridinho',
    labelHighlight: (n) => `Ponto ${n}`,
    labelPrice: 'Oferta',
    labelCta: 'Comprar',
    fallbackHl: (n) => [
      `O ${n} tem acabamento premium — os detalhes impressionam.`,
      'Um sucesso que os clientes compram de novo e de novo!',
    ],
  },
  'it-IT': {
    sample: 'Ciao! Piacere di conoscerti, questa è l’anteprima della mia voce.',
    greeting: (n, b) => `Non srollare! Questo ${n} di ${b} è fantastico!`,
    hlPrefix: (n) => `Punto di forza numero ${n}: `,
    priceWith: (p, o) => `Ordinalo ora a soli ${p} invece di ${o} — offerta a tempo limitato!`,
    priceOnly: (p) => `Ora a soli ${p} — non fartelo scappare!`,
    cta: 'Ti piace? Tocca il link qui sotto e prendilo subito!',
    labelGreeting: 'Top',
    labelHighlight: (n) => `Punto ${n}`,
    labelPrice: 'Offerta',
    labelCta: 'Acquista',
    fallbackHl: (n) => [
      `Il ${n} ha una finitura premium — i dettagli fanno la differenza.`,
      'Un bestseller che i clienti ricomprano continuamente!',
    ],
  },
  'ru-RU': {
    sample: 'Привет! Рад познакомиться — это демо моего голоса.',
    greeting: (n, b) => `Не пролистывай! Этот ${n} от ${b} — просто находка!`,
    hlPrefix: (n) => `Преимущество №${n}: `,
    priceWith: (p, o) => `Закажите сейчас всего за ${p} вместо ${o} — акция ограничена!`,
    priceOnly: (p) => `Сейчас всего ${p} — не упустите!`,
    cta: 'Понравилось? Жми на ссылку ниже и забирай!',
    labelGreeting: 'Хит',
    labelHighlight: (n) => `Плюс ${n}`,
    labelPrice: 'Скидка',
    labelCta: 'Купить',
    fallbackHl: (n) => [
      `${n} выглядит премиально — качество на высоте.`,
      'Бестселлер, который покупают снова и снова!',
    ],
  },
  'hi-IN': {
    sample: 'नमस्ते! आपसे मिलकर खुशी हुई — यह मेरी आवाज़ का नमूना है।',
    greeting: (n, b) => `रुकिए! ${b} का यह ${n} बहुत शानदार है!`,
    hlPrefix: (n) => `खास बात नंबर ${n}: `,
    priceWith: (p, o) => `अभी ऑर्डर करें सिर्फ ${p}, पहले ${o} — लिमिटेड ऑफर!`,
    priceOnly: (p) => `अभी सिर्फ ${p} — मत छोड़िए!`,
    cta: 'पसंद आया? नीचे लिंक पर टैप करें और अभी लें!',
    labelGreeting: 'बेस्ट',
    labelHighlight: (n) => `बात ${n}`,
    labelPrice: 'ऑफर',
    labelCta: 'अभी खरीदें',
    fallbackHl: (n) => [
      `${n} बिल्कुल प्रीमियम लगता है — फिनिशिंग कमाल की है।`,
      'ग्राहक बार-बार खरीदते हैं — यह उतना ही बढ़िया है!',
    ],
  },
  'id-ID': {
    sample: 'Hai! Senang berkenalan — ini cuplikan suaraku.',
    greeting: (n, b) => `Jangan scroll! ${n} dari ${b} ini luar biasa!`,
    hlPrefix: (n) => `Poin ke-${n}: `,
    priceWith: (p, o) => `Pesan sekarang hanya ${p}, dari ${o} — penawaran terbatas!`,
    priceOnly: (p) => `Sekarang hanya ${p} — jangan sampai kehabisan!`,
    cta: 'Suka? Klik link di bawah dan ambil sekarang!',
    labelGreeting: 'Rekomendasi',
    labelHighlight: (n) => `Poin ${n}`,
    labelPrice: 'Promo',
    labelCta: 'Beli Sekarang',
    fallbackHl: (n) => [
      `${n} terasa premium — detailnya rapi banget.`,
      'Best-seller yang terus dibeli ulang oleh pelanggan!',
    ],
  },
  'th-TH': {
    sample: 'สวัสดี! ยินดีที่ได้รู้จัก นี่คือตัวอย่างเสียงของฉัน',
    greeting: (n, b) => `หยุดเลื่อนก่อน! ${n} จาก ${b} ตัวนี้เรื่องเด็ด!`,
    hlPrefix: (n) => `จุดเด่นข้อที่ ${n}: `,
    priceWith: (p, o) => `สั่งเลยวันนี้เพียง ${p} จากราคา ${o} — ส่วนลดพิเศษ!`,
    priceOnly: (p) => `ตอนนี้เพียง ${p} — อย่าพลาด!`,
    cta: 'ชอบไหม? กดลิงก์ด้านล่างแล้วรับเลย!',
    labelGreeting: 'ของมันต้องมี',
    labelHighlight: (n) => `จุดเด่น ${n}`,
    labelPrice: 'ราคาพิเศษ',
    labelCta: 'สั่งซื้อ',
    fallbackHl: (n) => [
      `${n} ดูพรีเมียม งานละเอียดทุกจุด`,
      'สินค้าขายดีที่ลูกค้ากลับมาซื้อซ้ำ!',
    ],
  },
  'vi-VN': {
    sample: 'Xin chào! Rất vui được gặp bạn — đây là giọng nói của tôi.',
    greeting: (n, b) => `Đừng lướt qua! ${n} của ${b} quá tuyệt vời!`,
    hlPrefix: (n) => `Điểm nổi bật thứ ${n}: `,
    priceWith: (p, o) => `Đặt ngay chỉ ${p}, giảm từ ${o} — ưu đãi giới hạn!`,
    priceOnly: (p) => `Giờ chỉ ${p} — đừng bỏ lỡ!`,
    cta: 'Thích rồi? Bấm link bên dưới và mua ngay!',
    labelGreeting: 'Bán chạy',
    labelHighlight: (n) => `Điểm ${n}`,
    labelPrice: 'Giảm giá',
    labelCta: 'Mua ngay',
    fallbackHl: (n) => [
      `${n} nhìn rất xịn — chi tiết cực kỳ chỉn chu.`,
      'Sản phẩm được khách hàng mua đi mua lại!',
    ],
  },
};

/** UI locale → 声线目录 locale（默认声音语言） */
function localeToVoiceLocale(userLocale: string): string {
  const l = (userLocale || 'en').trim();
  const exact = VOICE_CATALOG.find((v) => v.locale.toLowerCase() === l.toLowerCase());
  if (exact) return exact.locale;
  const base = l.split('-')[0].toLowerCase();
  if (base === 'zh') {
    return /^zh-(tw|hk|mo|hant)/i.test(l) ? 'zh-TW' : 'zh-CN';
  }
  const byBase = VOICE_CATALOG.find((v) => v.locale.split('-')[0].toLowerCase() === base);
  if (byBase) return byBase.locale;
  return 'en-US';
}

const TAIL_SECONDS = 0.25;
const FPS = 30;
const MAX_IMAGES = 3;

/* ------------------------------------------------------------------ */
/* 页面                                                                */
/* ------------------------------------------------------------------ */

export default function DigitalHumanLivePage() {
  const { t, locale } = useLocale();
  const { deductCredits } = useCredits();

  /* 商品信息 */
  const [productName, setProductName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [rating, setRating] = useState('');
  const [reviewCount, setReviewCount] = useState('');
  const [highlights, setHighlights] = useState<ProductHighlight[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [mainImageIdx, setMainImageIdx] = useState(0);
  const [autoDetected, setAutoDetected] = useState(false);

  /* 数字人形象 */
  const [avatar, setAvatar] = useState<PhotoAvatarSpec>(PHOTO_AVATARS[0]);
  const [genderFilter, setGenderFilter] = useState<PhotoAvatarGender | 'all'>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');

  /* 声音 */
  const [voiceLocaleKey, setVoiceLocaleKey] = useState(() => localeToVoiceLocale(locale || 'en'));
  const [voiceId, setVoiceId] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  /* 口播文案 */
  const [scriptLines, setScriptLines] = useState<ScriptLine[]>([]);

  /* 生成状态 */
  const [scenes, setScenes] = useState<TalkingSceneData[]>([]);
  const [scenesKey, setScenesKey] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });
  const [genError, setGenError] = useState('');
  const [exportedUrl, setExportedUrl] = useState('');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const genTokenRef = useRef(0);
  const lastGenKeyRef = useRef('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* 真人数字人模式（桌面端） */
  const [mode, setMode] = useState<'photo' | 'real'>('photo');
  const [desktopBridge, setDesktopBridge] = useState<DesktopBridge | null>(null);
  const [rhStatus, setRhStatus] = useState<RealHumanStatus | null>(null);
  const [rhHosts, setRhHosts] = useState<RealHumanHost[]>([]);
  const [rhHostId, setRhHostId] = useState('m_asia');
  const [rhDownloading, setRhDownloading] = useState(false);
  const [rhDownloadPct, setRhDownloadPct] = useState(0);
  const [rhDownloadFile, setRhDownloadFile] = useState('');
  const [rhGenerating, setRhGenerating] = useState(false);
  const [rhProgress, setRhProgress] = useState<{ stage: string; pct: number; frame?: number; total?: number }>({ stage: '', pct: 0 });
  const [rhResultUrl, setRhResultUrl] = useState('');
  const [rhError, setRhError] = useState('');
  const [mediaBase, setMediaBase] = useState('');
  const rhTokenRef = useRef(0);

  /* 桌面端检测 + 模型/主播状态 */
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    setDesktopBridge(bridge);
    bridge.realHumanStatus().then((st) => {
      setRhStatus(st);
      if (st.hosts?.length) {
        setRhHosts(st.hosts);
        setRhHostId((cur) => (st.hosts!.some((h) => h.id === cur) ? cur : (st.hosts![0]?.id ?? cur)));
      }
    }).catch(() => {});
    bridge.getMediaBaseUrl().then(setMediaBase).catch(() => {});
    const off = bridge.onRealHumanEvent((ev) => {
      if (ev.stage === 'download') {
        setRhDownloadPct(ev.pct ?? 0);
        if (ev.file) setRhDownloadFile(ev.file);
      } else {
        setRhProgress({ stage: ev.stage, pct: ev.pct ?? 0, frame: ev.frame, total: ev.total });
        if (ev.stage === 'done' && ev.outUrl) setRhResultUrl(ev.outUrl);
      }
    });
    return off;
  }, []);

  useEffect(() => {
    if (mode === 'real' && images.length > 0) setRhHostId('f_asia');
  }, [mode, images.length]);

  const tr = useCallback(
    (key: string, fallback: string) => {
      const val = t(key);
      return val === key ? fallback : val;
    },
    [t],
  );

  const template = SCRIPT_TEMPLATES[voiceLocaleKey] || EN_TEMPLATE;
  const voiceEntry = VOICE_CATALOG.find((v) => v.locale === voiceLocaleKey) || VOICE_CATALOG[2];
  const voiceOptions = avatar.gender === 'male' ? voiceEntry.male : voiceEntry.female;

  /* 声线默认值：语言或形象性别变化时重置为首个音色 */
  useEffect(() => {
    const entry = VOICE_CATALOG.find((v) => v.locale === voiceLocaleKey);
    if (!entry) return;
    const list = avatar.gender === 'male' ? entry.male : entry.female;
    setVoiceId((cur) => (cur && list.some((o) => o.id === cur) ? cur : (list[0]?.id ?? '')));
  }, [voiceLocaleKey, avatar.gender]);

  /* UI locale 变化时同步默认声音语言（用户未显式改过语言时） */
  const userPickedLangRef = useRef(false);
  useEffect(() => {
    if (!userPickedLangRef.current) {
      setVoiceLocaleKey(localeToVoiceLocale(locale || 'en'));
    }
  }, [locale]);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  }, []);

  /* ---------------- 商品链接提取 ---------------- */

  const handleExtractFromUrl = useCallback(
    async (url: string): Promise<{ ok: boolean }> => {
      try {
        const resp = await fetch('/api/extract-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // 桌面端传媒体服务器地址：Amazon 等 TLS 指纹反爬站点由 Chromium 网络栈代抓
          body: JSON.stringify({ url, locale, desktopProxy: mediaBase || undefined }),
        });
        const data: ProductApiResponse = await resp.json();
        if (!resp.ok || !data.ok || !data.product) {
          return { ok: false };
        }
        const p = data.product;
        if (p.name) setProductName(p.name);
        if (p.priceDisplay) {
          setProductPrice(p.priceDisplay);
        } else if (p.price) {
          const prefix = p.currency && !p.price.startsWith(p.currency) ? p.currency : '';
          setProductPrice(`${prefix}${p.price}`);
        }
        if (p.originalPriceDisplay) setOriginalPrice(p.originalPriceDisplay);
        else if (p.originalPrice) setOriginalPrice(p.originalPrice);
        if (p.brand) setBrandName(p.brand);
        if (p.rating) setRating(p.rating);
        if (p.reviewCount) setReviewCount(p.reviewCount);
        // 图集：链接提取（去重，最多 3 张）+ 预载
        const got = [ ...(p.images ?? []), ...(p.image ? [p.image] : []) ]
          .filter((u, i, arr) => !!u && arr.indexOf(u) === i)
          .slice(0, MAX_IMAGES);
        if (got.length > 0) {
          setImages(got);
          setMainImageIdx(0);
          for (const u of got) void preloadImage(u);
        }
        setHighlights(Array.isArray(p.highlights) ? p.highlights : []);
        setAutoDetected(true);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    [locale, mediaBase],
  );

  /* ---------------- 图片上传 ---------------- */

  const handleUploadImages = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const slots = MAX_IMAGES - images.length;
    const picked = Array.from(files).slice(0, Math.max(0, slots));
    if (picked.length === 0) return;
    let loaded = 0;
    const urls: string[] = [];
    for (const f of picked) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') urls.push(reader.result);
        loaded += 1;
        if (loaded === picked.length) {
          setImages((cur) => [...cur, ...urls].slice(0, MAX_IMAGES));
          if (images.length === 0) setMainImageIdx(0);
        }
      };
      reader.onerror = () => {
        loaded += 1;
        if (loaded === picked.length) {
          setImages((cur) => [...cur, ...urls].slice(0, MAX_IMAGES));
        }
      };
      reader.readAsDataURL(f);
    }
  }, [images.length]);

  const removeImage = useCallback((idx: number) => {
    setImages((cur) => cur.filter((_, i) => i !== idx));
    setMainImageIdx((cur) => {
      if (idx < cur) return cur - 1;
      if (idx === cur) return Math.max(0, cur - 1);
      return cur;
    });
  }, []);

  /* ---------------- 口播文案自动撰写 ---------------- */

  const buildScript = useCallback((): ScriptLine[] => {
    const pName = shortProductName(productName || tr('digitalHuman.productFallback', 'This amazing product'));
    const brand = brandName || tr('digitalHuman.brandFallback', 'Top Brand');
    const price = productPrice || tr('digitalHuman.priceFallback', 'a great price');
    const tpl = template;

    const hlLines: ScriptLine[] = [];
    const srcHl = highlights.filter((h) => h.title.trim());
    const items = srcHl.length > 0
      ? srcHl.slice(0, 3).map((h) => ({ title: h.title.trim(), detail: h.detail?.trim() || '' }))
      : tpl.fallbackHl(pName).map((text) => ({ title: text, detail: '' }));

    items.forEach((h, i) => {
      const spoken = [h.title, h.detail].filter(Boolean).join('. ').slice(0, 180);
      hlLines.push({
        kind: 'highlight',
        text: `${tpl.hlPrefix(i + 1)}${spoken}`,
        label: tpl.labelHighlight(i + 1),
        highlight: { title: h.title, detail: h.detail || undefined },
      });
    });

    const priceLine: ScriptLine = originalPrice
      ? { kind: 'price', text: tpl.priceWith(price, originalPrice), label: tpl.labelPrice, price: { display: price, original: originalPrice } }
      : { kind: 'price', text: tpl.priceOnly(price), label: tpl.labelPrice, price: { display: price } };

    return [
      { kind: 'greeting', text: tpl.greeting(pName, brand), label: tpl.labelGreeting },
      ...hlLines,
      priceLine,
      { kind: 'cta', text: tpl.cta, label: tpl.labelCta },
    ];
  }, [productName, brandName, productPrice, originalPrice, highlights, template, tr]);

  // 商品信息/语言变化 → 防抖自动重写文案
  const scriptDirtyRef = useRef(false);
  useEffect(() => {
    if (!productName && !productPrice && !brandName && highlights.length === 0) return;
    const timer = setTimeout(() => {
      scriptDirtyRef.current = false;
      setScriptLines(buildScript());
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName, brandName, productPrice, originalPrice, highlights, voiceLocaleKey, autoDetected]);

  /* ---------------- 声线试听 ---------------- */

  const handlePreviewVoice = useCallback(async () => {
    // 正在播放 → 停止
    if (previewPlaying) {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      setPreviewPlaying(false);
      return;
    }
    if (!voiceId || previewLoading) return;
    setPreviewLoading(true);
    try {
      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: template.sample, voice: voiceId }),
      });
      if (!resp.ok) throw new Error(`TTS ${resp.status}`);
      const buf = await resp.arrayBuffer();
      const blob = new Blob([buf], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => {
        setPreviewPlaying(false);
        URL.revokeObjectURL(url);
        previewAudioRef.current = null;
      };
      setPreviewPlaying(true);
      await audio.play();
    } catch (err) {
      console.error('[dh-live] voice preview failed:', err);
      setPreviewPlaying(false);
    } finally {
      setPreviewLoading(false);
    }
  }, [voiceId, previewLoading, previewPlaying, template]);

  /* ---------------- 生成视频（逐句 TTS → 场景） ---------------- */

  const scriptKey = useMemo(() => scriptLines.map((l) => l.text).join('␟'), [scriptLines]);
  const genKey = `${avatar.id}|${voiceId}|${scriptKey}`;
  const staleVoice = scenes.length > 0 && lastGenKeyRef.current !== genKey;

  const generateScenes = useCallback(async () => {
    if (scriptLines.length === 0 || !voiceId) return;
    const token = ++genTokenRef.current;
    setGenerating(true);
    setGenError('');
    setExportedUrl('');
    setGenProgress({ done: 0, total: scriptLines.length });

    try {
      // 给旧生成循环 250ms 退出窗口，避免并发 TTS 限流
      await new Promise((r) => setTimeout(r, 250));
      if (genTokenRef.current !== token) return;
      const audioCtx = getAudioCtx();

      const out: TalkingSceneData[] = [];
      for (let i = 0; i < scriptLines.length; i++) {
        if (genTokenRef.current !== token) return;
        const line = scriptLines[i];
        const resp = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: line.text, voice: voiceId }),
        });
        if (!resp.ok) throw new Error(`TTS failed (${resp.status})`);
        const mp3Buf = await resp.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(mp3Buf);
        const envelope = computeEnvelope(audioBuffer, FPS);
        out.push({
          id: `${line.kind}-${i}-${Date.now()}`,
          kind: line.kind,
          subtitle: line.text,
          label: line.label,
          highlight: line.highlight,
          price: line.price,
          audioBuffer,
          envelope,
          duration: audioBuffer.duration + TAIL_SECONDS,
        });
        setGenProgress({ done: i + 1, total: scriptLines.length });
      }
      if (genTokenRef.current !== token) return;
      lastGenKeyRef.current = `${avatar.id}|${voiceId}|${scriptLines.map((l) => l.text).join('␟')}`;
      setScenes(out);
      setScenesKey((k) => k + 1);
    } catch (err) {
      console.error('[dh-live] generate failed:', err);
      if (genTokenRef.current === token) {
        setGenError(tr('digitalHumanLive.ttsFailed', 'Voice synthesis failed. Please try again.'));
      }
    } finally {
      if (genTokenRef.current === token) setGenerating(false);
    }
  }, [scriptLines, voiceId, avatar.id, getAudioCtx, tr]);

  /** 导出成功扣积分 */
  const handleExported = useCallback(() => {
    deductCredits(30);
  }, [deductCredits]);

  /* ---------------- 真人模式：模型下载 ---------------- */

  const handleRhDownload = useCallback(async () => {
    if (!desktopBridge || rhDownloading) return;
    setRhDownloading(true);
    setRhError('');
    setRhDownloadPct(0);
    try {
      await desktopBridge.realHumanDownloadModels();
      const st = await desktopBridge.realHumanStatus();
      setRhStatus(st);
    } catch (err) {
      setRhError(String((err as Error)?.message || err));
    } finally {
      setRhDownloading(false);
    }
  }, [desktopBridge, rhDownloading]);

  /* ---------------- 真人模式：生成视频 ---------------- */

  const handleRhGenerate = useCallback(async () => {
    if (!desktopBridge || rhGenerating) return;
    if (scriptLines.length === 0) return;
    const token = ++rhTokenRef.current;
    setRhGenerating(true);
    setRhError('');
    setRhResultUrl('');
    setRhProgress({ stage: 'models', pct: 0 });
    try {
      // 口播文案 → 旁白 + 时间轴字幕
      let t0 = 0;
      const overlays: { type: 'text'; from: number; to: number; text: string; size?: number; color?: string }[] = [];
      const lines = scriptLines.map((l) => l.text.trim()).filter(Boolean);
      for (const text of lines) {
        const dur = estimateLineSeconds(text, voiceLocaleKey);
        overlays.push({ type: 'text', from: t0, to: t0 + dur, text, size: 40 });
        t0 += dur + 0.15;
      }
      const script = lines.join(/^zh|ja|ko/i.test(voiceLocaleKey) ? '' : ' ');

      // The local physical-holding pipeline uses only the selected product.
      // The backend preserves real fingers and refuses unsupported shapes.
      let productImages: string[] = [];
      try {
        const ordered = [
          images[mainImageIdx] ?? images[0],
          ...images.filter((_, i) => i !== mainImageIdx),
        ].filter(Boolean) as string[];
        const picked = ordered.filter(im => im.startsWith('data:') || /^https?:/i.test(im)).slice(0, 1);
        for (const im of picked) {
          const productResponse = await fetch(im);
          if (!productResponse.ok) throw new Error(`image download failed (${productResponse.status})`);
          const blob = await productResponse.blob();
          if (!blob.type.startsWith('image/') || blob.size < 1024 || blob.size > 20 * 1024 * 1024) {
            throw new Error('invalid product image');
          }
          const up = await fetch(`${mediaBase}/api/upload`, {
            method: 'POST',
            headers: { 'x-filename': 'product.png', 'Content-Type': 'application/octet-stream' },
            body: blob,
          });
          if (!up.ok) throw new Error(`product upload failed (${up.status})`);
          const data = await up.json();
          // media-server stores uploads in /tmp/video-cache/uploads (served back via /api/local-video/<name>)
          const m = String(data.url || '').match(/\/api\/local-video\/(.+)$/);
          if (m) productImages.push(`/tmp/video-cache/uploads/${m[1]}`);
        }
      } catch (error) {
        throw new Error(`${tr('digitalHumanLive.productUploadFailed', 'The product image could not be prepared. Please reselect the main product image and try again.')} ${String((error as Error)?.message || '')}`.trim());
      }
      if (images.length > 0 && productImages.length === 0) {
        throw new Error(tr('digitalHumanLive.productUploadFailed', 'The product image could not be prepared. Please reselect the main product image and try again.'));
      }

      const res = await desktopBridge.realHumanGenerate({
        script,
        hostId: rhHostId,
        locale: voiceLocaleKey,
        voice: voiceId,
        overlays,
        productImages,
      });
      if (rhTokenRef.current !== token) return;
      if (res?.ok && res.outUrl) {
        setRhResultUrl(res.outUrl);
        deductCredits(30);
      } else {
        throw new Error('generation failed');
      }
    } catch (err) {
      if (rhTokenRef.current === token) setRhError(String((err as Error)?.message || err));
    } finally {
      if (rhTokenRef.current === token) setRhGenerating(false);
    }
  }, [desktopBridge, rhGenerating, scriptLines, voiceLocaleKey, voiceId, rhHostId, images, mainImageIdx, mediaBase, deductCredits]);

  /* ---------------- 派生数据 ---------------- */

  const countries = useMemo(() => {
    const map = new Map<string, { code: string; flag: string; name: string }>();
    for (const a of PHOTO_AVATARS) {
      if (!map.has(a.countryCode)) map.set(a.countryCode, { code: a.countryCode, flag: a.flag, name: a.countryName });
    }
    return Array.from(map.values());
  }, []);

  const visibleAvatars = useMemo(
    () => PHOTO_AVATARS.filter((a) =>
      (genderFilter === 'all' || a.gender === genderFilter) &&
      (countryFilter === 'all' || a.countryCode === countryFilter)),
    [genderFilter, countryFilter],
  );

  const hasAnyContent = productName || productPrice || brandName;
  const mainImage = images[mainImageIdx] ?? images[0] ?? null;

  const productInfo = useMemo(
    () => ({
      name: shortProductName(productName || tr('digitalHuman.productFallback', 'This amazing product')),
      image: mainImage,
      priceDisplay: productPrice || null,
      originalPrice: originalPrice || null,
      rating: rating || null,
      reviewCount: reviewCount || null,
      brand: brandName || null,
    }),
    [productName, mainImage, productPrice, originalPrice, rating, reviewCount, brandName, tr],
  );

  const totalVideoSeconds = scenes.reduce((s, sc) => s + sc.duration, 0);

  /* ---------------- 渲染 ---------------- */

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/30">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="mx-auto max-w-6xl">
            {/* Hero */}
            <div className="mb-8 flex flex-col items-center text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Megaphone className="size-3.5" />
                {tr('digitalHumanLive.badge', 'Digital Human Selling')}
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {tr('digitalHumanLive.title', 'Digital Human Selling Video')}
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                {tr('digitalHumanLive.subtitle', 'Paste a product link, pick a digital human host & voice — get a real talking-host selling video with natural gestures.')}
              </p>

              {/* 模式切换：照片数字人 / 真人数字人（桌面端专属） */}
              {desktopBridge && (
                <div className="mt-5 inline-flex items-center rounded-full border border-border bg-card p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setMode('photo')}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                      mode === 'photo' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {tr('digitalHumanLive.modePhoto', 'Photo Avatar')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('real')}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                      mode === 'real' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <PersonStanding className="h-3.5 w-3.5" />
                    {tr('digitalHumanLive.modeReal', 'Real Human')}
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {tr('digitalHumanLive.desktopOnly', 'Desktop')}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* 云端真人数字人（Web 环境；桌面端由本地 MuseTalk 实时口型承担） */}
            {!desktopBridge && <CloudDigitalHumanStudio />}

            {/* ① 商品信息 */}
            <Card className="mb-6 p-4 md:p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Package className="h-4 w-4 text-primary" />
                {tr('digitalHumanLive.productSection', 'Product')}
              </div>

              <UrlExtractor
                labels={{
                  urlLabel: tr('digitalHumanLive.urlLabel', 'Product Link'),
                  urlPlaceholder: tr('digitalHumanLive.urlPlaceholder', 'Paste a product link (JD / Taobao / PDD / Amazon / eBay…)'),
                  button: tr('digitalHumanLive.autoFillBtn', 'AI Read Product Info'),
                  fetching: tr('digitalHumanLive.fetching', 'Reading product info…'),
                  failedHint: tr('digitalHumanLive.fetchFailed', 'Could not read product info from this link.'),
                }}
                onExtract={handleExtractFromUrl}
              />
              {autoDetected ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {tr('digitalHumanLive.autoDetected', 'Smart-detected from URL')}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  {tr('digitalHumanLive.manualHint', 'Manual mode — fill the fields below, upload images, then generate.')}
                </p>
              )}

              {/* 商品图集 */}
              <div className="mt-4 border-t border-border pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-medium text-foreground">{tr('digitalHumanLive.productImages', 'Product Images')}</div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={images.length >= MAX_IMAGES}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    {tr('digitalHumanLive.uploadImage', 'Upload Image')}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleUploadImages(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {images.map((src, idx) => (
                    <div key={`${src.slice(0, 40)}-${idx}`} className="relative">
                      <button
                        type="button"
                        onClick={() => setMainImageIdx(idx)}
                        className={`block h-20 w-20 overflow-hidden rounded-lg border-2 transition-all ${
                          idx === mainImageIdx ? 'border-primary ring-2 ring-primary/30' : 'border-border opacity-80 hover:opacity-100'
                        }`}
                        title={tr('digitalHumanLive.mainImage', 'Main')}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`product-${idx}`} className="h-full w-full object-cover" />
                      </button>
                      {idx === mainImageIdx && (
                        <span className="absolute left-1 top-1 rounded bg-primary px-1 py-0.5 text-[9px] font-semibold text-primary-foreground">
                          {tr('digitalHumanLive.mainImage', 'Main')}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow hover:bg-destructive/90"
                        aria-label="remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {images.length === 0 && (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                      <ImagePlus className="h-6 w-6 opacity-50" />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {tr('digitalHumanLive.imageHint', 'Auto-read from the product link, or upload your own (JPG / PNG, up to 3). Click a thumbnail to set the main image.')}
                </p>
              </div>

              {/* 商品字段 */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={tr('digitalHumanLive.namePlaceholder', 'Product name…')} />
                <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder={tr('digitalHumanLive.brandPlaceholder', 'Brand (optional)')} />
                <div className="grid grid-cols-2 gap-3">
                  <Input value={productPrice} onChange={(e) => setProductPrice(e.target.value)} placeholder={tr('digitalHumanLive.pricePlaceholder', 'Price…')} />
                  <Input value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} placeholder={tr('digitalHumanLive.originalPricePlaceholder', 'Original price')} />
                </div>
              </div>

              {/* 卖点 */}
              <div className="mt-4 border-t border-border pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-medium text-foreground">{tr('digitalHumanLive.highlightsLabel', 'Selling Points')}</div>
                  <button
                    type="button"
                    onClick={() => setHighlights((cur) => [...cur, { title: '', detail: '' }])}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                  >
                    <Plus className="h-3 w-3" />
                    {tr('digitalHumanLive.addHighlight', 'Add Selling Point')}
                  </button>
                </div>
                {highlights.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {tr('digitalHumanLive.highlightTitlePlaceholder', 'Selling point title (e.g. 40H Battery Life)')}
                  </p>
                )}
                <div className="space-y-2">
                  {highlights.map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={h.title}
                        onChange={(e) => setHighlights((cur) => cur.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                        placeholder={tr('digitalHumanLive.highlightTitlePlaceholder', 'Selling point title…')}
                        className="flex-1"
                      />
                      <Input
                        value={h.detail}
                        onChange={(e) => setHighlights((cur) => cur.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)))}
                        placeholder={tr('digitalHumanLive.highlightDetailPlaceholder', 'Detail (optional)')}
                        className="hidden flex-1 sm:block"
                      />
                      <button
                        type="button"
                        onClick={() => setHighlights((cur) => cur.filter((_, j) => j !== i))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* ② 数字人形象（照片模式） / 真人主播（真人模式） */}
            <Card className="mb-6 p-4 md:p-6 shadow-sm">
              {mode === 'real' ? (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <PersonStanding className="h-4 w-4 text-primary" />
                      {tr('digitalHumanLive.realHostSection', 'Real Human Host')}
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      {tr('digitalHumanLive.realHostBadge', 'Local AI lip-sync · 100% real person')}
                    </span>
                  </div>

                  {/* 真人主播选择 */}
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {rhHosts.filter((h) => h.available !== false).map((h) => {
                      const selected = rhHostId === h.id;
                      return (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => setRhHostId(h.id)}
                          className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-xs font-medium transition-all ${
                            selected ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent'
                          }`}
                        >
                          {h.gender === 'male' ? <User className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                          <span className="truncate">{h.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {rhHosts.filter((h) => h.available !== false).length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {tr('digitalHumanLive.noHosts', 'No real-human host videos found. Please update the desktop client.')}
                    </p>
                  )}

                  {/* 本地真实持物与口型引擎 */}
                  <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <PersonStanding className="h-3.5 w-3.5 text-primary" />
                        {tr('digitalHumanLive.productAvatarTitle', 'Real Product Holding')}
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {tr('digitalHumanLive.productAvatarLocal', '100% Local')}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">MuseTalk 1.5 · Apple MPS</span>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {tr('digitalHumanLive.productAvatarHint', 'The presenter physically holds a compatible bottle. Clipop replaces only the held object surface while preserving real fingers, occlusion, motion and contact lighting. No cloud key or product-card overlay is used.')}
                    </p>
                  </div>

                  {/* 本地模型管理 */}
                  <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <MonitorDown className="h-3.5 w-3.5 text-primary" />
                        {tr('digitalHumanLive.modelsTitle', 'Local AI Models')}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          rhStatus?.ready ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        }`}>
                          {rhStatus?.ready
                            ? tr('digitalHumanLive.modelsReady', 'Ready')
                            : `${rhStatus?.downloaded ?? 0}/${rhStatus?.total ?? 4}`}
                        </span>
                      </div>
                      {!rhStatus?.ready && (
                        <button
                          type="button"
                          onClick={() => void handleRhDownload()}
                          disabled={rhDownloading}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {rhDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          {rhDownloading
                            ? tr('digitalHumanLive.downloading', 'Downloading…')
                            : tr('digitalHumanLive.downloadModels', 'Download Local Models (~5.5GB, one-time)')}
                        </button>
                      )}
                    </div>
                    {rhDownloading && (
                      <div className="mt-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(rhDownloadPct * 100)}%` }} />
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {rhDownloadFile} · {Math.round(rhDownloadPct * 100)}%
                        </p>
                      </div>
                    )}
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {tr('digitalHumanLive.modelsHint', 'MuseTalk 1.5 rebuilds the speaking face locally on Apple Silicon. A shape and occlusion quality gate stops unsupported product videos instead of producing fake hands or double mouths.')}
                    </p>
                  </div>
                </div>
              ) : (
                <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  {tr('digitalHumanLive.hostSection', 'Digital Human Host')}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      { key: 'all' as const, label: tr('digitalHuman.all', 'All'), icon: Users },
                      { key: 'female' as const, label: tr('digitalHuman.female', 'Female'), icon: UserRound },
                      { key: 'male' as const, label: tr('digitalHuman.male', 'Male'), icon: User },
                    ]
                  ).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setGenderFilter(key)}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        genderFilter === key ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                  <span className="mx-1 h-4 w-px bg-border" />
                  <span className="mr-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Globe2 className="h-3.5 w-3.5" />
                    {tr('digitalHumanLive.countryFilter', 'Country')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCountryFilter('all')}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                      countryFilter === 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {tr('digitalHuman.all', 'All')}
                  </button>
                  {countries.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setCountryFilter(c.code)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                        countryFilter === c.code ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {c.flag} {c.code}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {visibleAvatars.map((a) => {
                  const selected = avatar.id === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAvatar(a)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-xs font-medium transition-all ${
                        selected ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      <span className={`block size-14 overflow-hidden rounded-full border-2 ${selected ? 'border-primary' : 'border-border'}`}>
                        {/* 真人形象照（AI 生成，同源静态资源） */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.photo} alt={a.name} className="size-full object-cover" loading="lazy" />
                      </span>
                      <span className="truncate">{a.name}</span>
                      <span className="text-[10px] text-muted-foreground">{a.flag} {a.countryCode}</span>
                    </button>
                  );
                })}
              </div>
                </>
              )}
            </Card>

            {/* ③ 主播声音（真人模式仅保留语言选择，音色由系统神经语音自动匹配） */}
            <Card className="mb-6 p-4 md:p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Mic className="h-4 w-4 text-primary" />
                {tr('digitalHumanLive.voiceSection', 'Voice')}
              </div>

              {/* 语言 */}
              <div className="mb-3">
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">{tr('digitalHumanLive.voiceLanguage', 'Language')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {VOICE_CATALOG.map((v) => (
                    <button
                      key={v.locale}
                      type="button"
                      onClick={() => {
                        userPickedLangRef.current = true;
                        setVoiceLocaleKey(v.locale);
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        voiceLocaleKey === v.locale ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {locale?.startsWith('zh') ? v.name : v.nameEn}
                    </button>
                  ))}
                </div>
              </div>

              {/* 音色（性别跟随所选形象；真人模式使用 macOS 神经语音自动匹配） */}
              {mode === 'real' ? (
                <p className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                  {tr('digitalHumanLive.realVoiceHint', 'Narration uses macOS neural voices — timbre auto-matches the selected host (male host → male voice). Runs fully offline.')}
                </p>
              ) : (
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {tr('digitalHumanLive.voiceTimbre', 'Timbre')}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    {tr('digitalHumanLive.voiceFollowHost', 'Voice gender follows the host')}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {voiceOptions.map((opt) => {
                    const selected = voiceId === opt.id;
                    return (
                      <div
                        key={opt.id}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-all ${
                          selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:bg-accent'
                        }`}
                      >
                        <button type="button" onClick={() => setVoiceId(opt.id)} className="min-w-0 flex-1 text-left">
                          <div className={`truncate text-xs font-medium ${selected ? 'text-primary' : 'text-foreground'}`}>
                            {locale?.startsWith('zh') ? opt.label : opt.labelEn}
                          </div>
                          <div className="truncate font-mono text-[10px] text-muted-foreground">{opt.id}</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePreviewVoice()}
                          disabled={previewLoading && !previewPlaying}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                            selected ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground hover:bg-accent'
                          }`}
                          title={tr('digitalHumanLive.voicePreview', 'Preview')}
                        >
                          {previewLoading && !previewPlaying ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : previewPlaying ? (
                            <Square className="h-3 w-3" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}
            </Card>

            {/* ④ 带货口播文案 */}
            {scriptLines.length > 0 && (
              <Card className="mb-6 p-4 md:p-6 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Clapperboard className="h-4 w-4 text-primary" />
                    {tr('digitalHumanLive.scriptSection', 'Selling Script')}
                  </div>
                  <button
                    type="button"
                    onClick={() => setScriptLines(buildScript())}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {tr('digitalHumanLive.regenerateScript', 'Rewrite Script')}
                  </button>
                </div>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  {tr('digitalHumanLive.scriptHint', 'Auto-written from your product info — edit any line before generating.')}
                </p>
                <div className="space-y-2">
                  {scriptLines.map((line, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-2 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{line.label}</span>
                      <Textarea
                        value={line.text}
                        onChange={(e) => setScriptLines((cur) => cur.map((l, j) => (j === i ? { ...l, text: e.target.value } : l)))}
                        rows={2}
                        className="min-h-[44px] text-sm"
                      />
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ⑤ 生成按钮 / 进度 */}
            {hasAnyContent ? (
              <Card className="mb-6 p-4 md:p-6 shadow-sm">
                <div className="flex flex-col items-center gap-3">
                  {mode === 'real' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleRhGenerate()}
                        disabled={rhGenerating || scriptLines.length === 0 || !rhStatus?.ready}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                      >
                        {rhGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PersonStanding className="h-4 w-4" />}
                        {rhGenerating
                          ? tr('digitalHumanLive.rhGenerating', 'Rendering real human video…')
                          : tr('digitalHumanLive.rhGenerate', 'Generate Real Human Video')}
                      </button>
                      {!rhStatus?.ready && !rhGenerating && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          {tr('digitalHumanLive.needModels', 'Download the local AI models above first.')}
                        </p>
                      )}
                      {rhGenerating && (
                        <div className="w-full max-w-sm space-y-1">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(rhProgress.pct * 100)}%` }} />
                          </div>
                          <p className="text-center text-[11px] text-muted-foreground">
                            {rhProgress.stage === 'models' && tr('digitalHumanLive.rhStageModels', 'Loading AI models…')}
                            {rhProgress.stage === 'runtime' && tr('digitalHumanLive.rhStageRuntime', 'Preparing the local AI runtime…')}
                            {rhProgress.stage === 'tts' && tr('digitalHumanLive.rhStageTts', 'Synthesizing narration…')}
                            {rhProgress.stage === 'local-product' && tr('digitalHumanLive.rhStageLocalProduct', 'Preserving real fingers and replacing the physically held product…')}
                            {rhProgress.stage === 'local-lipsync' &&
                              `${tr('digitalHumanLive.rhStageLocalLipsync', 'Rebuilding natural lip-sync locally')} ${rhProgress.frame ?? 0}/${rhProgress.total ?? 0}`}
                            {rhProgress.stage === 'quality-check' && tr('digitalHumanLive.rhStageQuality', 'Checking mouth sharpness and product stability…')}
                            {' · '}{Math.round(rhProgress.pct * 100)}%
                          </p>
                        </div>
                      )}
                      {rhError && <p className="text-xs text-red-500">{rhError}</p>}
                    </>
                  ) : (
                    <>
                  <button
                    type="button"
                    onClick={() => void generateScenes()}
                    disabled={generating || scriptLines.length === 0}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : staleVoice ? <RefreshCw className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
                    {generating
                      ? tr('digitalHumanLive.generatingVoice', 'Synthesizing host voice')
                      : staleVoice
                        ? tr('digitalHumanLive.generate', 'AI Generate Video')
                        : tr('digitalHumanLive.generate', 'AI Generate Video')}
                  </button>

                  {generating && (
                    <div className="w-full max-w-sm space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${genProgress.total ? (genProgress.done / genProgress.total) * 100 : 0}%` }}
                        />
                      </div>
                      <p className="text-center text-[11px] text-muted-foreground">
                        {tr('digitalHumanLive.voiceProgress', 'Voice clip')} {genProgress.done}/{genProgress.total}
                      </p>
                    </div>
                  )}
                  {staleVoice && !generating && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      {tr('digitalHumanLive.staleHint', 'Voice settings changed — regenerate to update.')}
                    </p>
                  )}
                  {genError && <p className="text-xs text-red-500">{genError}</p>}
                  {scenes.length > 0 && !generating && (
                    <p className="text-xs text-muted-foreground">
                      {tr('digitalHumanLive.scenesReady', 'Scenes ready')}: {scenes.length} · {totalVideoSeconds.toFixed(1)}s
                    </p>
                  )}
                    </>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="mb-6 border-dashed p-12 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <LinkIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {tr('digitalHumanLive.needProduct', 'Fill in the product name (or paste a product link) to start')}
                </p>
              </Card>
            )}

            {/* ⑥ 预览 + 导出：真人模式（本地渲染结果） */}
            {mode === 'real' && rhResultUrl && !rhGenerating && (
              <Card className="p-4 md:p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <PersonStanding className="h-5 w-5 text-primary" />
                    {tr('digitalHumanLive.rhResult', 'Real Human Video Ready')}
                  </h2>
                  <a
                    href={rhResultUrl.startsWith('http') ? rhResultUrl : `${mediaBase}${rhResultUrl}`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {tr('digitalHumanLive.downloadMp4', 'Download MP4')}
                  </a>
                </div>
                <div className="mx-auto max-w-sm overflow-hidden rounded-xl border border-border bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <video
                    src={rhResultUrl.startsWith('http') ? rhResultUrl : `${mediaBase}${rhResultUrl}`}
                    controls
                    autoPlay
                    className="aspect-[9/16] w-full"
                  />
                </div>
                <div className="mt-4 border-t border-border pt-4">
                  <SocialShare
                    videoUrl={rhResultUrl.startsWith('http') ? rhResultUrl : `${mediaBase}${rhResultUrl}`}
                    videoTitle={productName || tr('digitalHumanLive.title', 'Digital Human Selling Video')}
                  />
                </div>
              </Card>
            )}

            {/* ⑥ 预览 + 导出：照片模式 */}
            {mode === 'photo' && scenes.length > 0 && !generating && hasAnyContent && (
              <Card className="p-4 md:p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Megaphone className="h-5 w-5 text-primary" />
                    {tr('digitalHumanLive.preview', 'Preview')}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {tr('digitalHumanLive.exportTipVoice', 'Exports MP4 with real human voice track.')}
                  </p>
                </div>
                <div className="min-h-[500px]">
                  <TalkingVideoRenderer
                    key={scenesKey}
                    scenes={scenes}
                    avatar={avatar}
                    themeId="tech"
                    product={productInfo}
                    tr={tr}
                    mode="live"
                    isZh={voiceLocaleKey.startsWith('zh')}
                    onExported={(_blob, url) => {
                      setExportedUrl(url);
                      handleExported();
                    }}
                  />
                </div>
                {exportedUrl && (
                  <div className="mt-6 border-t border-border pt-4">
                    <SocialShare
                      videoUrl={exportedUrl}
                      videoTitle={productName || tr('digitalHumanLive.title', 'Digital Human Selling Video')}
                    />
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
