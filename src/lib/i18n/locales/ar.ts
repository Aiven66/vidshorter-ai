import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'الرئيسية', blog: 'المدونة', pricing: 'الأسعار', login: 'تسجيل الدخول', register: 'التسجيل', dashboard: 'لوحة التحكم', admin: 'لوحة المشرف', logout: 'تسجيل الخروج', credits: 'الرصيد', download: 'تنزيل التطبيق', light: 'فاتح', dark: 'داكن',
  },
  footer: {
  desc: 'حوّل مقاطع الفيديو الطويلة إلى مقاطع قصيرة جذابة باستخدام التحليل والتحرير بالذكاء الاصطناعي.', quickLinks: 'روابط سريعة', legal: 'قانوني', privacy: 'سياسة الخصوصية', terms: 'شروط الخدمة', contact: 'اتصل بنا', rights: 'جميع الحقوق محفوظة.',
  },
  home: {
  hero: {
  badge: 'معالجة فيديو بالذكاء الاصطناعي',
  title: 'حوّل مقاطع الفيديو الطويلة إلى فيديوهات قصيرة فيروسية',
  subtitle: 'تقصية الفيديو بالذكاء الاصطناعي تستخرج أفضل اللحظات تلقائيًا من المحتوى الطويل',
  cta: 'ابدأ في القص مجانًا',
  secondary: 'شاهد العرض التوضيحي',
  },
  howItWorks: {
  title: 'كيف يعمل', step1: { title: 'إدخال الفيديو', desc: 'الصق الرابط أو ارفع الفيديو' }, step2: { title: 'تحليل الذكاء الاصطناعي', desc: 'يكتشف الذكاء الاصطناعي أبرز اللحظات تلقائيًا' }, step3: { title: 'إنشاء مقاطع', desc: 'يتم إنشاء مقاطع فيديو قصيرة' }, step4: { title: 'تنزيل', desc: 'صدّر وشارك في أي مكان' },
  },
  features: {
  title: 'تقصية فيديو ذكاء اصطناعي قوية',
  auto: { title: 'اكتشاف تلقائي لأبرز اللحظات', desc: 'يقوم الذكاء الاصطناعي بتحليل الفيديو وتحديد اللحظات الأكثر إثارة تلقائيًا' },
  multi: { title: 'دعم منصات متعددة', desc: 'استيراد من YouTube أو Bilibili أو رفع ملفات الفيديو الخاصة بك' },
  quick: { title: 'تصدير سريع', desc: 'قم بتنزيل مقاطعك في تنسيقات متعددة، جاهزة لأي منصة اجتماعية' },
  },
  },
  video: {
  input: { title: 'إدخال الفيديو', url: 'رابط الفيديو (YouTube/Bilibili)', upload: 'رفع فيديو', placeholder: 'لصق رابط فيديو YouTube أو Bilibili...' },
  process: 'معالجة الفيديو', processing: 'جارٍ المعالجة...', results: 'الفيديوهات القصيرة المنتجة', highlights: 'تحليل أبرز اللحظات', download: 'تنزيل', preview: 'معاينة',
  creditsAvailable: 'أرصدة متاحة', signInToStart: 'لبدء معالجة الفيديوهات', pasteUrlPlaceholder: 'الصق رابط فيديو (MP4, MOV, AVI...)', useLocalAgent: 'استخدم وكيل Mac المحلي (موصى به لـ YouTube المستقر)', uploadLocal: 'ارفع ملف فيديو محلي (موصى به عند حظر رابط YouTube)', selectedFile: 'محدد', downloadMacApp: 'تنزيل تطبيق Mac', viewPricing: 'عرض الأسعار', clipsReady: 'مقاطع جاهزة', playableClips: 'مقاطع قابلة للتشغيل', failedClips: 'فشلت', aiFinished: 'أنهى الذكاء الاصطناعي اختيار أقوى اللحظات من الفيديو المصدر.', openToPreview: 'افتح أي مقطع جاهز للمعاينة، أو نزّل MP4 مباشرة.', clipsBeingGenerated: 'جارٍ إنشاء المقاطع:', videoPreviewNotAvailable: 'معاينة الفيديو غير متاحة', clipMayStillProcessing: 'قد يكون المقطع لا يزال قيد المعالجة أو فشل إنشاؤه.', insufficientCredits: 'أرصدة غير كافية. تحتاج إلى 30 رصيدًا على الأقل.', enterVideoUrl: 'يرجى إدخال رابط فيديو أو رفع ملف فيديو محلي.', enterValidUrl: 'يرجى إدخال رابط http(s) عام صالح.',
  stage: {
  init: 'جارٍ التهيئة...', extractFrames: 'جارٍ استخراج إطارات الفيديو...', framesExtracted: 'تم استخراج الإطارات بنجاح', framesUnavailable: 'المتابعة مع التحليل', aiAnalysis: 'الذكاء الاصطناعي يحلل محتوى الفيديو...', analysisComplete: 'اكتمل التحليل', generatingClip: 'جارٍ إنشاء مقطع أبرز اللحظات...', clipReady: 'مقطع أبرز اللحظات جاهز', saving: 'جارٍ حفظ النتائج...', complete: 'اكتملت المعالجة!', error: 'حدث خطأ',
  },
  },
  pricing: {
  title: 'أسعار بسيطة وشفافة', subtitle: 'اختر الخطة التي تناسب احتياجاتك',
  paymentNote: 'Alipay للصين · Creem للدولي (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'جميع المدفوعات مؤمنة بتشفير TLS 256 بت', faqTitle: 'الأسئلة الشائعة', faq: { q1: 'ما هو الرصيد؟', a1: 'يمثل كل رصيد قوة معالجة. معالجة مقطع فيديو تكلف 30 رصيدًا.', q2: 'كيف يعمل إعادة تعيين الأرصدة اليومية؟', a2: 'تتم إعادة تعيين الأرصدة إلى الحد اليومي لخطتك في 00:00 UTC كل يوم. الأرصدة غير المستخدمة لا تُنقل.', q3: 'هل يمكنني ترقية أو تخفيض خطتي؟', a3: 'نعم، يمكنك تغيير خطتك في أي وقت. تسري التغييرات فورًا.', q4: 'ما هي مصادر الفيديو المدعومة؟', a4: 'ندعم YouTube وBilibili ورفع ملفات الفيديو مباشرة (MP4, MOV, AVI).', q5: 'ما هي طرق الدفع المدعومة؟', a5: 'Alipay لمستخدمي الصين، Creem (Visa, Mastercard, Apple Pay, Google Pay) للمستخدمين الدوليين.' },
  mostPopular: 'الأكثر شعبية',
  free: { title: 'مجاني', price: '$0', period: '/شهر', desc: 'مثالي للتجربة', feature1: '100 رصيد يوميًا', feature2: 'تقصية فيديو أساسية', feature3: 'جودة تصدير 720p', feature4: 'تضمين علامة مائية', cta: 'ابدأ' },
  starter: { title: 'مبتدئ', price: '$9.9', period: '/شهر', desc: 'لمنشئي المحتوى', feature1: '500 رصيد يوميًا', feature2: 'معالجة ذات أولوية', feature3: 'جودة تصدير 1080p', feature4: 'بدون علامة مائية', feature5: 'دعم عبر البريد الإلكتروني', cta: 'اشترك الآن' },
  pro: { title: 'احترافي', price: '$19.9', period: '/شهر', desc: 'للأحترافيين والفرق', feature1: 'رصيد غير محدود', feature2: 'أسرع معالجة', feature3: 'جودة تصدير 4K', feature4: 'بدون علامة مائية', feature5: 'وصول API', feature6: 'دعم ذات أولوية', cta: 'اشترك الآن' },
  },
  downloadPage: {
  title: 'تنزيل Clipop Agent', subtitle: 'تطبيق سطح المكتب لمعالجة مستقرة لفيديوهات YouTube/Bilibili', badge: 'تطبيق سطح المكتب', macTitle: 'macOS', macDesc: 'لأجهزة Mac بمعالج Apple Silicon (M1/M2/M3/M4)', downloadButton: 'تنزيل لـ macOS', version: 'الإصدار', fileSize: 'حجم الملف', requirements: 'macOS 12.0 أو أحدث', installing: 'دليل التثبيت', step1: 'انقر على زر التنزيل لحفظ ملف .dmg', step2: 'انقر نقرًا مزدوجًا على ملف .dmg الذي تم تنزيله', step3: 'اسحب Clipop Agent إلى مجلد التطبيقات', step4: 'افتح Clipop Agent من التطبيقات', notAvailable: 'جارٍ تجهيز التنزيل، يرجى التحقق لاحقًا', backToHome: 'العودة إلى الرئيسية', whyDesktopTitle: 'لماذا تستخدم تطبيق سطح المكتب؟', features: { stable: { title: 'معالجة مستقرة', desc: 'معالجة الفيديوهات محليًا بأقصى استقرار' }, fast: { title: 'تنزيل سريع', desc: 'تنزيل الفيديوهات مباشرة دون قيود المتصفح' }, local: { title: 'معالجة محلية', desc: 'معالجة الفيديوهات على جهاز Mac للخصوصية والسرعة' } },
  },
  login: {
  title: 'تسجيل الدخول', description: 'الوصول إلى حسابك', emailLabel: 'البريد الإلكتروني', emailPlaceholder: 'you@example.com', passwordLabel: 'كلمة المرور', passwordPlaceholder: '••••••••', submitButton: 'تسجيل الدخول', orContinueWith: 'أو تابع مع', googleButton: 'تابع مع Google', dontHaveAccount: 'ليس لديك حساب؟', signUp: 'التسجيل',
  successTitle: 'تم تسجيل الدخول بنجاح!', successMessage: 'لقد سجلت الدخول بنجاح كـ', successDesktopHint: 'انقر على الزر أدناه للعودة إلى تطبيق سطح المكتب.', returnToDesktop: 'العودة إلى Clipop Agent', desktopNotOpened: 'إذا لم يفتح تطبيق سطح المكتب تلقائيًا، يرجى التأكد من أن Clipop Agent قيد التشغيل.',
  },
  register: {
  title: 'إنشاء حساب', description: 'ابدأ مع Clipop AI', nameLabel: 'الاسم الكامل', namePlaceholder: 'John Doe', emailLabel: 'البريد الإلكتروني', emailPlaceholder: 'you@example.com', passwordLabel: 'كلمة المرور', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'تأكيد كلمة المرور', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'تابع', sendingCode: 'جارٍ الإرسال...', codeLabel: 'رمز التحقق', codePlaceholder: 'أدخل الرمز المكون من 6 أرقام', verifyButton: 'إنشاء حساب', codeNotReceived: 'لم تتلق الرمز؟', resendButton: 'إعادة الإرسال', resendIn: 'إعادة الإرسال في', backButton: 'رجوع', googleButton: 'تابع مع Google', alreadyHaveAccount: 'لديك حساب بالفعل؟', signIn: 'تسجيل الدخول',
  errorNameRequired: 'يرجى إدخال اسمك', errorEmailRequired: 'يرجى إدخال بريدك الإلكتروني', errorPasswordLength: 'يجب أن تكون كلمة المرور 6 أحرف على الأقل', errorPasswordMismatch: 'كلمات المرور غير متطابقة', errorEmailExists: 'هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول بدلاً من ذلك.', errorSendCode: 'فشل إرسال الرمز', errorNetwork: 'خطأ في الشبكة. يرجى المحاولة مرة أخرى.', errorCodeLength: 'يرجى إدخال رمز من 6 أرقام',
  successTitle: 'تم إنشاء الحساب!', successMessage: 'تم إنشاء حسابك بنجاح كـ', successDesktopHint: 'انقر على الزر أدناه للعودة إلى تطبيق سطح المكتب.', returnToDesktop: 'العودة إلى Clipop Agent', desktopNotOpened: 'إذا لم يفتح تطبيق سطح المكتب تلقائيًا، يرجى التأكد من أن Clipop Agent قيد التشغيل.',
  },
  dashboard: { title: 'لوحة التحكم', credits: 'الرصيد المتاح', creditsReset: 'إعادة التعيين يوميًا في 00:00 UTC', history: 'سجل المعالجات', noVideos: 'لم تتم معالجة أي فيديو بعد', startProcessing: 'ابدأ في معالجة الفيديوهات',
  untitled: 'بدون عنوان', clip: 'مقطع', clipsCount: 'أبرز اللحظات', clipsHint: 'انقر على أي مقطع للتشغيل',
  desktopLoginDetected: 'تم اكتشاف تسجيل دخول تطبيق سطح المكتب', desktopLoginHint: 'انقر على الزر أدناه للعودة إلى Clipop Agent', returnToDesktop: 'العودة إلى Clipop Agent',
  welcomeBack: 'مرحبًا بعودتك',
  videosProcessed: 'فيديوهات تمت معالجتها', videosProcessedDesc: 'إجمالي الفيديوهات المعالجة', clipsGenerated: 'مقاطع تم إنشاؤها', clipsGeneratedDesc: 'إجمالي مقاطع أبرز اللحظات',
  currentPlan: 'الخطة الحالية', upgradePlan: 'ترقية الخطة',
  processNewVideo: 'معالجة فيديو جديد', feedback: 'ملاحظات',
  historyHint: 'انقر على السجلات المكتملة لتوسيعها وعرض مقاطع أبرز اللحظات',
  processNewVideoDesc: 'انتقل إلى الصفحة الرئيسية لمعالجة فيديو طويل جديد', goToProcessor: 'انتقل إلى معالج الفيديو',
  userFeedback: 'ملاحظات المستخدم', feedbackDesc: 'أخبرنا عن الميزات التي تريد تحسينها أو المشاكل التي واجهتها',
  feedbackPlaceholder: 'أدخل ملاحظاتك (اقتراحات، أخطاء، طلبات ميزات، إلخ)', feedbackSubmitted: 'تم الإرسال، شكرًا لملاحظاتك!',
  submitFeedback: 'إرسال الملاحظات', feedbackFailed: 'فشل إرسال الملاحظات',
  statusPending: 'قيد الانتظار', statusProcessing: 'جارٍ المعالجة', statusCompleted: '✓ مكتمل', statusFailed: 'فشل',
  },
  admin: { title: 'لوحة المشرف', blog: 'إدارة المدونة', blogCreate: 'إنشاء منشور', blogTitle: 'العنوان', blogCategory: 'الفئة', blogContent: 'المحتوى', blogPublish: 'نشر', blogSave: 'حفظ المسودة', blogPublished: 'منشور', blogDraft: 'مسودة' },
  blog: { title: 'المدونة', readMore: 'اقرأ المزيد', noPosts: 'لا توجد منشورات بعد', subtitle: 'أحدث الأخبار والنصائح والتحديثات من Clipop AI', views: 'مشاهدات' },
  common: { loading: 'جارٍ التحميل...', error: 'حدث خطأ', success: 'نجاح', cancel: 'إلغاء', save: 'حفظ', delete: 'حذف', edit: 'تحرير', search: 'بحث', ready: 'جاهز', failed: 'فشل', saving: 'جارٍ الحفظ...', score: 'النتيجة', user: 'المستخدم' },
};

export default translations;
