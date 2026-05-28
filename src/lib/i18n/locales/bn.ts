import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'হোম', blog: 'ব্লগ', pricing: 'মূল্য', login: 'লগইন', register: 'নিবন্ধন', dashboard: 'ড্যাশবোর্ড', admin: 'অ্যাডমিন প্যানেল', logout: 'লগআউট', credits: 'ক্রেডিট', download: 'অ্যাপ ডাউনলোড করুন', light: 'লাইট', dark: 'ডার্ক',
  },
  footer: {
  desc: 'AI-চালিত বিশ্লেষণ এবং সম্পাদনার মাধ্যমে আপনার দীর্ঘ ভিডিওগুলোকে আকর্ষণীয় শর্ট ক্লিপে রূপান্তর করুন।', quickLinks: 'দ্রুত লিঙ্ক', legal: 'আইনি', privacy: 'গোপনীয়তা নীতি', terms: 'সেবার শর্তাবলী', contact: 'যোগাযোগ', rights: 'সর্বস্বত্ব সংরক্ষিত।',
  },
  home: {
  hero: {
  badge: 'AI-চালিত ভিডিও প্রক্রিয়াকরণ',
  title: 'দীর্ঘ ভিডিওগুলোকে ভাইরাল শর্টে রূপান্তর করুন',
  subtitle: 'AI-চালিত ভিডিও কাটিং যা আপনার দীর্ঘ ফর্মের কন্টেন্ট থেকে সেরা মুহূর্তগুলো স্বয়ংক্রিয়ভাবে বের করে নেয়',
  cta: 'বিনামূল্যে কাটিং শুরু করুন',
  secondary: 'ডেমো দেখুন',
  },
  howItWorks: {
  title: 'এটি কীভাবে কাজ করে', step1: { title: 'ভিডিও ইনপুট', desc: 'URL পেস্ট করুন বা ভিডিও আপলোড করুন' }, step2: { title: 'AI বিশ্লেষণ', desc: 'AI স্বয়ংক্রিয়ভাবে হাইলাইট সনাক্ত করে' }, step3: { title: 'ক্লিপ তৈরি', desc: 'শর্ট ভিডিও তৈরি হয়' }, step4: { title: 'ডাউনলোড', desc: 'রপ্তানি করুন এবং যেকোনো জায়গায় শেয়ার করুন' },
  },
  features: {
  title: 'শক্তিশালী AI ভিডিও কাটিং',
  auto: { title: 'স্বয়ংক্রিয় হাইলাইট সনাক্তকরণ', desc: 'AI আপনার ভিডিও বিশ্লেষণ করে এবং সবচেয়ে আকর্ষণীয় মুহূর্তগুলো স্বয়ংক্রিয়ভাবে চিহ্নিত করে' },
  multi: { title: 'মাল্টি-প্ল্যাটফর্ম সমর্থন', desc: 'YouTube, Bilibili থেকে আমদানি করুন বা নিজের ভিডিও ফাইল আপলোড করুন' },
  quick: { title: 'দ্রুত এক্সপোর্ট', desc: 'আপনার ক্লিপগুলো একাধিক ফরম্যাটে ডাউনলোড করুন, যেকোনো সোশ্যাল প্ল্যাটফর্মের জন্য প্রস্তুত' },
  },
  },
  video: {
  input: { title: 'ইনপুট ভিডিও', url: 'ভিডিও URL (YouTube/Bilibili)', upload: 'ভিডিও আপলোড করুন', placeholder: 'YouTube বা Bilibili ভিডিও লিঙ্ক পেস্ট করুন...' },
  process: 'ভিডিও প্রক্রিয়া করুন', processing: 'প্রক্রিয়াধীন...', results: 'জেনারেটেড শর্ট', highlights: 'হাইলাইট বিশ্লেষণ', download: 'ডাউনলোড', preview: 'প্রিভিউ',
  creditsAvailable: 'ক্রেডিট উপলব্ধ', signInToStart: 'ভিডিও প্রক্রিয়া শুরু করতে', pasteUrlPlaceholder: 'একটি ভিডিও URL পেস্ট করুন (MP4, MOV, AVI...)', useLocalAgent: 'স্থানীয় Mac এজেন্ট ব্যবহার করুন (স্থিতিশীল YouTube-এর জন্য সুপারিশকৃত)', uploadLocal: 'একটি স্থানীয় ভিডিও ফাইল আপলোড করুন (YouTube লিঙ্ক ব্লক থাকলে সুপারিশকৃত)', selectedFile: 'নির্বাচিত', downloadMacApp: 'Mac অ্যাপ ডাউনলোড করুন', viewPricing: 'মূল্য দেখুন', clipsReady: 'ক্লিপ প্রস্তুত', playableClips: 'চালানো যায় এমন ক্লিপ', failedClips: 'ব্যর্থ', aiFinished: 'AI আপনার সোর্স ভিডিও থেকে সবচেয়ে শক্তিশালী মুহূর্তগুলো নির্বাচন সম্পন্ন করেছে।', openToPreview: 'প্রিভিউ করতে যেকোনো প্রস্তুত ক্লিপ খুলুন, অথবা সরাসরি MP4 ডাউনলোড করুন।', clipsBeingGenerated: 'ক্লিপ তৈরি হচ্ছে:', videoPreviewNotAvailable: 'ভিডিও প্রিভিউ উপলব্ধ নয়', clipMayStillProcessing: 'ক্লিপটি এখনও প্রক্রিয়াধীন বা তৈরি ব্যর্থ হতে পারে।', insufficientCredits: 'অপর্যাপ্ত ক্রেডিট। আপনার কমপক্ষে 30 ক্রেডিট প্রয়োজন।', enterVideoUrl: 'অনুগ্রহ করে একটি ভিডিও URL লিখুন বা একটি স্থানীয় ভিডিও ফাইল আপলোড করুন।', enterValidUrl: 'অনুগ্রহ করে একটি বৈধ পাবলিক http(s) ভিডিও URL লিখুন।',
  stage: {
  init: 'শুরু হচ্ছে...', extractFrames: 'ভিডিও ফ্রেম বের করা হচ্ছে...', framesExtracted: 'ফ্রেম সফলভাবে বের করা হয়েছে', framesUnavailable: 'বিশ্লেষণের সাথে এগিয়ে যাচ্ছে', aiAnalysis: 'AI ভিডিও কন্টেন্ট বিশ্লেষণ করছে...', analysisComplete: 'বিশ্লেষণ সম্পন্ন', generatingClip: 'হাইলাইট ক্লিপ তৈরি হচ্ছে...', clipReady: 'হাইলাইট ক্লিপ প্রস্তুত', saving: 'ফলাফল সংরক্ষণ হচ্ছে...', complete: 'প্রক্রিয়াকরণ সম্পন্ন!', error: 'ত্রুটি ঘটেছে',
  },
  },
  pricing: {
  title: 'সহজ, স্বচ্ছ মূল্য', subtitle: 'আপনার প্রয়োজনের সাথে মিলে প্ল্যান নির্বাচন করুন',
  paymentNote: 'চীনের জন্য Alipay · আন্তর্জাতিকের জন্য Creem (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'সমস্ত পেমেন্ট TLS 256-বিট এনক্রিপশন দিয়ে সুরক্ষিত', faqTitle: 'সাধারণ জিজ্ঞাসা', faq: { q1: 'ক্রেডিট কী?', a1: 'প্রতিটি ক্রেডিট প্রক্রিয়াকরণ ক্ষমতা নির্দেশ করে। একটি ভিডিও ক্লিপ প্রক্রিয়া করতে 30 ক্রেডিট খরচ হয়।', q2: 'দৈনিক ক্রেডিট রিসেট কীভাবে কাজ করে?', a2: 'প্রতিদিন 00:00 UTC-তে আপনার প্ল্যানের দৈনিক সীমায় ক্রেডিট রিসেট হয়। অব্যবহৃত ক্রেডিট স্থানান্তরিত হয় না।', q3: 'আমি কি আমার প্ল্যান আপগ্রেড বা ডাউনগ্রেড করতে পারি?', a3: 'হ্যাঁ, আপনি যেকোনো সময় আপনার প্ল্যান পরিবর্তন করতে পারেন। পরিবর্তনগুলো অবিলম্বে কার্যকর হয়।', q4: 'কোন ভিডিও সোর্সগুলো সমর্থিত?', a4: 'আমরা YouTube, Bilibili এবং সরাসরি ভিডিও ফাইল আপলোড (MP4, MOV, AVI) সমর্থন করি।', q5: 'কোন পেমেন্ট পদ্ধতিগুলো সমর্থিত?', a5: 'চীন ব্যবহারকারীদের জন্য Alipay, আন্তর্জাতিক ব্যবহারকারীদের জন্য Creem (Visa, Mastercard, Apple Pay, Google Pay)।' },
  mostPopular: 'সবচেয়ে জনপ্রিয়',
  free: { title: 'ফ্রি', price: '$0', period: '/মাস', desc: 'চেষ্টা করার জন্য নিখুঁত', feature1: 'প্রতিদিন 100 ক্রেডিট', feature2: 'বেসিক ভিডিও কাটিং', feature3: '720p এক্সপোর্ট মান', feature4: 'ওয়াটারমার্ক অন্তর্ভুক্ত', cta: 'শুরু করুন' },
  starter: { title: 'স্টার্টার', price: '$9.9', period: '/মাস', desc: 'কনটেন্ট ক্রিয়েটরদের জন্য', feature1: 'প্রতিদিন 500 ক্রেডিট', feature2: 'অগ্রাধিকার প্রক্রিয়াকরণ', feature3: '1080p এক্সপোর্ট মান', feature4: 'কোনো ওয়াটারমার্ক নেই', feature5: 'ইমেইল সাপোর্ট', cta: 'এখনই সাবস্ক্রাইব করুন' },
  pro: { title: 'প্রো', price: '$19.9', period: '/মাস', desc: 'পেশাদার ও টিমের জন্য', feature1: 'অসীম ক্রেডিট', feature2: 'দ্রুততম প্রক্রিয়াকরণ', feature3: '4K এক্সপোর্ট মান', feature4: 'কোনো ওয়াটারমার্ক নেই', feature5: 'API অ্যাক্সেস', feature6: 'অগ্রাধিকার সাপোর্ট', cta: 'এখনই সাবস্ক্রাইব করুন' },
  },
  downloadPage: {
  title: 'Clipop Agent ডাউনলোড করুন', subtitle: 'স্থিতিশীল YouTube/Bilibili ভিডিও প্রক্রিয়াকরণের জন্য ডেস্কটপ অ্যাপ', badge: 'ডেস্কটপ অ্যাপ', macTitle: 'macOS', macDesc: 'Apple Silicon (M1/M2/M3/M4) Mac-এর জন্য', downloadButton: 'macOS-এর জন্য ডাউনলোড করুন', version: 'সংস্করণ', fileSize: 'ফাইলের আকার', requirements: 'macOS 12.0 বা পরবর্তী', installing: 'ইনস্টলেশন গাইড', step1: 'ডাউনলোড বাটনে ক্লিক করে .dmg ফাইল সংরক্ষণ করুন', step2: 'ডাউনলোড করা .dmg ফাইলে ডাবল-ক্লিক করুন', step3: 'Clipop Agent কে Applications ফোল্ডারে টেনে নিয়ে যান', step4: 'Applications থেকে Clipop Agent খুলুন', notAvailable: 'ডাউনলোড প্রস্তুত হচ্ছে, অনুগ্রহ করে পরে চেক করুন', backToHome: 'হোমে ফিরে যান', whyDesktopTitle: 'ডেস্কটপ অ্যাপ কেন ব্যবহার করবেন?', features: { stable: { title: 'স্থিতিশীল প্রক্রিয়াকরণ', desc: 'সর্বোচ্চ স্থিতিশীলতায় স্থানীয়ভাবে ভিডিও প্রক্রিয়া করুন' }, fast: { title: 'দ্রুত ডাউনলোড', desc: 'ব্রাউজার সীমাবদ্ধতা ছাড়া সরাসরি ভিডিও ডাউনলোড করুন' }, local: { title: 'স্থানীয় প্রক্রিয়াকরণ', desc: 'গোপনীয়তা এবং গতির জন্য আপনার Mac-এ ভিডিও প্রক্রিয়া করুন' } },
  },
  login: {
  title: 'লগইন করুন', description: 'আপনার অ্যাকাউন্ট অ্যাক্সেস করুন', emailLabel: 'ইমেইল', emailPlaceholder: 'you@example.com', passwordLabel: 'পাসওয়ার্ড', passwordPlaceholder: '••••••••', submitButton: 'লগইন করুন', orContinueWith: 'অথবা চালিয়ে যান', googleButton: 'Google দিয়ে চালিয়ে যান', dontHaveAccount: 'আপনার অ্যাকাউন্ট নেই?', signUp: 'নিবন্ধন করুন',
  successTitle: 'লগইন সফল!', successMessage: 'আপনি সফলভাবে লগইন করেছেন যেমন', successDesktopHint: 'ডেস্কটপ অ্যাপে ফিরে যেতে নিচের বাটনে ক্লিক করুন।', returnToDesktop: 'Clipop Agent-এ ফিরে যান', desktopNotOpened: 'যদি ডেস্কটপ অ্যাপ স্বয়ংক্রিয়ভাবে না খোলে, অনুগ্রহ করে নিশ্চিত করুন যে Clipop Agent চলছে।',
  },
  register: {
  title: 'অ্যাকাউন্ট তৈরি করুন', description: 'Clipop AI দিয়ে শুরু করুন', nameLabel: 'পুরো নাম', namePlaceholder: 'John Doe', emailLabel: 'ইমেইল', emailPlaceholder: 'you@example.com', passwordLabel: 'পাসওয়ার্ড', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'পাসওয়ার্ড নিশ্চিত করুন', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'চালিয়ে যান', sendingCode: 'পাঠানো হচ্ছে...', codeLabel: 'যাচাই কোড', codePlaceholder: '6-সংখ্যার কোড লিখুন', verifyButton: 'অ্যাকাউন্ট তৈরি করুন', codeNotReceived: 'কোড পাননি?', resendButton: 'পুনরায় পাঠান', resendIn: 'পুনরায় পাঠান', backButton: 'ফিরে যান', googleButton: 'Google দিয়ে চালিয়ে যান', alreadyHaveAccount: 'আপনার ইতিমধ্যে অ্যাকাউন্ট আছে?', signIn: 'লগইন করুন',
  errorNameRequired: 'অনুগ্রহ করে আপনার নাম লিখুন', errorEmailRequired: 'অনুগ্রহ করে আপনার ইমেইল লিখুন', errorPasswordLength: 'পাসওয়ার্ড কমপক্ষে 6 অক্ষরের হতে হবে', errorPasswordMismatch: 'পাসওয়ার্ড মেলেনি', errorEmailExists: 'এই ইমেইল ইতিমধ্যে নিবন্ধিত। অনুগ্রহ করে লগইন করুন।', errorSendCode: 'কোড পাঠাতে ব্যর্থ', errorNetwork: 'নেটওয়ার্ক ত্রুটি। অনুগ্রহ করে আবার চেষ্টা করুন।', errorCodeLength: 'অনুগ্রহ করে 6-সংখ্যার কোড লিখুন',
  successTitle: 'অ্যাকাউন্ট তৈরি হয়েছে!', successMessage: 'আপনার অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে যেমন', successDesktopHint: 'ডেস্কটপ অ্যাপে ফিরে যেতে নিচের বাটনে ক্লিক করুন।', returnToDesktop: 'Clipop Agent-এ ফিরে যান', desktopNotOpened: 'যদি ডেস্কটপ অ্যাপ স্বয়ংক্রিয়ভাবে না খোলে, অনুগ্রহ করে নিশ্চিত করুন যে Clipop Agent চলছে।',
  },
  dashboard: { title: 'ড্যাশবোর্ড', credits: 'উপলব্ধ ক্রেডিট', creditsReset: 'প্রতিদিন 00:00 UTC-তে রিসেট', history: 'প্রক্রিয়াকরণ ইতিহাস', noVideos: 'এখনো কোনো ভিডিও প্রক্রিয়া করা হয়নি', startProcessing: 'ভিডিও প্রক্রিয়াকরণ শুরু করুন',
  untitled: 'শিরোনামহীন', clip: 'ক্লিপ', clipsCount: 'হাইলাইট', clipsHint: 'চালানোর জন্য যেকোনো ক্লিপে ক্লিক করুন',
  desktopLoginDetected: 'ডেস্কটপ অ্যাপ লগইন সনাক্ত হয়েছে', desktopLoginHint: 'Clipop Agent-এ ফিরে যেতে নিচের বাটনে ক্লিক করুন', returnToDesktop: 'Clipop Agent-এ ফিরে যান',
  welcomeBack: 'ফিরে আসার জন্য স্বাগতম',
  videosProcessed: 'প্রক্রিয়াকৃত ভিডিও', videosProcessedDesc: 'মোট প্রক্রিয়াকৃত ভিডিও', clipsGenerated: 'তৈরি করা ক্লিপ', clipsGeneratedDesc: 'মোট হাইলাইট ক্লিপ',
  currentPlan: 'বর্তমান প্ল্যান', upgradePlan: 'প্ল্যান আপগ্রেড করুন',
  processNewVideo: 'নতুন ভিডিও প্রক্রিয়া করুন', feedback: 'প্রতিক্রিয়া',
  historyHint: 'হাইলাইট ক্লিপ দেখতে সম্পন্ন রেকর্ডগুলোতে ক্লিক করুন',
  processNewVideoDesc: 'একটি নতুন দীর্ঘ ভিডিও প্রক্রিয়া করতে হোম পেজে যান', goToProcessor: 'ভিডিও প্রসেসরে যান',
  userFeedback: 'ব্যবহারকারী প্রতিক্রিয়া', feedbackDesc: 'আপনি যে বৈশিষ্ট্যগুলো উন্নত করতে চান বা সমস্যাগুলো আমাদের জানান',
  feedbackPlaceholder: 'আপনার প্রতিক্রিয়া লিখুন (পরামর্শ, বাগ, বৈশিষ্ট্য অনুরোধ ইত্যাদি)', feedbackSubmitted: 'জমা হয়েছে, আপনার প্রতিক্রিয়ার জন্য ধন্যবাদ!',
  submitFeedback: 'প্রতিক্রিয়া জমা দিন', feedbackFailed: 'প্রতিক্রিয়া জমা দিতে ব্যর্থ',
  statusPending: 'অপেক্ষমাণ', statusProcessing: 'প্রক্রিয়াধীন', statusCompleted: '✓ সম্পন্ন', statusFailed: 'ব্যর্থ',
  },
  admin: { title: 'অ্যাডমিন প্যানেল', blog: 'ব্লগ ব্যবস্থাপনা', blogCreate: 'পোস্ট তৈরি করুন', blogTitle: 'শিরোনাম', blogCategory: 'ক্যাটাগরি', blogContent: 'কনটেন্ট', blogPublish: 'প্রকাশ করুন', blogSave: 'ড্রাফট সংরক্ষণ করুন', blogPublished: 'প্রকাশিত', blogDraft: 'ড্রাফট' },
  blog: { title: 'ব্লগ', readMore: 'আরও পড়ুন', noPosts: 'এখনো কোনো পোস্ট নেই', subtitle: 'Clipop AI থেকে সর্বশেষ সংবাদ, টিপস এবং আপডেট', views: 'ভিউ' },
  common: { loading: 'লোড হচ্ছে...', error: 'একটি ত্রুটি ঘটেছে', success: 'সাফল্য', cancel: 'বাতিল করুন', save: 'সংরক্ষণ করুন', delete: 'মুছে ফেলুন', edit: 'সম্পাদনা করুন', search: 'অনুসন্ধান করুন', ready: 'প্রস্তুত', failed: 'ব্যর্থ', saving: 'সংরক্ষণ হচ্ছে...', score: 'স্কোর', user: 'ব্যবহারকারী' },
};

export default translations;
