import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Hjem', blog: 'Blogg', pricing: 'Priser', login: 'Logg inn', register: 'Registrer', dashboard: 'Dashboard', admin: 'Admin Panel', logout: 'Logg ut', credits: 'Kreditter', download: 'Last Ned App', light: 'Lys', dark: 'Mørk',
  },
  footer: {
  desc: 'Forvandle dine lange videoer til fengende korte klipp med AI-drevet analyse og redigering.', quickLinks: 'Hurtiglenker', legal: 'Juridisk', privacy: 'Personvernregler', terms: 'Tjenestevilkår', contact: 'Kontakt', rights: 'Alle rettigheter reservert.',
  },
  home: {
  hero: {
  badge: 'AI-drevet Videobehandling',
  title: 'Gjør Lange Videoer Til Virale Shorts',
  subtitle: 'AI-drevet videoklipping som automatisk trekker ut de beste øyeblikkene fra ditt lange innhold',
  cta: 'Start Med Klipping Gratis',
  secondary: 'Se Demo',
  },
  howItWorks: {
  title: 'Slik Fungerer Det', step1: { title: 'Videoinndata', desc: 'Lim inn URL eller last opp videoen din' }, step2: { title: 'AI-analyse', desc: 'AI oppdager automatisk høydepunkter' }, step3: { title: 'Lag Klipp', desc: 'Korte videoer opprettes' }, step4: { title: 'Last Ned', desc: 'Eksporter og del overalt' },
  },
  features: {
  title: 'Kraftig AI Videoklipping',
  auto: { title: 'Automatisk Highlight Deteksjon', desc: 'AI analyserer videoen din og identifiserer de mest engasjerende øyeblikkene automatisk' },
  multi: { title: 'Støtte For Flere Plattformer', desc: 'Importer fra YouTube, Bilibili eller last opp dine egne videofiler' },
  quick: { title: 'Rask Eksport', desc: 'Last ned klippene dine i flere formater, klare for enhver sosial plattform' },
  },
  },
  video: {
  input: { title: 'Inndata Video', url: 'Video URL (YouTube/Bilibili)', upload: 'Last Opp Video', placeholder: 'Lim inn YouTube eller Bilibili videolink...' },
  process: 'Behandle Video', processing: 'Behandler...', analyze: 'Analyser', results: 'Genererte Shorts', highlights: 'Highlight Analyse', download: 'Last Ned', preview: 'Forhåndsvisning',
  creditsAvailable: 'kreditter tilgjengelig', signInToStart: 'for å starte videobehandling', pasteUrlPlaceholder: 'Lim inn en video-URL (MP4, MOV, AVI...)', useLocalAgent: 'Bruk lokal Mac Agent (anbefalt for stabil YouTube)', uploadLocal: 'Last opp en lokal videofil (anbefalt når YouTube-lenke er blokkert)', selectedFile: 'Valgt', downloadMacApp: 'Last Ned Mac App', viewPricing: 'Se Priser', clipsReady: 'klipp klare', playableClips: 'avspillbare klipp', failedClips: 'mislyktes', aiFinished: 'AI har fullført utvelgelsen av de sterkeste øyeblikkene fra kildevideoen din.', openToPreview: 'Åpne et hvilket som helst klart klipp for forhåndsvisning, eller last ned MP4 direkte.', clipsBeingGenerated: 'Klipp genereres:', videoPreviewNotAvailable: 'Videoforhåndsvisning ikke tilgjengelig', clipMayStillProcessing: 'Klippet behandles kanskje fortsatt eller genereringen mislyktes.', insufficientCredits: 'Utilstrekkelige kreditter. Du trenger minst 30 kreditter.', enterVideoUrl: 'Vennligst skriv inn en video-URL eller last opp en lokal videofil.', enterValidUrl: 'Vennligst skriv inn en gyldig offentlig http(s) video-URL.',
  stage: {
  init: 'Initialiserer...', extractFrames: 'Ekstraherer videobilder...', framesExtracted: 'Bilder ekstrahert vellykket', framesUnavailable: 'Fortsetter med analyse', aiAnalysis: 'AI analyserer videoinnhold...', analysisComplete: 'Analyse fullført', generatingClip: 'Oppretter høydepunktsklipp...', clipReady: 'Høydepunktsklipp klart', saving: 'Lagrer resultater...', complete: 'Behandling fullført!', error: 'Feil oppstod',
  },
  },
  pricing: {
  title: 'Enkel, Gjenomskinnelig Pris', subtitle: 'Velg den planen som passer dine behov',
  paymentNote: 'Alipay for Kina · Creem for Internasjonalt (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Alle betalinger sikret med TLS 256-bit kryptering', faqTitle: 'Ofte Stilte Spørsmål', faq: { q1: 'Hva er en kreditt?', a1: 'Hver kreditt representerer behandlingskraft. Behandling av et videoklipp koster 30 kreditter.', q2: 'Hvordan fungerer daglig kreditt-nullstilling?', a2: 'Kreditter nullstilles til planens daglige grense kl. 00:00 UTC hver dag. Ubrukte kreditter overføres ikke.', q3: 'Kan jeg oppgradere eller nedgradere planen min?', a3: 'Ja, du kan endre planen din når som helst. Endringer trer i kraft umiddelbart.', q4: 'Hvilke videokilder støttes?', a4: 'Vi støtter YouTube, Bilibili og direkte videofil-opplasting (MP4, MOV, AVI).', q5: 'Hvilke betalingsmetoder støttes?', a5: 'Alipay for Kina-brukere, Creem (Visa, Mastercard, Apple Pay, Google Pay) for internasjonale brukere.' },
  mostPopular: 'Mest Populære',
  free: { title: 'Gratis', price: '$0', period: '/måned', desc: 'Perfekt for å prøve', feature1: '100 kreditter daglig', feature2: 'Grunnleggende videoklipping', feature3: '720p eksportkvalitet', feature4: 'Vannmerke inkludert', cta: 'Start' },
  starter: { title: 'Starter', price: '$9.9', period: '/måned', desc: 'For innholdsoprettere', feature1: '500 kreditter daglig', feature2: 'Prioritert behandling', feature3: '1080p eksportkvalitet', feature4: 'Intet vannmerke', feature5: 'E-post-støtte', cta: 'Abonner Nå' },
  pro: { title: 'Pro', price: '$19.9', period: '/måned', desc: 'For profesjonelle og team', feature1: 'Ubegrensede kreditter', feature2: 'Raskest behandling', feature3: '4K eksportkvalitet', feature4: 'Intet vannmerke', feature5: 'API-tilgang', feature6: 'Prioritert støtte', cta: 'Abonner Nå' },
  },
  downloadPage: {
  title: 'Last Ned Clipop Agent', subtitle: 'Skrivebordsapp for stabil YouTube/Bilibili videobehandling', badge: 'Skrivebordsapp', macTitle: 'macOS', macDesc: 'For Apple Silicon (M1/M2/M3/M4) Mac-er', downloadButton: 'Last Ned for macOS', version: 'Versjon', fileSize: 'Filstørrelse', requirements: 'macOS 12.0 eller senere', installing: 'Installasjonsguide', step1: 'Klikk på nedlastingsknappen for å lagre .dmg-filen', step2: 'Dobbeltklikk på den nedlastede .dmg-filen', step3: 'Dra Clipop Agent til Programmer-mappen', step4: 'Åpne Clipop Agent fra Programmer', notAvailable: 'Nedlasting forberedes, vennligst sjekk senere', backToHome: 'Tilbake til Hjem', whyDesktopTitle: 'Hvorfor Bruke Skrivebordsappen?', features: { stable: { title: 'Stabil Behandling', desc: 'Behandle videoer lokalt med maksimal stabilitet' }, fast: { title: 'Rask Nedlasting', desc: 'Last ned videoer direkte uten nettleserbegrensninger' }, local: { title: 'Lokal Behandling', desc: 'Behandle videoer på din Mac for personvern og hastighet' } },
  },
  login: {
  title: 'Logg inn', description: 'Tilgang til kontoen din', emailLabel: 'E-post', emailPlaceholder: 'you@example.com', passwordLabel: 'Passord', passwordPlaceholder: '••••••••', submitButton: 'Logg inn', orContinueWith: 'Eller fortsett med', googleButton: 'Fortsett med Google', dontHaveAccount: 'Har du ikke en konto?', signUp: 'Registrer',
  successTitle: 'Innlogging Vellykket!', successMessage: 'Du er logget inn som', successDesktopHint: 'Klikk på knappen nedenfor for å gå tilbake til skrivebordsappen.', returnToDesktop: 'Tilbake til Clipop Agent', desktopNotOpened: 'Hvis skrivebordsappen ikke åpner automatisk, vennligst sørg for at Clipop Agent kjører.',
  },
  register: {
  title: 'Opprett Konto', description: 'Start med Clipop AI', nameLabel: 'Fullt Navn', namePlaceholder: 'John Doe', emailLabel: 'E-post', emailPlaceholder: 'you@example.com', passwordLabel: 'Passord', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Bekreft Passord', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Fortsett', sendingCode: 'Sender...', codeLabel: 'Bekreftelseskode', codePlaceholder: 'Skriv inn 6-sifret kode', verifyButton: 'Opprett Konto', codeNotReceived: 'Mottok du ikke koden?', resendButton: 'Send Igjen', resendIn: 'Send igjen om', backButton: 'Tilbake', googleButton: 'Fortsett med Google', alreadyHaveAccount: 'Har du allerede en konto?', signIn: 'Logg inn',
  errorNameRequired: 'Vennligst skriv inn navnet ditt', errorEmailRequired: 'Vennligst skriv inn e-posten din', errorPasswordLength: 'Passordet må være minst 6 tegn', errorPasswordMismatch: 'Passordene samsvarer ikke', errorEmailExists: 'Denne e-posten er allerede registrert. Vennligst logg inn.', errorSendCode: 'Kunne ikke sende kode', errorNetwork: 'Nettverksfeil. Vennligst prøv igjen.', errorCodeLength: 'Vennligst skriv inn 6-sifret kode',
  successTitle: 'Konto Opprettet!', successMessage: 'Kontoen din er opprettet som', successDesktopHint: 'Klikk på knappen nedenfor for å gå tilbake til skrivebordsappen.', returnToDesktop: 'Tilbake til Clipop Agent', desktopNotOpened: 'Hvis skrivebordsappen ikke åpner automatisk, vennligst sørg for at Clipop Agent kjører.',
  },
  dashboard: { title: 'Dashboard', credits: 'Tilgjengelige Kreditter', creditsReset: 'Tilbakestilles daglig kl. 00:00 UTC', history: 'Behandlingshistorikk', noVideos: 'Ingen videoer behandlet ennå', startProcessing: 'Start Behandling Av Videoer',
  untitled: 'Uten tittel', clip: 'Klipp', clipsCount: 'høydepunkter', clipsHint: 'Klikk på et klipp for å spille av',
  desktopLoginDetected: 'Skrivebordsapp-innlogging Oppdaget', desktopLoginHint: 'Klikk på knappen nedenfor for å gå tilbake til Clipop Agent', returnToDesktop: 'Tilbake til Clipop Agent',
  welcomeBack: 'Velkommen tilbake',
  videosProcessed: 'Behandlede Videoer', videosProcessedDesc: 'Totalt behandlede videoer', clipsGenerated: 'Genererte Klipp', clipsGeneratedDesc: 'Totalt høydepunktsklipp',
  currentPlan: 'Nåværende Plan', upgradePlan: 'Oppgrader Plan',
  processNewVideo: 'Behandl Ny Video', feedback: 'Tilbakemelding',
  historyHint: 'Klikk på fullførte poster for å utvide og se høydepunktsklipp',
  processNewVideoDesc: 'Gå til hjemmesiden for å behandle en ny lang video', goToProcessor: 'Gå til Videoprosessor',
  userFeedback: 'Brukertilbakemelding', feedbackDesc: 'Fortell oss om funksjoner du vil forbedre eller problemer du har møtt',
  feedbackPlaceholder: 'Skriv inn tilbakemeldingen din (forslag, feil, funksjonsforespørsler osv.)', feedbackSubmitted: 'Innsendt, takk for tilbakemeldingen!',
  submitFeedback: 'Send Inn Tilbakemelding', feedbackFailed: 'Kunne ikke sende inn tilbakemelding',
  statusPending: 'Venter', statusProcessing: 'Behandler', statusCompleted: '✓ Fullført', statusFailed: 'Mislyktes',
  },
  admin: { title: 'Admin Panel', blog: 'Blogg Administrasjon', blogCreate: 'Opprett Innlegg', blogTitle: 'Tittel', blogCategory: 'Kategori', blogContent: 'Innhold', blogPublish: 'Publiser', blogSave: 'Lagre Utkast', blogPublished: 'Publisert', blogDraft: 'Utkast' },
  blog: { title: 'Blogg', readMore: 'Les Mer', noPosts: 'Ingen innlegg ennå', subtitle: 'Siste nytt, tips og oppdateringer fra Clipop AI', views: 'visninger' },
  common: { loading: 'Laster...', error: 'Feil', success: 'Suksess', cancel: 'Avbryt', save: 'Lagre', delete: 'Slett', edit: 'Rediger', search: 'Søk', ready: 'Klar', failed: 'Mislyktes', saving: 'Lagrer...', score: 'Poeng', user: 'Bruker' },
};

export default translations;
