import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'హోమ్', blog: 'బ్లాగ్', pricing: 'ధరలు', login: 'లాగిన్', register: 'రిజిస్టర్', dashboard: 'డాష్బోర్డ్', admin: 'అడ్మిన్ ప్యానెల్', logout: 'లాగ్ఔట్', credits: 'క్రెడిట్స్', download: 'యాప్ డౌన్‌లోడ్', light: 'లైట్', dark: 'డార్క్',
  },
  common: {
  error: 'లోపం', ready: 'సిద్ధం', failed: 'విఫలమైంది', saving: 'సేవ్ అవుతోంది...', score: 'స్కోర్', user: 'వినియోగదారు',
  loading: 'లోడ్ అవుతోంది...', success: 'విజయం', cancel: 'రద్దు చేయండి', save: 'సేవ్ చేయండి', delete: 'తొలగించు', edit: 'సవరించు', search: 'శోధించు',
  },
  footer: {
  desc: 'AI-ఆధారిత విశ్లేషణ మరియు సవరణతో మీ పొడవైన వీడియోలను ఆకర్షణీయమైన చిన్న క్లిప్‌లుగా మార్చండి.',
  quickLinks: 'త్వరిత లింక్‌లు', legal: 'చట్టపరమైన', privacy: 'గోప్యతా విధానం', terms: 'సేవా నిబంధనలు', contact: 'సంప్రదించండి', rights: 'అన్ని హక్కులు రిజర్వ్ చేయబడ్డాయి.',
  },
  home: {
  hero: {
  badge: 'AI-ఆధారిత వీడియో ప్రాసెసింగ్',
  title: 'పొడవైన వీడియోలను వైరల్ షార్ట్‌లుగా మార్చండి',
  subtitle: 'AI సహాయంతో వీడియో కటింగ్ మీ పొడవైన కంటెంట్‌నుండి ఉత్తమ క్షణాలను స్వయంచాలకంగా తీసుకుంటుంది',
  cta: 'ఉచితంగా కటింగ్ ప్రారంభించండి',
  secondary: 'డేమోను చూడండి',
  },
  features: {
  title: 'శక్తివంతమైన AI వీడియో కటింగ్',
  auto: { title: 'ఆటో హైలైట్ డిటెక్షన్', desc: 'AI మీ వీడియోను విశ్లేషిస్తుంది మరియు అత్యంత ఆకర్షణీయమైన క్షణాలను స్వయంచాలకంగా గుర్తిస్తుంది' },
  multi: { title: 'మల్టీ-ప్లాట్‌ఫార్మ్ సపోర్ట్', desc: 'YouTube, Bilibili నుండి దిగుమతించండి లేదా మీ సొంత వీడియో ఫైళ్లను అప్‌లోడ్ చేయండి' },
  quick: { title: 'త్వరణ ఎక్స్‌పోర్ట్', desc: 'మీ క్లిప్‌లను అనేక ఫార్మాట్‌లలో డౌన్‌లోడ్ చేయండి, ఏదైనా సోషల్ ప్లాట్‌ఫార్మ్‌కు సిద్ధంగా ఉంటుంది' },
  },
  howItWorks: {
  title: 'ఎలా పని చేస్తుంది',
  step1: { title: 'వీడియో ఇన్‌పుట్', desc: 'URL పేస్ట్ చేయండి లేదా వీడియో అప్‌లోడ్ చేయండి' },
  step2: { title: 'AI విశ్లేషణ', desc: 'AI స్వయంచాలకంగా హైలైట్‌లను గుర్తిస్తుంది' },
  step3: { title: 'క్లిప్‌లను సృష్టించండి', desc: 'చిన్న వీడియోలు సృష్టించబడతాయి' },
  step4: { title: 'డౌన్‌లోడ్', desc: 'ఎగుమతి చేసి ఎక్కడైనా షేర్ చేయండి' },
  },
  },
  video: {
  input: { title: 'ఇన్‌పుట్ వీడియో', url: 'వీడియో URL (YouTube/Bilibili)', upload: 'వీడియో అప్‌లోడ్ చేయండి', placeholder: 'YouTube లేదా Bilibili వీడియో లింక్‌ను పేస్ట్ చేయండి...' },
  process: 'వీడియోను ప్రాసెస్ చేయండి', processing: 'ప్రాసెస్ అవుతోంది...', analyze: 'విశ్లేషణ', results: 'తయారైన షార్ట్‌లు', highlights: 'హైలైట్ విశ్లేషణ', download: 'డౌన్‌లోడ్', preview: 'ప్రివ్యూ',
  creditsAvailable: 'క్రెడిట్స్ అందుబాటులో ఉన్నాయి', signInToStart: 'వీడియో ప్రాసెసింగ్ ప్రారంభించడానికి', pasteUrlPlaceholder: 'వీడియో URL పేస్ట్ చేయండి (MP4, MOV, AVI...)', useLocalAgent: 'లోకల్ Mac Agent ఉపయోగించండి (స్థిరమైన YouTube కోసం సిఫార్సు)', uploadLocal: 'లోకల్ వీడియో ఫైల్ అప్‌లోడ్ చేయండి (YouTube లింక్ బ్లాక్ అయినప్పుడు సిఫార్సు)', selectedFile: 'ఎంచుకున్నది', downloadMacApp: 'Mac యాప్ డౌన్‌లోడ్', viewPricing: 'ధరలు చూడండి', clipsReady: 'క్లిప్‌లు సిద్ధం', playableClips: 'ప్లే చేయగల క్లిప్‌లు', failedClips: 'విఫలమైంది', aiFinished: 'AI మీ సోర్స్ వీడియో నుండి బలమైన క్షణాలను ఎంచుకోవడం పూర్తి చేసింది.', openToPreview: 'ఇన్‌లైన్ ప్రివ్యూ కోసం ఏదైనా సిద్ధ క్లిప్‌ను తెరవండి లేదా MP4 నేరుగా డౌన్‌లోడ్ చేయండి.', clipsBeingGenerated: 'క్లిప్‌లు సృష్టించబడుతున్నాయి:', videoPreviewNotAvailable: 'వీడియో ప్రివ్యూ అందుబాటులో లేదు', clipMayStillProcessing: 'క్లిప్ ఇంకా ప్రాసెస్ అవుతోంది లేదా సృష్టించడం విఫలమై ఉండవచ్చు.', insufficientCredits: 'తగినంత క్రెడిట్స్ లేవు. కనీసం 30 క్రెడిట్స్ అవసరం.', enterVideoUrl: 'దయచేసి వీడియో URL నమోదు చేయండి లేదా లోకల్ వీడియో ఫైల్ అప్‌లోడ్ చేయండి.', enterValidUrl: 'దయచేసి చెల్లుబాటు అయ్యే పబ్లిక్ http(s) వీడియో URL నమోదు చేయండి.',
  stage: {
  init: 'ప్రారంభిస్తోంది...', extractFrames: 'వీడియో ఫ్రేమ్‌లను తీసుకుంటోంది...', framesExtracted: 'ఫ్రేమ్‌లు విజయవంతంగా తీసుకోబడ్డాయి', framesUnavailable: 'విశ్లేషణతో కొనసాగుతోంది', aiAnalysis: 'AI వీడియో కంటెంట్‌ను విశ్లేషిస్తోంది...', analysisComplete: 'విశ్లేషణ పూర్తయింది', generatingClip: 'హైలైట్ క్లిప్ సృష్టిస్తోంది...', clipReady: 'హైలైట్ క్లిప్ సిద్ధం', saving: 'ఫలితాలు సేవ్ అవుతున్నాయి...', complete: 'ప్రాసెసింగ్ పూర్తయింది!', error: 'లోపం సంభవించింది',
  },
  },
  pricing: {
  title: 'సులభ, పారదర్శక ధరలు', subtitle: 'మీ అవసరాలకు సరైన ప్లాన్‌ను ఎంచుకోండి',
  paymentNote: 'చైనా కోసం Alipay · అంతర్జాతీయ కోసం Creem (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'అన్ని చెల్లింపులు TLS 256-bit ఎన్‌క్రిప్షన్‌తో సురక్షితం', faqTitle: 'తరచుగా అడిగే ప్రశ్నలు', faq: { q1: 'క్రెడిట్ అంటే ఏమిటి?', a1: 'ప్రతి క్రెడిట్ ప్రాసెసింగ్ శక్తిని సూచిస్తుంది. వీడియో క్లిప్ ప్రాసెస్ చేయడానికి 30 క్రెడిట్స్ ఖర్చవుతాయి.', q2: 'రోజువారీ క్రెడిట్ రీసెట్ ఎలా పని చేస్తుంది?', a2: 'క్రెడిట్స్ ప్రతిరోజూ 00:00 UTC వద్ద మీ ప్లాన్ రోజువారీ పరిమితికి రీసెట్ అవుతాయి. ఉపయోగించని క్రెడిట్స్ బదిలీ కావు.', q3: 'నేను ప్లాన్‌ను అప్‌గ్రేడ్ లేదా డౌన్‌గ్రేడ్ చేయగలనా?', a3: 'అవును, మీరు ఎప్పుడైనా ప్లాన్ మార్చవచ్చు. మార్పులు వెంటనే అమలులోకి వస్తాయి.', q4: 'ఏ వీడియో మూలాలు మద్దతు ఇస్తాయి?', a4: 'YouTube, Bilibili మరియు నేరుగా వీడియో ఫైల్ అప్‌లోడ్‌లు (MP4, MOV, AVI) మద్దతు ఇస్తాయి.', q5: 'ఏ చెల్లింపు పద్ధతులు మద్దతు ఇస్తాయి?', a5: 'చైనా వినియోగదారుల కోసం Alipay, అంతర్జాతీయ వినియోగదారుల కోసం Creem (Visa, Mastercard, Apple Pay, Google Pay).' },
  mostPopular: 'అత్యంత ప్రజాదరణ',
  free: { title: 'ఉచితం', price: '$0', period: '/నెల', desc: 'ప్రయత్నించడానికి పరిపూర్ణం', feature1: 'రోజుకు 100 క్రెడిట్స్', feature2: 'ప్రాథమిక వీడియో కటింగ్', feature3: '720p ఎక్స్‌పోర్ట్ నాణ్యత', feature4: 'వాటర్‌మార్క్ కలవు', cta: 'ప్రారంభించండి' },
  starter: { title: 'స్టార్టర్', price: '$9.9', period: '/నెల', desc: 'కంటెంట్ క్రియేటర్ల కోసం', feature1: 'రోజుకు 500 క్రెడిట్స్', feature2: 'ప్రాధాన్యత ప్రాసెసింగ్', feature3: '1080p ఎక్స్‌పోర్ట్ నాణ్యత', feature4: 'వాటర్‌మార్క్ లేదు', feature5: 'ఇమెయిల్ సపోర్ట్', cta: 'ఇప్పుడే సబ్‌స్క్రైబ్ చేయండి' },
  pro: { title: 'ప్రో', price: '$19.9', period: '/నెల', desc: 'ప్రొఫెషనల్స్ & టీమల కోసం', feature1: 'అపరిమిత క్రెడిట్స్', feature2: 'వేగవంతమైన ప్రాసెసింగ్', feature3: '4K ఎక్స్‌పోర్ట్ నాణ్యత', feature4: 'వాటర్‌మార్క్ లేదు', feature5: 'API యాక్సెస్', feature6: 'ప్రాధాన్యత సపోర్ట్', cta: 'ఇప్పుడే సబ్‌స్క్రైబ్ చేయండి' },
  },
  downloadPage: {
  title: 'Clipop Agent డౌన్‌లోడ్ చేయండి', subtitle: 'స్థిరమైన YouTube/Bilibili వీడియో ప్రాసెసింగ్ కోసం డెస్క్‌టాప్ యాప్', badge: 'డెస్క్‌టాప్ యాప్', macTitle: 'macOS', macDesc: 'Apple Silicon (M1/M2/M3/M4) Mac ల కోసం', downloadButton: 'macOS కోసం డౌన్‌లోడ్', version: 'వెర్షన్', fileSize: 'ఫైల్ పరిమాణం', requirements: 'macOS 12.0 లేదా తర్వాత', installing: 'ఇన్‌స్టాలేషన్ గైడ్', step1: '.dmg ఫైల్‌ను సేవ్ చేయడానికి డౌన్‌లోడ్ బటన్ క్లిక్ చేయండి', step2: 'డౌన్‌లోడ్ చేసిన .dmg ఫైల్‌పై డబుల్-క్లిక్ చేయండి', step3: 'Clipop Agent ను Applications ఫోల్డర్‌కు డ్రాగ్ చేయండి', step4: 'Applications నుండి Clipop Agent తెరవండి', notAvailable: 'డౌన్‌లోడ్ సిద్ధమవుతోంది, దయచేసి తర్వాత తనిఖీ చేయండి', backToHome: 'హోమ్‌కు తిరిగి', whyDesktopTitle: 'డెస్క్‌టాప్ యాప్ ఎందుకు ఉపయోగించాలి?', features: { stable: { title: 'స్థిరమైన ప్రాసెసింగ్', desc: 'గరిష్ట స్థిరత్వంతో స్థానికంగా వీడియోలను ప్రాసెస్ చేయండి' }, fast: { title: 'వేగవంతమైన డౌన్‌లోడ్', desc: 'బ్రౌజర్ పరిమితులు లేకుండా నేరుగా వీడియోలను డౌన్‌లోడ్ చేయండి' }, local: { title: 'స్థానిక ప్రాసెసింగ్', desc: 'గోప్యత మరియు వేగం కోసం మీ Mac లో వీడియోలను ప్రాసెస్ చేయండి' } },
  },
  login: {
  title: 'లాగిన్', description: 'మీ ఖాతాను యాక్సెస్ చేయండి', emailLabel: 'ఇమెయిల్', emailPlaceholder: 'you@example.com', passwordLabel: 'పాస్‌వర్డ్', passwordPlaceholder: '••••••••', submitButton: 'లాగిన్', orContinueWith: 'లేదా కొనసాగించు', googleButton: 'Google తో కొనసాగించు', dontHaveAccount: 'ఖాతం లేదా?', signUp: 'రిజిస్టర్',
  successTitle: 'లాగిన్ విజయవంతం!', successMessage: 'మీరు విజయవంతంగా లాగిన్ అయ్యారు అని', successDesktopHint: 'డెస్క్‌టాప్ యాప్‌కు తిరిగి వెళ్ళడానికి కింద ఉన్న బటన్ క్లిక్ చేయండి.', returnToDesktop: 'Clipop Agent కి తిరిగి', desktopNotOpened: 'డెస్క్‌టాప్ యాప్ ఆటోమేటిక్‌గా తెరవకపోతే, Clipop Agent నడుస్తోందని నిర్ధారించుకోండి.',
  },
  register: {
  title: 'ఖాతాను సృష్టించండి', description: 'Clipop AI తో ప్రారంభించండి', nameLabel: 'పూర్తి పేరు', namePlaceholder: 'John Doe', emailLabel: 'ఇమెయిల్', emailPlaceholder: 'you@example.com', passwordLabel: 'పాస్‌వర్డ్', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'పాస్‌వర్డ్ నిర్ధారించండి', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'కొనసాగించు', sendingCode: 'పంపుతోంది...', codeLabel: 'వెరిఫికేషన్ కోడ్', codePlaceholder: '6-అంకెల కోడ్‌ను నమోదు చేయండి', verifyButton: 'ఖాతాను సృష్టించండి', codeNotReceived: 'కోడ్ అందలేదా?', resendButton: 'మళ్ళీ పంపండి', resendIn: 'మళ్ళీ పంపండి', backButton: 'తిరిగి', googleButton: 'Google తో కొనసాగించు', alreadyHaveAccount: 'ఇప్పటికే ఖాతం ఉందా?', signIn: 'లాగిన్',
  errorNameRequired: 'దయచేసి మీ పేరు నమోదు చేయండి', errorEmailRequired: 'దయచేసి మీ ఇమెయిల్ నమోదు చేయండి', errorPasswordLength: 'పాస్‌వర్డ్ కనీసం 6 అక్షరాలు ఉండాలి', errorPasswordMismatch: 'పాస్‌వర్డ్‌లు సరిపోలడం లేదు', errorEmailExists: 'ఈ ఇమెయిల్ ఇప్పటికే నమోదు చేయబడింది. దయచేసి లాగిన్ చేయండి.', errorSendCode: 'కోడ్ పంపడం విఫలమైంది', errorNetwork: 'నెట్‌వర్క్ లోపం. దయచేసి మళ్ళీ ప్రయత్నించండి.', errorCodeLength: 'దయచేసి 6-అంకెల కోడ్ నమోదు చేయండి',
  successTitle: 'ఖాతా సృష్టించబడింది!', successMessage: 'మీ ఖాతా విజయవంతంగా సృష్టించబడింది అని', successDesktopHint: 'డెస్క్‌టాప్ యాప్‌కు తిరిగి వెళ్ళడానికి కింద ఉన్న బటన్ క్లిక్ చేయండి.', returnToDesktop: 'Clipop Agent కి తిరిగి', desktopNotOpened: 'డెస్క్‌టాప్ యాప్ ఆటోమేటిక్‌గా తెరవకపోతే, Clipop Agent నడుస్తోందని నిర్ధారించుకోండి.',
  },
  dashboard: { title: 'డాష్బోర్డ్', credits: 'అందుబాటులో ఉన్న క్రెడిట్స్', creditsReset: 'ప్రతిరోజు 00:00 UTC వద్ద రీసెట్', history: 'ప్రాసెసింగ్ చరిత్ర', noVideos: 'ఇంకా ఏ వీడియోలు ప్రాసెస్ చేయబడలేదు', startProcessing: 'వీడియో ప్రాసెసింగ్ ప్రారంభించండి',
  untitled: 'శీర్షిక లేదు', clip: 'క్లిప్', clipsCount: 'హైలైట్‌లు', clipsHint: 'ప్లే చేయడానికి ఏదైనా క్లిప్ క్లిక్ చేయండి',
  desktopLoginDetected: 'డెస్క్‌టాప్ యాప్ లాగిన్ గుర్తించబడింది', desktopLoginHint: 'Clipop Agent కి తిరిగి వెళ్ళడానికి కింద ఉన్న బటన్ క్లిక్ చేయండి', returnToDesktop: 'Clipop Agent కి తిరిగి',
  welcomeBack: 'తిరిగి స్వాగతం',
  videosProcessed: 'ప్రాసెస్ చేసిన వీడియోలు', videosProcessedDesc: 'మొత్తం ప్రాసెస్ చేసిన వీడియోలు', clipsGenerated: 'సృష్టించబడిన క్లిప్‌లు', clipsGeneratedDesc: 'మొత్తం హైలైట్ క్లిప్‌లు',
  currentPlan: 'ప్రస్తుత ప్లాన్', upgradePlan: 'ప్లాన్ అప్‌గ్రేడ్ చేయండి',
  processNewVideo: 'కొత్త వీడియో ప్రాసెస్ చేయండి', feedback: 'ఫీడ్‌బ్యాక్',
  historyHint: 'హైలైట్ క్లిప్‌లను చూడటానికి పూర్తయిన రికార్డులను విస్తరించండి',
  processNewVideoDesc: 'కొత్త పొడవైన వీడియోను ప్రాసెస్ చేయడానికి హోమ్ పేజీకి వెళ్ళండి', goToProcessor: 'వీడియో ప్రాసెసర్‌కు వెళ్ళండి',
  userFeedback: 'వినియోగదారు ఫీడ్‌బ్యాక్', feedbackDesc: 'మెరుగుపరచాలనుకునే ఫీచర్లు లేదా ఎదుర్కొన్న సమస్యల గురించి మాకు చెప్పండి',
  feedbackPlaceholder: 'మీ ఫీడ్‌బ్యాక్ నమోదు చేయండి (సూచనలు, బగ్‌లు, ఫీచర్ అభ్యర్థనలు మొదలైనవి)', feedbackSubmitted: 'సమర్పించబడింది, మీ ఫీడ్‌బ్యాక్‌కు ధన్యవాదాలు!',
  submitFeedback: 'ఫీడ్‌బ్యాక్ సమర్పించండి', feedbackFailed: 'ఫీడ్‌బ్యాక్ సమర్పించడం విఫలమైంది',
  statusPending: 'పెండింగ్', statusProcessing: 'ప్రాసెస్ అవుతోంది', statusCompleted: '✓ పూర్తయింది', statusFailed: 'విఫలమైంది',
  },
  admin: { title: 'అడ్మిన్ ప్యానెల్', blog: 'బ్లాగ్ మేనేజ్‌మెంట్', blogCreate: 'పోస్ట్ సృష్టించండి', blogTitle: 'శీర్షిక', blogCategory: 'వర్గం', blogContent: 'కంటెంట్', blogPublish: 'ప్రచురించు', blogSave: 'డ్రాఫ్ట్ సేవ్ చేయండి', blogPublished: 'ప్రచురించబడింది', blogDraft: 'డ్రాఫ్ట్' },
  blog: { title: 'బ్లాగ్', readMore: 'మరింత చదవండి', noPosts: 'ఇంకా పోస్ట్‌లు లేవు', subtitle: 'Clipop AI నుండి తాజా వార్తలు, చిట్కాలు మరియు అప్‌డేట్‌లు', views: 'వీక్షణలు' },
  common: { loading: 'లోడ్ అవుతోంది...', error: 'లోపం సంభవించింది', success: 'విజయం', cancel: 'రద్దు చేయండి', save: 'సేవ్ చేయండి', delete: 'తొలగించు', edit: 'సవరించు', search: 'శోధించు' },
};

export default translations;
