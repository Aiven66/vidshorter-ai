import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Inicio', blog: 'Blog', pricing: 'Precios', login: 'Iniciar sesión', register: 'Registrarse', dashboard: 'Panel', admin: 'Panel admin', logout: 'Cerrar sesión', credits: 'Créditos', download: 'Descargar App', light: 'Claro', dark: 'Oscuro',
  },
  footer: {
  desc: 'Transforma tus videos largos en clips cortos atractivos con análisis y edición impulsados por IA.', quickLinks: 'Enlaces Rápidos', legal: 'Legal', privacy: 'Política de Privacidad', terms: 'Términos de Servicio', contact: 'Contacto', rights: 'Todos los derechos reservados.',
  },
  home: {
  hero: {
  badge: 'Procesamiento de Video con IA',
  title: 'Convierte videos largos en virales shorts',
  subtitle: 'Recorte de video impulsado por IA que extrae automáticamente los mejores momentos de tu contenido largo',
  cta: 'Comienza a recortar gratis',
  secondary: 'Ver demo',
  },
  howItWorks: {
  title: 'Cómo Funciona', step1: { title: 'Ingresar Video', desc: 'Pega la URL o sube tu video' }, step2: { title: 'Análisis IA', desc: 'La IA detecta automáticamente los mejores momentos' }, step3: { title: 'Generar Clips', desc: 'Se crean los videos cortos' }, step4: { title: 'Descargar', desc: 'Exporta y comparte en cualquier lugar' },
  },
  features: {
  title: 'Recorte de video IA potente',
  auto: { title: 'Detección automática de highlights', desc: 'La IA analiza tu video e identifica automáticamente los momentos más atractivos' },
  multi: { title: 'Soporte multiplataforma', desc: 'Importa desde YouTube, Bilibili o sube tus propios archivos de video' },
  quick: { title: 'Exportación rápida', desc: 'Descarga tus clips en múltiples formatos, listos para cualquier plataforma social' },
  },
  },
  video: {
  input: { title: 'Video de entrada', url: 'URL del video (YouTube/Bilibili)', upload: 'Subir video', placeholder: 'Pega el enlace del video de YouTube o Bilibili...' },
  process: 'Procesar video', processing: 'Procesando...', analyze: 'Analizar', results: 'Shorts generados', highlights: 'Análisis de highlights', download: 'Descargar', preview: 'Vista previa',
  creditsAvailable: 'créditos disponibles', signInToStart: 'para comenzar a procesar videos', pasteUrlPlaceholder: 'Pega una URL de video (MP4, MOV, AVI...)', useLocalAgent: 'Usar agente local Mac (recomendado para YouTube estable)', uploadLocal: 'Subir un archivo de video local (recomendado cuando el enlace de YouTube está bloqueado)', selectedFile: 'Seleccionado', downloadMacApp: 'Descargar App Mac', viewPricing: 'Ver Precios', clipsReady: 'clips listos', playableClips: 'clips reproducibles', failedClips: 'fallidos', aiFinished: 'La IA ha terminado de seleccionar los momentos más fuertes de tu video fuente.', openToPreview: 'Abre cualquier clip listo para previsualizarlo, o descarga el MP4 directamente.', clipsBeingGenerated: 'Clips en generación:', videoPreviewNotAvailable: 'Vista previa del video no disponible', clipMayStillProcessing: 'El clip puede que aún se esté procesando o haya fallado la generación.', insufficientCredits: 'Créditos insuficientes. Necesitas al menos 30 créditos.', enterVideoUrl: 'Por favor ingresa una URL de video o sube un archivo de video local.', enterValidUrl: 'Por favor ingresa una URL de video http(s) pública válida.',
  stage: {
  init: 'Inicializando...', extractFrames: 'Extrayendo fotogramas del video...', framesExtracted: 'Fotogramas extraídos exitosamente', framesUnavailable: 'Continuando con el análisis', aiAnalysis: 'IA analizando el contenido del video...', analysisComplete: 'Análisis completado', generatingClip: 'Creando clip destacado...', clipReady: 'Clip destacado listo', saving: 'Guardando resultados...', complete: '¡Procesamiento completado!', error: 'Ocurrió un error',
  },
  },
  pricing: {
  title: 'Precios simples y transparentes', subtitle: 'Elige el plan que se adapte a tus necesidades',
  paymentNote: 'Alipay para China · Creem para Internacional (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Todos los pagos están protegidos con cifrado TLS de 256 bits', faqTitle: 'Preguntas Frecuentes', faq: { q1: '¿Qué es un crédito?', a1: 'Cada crédito representa poder de procesamiento. Procesar un clip de video cuesta 30 créditos.', q2: '¿Cómo funciona el reinicio diario de créditos?', a2: 'Los créditos se reinician al límite diario de tu plan a las 00:00 UTC cada día. Los créditos no utilizados no se acumulan.', q3: '¿Puedo actualizar o degradar mi plan?', a3: 'Sí, puedes cambiar tu plan en cualquier momento. Los cambios surten efecto inmediatamente.', q4: '¿Qué fuentes de video son compatibles?', a4: 'Soportamos YouTube, Bilibili y cargas directas de archivos de video (MP4, MOV, AVI).', q5: '¿Qué métodos de pago son compatibles?', a5: 'Alipay para usuarios de China, Creem (Visa, Mastercard, Apple Pay, Google Pay) para usuarios internacionales.' },
  mostPopular: 'Más Popular',
  free: { title: 'Gratis', price: '$0', period: '/mes', desc: 'Perfecto para probar', feature1: '100 créditos diarios', feature2: 'Recorte de video básico', feature3: 'Calidad de exportación 720p', feature4: 'Incluye marca de agua', cta: 'Empezar' },
  starter: { title: 'Inicio', price: '$9.9', period: '/mes', desc: 'Para creadores de contenido', feature1: '500 créditos diarios', feature2: 'Procesamiento prioritario', feature3: 'Calidad de exportación 1080p', feature4: 'Sin marca de agua', feature5: 'Soporte por correo', cta: 'Suscríbete ahora' },
  pro: { title: 'Pro', price: '$19.9', period: '/mes', desc: 'Para profesionales y equipos', feature1: 'Créditos ilimitados', feature2: 'Procesamiento más rápido', feature3: 'Calidad de exportación 4K', feature4: 'Sin marca de agua', feature5: 'Acceso API', feature6: 'Soporte prioritario', cta: 'Suscríbete ahora' },
  },
  downloadPage: {
  title: 'Descargar Clipop Agent', subtitle: 'Aplicación de escritorio para procesamiento estable de videos YouTube/Bilibili', badge: 'App de Escritorio', macTitle: 'macOS', macDesc: 'Para Mac Apple Silicon (M1/M2/M3/M4)', downloadButton: 'Descargar para macOS', version: 'Versión', fileSize: 'Tamaño del archivo', requirements: 'macOS 12.0 o posterior', installing: 'Guía de Instalación', step1: 'Haz clic en el botón de descarga para guardar el archivo .dmg', step2: 'Haz doble clic en el archivo .dmg descargado', step3: 'Arrastra Clipop Agent a la carpeta Aplicaciones', step4: 'Abre Clipop Agent desde Aplicaciones', notAvailable: 'Descarga en preparación, vuelve a consultar más tarde', backToHome: 'Volver al Inicio', whyDesktopTitle: '¿Por Qué Usar la App de Escritorio?', features: { stable: { title: 'Procesamiento Estable', desc: 'Procesa videos localmente con máxima estabilidad' }, fast: { title: 'Descarga Rápida', desc: 'Descarga videos directamente sin limitaciones del navegador' }, local: { title: 'Procesamiento Local', desc: 'Procesa videos en tu Mac para privacidad y velocidad' } },
  },
  login: {
  title: 'Iniciar sesión', description: 'Accede a tu cuenta', emailLabel: 'Correo electrónico', emailPlaceholder: 'you@example.com', passwordLabel: 'Contraseña', passwordPlaceholder: '••••••••', submitButton: 'Iniciar sesión', orContinueWith: 'O continúa con', googleButton: 'Continúa con Google', dontHaveAccount: '¿No tienes una cuenta?', signUp: 'Registrarse',
  successTitle: '¡Inicio de Sesión Exitoso!', successMessage: 'Has iniciado sesión como', successDesktopHint: 'Haz clic en el botón de abajo para volver a la app de escritorio.', returnToDesktop: 'Volver a Clipop Agent', desktopNotOpened: 'Si la app de escritorio no se abre automáticamente, asegúrate de que Clipop Agent esté en ejecución.',
  },
  register: {
  title: 'Crear cuenta', description: 'Empieza con Clipop AI', nameLabel: 'Nombre completo', namePlaceholder: 'John Doe', emailLabel: 'Correo electrónico', emailPlaceholder: 'you@example.com', passwordLabel: 'Contraseña', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Confirmar contraseña', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Continuar', sendingCode: 'Enviando...', codeLabel: 'Código de verificación', codePlaceholder: 'Ingresa el código de 6 dígitos', verifyButton: 'Crear cuenta', codeNotReceived: '¿No recibiste el código?', resendButton: 'Reenviar', resendIn: 'Reenviar en', backButton: 'Volver', googleButton: 'Continúa con Google', alreadyHaveAccount: '¿Ya tienes una cuenta?', signIn: 'Iniciar sesión',
  errorNameRequired: 'Por favor ingresa tu nombre', errorEmailRequired: 'Por favor ingresa tu correo electrónico', errorPasswordLength: 'La contraseña debe tener al menos 6 caracteres', errorPasswordMismatch: 'Las contraseñas no coinciden', errorEmailExists: 'Este correo electrónico ya está registrado. Por favor inicia sesión.', errorSendCode: 'Error al enviar el código', errorNetwork: 'Error de red. Por favor intenta de nuevo.', errorCodeLength: 'Por favor ingresa el código de 6 dígitos',
  successTitle: '¡Cuenta Creada!', successMessage: 'Tu cuenta ha sido creada como', successDesktopHint: 'Haz clic en el botón de abajo para volver a la app de escritorio.', returnToDesktop: 'Volver a Clipop Agent', desktopNotOpened: 'Si la app de escritorio no se abre automáticamente, asegúrate de que Clipop Agent esté en ejecución.',
  },
  dashboard: { title: 'Panel', credits: 'Créditos disponibles', creditsReset: 'Se restablece diariamente a las 00:00 UTC', history: 'Historial de procesamiento', noVideos: 'Aún no hay videos procesados', startProcessing: 'Comienza a procesar videos',
  untitled: 'Sin título', clip: 'Clip', clipsCount: 'destacados', clipsHint: 'Haz clic en cualquier clip para reproducirlo',
  desktopLoginDetected: 'Inicio de Sesión en App de Escritorio Detectado', desktopLoginHint: 'Haz clic en el botón de abajo para volver a Clipop Agent', returnToDesktop: 'Volver a Clipop Agent',
  welcomeBack: 'Bienvenido de nuevo',
  videosProcessed: 'Videos Procesados', videosProcessedDesc: 'Total de videos procesados', clipsGenerated: 'Clips Generados', clipsGeneratedDesc: 'Total de clips destacados',
  currentPlan: 'Plan Actual', upgradePlan: 'Actualizar Plan',
  processNewVideo: 'Procesar Nuevo Video', feedback: 'Comentarios',
  historyHint: 'Haz clic en los registros completados para expandir y ver los clips destacados',
  processNewVideoDesc: 'Ve a la página de inicio para procesar un nuevo video largo', goToProcessor: 'Ir al Procesador de Video',
  userFeedback: 'Comentarios de Usuario', feedbackDesc: 'Cuéntanos sobre las funciones que deseas mejorar o los problemas que encontraste',
  feedbackPlaceholder: 'Ingresa tus comentarios (sugerencias, errores, solicitudes de funciones, etc.)', feedbackSubmitted: '¡Enviado, gracias por tus comentarios!',
  submitFeedback: 'Enviar Comentarios', feedbackFailed: 'Error al enviar comentarios',
  statusPending: 'Pendiente', statusProcessing: 'Procesando', statusCompleted: '✓ Completado', statusFailed: 'Fallido',
  },
  admin: { title: 'Panel admin', blog: 'Gestión de blog', blogCreate: 'Crear publicación', blogTitle: 'Título', blogCategory: 'Categoría', blogContent: 'Contenido', blogPublish: 'Publicar', blogSave: 'Guardar borrador', blogPublished: 'Publicado', blogDraft: 'Borrador' },
  blog: { title: 'Blog', readMore: 'Leer más', noPosts: 'Aún no hay publicaciones', subtitle: 'Últimas noticias, consejos y actualizaciones de Clipop AI', views: 'vistas' },
  common: { loading: 'Cargando...', error: 'Ocurrió un error', success: 'Éxito', cancel: 'Cancelar', save: 'Guardar', delete: 'Eliminar', edit: 'Editar', search: 'Buscar', ready: 'Listo', failed: 'Fallido', saving: 'Guardando...', score: 'Puntuación', user: 'Usuario' },
};

export default translations;
