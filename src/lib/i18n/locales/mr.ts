import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'मुख्यपृष्ठ', blog: 'ब्लॉग', pricing: 'किंमती', login: 'लॉगिन', register: 'नोंदणी', dashboard: 'डॅशबोर्ड', admin: 'अॅडमिन पॅनेल', logout: 'लॉगआउट', credits: 'क्रेडिटस', download: 'अॅप डाउनलोड करा', light: 'लाइट', dark: 'डार्क',
  },
  common: {
  error: 'त्रुटी', ready: 'तयार', failed: 'अयशस्वी', saving: 'जतन करत आहे...', score: 'गुण', user: 'वापरकर्ता',
  loading: 'लोड होत आहे...', success: 'यश', cancel: 'रद्द करा', save: 'सेव्ह करा', delete: 'हटवा', edit: 'संपादित करा', search: 'शोधा',
  },
  footer: {
  desc: 'AI-चालित विश्लेषण आणि संपादनासह तुमचे लांब व्हिडिओ आकर्षक लहान क्लिप्समध्ये रूपांतरित करा.',
  quickLinks: 'त्वरित दुवे', legal: 'कायदेशीर', privacy: 'गोपनीयता धोरण', terms: 'सेवा अटी', contact: 'संपर्क', rights: 'सर्व हक्क राखीव.',
  },
  home: {
  hero: {
  badge: 'AI-चालित व्हिडिओ प्रक्रिया',
  title: 'लांब व्हिडिओज व्हायरल शॉर्ट्समध्ये रूपांतरित करा',
  subtitle: 'AI-संचालित व्हिडिओ कटिंग जे तुमच्या दीर्घ सामग्रीमधून उत्कृष्ट क्षणे स्वयंचलितपणे काढते',
  cta: 'विनामूल्य कटिंग सुरू करा',
  secondary: 'डेमो पहा',
  },
  features: {
  title: 'शक्तिशाली AI व्हिडिओ कटिंग',
  auto: { title: 'ऑटो हायलाइट डिटेक्शन', desc: 'AI तुमचे व्हिडिओ विश्लेषण करतो आणि सर्वात आकर्षक क्षणे स्वयंचलितपणे ओळखतो' },
  multi: { title: 'मल्टी-प्लॅटफॉर्म सपोर्ट', desc: 'YouTube, Bilibili मधून आयात करा किंवा तुमचे स्वतःचे व्हिडिओ फाईल्स अपलोड करा' },
  quick: { title: 'जलद एक्सपोर्ट', desc: 'तुमचे क्लिप्स अनेक स्वरूपात डाउनलोड करा, कोणत्याही सोशल प्लॅटफॉर्मसाठी तयार' },
  },
  howItWorks: {
  title: 'हे कसे काम करते',
  step1: { title: 'व्हिडिओ इनपुट', desc: 'URL पेस्ट करा किंवा व्हिडिओ अपलोड करा' },
  step2: { title: 'AI विश्लेषण', desc: 'AI आपोआप हायलाइट्स ओळखतो' },
  step3: { title: 'क्लिप्स तयार करा', desc: 'लहान व्हिडिओ तयार होतात' },
  step4: { title: 'डाउनलोड', desc: 'एक्सपोर्ट करा आणि कुठेही शेअर करा' },
  },
  },
  video: {
  input: { title: 'इनपुट व्हिडिओ', url: 'व्हिडिओ URL (YouTube/Bilibili)', upload: 'व्हिडिओ अपलोड करा', placeholder: 'YouTube किंवा Bilibili व्हिडिओ लिंक पेस्ट करा...' },
  process: 'व्हिडिओ प्रक्रिया करा', processing: 'प्रक्रिया होत आहे...', analyze: 'विश्लेषण', results: 'निर्माण केलेले शॉर्ट्स', highlights: 'हायलाइट विश्लेषण', download: 'डाउनलोड', preview: 'पूर्वावलोकन',
  creditsAvailable: 'क्रेडिट्स उपलब्ध', signInToStart: 'व्हिडिओ प्रक्रिया सुरू करण्यासाठी', pasteUrlPlaceholder: 'व्हिडिओ URL पेस्ट करा (MP4, MOV, AVI...)', useLocalAgent: 'स्थानिक Mac Agent वापरा (स्थिर YouTube साठी शिफारस)', uploadLocal: 'स्थानिक व्हिडिओ फाईल अपलोड करा (YouTube लिंक अवरोधित असताना शिफारस)', selectedFile: 'निवडलेले', downloadMacApp: 'Mac अॅप डाउनलोड करा', viewPricing: 'किंमती पहा', clipsReady: 'क्लिप्स तयार', playableClips: 'चालवण्यायोग्य क्लिप्स', failedClips: 'अयशस्वी', aiFinished: 'AI ने तुमच्या स्रोत व्हिडिओमधून सर्वात मजबूत क्षण निवडणे पूर्ण केले आहे.', openToPreview: 'इनलाइन पूर्वावलोकनासाठी कोणताही तयार क्लिप उघडा किंवा MP4 थेट डाउनलोड करा.', clipsBeingGenerated: 'क्लिप्स तयार होत आहेत:', videoPreviewNotAvailable: 'व्हिडिओ पूर्वावलोकन उपलब्ध नाही', clipMayStillProcessing: 'क्लिप अजूनही प्रक्रिया होत असू शकते किंवा तयार करण्यात अयशस्वी झाली असू शकते.', insufficientCredits: 'अपुरे क्रेडिट्स. तुम्हाला किमान 30 क्रेडिट्स हवे आहेत.', enterVideoUrl: 'कृपया व्हिडिओ URL प्रविष्ट करा किंवा स्थानिक व्हिडिओ फाईल अपलोड करा.', enterValidUrl: 'कृपया वैध सार्वजनिक http(s) व्हिडिओ URL प्रविष्ट करा.',
  stage: {
  init: 'सुरू करत आहे...', extractFrames: 'व्हिडिओ फ्रेम्स काढत आहे...', framesExtracted: 'फ्रेम्स यशस्वीरित्या काढल्या', framesUnavailable: 'विश्लेषणासह सुरू', aiAnalysis: 'AI व्हिडिओ सामग्रीचे विश्लेषण करत आहे...', analysisComplete: 'विश्लेषण पूर्ण', generatingClip: 'हायलाइट क्लिप तयार करत आहे...', clipReady: 'हायलाइट क्लिप तयार', saving: 'निकाल जतन करत आहे...', complete: 'प्रक्रिया पूर्ण!', error: 'त्रुटी आली',
  },
  },
  pricing: {
  title: 'सोपी, पारदर्शक किंमती', subtitle: 'तुमच्या गरजेनुसार योजना निवडा',
  paymentNote: 'चीनसाठी Alipay · आंतरराष्ट्रीयसाठी Creem (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'सर्व पेमेंट TLS 256-bit एन्क्रिप्शनने सुरक्षित', faqTitle: 'वारंवार विचारले जाणारे प्रश्न', faq: { q1: 'क्रेडिट म्हणजे काय?', a1: 'प्रत्येक क्रेडिट प्रक्रिया शक्ती दर्शवतो. व्हिडिओ क्लिप प्रक्रिया करण्यासाठी 30 क्रेडिट्स लागतात.', q2: 'दैनिक क्रेडिट रीसेट कसे काम करते?', a2: 'क्रेडिट्स दररोज 00:00 UTC वर तुमच्या योजनेच्या दैनिक मर्यादेपर्यंत रीसेट होतात. न वापरलेले क्रेडिट्स स्थानांतरित होत नाहीत.', q3: 'मी योजना अपग्रेड किंवा डाउनग्रेड करू शकतो का?', a3: 'होय, तुम्ही कोणत्याही वेळी योजना बदलू शकता. बदल तात्काळ प्रभावी होतात.', q4: 'कोणते व्हिडिओ स्रोत समर्थित आहेत?', a4: 'आम्ही YouTube, Bilibili आणि थेट व्हिडिओ फाईल अपलोड (MP4, MOV, AVI) समर्थन करतो.', q5: 'कोणत्या पेमेंट पद्धती समर्थित आहेत?', a5: 'चीन वापरकर्त्यांसाठी Alipay, आंतरराष्ट्रीय वापरकर्त्यांसाठी Creem (Visa, Mastercard, Apple Pay, Google Pay).' },
  mostPopular: 'सर्वात लोकप्रिय',
  free: { title: 'विनामूल्य', price: '$0', period: '/मास', desc: 'वापरण्यासाठी उत्कृष्ट', feature1: 'दररोज 100 क्रेडिट्स', feature2: 'बेसिक व्हिडिओ कटिंग', feature3: '720p एक्सपोर्ट गुणवत्ता', feature4: 'वॉटरमार्क समाविष्ट', cta: 'सुरू करा' },
  starter: { title: 'स्टार्टर', price: '$9.9', period: '/मास', desc: 'कंटेंट क्रिएटर्ससाठी', feature1: 'दररोज 500 क्रेडिट्स', feature2: 'प्राधान्य प्रक्रिया', feature3: '1080p एक्सपोर्ट गुणवत्ता', feature4: 'वॉटरमार्क नाही', feature5: 'इमेल सपोर्ट', cta: 'सदस्यता घ्या आता' },
  pro: { title: 'प्रो', price: '$19.9', period: '/मास', desc: 'प्रोफेशनल्स आणि टीमसाठी', feature1: 'अमर्यादित क्रेडिट्स', feature2: 'सर्वात जलद प्रक्रिया', feature3: '4K एक्सपोर्ट गुणवत्ता', feature4: 'वॉटरमार्क नाही', feature5: 'API ऍक्सेस', feature6: 'प्राधान्य सपोर्ट', cta: 'सदस्यता घ्या आता' },
  },
  downloadPage: {
  title: 'Clipop Agent डाउनलोड करा', subtitle: 'स्थिर YouTube/Bilibili व्हिडिओ प्रक्रियेसाठी डेस्कटॉप अॅप', badge: 'डेस्कटॉप अॅप', macTitle: 'macOS', macDesc: 'Apple Silicon (M1/M2/M3/M4) Mac साठी', downloadButton: 'macOS साठी डाउनलोड करा', version: 'आवृत्ती', fileSize: 'फाईल आकार', requirements: 'macOS 12.0 किंवा नंतरचे', installing: 'स्थापना मार्गदर्शक', step1: '.dmg फाईल जतन करण्यासाठी डाउनलोड बटणावर क्लिक करा', step2: 'डाउनलोड केलेल्या .dmg फाईलवर डबल-क्लिक करा', step3: 'Clipop Agent ला अॅप्लिकेशन्स फोल्डरमध्ये ड्रॅग करा', step4: 'अॅप्लिकेशन्समधून Clipop Agent उघडा', notAvailable: 'डाउनलोड तयार होत आहे, कृपया नंतर पुन्हा तपासा', backToHome: 'मुख्यपृष्ठावर परत', whyDesktopTitle: 'डेस्कटॉप अॅप का वापरावे?', features: { stable: { title: 'स्थिर प्रक्रिया', desc: 'कमाल स्थिरतेसह स्थानिक पातळीवर व्हिडिओ प्रक्रिया करा' }, fast: { title: 'जलद डाउनलोड', desc: 'ब्राउझर मर्यादांशिवाय थेट व्हिडिओ डाउनलोड करा' }, local: { title: 'स्थानिक प्रक्रिया', desc: 'गोपनीयता आणि वेगासाठी तुमच्या Mac वर व्हिडिओ प्रक्रिया करा' } },
  },
  login: {
  title: 'लॉगिन', description: 'तुमच्या खात्यात प्रवेश करा', emailLabel: 'इमेल', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: '••••••••', submitButton: 'लॉगिन', orContinueWith: 'किंवा चालू ठेवा', googleButton: 'Google सह चालू ठेवा', dontHaveAccount: 'खाते नाही?', signUp: 'नोंदणी',
  successTitle: 'लॉगिन यशस्वी!', successMessage: 'तुम्ही यशस्वीरित्या लॉग इन केले आहे म्हणून', successDesktopHint: 'डेस्कटॉप अॅपवर परत जाण्यासाठी खालील बटण क्लिक करा.', returnToDesktop: 'Clipop Agent वर परत जा', desktopNotOpened: 'जर डेस्कटॉप अॅप आपोआप उघडत नसेल, तर कृपया Clipop Agent चालू असल्याची खात्री करा.',
  },
  register: {
  title: 'खाते तयार करा', description: 'Clipop AI सह सुरू करा', nameLabel: 'पूर्ण नाव', namePlaceholder: 'John Doe', emailLabel: 'इमेल', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'पासवर्ड पुष्टी करा', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'चालू ठेवा', sendingCode: 'पाठवत आहे...', codeLabel: 'सत्यापन कोड', codePlaceholder: '6-अंकांचा कोड प्रविष्ट करा', verifyButton: 'खाते तयार करा', codeNotReceived: 'कोड मिळाला नाही?', resendButton: 'पुन्हा पाठवा', resendIn: 'पुन्हा पाठवा', backButton: 'मागे जा', googleButton: 'Google सह चालू ठेवा', alreadyHaveAccount: 'आधीच खाते आहे?', signIn: 'लॉगिन',
  errorNameRequired: 'कृपया तुमचे नाव प्रविष्ट करा', errorEmailRequired: 'कृपया तुमचा इमेल प्रविष्ट करा', errorPasswordLength: 'पासवर्ड किमान 6 अक्षरांचा असावा', errorPasswordMismatch: 'पासवर्ड जुळत नाहीत', errorEmailExists: 'हा इमेल आधीच नोंदणीकृत आहे. कृपया लॉग इन करा.', errorSendCode: 'कोड पाठवणे अयशस्वी', errorNetwork: 'नेटवर्क त्रुटी. कृपया पुन्हा प्रयत्न करा.', errorCodeLength: 'कृपया 6-अंकांचा कोड प्रविष्ट करा',
  successTitle: 'खाते तयार झाले!', successMessage: 'तुमचे खाते यशस्वीरित्या तयार झाले आहे म्हणून', successDesktopHint: 'डेस्कटॉप अॅपवर परत जाण्यासाठी खालील बटण क्लिक करा.', returnToDesktop: 'Clipop Agent वर परत जा', desktopNotOpened: 'जर डेस्कटॉप अॅप आपोआप उघडत नसेल, तर कृपया Clipop Agent चालू असल्याची खात्री करा.',
  },
  dashboard: { title: 'डॅशबोर्ड', credits: 'उपलब्ध क्रेडिट्स', creditsReset: 'दररोज 00:00 UTC वर रीसेट', history: 'प्रक्रिया इतिहास', noVideos: 'अद्याप कोणतेही व्हिडिओ प्रक्रिया केलेले नाही', startProcessing: 'व्हिडिओ प्रक्रिया सुरू करा',
  untitled: 'शीर्षकहीन', clip: 'क्लिप', clipsCount: 'हायलाइट्स', clipsHint: 'चालवण्यासाठी कोणताही क्लिप क्लिक करा',
  desktopLoginDetected: 'डेस्कटॉप अॅप लॉगिन आढळले', desktopLoginHint: 'Clipop Agent वर परत जाण्यासाठी खालील बटण क्लिक करा', returnToDesktop: 'Clipop Agent वर परत जा',
  welcomeBack: 'पुन्हा स्वागत',
  videosProcessed: 'प्रक्रिया केलेले व्हिडिओ', videosProcessedDesc: 'एकूण प्रक्रिया केलेले व्हिडिओ', clipsGenerated: 'तयार केलेले क्लिप्स', clipsGeneratedDesc: 'एकूण हायलाइट क्लिप्स',
  currentPlan: 'सध्याची योजना', upgradePlan: 'योजना अपग्रेड करा',
  processNewVideo: 'नवीन व्हिडिओ प्रक्रिया करा', feedback: 'अभिप्राय',
  historyHint: 'हायलाइट क्लिप्स पाहण्यासाठी पूर्ण झालेले रेकॉर्ड विस्तृत करा',
  processNewVideoDesc: 'नवीन लांब व्हिडिओ प्रक्रिया करण्यासाठी मुख्यपृष्ठावर जा', goToProcessor: 'व्हिडिओ प्रोसेसरवर जा',
  userFeedback: 'वापरकर्ता अभिप्राय', feedbackDesc: 'तुम्ही सुधारू इच्छित असलेल्या वैशिष्ट्यांबद्दल किंवा आलेल्या समस्यांबद्दल सांगा',
  feedbackPlaceholder: 'तुमचा अभिप्राय प्रविष्ट करा (सूचना, बग, वैशिष्ट्य विनंत्या इ.)', feedbackSubmitted: 'सबमिट केले, तुमच्या अभिप्रायाबद्दल धन्यवाद!',
  submitFeedback: 'अभिप्राय सबमिट करा', feedbackFailed: 'अभिप्राय सबमिट करणे अयशस्वी',
  statusPending: 'प्रलंबित', statusProcessing: 'प्रक्रिया होत आहे', statusCompleted: '✓ पूर्ण', statusFailed: 'अयशस्वी',
  },
  admin: { title: 'अॅडमिन पॅनेल', blog: 'ब्लॉग मॅनेजमेंट', blogCreate: 'पोस्ट तयार करा', blogTitle: 'शीर्षक', blogCategory: 'श्रेणी', blogContent: 'सामग्री', blogPublish: 'प्रकाशित करा', blogSave: 'मसुदा सेव्ह करा', blogPublished: 'प्रकाशित', blogDraft: 'मसुदा' },
  blog: { title: 'ब्लॉग', readMore: 'अधिक वाचा', noPosts: 'अद्याप कोणतीही पोस्ट नाही', subtitle: 'Clipop AI कडून नवीन बातम्या, टिप्स आणि अपडेट्स', views: 'दृश्ये' },
  common: { loading: 'लोड होत आहे...', error: 'त्रुटी आली', success: 'यश', cancel: 'रद्द करा', save: 'सेव्ह करा', delete: 'हटवा', edit: 'संपादित करा', search: 'शोधा' },
};

export default translations;
