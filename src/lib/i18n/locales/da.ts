import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Hjem', blog: 'Blog', pricing: 'Priser', login: 'Log ind', register: 'Opret', dashboard: 'Dashboard', admin: 'Admin Panel', logout: 'Log ud', credits: 'Krediter', download: 'Download App', light: 'Lyst', dark: 'Mørkt',
  },
  footer: {
  desc: 'Forvandl dine lange videoer til fængende korte klip med AI-drevet analyse og redigering.', quickLinks: 'Hurtige Links', legal: 'Juridisk', privacy: 'Privatlivspolitik', terms: 'Servicevilkår', contact: 'Kontakt', rights: 'Alle rettigheder forbeholdes.',
  },
  home: {
  hero: {
  badge: 'AI-drevet Videobehandling',
  title: 'Lav Lange Videoer Til Virale Shorts',
  subtitle: 'AI-drevet videoklipning, der automatisk udtrækker de bedste øjeblikke fra dit lange indhold',
  cta: 'Start Med Klipning Gratis',
  secondary: 'Se Demo',
  },
  howItWorks: {
  title: 'Sådan Virker Det', step1: { title: 'Indsæt Video', desc: 'Indsæt URL eller upload din video' }, step2: { title: 'AI-analyse', desc: 'AI registrerer automatisk højdepunkter' }, step3: { title: 'Opret Klip', desc: 'Korte videoer oprettes' }, step4: { title: 'Download', desc: 'Eksporter og del overalt' },
  },
  features: {
  title: 'Kraftfuld AI Videoklipning',
  auto: { title: 'Automatisk Highlight Detektering', desc: 'AI analyserer din video og identificerer de mest engagerende øjeblikke automatisk' },
  multi: { title: 'Understøttelse Af Flere Platforme', desc: 'Importér fra YouTube, Bilibili eller upload dine egne videofiler' },
  quick: { title: 'Hurtig Eksport', desc: 'Download dine klip i flere formater, klar til enhver social platform' },
  },
  },
  video: {
  input: { title: 'Indput Video', url: 'Video URL (YouTube/Bilibili)', upload: 'Upload Video', placeholder: 'Indsæt YouTube eller Bilibili videolink...' },
  process: 'Behandling Af Video', processing: 'Behandler...', analyze: 'Analysér', results: 'Genererede Shorts', highlights: 'Highlight Analyse', download: 'Download', preview: 'Forhåndsvisning',
  creditsAvailable: 'kredit tilgængelig', signInToStart: 'for at starte videobehandling', pasteUrlPlaceholder: 'Indsæt en video-URL (MP4, MOV, AVI...)', useLocalAgent: 'Brug lokal Mac Agent (anbefalet til stabil YouTube)', uploadLocal: 'Upload en lokal videofil (anbefalet når YouTube-link er blokeret)', selectedFile: 'Valgt', downloadMacApp: 'Download Mac App', viewPricing: 'Se Priser', clipsReady: 'klip klar', playableClips: 'afspilbare klip', failedClips: 'mislykkedes', aiFinished: 'AI har afsluttet udvælgelsen af de stærkeste øjeblikke fra din kildevideo.', openToPreview: 'Åbn ethvert klar klip for at forhåndsvise det inline, eller download MP4 direkte.', clipsBeingGenerated: 'Klip genereres:', videoPreviewNotAvailable: 'Videoforhåndsvisning ikke tilgængelig', clipMayStillProcessing: 'Klippen behandles muligvis stadig eller kunne ikke genereres.', insufficientCredits: 'Utilstrækkelige kreditter. Du skal bruge mindst 30 kreditter.', enterVideoUrl: 'Indtast venligst en video-URL eller upload en lokal videofil.', enterValidUrl: 'Indtast venligst en gyldig offentlig http(s) video-URL.',
  stage: {
  init: 'Initialiserer...', extractFrames: 'Udtrækker videobilleder...', framesExtracted: 'Billeder udtrukket succesfuldt', framesUnavailable: 'Fortsætter med analyse', aiAnalysis: 'AI analyserer videoindhold...', analysisComplete: 'Analyse fuldført', generatingClip: 'Opretter højdepunktsklip...', clipReady: 'Højdepunktsklip klar', saving: 'Gemmer resultater...', complete: 'Behandling fuldført!', error: 'Fejl opstod',
  },
  },
  pricing: {
  title: 'Enkel, Gennemsigtig Pris', subtitle: 'Vælg den plan, der passer til dine behov',
  paymentNote: 'Alipay for Kina · Creem for International (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Alle betalinger sikret med TLS 256-bit kryptering', faqTitle: 'Ofte Stillede Spørgsmål', faq: { q1: 'Hvad er en kredit?', a1: 'Hver kredit repræsenterer behandlingskraft. Behandling af et videoklip koster 30 kreditter.', q2: 'Hvordan fungerer daglig kredit-nulstilling?', a2: 'Kreditter nulstilles til din plans daglige grænse kl. 00:00 UTC hver dag. Ubrugte kreditter overføres ikke.', q3: 'Kan jeg opgradere eller nedgradere min plan?', a3: 'Ja, du kan ændre din plan når som helst. Ændringer træder i kraft straks.', q4: 'Hvilke videokilder understøttes?', a4: 'Vi understøtter YouTube, Bilibili og direkte videofil-upload (MP4, MOV, AVI).', q5: 'Hvilke betalingsmetoder understøttes?', a5: 'Alipay for Kina-brugere, Creem (Visa, Mastercard, Apple Pay, Google Pay) for internationale brugere.' },
  mostPopular: 'Mest Populære',
  free: { title: 'Gratis', price: '$0', period: '/måned', desc: 'Perfekt til at prøve', feature1: '100 krediter dagligt', feature2: 'Grundlæggende videoklipning', feature3: '720p eksportkvalitet', feature4: 'Vandmærke inkluderet', cta: 'Start' },
  starter: { title: 'Starter', price: '$9.9', period: '/måned', desc: 'Til indholdsoprettere', feature1: '500 krediter dagligt', feature2: 'Prioriteret behandling', feature3: '1080p eksportkvalitet', feature4: 'Intet vandmærke', feature5: 'E-mail-support', cta: 'Abonner Nu' },
  pro: { title: 'Pro', price: '$19.9', period: '/måned', desc: 'Til professionelle og teams', feature1: 'Ubegrænsede krediter', feature2: 'Hurtigste behandling', feature3: '4K eksportkvalitet', feature4: 'Intet vandmærke', feature5: 'API-adgang', feature6: 'Prioriteret support', cta: 'Abonner Nu' },
  },
  downloadPage: {
  title: 'Download Clipop Agent', subtitle: 'Skrivebordsapp til stabil YouTube/Bilibili videobehandling', badge: 'Skrivebordsapp', macTitle: 'macOS', macDesc: 'Til Apple Silicon (M1/M2/M3/M4) Macs', downloadButton: 'Download til macOS', version: 'Version', fileSize: 'Filstørrelse', requirements: 'macOS 12.0 eller senere', installing: 'Installationsvejledning', step1: 'Klik på download-knappen for at gemme .dmg-filen', step2: 'Dobbeltklik på den downloadede .dmg-fil', step3: 'Træk Clipop Agent til Applications-mappen', step4: 'Åbn Clipop Agent fra Applications', notAvailable: 'Download forberedes, tjek venligst senere', backToHome: 'Tilbage til Forsiden', whyDesktopTitle: 'Hvorfor Bruge Skrivebordsappen?', features: { stable: { title: 'Stabil Behandling', desc: 'Behandl videoer lokalt med maksimal stabilitet' }, fast: { title: 'Hurtig Download', desc: 'Download videoer direkte uden browserbegrænsninger' }, local: { title: 'Lokal Behandling', desc: 'Behandl videoer på din Mac for privatliv og hastighed' } },
  },
  login: {
  title: 'Log ind', description: 'Adgang til din konto', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Adgangskode', passwordPlaceholder: '••••••••', submitButton: 'Log ind', orContinueWith: 'Eller fortsæt med', googleButton: 'Fortsæt med Google', dontHaveAccount: 'Har du ikke en konto?', signUp: 'Opret',
  successTitle: 'Login Lykkedes!', successMessage: 'Du er logget ind som', successDesktopHint: 'Klik på knappen herunder for at vende tilbage til skrivebordsappen.', returnToDesktop: 'Vend tilbage til Clipop Agent', desktopNotOpened: 'Hvis skrivebordsappen ikke åbner automatisk, skal du sikre dig, at Clipop Agent kører.',
  },
  register: {
  title: 'Opret Konto', description: 'Start med Clipop AI', nameLabel: 'Fulde Navn', namePlaceholder: 'John Doe', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Adgangskode', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Bekræft Adgangskode', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Fortsæt', sendingCode: 'Sender...', codeLabel: 'Bekræftelseskode', codePlaceholder: 'Indtast 6-cifret kode', verifyButton: 'Opret Konto', codeNotReceived: 'Modtog du ikke koden?', resendButton: 'Send Igen', resendIn: 'Send igen om', backButton: 'Tilbage', googleButton: 'Fortsæt med Google', alreadyHaveAccount: 'Har du allerede en konto?', signIn: 'Log ind',
  errorNameRequired: 'Indtast venligst dit navn', errorEmailRequired: 'Indtast venligst din e-mail', errorPasswordLength: 'Adgangskoden skal være mindst 6 tegn', errorPasswordMismatch: 'Adgangskoder matcher ikke', errorEmailExists: 'Denne e-mail er allerede registreret. Log venligst ind.', errorSendCode: 'Kunne ikke sende kode', errorNetwork: 'Netværksfejl. Prøv venligst igen.', errorCodeLength: 'Indtast venligst 6-cifret kode',
  successTitle: 'Konto Oprettet!', successMessage: 'Din konto er oprettet som', successDesktopHint: 'Klik på knappen herunder for at vende tilbage til skrivebordsappen.', returnToDesktop: 'Vend tilbage til Clipop Agent', desktopNotOpened: 'Hvis skrivebordsappen ikke åbner automatisk, skal du sikre dig, at Clipop Agent kører.',
  },
  dashboard: { title: 'Dashboard', credits: 'Tilgængelige Krediter', creditsReset: 'Nulstilles dagligt kl. 00:00 UTC', history: 'Behandlingshistorik', noVideos: 'Ingen videoer behandlet endnu', startProcessing: 'Start Behandling Af Videoer',
  untitled: 'Unavngivet', clip: 'Klip', clipsCount: 'højdepunkter', clipsHint: 'Klik på et klip for at afspille',
  desktopLoginDetected: 'Skrivebordsapp-login Registreret', desktopLoginHint: 'Klik på knappen herunder for at vende tilbage til Clipop Agent', returnToDesktop: 'Vend tilbage til Clipop Agent',
  welcomeBack: 'Velkommen tilbage',
  videosProcessed: 'Behandlede Videoer', videosProcessedDesc: 'Total behandlede videoer', clipsGenerated: 'Genererede Klip', clipsGeneratedDesc: 'Total højdepunktsklip',
  currentPlan: 'Nuværende Plan', upgradePlan: 'Opgrader Plan',
  processNewVideo: 'Behandl Ny Video', feedback: 'Feedback',
  historyHint: 'Klik på fulførte poster for at udvide og se højdepunktsklip',
  processNewVideoDesc: 'Gå til forsiden for at behandle en ny lang video', goToProcessor: 'Gå til Videoprocessor',
  userFeedback: 'Brugerfeedback', feedbackDesc: 'Fortæl os om funktioner du vil forbedre eller problemer du har stødt på',
  feedbackPlaceholder: 'Indtast din feedback (forslag, fejl, funktionsanmodninger osv.)', feedbackSubmitted: 'Indsendt, tak for din feedback!',
  submitFeedback: 'Indsend Feedback', feedbackFailed: 'Kunne ikke indsende feedback',
  statusPending: 'Afventer', statusProcessing: 'Behandler', statusCompleted: '✓ Fuldført', statusFailed: 'Mislykkedes',
  },
  admin: { title: 'Admin Panel', blog: 'Blog Administration', blogCreate: 'Opret Indlæg', blogTitle: 'Titel', blogCategory: 'Kategori', blogContent: 'Indhold', blogPublish: 'Udgiv', blogSave: 'Gem Udkast', blogPublished: 'Udgivet', blogDraft: 'Udkast' },
  blog: { title: 'Blog', readMore: 'Læs Mere', noPosts: 'Ingen indlæg endnu', subtitle: 'Seneste nyheder, tips og opdateringer fra Clipop AI', views: 'visninger' },
  common: { loading: 'Indlæser...', error: 'Fejl', success: 'Succes', cancel: 'Annuller', save: 'Gem', delete: 'Slet', edit: 'Rediger', search: 'Søg', ready: 'Klar', failed: 'Mislykkedes', saving: 'Gemmer...', score: 'Score', user: 'Bruger' },
};

export default translations;
