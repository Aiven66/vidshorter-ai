import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Hem', blog: 'Blogg', pricing: 'Prissättning', login: 'Logga in', register: 'Registrera', dashboard: 'Instrumentpanel', admin: 'Admin Panel', logout: 'Logga ut', credits: 'Krediter', download: 'Ladda Ner App', light: 'Ljus', dark: 'Mörk',
  },
  footer: {
  desc: 'Förvandla dina långa videor till fängande korta klipp med AI-driven analys och redigering.', quickLinks: 'Snabblänkar', legal: 'Juridiskt', privacy: 'Integritetspolicy', terms: 'Tjänstevillkor', contact: 'Kontakt', rights: 'Alla rättigheter förbehållna.',
  },
  home: {
  hero: {
  badge: 'AI-driven Videobearbetning',
  title: 'Gör Långa Videor Till Virala Shorts',
  subtitle: 'AI-drivenvideoklippning som automatiskt extraherar de bästa ögonblicken från ditt långa innehåll',
  cta: 'Börja Klippa Gratis',
  secondary: 'Se Demo',
  },
  howItWorks: {
  title: 'Så Här Fungerar Det', step1: { title: 'Mata In Video', desc: 'Klistra in URL eller ladda upp din video' }, step2: { title: 'AI-analys', desc: 'AI upptäcker automatiskt höjdpunkter' }, step3: { title: 'Skapa Klipp', desc: 'Korta videor skapas' }, step4: { title: 'Ladda Ner', desc: 'Exportera och dela var som helst' },
  },
  features: {
  title: 'Kraftfull AI Videoklippning',
  auto: { title: 'Automatisk Highlight Detektering', desc: 'AI analyserar din video och identifierar de mest engagerande ögonblicken automatiskt' },
  multi: { title: 'Stöd För Flera Plattformar', desc: 'Importera från YouTube, Bilibili eller ladda upp dina egna videofiler' },
  quick: { title: 'Snabb Export', desc: 'Ladda ner dina klipp i flera format, klara för alla sociala plattformar' },
  },
  },
  video: {
  input: { title: 'Ingångsvideo', url: 'Video URL (YouTube/Bilibili)', upload: 'Ladda Upp Video', placeholder: 'Klistra in YouTube eller Bilibili videolänk...' },
  process: 'Bearbeta Video', processing: 'Bearbetar...', analyze: 'Analysera', results: 'Genererade Shorts', highlights: 'Highlight Analys', download: 'Ladda Ner', preview: 'Förhandsvisa',
  creditsAvailable: 'krediter tillgängliga', signInToStart: 'för att börja bearbeta videor', pasteUrlPlaceholder: 'Klistra in en video-URL (MP4, MOV, AVI...)', useLocalAgent: 'Använd lokal Mac Agent (rekommenderas för stabil YouTube)', uploadLocal: 'Ladda upp en lokal videofil (rekommenderas när YouTube-länk är blockerad)', selectedFile: 'Vald', downloadMacApp: 'Ladda Ner Mac App', viewPricing: 'Se Priser', clipsReady: 'klipp redo', playableClips: 'spelbara klipp', failedClips: 'misslyckades', aiFinished: 'AI har slutfört urvalet av de starkaste ögonblicken från din källvideo.', openToPreview: 'Öppna ett redo klipp för förhandsgranskning, eller ladda ner MP4 direkt.', clipsBeingGenerated: 'Klipp genereras:', videoPreviewNotAvailable: 'Videoförhandsgranskning inte tillgänglig', clipMayStillProcessing: 'Klippet bearbetas fortfarande eller genereringen misslyckades.', insufficientCredits: 'Otillräckliga krediter. Du behöver minst 30 krediter.', enterVideoUrl: 'Vänligen ange en video-URL eller ladda upp en lokal videofil.', enterValidUrl: 'Vänligen ange en giltig offentlig http(s) video-URL.',
  stage: {
  init: 'Initierar...', extractFrames: 'Extraherar videobildrutor...', framesExtracted: 'Bildrutor extraherade framgångsrikt', framesUnavailable: 'Fortsätter med analys', aiAnalysis: 'AI analyserar videoinnehåll...', analysisComplete: 'Analys slutförd', generatingClip: 'Skapar höjdpunktsklipp...', clipReady: 'Höjdpunktsklipp redo', saving: 'Sparar resultat...', complete: 'Bearbetning slutförd!', error: 'Fel uppstod',
  },
  },
  pricing: {
  title: 'Enkel, Transparent Prissättning', subtitle: 'Välj den plan som passar dina behov',
  paymentNote: 'Alipay för Kina · Creem för Internationellt (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Alla betalningar säkrade med TLS 256-bit kryptering', faqTitle: 'Vanliga Frågor', faq: { q1: 'Vad är en kredit?', a1: 'Varje kredit representerar bearbetningskraft. Att bearbeta ett videoklipp kostar 30 krediter.', q2: 'Hur fungerar daglig kredit-återställning?', a2: 'Krediter återställs till din plans dagliga gräns kl. 00:00 UTC varje dag. Oanvända krediter överförs inte.', q3: 'Kan jag uppgradera eller nedgradera min plan?', a3: 'Ja, du kan ändra din plan när som helst. Ändringar träder i kraft omedelbart.', q4: 'Vilka videokällor stöds?', a4: 'Vi stöder YouTube, Bilibili och direkta videofiluppladdningar (MP4, MOV, AVI).', q5: 'Vilka betalningsmetoder stöds?', a5: 'Alipay för Kina-användare, Creem (Visa, Mastercard, Apple Pay, Google Pay) för internationella användare.' },
  mostPopular: 'Mest Populära',
  free: { title: 'Gratis', price: '$0', period: '/månad', desc: 'Perfekt för att prova', feature1: '100 krediter dagligen', feature2: 'Grundläggande videoklippning', feature3: '720p exportkvalitet', feature4: 'Vattenmärke inkluderat', cta: 'Börja' },
  starter: { title: 'Starter', price: '$9.9', period: '/månad', desc: 'För innehållsskapare', feature1: '500 krediter dagligen', feature2: 'Prioriterad bearbetning', feature3: '1080p exportkvalitet', feature4: 'Inget vattenmärke', feature5: 'E-poststöd', cta: 'Prenumerera Nu' },
  pro: { title: 'Pro', price: '$19.9', period: '/månad', desc: 'För proffs och team', feature1: 'Obegränsade krediter', feature2: 'Snabbast bearbetning', feature3: '4K exportkvalitet', feature4: 'Inget vattenmärke', feature5: 'API-åtkomst', feature6: 'Prioriterat stöd', cta: 'Prenumerera Nu' },
  },
  downloadPage: {
  title: 'Ladda Ner Clipop Agent', subtitle: 'Skrivbordsapp för stabil YouTube/Bilibili videobearbetning', badge: 'Skrivbordsapp', macTitle: 'macOS', macDesc: 'För Apple Silicon (M1/M2/M3/M4) Mac-datorer', downloadButton: 'Ladda Ner för macOS', version: 'Version', fileSize: 'Filstorlek', requirements: 'macOS 12.0 eller senare', installing: 'Installationsguide', step1: 'Klicka på nedladdningsknappen för att spara .dmg-filen', step2: 'Dubbelklicka på den nedladdade .dmg-filen', step3: 'Dra Clipop Agent till Program-mappen', step4: 'Öppna Clipop Agent från Program', notAvailable: 'Nedladdning förbereds, vänligen kontrollera senare', backToHome: 'Tillbaka till Hem', whyDesktopTitle: 'Varför Använda Skrivbordsappen?', features: { stable: { title: 'Stabil Bearbetning', desc: 'Bearbeta videor lokalt med maximal stabilitet' }, fast: { title: 'Snabb Nedladdning', desc: 'Ladda ner videor direkt utan webbläsarbegränsningar' }, local: { title: 'Lokal Bearbetning', desc: 'Bearbeta videor på din Mac för integritet och hastighet' } },
  },
  login: {
  title: 'Logga in', description: 'Tillgång till ditt konto', emailLabel: 'E-post', emailPlaceholder: 'you@example.com', passwordLabel: 'Lösenord', passwordPlaceholder: '••••••••', submitButton: 'Logga in', orContinueWith: 'Eller fortsätt med', googleButton: 'Fortsätt med Google', dontHaveAccount: 'Har du inget konto?', signUp: 'Registrera',
  successTitle: 'Inloggning Lyckades!', successMessage: 'Du har loggat in som', successDesktopHint: 'Klicka på knappen nedan för att återvända till skrivbordsappen.', returnToDesktop: 'Återvänd till Clipop Agent', desktopNotOpened: 'Om skrivbordsappen inte öppnas automatiskt, vänligen säkerställ att Clipop Agent körs.',
  },
  register: {
  title: 'Skapa Konto', description: 'Börja med Clipop AI', nameLabel: 'Fullständigt Namn', namePlaceholder: 'John Doe', emailLabel: 'E-post', emailPlaceholder: 'you@example.com', passwordLabel: 'Lösenord', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Bekräfta Lösenord', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Fortsätt', sendingCode: 'Skickar...', codeLabel: 'Verifieringskod', codePlaceholder: 'Ange 6-siffrig kod', verifyButton: 'Skapa Konto', codeNotReceived: 'Fick du inte koden?', resendButton: 'Skicka Igen', resendIn: 'Skicka igen om', backButton: 'Tillbaka', googleButton: 'Fortsätt med Google', alreadyHaveAccount: 'Har du redan ett konto?', signIn: 'Logga in',
  errorNameRequired: 'Vänligen ange ditt namn', errorEmailRequired: 'Vänligen ange din e-post', errorPasswordLength: 'Lösenordet måste vara minst 6 tecken', errorPasswordMismatch: 'Lösenorden matchar inte', errorEmailExists: 'Denna e-post är redan registrerad. Vänligen logga in istället.', errorSendCode: 'Kunde inte skicka kod', errorNetwork: 'Nätverksfel. Vänligen försök igen.', errorCodeLength: 'Vänligen ange 6-siffrig kod',
  successTitle: 'Konto Skapat!', successMessage: 'Ditt konto har skapats som', successDesktopHint: 'Klicka på knappen nedan för att återvända till skrivbordsappen.', returnToDesktop: 'Återvänd till Clipop Agent', desktopNotOpened: 'Om skrivbordsappen inte öppnas automatiskt, vänligen säkerställ att Clipop Agent körs.',
  },
  dashboard: { title: 'Instrumentpanel', credits: 'Tillgängliga Krediter', creditsReset: 'Återställs dagligen klockan 00:00 UTC', history: 'Bearbetningshistorik', noVideos: 'Inga videor bearbetade ännu', startProcessing: 'Starta Bearbetning Av Videor',
  untitled: 'Namnlös', clip: 'Klipp', clipsCount: 'höjdpunkter', clipsHint: 'Klicka på ett klipp för att spela upp',
  desktopLoginDetected: 'Skrivbordsapp-inloggning Upptäckt', desktopLoginHint: 'Klicka på knappen nedan för att återvända till Clipop Agent', returnToDesktop: 'Återvänd till Clipop Agent',
  welcomeBack: 'Välkommen tillbaka',
  videosProcessed: 'Bearbetade Videor', videosProcessedDesc: 'Totalt bearbetade videor', clipsGenerated: 'Genererade Klipp', clipsGeneratedDesc: 'Totalt höjdpunktsklipp',
  currentPlan: 'Nuvarande Plan', upgradePlan: 'Uppgradera Plan',
  processNewVideo: 'Bearbeta Ny Video', feedback: 'Feedback',
  historyHint: 'Klicka på slutförda poster för att expandera och visa höjdpunktsklipp',
  processNewVideoDesc: 'Gå till startsidan för att bearbeta en ny lång video', goToProcessor: 'Gå till Videoprocessor',
  userFeedback: 'Användarfeedback', feedbackDesc: 'Berätta om funktioner du vill förbättra eller problem du har stött på',
  feedbackPlaceholder: 'Ange din feedback (förslag, buggar, funktionsförfrågningar etc.)', feedbackSubmitted: 'Inskickat, tack för din feedback!',
  submitFeedback: 'Skicka In Feedback', feedbackFailed: 'Kunde inte skicka in feedback',
  statusPending: 'Väntande', statusProcessing: 'Bearbetar', statusCompleted: '✓ Slutförd', statusFailed: 'Misslyckades',
  },
  admin: { title: 'Admin Panel', blog: 'Blogg Hantering', blogCreate: 'Skapa Inlägg', blogTitle: 'Titel', blogCategory: 'Kategori', blogContent: 'Innehåll', blogPublish: 'Publicera', blogSave: 'Spara Utkast', blogPublished: 'Publicerad', blogDraft: 'Utkast' },
  blog: { title: 'Blogg', readMore: 'Läs Mer', noPosts: 'Inga inlägg ännu', subtitle: 'Senaste nytt, tips och uppdateringar från Clipop AI', views: 'visningar' },
  common: { loading: 'Laddar...', error: 'Fel', success: 'Lyckades', cancel: 'Avbryt', save: 'Spara', delete: 'Ta bort', edit: 'Redigera', search: 'Sök', ready: 'Redo', failed: 'Misslyckades', saving: 'Sparar...', score: 'Poäng', user: 'Användare' },
};

export default translations;
