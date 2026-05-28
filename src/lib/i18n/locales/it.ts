import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Home', blog: 'Blog', pricing: 'Prezzi', login: 'Accedi', register: 'Registrati', dashboard: 'Dashboard', admin: 'Pannello admin', logout: 'Esci', credits: 'Crediti', download: 'Scarica App', light: 'Chiaro', dark: 'Scuro',
  },
  footer: {
  desc: 'Trasforma i tuoi video lunghi in clip brevi coinvolgenti con analisi e montaggio AI.', quickLinks: 'Link Rapidi', legal: 'Legale', privacy: 'Informativa sulla Privacy', terms: 'Termini di Servizio', contact: 'Contatti', rights: 'Tutti i diritti riservati.',
  },
  home: {
  hero: {
  badge: 'Elaborazione Video AI',
  title: 'Trasforma video lunghi in virali shorts',
  subtitle: 'Montaggio video AI-powered che estrae automaticamente i momenti migliori dai tuoi contenuti lunghi',
  cta: 'Inizia a montare gratuitamente',
  secondary: 'Guarda la demo',
  },
  howItWorks: {
  title: 'Come Funziona', step1: { title: 'Inserisci Video', desc: 'Incolla URL o carica il tuo video' }, step2: { title: 'Analisi AI', desc: 'AI rileva automaticamente i momenti migliori' }, step3: { title: 'Genera Clip', desc: 'I video brevi vengono creati' }, step4: { title: 'Scarica', desc: 'Esporta e condividi ovunque' },
  },
  features: {
  title: 'Potente montaggio video AI',
  auto: { title: 'Rilevamento automatico degli highlights', desc: 'AI analizza il tuo video e identifica automaticamente i momenti più coinvolgenti' },
  multi: { title: 'Supporto multi-piattaforma', desc: 'Importa da YouTube, Bilibili o carica i tuoi file video' },
  quick: { title: 'Esportazione rapida', desc: 'Scarica i tuoi clip in più formati, pronti per qualsiasi piattaforma sociale' },
  },
  },
  video: {
  input: { title: 'Video di input', url: 'URL video (YouTube/Bilibili)', upload: 'Carica video', placeholder: 'Incolla il link del video YouTube o Bilibili...' },
  process: 'Elabora video', processing: 'Elaborazione...', analyze: 'Analizza', results: 'Shorts generati', highlights: 'Analisi degli highlights', download: 'Scarica', preview: 'Anteprima',
  creditsAvailable: 'crediti disponibili', signInToStart: 'per iniziare a elaborare video', pasteUrlPlaceholder: 'Incolla un URL video (MP4, MOV, AVI...)', useLocalAgent: 'Usa agente locale Mac (consigliato per YouTube stabile)', uploadLocal: 'Carica un file video locale (consigliato quando il link YouTube è bloccato)', selectedFile: 'Selezionato', downloadMacApp: 'Scarica App Mac', viewPricing: 'Vedi Prezzi', clipsReady: 'clip pronte', playableClips: 'clip riproducibili', failedClips: 'fallite', aiFinished: 'AI ha terminato la selezione dei momenti migliori dal tuo video sorgente.', openToPreview: 'Apri qualsiasi clip pronta per l\'anteprima, o scarica l\'MP4 direttamente.', clipsBeingGenerated: 'Clip in fase di generazione:', videoPreviewNotAvailable: 'Anteprima video non disponibile', clipMayStillProcessing: 'La clip potrebbe essere ancora in elaborazione o la generazione è fallita.', insufficientCredits: 'Crediti insufficienti. Hai bisogno di almeno 30 crediti.', enterVideoUrl: 'Inserisci un URL video o carica un file video locale.', enterValidUrl: 'Inserisci un URL video http(s) pubblico valido.',
  stage: {
  init: 'Inizializzazione...', extractFrames: 'Estrazione fotogrammi video...', framesExtracted: 'Fotogrammi estratti con successo', framesUnavailable: 'Proseguimento con l\'analisi', aiAnalysis: 'AI sta analizzando il contenuto video...', analysisComplete: 'Analisi completata', generatingClip: 'Creazione clip highlight...', clipReady: 'Clip highlight pronta', saving: 'Salvataggio risultati...', complete: 'Elaborazione completata!', error: 'Si è verificato un errore',
  },
  },
  pricing: {
  title: 'Prezzi semplici e trasparenti', subtitle: 'Scegli il piano che si adatta alle tue esigenze',
  paymentNote: 'Alipay per Cina · Creem per Internazionale (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Tutti i pagamenti sono protetti con crittografia TLS a 256 bit', faqTitle: 'Domande Frequenti', faq: { q1: 'Cos\'è un credito?', a1: 'Ogni credito rappresenta potenza di elaborazione. Elaborare un clip video costa 30 crediti.', q2: 'Come funziona il reset giornaliero dei crediti?', a2: 'I crediti vengono reimpostati al limite giornaliero del tuo piano alle 00:00 UTC ogni giorno. I crediti non utilizzati non vengono accumulati.', q3: 'Posso aggiornare o downgrade il mio piano?', a3: 'Sì, puoi cambiare il tuo piano in qualsiasi momento. Le modifiche hanno effetto immediato.', q4: 'Quali fonti video sono supportate?', a4: 'Supportiamo YouTube, Bilibili e caricamenti diretti di file video (MP4, MOV, AVI).', q5: 'Quali metodi di pagamento sono supportati?', a5: 'Alipay per utenti Cina, Creem (Visa, Mastercard, Apple Pay, Google Pay) per utenti internazionali.' },
  mostPopular: 'Più Popolare',
  free: { title: 'Gratuito', price: '$0', period: '/mese', desc: 'Perfetto per provare', feature1: '100 crediti al giorno', feature2: 'Montaggio video base', feature3: 'Qualità esportazione 720p', feature4: 'Inclusa filigrana', cta: 'Inizia' },
  starter: { title: 'Starter', price: '$9.9', period: '/mese', desc: 'Per i creator di contenuti', feature1: '500 crediti al giorno', feature2: 'Elaborazione prioritaria', feature3: 'Qualità esportazione 1080p', feature4: 'Senza filigrana', feature5: 'Supporto email', cta: 'Iscriviti ora' },
  pro: { title: 'Pro', price: '$19.9', period: '/mese', desc: 'Per professionisti e team', feature1: 'Crediti illimitati', feature2: 'Elaborazione più veloce', feature3: 'Qualità esportazione 4K', feature4: 'Senza filigrana', feature5: 'Accesso API', feature6: 'Supporto prioritario', cta: 'Iscriviti ora' },
  },
  downloadPage: {
  title: 'Scarica Clipop Agent', subtitle: 'App desktop per elaborazione stabile di video YouTube/Bilibili', badge: 'App Desktop', macTitle: 'macOS', macDesc: 'Per Mac Apple Silicon (M1/M2/M3/M4)', downloadButton: 'Scarica per macOS', version: 'Versione', fileSize: 'Dimensione file', requirements: 'macOS 12.0 o successivo', installing: 'Guida all\'Installazione', step1: 'Clicca il pulsante di download per salvare il file .dmg', step2: 'Fai doppio clic sul file .dmg scaricato', step3: 'Trascina Clipop Agent nella cartella Applicazioni', step4: 'Apri Clipop Agent dalle Applicazioni', notAvailable: 'Download in preparazione, riprova più tardi', backToHome: 'Torna alla Home', whyDesktopTitle: 'Perché Usare l\'App Desktop?', features: { stable: { title: 'Elaborazione Stabile', desc: 'Elabora video localmente con massima stabilità' }, fast: { title: 'Download Rapido', desc: 'Scarica video direttamente senza limitazioni del browser' }, local: { title: 'Elaborazione Locale', desc: 'Elabora video sul tuo Mac per privacy e velocità' } },
  },
  login: {
  title: 'Accedi', description: 'Accedi al tuo account', emailLabel: 'Email', emailPlaceholder: 'you@example.com', passwordLabel: 'Password', passwordPlaceholder: '••••••••', submitButton: 'Accedi', orContinueWith: 'Oppure continua con', googleButton: 'Continua con Google', dontHaveAccount: 'Non hai un account?', signUp: 'Registrati',
  successTitle: 'Accesso Riuscito!', successMessage: 'Hai effettuato l\'accesso come', successDesktopHint: 'Clicca il pulsante qui sotto per tornare all\'app desktop.', returnToDesktop: 'Torna a Clipop Agent', desktopNotOpened: 'Se l\'app desktop non si apre automaticamente, assicurati che Clipop Agent sia in esecuzione.',
  },
  register: {
  title: 'Crea account', description: 'Inizia con Clipop AI', nameLabel: 'Nome completo', namePlaceholder: 'John Doe', emailLabel: 'Email', emailPlaceholder: 'you@example.com', passwordLabel: 'Password', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Conferma password', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Continua', sendingCode: 'Invio...', codeLabel: 'Codice di verifica', codePlaceholder: 'Inserisci il codice a 6 cifre', verifyButton: 'Crea account', codeNotReceived: 'Non hai ricevuto il codice?', resendButton: 'Invia di nuovo', resendIn: 'Invia di nuovo in', backButton: 'Indietro', googleButton: 'Continua con Google', alreadyHaveAccount: 'Hai già un account?', signIn: 'Accedi',
  errorNameRequired: 'Inserisci il tuo nome', errorEmailRequired: 'Inserisci la tua email', errorPasswordLength: 'La password deve essere di almeno 6 caratteri', errorPasswordMismatch: 'Le password non corrispondono', errorEmailExists: 'Questa email è già registrata. Effettua l\'accesso.', errorSendCode: 'Invio del codice fallito', errorNetwork: 'Errore di rete. Riprova.', errorCodeLength: 'Inserisci il codice a 6 cifre',
  successTitle: 'Account Creato!', successMessage: 'Il tuo account è stato creato come', successDesktopHint: 'Clicca il pulsante qui sotto per tornare all\'app desktop.', returnToDesktop: 'Torna a Clipop Agent', desktopNotOpened: 'Se l\'app desktop non si apre automaticamente, assicurati che Clipop Agent sia in esecuzione.',
  },
  dashboard: { title: 'Dashboard', credits: 'Crediti disponibili', creditsReset: 'Reimpostato ogni giorno alle 00:00 UTC', history: 'Cronologia delle elaborazioni', noVideos: 'Nessun video elaborato ancora', startProcessing: 'Inizia l\'elaborazione dei video',
  untitled: 'Senza titolo', clip: 'Clip', clipsCount: 'highlight', clipsHint: 'Clicca su qualsiasi clip per riprodurla',
  desktopLoginDetected: 'Accesso App Desktop Rilevato', desktopLoginHint: 'Clicca il pulsante qui sotto per tornare a Clipop Agent', returnToDesktop: 'Torna a Clipop Agent',
  welcomeBack: 'Bentornato',
  videosProcessed: 'Video Elaborati', videosProcessedDesc: 'Totale video elaborati', clipsGenerated: 'Clip Generate', clipsGeneratedDesc: 'Totale clip highlight',
  currentPlan: 'Piano Attuale', upgradePlan: 'Aggiorna Piano',
  processNewVideo: 'Elabora Nuovo Video', feedback: 'Feedback',
  historyHint: 'Clicca sui record completati per espandere e visualizzare le clip highlight',
  processNewVideoDesc: 'Vai alla homepage per elaborare un nuovo video lungo', goToProcessor: 'Vai al Processore Video',
  userFeedback: 'Feedback Utente', feedbackDesc: 'Raccontaci le funzionalità che vuoi migliorare o i problemi riscontrati',
  feedbackPlaceholder: 'Inserisci il tuo feedback (suggerimenti, bug, richieste di funzionalità, ecc.)', feedbackSubmitted: 'Inviato, grazie per il tuo feedback!',
  submitFeedback: 'Invia Feedback', feedbackFailed: 'Invio feedback fallito',
  statusPending: 'In attesa', statusProcessing: 'Elaborazione', statusCompleted: '✓ Completato', statusFailed: 'Fallito',
  },
  admin: { title: 'Pannello admin', blog: 'Gestione blog', blogCreate: 'Crea post', blogTitle: 'Titolo', blogCategory: 'Categoria', blogContent: 'Contenuto', blogPublish: 'Pubblica', blogSave: 'Salva bozza', blogPublished: 'Pubblicato', blogDraft: 'Bozza' },
  blog: { title: 'Blog', readMore: 'Leggi di più', noPosts: 'Nessun post ancora', subtitle: 'Ultime notizie, suggerimenti e aggiornamenti da Clipop AI', views: 'visualizzazioni' },
  common: { loading: 'Caricamento...', error: 'Si è verificato un errore', success: 'Successo', cancel: 'Annulla', save: 'Salva', delete: 'Elimina', edit: 'Modifica', search: 'Cerca', ready: 'Pronto', failed: 'Fallito', saving: 'Salvataggio...', score: 'Punteggio', user: 'Utente' },
};

export default translations;
