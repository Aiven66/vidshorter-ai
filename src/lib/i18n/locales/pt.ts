import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Início', blog: 'Blog', pricing: 'Preços', login: 'Entrar', register: 'Cadastrar', dashboard: 'Painel', admin: 'Painel admin', logout: 'Sair', credits: 'Créditos', download: 'Baixar App', light: 'Claro', dark: 'Escuro',
  },
  footer: {
  desc: 'Transforme seus vídeos longos em clipes curtos envolventes com análise e edição impulsionadas por IA.', quickLinks: 'Links Rápidos', legal: 'Legal', privacy: 'Política de Privacidade', terms: 'Termos de Serviço', contact: 'Contato', rights: 'Todos os direitos reservados.',
  },
  home: {
  hero: {
  badge: 'Processamento de Vídeo com IA',
  title: 'Transforme vídeos longos em virais shorts',
  subtitle: 'Recorte de vídeo impulsionado por IA que extrai automaticamente os melhores momentos do seu conteúdo longo',
  cta: 'Comece a recortar gratuitamente',
  secondary: 'Assistir demo',
  },
  howItWorks: {
  title: 'Como Funciona', step1: { title: 'Inserir Vídeo', desc: 'Cole a URL ou faça upload do seu vídeo' }, step2: { title: 'Análise IA', desc: 'A IA detecta automaticamente os melhores momentos' }, step3: { title: 'Gerar Clips', desc: 'Os vídeos curtos são criados' }, step4: { title: 'Baixar', desc: 'Exporte e compartilhe em qualquer lugar' },
  },
  features: {
  title: 'Recorte de vídeo IA poderoso',
  auto: { title: 'Detecção automática de highlights', desc: 'A IA analisa seu vídeo e identifica automaticamente os momentos mais envolventes' },
  multi: { title: 'Suporte multiplataforma', desc: 'Importe do YouTube, Bilibili ou faça upload dos seus próprios arquivos de vídeo' },
  quick: { title: 'Exportação rápida', desc: 'Baixe seus clips em vários formatos, prontos para qualquer plataforma social' },
  },
  },
  video: {
  input: { title: 'Vídeo de entrada', url: 'URL do vídeo (YouTube/Bilibili)', upload: 'Enviar vídeo', placeholder: 'Cole o link do vídeo do YouTube ou Bilibili...' },
  process: 'Processar vídeo', processing: 'Processando...', analyze: 'Analisar', results: 'Shorts gerados', highlights: 'Análise de highlights', download: 'Baixar', preview: 'Pré-visualizar',
  creditsAvailable: 'créditos disponíveis', signInToStart: 'para começar a processar vídeos', pasteUrlPlaceholder: 'Cole uma URL de vídeo (MP4, MOV, AVI...)', useLocalAgent: 'Usar agente local Mac (recomendado para YouTube estável)', uploadLocal: 'Fazer upload de um arquivo de vídeo local (recomendado quando o link do YouTube está bloqueado)', selectedFile: 'Selecionado', downloadMacApp: 'Baixar App Mac', viewPricing: 'Ver Preços', clipsReady: 'clips prontos', playableClips: 'clips reproduzíveis', failedClips: 'falharam', aiFinished: 'A IA terminou de selecionar os momentos mais fortes do seu vídeo fonte.', openToPreview: 'Abra qualquer clip pronto para pré-visualizar, ou baixe o MP4 diretamente.', clipsBeingGenerated: 'Clips sendo gerados:', videoPreviewNotAvailable: 'Pré-visualização do vídeo não disponível', clipMayStillProcessing: 'O clip pode ainda estar processando ou a geração falhou.', insufficientCredits: 'Créditos insuficientes. Você precisa de pelo menos 30 créditos.', enterVideoUrl: 'Por favor insira uma URL de vídeo ou faça upload de um arquivo de vídeo local.', enterValidUrl: 'Por favor insira uma URL de vídeo http(s) pública válida.',
  stage: {
  init: 'Inicializando...', extractFrames: 'Extraindo quadros do vídeo...', framesExtracted: 'Quadros extraídos com sucesso', framesUnavailable: 'Continuando com a análise', aiAnalysis: 'IA analisando o conteúdo do vídeo...', analysisComplete: 'Análise concluída', generatingClip: 'Criando clip destaque...', clipReady: 'Clip destaque pronto', saving: 'Salvando resultados...', complete: 'Processamento concluído!', error: 'Ocorreu um erro',
  },
  },
  pricing: {
  title: 'Preços simples e transparentes', subtitle: 'Escolha o plano que atende às suas necessidades',
  paymentNote: 'Alipay para China · Creem para Internacional (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Todos os pagamentos são protegidos com criptografia TLS de 256 bits', faqTitle: 'Perguntas Frequentes', faq: { q1: 'O que é um crédito?', a1: 'Cada crédito representa poder de processamento. Processar um clip de vídeo custa 30 créditos.', q2: 'Como funciona o reset diário de créditos?', a2: 'Os créditos são redefinidos para o limite diário do seu plano às 00:00 UTC todos os dias. Créditos não utilizados não são acumulados.', q3: 'Posso atualizar ou fazer downgrade do meu plano?', a3: 'Sim, você pode alterar seu plano a qualquer momento. As alterações entram em vigor imediatamente.', q4: 'Quais fontes de vídeo são suportadas?', a4: 'Suportamos YouTube, Bilibili e uploads diretos de arquivos de vídeo (MP4, MOV, AVI).', q5: 'Quais métodos de pagamento são suportados?', a5: 'Alipay para usuários da China, Creem (Visa, Mastercard, Apple Pay, Google Pay) para usuários internacionais.' },
  mostPopular: 'Mais Popular',
  free: { title: 'Gratuito', price: '$0', period: '/mês', desc: 'Perfeito para experimentar', feature1: '100 créditos diários', feature2: 'Recorte de vídeo básico', feature3: 'Qualidade de exportação 720p', feature4: 'Com marca d\'água', cta: 'Começar' },
  starter: { title: 'Iniciante', price: '$9.9', period: '/mês', desc: 'Para criadores de conteúdo', feature1: '500 créditos diários', feature2: 'Processamento prioritário', feature3: 'Qualidade de exportação 1080p', feature4: 'Sem marca d\'água', feature5: 'Suporte por e-mail', cta: 'Inscreva-se agora' },
  pro: { title: 'Pro', price: '$19.9', period: '/mês', desc: 'Para profissionais e equipes', feature1: 'Créditos ilimitados', feature2: 'Processamento mais rápido', feature3: 'Qualidade de exportação 4K', feature4: 'Sem marca d\'água', feature5: 'Acesso à API', feature6: 'Suporte prioritário', cta: 'Inscreva-se agora' },
  },
  downloadPage: {
  title: 'Baixar Clipop Agent', subtitle: 'Aplicativo desktop para processamento estável de vídeos YouTube/Bilibili', badge: 'App Desktop', macTitle: 'macOS', macDesc: 'Para Mac Apple Silicon (M1/M2/M3/M4)', downloadButton: 'Baixar para macOS', version: 'Versão', fileSize: 'Tamanho do arquivo', requirements: 'macOS 12.0 ou posterior', installing: 'Guia de Instalação', step1: 'Clique no botão de download para salvar o arquivo .dmg', step2: 'Clique duas vezes no arquivo .dmg baixado', step3: 'Arraste Clipop Agent para a pasta Aplicativos', step4: 'Abra Clipop Agent dos Aplicativos', notAvailable: 'Download em preparação, verifique novamente mais tarde', backToHome: 'Voltar ao Início', whyDesktopTitle: 'Por Que Usar o App Desktop?', features: { stable: { title: 'Processamento Estável', desc: 'Processe vídeos localmente com máxima estabilidade' }, fast: { title: 'Download Rápido', desc: 'Baixe vídeos diretamente sem limitações do navegador' }, local: { title: 'Processamento Local', desc: 'Processe vídeos no seu Mac para privacidade e velocidade' } },
  },
  login: {
  title: 'Entrar', description: 'Acesse sua conta', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Senha', passwordPlaceholder: '••••••••', submitButton: 'Entrar', orContinueWith: 'Ou continue com', googleButton: 'Continue com o Google', dontHaveAccount: 'Não tem uma conta?', signUp: 'Cadastrar',
  successTitle: 'Login Bem-sucedido!', successMessage: 'Você entrou como', successDesktopHint: 'Clique no botão abaixo para retornar ao app desktop.', returnToDesktop: 'Retornar ao Clipop Agent', desktopNotOpened: 'Se o app desktop não abrir automaticamente, certifique-se de que o Clipop Agent está em execução.',
  },
  register: {
  title: 'Criar conta', description: 'Comece com o Clipop AI', nameLabel: 'Nome completo', namePlaceholder: 'John Doe', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Senha', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Confirmar senha', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Continuar', sendingCode: 'Enviando...', codeLabel: 'Código de verificação', codePlaceholder: 'Digite o código de 6 dígitos', verifyButton: 'Criar conta', codeNotReceived: 'Não recebeu o código?', resendButton: 'Reenviar', resendIn: 'Reenviar em', backButton: 'Voltar', googleButton: 'Continue com o Google', alreadyHaveAccount: 'Já tem uma conta?', signIn: 'Entrar',
  errorNameRequired: 'Por favor insira seu nome', errorEmailRequired: 'Por favor insira seu e-mail', errorPasswordLength: 'A senha deve ter pelo menos 6 caracteres', errorPasswordMismatch: 'As senhas não coincidem', errorEmailExists: 'Este e-mail já está registrado. Por favor faça login.', errorSendCode: 'Falha ao enviar o código', errorNetwork: 'Erro de rede. Por favor tente novamente.', errorCodeLength: 'Por favor digite o código de 6 dígitos',
  successTitle: 'Conta Criada!', successMessage: 'Sua conta foi criada como', successDesktopHint: 'Clique no botão abaixo para retornar ao app desktop.', returnToDesktop: 'Retornar ao Clipop Agent', desktopNotOpened: 'Se o app desktop não abrir automaticamente, certifique-se de que o Clipop Agent está em execução.',
  },
  dashboard: { title: 'Painel', credits: 'Créditos disponíveis', creditsReset: 'Redefinido diariamente às 00:00 UTC', history: 'Histórico de processamento', noVideos: 'Nenhum vídeo processado ainda', startProcessing: 'Comece a processar vídeos',
  untitled: 'Sem título', clip: 'Clip', clipsCount: 'destaques', clipsHint: 'Clique em qualquer clip para reproduzir',
  desktopLoginDetected: 'Login no App Desktop Detectado', desktopLoginHint: 'Clique no botão abaixo para retornar ao Clipop Agent', returnToDesktop: 'Retornar ao Clipop Agent',
  welcomeBack: 'Bem-vindo de volta',
  videosProcessed: 'Vídeos Processados', videosProcessedDesc: 'Total de vídeos processados', clipsGenerated: 'Clips Gerados', clipsGeneratedDesc: 'Total de clips destaque',
  currentPlan: 'Plano Atual', upgradePlan: 'Atualizar Plano',
  processNewVideo: 'Processar Novo Vídeo', feedback: 'Feedback',
  historyHint: 'Clique nos registros concluídos para expandir e ver os clips destaque',
  processNewVideoDesc: 'Vá para a página inicial para processar um novo vídeo longo', goToProcessor: 'Ir para o Processador de Vídeo',
  userFeedback: 'Feedback do Usuário', feedbackDesc: 'Conte-nos sobre recursos que deseja melhorar ou problemas que encontrou',
  feedbackPlaceholder: 'Insira seu feedback (sugestões, bugs, solicitações de recursos, etc.)', feedbackSubmitted: 'Enviado, obrigado pelo seu feedback!',
  submitFeedback: 'Enviar Feedback', feedbackFailed: 'Falha ao enviar feedback',
  statusPending: 'Pendente', statusProcessing: 'Processando', statusCompleted: '✓ Concluído', statusFailed: 'Falhou',
  },
  admin: { title: 'Painel admin', blog: 'Gerenciamento de blog', blogCreate: 'Criar post', blogTitle: 'Título', blogCategory: 'Categoria', blogContent: 'Conteúdo', blogPublish: 'Publicar', blogSave: 'Salvar rascunho', blogPublished: 'Publicado', blogDraft: 'Rascunho' },
  blog: { title: 'Blog', readMore: 'Ler mais', noPosts: 'Nenhum post ainda', subtitle: 'Últimas notícias, dicas e atualizações do Clipop AI', views: 'visualizações' },
  common: { loading: 'Carregando...', error: 'Ocorreu um erro', success: 'Sucesso', cancel: 'Cancelar', save: 'Salvar', delete: 'Excluir', edit: 'Editar', search: 'Pesquisar', ready: 'Pronto', failed: 'Falhou', saving: 'Salvando...', score: 'Pontuação', user: 'Usuário' },
};

export default translations;
