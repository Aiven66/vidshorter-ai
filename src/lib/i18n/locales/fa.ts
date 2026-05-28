import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'خانه', blog: 'وبلاگ', pricing: 'قیمت‌ها', login: 'ورود', register: 'ثبت نام', dashboard: 'داشبورد', admin: 'پنل مدیریت', logout: 'خروج', credits: 'اعتبار', download: 'دانلود اپلیکیشن', light: 'روشن', dark: 'تاریک',
  },
  common: {
  error: 'خطا', ready: 'آماده', failed: 'ناموفق', saving: 'در حال ذخیره...', score: 'امتیاز', user: 'کاربر',
  loading: 'در حال بارگذاری...', success: 'موفقیت', cancel: 'لغو', save: 'ذخیره', delete: 'حذف', edit: 'ویرایش', search: 'جستجو',
  },
  footer: {
  desc: 'ویدیوهای بلند خود را با تحلیل و ویرایش مبتنی بر هوش مصنوعی به کلیپ‌های کوتاه جذاب تبدیل کنید.',
  quickLinks: 'لینک‌های سریع', legal: 'حقوقی', privacy: 'سیاست حریم خصوصی', terms: 'شرایط خدمات', contact: 'تماس', rights: 'تمامی حقوق محفوظ است.',
  },
  home: {
  hero: {
  badge: 'پردازش ویدیو با هوش مصنوعی',
  title: 'ویدیوهای بلند را به شورت‌های ویروسی تبدیل کنید',
  subtitle: 'برش ویدیو با هوش مصنوعی که بهترین لحظات را از محتوای بلند شما به طور خودکار استخراج می‌کند',
  cta: 'شروع برش رایگان',
  secondary: 'تماشای دمو',
  },
  features: {
  title: 'برش ویدیو قدرتمند با هوش مصنوعی',
  auto: { title: 'تشخیص خودکار هایلایت‌ها', desc: 'هوش مصنوعی ویدیو شما را تحلیل می‌کند و جذاب‌ترین لحظات را به طور خودکار شناسایی می‌کند' },
  multi: { title: 'پشتیبانی چند پلتفرمی', desc: 'از YouTube, Bilibili وارد کنید یا فایل‌های ویدیویی خودتان را آپلود کنید' },
  quick: { title: 'صادرات سریع', desc: 'کلیپ‌های خود را در فرمت‌های متعدد دانلود کنید، آماده برای هر پلتفرم اجتماعی' },
  },
  howItWorks: {
  title: 'نحوه کارکرد',
  step1: { title: 'ورودی ویدیو', desc: 'URL را بچسبانید یا ویدیو آپلود کنید' },
  step2: { title: 'تحلیل AI', desc: 'AI به طور خودکار هایلایت‌ها را تشخیص می‌دهد' },
  step3: { title: 'تولید کلیپ', desc: 'ویدیوهای کوتاه ایجاد می‌شوند' },
  step4: { title: 'دانلود', desc: 'صادر کنید و همه‌جا به اشتراک بگذارید' },
  },
  },
  video: {
  input: { title: 'ویدیو ورودی', url: 'URL ویدیو (YouTube/Bilibili)', upload: 'آپلود ویدیو', placeholder: 'لینک ویدیو YouTube یا Bilibili را چسبانید...' },
  process: 'پردازش ویدیو', processing: 'در حال پردازش...', analyze: 'تحلیل', results: 'شورت‌های تولید شده', highlights: 'تحلیل هایلایت‌ها', download: 'دانلود', preview: 'پیش‌نمایش',
  creditsAvailable: 'اعتبار موجود', signInToStart: 'برای شروع پردازش ویدیو', pasteUrlPlaceholder: 'URL ویدیو را بچسبانید (MP4, MOV, AVI...)', useLocalAgent: 'استفاده از Agent محلی Mac (پیشنهادی برای YouTube پایدار)', uploadLocal: 'آپلود فایل ویدیوی محلی (پیشنهادی وقتی لینک YouTube مسدود است)', selectedFile: 'انتخاب شده', downloadMacApp: 'دانلود اپ Mac', viewPricing: 'مشاهده قیمت‌ها', clipsReady: 'کلیپ آماده', playableClips: 'کلیپ قابل پخش', failedClips: 'ناموفق', aiFinished: 'هوش مصنوعی انتخاب قوی‌ترین لحظات از ویدیوی منبع شما را تکمیل کرده است.', openToPreview: 'هر کلیپ آماده‌ای را برای پیش‌نمایش باز کنید یا MP4 را مستقیماً دانلود کنید.', clipsBeingGenerated: 'کلیپ‌ها در حال تولید:', videoPreviewNotAvailable: 'پیش‌نمایش ویدیو موجود نیست', clipMayStillProcessing: 'کلیپ ممکن است هنوز در حال پردازش یا تولید ناموفق باشد.', insufficientCredits: 'اعتبار ناکافی. حداقل به 30 اعتبار نیاز دارید.', enterVideoUrl: 'لطفاً URL ویدیو وارد کنید یا فایل ویدیوی محلی آپلود کنید.', enterValidUrl: 'لطفاً یک URL ویدیو http(s) عمومی معتبر وارد کنید.',
  stage: {
  init: 'در حال راه‌اندازی...', extractFrames: 'استخراج فریم‌های ویدیو...', framesExtracted: 'فریم‌ها با موفقیت استخراج شدند', framesUnavailable: 'ادامه با تحلیل', aiAnalysis: 'AI در حال تحلیل محتوای ویدیو...', analysisComplete: 'تحلیل کامل شد', generatingClip: 'در حال تولید کلیپ هایلایت...', clipReady: 'کلیپ هایلایت آماده', saving: 'در حال ذخیره نتایج...', complete: 'پردازش کامل شد!', error: 'خطا رخ داد',
  },
  },
  pricing: {
  title: 'قیمت‌گذاری ساده و شفاف', subtitle: 'طرحی که با نیازهای شما مطابقت دارد را انتخاب کنید',
  paymentNote: 'Alipay برای چین · Creem برای بین‌المللی (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'تمام پرداخت‌ها با رمزگذاری TLS 256-bit ایمن شده‌اند', faqTitle: 'سوالات متداول', faq: { q1: 'اعتبار چیست؟', a1: 'هر اعتبار نشان‌دهنده قدرت پردازش است. پردازش یک کلیپ ویدیو 30 اعتبار هزینه دارد.', q2: 'بازنشانی اعتبار روزانه چگونه کار می‌کند؟', a2: 'اعتبارها هر روز ساعت 00:00 UTC به حد روزانه طرح شما بازنشانی می‌شوند. اعتبارهای استفاده نشده منتقل نمی‌شوند.', q3: 'آیا می‌توانم طرح خود را ارتقا یا تنزل دهم؟', a3: 'بله، می‌توانید طرح خود را هر زمان تغییر دهید. تغییرات بلافاصله اعمال می‌شوند.', q4: 'چه منابع ویدیویی پشتیبانی می‌شوند؟', a4: 'ما YouTube، Bilibili و آپلود مستقیم فایل ویدیو (MP4, MOV, AVI) را پشتیبانی می‌کنیم.', q5: 'چه روش‌های پرداختی پشتیبانی می‌شوند؟', a5: 'Alipay برای کاربران چین، Creem (Visa, Mastercard, Apple Pay, Google Pay) برای کاربران بین‌المللی.' },
  mostPopular: 'محبوب‌ترین',
  free: { title: 'رایگان', price: '$0', period: '/ماه', desc: 'برای امتحان عالی است', feature1: '100 اعتبار روزانه', feature2: 'برش ویدیو پایه', feature3: 'کیفیت خروجی 720p', feature4: 'واترمارک موجود است', cta: 'شروع' },
  starter: { title: 'شروع', price: '$9.9', period: '/ماه', desc: 'برای سازندگان محتوا', feature1: '500 اعتبار روزانه', feature2: 'پردازش اولویت‌دار', feature3: 'کیفیت خروجی 1080p', feature4: 'بدون واترمارک', feature5: 'پشتیبانی ایمیل', cta: 'همین حالا اشتراک بگیرید' },
  pro: { title: 'حرفه‌ای', price: '$19.9', period: '/ماه', desc: 'برای حرفه‌ای‌ها و تیم‌ها', feature1: 'اعتبار نامحدود', feature2: 'سریع‌ترین پردازش', feature3: 'کیفیت خروجی 4K', feature4: 'بدون واترمارک', feature5: 'دسترسی API', feature6: 'پشتیبانی اولویت‌دار', cta: 'همین حالا اشتراک بگیرید' },
  },
  downloadPage: {
  title: 'دانلود Clipop Agent', subtitle: 'اپلیکیشن دسکتاپ برای پردازش پایدار ویدیو YouTube/Bilibili', badge: 'اپلیکیشن دسکتاپ', macTitle: 'macOS', macDesc: 'برای Mac با Apple Silicon (M1/M2/M3/M4)', downloadButton: 'دانلود برای macOS', version: 'نسخه', fileSize: 'اندازه فایل', requirements: 'macOS 12.0 یا بالاتر', installing: 'راهنمای نصب', step1: 'روی دکمه دانلود کلیک کنید تا فایل .dmg ذخیره شود', step2: 'روی فایل .dmg دانلود شده دوبار کلیک کنید', step3: 'Clipop Agent را به پوشه برنامه‌ها بکشید', step4: 'Clipop Agent را از برنامه‌ها باز کنید', notAvailable: 'دانلود در حال آماده‌سازی است، لطفاً بعداً بررسی کنید', backToHome: 'بازگشت به خانه', whyDesktopTitle: 'چرا از اپلیکیشن دسکتاپ استفاده کنیم؟', features: { stable: { title: 'پردازش پایدار', desc: 'ویدیوها را با حداکثر ثبات به صورت محلی پردازش کنید' }, fast: { title: 'دانلود سریع', desc: 'ویدیوها را مستقیماً بدون محدودیت مرورگر دانلود کنید' }, local: { title: 'پردازش محلی', desc: 'ویدیوها را روی Mac خود برای حریم خصوصی و سرعت پردازش کنید' } },
  },
  login: {
  title: 'ورود', description: 'به حساب خود دسترسی پیدا کنید', emailLabel: 'ایمیل', emailPlaceholder: 'you@example.com', passwordLabel: 'رمز عبور', passwordPlaceholder: '••••••••', submitButton: 'ورود', orContinueWith: 'یا ادامه با', googleButton: 'ادامه با Google', dontHaveAccount: 'حساب ندارید؟', signUp: 'ثبت نام',
  successTitle: 'ورود موفق!', successMessage: 'شما با موفقیت وارد شدید به عنوان', successDesktopHint: 'برای بازگشت به اپلیکیشن دسکتاپ روی دکمه زیر کلیک کنید.', returnToDesktop: 'بازگشت به Clipop Agent', desktopNotOpened: 'اگر اپلیکیشن دسکتاپ به طور خودکار باز نمی‌شود، لطفاً مطمئن شوید Clipop Agent در حال اجراست.',
  },
  register: {
  title: 'ایجاد حساب', description: 'شروع با Clipop AI', nameLabel: 'نام کامل', namePlaceholder: 'John Doe', emailLabel: 'ایمیل', emailPlaceholder: 'you@example.com', passwordLabel: 'رمز عبور', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'تأیید رمز عبور', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'ادامه', sendingCode: 'در حال ارسال...', codeLabel: 'کد تأیید', codePlaceholder: 'کد 6 رقمی را وارد کنید', verifyButton: 'ایجاد حساب', codeNotReceived: 'کد را دریافت نکردید؟', resendButton: 'ارسال مجدد', resendIn: 'ارسال مجدد در', backButton: 'بازگشت', googleButton: 'ادامه با Google', alreadyHaveAccount: 'از قبل حساب دارید؟', signIn: 'ورود',
  errorNameRequired: 'لطفاً نام خود را وارد کنید', errorEmailRequired: 'لطفاً ایمیل خود را وارد کنید', errorPasswordLength: 'رمز عبور باید حداقل 6 کاراکتر باشد', errorPasswordMismatch: 'رمزهای عبور مطابقت ندارند', errorEmailExists: 'این ایمیل قبلاً ثبت شده است. لطفاً وارد شوید.', errorSendCode: 'ارسال کد ناموفق بود', errorNetwork: 'خطای شبکه. لطفاً دوباره تلاش کنید.', errorCodeLength: 'لطفاً کد 6 رقمی را وارد کنید',
  successTitle: 'حساب ایجاد شد!', successMessage: 'حساب شما با موفقیت ایجاد شد به عنوان', successDesktopHint: 'برای بازگشت به اپلیکیشن دسکتاپ روی دکمه زیر کلیک کنید.', returnToDesktop: 'بازگشت به Clipop Agent', desktopNotOpened: 'اگر اپلیکیشن دسکتاپ به طور خودکار باز نمی‌شود، لطفاً مطمئن شوید Clipop Agent در حال اجراست.',
  },
  dashboard: { title: 'داشبورد', credits: 'اعتبار موجود', creditsReset: 'بازنشانی روزانه در 00:00 UTC', history: 'تاریخچه پردازش', noVideos: 'هنوز هیچ ویدیویی پردازش نشده است', startProcessing: 'شروع پردازش ویدیوها',
  untitled: 'بدون عنوان', clip: 'کلیپ', clipsCount: 'هایلایت‌ها', clipsHint: 'برای پخش روی هر کلیپ کلیک کنید',
  desktopLoginDetected: 'ورود اپلیکیشن دسکتاپ شناسایی شد', desktopLoginHint: 'برای بازگشت به Clipop Agent روی دکمه زیر کلیک کنید', returnToDesktop: 'بازگشت به Clipop Agent',
  welcomeBack: 'خوش آمدید',
  videosProcessed: 'ویدیوهای پردازش شده', videosProcessedDesc: 'مجموع ویدیوهای پردازش شده', clipsGenerated: 'کلیپ‌های تولید شده', clipsGeneratedDesc: 'مجموع کلیپ‌های هایلایت',
  currentPlan: 'طرح فعلی', upgradePlan: 'ارتقای طرح',
  processNewVideo: 'پردازش ویدیوی جدید', feedback: 'بازخورد',
  historyHint: 'رکوردهای تکمیل شده را برای مشاهده کلیپ‌های هایلایت باز کنید',
  processNewVideoDesc: 'برای پردازش ویدیوی بلند جدید به صفحه اصلی بروید', goToProcessor: 'رفتن به پردازشگر ویدیو',
  userFeedback: 'بازخورد کاربر', feedbackDesc: 'درباره ویژگی‌هایی که می‌خواهید بهبود دهید یا مشکلاتی که با آن مواجه شدید به ما بگویید',
  feedbackPlaceholder: 'بازخورد خود را وارد کنید (پیشنهادات، باگ‌ها، درخواست ویژگی و غیره)', feedbackSubmitted: 'ارسال شد، از بازخورد شما سپاسگزاریم!',
  submitFeedback: 'ارسال بازخورد', feedbackFailed: 'ارسال بازخورد ناموفق بود',
  statusPending: 'در انتظار', statusProcessing: 'در حال پردازش', statusCompleted: '✓ تکمیل شد', statusFailed: 'ناموفق',
  },
  admin: { title: 'پنل مدیریت', blog: 'مدیریت وبلاگ', blogCreate: 'ایجاد پست', blogTitle: 'عنوان', blogCategory: 'دسته بندی', blogContent: 'محتوا', blogPublish: 'انتشار', blogSave: 'ذخیره پیشنویس', blogPublished: 'منتشر شده', blogDraft: 'پیشنویس' },
  blog: { title: 'وبلاگ', readMore: 'ادامه مطلب', noPosts: 'هنوز هیچ پستی نیست', subtitle: 'آخرین اخبار، نکات و به‌روزرسانی‌ها از Clipop AI', views: 'بازدید' },
  common: { loading: 'در حال بارگذاری...', error: 'خطایی رخ داد', success: 'موفقیت', cancel: 'لغو', save: 'ذخیره', delete: 'حذف', edit: 'ویرایش', search: 'جستجو' },
};

export default translations;
