import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Home', blog: 'Blog', pricing: 'Prijzen', login: 'Inloggen', register: 'Registreren', dashboard: 'Dashboard', admin: 'Beheerderspaneel', logout: 'Uitloggen', credits: 'Credits', download: 'App Downloaden', light: 'Licht', dark: 'Donker',
  },
  footer: {
  desc: 'Transformeer je lange video\'s naar boeiende korte clips met AI-aangedreven analyse en bewerking.', quickLinks: 'Snelle Links', legal: 'Juridisch', privacy: 'Privacybeleid', terms: 'Servicevoorwaarden', contact: 'Contact', rights: 'Alle rechten voorbehouden.',
  },
  home: {
  hero: {
  badge: 'AI-Aangedreven Videoverwerking',
  title: 'Maak Lange Video\'s Viral Shorts',
  subtitle: 'AI-gestuurde videoknippen die automatisch de beste momenten uit je lange inhoud haalt',
  cta: 'Begin Gratis Met Knippen',
  secondary: 'Bekijk Demo',
  },
  howItWorks: {
  title: 'Hoe Het Werkt', step1: { title: 'Video Invoeren', desc: 'Plak URL of upload je video' }, step2: { title: 'AI-analyse', desc: 'AI detecteert automatisch hoogtepunten' }, step3: { title: 'Clips Maken', desc: 'Korte video\'s worden gemaakt' }, step4: { title: 'Downloaden', desc: 'Exporteer en deel overal' },
  },
  features: {
  title: 'Krachtige AI Videoknippen',
  auto: { title: 'Automatische Highlight Detectie', desc: 'AI analyseert je video en identificeert automatisch de meest boeiende momenten' },
  multi: { title: 'Ondersteuning Voor Meerdere Platforms', desc: 'Importeer van YouTube, Bilibili of upload je eigen videobestanden' },
  quick: { title: 'Snelle Export', desc: 'Download je clips in meerdere formaten, klaar voor elk sociaal platform' },
  },
  },
  video: {
  input: { title: 'Invoer Video', url: 'Video URL (YouTube/Bilibili)', upload: 'Upload Video', placeholder: 'Plak YouTube of Bilibili videolink...' },
  process: 'Verwerk Video', processing: 'Verwerken...', analyze: 'Analyseren', results: 'Gegenereerde Shorts', highlights: 'Highlight Analyse', download: 'Download', preview: 'Voorbeeld',
  creditsAvailable: 'credits beschikbaar', signInToStart: 'om te beginnen met videoverwerking', pasteUrlPlaceholder: 'Plak een video-URL (MP4, MOV, AVI...)', useLocalAgent: 'Gebruik lokale Mac Agent (aanbevolen voor stabiele YouTube)', uploadLocal: 'Upload een lokale videobestand (aanbevolen wanneer YouTube-link geblokkeerd is)', selectedFile: 'Geselecteerd', downloadMacApp: 'Mac App Downloaden', viewPricing: 'Bekijk Prijzen', clipsReady: 'clips klaar', playableClips: 'afspeelbare clips', failedClips: 'mislukt', aiFinished: 'AI heeft het selecteren van de sterkste momenten uit je bronvideo voltooid.', openToPreview: 'Open een gereed clip om een voorvertoning te bekijken, of download de MP4 direct.', clipsBeingGenerated: 'Clips worden gegenereerd:', videoPreviewNotAvailable: 'Videovoorvertoning niet beschikbaar', clipMayStillProcessing: 'De clip wordt mogelijk nog verwerkt of het genereren is mislukt.', insufficientCredits: 'Onvoldoende credits. Je hebt minimaal 30 credits nodig.', enterVideoUrl: 'Voer een video-URL in of upload een lokaal videobestand.', enterValidUrl: 'Voer een geldige openbare http(s) video-URL in.',
  stage: {
  init: 'Initialiseren...', extractFrames: 'Videoframes extraheren...', framesExtracted: 'Frames succesvol geëxtraheerd', framesUnavailable: 'Doorgaan met analyse', aiAnalysis: 'AI analyseert video-inhoud...', analysisComplete: 'Analyse voltooid', generatingClip: 'Hoogtepuntclip maken...', clipReady: 'Hoogtepuntclip klaar', saving: 'Resultaten opslaan...', complete: 'Verwerking voltooid!', error: 'Fout opgetreden',
  },
  },
  pricing: {
  title: 'Eenvoudige, Transparante Prijzen', subtitle: 'Kies het plan dat bij je behoeften past',
  paymentNote: 'Alipay voor China · Creem voor Internationaal (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Alle betalingen beveiligd met TLS 256-bit encryptie', faqTitle: 'Veelgestelde Vragen', faq: { q1: 'Wat is een credit?', a1: 'Elke credit vertegenwoordigt verwerkingskracht. Het verwerken van een videoclip kost 30 credits.', q2: 'Hoe werkt de dagelijkse credit-reset?', a2: 'Credits worden elke dag om 00:00 UTC gereset naar de dagelijkse limiet van je abonnement. Ongebruikte credits worden niet overgedragen.', q3: 'Kan ik mijn abonnement upgraden of downgraden?', a3: 'Ja, je kunt je abonnement op elk moment wijzigen. Wijzigingen treden onmiddellijk in werking.', q4: 'Welke videobronnen worden ondersteund?', a4: 'We ondersteunen YouTube, Bilibili en directe videobestand-uploads (MP4, MOV, AVI).', q5: 'Welke betaalmethoden worden ondersteund?', a5: 'Alipay voor China-gebruikers, Creem (Visa, Mastercard, Apple Pay, Google Pay) voor internationale gebruikers.' },
  mostPopular: 'Meest Populair',
  free: { title: 'Gratis', price: '$0', period: '/maand', desc: 'Perfect om te proberen', feature1: '100 credits per dag', feature2: 'Basise videoknippen', feature3: '720p exportkwaliteit', feature4: 'Watermerk inbegrepen', cta: 'Begin' },
  starter: { title: 'Starter', price: '$9.9', period: '/maand', desc: 'Voor contentmakers', feature1: '500 credits per dag', feature2: 'Prioriteitsverwerking', feature3: '1080p exportkwaliteit', feature4: 'Geen watermerk', feature5: 'E-mailondersteuning', cta: 'Nu Abonneren' },
  pro: { title: 'Pro', price: '$19.9', period: '/maand', desc: 'Voor professionals en teams', feature1: 'Onbeperkte credits', feature2: 'Snelste verwerking', feature3: '4K exportkwaliteit', feature4: 'Geen watermerk', feature5: 'API-toegang', feature6: 'Prioriteitsondersteuning', cta: 'Nu Abonneren' },
  },
  downloadPage: {
  title: 'Download Clipop Agent', subtitle: 'Desktop-app voor stabiele YouTube/Bilibili videoverwerking', badge: 'Desktop-app', macTitle: 'macOS', macDesc: 'Voor Apple Silicon (M1/M2/M3/M4) Macs', downloadButton: 'Download voor macOS', version: 'Versie', fileSize: 'Bestandsgrootte', requirements: 'macOS 12.0 of later', installing: 'Installatiehandleiding', step1: 'Klik op de downloadknop om het .dmg-bestand op te slaan', step2: 'Dubbelklik op het gedownloade .dmg-bestand', step3: 'Sleep Clipop Agent naar de Applicaties-map', step4: 'Open Clipop Agent vanuit Applicaties', notAvailable: 'Download wordt voorbereid, controleer later opnieuw', backToHome: 'Terug naar Home', whyDesktopTitle: 'Waarom de Desktop-app Gebruiken?', features: { stable: { title: 'Stabiele Verwerking', desc: 'Verwerk video\'s lokaal met maximale stabiliteit' }, fast: { title: 'Snelle Download', desc: 'Download video\'s direct zonder browserbeperkingen' }, local: { title: 'Lokale Verwerking', desc: 'Verwerk video\'s op je Mac voor privacy en snelheid' } },
  },
  login: {
  title: 'Inloggen', description: 'Toegang tot je account', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Wachtwoord', passwordPlaceholder: '••••••••', submitButton: 'Inloggen', orContinueWith: 'Of doorgaan met', googleButton: 'Doorgaan met Google', dontHaveAccount: 'Geen account?', signUp: 'Registreren',
  successTitle: 'Inloggen Succesvol!', successMessage: 'Je bent succesvol ingelogd als', successDesktopHint: 'Klik op de onderstaande knop om terug te keren naar de desktop-app.', returnToDesktop: 'Terug naar Clipop Agent', desktopNotOpened: 'Als de desktop-app niet automatisch opent, zorg er dan voor dat Clipop Agent draait.',
  },
  register: {
  title: 'Account Aanmaken', description: 'Begin met Clipop AI', nameLabel: 'Volledige Naam', namePlaceholder: 'John Doe', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Wachtwoord', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Bevestig Wachtwoord', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Doorgaan', sendingCode: 'Versturen...', codeLabel: 'Verificatiecode', codePlaceholder: 'Voer 6-cijferige code in', verifyButton: 'Account Aanmaken', codeNotReceived: 'Code niet ontvangen?', resendButton: 'Opnieuw Versturen', resendIn: 'Opnieuw versturen', backButton: 'Terug', googleButton: 'Doorgaan met Google', alreadyHaveAccount: 'Heb je al een account?', signIn: 'Inloggen',
  errorNameRequired: 'Voer je naam in', errorEmailRequired: 'Voer je e-mailadres in', errorPasswordLength: 'Wachtwoord moet minimaal 6 tekens bevatten', errorPasswordMismatch: 'Wachtwoorden komen niet overeen', errorEmailExists: 'Dit e-mailadres is al geregistreerd. Log in plaats daarvan in.', errorSendCode: 'Code verzenden mislukt', errorNetwork: 'Netwerkfout. Probeer opnieuw.', errorCodeLength: 'Voer een 6-cijferige code in',
  successTitle: 'Account Aangemaakt!', successMessage: 'Je account is succesvol aangemaakt als', successDesktopHint: 'Klik op de onderstaande knop om terug te keren naar de desktop-app.', returnToDesktop: 'Terug naar Clipop Agent', desktopNotOpened: 'Als de desktop-app niet automatisch opent, zorg er dan voor dat Clipop Agent draait.',
  },
  dashboard: { title: 'Dashboard', credits: 'Beschikbare Credits', creditsReset: 'Dagelijks gereset om 00:00 UTC', history: 'Verwerkingsgeschiedenis', noVideos: 'Nog geen video\'s verwerkt', startProcessing: 'Start Video Verwerking',
  untitled: 'Naamloos', clip: 'Clip', clipsCount: 'hoogtepunten', clipsHint: 'Klik op een clip om af te spelen',
  desktopLoginDetected: 'Desktop-app Login Gedetecteerd', desktopLoginHint: 'Klik op de onderstaande knop om terug te keren naar Clipop Agent', returnToDesktop: 'Terug naar Clipop Agent',
  welcomeBack: 'Welkom terug',
  videosProcessed: 'Verwerkte Video\'s', videosProcessedDesc: 'Totaal verwerkte video\'s', clipsGenerated: 'Gegenereerde Clips', clipsGeneratedDesc: 'Totaal hoogtepuntclips',
  currentPlan: 'Huidig Abonnement', upgradePlan: 'Abonnement Upgraden',
  processNewVideo: 'Nieuwe Video Verwerken', feedback: 'Feedback',
  historyHint: 'Klik op voltooide records om uit te vouwen en hoogtepuntclips te bekijken',
  processNewVideoDesc: 'Ga naar de homepage om een nieuwe lange video te verwerken', goToProcessor: 'Ga naar Videoprocessor',
  userFeedback: 'Gebruikersfeedback', feedbackDesc: 'Vertel ons over functies die je wilt verbeteren of problemen die je bent tegengekomen',
  feedbackPlaceholder: 'Voer je feedback in (suggesties, bugs, functieverzoeken enz.)', feedbackSubmitted: 'Ingediend, bedankt voor je feedback!',
  submitFeedback: 'Feedback Indienen', feedbackFailed: 'Feedback indienen mislukt',
  statusPending: 'In afwachting', statusProcessing: 'Verwerken', statusCompleted: '✓ Voltooid', statusFailed: 'Mislukt',
  },
  admin: { title: 'Beheerderspaneel', blog: 'Blog Beheer', blogCreate: 'Bericht Aanmaken', blogTitle: 'Titel', blogCategory: 'Categorie', blogContent: 'Inhoud', blogPublish: 'Publiceren', blogSave: 'Concept Opslaan', blogPublished: 'Gepubliceerd', blogDraft: 'Concept' },
  blog: { title: 'Blog', readMore: 'Lees Meer', noPosts: 'Nog geen berichten', subtitle: 'Laatste nieuws, tips en updates van Clipop AI', views: 'weergaven' },
  common: { loading: 'Laden...', error: 'Fout', success: 'Succes', cancel: 'Annuleren', save: 'Opslaan', delete: 'Verwijderen', edit: 'Bewerken', search: 'Zoeken', ready: 'Klaar', failed: 'Mislukt', saving: 'Opslaan...', score: 'Score', user: 'Gebruiker' },
};

export default translations;
