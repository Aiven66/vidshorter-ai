import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Accueil', blog: 'Blog', pricing: 'Tarifs', login: 'Connexion', register: 'Inscription', dashboard: 'Tableau de bord', admin: 'Panel admin', logout: 'Déconnexion', credits: 'Crédits', download: 'Télécharger l\'App', light: 'Clair', dark: 'Sombre',
  },
  footer: {
  desc: 'Transformez vos vidéos longues en clips courts captivants grâce à l\'analyse et au montage alimentés par l\'IA.', quickLinks: 'Liens rapides', legal: 'Mentions légales', privacy: 'Politique de confidentialité', terms: 'Conditions d\'utilisation', contact: 'Contact', rights: 'Tous droits réservés.',
  },
  home: {
  hero: {
  badge: 'Traitement vidéo par IA',
  title: 'Transformez des vidéos longues en courts-métrages viraux',
  subtitle: 'Montage vidéo alimenté par l\'IA qui extrait automatiquement les meilleurs moments de vos contenus longs',
  cta: 'Commencer le montage gratuitement',
  secondary: 'Voir la démo',
  },
  howItWorks: {
  title: 'Comment ça marche', step1: { title: 'Vidéo d\'entrée', desc: 'Collez l\'URL ou téléchargez votre vidéo' }, step2: { title: 'Analyse IA', desc: 'L\'IA détecte automatiquement les points forts' }, step3: { title: 'Générer des clips', desc: 'Des vidéos courtes sont créées' }, step4: { title: 'Télécharger', desc: 'Exportez et partagez partout' },
  },
  features: {
  title: 'Montage vidéo IA puissant',
  auto: { title: 'Détection automatique des points forts', desc: 'L\'IA analyse votre vidéo et identifie automatiquement les moments les plus engageants' },
  multi: { title: 'Support multi-plateformes', desc: 'Importer depuis YouTube, Bilibili ou télécharger vos propres fichiers vidéo' },
  quick: { title: 'Export rapide', desc: 'Téléchargez vos montages dans plusieurs formats, prêts pour n\'importe quelle plateforme sociale' },
  },
  },
  video: {
  input: { title: 'Vidéo d\'entrée', url: 'URL de la vidéo (YouTube/Bilibili)', upload: 'Télécharger une vidéo', placeholder: 'Coller le lien de la vidéo YouTube ou Bilibili...' },
  process: 'Traiter la vidéo', processing: 'Traitement...', analyze: 'Analyser', results: 'Shorts générés', highlights: 'Analyse des points forts', download: 'Télécharger', preview: 'Aperçu',
  creditsAvailable: 'crédits disponibles', signInToStart: 'pour commencer à traiter des vidéos', pasteUrlPlaceholder: 'Collez une URL vidéo (MP4, MOV, AVI...)', useLocalAgent: 'Utiliser l\'agent Mac local (recommandé pour YouTube stable)', uploadLocal: 'Télécharger un fichier vidéo local (recommandé si le lien YouTube est bloqué)', selectedFile: 'Sélectionné', downloadMacApp: 'Télécharger l\'App Mac', viewPricing: 'Voir les tarifs', clipsReady: 'clips prêts', playableClips: 'clips lisibles', failedClips: 'échoués', aiFinished: 'L\'IA a terminé la sélection des moments les plus forts de votre vidéo source.', openToPreview: 'Ouvrez un clip prêt pour le prévisualiser ou téléchargez directement le MP4.', clipsBeingGenerated: 'Clips en cours de génération :', videoPreviewNotAvailable: 'Aperçu vidéo non disponible', clipMayStillProcessing: 'Le clip est peut-être encore en cours de traitement ou sa génération a échoué.', insufficientCredits: 'Crédits insuffisants. Vous avez besoin d\'au moins 30 crédits.', enterVideoUrl: 'Veuillez entrer une URL vidéo ou télécharger un fichier vidéo local.', enterValidUrl: 'Veuillez entrer une URL vidéo http(s) publique valide.',
  stage: {
  init: 'Initialisation...', extractFrames: 'Extraction des images vidéo...', framesExtracted: 'Images extraites avec succès', framesUnavailable: 'Poursuite de l\'analyse', aiAnalysis: 'L\'IA analyse le contenu vidéo...', analysisComplete: 'Analyse terminée', generatingClip: 'Création du clip highlight...', clipReady: 'Clip highlight prêt', saving: 'Enregistrement des résultats...', complete: 'Traitement terminé !', error: 'Erreur survenue',
  },
  },
  pricing: {
  title: 'Tarifs simples et transparents', subtitle: 'Choisissez le plan qui correspond à vos besoins',
  paymentNote: 'Alipay pour la Chine · Creem pour l\'International (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Tous les paiements sont sécurisés avec un chiffrement TLS 256 bits', faqTitle: 'Questions fréquentes', faq: { q1: 'Qu\'est-ce qu\'un crédit ?', a1: 'Chaque crédit représente une puissance de traitement. Le traitement d\'un clip vidéo coûte 30 crédits.', q2: 'Comment fonctionne la réinitialisation quotidienne des crédits ?', a2: 'Les crédits sont réinitialisés à la limite quotidienne de votre plan à 00h00 UTC chaque jour. Les crédits non utilisés ne sont pas reportés.', q3: 'Puis-je mettre à niveau ou rétrograder mon plan ?', a3: 'Oui, vous pouvez changer de plan à tout moment. Les modifications prennent effet immédiatement.', q4: 'Quelles sources vidéo sont prises en charge ?', a4: 'Nous prenons en charge YouTube, Bilibili et les téléchargements directs de fichiers vidéo (MP4, MOV, AVI).', q5: 'Quelles méthodes de paiement sont prises en charge ?', a5: 'Alipay pour les utilisateurs chinois, Creem (Visa, Mastercard, Apple Pay, Google Pay) pour les utilisateurs internationaux.' },
  mostPopular: 'Le plus populaire',
  free: { title: 'Gratuit', price: '$0', period: '/mois', desc: 'Parfait pour essayer', feature1: '100 crédits par jour', feature2: 'Montage vidéo de base', feature3: 'Qualité d\'export 720p', feature4: 'Filigrane inclus', cta: 'Commencer' },
  starter: { title: 'Démarrage', price: '$9.9', period: '/mois', desc: 'Pour les créateurs de contenu', feature1: '500 crédits par jour', feature2: 'Traitement prioritaire', feature3: 'Qualité d\'export 1080p', feature4: 'Sans filigrane', feature5: 'Support par e-mail', cta: 'S\'abonner maintenant' },
  pro: { title: 'Pro', price: '$19.9', period: '/mois', desc: 'Pour les professionnels et les équipes', feature1: 'Crédits illimités', feature2: 'Traitement le plus rapide', feature3: 'Qualité d\'export 4K', feature4: 'Sans filigrane', feature5: 'Accès API', feature6: 'Support prioritaire', cta: 'S\'abonner maintenant' },
  },
  downloadPage: {
  title: 'Télécharger Clipop Agent', subtitle: 'Application de bureau pour un traitement vidéo YouTube/Bilibili stable', badge: 'Application de bureau', macTitle: 'macOS', macDesc: 'Pour Mac Apple Silicon (M1/M2/M3/M4)', downloadButton: 'Télécharger pour macOS', version: 'Version', fileSize: 'Taille du fichier', requirements: 'macOS 12.0 ou ultérieur', installing: 'Guide d\'installation', step1: 'Cliquez sur le bouton de téléchargement pour enregistrer le fichier .dmg', step2: 'Double-cliquez sur le fichier .dmg téléchargé', step3: 'Glissez Clipop Agent dans le dossier Applications', step4: 'Ouvrez Clipop Agent depuis les Applications', notAvailable: 'Le téléchargement est en cours de préparation, veuillez réessayer plus tard', backToHome: 'Retour à l\'accueil', whyDesktopTitle: 'Pourquoi utiliser l\'application de bureau ?', features: { stable: { title: 'Traitement stable', desc: 'Traitez les vidéos localement avec une stabilité maximale' }, fast: { title: 'Téléchargements rapides', desc: 'Téléchargez les vidéos directement sans les limitations du navigateur' }, local: { title: 'Traitement local', desc: 'Traitez les vidéos sur votre Mac pour la confidentialité et la vitesse' } },
  },
  login: {
  title: 'Se connecter', description: 'Accéder à votre compte', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Mot de passe', passwordPlaceholder: '••••••••', submitButton: 'Se connecter', orContinueWith: 'Ou continuer avec', googleButton: 'Continuer avec Google', dontHaveAccount: 'Vous n\'avez pas de compte ?', signUp: 'S\'inscrire',
  successTitle: 'Connexion réussie !', successMessage: 'Vous vous êtes connecté avec succès en tant que', successDesktopHint: 'Cliquez sur le bouton ci-dessous pour retourner à l\'application de bureau.', returnToDesktop: 'Retourner à Clipop Agent', desktopNotOpened: 'Si l\'application de bureau ne s\'ouvre pas automatiquement, veuillez vous assurer que Clipop Agent est en cours d\'exécution.',
  },
  register: {
  title: 'Créer un compte', description: 'Commencer avec Clipop AI', nameLabel: 'Nom complet', namePlaceholder: 'John Doe', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Mot de passe', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Confirmer le mot de passe', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Continuer', sendingCode: 'Envoi...', codeLabel: 'Code de vérification', codePlaceholder: 'Entrez le code à 6 chiffres', verifyButton: 'Créer un compte', codeNotReceived: 'Vous n\'avez pas reçu le code ?', resendButton: 'Renvoyer', resendIn: 'Renvoyer dans', backButton: 'Retour', googleButton: 'Continuer avec Google', alreadyHaveAccount: 'Vous avez déjà un compte ?', signIn: 'Se connecter',
  errorNameRequired: 'Veuillez entrer votre nom', errorEmailRequired: 'Veuillez entrer votre e-mail', errorPasswordLength: 'Le mot de passe doit comporter au moins 6 caractères', errorPasswordMismatch: 'Les mots de passe ne correspondent pas', errorEmailExists: 'Cet e-mail est déjà enregistré. Veuillez vous connecter.', errorSendCode: 'Échec de l\'envoi du code', errorNetwork: 'Erreur réseau. Veuillez réessayer.', errorCodeLength: 'Veuillez entrer le code à 6 chiffres',
  successTitle: 'Compte créé !', successMessage: 'Votre compte a été créé avec succès en tant que', successDesktopHint: 'Cliquez sur le bouton ci-dessous pour retourner à l\'application de bureau.', returnToDesktop: 'Retourner à Clipop Agent', desktopNotOpened: 'Si l\'application de bureau ne s\'ouvre pas automatiquement, veuillez vous assurer que Clipop Agent est en cours d\'exécution.',
  },
  dashboard: { title: 'Tableau de bord', credits: 'Crédits disponibles', creditsReset: 'Réinitialisé quotidiennement à 00:00 UTC', history: 'Historique des traitements', noVideos: 'Aucune vidéo traitée pour le moment', startProcessing: 'Commencer le traitement de vidéos',
  untitled: 'Sans titre', clip: 'Clip', clipsCount: 'highlights', clipsHint: 'Cliquez sur un clip pour le lire',
  desktopLoginDetected: 'Connexion à l\'application de bureau détectée', desktopLoginHint: 'Cliquez sur le bouton ci-dessous pour retourner à Clipop Agent', returnToDesktop: 'Retourner à Clipop Agent',
  welcomeBack: 'Bon retour',
  videosProcessed: 'Vidéos traitées', videosProcessedDesc: 'Total des vidéos traitées', clipsGenerated: 'Clips générés', clipsGeneratedDesc: 'Total des clips highlights',
  currentPlan: 'Plan actuel', upgradePlan: 'Mettre à niveau',
  processNewVideo: 'Traiter une nouvelle vidéo', feedback: 'Commentaires',
  historyHint: 'Cliquez sur les enregistrements terminés pour développer et voir les clips highlights',
  processNewVideoDesc: 'Allez à la page d\'accueil pour traiter une nouvelle vidéo longue', goToProcessor: 'Aller au processeur vidéo',
  userFeedback: 'Commentaires des utilisateurs', feedbackDesc: 'Dites-nous les fonctionnalités que vous souhaitez améliorer ou les problèmes rencontrés',
  feedbackPlaceholder: 'Entrez vos commentaires (suggestions, bugs, demandes de fonctionnalités, etc.)', feedbackSubmitted: 'Soumis, merci pour vos commentaires !',
  submitFeedback: 'Soumettre les commentaires', feedbackFailed: 'Échec de l\'envoi des commentaires',
  statusPending: 'En attente', statusProcessing: 'Traitement', statusCompleted: '✓ Terminé', statusFailed: 'Échoué',
  },
  admin: { title: 'Panel admin', blog: 'Gestion du blog', blogCreate: 'Créer un article', blogTitle: 'Titre', blogCategory: 'Catégorie', blogContent: 'Contenu', blogPublish: 'Publier', blogSave: 'Enregistrer le brouillon', blogPublished: 'Publié', blogDraft: 'Brouillon' },
  blog: { title: 'Blog', readMore: 'Lire la suite', noPosts: 'Aucun article pour le moment', subtitle: 'Dernières nouvelles, conseils et mises à jour de Clipop AI', views: 'vues' },
  common: { loading: 'Chargement...', error: 'Une erreur est survenue', success: 'Succès', cancel: 'Annuler', save: 'Enregistrer', delete: 'Supprimer', edit: 'Modifier', search: 'Rechercher', ready: 'Prêt', failed: 'Échoué', saving: 'Enregistrement...', score: 'Score', user: 'Utilisateur' },
};

export default translations;
