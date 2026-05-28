import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'ہوم', blog: 'بلاگ', pricing: 'قیمتیں', login: 'لاگ ان', register: 'رجسٹر', dashboard: 'ڈیش بورڈ', admin: 'ایڈمن پینل', logout: 'لاگ آؤٹ', credits: 'کریڈٹس', download: 'ایپ ڈاؤن لوڈ کریں', light: 'لائٹ', dark: 'ڈارک',
  },
  common: {
  error: 'خطا', ready: 'تیار', failed: 'ناکام', saving: 'محفوظ ہو رہا ہے...', score: 'اسکور', user: 'صارف',
  loading: 'لوڈ ہو رہا ہے...', success: 'کامیابی', cancel: 'منسوخ کریں', save: 'محفوظ کریں', delete: 'حذف کریں', edit: 'ترمیم کریں', search: 'تلاش کریں',
  },
  footer: {
  desc: 'AI سے چلنے والی تجزیہ اور ترمیم کے ساتھ اپنے لمبے ویڈیوز کو دلچسپ مختصر کلپس میں تبدیل کریں۔',
  quickLinks: 'فوری لنکس', legal: 'قانونی', privacy: 'رازداری کی پالیسی', terms: 'خدمات کی شرائط', contact: 'رابطہ', rights: 'جملہ حقوق محفوظ ہیں۔',
  },
  home: {
  hero: {
  badge: 'AI سے چلنے والی ویڈیو پروسیسنگ',
  title: 'لمبے ویڈیوز کو وائرل شارٹس میں تبدیل کریں',
  subtitle: 'AI سے چلنے والی ویڈیو کٹنگ جو آپ کے طوالت والے مواد سے بہترین لمحات خود بخود نکالتی ہے',
  cta: 'مفت میں کٹنگ شروع کریں',
  secondary: 'ڈیمو دیکھیں',
  },
  features: {
  title: 'طاقتور AI ویڈیو کٹنگ',
  auto: { title: 'آٹو ہائی لائٹ ڈیٹیکشن', desc: 'AI آپ کی ویڈیو کا تجزیہ کرتا ہے اور سب سے زیادہ دلچسپ لمحات کو خود بخود شناخت کرتا ہے' },
  multi: { title: 'ملٹی پلیٹ فارم سپورٹ', desc: 'YouTube, Bilibili سے درآمد کریں یا اپنی ویڈیو فائلیں اپ لوڈ کریں' },
  quick: { title: 'فوری ایکسپورٹ', desc: 'اپنے کلپس کو متعدد فارمیٹس میں ڈاؤن لوڈ کریں، کسی بھی سوشل پلیٹ فارم کے لیے تیار' },
  },
  howItWorks: {
  title: 'یہ کیسے کام کرتا ہے',
  step1: { title: 'ویڈیو ان پٹ', desc: 'URL پیسٹ کریں یا ویڈیو اپ لوڈ کریں' },
  step2: { title: 'AI تجزیہ', desc: 'AI خود بخود ہائی لائٹس کی شناخت کرتا ہے' },
  step3: { title: 'کلپس بنائیں', desc: 'مختصر ویڈیوز تخلیق ہوتی ہیں' },
  step4: { title: 'ڈاؤن لوڈ', desc: 'ایکسپورٹ کریں اور کہیں بھی شیئر کریں' },
  },
  },
  video: {
  input: { title: 'ان پٹ ویڈیو', url: 'ویڈیو URL (YouTube/Bilibili)', upload: 'ویڈیو اپ لوڈ کریں', placeholder: 'YouTube یا Bilibili ویڈیو لنک پیسٹ کریں...' },
  process: 'ویڈیو پروسیس کریں', processing: 'پروسیس ہو رہا ہے...', analyze: 'تجزیہ', results: 'تیار کردہ شارٹس', highlights: 'ہائی لائٹ تجزیہ', download: 'ڈاؤن لوڈ', preview: 'پری ویو',
  creditsAvailable: 'کریڈٹس دستیاب', signInToStart: 'ویڈیوز پروسیس کرنا شروع کرنے کے لیے', pasteUrlPlaceholder: 'ویڈیو URL پیسٹ کریں (MP4, MOV, AVI...)', useLocalAgent: 'مقامی Mac ایجنٹ استعمال کریں (مستحکم YouTube کے لیے تجویز کردہ)', uploadLocal: 'مقامی ویڈیو فائل اپ لوڈ کریں (YouTube لنک بلاک ہونے پر تجویز کردہ)', selectedFile: 'منتخب شدہ', downloadMacApp: 'Mac ایپ ڈاؤن لوڈ کریں', viewPricing: 'قیمتیں دیکھیں', clipsReady: 'کلپس تیار', playableClips: 'چلائے جانے والے کلپس', failedClips: 'ناکام', aiFinished: 'AI نے آپ کے سورس ویڈیو سے بہترین لمحات کا انتخاب مکمل کر لیا ہے۔', openToPreview: 'کوئی بھی تیار کلپ ان لائن پری ویو کے لیے کھولیں، یا MP4 براہ راست ڈاؤن لوڈ کریں۔', clipsBeingGenerated: 'کلپس بنائے جا رہے ہیں:', videoPreviewNotAvailable: 'ویڈیو پری ویو دستیاب نہیں', clipMayStillProcessing: 'کلپ ابھی بھی پروسیس ہو رہا ہو سکتا ہے یا بنانے میں ناکام ہوا ہو۔', insufficientCredits: 'کریڈٹس ناکافی۔ آپ کو کم از کم 30 کریڈٹس درکار ہیں۔', enterVideoUrl: 'براہ کرم ویڈیو URL درج کریں یا مقامی ویڈیو فائل اپ لوڈ کریں۔', enterValidUrl: 'براہ کرم ایک درست عوامی http(s) ویڈیو URL درج کریں۔',
  stage: {
  init: 'شروع ہو رہا ہے...', extractFrames: 'ویڈیو فریمز نکالے جا رہے ہیں...', framesExtracted: 'فریمز کامیابی سے نکالے گئے', framesUnavailable: 'تجزیہ کے ساتھ جاری ہے', aiAnalysis: 'AI ویڈیو مواد کا تجزیہ کر رہا ہے...', analysisComplete: 'تجزیہ مکمل', generatingClip: 'ہائی لائٹ کلپ بنایا جا رہا ہے...', clipReady: 'ہائی لائٹ کلپ تیار', saving: 'نتائج محفوظ ہو رہے ہیں...', complete: 'پروسیسنگ مکمل!', error: 'خرابی واقع ہوئی',
  },
  },
  pricing: {
  title: 'سادہ، شفاف قیمتیں', subtitle: 'اپنی ضروریات کے مطابق پلان منتخب کریں',
  paymentNote: 'چین کے لیے علی پے · بین الاقوامی کے لیے Creem (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'تمام ادائیگیاں TLS 256-bit انکرپشن سے محفوظ', faqTitle: 'اکثر پوچھے گئے سوالات', faq: { q1: 'کریڈٹ کیا ہے؟', a1: 'ہر کریڈٹ پروسیسنگ پاور کی نمائندگی کرتا ہے۔ ایک ویڈیو کلپ پروسیس کرنے میں 30 کریڈٹس لگتے ہیں۔', q2: 'روزانہ کریڈٹ ری سیٹ کیسے کام کرتا ہے؟', a2: 'کریڈٹس ہر روز 00:00 UTC پر آپ کے پلان کی روزانہ حد تک ری سیٹ ہو جاتے ہیں۔ غیر استعمال شدہ کریڈٹس منتقل نہیں ہوتے۔', q3: 'کیا میں اپنا پلان اپ گریڈ یا ڈاؤن گریڈ کر سکتا ہوں؟', a3: 'ہاں، آپ کسی بھی وقت اپنا پلان تبدیل کر سکتے ہیں۔ تبدیلیاں فوری طور پر لاگو ہوتی ہیں۔', q4: 'کون سے ویڈیو ذرائع تعاون یافتہ ہیں؟', a4: 'ہم YouTube، Bilibili اور براہ راست ویڈیو فائل اپ لوڈ (MP4, MOV, AVI) کی حمایت کرتے ہیں۔', q5: 'کون سے ادائیگی کے طریقے تعاون یافتہ ہیں؟', a5: 'چین کے صارفین کے لیے علی پے، بین الاقوامی صارفین کے لیے Creem (Visa, Mastercard, Apple Pay, Google Pay)۔' },
  mostPopular: 'سب سے مقبول',
  free: { title: 'مفت', price: '$0', period: '/مہینہ', desc: 'آزمائش کے لیے بہترین', feature1: 'روزانہ 100 کریڈٹس', feature2: 'بنیادی ویڈیو کٹنگ', feature3: '720p ایکسپورٹ معیار', feature4: 'واٹر مارک شامل ہے', cta: 'شروع کریں' },
  starter: { title: 'سٹارٹر', price: '$9.9', period: '/مہینہ', desc: 'کنٹینٹ کری ایٹرز کے لیے', feature1: 'روزانہ 500 کریڈٹس', feature2: 'ترجیحی پروسیسنگ', feature3: '1080p ایکسپورٹ معیار', feature4: 'واٹر مارک نہیں', feature5: 'ای میل سپورٹ', cta: 'ابھی سبسکرائب کریں' },
  pro: { title: 'پرو', price: '$19.9', period: '/مہینہ', desc: 'پروفیشنلز اور ٹیموں کے لیے', feature1: 'لامحدود کریڈٹس', feature2: 'سب سے تیز پروسیسنگ', feature3: '4K ایکسپورٹ معیار', feature4: 'واٹر مارک نہیں', feature5: 'API تک رسائی', feature6: 'ترجیحی سپورٹ', cta: 'ابھی سبسکرائب کریں' },
  },
  downloadPage: {
  title: 'Clipop Agent ڈاؤن لوڈ کریں', subtitle: 'مستحکم YouTube/Bilibili ویڈیو پروسیسنگ کے لیے ڈیسک ٹاپ ایپ', badge: 'ڈیسک ٹاپ ایپ', macTitle: 'macOS', macDesc: 'Apple Silicon (M1/M2/M3/M4) Mac کے لیے', downloadButton: 'macOS کے لیے ڈاؤن لوڈ', version: 'ورژن', fileSize: 'فائل سائز', requirements: 'macOS 12.0 یا اس کے بعد', installing: 'انسٹالیشن گائیڈ', step1: 'ڈاؤن لوڈ بٹن پر کلک کریں تاکہ .dmg فائل محفوظ ہو', step2: 'ڈاؤن لوڈ شدہ .dmg فائل پر ڈبل کلک کریں', step3: 'Clipop Agent کو ایپلیکیشنز فولڈر میں ڈریگ کریں', step4: 'ایپلیکیشنز سے Clipop Agent کھولیں', notAvailable: 'ڈاؤن لوڈ تیار کیا جا رہا ہے، براہ کرم بعد میں دوبارہ چیک کریں', backToHome: 'ہوم پر واپس جائیں', whyDesktopTitle: 'ڈیسک ٹاپ ایپ کیوں استعمال کریں؟', features: { stable: { title: 'مستحکم پروسیسنگ', desc: 'زیادہ سے زیادہ استحکام کے ساتھ مقامی طور پر ویڈیوز پروسیس کریں' }, fast: { title: 'تیز ڈاؤن لوڈ', desc: 'براؤزر کی پابندیوں کے بغیر براہ راست ویڈیوز ڈاؤن لوڈ کریں' }, local: { title: 'مقامی پروسیسنگ', desc: 'رازداری اور رفتار کے لیے اپنے Mac پر ویڈیوز پروسیس کریں' } },
  },
  login: {
  title: 'لاگ ان', description: 'اپنے اکاؤنٹ تک رسائی حاصل کریں', emailLabel: 'ای میل', emailPlaceholder: 'you@example.com', passwordLabel: 'پاس ورڈ', passwordPlaceholder: '••••••••', submitButton: 'لاگ ان', orContinueWith: 'یا جاری رکھیں', googleButton: 'Google کے ساتھ جاری رکھیں', dontHaveAccount: 'اکاؤنٹ نہیں ہے؟', signUp: 'رجسٹر',
  successTitle: 'لاگ ان کامیاب!', successMessage: 'آپ کامیابی سے لاگ ان ہو گئے ہیں بطور', successDesktopHint: 'ڈیسک ٹاپ ایپ پر واپس جانے کے لیے نیچے دیا گیا بٹن کلک کریں۔', returnToDesktop: 'Clipop Agent پر واپس جائیں', desktopNotOpened: 'اگر ڈیسک ٹاپ ایپ خود بخود نہیں کھلتی، تو براہ کرم یقینی بنائیں کہ Clipop Agent چل رہا ہے۔',
  },
  register: {
  title: 'اکاؤنٹ بنائیں', description: 'Clipop AI کے ساتھ شروع کریں', nameLabel: 'پورا نام', namePlaceholder: 'John Doe', emailLabel: 'ای میل', emailPlaceholder: 'you@example.com', passwordLabel: 'پاس ورڈ', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'پاس ورڈ کی تصدیق کریں', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'جاری رکھیں', sendingCode: 'بھیجا جا رہا ہے...', codeLabel: 'توثیقی کوڈ', codePlaceholder: '6 ہندسوں کا کوڈ درج کریں', verifyButton: 'اکاؤنٹ بنائیں', codeNotReceived: 'کوڈ موصول نہیں ہوا؟', resendButton: 'دوبارہ بھیجیں', resendIn: 'دوبارہ بھیجیں', backButton: 'واپس', googleButton: 'Google کے ساتھ جاری رکھیں', alreadyHaveAccount: 'پہلے سے اکاؤنٹ ہے؟', signIn: 'لاگ ان',
  errorNameRequired: 'براہ کرم اپنا نام درج کریں', errorEmailRequired: 'براہ کرم اپنا ای میل درج کریں', errorPasswordLength: 'پاس ورڈ کم از کم 6 حروف کا ہونا چاہیے', errorPasswordMismatch: 'پاس ورڈز مماثل نہیں ہیں', errorEmailExists: 'یہ ای میل پہلے سے رجسٹرڈ ہے۔ براہ کرم لاگ ان کریں۔', errorSendCode: 'کوڈ بھیجنے میں ناکام', errorNetwork: 'نیٹ ورک خرابی۔ براہ کرم دوبارہ کوشش کریں۔', errorCodeLength: 'براہ کرم 6 ہندسوں کا کوڈ درج کریں',
  successTitle: 'اکاؤنٹ بن گیا!', successMessage: 'آپ کا اکاؤنٹ کامیابی سے بن گیا ہے بطور', successDesktopHint: 'ڈیسک ٹاپ ایپ پر واپس جانے کے لیے نیچے دیا گیا بٹن کلک کریں۔', returnToDesktop: 'Clipop Agent پر واپس جائیں', desktopNotOpened: 'اگر ڈیسک ٹاپ ایپ خود بخود نہیں کھلتی، تو براہ کرم یقینی بنائیں کہ Clipop Agent چل رہا ہے۔',
  },
  dashboard: { title: 'ڈیش بورڈ', credits: 'دستیاب کریڈٹس', creditsReset: 'ہر روز 00:00 UTC پر ری سیٹ', history: 'پروسیسنگ کی تاریخ', noVideos: 'ابھی تک کوئی ویڈیو پروسیس نہیں ہوئی', startProcessing: 'ویڈیو پروسیسنگ شروع کریں',
  untitled: 'بلا عنوان', clip: 'کلپ', clipsCount: 'ہائی لائٹس', clipsHint: 'چلانے کے لیے کوئی بھی کلپ کلک کریں',
  desktopLoginDetected: 'ڈیسک ٹاپ ایپ لاگ ان کا پتہ چلا', desktopLoginHint: 'Clipop Agent پر واپس جانے کے لیے نیچے دیا گیا بٹن کلک کریں', returnToDesktop: 'Clipop Agent پر واپس جائیں',
  welcomeBack: 'خوش آمدید',
  videosProcessed: 'پروسیس شدہ ویڈیوز', videosProcessedDesc: 'کل پروسیس شدہ ویڈیوز', clipsGenerated: 'بنائے گئے کلپس', clipsGeneratedDesc: 'کل ہائی لائٹ کلپس',
  currentPlan: 'موجودہ پلان', upgradePlan: 'پلان اپ گریڈ کریں',
  processNewVideo: 'نیا ویڈیو پروسیس کریں', feedback: 'فیڈ بیک',
  historyHint: 'مکمل شدہ ریکارڈز کو ہائی لائٹ کلپس دیکھنے کے لیے پھیلائیں',
  processNewVideoDesc: 'نئے لمبے ویڈیو کو پروسیس کرنے کے لیے ہوم پیج پر جائیں', goToProcessor: 'ویڈیو پروسیسر پر جائیں',
  userFeedback: 'صارف فیڈ بیک', feedbackDesc: 'بتائیں کہ آپ کون سی خصوصیات بہتر کرنا چاہتے ہیں یا کیا مسائل درپیش ہیں',
  feedbackPlaceholder: 'اپنا فیڈ بیک درج کریں (تجاویز، بگز، فیچر درخواستیں وغیرہ)', feedbackSubmitted: 'جمع ہو گیا، آپ کے فیڈ بیک کا شکریہ!',
  submitFeedback: 'فیڈ بیک جمع کرائیں', feedbackFailed: 'فیڈ بیک جمع کرانے میں ناکام',
  statusPending: 'زیر انتظار', statusProcessing: 'پروسیس ہو رہا ہے', statusCompleted: '✓ مکمل', statusFailed: 'ناکام',
  },
  admin: { title: 'ایڈمن پینل', blog: 'بلاگ مینجمنٹ', blogCreate: 'پوسٹ بنائیں', blogTitle: 'عنوان', blogCategory: 'قسم', blogContent: 'مواد', blogPublish: 'شائع کریں', blogSave: 'ڈرافٹ محفوظ کریں', blogPublished: 'شائع شدہ', blogDraft: 'ڈرافٹ' },
  blog: { title: 'بلاگ', readMore: 'مزید پڑھیں', noPosts: 'ابھی کوئی پوسٹ نہیں', subtitle: 'Clipop AI سے تازہ ترین خبریں، تجاویز اور اپ ڈیٹس', views: 'مناظر' },
  common: { loading: 'لوڈ ہو رہا ہے...', error: 'ایک خرابی پیش آگئی', success: 'کامیابی', cancel: 'منسوخ کریں', save: 'محفوظ کریں', delete: 'حذف کریں', edit: 'ترمیم کریں', search: 'تلاش کریں' },
};

export default translations;
