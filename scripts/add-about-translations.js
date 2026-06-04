const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../src/lib/i18n/locales');

// About page translations for each language
const aboutTranslations = {
  en: {
    about: {
      hero: {
        badge: 'AI-Powered Video Innovation',
        title: 'Transform Your Video Content',
        subtitle: 'Clipop AI is the leading AI-powered video clipping platform that transforms long-form videos into engaging short-form content. Used by over 50,000 creators worldwide to maximize their content reach and engagement.',
        getStarted: 'Get Started Free',
      },
      stats: {
        activeUsers: 'Active Users',
        videosProcessed: 'Videos Processed',
        userSatisfaction: 'User Satisfaction',
        languages: 'Languages',
      },
      productVision: {
        title: 'Our Product Vision',
        subtitle: 'Clipop AI empowers content creators to unlock the full potential of their video content through intelligent automation.',
        futureTitle: 'The Future of Video Content Creation',
        futurePara1: "In today's fast-paced digital landscape, short-form video content dominates social platforms. However, creating engaging short clips from long-form content is time-consuming and resource-intensive.",
        futurePara2: 'Clipop AI solves this problem by leveraging cutting-edge artificial intelligence to automatically identify the most engaging moments in your videos, saving you hours of manual editing while ensuring high-quality results.',
        benefits: [
          'Save 80% of your editing time',
          'Increase content output by 3x',
          'Boost engagement rates',
          'Reach wider audiences',
        ],
      },
      features: {
        title: 'Core Features',
        subtitle: 'Everything you need to transform your video content efficiently',
        aiIntelligence: { title: 'AI-Powered Intelligence', desc: 'Advanced AI algorithms automatically analyze video content to identify the most engaging moments, saving creators hours of manual editing.' },
        fastProcessing: { title: 'Lightning Fast Processing', desc: 'Process long-form videos in minutes, not hours. Our optimized pipeline delivers highlights instantly.' },
        multiPlatform: { title: 'Multi-Platform Support', desc: 'Import from YouTube, Bilibili, or upload local files. Export optimized clips for TikTok, YouTube Shorts, Instagram, and more.' },
        privacyFirst: { title: 'Privacy First', desc: 'Your content stays yours. We never store your original videos and process everything securely.' },
      },
      values: {
        title: 'Our Core Values',
        subtitle: 'What drives us to deliver the best experience for our users',
        userCentric: { title: 'User-Centric Innovation', desc: 'We build tools that solve real problems for content creators worldwide.' },
        continuous: { title: 'Continuous Improvement', desc: 'Regular updates based on user feedback to enhance your experience.' },
        community: { title: 'Global Community', desc: 'Supporting creators in 32 languages across every continent.' },
      },
      geo: {
        title: 'Global Reach, Local Impact',
        subtitle: 'Serving creators across the globe with localized experiences',
        seo: {
          title: 'SEO Optimization',
          desc: 'Our platform is optimized for search engines, helping your content get discovered. AI-generated metadata and tags improve discoverability across platforms.',
        },
        multiLang: {
          title: 'Multi-Language Support',
          desc: 'Available in 32 languages worldwide. Localized interfaces and support ensure creators everywhere can use Clipop AI in their native language.',
        },
        regional: {
          title: 'Regional Optimization',
          desc: 'Optimized for regional content platforms including YouTube, Bilibili, TikTok, and more. Tailored export settings for each market.',
        },
      },
      cta: {
        title: 'Ready to Transform Your Videos?',
        subtitle: 'Join 50,000+ creators who are using Clipop AI to maximize their content potential',
        button: 'Get Started for Free',
      },
    },
  },
  zh: {
    about: {
      hero: {
        badge: 'AI 驱动的视频创新',
        title: '改变您的视频内容',
        subtitle: 'Clipop AI 是领先的 AI 驱动视频剪辑平台，将长视频转换为引人入胜的短视频内容。全球超过 50,000 名创作者使用，最大化内容传播和参与度。',
        getStarted: '免费开始',
      },
      stats: {
        activeUsers: '活跃用户',
        videosProcessed: '处理视频',
        userSatisfaction: '用户满意度',
        languages: '语言支持',
      },
      productVision: {
        title: '我们的产品愿景',
        subtitle: 'Clipop AI 赋能内容创作者，通过智能自动化释放视频内容的全部潜力。',
        futureTitle: '视频内容创作的未来',
        futurePara1: '在当今快节奏的数字世界中，短视频内容占据了社交平台的主导地位。然而，从长视频制作引人入胜的短视频片段既耗时又费力。',
        futurePara2: 'Clipop AI 通过利用最先进的人工智能技术解决了这个问题，自动识别视频中最吸引人的时刻，为您节省数小时的手动编辑时间，同时确保高质量的结果。',
        benefits: [
          '节省 80% 的编辑时间',
          '内容产出提升 3 倍',
          '提高参与率',
          '覆盖更广泛的受众',
        ],
      },
      features: {
        title: '核心功能',
        subtitle: '高效转换视频内容所需的一切',
        aiIntelligence: { title: 'AI 智能分析', desc: '先进的 AI 算法自动分析视频内容，识别最吸引人的时刻，为创作者节省数小时的手动编辑。' },
        fastProcessing: { title: '极速处理', desc: '几分钟内完成长视频处理，而不是数小时。我们优化的管道即时交付精彩片段。' },
        multiPlatform: { title: '多平台支持', desc: '从 YouTube、B站 导入或上传本地文件。为 TikTok、YouTube Shorts、Instagram 等平台导出优化的片段。' },
        privacyFirst: { title: '隐私优先', desc: '您的内容只属于您。我们从不存储原始视频，所有处理都安全进行。' },
      },
      values: {
        title: '我们的核心价值观',
        subtitle: '驱动我们为用户提供最佳体验的动力',
        userCentric: { title: '用户至上的创新', desc: '我们构建的工具解决全球内容创作者的实际问题。' },
        continuous: { title: '持续改进', desc: '基于用户反馈的定期更新，提升您的体验。' },
        community: { title: '全球社区', desc: '支持全球各大洲的 32 种语言的创作者。' },
      },
      geo: {
        title: '全球覆盖，本地影响',
        subtitle: '通过本地化体验服务全球创作者',
        seo: {
          title: 'SEO 优化',
          desc: '我们的平台针对搜索引擎进行了优化，帮助您的内容被发现。AI 生成的元数据和标签提高了在各个平台的可发现性。',
        },
        multiLang: {
          title: '多语言支持',
          desc: '全球支持 32 种语言。本地化界面和支持确保各地创作者都能以母语使用 Clipop AI。',
        },
        regional: {
          title: '区域优化',
          desc: '针对 YouTube、B站、TikTok 等区域内容平台进行了优化。为每个市场量身定制的导出设置。',
        },
      },
      cta: {
        title: '准备好改变您的视频了吗？',
        subtitle: '加入 50,000+ 使用 Clipop AI 最大化内容潜力的创作者',
        button: '免费开始使用',
      },
    },
  },
  ja: {
    about: {
      hero: {
        badge: 'AI驅動の動画イノベーション',
        title: '動画コンテンツを変革',
        subtitle: 'Clipop AIは、的长編動画を魅力的なショートコンテンツに変換する業界最先端のAI驅動動画クリッププラットフォームです。世界中で50,000人以上のクリエイターが使用',
        getStarted: '無料で始める',
      },
      stats: {
        activeUsers: 'アクティブユーザー',
        videosProcessed: '処理済み動画',
        userSatisfaction: 'ユーザー満足度',
        languages: '言語対応',
      },
      productVision: {
        title: 'プロダクトビジョン',
        subtitle: 'Clipop AIは、スマートな自動化を通じて動画コンテンツの可能性を最大限度地引き出すようコンテンツクリエイターを支援します',
        futureTitle: '動画コンテンツ創作の未来',
        futurePara1: '今日のペースの速いデジタル世界では、ショートフォームの動画コンテンツがソーシャルプラットフォームを支配しています。しかし、长的動画から魅力的なショートクリップを作成するのは時間とリソースがかかる作業です。',
        futurePara2: 'Clipop AIは、最先端のAI技術を活用して、视频の中で最も魅力的な瞬間を自動的に識別することで、この問題を解決します。数時間の手動編集を節約しながら、高品質な結果を保証します。',
        benefits: [
          '編集時間の80%を節約',
          'コンテンツ出力を3倍に増加',
          'エンゲージメント率を向上',
          'より広い層にリーチ',
        ],
      },
      features: {
        title: 'コア機能',
        subtitle: '動画コンテンツを変革するために必要なすべて',
        aiIntelligence: { title: 'AI驅動インテリジェンス', desc: '高度なAIアルゴリズムが動画コンテンツを自動的に分析し、最も魅力的な瞬間を特定、クリエイターの手動編集を数時間節約します。' },
        fastProcessing: { title: '超高速処理', desc: '長編動画を数分で処理。我们的最適化されたパイプラインがハイライトを即座に配信します。' },
        multiPlatform: { title: 'マルチプラットフォームサポート', desc: 'YouTube、BiliBiliからインポートまたはローカルファイルをアップロード。TikTok、YouTube Shorts、Instagramなどの最適化されたクリップをエクスポート。' },
        privacyFirst: { title: 'プライバシー優先', desc: 'あなたのコンテンツはあなただけのもの。元の動画を保存することは決してなく、すべて安全に処理されます。' },
      },
      values: {
        title: '私たちのコアバリュー',
        subtitle: 'ユーザーに最高の体験を提供することを驱动する要因',
        userCentric: { title: 'ユーザー中心のイノベーション', desc: '世界中のコンテンツクリエイターの実際の問題を解決するツールを構築します。' },
        continuous: { title: '継続的な改善', desc: 'ユーザーフィードバックに基づく定期的なアップデートで体験を向上。' },
        community: { title: 'グローバルコミュニティ', desc: '世界中の6大陸で32の言語をサポートするクリエイター支援。' },
      },
      geo: {
        title: 'グローバルリーチ、ローカルインパクト',
        subtitle: 'Localized experiencesで世界中のクリエイター提供服务',
        seo: {
          title: 'SEO最適化',
          desc: '私たちのプラットフォームは検索エンジンに最適化されており、あなたのコンテンツの発見を支援します。AI生成のメタデータとタグが各プラットフォームでの検出可能性を改善します。',
        },
        multiLang: {
          title: 'マルチ言語サポート',
          desc: '世界で32の言語で利用可能。Localized interfacesとサポートにより、世界中のクリエイターが母国語でClipop AIを使用できます。',
        },
        regional: {
          title: '地域最適化',
          desc: 'YouTube、BiliBili、TikTokなどの地域コンテンツプラットフォームに最適化。各市場向けの裁縫されたエクスポート設定。',
        },
      },
      cta: {
        title: '動画の変革を始める準備はできましたか？',
        subtitle: 'Clipop AIを使用してコンテンツの可能性を最大化している50,000人以上のクリエイターに参加',
        button: '無料で始める',
      },
    },
  },
  ko: {
    about: {
      hero: {
        badge: 'AI驅動動画 혁신',
        title: '영상 콘텐츠 변형',
        subtitle: 'Clipop AI는 긴 영상을 매력적인 숏폼 콘텐츠로 변환하는 업계 선도적 AI驅動 영상 클리핑 플랫폼입니다. 전 세계 50,000명 이상의 창작자가 사용',
        getStarted: '무료로 시작',
      },
      stats: {
        activeUsers: '활성 사용자',
        videosProcessed: '처리된 영상',
        userSatisfaction: '사용자 만족도',
        languages: '언어 지원',
      },
      productVision: {
        title: '제품 비전',
        subtitle: 'Clipop AI는 지능형 자동화를 통해 영상 콘텐츠의 잠재력을 최대한 발휘할 수 있도록 콘텐츠 창작자에게 힘을 실어줍니다',
        futureTitle: '영상 콘텐츠 제작의 미래',
        futurePara1: '오늘날 빠른 속도의 디지털 세계에서 짧은 형식의 영상 콘텐츠가 소셜 플랫폼을 지배하고 있습니다. 그러나 긴 영상에서 매력적인 숏 클립을 만드는 것은 시간과 리소스가 많이 드는 작업입니다.',
        futurePara2: 'Clipop AI는 최첨단 AI 기술을 활용하여 영상에서 가장 매력적인 순간을 자동으로 식별하여 이 문제를 해결합니다. 수 시간의 수동 편집을 절약하면서도高品质 결과를 보장합니다.',
        benefits: [
          '편집 시간 80% 절약',
          '콘텐츠 출력 3배 증가',
          '참여율 향상',
          '더 넓은 청중에게 도달',
        ],
      },
      features: {
        title: '핵심 기능',
        subtitle: '영상 콘텐츠를 변형하는 데 필요한 모든 것',
        aiIntelligence: { title: 'AI驅動 지능', desc: '고급 AI 알고리즘이 영상 콘텐츠를 자동으로 분석하여 가장 매력적인 순간을 식별하여 창작자의 수동 편집 시간을 수 시간 절약합니다.' },
        fastProcessing: { title: '초고속 처리', desc: '긴 영상을 몇 분 만에 처리합니다. 최적화된 파이프라인이 하이라이트를 즉시 제공합니다.' },
        multiPlatform: { title: '멀티 플랫폼 지원', desc: 'YouTube, Bilibili에서 가져오거나 로컬 파일을 업로드합니다. TikTok, YouTube Shorts, Instagram 등을 위한 최적화된 클립을 내보냅니다.' },
        privacyFirst: { title: '개인정보 보호 우선', desc: '귀하의 콘텐츠는 귀하만의 것입니다. 당사는 원본 영상을 저장하지 않으며 모든 것을 안전하게 처리합니다.' },
      },
      values: {
        title: '우리의 핵심 가치',
        subtitle: '사용자에게 최상의 경험을 제공하도록驱动하는 것',
        userCentric: { title: '사용자 중심 혁신', desc: '전 세계 콘텐츠 창작자의 실제 문제를 해결하는 도구를 구축합니다.' },
        continuous: { title: '지속적인 개선', desc: '사용자 피드백에 기반한 정기적인 업데이트로 경험을 향상시킵니다.' },
        community: { title: '글로벌 커뮤니티', desc: '전 세계 6개 대륙에서 32개 언어를 지원하는 창작자 지원.' },
      },
      geo: {
        title: '글로벌 리치, 로컬 임팩트',
        subtitle: '현지화된 경험으로 전 세계 창작자에게 서비스 제공',
        seo: {
          title: 'SEO 최적화',
          desc: '저의 플랫폼은 검색 엔진에 최적화되어 있어 콘텐츠의 검색 가능성을 높입니다. AI 생성 메타데이터와 태그가 각 플랫폼에서의 검색 가능성을 향상시킵니다.',
        },
        multiLang: {
          title: '멀티 언어 지원',
          desc: '전 세계 32개 언어로 제공됩니다. 현지화된 인터페이스와 지원으로 전 세계 창작자가 모국어로 Clipop AI를 사용할 수 있습니다.',
        },
        regional: {
          title: '지역 최적화',
          desc: 'YouTube, Bilibili, TikTok 등 지역 콘텐츠 플랫폼에 최적화되었습니다. 각 시장에 맞는 맞춤형 내보내기 설정.',
        },
      },
      cta: {
        title: '영상 변혁을 시작할 준비가 되셨나요?',
        subtitle: 'Clipop AI를 사용하여 콘텐츠 잠재력을 최대화하고 있는 50,000명 이상의 창작자에 합류하세요',
        button: '무료로 시작',
      },
    },
  },
  es: {
    about: {
      hero: {
        badge: 'Innovación de Video Impulsada por IA',
        title: 'Transforma Tu Contenido de Video',
        subtitle: 'Clipop AI es la plataforma líder de recorte de videos impulsada por IA que transforma videos largos en contenido corto atractivo. Usada por más de 50,000 creadores en todo el mundo',
        getStarted: 'Comenzar Gratis',
      },
      stats: {
        activeUsers: 'Usuarios Activos',
        videosProcessed: 'Videos Procesados',
        userSatisfaction: 'Satisfacción del Usuario',
        languages: 'Idiomas',
      },
      productVision: {
        title: 'Nuestra Visión de Producto',
        subtitle: 'Clipop AI empodera a los creadores de contenido para desbloquear el máximo potencial de su contenido de video a través de la automatización inteligente.',
        futureTitle: 'El Futuro de la Creación de Contenido de Video',
        futurePara1: 'En el panorama digital actual, el contenido de video de formato corto domina las plataformas sociales. Sin embargo, crear clips cortos atractivos a partir de videos largos consume mucho tiempo y recursos.',
        futurePara2: 'Clipop AI resuelve este problema aprovechando la inteligencia artificial más avanzada para identificar automáticamente los momentos más atractivos de tus videos, ahorrándote horas de edición manual mientras asegura resultados de alta calidad.',
        benefits: [
          'Ahorra el 80% de tu tiempo de edición',
          'Aumenta la producción de contenido por 3x',
          'Mejora las tasas de compromiso',
          'Llega a audiencias más amplias',
        ],
      },
      features: {
        title: 'Características Principales',
        subtitle: 'Todo lo que necesitas para transformar tu contenido de video eficientemente',
        aiIntelligence: { title: 'Inteligencia Impulsada por IA', desc: 'Algoritmos de IA avanzados analizan automáticamente el contenido del video para identificar los momentos más atractivos, ahorrando a los creadores horas de edición manual.' },
        fastProcessing: { title: 'Procesamiento Ultrarrápido', desc: 'Procesa videos largos en minutos, no horas. Nuestro pipeline optimizado entrega highlights instantáneamente.' },
        multiPlatform: { title: 'Soporte Multiplataforma', desc: 'Importa desde YouTube, Bilibili, o sube archivos locales. Exporta clips optimizados para TikTok, YouTube Shorts, Instagram y más.' },
        privacyFirst: { title: 'Privacidad Primero', desc: 'Tu contenido es tuyo. Nunca almacenamos tus videos originales y procesamos todo de forma segura.' },
      },
      values: {
        title: 'Nuestros Valores Fundamentales',
        subtitle: 'Lo que nos impulsa a ofrecer la mejor experiencia a nuestros usuarios',
        userCentric: { title: 'Innovación Centrada en el Usuario', desc: 'Construimos herramientas que resuelven problemas reales para creadores de contenido en todo el mundo.' },
        continuous: { title: 'Mejora Continua', desc: 'Actualizaciones regulares basadas en comentarios de usuarios para mejorar tu experiencia.' },
        community: { title: 'Comunidad Global', desc: 'Apoyando a creadores en 32 idiomas en cada continente.' },
      },
      geo: {
        title: 'Alcance Global, Impacto Local',
        subtitle: 'Sirviendo a creadores en todo el mundo con experiencias localizadas',
        seo: {
          title: 'Optimización SEO',
          desc: 'Nuestra plataforma está optimizada para motores de búsqueda, ayudando a que tu contenido sea descubierto. Metadatos y etiquetas generados por IA mejoran el descubrimiento en todas las plataformas.',
        },
        multiLang: {
          title: 'Soporte Multiidioma',
          desc: 'Disponible en 32 idiomas en todo el mundo. Interfaces y soporte localizados aseguran que creadores en todas partes puedan usar Clipop AI en su idioma nativo.',
        },
        regional: {
          title: 'Optimización Regional',
          desc: 'Optimizado para plataformas de contenido regionales incluyendo YouTube, Bilibili, TikTok y más. Configuración de exportación personalizada para cada mercado.',
        },
      },
      cta: {
        title: '¿Listo para Transformar Tus Videos?',
        subtitle: 'Únete a más de 50,000 creadores que están usando Clipop AI para maximizar el potencial de su contenido',
        button: 'Comenzar Gratis',
      },
    },
  },
  fr: {
    about: {
      hero: {
        badge: 'Innovation Vidéo Assistée par IA',
        title: 'Transformez Votre Contenu Vidéo',
        subtitle: 'Clipop AI est la principale plateforme de découpage vidéo assistée par IA qui transforme des vidéos longues en contenu court engageant. Utilisée par plus de 50 000 créateurs dans le monde entier',
        getStarted: 'Commencer Gratuitement',
      },
      stats: {
        activeUsers: 'Utilisateurs Actifs',
        videosProcessed: 'Vidéos Traitées',
        userSatisfaction: 'Satisfaction Utilisateur',
        languages: 'Langues',
      },
      productVision: {
        title: 'Notre Vision Produit',
        subtitle: 'Clipop AI permet aux créateurs de contenu de libérer le plein potentiel de leur contenu vidéo grâce à l\'automatisation intelligente.',
        futureTitle: 'L\'Avenir de la Création de Contenu Vidéo',
        futurePara1: 'Dans le paysage numérique actuel, le contenu vidéo court domine les plateformes sociales. Cependant, créer des clips courts engageants à partir de vidéos longues prend du temps et des ressources.',
        futurePara2: 'Clipop AI résout ce problème en utilisant l\'intelligence artificielle la plus avancée pour identifier automatiquement les moments les plus engageants de vos vidéos, vous faisant économiser des heures de montage manuel tout en garantissant des résultats de haute qualité.',
        benefits: [
          'Économisez 80% de votre temps de montage',
          'Augmentez la production de contenu de 3x',
          'Améliorez les taux d\'engagement',
          'Touchez des audiences plus larges',
        ],
      },
      features: {
        title: 'Fonctionnalités Principales',
        subtitle: 'Tout ce dont vous avez besoin pour transformer efficacement votre contenu vidéo',
        aiIntelligence: { title: 'Intelligence Assistée par IA', desc: 'Des algorithmes IA avancés analysent automatiquement le contenu vidéo pour identifier les moments les plus engageants, faisant gagner aux créateurs des heures de montage manuel.' },
        fastProcessing: { title: 'Traitement Ultra-Rapide', desc: 'Traitez des vidéos longues en minutes, pas en heures. Notre pipeline optimisé livre les moments forts instantanément.' },
        multiPlatform: { title: 'Support Multiplateforme', desc: 'Importez depuis YouTube, Bilibili, ou téléchargez des fichiers locaux. Exportez des clips optimisés pour TikTok, YouTube Shorts, Instagram et plus.' },
        privacyFirst: { title: 'Confidentialité Avant Tout', desc: 'Votre contenu vous appartient. Nous ne stockons jamais vos vidéos originales et traitons tout en toute sécurité.' },
      },
      values: {
        title: 'Nos Valeurs Fondamentales',
        subtitle: 'Ce qui nous pousse à offrir la meilleure expérience à nos utilisateurs',
        userCentric: { title: 'Innovation Centrée sur l\'Utilisateur', desc: 'Nous construisons des outils qui résolvent de vrais problèmes pour les créateurs de contenu du monde entier.' },
        continuous: { title: 'Amélioration Continue', desc: 'Mises à jour régulières basées sur les commentaires des utilisateurs pour améliorer votre expérience.' },
        community: { title: 'Communauté Mondiale', desc: 'Soutenir les créateurs en 32 langues sur chaque continent.' },
      },
      geo: {
        title: 'Portée Mondiale, Impact Local',
        subtitle: 'Servir les créateurs du monde entier avec des expériences localisées',
        seo: {
          title: 'Optimisation SEO',
          desc: 'Notre plateforme est optimisée pour les moteurs de recherche, aidant votre contenu à être découvert. Métadonnées et tags générés par IA améliorent la découverte sur toutes les plateformes.',
        },
        multiLang: {
          title: 'Support Multilingue',
          desc: 'Disponible en 32 langues dans le monde entier. Interfaces et support localisés assurent que les créateurs partout peuvent utiliser Clipop AI dans leur langue maternelle.',
        },
        regional: {
          title: 'Optimisation Régionale',
          desc: 'Optimisé pour les plateformes de contenu régionales incluant YouTube, Bilibili, TikTok et plus. Paramètres d\'exportation adaptés pour chaque marché.',
        },
      },
      cta: {
        title: 'Prêt à Transformer Vos Vidéos?',
        subtitle: 'Rejoignez plus de 50 000 créateurs qui utilisent Clipop AI pour maximiser le potentiel de leur contenu',
        button: 'Commencer Gratuitement',
      },
    },
  },
  de: {
    about: {
      hero: {
        badge: 'KI-gestützte Video-Innovation',
        title: 'Transformieren Sie Ihre Videoinhalte',
        subtitle: 'Clipop AI ist die führende KI-gestützte Video-Clipping-Plattform, die lange Videos in ansprechende Kurzform-Inhalte transformiert. Von über 50.000 Creators weltweit genutzt',
        getStarted: 'Kostenlos Starten',
      },
      stats: {
        activeUsers: 'Aktive Nutzer',
        videosProcessed: 'Verarbeitete Videos',
        userSatisfaction: 'Benutzerzufriedenheit',
        languages: 'Sprachen',
      },
      productVision: {
        title: 'Unsere Produktvision',
        subtitle: 'Clipop AI ermöglicht Content-Erstellern, das volle Potenzial ihrer Videoinhalte durch intelligente Automatisierung auszuschöpfen.',
        futureTitle: 'Die Zukunft der Video-Content-Erstellung',
        futurePara1: 'In der heutigen schnelllebigen digitalen Welt dominieren Kurzform-Videoinhalte die sozialen Plattformen. Das Erstellen ansprechender Kurzclips aus langen Videos ist jedoch zeit- und ressourcenintensiv.',
        futurePara2: 'Clipop AI löst dieses Problem durch den Einsatz modernster KI-Technologie, um automatisch die ansprechendsten Momente in Ihren Videos zu identifizieren und Ihnen stundenlange manuelle Bearbeitung zu ersparen und gleichzeitig hochwertige Ergebnisse zu gewährleisten.',
        benefits: [
          'Sparen Sie 80% Ihrer Bearbeitungszeit',
          'Erhöhen Sie die Content-Produktion um 3x',
          'Steigern Sie Engagement-Raten',
          'Erreichen Sie breitere Zielgruppen',
        ],
      },
      features: {
        title: 'Kernfunktionen',
        subtitle: 'Alles was Sie brauchen, um Ihre Videoinhalte effizient zu transformieren',
        aiIntelligence: { title: 'KI-gestützte Intelligenz', desc: 'Fortschrittliche KI-Algorithmen analysieren automatisch Videoinhalte, um die ansprechendsten Momente zu identifizieren und Erstellern stundenlange manuelle Bearbeitung zu ersparen.' },
        fastProcessing: { title: 'Blitzschnelle Verarbeitung', desc: 'Verarbeiten Sie lange Videos in Minuten, nicht Stunden. Unsere optimierte Pipeline liefert Highlights sofort.' },
        multiPlatform: { title: 'Multi-Plattform-Unterstützung', desc: 'Importieren Sie von YouTube, Bilibili oder laden Sie lokale Dateien hoch. Exportieren Sie optimierte Clips für TikTok, YouTube Shorts, Instagram und mehr.' },
        privacyFirst: { title: 'Datenschutz Zuerst', desc: 'Ihre Inhalte gehören Ihnen. Wir speichern Ihre Originalvideos niemals und verarbeiten alles sicher.' },
      },
      values: {
        title: 'Unsere Kernwerte',
        subtitle: 'Was uns antreibt, unseren Nutzern das beste Erlebnis zu bieten',
        userCentric: { title: 'Nutzerzentrierte Innovation', desc: 'Wir bauen Werkzeuge, die echte Probleme für Content-Ersteller weltweit lösen.' },
        continuous: { title: 'Kontinuierliche Verbesserung', desc: 'Regelmäßige Updates basierend auf Nutzer-Feedback zur Verbesserung Ihrer Erfahrung.' },
        community: { title: 'Globale Community', desc: 'Unterstützung von Erstellern in 32 Sprachen auf jedem Kontinent.' },
      },
      geo: {
        title: 'Globale Reichweite, Lokale Wirkung',
        subtitle: 'Creators auf der ganzen Welt mit lokalisierten Erlebnissen dienen',
        seo: {
          title: 'SEO-Optimierung',
          desc: 'Unsere Plattform ist für Suchmaschinen optimiert und hilft Ihren Inhalten, entdeckt zu werden. KI-generierte Metadaten und Tags verbessern die Auffindbarkeit auf allen Plattformen.',
        },
        multiLang: {
          title: 'Mehrsprachige Unterstützung',
          desc: 'Verfügbar in 32 Sprachen weltweit. Lokalisierte Interfaces und Support stellen sicher, dass Creator überall Clipop AI in ihrer Muttersprache nutzen können.',
        },
        regional: {
          title: 'Regionale Optimierung',
          desc: 'Optimiert für regionale Content-Plattformen einschließlich YouTube, Bilibili, TikTok und mehr. Maßgeschneiderte Export-Einstellungen für jeden Markt.',
        },
      },
      cta: {
        title: 'Bereit, Ihre Videos zu transformieren?',
        subtitle: 'Schließen Sie sich über 50.000 Erstellern an, die Clipop AI nutzen, um das Potenzial ihrer Inhalte zu maximieren',
        button: 'Kostenlos Starten',
      },
    },
  },
};

// Nav about translations for each language
const navAboutTranslations = {
  en: 'About',
  zh: '关于我们',
  'zh-Hant': '關於我們',
  ja: '会社概要',
  ko: '회사 소개',
  de: 'Über uns',
  fr: 'À propos',
  it: 'Chi siamo',
  es: 'Sobre nosotros',
  pt: 'Sobre nós',
  hi: 'हमारे बारे में',
  ar: 'من نحن',
  bn: 'আমাদের সম্পর্কে',
  id: 'Tentang kami',
  ms: 'Tentang kami',
  th: 'เกี่ยวกับเรา',
  he: 'אודותינו',
  ru: 'О нас',
  ur: 'ہمارے بارے میں',
  tr: 'Hakkımızda',
  vi: 'Về chúng tôi',
  fa: 'درباره ما',
  mr: 'आमच्याबद्दल',
  ta: 'எங்களைப் பற்றி',
  pl: 'O nas',
  te: 'మా గురించి',
  ne: 'हाम्रो बारेमा',
  da: 'Om os',
  fi: 'Meistä',
  nl: 'Over ons',
  no: 'Om oss',
  sv: 'Om oss',
};

function addNavAbout(content, lang, translation) {
  // Find the nav section and add about
  const navMatch = content.match(/nav:\s*\{([^}]+)\}/);
  if (navMatch) {
    const navContent = navMatch[1];
    // Check if about already exists
    if (!navContent.includes('about:')) {
      // Add about after pricing
      return content.replace(
        /(nav:\s*\{[^}]*pricing:\s*'[^']*')/,
        `$1, about: '${translation}'`
      );
    }
  }
  return content;
}

function addAboutTranslations(content, translations) {
  // Add about section before the last };
  const aboutSection = `\n  about: ${JSON.stringify(translations, null, 2).replace(/"/g, '').split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n')},\n`;
  
  // Find the position before the last };
  const lastBraceIndex = content.lastIndexOf('};\n\nexport default');
  if (lastBraceIndex !== -1) {
    return content.slice(0, lastBraceIndex) + ',\n' + JSON.stringify(translations, null, 2).replace(/"/g, '').split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n') + '\n};\n\nexport default';
  }
  
  return content;
}

// Get all locale files
const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.ts'));

console.log('Found language files:', files);

files.forEach(file => {
  const lang = file.replace('.ts', '');
  const filePath = path.join(localesDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Add nav.about if it doesn't exist
  if (navAboutTranslations[lang]) {
    content = addNavAbout(content, lang, navAboutTranslations[lang]);
  }
  
  // Add about page translations if available
  if (aboutTranslations[lang]) {
    content = addAboutTranslations(content, aboutTranslations[lang]);
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${file}`);
});

console.log('Done!');
