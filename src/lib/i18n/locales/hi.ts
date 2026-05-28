import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'होम', blog: 'ब्लॉग', pricing: 'मूल्य', login: 'लॉगिन', register: 'पंजीकरण', dashboard: 'डैशबोर्ड', admin: 'एडमिन पैनल', logout: 'लॉगआउट', credits: 'क्रेडिट', download: 'ऐप डाउनलोड करें', light: 'लाइट', dark: 'डार्क',
  },
  footer: {
  desc: 'AI-संचालित विश्लेषण और संपादन के साथ अपने लंबे वीडियो को आकर्षक छोटे क्लिप्स में बदलें।', quickLinks: 'त्वरित लिंक', legal: 'कानूनी', privacy: 'गोपनीयता नीति', terms: 'सेवा की शर्तें', contact: 'संपर्क', rights: 'सर्वाधिकार सुरक्षित।',
  },
  home: {
  hero: {
  badge: 'AI-संचालित वीडियो प्रोसेसिंग',
  title: 'लंबे वीडियो को वायरल शॉर्ट्स में बदलें',
  subtitle: 'AI-संचालित वीडियो क्लिपिंग जो आपके लंबे कंटेंट से सबसे अच्छे क्षणों को स्वचालित रूप से निकालती है',
  cta: 'मुफ्त में क्लिपिंग शुरू करें',
  secondary: 'डेमो देखें',
  },
  howItWorks: {
  title: 'यह कैसे काम करता है', step1: { title: 'वीडियो इनपुट', desc: 'URL पेस्ट करें या अपना वीडियो अपलोड करें' }, step2: { title: 'AI विश्लेषण', desc: 'AI स्वचालित रूप से हाइलाइट्स का पता लगाता है' }, step3: { title: 'क्लिप्स जनरेट करें', desc: 'शॉर्ट वीडियो बनाए जाते हैं' }, step4: { title: 'डाउनलोड', desc: 'एक्सपोर्ट करें और कहीं भी शेयर करें' },
  },
  features: {
  title: 'शक्तिशाली AI वीडियो क्लिपिंग',
  auto: { title: 'स्वचालित हाइलाइट डिटेक्शन', desc: 'AI आपके वीडियो का विश्लेषण करती है और स्वचालित रूप से सबसे आकर्षक क्षणों की पहचान करती है' },
  multi: { title: 'मल्टी-प्लेटफॉर्म सपोर्ट', desc: 'YouTube, Bilibili से आयात करें या अपनी वीडियो फाइलें अपलोड करें' },
  quick: { title: 'त्वरित एक्सपोर्ट', desc: 'अपने क्लिप्स को कई प्रारूपों में डाउनलोड करें, किसी भी सोशल प्लेटफॉर्म के लिए तैयार' },
  },
  },
  video: {
  input: { title: 'इनपुट वीडियो', url: 'वीडियो URL (YouTube/Bilibili)', upload: 'वीडियो अपलोड करें', placeholder: 'YouTube या Bilibili वीडियो लिंक पेस्ट करें...' },
  process: 'वीडियो प्रक्रिया करें', processing: 'प्रक्रिया हो रही है...', analyze: 'विश्लेषण करें', results: 'जनरेट किए गए शॉर्ट्स', highlights: 'हाइलाइट विश्लेषण', download: 'डाउनलोड', preview: 'पूर्वावलोकन',
  creditsAvailable: 'क्रेडिट उपलब्ध', signInToStart: 'वीडियो प्रोसेसिंग शुरू करने के लिए', pasteUrlPlaceholder: 'वीडियो URL पेस्ट करें (MP4, MOV, AVI...)', useLocalAgent: 'लोकल Mac एजेंट का उपयोग करें (स्थिर YouTube के लिए अनुशंसित)', uploadLocal: 'लोकल वीडियो फाइल अपलोड करें (जब YouTube लिंक ब्लॉक हो तो अनुशंसित)', selectedFile: 'चयनित', downloadMacApp: 'Mac ऐप डाउनलोड करें', viewPricing: 'मूल्य देखें', clipsReady: 'क्लिप्स तैयार', playableClips: 'चलाने योग्य क्लिप्स', failedClips: 'विफल', aiFinished: 'AI ने आपके सोर्स वीडियो से सबसे मजबूत क्षणों का चयन पूरा कर लिया है।', openToPreview: 'पूर्वावलोकन के लिए कोई भी तैयार क्लिप खोलें, या सीधे MP4 डाउनलोड करें।', clipsBeingGenerated: 'क्लिप्स जनरेट हो रहे हैं:', videoPreviewNotAvailable: 'वीडियो पूर्वावलोकन उपलब्ध नहीं', clipMayStillProcessing: 'क्लिप अभी भी प्रोसेस हो रहा होगा या जनरेशन विफल हो गया।', insufficientCredits: 'अपर्याप्त क्रेडिट। आपको कम से कम 30 क्रेडिट चाहिए।', enterVideoUrl: 'कृपया वीडियो URL दर्ज करें या लोकल वीडियो फाइल अपलोड करें।', enterValidUrl: 'कृपया एक मान्य सार्वजनिक http(s) वीडियो URL दर्ज करें।',
  stage: {
  init: 'प्रारंभ हो रहा है...', extractFrames: 'वीडियो फ्रेम निकाले जा रहे हैं...', framesExtracted: 'फ्रेम सफलतापूर्वक निकाले गए', framesUnavailable: 'विश्लेषण के साथ जारी रखें', aiAnalysis: 'AI वीडियो कंटेंट का विश्लेषण कर रही है...', analysisComplete: 'विश्लेषण पूर्ण', generatingClip: 'हाइलाइट क्लिप बनाई जा रही है...', clipReady: 'हाइलाइट क्लिप तैयार', saving: 'परिणाम सहेजे जा रहे हैं...', complete: 'प्रोसेसिंग पूर्ण!', error: 'त्रुटि उत्पन्न हुई',
  },
  },
  pricing: {
  title: 'सरल, पारदर्शी मूल्य निर्धारण', subtitle: 'अपनी जरूरतों के अनुरूप प्लान चुनें',
  paymentNote: 'चीन के लिए Alipay · अंतरराष्ट्रीय के लिए Creem (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'सभी भुगतान TLS 256-बिट एन्क्रिप्शन के साथ सुरक्षित', faqTitle: 'अक्सर पूछे जाने वाले प्रश्न', faq: { q1: 'क्रेडिट क्या है?', a1: 'प्रत्येक क्रेडिट प्रोसेसिंग शक्ति का प्रतिनिधित्व करता है। वीडियो क्लिप प्रोसेस करने में 30 क्रेडिट लगते हैं।', q2: 'दैनिक क्रेडिट रीसेट कैसे काम करता है?', a2: 'क्रेडिट हर दिन 00:00 UTC पर आपके प्लान की दैनिक सीमा पर रीसेट होते हैं। अप्रयुक्त क्रेडिट आगे नहीं बढ़ते।', q3: 'क्या मैं अपना प्लान अपग्रेड या डाउनग्रेड कर सकता हूं?', a3: 'हां, आप किसी भी समय अपना प्लान बदल सकते हैं। परिवर्तन तुरंत प्रभावी होते हैं।', q4: 'कौन से वीडियो स्रोत समर्थित हैं?', a4: 'हम YouTube, Bilibili और सीधे वीडियो फाइल अपलोड (MP4, MOV, AVI) का समर्थन करते हैं।', q5: 'कौन से भुगतान विधियां समर्थित हैं?', a5: 'चीन उपयोगकर्ताओं के लिए Alipay, अंतरराष्ट्रीय उपयोगकर्ताओं के लिए Creem (Visa, Mastercard, Apple Pay, Google Pay)।' },
  mostPopular: 'सबसे लोकप्रिय',
  free: { title: 'मुफ्त', price: '$0', period: '/महीना', desc: 'प्रयोग के लिए सही', feature1: 'दैनिक 100 क्रेडिट', feature2: 'बेसिक वीडियो क्लिपिंग', feature3: '720p एक्सपोर्ट गुणवत्ता', feature4: 'वॉटरमार्क शामिल', cta: 'शुरू करें' },
  starter: { title: 'स्टार्टर', price: '$9.9', period: '/महीना', desc: 'कंटेंट क्रिएटर्स के लिए', feature1: 'दैनिक 500 क्रेडिट', feature2: 'प्राथमिकता प्रक्रिया', feature3: '1080p एक्सपोर्ट गुणवत्ता', feature4: 'वॉटरमार्क नहीं', feature5: 'ईमेल सपोर्ट', cta: 'अभी सब्सक्राइब करें' },
  pro: { title: 'प्रो', price: '$19.9', period: '/महीना', desc: 'पेशेवरों और टीमों के लिए', feature1: 'असीमित क्रेडिट', feature2: 'तेज़तम प्रक्रिया', feature3: '4K एक्सपोर्ट गुणवत्ता', feature4: 'वॉटरमार्क नहीं', feature5: 'API एक्सेस', feature6: 'प्राथमिकता सपोर्ट', cta: 'अभी सब्सक्राइब करें' },
  },
  downloadPage: {
  title: 'Clipop Agent डाउनलोड करें', subtitle: 'स्थिर YouTube/Bilibili वीडियो प्रोसेसिंग के लिए डेस्कटॉप ऐप', badge: 'डेस्कटॉप ऐप', macTitle: 'macOS', macDesc: 'Apple Silicon (M1/M2/M3/M4) Mac के लिए', downloadButton: 'macOS के लिए डाउनलोड करें', version: 'संस्करण', fileSize: 'फाइल का आकार', requirements: 'macOS 12.0 या बाद का', installing: 'इंस्टॉलेशन गाइड', step1: 'डाउनलोड बटन पर क्लिक करके .dmg फाइल सेव करें', step2: 'डाउनलोड की गई .dmg फाइल पर डबल-क्लिक करें', step3: 'Clipop Agent को Applications फोल्डर में ड्रैग करें', step4: 'Applications से Clipop Agent खोलें', notAvailable: 'डाउनलोड तैयार किया जा रहा है, कृपया बाद में दोबारा देखें', backToHome: 'होम पर वापस जाएं', whyDesktopTitle: 'डेस्कटॉप ऐप का उपयोग क्यों करें?', features: { stable: { title: 'स्थिर प्रोसेसिंग', desc: 'अधिकतम स्थिरता के साथ लोकली वीडियो प्रोसेस करें' }, fast: { title: 'तेज़ डाउनलोड', desc: 'ब्राउज़र सीमाओं के बिना सीधे वीडियो डाउनलोड करें' }, local: { title: 'लोकल प्रोसेसिंग', desc: 'गोपनीयता और गति के लिए अपने Mac पर वीडियो प्रोसेस करें' } },
  },
  login: {
  title: 'लॉगिन करें', description: 'अपना खाता एक्सेस करें', emailLabel: 'ईमेल', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: '••••••••', submitButton: 'लॉगिन करें', orContinueWith: 'या इसके साथ जारी रखें', googleButton: 'Google के साथ जारी रखें', dontHaveAccount: 'खाता नहीं है?', signUp: 'पंजीकरण करें',
  successTitle: 'लॉगिन सफल!', successMessage: 'आपने लॉगिन किया है', successDesktopHint: 'डेस्कटॉप ऐप पर वापस जाने के लिए नीचे दिए गए बटन पर क्लिक करें।', returnToDesktop: 'Clipop Agent पर वापस जाएं', desktopNotOpened: 'यदि डेस्कटॉप ऐप स्वचालित रूप से नहीं खुलता है, तो कृपया सुनिश्चित करें कि Clipop Agent चल रहा है।',
  },
  register: {
  title: 'खाता बनाएं', description: 'Clipop AI के साथ शुरू करें', nameLabel: 'पूरा नाम', namePlaceholder: 'John Doe', emailLabel: 'ईमेल', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'पासवर्ड की पुष्टि करें', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'जारी रखें', sendingCode: 'भेज रहा है...', codeLabel: 'सत्यापन कोड', codePlaceholder: '6-अंक का कोड दर्ज करें', verifyButton: 'खाता बनाएं', codeNotReceived: 'कोड प्राप्त नहीं हुआ?', resendButton: 'पुनः भेजें', resendIn: 'पुनः भेजें', backButton: 'वापस', googleButton: 'Google के साथ जारी रखें', alreadyHaveAccount: 'पहले से ही खाता है?', signIn: 'लॉगिन करें',
  errorNameRequired: 'कृपया अपना नाम दर्ज करें', errorEmailRequired: 'कृपया अपना ईमेल दर्ज करें', errorPasswordLength: 'पासवर्ड कम से कम 6 अक्षर का होना चाहिए', errorPasswordMismatch: 'पासवर्ड मेल नहीं खाते', errorEmailExists: 'यह ईमेल पहले से पंजीकृत है। कृपया लॉगिन करें।', errorSendCode: 'कोड भेजने में विफल', errorNetwork: 'नेटवर्क त्रुटि। कृपया पुनः प्रयास करें।', errorCodeLength: 'कृपया 6-अंक का कोड दर्ज करें',
  successTitle: 'खाता बनाया गया!', successMessage: 'आपका खाता बनाया गया है', successDesktopHint: 'डेस्कटॉप ऐप पर वापस जाने के लिए नीचे दिए गए बटन पर क्लिक करें।', returnToDesktop: 'Clipop Agent पर वापस जाएं', desktopNotOpened: 'यदि डेस्कटॉप ऐप स्वचालित रूप से नहीं खुलता है, तो कृपया सुनिश्चित करें कि Clipop Agent चल रहा है।',
  },
  dashboard: { title: 'डैशबोर्ड', credits: 'उपलब्ध क्रेडिट', creditsReset: 'रोज 00:00 UTC पर रीसेट', history: 'प्रक्रिया इतिहास', noVideos: 'अभी तक कोई वीडियो प्रोसेस नहीं किया गया', startProcessing: 'वीडियो प्रोसेसिंग शुरू करें',
  untitled: 'शीर्षकहीन', clip: 'क्लिप', clipsCount: 'हाइलाइट्स', clipsHint: 'चलाने के लिए किसी भी क्लिप पर क्लिक करें',
  desktopLoginDetected: 'डेस्कटॉप ऐप लॉगिन पहचाना गया', desktopLoginHint: 'Clipop Agent पर वापस जाने के लिए नीचे दिए गए बटन पर क्लिक करें', returnToDesktop: 'Clipop Agent पर वापस जाएं',
  welcomeBack: 'वापस स्वागत है',
  videosProcessed: 'प्रोसेस किए गए वीडियो', videosProcessedDesc: 'कुल प्रोसेस किए गए वीडियो', clipsGenerated: 'जनरेट किए गए क्लिप्स', clipsGeneratedDesc: 'कुल हाइलाइट क्लिप्स',
  currentPlan: 'वर्तमान प्लान', upgradePlan: 'प्लान अपग्रेड करें',
  processNewVideo: 'नया वीडियो प्रोसेस करें', feedback: 'फीडबैक',
  historyHint: 'हाइलाइट क्लिप्स देखने के लिए पूर्ण रिकॉर्ड पर क्लिक करें',
  processNewVideoDesc: 'नया लंबा वीडियो प्रोसेस करने के लिए होमपेज पर जाएं', goToProcessor: 'वीडियो प्रोसेसर पर जाएं',
  userFeedback: 'उपयोगकर्ता फीडबैक', feedbackDesc: 'हमें बताएं कि आप कौन सी सुविधाएं सुधारना चाहते हैं या किन समस्याओं का सामना किया',
  feedbackPlaceholder: 'अपना फीडबैक दर्ज करें (सुझाव, बग, सुविधा अनुरोध, आदि)', feedbackSubmitted: 'जमा हो गया, आपके फीडबैक के लिए धन्यवाद!',
  submitFeedback: 'फीडबैक जमा करें', feedbackFailed: 'फीडबैक जमा करने में विफल',
  statusPending: 'लंबित', statusProcessing: 'प्रोसेसिंग', statusCompleted: '✓ पूर्ण', statusFailed: 'विफल',
  },
  admin: { title: 'एडमिन पैनल', blog: 'ब्लॉग प्रबंधन', blogCreate: 'पोस्ट बनाएं', blogTitle: 'शीर्षक', blogCategory: 'श्रेणी', blogContent: 'सामग्री', blogPublish: 'प्रकाशित करें', blogSave: 'ड्राफ्ट सहेजें', blogPublished: 'प्रकाशित', blogDraft: 'ड्राफ्ट' },
  blog: { title: 'ब्लॉग', readMore: 'और पढ़ें', noPosts: 'अभी तक कोई पोस्ट नहीं', subtitle: 'Clipop AI से नवीनतम समाचार, टिप्स और अपडेट', views: 'दृश्य' },
  common: { loading: 'लोड हो रहा है...', error: 'एक त्रुटि हुई', success: 'सफलता', cancel: 'रद्द करें', save: 'सहेजें', delete: 'हटाएं', edit: 'संपादित करें', search: 'खोजें', ready: 'तैयार', failed: 'विफल', saving: 'सहेज रहा है...', score: 'स्कोर', user: 'उपयोगकर्ता' },
};

export default translations;
