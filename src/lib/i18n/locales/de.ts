import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Start', blog: 'Blog', pricing: 'Preise', login: 'Anmelden', register: 'Registrieren', dashboard: 'Dashboard', admin: 'Admin-Panel', logout: 'Abmelden', credits: 'Guthaben', download: 'App Herunterladen', light: 'Hell', dark: 'Dunkel',
  },
  footer: {
  desc: 'Verwandeln Sie Ihre langen Videos mit KI-gestützter Analyse und Bearbeitung in fesselnde kurze Clips.', quickLinks: 'Schnelllinks', legal: 'Rechtliches', privacy: 'Datenschutzrichtlinie', terms: 'Nutzungsbedingungen', contact: 'Kontakt', rights: 'Alle Rechte vorbehalten.',
  },
  home: {
  hero: {
  badge: 'KI-gestützte Videoverarbeitung',
  title: 'Lange Videos in virale Shorts verwandeln',
  subtitle: 'KI-gestütztes Video-Clipping extrahiert automatisch die besten Momente aus Ihrer Langform-Inhalte',
  cta: 'Kostenlos clippen',
  secondary: 'Demo ansehen',
  },
  howItWorks: {
  title: 'So funktioniert es', step1: { title: 'Video eingeben', desc: 'URL einfügen oder Video hochladen' }, step2: { title: 'KI-Analyse', desc: 'KI erkennt automatisch Highlights' }, step3: { title: 'Clips erstellen', desc: 'Kurzvideos werden erstellt' }, step4: { title: 'Herunterladen', desc: 'Exportieren und überall teilen' },
  },
  features: {
  title: 'Leistungsstarkes KI-Video-Clipping',
  auto: { title: 'Automatische Highlight-Erkennung', desc: 'KI analysiert Ihr Video und identifiziert automatisch die ansprechendsten Momente' },
  multi: { title: 'Multi-Plattform-Unterstützung', desc: 'Importieren Sie von YouTube, Bilibili oder laden Sie Ihre eigenen Videodateien hoch' },
  quick: { title: 'Schneller Export', desc: 'Laden Sie Ihre Clips in mehreren Formaten herunter, bereit für jede Social-Plattform' },
  },
  },
  video: {
  input: { title: 'Video-Eingabe', url: 'Video-URL (YouTube/Bilibili)', upload: 'Video hochladen', placeholder: 'Fügen Sie den YouTube- oder Bilibili-Videolink ein...' },
  process: 'Video verarbeiten', processing: 'Verarbeitung...', analyze: 'Analysieren', results: 'Generierte Shorts', highlights: 'Highlight-Analyse', download: 'Herunterladen', preview: 'Vorschau',
  creditsAvailable: 'Guthaben verfügbar', signInToStart: 'um Videos zu verarbeiten', pasteUrlPlaceholder: 'Video-URL einfügen (MP4, MOV, AVI...)', useLocalAgent: 'Lokalen Mac-Agent verwenden (empfohlen für stabiles YouTube)', uploadLocal: 'Lokale Videodatei hochladen (empfohlen wenn YouTube-Link blockiert ist)', selectedFile: 'Ausgewählt', downloadMacApp: 'Mac App Herunterladen', viewPricing: 'Preise ansehen', clipsReady: 'Clips bereit', playableClips: 'abspielbare Clips', failedClips: 'fehlgeschlagen', aiFinished: 'KI hat die Auswahl der stärksten Momente aus Ihrem Quellvideo abgeschlossen.', openToPreview: 'Öffnen Sie einen bereiten Clip zur Vorschau oder laden Sie die MP4 direkt herunter.', clipsBeingGenerated: 'Clips werden generiert:', videoPreviewNotAvailable: 'Videovorschau nicht verfügbar', clipMayStillProcessing: 'Der Clip wird möglicherweise noch verarbeitet oder die Generierung ist fehlgeschlagen.', insufficientCredits: 'Unzureichendes Guthaben. Sie benötigen mindestens 30 Credits.', enterVideoUrl: 'Bitte geben Sie eine Video-URL ein oder laden Sie eine lokale Videodatei hoch.', enterValidUrl: 'Bitte geben Sie eine gültige öffentliche http(s) Video-URL ein.',
  stage: {
  init: 'Initialisierung...', extractFrames: 'Videobilder werden extrahiert...', framesExtracted: 'Bilder erfolgreich extrahiert', framesUnavailable: 'Analyse wird fortgesetzt', aiAnalysis: 'KI analysiert Videoinhalt...', analysisComplete: 'Analyse abgeschlossen', generatingClip: 'Highlight-Clip wird erstellt...', clipReady: 'Highlight-Clip bereit', saving: 'Ergebnisse werden gespeichert...', complete: 'Verarbeitung abgeschlossen!', error: 'Fehler aufgetreten',
  },
  },
  pricing: {
  title: 'Einfache, transparente Preise', subtitle: 'Wählen Sie den Plan, der zu Ihren Bedürfnissen passt',
  paymentNote: 'Alipay für China · Creem für International (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Alle Zahlungen mit TLS 256-Bit-Verschlüsselung gesichert', faqTitle: 'Häufig gestellte Fragen', faq: { q1: 'Was ist ein Credit?', a1: 'Jeder Credit repräsentiert Verarbeitungsleistung. Die Verarbeitung eines Videoclips kostet 30 Credits.', q2: 'Wie funktioniert das tägliche Credit-Reset?', a2: 'Credits werden täglich um 00:00 UTC auf Ihr Plan-Limit zurückgesetzt. Nicht verwendete Credits verfallen.', q3: 'Kann ich meinen Plan upgraden oder downgraden?', a3: 'Ja, Sie können Ihren Plan jederzeit ändern. Änderungen werden sofort wirksam.', q4: 'Welche Videoquellen werden unterstützt?', a4: 'Wir unterstützen YouTube, Bilibili und direkte Videodatei-Uploads (MP4, MOV, AVI).', q5: 'Welche Zahlungsmethoden werden unterstützt?', a5: 'Alipay für China-Nutzer, Creem (Visa, Mastercard, Apple Pay, Google Pay) für internationale Nutzer.' },
  mostPopular: 'Am beliebtesten',
  free: { title: 'Kostenlos', price: '$0', period: '/Monat', desc: 'Perfekt zum Ausprobieren', feature1: '100 Credits täglich', feature2: 'Grundlegendes Video-Clipping', feature3: '720p Export-Qualität', feature4: 'Wasserzeichen enthalten', cta: 'Loslegen' },
  starter: { title: 'Starter', price: '$9.9', period: '/Monat', desc: 'Für Content-Ersteller', feature1: '500 Credits täglich', feature2: 'Prioritätsverarbeitung', feature3: '1080p Export-Qualität', feature4: 'Kein Wasserzeichen', feature5: 'E-Mail-Support', cta: 'Jetzt abonnieren' },
  pro: { title: 'Pro', price: '$19.9', period: '/Monat', desc: 'Für Profis & Teams', feature1: 'Unbegrenzte Credits', feature2: 'Schnellste Verarbeitung', feature3: '4K Export-Qualität', feature4: 'Kein Wasserzeichen', feature5: 'API-Zugriff', feature6: 'Prioritäts-Support', cta: 'Jetzt abonnieren' },
  },
  downloadPage: {
  title: 'Clipop Agent Herunterladen', subtitle: 'Desktop-App für stabile YouTube/Bilibili-Videoverarbeitung', badge: 'Desktop-App', macTitle: 'macOS', macDesc: 'Für Apple Silicon (M1/M2/M3/M4) Macs', downloadButton: 'Für macOS Herunterladen', version: 'Version', fileSize: 'Dateigröße', requirements: 'macOS 12.0 oder neuer', installing: 'Installationsanleitung', step1: 'Klicken Sie auf den Download-Button um die .dmg-Datei zu speichern', step2: 'Doppelklicken Sie auf die heruntergeladene .dmg-Datei', step3: 'Ziehen Sie Clipop Agent in den Programme-Ordner', step4: 'Öffnen Sie Clipop Agent aus den Programmen', notAvailable: 'Download wird vorbereitet, bitte versuchen Sie es später erneut', backToHome: 'Zurück zur Startseite', whyDesktopTitle: 'Warum die Desktop-App nutzen?', features: { stable: { title: 'Stabile Verarbeitung', desc: 'Videos lokal mit maximaler Stabilität verarbeiten' }, fast: { title: 'Schnelle Downloads', desc: 'Videos direkt ohne Browser-Einschränkungen herunterladen' }, local: { title: 'Lokale Verarbeitung', desc: 'Videos auf Ihrem Mac für Datenschutz und Geschwindigkeit verarbeiten' } },
  },
  login: {
  title: 'Anmelden', description: 'Zugriff auf Ihr Konto', emailLabel: 'E-Mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Passwort', passwordPlaceholder: '••••••••', submitButton: 'Anmelden', orContinueWith: 'Oder fortfahren mit', googleButton: 'Mit Google fortfahren', dontHaveAccount: 'Sie haben kein Konto?', signUp: 'Registrieren',
  successTitle: 'Anmeldung erfolgreich!', successMessage: 'Sie haben sich erfolgreich angemeldet als', successDesktopHint: 'Klicken Sie auf den Button unten, um zur Desktop-App zurückzukehren.', returnToDesktop: 'Zurück zu Clipop Agent', desktopNotOpened: 'Wenn sich die Desktop-App nicht automatisch öffnet, stellen Sie bitte sicher, dass Clipop Agent läuft.',
  },
  register: {
  title: 'Konto erstellen', description: 'Starten Sie mit Clipop AI', nameLabel: 'Vollständiger Name', namePlaceholder: 'John Doe', emailLabel: 'E-Mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Passwort', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Passwort bestätigen', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Fortfahren', sendingCode: 'Senden...', codeLabel: 'Verifizierungscode', codePlaceholder: 'Geben Sie den 6-stelligen Code ein', verifyButton: 'Konto erstellen', codeNotReceived: 'Haben Sie den Code nicht erhalten?', resendButton: 'Erneut senden', resendIn: 'Erneut senden', backButton: 'Zurück', googleButton: 'Mit Google fortfahren', alreadyHaveAccount: 'Sie haben bereits ein Konto?', signIn: 'Anmelden',
  errorNameRequired: 'Bitte geben Sie Ihren Namen ein', errorEmailRequired: 'Bitte geben Sie Ihre E-Mail ein', errorPasswordLength: 'Das Passwort muss mindestens 6 Zeichen lang sein', errorPasswordMismatch: 'Die Passwörter stimmen nicht überein', errorEmailExists: 'Diese E-Mail ist bereits registriert. Bitte melden Sie sich an.', errorSendCode: 'Code konnte nicht gesendet werden', errorNetwork: 'Netzwerkfehler. Bitte versuchen Sie es erneut.', errorCodeLength: 'Bitte geben Sie den 6-stelligen Code ein',
  successTitle: 'Konto erstellt!', successMessage: 'Ihr Konto wurde erfolgreich erstellt als', successDesktopHint: 'Klicken Sie auf den Button unten, um zur Desktop-App zurückzukehren.', returnToDesktop: 'Zurück zu Clipop Agent', desktopNotOpened: 'Wenn sich die Desktop-App nicht automatisch öffnet, stellen Sie bitte sicher, dass Clipop Agent läuft.',
  },
  dashboard: { title: 'Dashboard', credits: 'Verfügbare Credits', creditsReset: 'Täglich um 00:00 UTC zurückgesetzt', history: 'Verarbeitungsgeschichte', noVideos: 'Noch keine Videos verarbeitet', startProcessing: 'Video-Verarbeitung starten',
  untitled: 'Unbenannt', clip: 'Clip', clipsCount: 'Highlights', clipsHint: 'Klicken Sie auf einen Clip zum Abspielen',
  desktopLoginDetected: 'Desktop-App-Login erkannt', desktopLoginHint: 'Klicken Sie auf den Button unten, um zu Clipop Agent zurückzukehren', returnToDesktop: 'Zurück zu Clipop Agent',
  welcomeBack: 'Willkommen zurück',
  videosProcessed: 'Verarbeitete Videos', videosProcessedDesc: 'Gesamt verarbeitete Videos', clipsGenerated: 'Generierte Clips', clipsGeneratedDesc: 'Gesamt Highlight-Clips',
  currentPlan: 'Aktueller Plan', upgradePlan: 'Plan upgraden',
  processNewVideo: 'Neues Video verarbeiten', feedback: 'Feedback',
  historyHint: 'Klicken Sie auf abgeschlossene Einträge zum Erweitern und Anzeigen der Highlight-Clips',
  processNewVideoDesc: 'Gehen Sie zur Startseite um ein neues langes Video zu verarbeiten', goToProcessor: 'Zum Video-Prozessor gehen',
  userFeedback: 'Benutzer-Feedback', feedbackDesc: 'Erzählen Sie uns von Funktionen, die Sie verbessern möchten, oder Problemen, auf die Sie gestoßen sind',
  feedbackPlaceholder: 'Geben Sie Ihr Feedback ein (Vorschläge, Bugs, Feature-Wünsche usw.)', feedbackSubmitted: 'Gesendet, danke für Ihr Feedback!',
  submitFeedback: 'Feedback senden', feedbackFailed: 'Feedback konnte nicht gesendet werden',
  statusPending: 'Ausstehend', statusProcessing: 'Verarbeitung', statusCompleted: '✓ Abgeschlossen', statusFailed: 'Fehlgeschlagen',
  },
  admin: { title: 'Admin-Panel', blog: 'Blog-Verwaltung', blogCreate: 'Beitrag erstellen', blogTitle: 'Titel', blogCategory: 'Kategorie', blogContent: 'Inhalt', blogPublish: 'Veröffentlichen', blogSave: 'Entwurf speichern', blogPublished: 'Veröffentlicht', blogDraft: 'Entwurf' },
  blog: { title: 'Blog', readMore: 'Mehr lesen', noPosts: 'Noch keine Beiträge', subtitle: 'Neueste Nachrichten, Tipps und Updates von Clipop AI', views: 'Aufrufe' },
  common: { loading: 'Laden...', error: 'Ein Fehler ist aufgetreten', success: 'Erfolg', cancel: 'Abbrechen', save: 'Speichern', delete: 'Löschen', edit: 'Bearbeiten', search: 'Suchen', ready: 'Bereit', failed: 'Fehlgeschlagen', saving: 'Speichern...', score: 'Punktzahl', user: 'Benutzer' },
};

export default translations;
