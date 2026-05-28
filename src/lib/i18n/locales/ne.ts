import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'होम', blog: 'ब्लग', pricing: 'मूल्यहरू', login: 'लगइन', register: 'रजिस्टर', dashboard: 'ड्यासबोर्ड', admin: 'व्यवस्थापक प्यानेल', logout: 'लगआउट', credits: 'क्रेडिट्स', download: 'एप डाउनलोड', light: 'लाइट', dark: 'डार्क',
  },
  common: {
  error: 'त्रुटि', ready: 'तयार', failed: 'असफल', saving: 'सेभ हुँदैछ...', score: 'स्कोर', user: 'प्रयोगकर्ता',
  loading: 'लोड भइरहेको छ...', success: 'सफलता', cancel: 'रद्द गर्नुहोस्', save: 'सेभ गर्नुहोस्', delete: 'मेटाउनुहोस्', edit: 'सम्पादन गर्नुहोस्', search: 'खोज्नुहोस्',
  },
  footer: {
  desc: 'AI-संचालित विश्लेषण र सम्पादनसँग तपाईंको लामो भिडियोहरूलाई आकर्षक छोटो क्लिपहरूमा रूपान्तरण गर्नुहोस्।',
  quickLinks: 'द्रुत लिंकहरू', legal: 'कानुनी', privacy: 'गोपनीयता नीति', terms: 'सेवा सर्तहरू', contact: 'सम्पर्क', rights: 'सर्वाधिकार सुरक्षित।',
  },
  home: {
  hero: {
  badge: 'AI-संचालित भिडियो प्रक्रिया',
  title: 'लामो भिडियोहरूलाई भाइरल सर्टहरूमा रूपान्तरण गर्नुहोस्',
  subtitle: 'AI-संचालित भिडियो काट्ने जसले तपाईंको लामो सामग्रीबाट उत्कृष्ट क्षणहरू स्वचालित रूपमा निकाल्छ',
  cta: 'नि:शुल्क काट्न सुरू गर्नुहोस्',
  secondary: 'डेमो हेर्नुहोस्',
  },
  features: {
  title: 'शक्तिशाली AI भिडियो काट्ने',
  auto: { title: 'अटो हाइलाइट डिटेक्शन', desc: 'AI ले तपाईंको भिडियोको विश्लेषण गर्छ र सबैभन्दा आकर्षक क्षणहरू स्वचालित रूपमा पहिचान गर्छ' },
  multi: { title: 'बहु-प्लेटफर्म समर्थन', desc: 'YouTube, Bilibili बाट आयात गर्नुहोस् वा आफ्नै भिडियो फाइलहरू अपलोड गर्नुहोस्' },
  quick: { title: 'छिटो निर्यात', desc: 'तपाईंको क्लिपहरू धेरै प्रारूपहरूमा डाउनलोड गर्नुहोस्, कुनै पनि सोशल प्लेटफर्मका लागि तयार' },
  },
  howItWorks: {
  title: 'यो कसरी काम गर्छ',
  step1: { title: 'भिडियो इनपुट', desc: 'URL पेस्ट गर्नुहोस् वा भिडियो अपलोड गर्नुहोस्' },
  step2: { title: 'AI विश्लेषण', desc: 'AI ले स्वचालित रूपमा हाइलाइटहरू पहिचान गर्छ' },
  step3: { title: 'क्लिपहरू सिर्जना गर्नुहोस्', desc: 'छोटो भिडियोहरू सिर्जना हुन्छन्' },
  step4: { title: 'डाउनलोड', desc: 'निर्यात गर्नुहोस् र कहीं पनि साझा गर्नुहोस्' },
  },
  },
  video: {
  input: { title: 'इनपुट भिडियो', url: 'भिडियो URL (YouTube/Bilibili)', upload: 'भिडियो अपलोड गर्नुहोस्', placeholder: 'YouTube वा Bilibili भिडियो लिंक पेस्ट गर्नुहोस्...' },
  process: 'भिडियो प्रक्रिया गर्नुहोस्', processing: 'प्रक्रिया भइरहेको छ...', analyze: 'विश्लेषण', results: 'उत्पन्न गरिएका सर्टहरू', highlights: 'हाइलाइट विश्लेषण', download: 'डाउनलोड', preview: 'पूर्वावलोकन',
  creditsAvailable: 'क्रेडिट्स उपलब्ध', signInToStart: 'भिडियो प्रक्रिया सुरू गर्न', pasteUrlPlaceholder: 'भिडियो URL पेस्ट गर्नुहोस् (MP4, MOV, AVI...)', useLocalAgent: 'स्थानीय Mac Agent प्रयोग गर्नुहोस् (स्थिर YouTube को लागि सिफारिस)', uploadLocal: 'स्थानीय भिडियो फाइल अपलोड गर्नुहोस् (YouTube लिंक ब्लक हुँदा सिफारिस)', selectedFile: 'चयन गरिएको', downloadMacApp: 'Mac एप डाउनलोड', viewPricing: 'मूल्य हेर्नुहोस्', clipsReady: 'क्लिपहरू तयार', playableClips: 'प्ले गर्न मिल्ने क्लिपहरू', failedClips: 'असफल', aiFinished: 'AI ले तपाईंको स्रोत भिडियोबाट सबैभन्दा बलियो क्षणहरू छनोट गर्ने काम पूरा गरेको छ।', openToPreview: 'इनलाइन पूर्वावलोकनको लागि कुनै पनि तयार क्लिप खोल्नुहोस् वा MP4 सीधै डाउनलोड गर्नुहोस्।', clipsBeingGenerated: 'क्लिपहरू सिर्जना हुँदैछन्:', videoPreviewNotAvailable: 'भिडियो पूर्वावलोकन उपलब्ध छैन', clipMayStillProcessing: 'क्लिप अझै प्रक्रिया हुँदैछ वा सिर्जना असफल भएको हुन सक्छ।', insufficientCredits: 'अपर्याप्त क्रेडिट्स। तपाईंलाई कम्तिमा 30 क्रेडिट्स चाहिन्छ।', enterVideoUrl: 'कृपया भिडियो URL प्रविष्ट गर्नुहोस् वा स्थानीय भिडियो फाइल अपलोड गर्नुहोस्।', enterValidUrl: 'कृपया वैध सार्वजनिक http(s) भिडियो URL प्रविष्ट गर्नुहोस्।',
  stage: {
  init: 'सुरू गर्दै...', extractFrames: 'भिडियो फ्रेमहरू निकाल्दै...', framesExtracted: 'फ्रेमहरू सफलतापूर्वक निकालिए', framesUnavailable: 'विश्लेषणसँग जारी', aiAnalysis: 'AI ले भिडियो सामग्रीको विश्लेषण गर्दै...', analysisComplete: 'विश्लेषण पूर्ण', generatingClip: 'हाइलाइट क्लिप सिर्जना गर्दै...', clipReady: 'हाइलाइट क्लिप तयार', saving: 'परिणामहरू सेभ हुँदैछन्...', complete: 'प्रक्रिया पूर्ण!', error: 'त्रुटि भयो',
  },
  },
  pricing: {
  title: 'सरल, पारदर्शी मूल्य निर्धारण', subtitle: 'तपाईंको आवश्यकताहरू अनुसार योजना चयन गर्नुहोस्',
  paymentNote: 'चीनको लागि Alipay · अन्तर्राष्ट्रियको लागि Creem (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'सबै भुक्तानीहरू TLS 256-bit एन्क्रिप्सनले सुरक्षित', faqTitle: 'प्रायः सोधिने प्रश्नहरू', faq: { q1: 'क्रेडिट भनेको के हो?', a1: 'प्रत्येक क्रेडिटले प्रक्रिया शक्ति प्रतिनिधित्व गर्छ। भिडियो क्लिप प्रक्रिया गर्न 30 क्रेडिट्स लाग्छ।', q2: 'दैनिक क्रेडिट रिसेट कसरी काम गर्छ?', a2: 'क्रेडिट्स प्रतिदिन 00:00 UTC मा तपाईंको योजनाको दैनिक सीमामा रिसेट हुन्छन्। प्रयोग नगरिएका क्रेडिट्स स्थानान्तरण हुँदैनन्।', q3: 'के म योजना अपग्रेड वा डाउनग्रेड गर्न सक्छु?', a3: 'हो, तपाईं कुनै पनि समयमा योजना परिवर्तन गर्न सक्नुहुन्छ। परिवर्तनहरू तुरुन्तै प्रभावकारी हुन्छन्।', q4: 'कुन भिडियो स्रोतहरू समर्थित छन्?', a4: 'हामी YouTube, Bilibili र प्रत्यक्ष भिडियो फाइल अपलोड (MP4, MOV, AVI) समर्थन गर्छौं।', q5: 'कुन भुक्तानी विधिहरू समर्थित छन्?', a5: 'चीन प्रयोगकर्ताहरूको लागि Alipay, अन्तर्राष्ट्रिय प्रयोगकर्ताहरूको लागि Creem (Visa, Mastercard, Apple Pay, Google Pay)।' },
  mostPopular: 'सबैभन्दा लोकप्रिय',
  free: { title: 'नि:शुल्क', price: '$0', period: '/महिना', desc: 'प्रयास गर्नका लागि उत्कृष्ट', feature1: 'प्रतिदिन 100 क्रेडिट्स', feature2: 'आधारभूत भिडियो काट्ने', feature3: '720p निर्यात गुणस्तर', feature4: 'वाटरमार्क समावेश', cta: 'सुरू गर्नुहोस्' },
  starter: { title: 'स्टार्टर', price: '$9.9', period: '/महिना', desc: 'सामग्री सिर्जनाकर्ताहरूका लागि', feature1: 'प्रतिदिन 500 क्रेडिट्स', feature2: 'प्राथमिकता प्रक्रिया', feature3: '1080p निर्यात गुणस्तर', feature4: 'वाटरमार्क छैन', feature5: 'इमेल समर्थन', cta: 'अहिले सदस्यता लिनुहोस्' },
  pro: { title: 'प्रो', price: '$19.9', period: '/महिना', desc: 'पेशेवरहरू र टिमहरूका लागि', feature1: 'असीमित क्रेडिट्स', feature2: 'सबैभन्दा छिटो प्रक्रिया', feature3: '4K निर्यात गुणस्तर', feature4: 'वाटरमार्क छैन', feature5: 'API पहुँच', feature6: 'प्राथमिकता समर्थन', cta: 'अहिले सदस्यता लिनुहोस्' },
  },
  downloadPage: {
  title: 'Clipop Agent डाउनलोड गर्नुहोस्', subtitle: 'स्थिर YouTube/Bilibili भिडियो प्रक्रियाको लागि डेस्कटप एप', badge: 'डेस्कटप एप', macTitle: 'macOS', macDesc: 'Apple Silicon (M1/M2/M3/M4) Mac को लागि', downloadButton: 'macOS को लागि डाउनलोड', version: 'संस्करण', fileSize: 'फाइल आकार', requirements: 'macOS 12.0 वा पछि', installing: 'स्थापना गाइड', step1: '.dmg फाइल सेभ गर्न डाउनलोड बटन क्लिक गर्नुहोस्', step2: 'डाउनलोड गरिएको .dmg फाइलमा डबल-क्लिक गर्नुहोस्', step3: 'Clipop Agent लाई एप्लिकेसनहरू फोल्डरमा ड्र्याग गर्नुहोस्', step4: 'एप्लिकेसनहरूबाट Clipop Agent खोल्नुहोस्', notAvailable: 'डाउनलोड तयार हुँदैछ, कृपया पछि फेरि जाँच गर्नुहोस्', backToHome: 'होममा फर्कनुहोस्', whyDesktopTitle: 'डेस्कटप एप किन प्रयोग गर्ने?', features: { stable: { title: 'स्थिर प्रक्रिया', desc: 'अधिकतम स्थिरतासँग स्थानीय रूपमा भिडियोहरू प्रक्रिया गर्नुहोस्' }, fast: { title: 'छिटो डाउनलोड', desc: 'ब्राउजर सीमाहरू बिना सीधै भिडियोहरू डाउनलोड गर्नुहोस्' }, local: { title: 'स्थानीय प्रक्रिया', desc: 'गोपनीयता र गतिको लागि तपाईंको Mac मा भिडियोहरू प्रक्रिया गर्नुहोस्' } },
  },
  login: {
  title: 'लगइन', description: 'तपाईंको खातामा पहुँच गर्नुहोस्', emailLabel: 'इमेल', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: '••••••••', submitButton: 'लगइन', orContinueWith: 'वा जारी राख्नुहोस्', googleButton: 'Google सँग जारी राख्नुहोस्', dontHaveAccount: 'खाता छैन?', signUp: 'रजिस्टर',
  successTitle: 'लगइन सफल!', successMessage: 'तपाईं सफलतापूर्वक लगइन भएको छ भनेर', successDesktopHint: 'डेस्कटप एपमा फर्कन तलको बटन क्लिक गर्नुहोस्।', returnToDesktop: 'Clipop Agent मा फर्कनुहोस्', desktopNotOpened: 'यदि डेस्कटप एप स्वचालित रूपमा खुल्दैन भने, Clipop Agent चलिरहेको छ भन्ने निश्चित गर्नुहोस्।',
  },
  register: {
  title: 'खाता सिर्जना गर्नुहोस्', description: 'Clipop AI सँग सुरू गर्नुहोस्', nameLabel: 'पूरा नाम', namePlaceholder: 'John Doe', emailLabel: 'इमेल', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'पासवर्ड पुष्टि गर्नुहोस्', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'जारी राख्नुहोस्', sendingCode: 'पठाइरहेको छ...', codeLabel: 'प्रमाणीकरण कोड', codePlaceholder: '6-अंकको कोड प्रविष्ट गर्नुहोस्', verifyButton: 'खाता सिर्जना गर्नुहोस्', codeNotReceived: 'कोड प्राप्त भएन?', resendButton: 'पुन: पठाउनुहोस्', resendIn: 'पुन: पठाउनुहोस्', backButton: 'फर्कनुहोस्', googleButton: 'Google सँग जारी राख्नुहोस्', alreadyHaveAccount: 'पहिले नै खाता छ?', signIn: 'लगइन',
  errorNameRequired: 'कृपया तपाईंको नाम प्रविष्ट गर्नुहोस्', errorEmailRequired: 'कृपया तपाईंको इमेल प्रविष्ट गर्नुहोस्', errorPasswordLength: 'पासवर्ड कम्तिमा 6 अक्षरको हुनुपर्छ', errorPasswordMismatch: 'पासवर्डहरू मेल खाँदैनन्', errorEmailExists: 'यो इमेल पहिले नै दर्ता भएको छ। कृपया लगइन गर्नुहोस्।', errorSendCode: 'कोड पठाउन असफल', errorNetwork: 'नेटवर्क त्रुटि। कृपया पुन: प्रयास गर्नुहोस्।', errorCodeLength: 'कृपया 6-अंकको कोड प्रविष्ट गर्नुहोस्',
  successTitle: 'खाता सिर्जना भयो!', successMessage: 'तपाईंको खाता सफलतापूर्वक सिर्जना भयो भनेर', successDesktopHint: 'डेस्कटप एपमा फर्कन तलको बटन क्लिक गर्नुहोस्।', returnToDesktop: 'Clipop Agent मा फर्कनुहोस्', desktopNotOpened: 'यदि डेस्कटप एप स्वचालित रूपमा खुल्दैन भने, Clipop Agent चलिरहेको छ भन्ने निश्चित गर्नुहोस्।',
  },
  dashboard: { title: 'ड्यासबोर्ड', credits: 'उपलब्ध क्रेडिट्स', creditsReset: 'प्रतिदिन 00:00 UTC मा रिसेट', history: 'प्रक्रिया इतिहास', noVideos: 'अहिलेसम्म कुनै भिडियो प्रक्रिया भएको छैन', startProcessing: 'भिडियो प्रक्रिया सुरू गर्नुहोस्',
  untitled: 'शीर्षक विहीन', clip: 'क्लिप', clipsCount: 'हाइलाइटहरू', clipsHint: 'प्ले गर्न कुनै पनि क्लिप क्लिक गर्नुहोस्',
  desktopLoginDetected: 'डेस्कटप एप लगइन पत्ता लाग्यो', desktopLoginHint: 'Clipop Agent मा फर्कन तलको बटन क्लिक गर्नुहोस्', returnToDesktop: 'Clipop Agent मा फर्कनुहोस्',
  welcomeBack: 'फेरि स्वागत छ',
  videosProcessed: 'प्रक्रिया गरिएका भिडियोहरू', videosProcessedDesc: 'कुल प्रक्रिया गरिएका भिडियोहरू', clipsGenerated: 'सिर्जना गरिएका क्लिपहरू', clipsGeneratedDesc: 'कुल हाइलाइट क्लिपहरू',
  currentPlan: 'हालको योजना', upgradePlan: 'योजना अपग्रेड गर्नुहोस्',
  processNewVideo: 'नयाँ भिडियो प्रक्रिया गर्नुहोस्', feedback: 'प्रतिक्रिया',
  historyHint: 'हाइलाइट क्लिपहरू हेर्न पूर्ण रेकर्डहरू विस्तार गर्नुहोस्',
  processNewVideoDesc: 'नयाँ लामो भिडियो प्रक्रिया गर्न होम पेजमा जानुहोस्', goToProcessor: 'भिडियो प्रोसेसरमा जानुहोस्',
  userFeedback: 'प्रयोगकर्ता प्रतिक्रिया', feedbackDesc: 'सुधार गर्न चाहनुभएका सुविधाहरू वा भोगेका समस्याहरू बारे हामीलाई बताउनुहोस्',
  feedbackPlaceholder: 'तपाईंको प्रतिक्रिया प्रविष्ट गर्नुहोस् (सुझावहरू, बगहरू, सुविधा अनुरोधहरू आदि)', feedbackSubmitted: 'बुझाइयो, तपाईंको प्रतिक्रियाको लागि धन्यवाद!',
  submitFeedback: 'प्रतिक्रिया बुझाउनुहोस्', feedbackFailed: 'प्रतिक्रिया बुझाउन असफल',
  statusPending: 'पेन्डिङ', statusProcessing: 'प्रक्रिया हुँदैछ', statusCompleted: '✓ पूर्ण', statusFailed: 'असफल',
  },
  admin: { title: 'व्यवस्थापक प्यानेल', blog: 'ब्लग व्यवस्थापन', blogCreate: 'पोस्ट सिर्जना गर्नुहोस्', blogTitle: 'शीर्षक', blogCategory: 'श्रेणी', blogContent: 'सामग्री', blogPublish: 'प्रकाशित गर्नुहोस्', blogSave: 'ड्राफ्ट सेभ गर्नुहोस्', blogPublished: 'प्रकाशित', blogDraft: 'ड्राफ्ट' },
  blog: { title: 'ब्लग', readMore: 'थप पढ्नुहोस्', noPosts: 'अहिलेसम्म कुनै पोस्ट छैन', subtitle: 'Clipop AI बाट नवीनतम समाचार, सुझावहरू र अपडेटहरू', views: 'दृश्यहरू' },
  common: { loading: 'लोड भइरहेको छ...', error: 'त्रुटि भयो', success: 'सफलता', cancel: 'रद्द गर्नुहोस्', save: 'सेभ गर्नुहोस्', delete: 'मेटाउनुहोस्', edit: 'सम्पादन गर्नुहोस्', search: 'खोज्नुहोस्' },
};

export default translations;
