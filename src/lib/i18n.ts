export type Locale = 
  | 'en'      // English
  | 'zh'      // 简体中文
  | 'zh-Hant' // 繁體中文
  | 'ja'      // 日本語
  | 'ko'      // 한국어
  | 'de'      // Deutsch
  | 'fr'      // Français
  | 'it'      // Italiano
  | 'es'      // Español
  | 'pt'      // Português
  | 'hi'      // हिन्दी
  | 'ar'      // العربية
  | 'bn'      // বাংলা
  | 'id'      // Bahasa Indonesia
  | 'ms'      // Bahasa Melayu
  | 'th'      // ภาษาไทย
  | 'he'      // עברית
  | 'ru'      // Русский
  | 'ur'      // اردو
  | 'tr'      // Türkçe
  | 'vi'      // Tiếng Việt
  | 'fa'      // فارسی
  | 'mr'      // मराठी
  | 'ta'      // தமிழ்
  | 'pl'      // Polski
  | 'te'      // తెలుగు
  | 'ne'      // नेपाली
  | 'da'      // Dansk
  | 'fi'      // Suomi
  | 'nl'      // Nederlands
  | 'no'      // Norsk
  | 'sv';     // Svenska

export const locales: Locale[] = [
  'en', 'zh', 'zh-Hant', 'ja', 'ko', 'de', 'fr', 'it', 'es', 'pt',
  'hi', 'ar', 'bn', 'id', 'ms', 'th', 'he', 'ru', 'ur', 'tr',
  'vi', 'fa', 'mr', 'ta', 'pl', 'te', 'ne', 'da', 'fi', 'nl', 'no', 'sv'
];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, { native: string; english: string }> = {
  en: { native: 'English', english: 'English' },
  zh: { native: '简体中文', english: 'Chinese (Simplified)' },
  'zh-Hant': { native: '繁體中文', english: 'Chinese (Traditional)' },
  ja: { native: '日本語', english: 'Japanese' },
  ko: { native: '한국어', english: 'Korean' },
  de: { native: 'Deutsch', english: 'German' },
  fr: { native: 'Français', english: 'French' },
  it: { native: 'Italiano', english: 'Italian' },
  es: { native: 'Español', english: 'Spanish' },
  pt: { native: 'Português', english: 'Portuguese' },
  hi: { native: 'हिन्दी', english: 'Hindi' },
  ar: { native: 'العربية', english: 'Arabic' },
  bn: { native: 'বাংলা', english: 'Bengali' },
  id: { native: 'Bahasa Indonesia', english: 'Indonesian' },
  ms: { native: 'Bahasa Melayu', english: 'Malay' },
  th: { native: 'ภาษาไทย', english: 'Thai' },
  he: { native: 'עברית', english: 'Hebrew' },
  ru: { native: 'Русский', english: 'Russian' },
  ur: { native: 'اردو', english: 'Urdu' },
  tr: { native: 'Türkçe', english: 'Turkish' },
  vi: { native: 'Tiếng Việt', english: 'Vietnamese' },
  fa: { native: 'فارسی', english: 'Persian' },
  mr: { native: 'मराठी', english: 'Marathi' },
  ta: { native: 'தமிழ்', english: 'Tamil' },
  pl: { native: 'Polski', english: 'Polish' },
  te: { native: 'తెలుగు', english: 'Telugu' },
  ne: { native: 'नेपाली', english: 'Nepali' },
  da: { native: 'Dansk', english: 'Danish' },
  fi: { native: 'Suomi', english: 'Finnish' },
  nl: { native: 'Nederlands', english: 'Dutch' },
  no: { native: 'Norsk', english: 'Norwegian' },
  sv: { native: 'Svenska', english: 'Swedish' },
};

const commonTranslations = {
  nav: {
    home: 'Home',
    blog: 'Blog',
    pricing: 'Pricing',
    login: 'Login',
    register: 'Register',
    dashboard: 'Dashboard',
    admin: 'Admin Panel',
    logout: 'Logout',
    credits: 'Credits',
  },
  home: {
    hero: {
      title: 'Transform Long Videos into Viral Shorts',
      subtitle: 'AI-powered video clipping that extracts the best moments from your long-form content automatically',
      cta: 'Start Clipping for Free',
      secondary: 'Watch Demo',
    },
    features: {
      title: 'Powerful AI Video Clipping',
      auto: { title: 'Auto Highlight Detection', desc: 'AI analyzes your video and identifies the most engaging moments automatically' },
      multi: { title: 'Multi-Platform Support', desc: 'Import from YouTube, Bilibili, or upload your own video files' },
      quick: { title: 'Quick Export', desc: 'Download your clips in multiple formats, ready for any social platform' },
    },
  },
  video: {
    input: { title: 'Input Video', url: 'Video URL (YouTube/Bilibili)', upload: 'Upload Video', placeholder: 'Paste YouTube or Bilibili video link...' },
    process: 'Process Video',
    processing: 'Processing...',
    results: 'Generated Shorts',
    highlights: 'Highlight Analysis',
    download: 'Download',
    preview: 'Preview',
  },
  pricing: {
    title: 'Simple, Transparent Pricing',
    subtitle: 'Choose the plan that fits your needs',
    free: { title: 'Free', price: '$0', period: '/month', desc: 'Perfect for trying out', feature1: '100 credits daily', feature2: 'Basic video clipping', feature3: '720p export quality', feature4: 'Watermark included', cta: 'Get Started' },
    starter: { title: 'Starter', price: '$9.9', period: '/month', desc: 'For content creators', feature1: '500 credits daily', feature2: 'Priority processing', feature3: '1080p export quality', feature4: 'No watermark', feature5: 'Email support', cta: 'Subscribe Now' },
    pro: { title: 'Pro', price: '$19.9', period: '/month', desc: 'For professionals & teams', feature1: 'Unlimited credits', feature2: 'Fastest processing', feature3: '4K export quality', feature4: 'No watermark', feature5: 'API access', feature6: 'Priority support', cta: 'Subscribe Now' },
  },
  login: {
    title: 'Sign in',
    description: 'Access your account',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••',
    submitButton: 'Sign in',
    orContinueWith: 'Or continue with',
    googleButton: 'Continue with Google',
    dontHaveAccount: "Don't have an account?",
    signUp: 'Sign up',
  },
  register: {
    title: 'Create account',
    description: 'Get started with Clipop AI',
    nameLabel: 'Full name',
    namePlaceholder: 'John Doe',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••',
    confirmPasswordLabel: 'Confirm password',
    confirmPasswordPlaceholder: '••••••••',
    sendCodeButton: 'Continue',
    sendingCode: 'Sending...',
    codeLabel: 'Verification code',
    codePlaceholder: 'Enter 6-digit code',
    verifyButton: 'Create account',
    codeNotReceived: "Didn't receive the code?",
    resendButton: 'Resend code',
    resendIn: 'Resend in',
    backButton: 'Back',
    googleButton: 'Continue with Google',
    alreadyHaveAccount: 'Already have an account?',
    signIn: 'Sign in',
  },
  dashboard: {
    title: 'Dashboard',
    credits: 'Available Credits',
    creditsReset: 'Resets daily at 00:00 UTC',
    history: 'Processing History',
    noVideos: 'No videos processed yet',
    startProcessing: 'Start Processing Videos',
  },
  admin: {
    title: 'Admin Panel',
    blog: 'Blog Management',
    blogCreate: 'Create Post',
    blogTitle: 'Title',
    blogCategory: 'Category',
    blogContent: 'Content',
    blogPublish: 'Publish',
    blogSave: 'Save Draft',
    blogPublished: 'Published',
    blogDraft: 'Draft',
  },
  blog: {
    title: 'Blog',
    readMore: 'Read More',
    noPosts: 'No posts yet',
  },
  common: {
    loading: 'Loading...',
    error: 'An error occurred',
    success: 'Success',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    search: 'Search',
  },
};

function flattenTranslations(obj: any, prefix: string = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenTranslations(value, newKey));
    } else {
      result[newKey] = value as string;
    }
  }
  return result;
}

export const translations: Record<Locale, Record<string, string>> = {
  en: flattenTranslations(commonTranslations),
  
  zh: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: '首页', blog: '博客', pricing: '定价', login: '登录', register: '注册', dashboard: '控制台', admin: '管理后台', logout: '退出登录', credits: '积分',
    },
    home: {
      hero: {
        title: '将长视频转换为爆款短视频',
        subtitle: 'AI驱动的视频剪辑，自动提取长视频中最精彩的时刻',
        cta: '免费开始剪辑',
        secondary: '观看演示',
      },
      features: {
        title: '强大的AI视频剪辑',
        auto: { title: '自动亮点检测', desc: 'AI分析视频并自动识别最吸引人的时刻' },
        multi: { title: '多平台支持', desc: '支持从YouTube、B站导入或上传自己的视频文件' },
        quick: { title: '快速导出', desc: '以多种格式下载剪辑，适合任何社交平台' },
      },
    },
    video: {
      input: { title: '输入视频', url: '视频链接 (YouTube/B站)', upload: '上传视频', placeholder: '粘贴YouTube或B站视频链接...' },
      process: '处理视频', processing: '处理中...', results: '生成的短视频', highlights: '亮点分析', download: '下载', preview: '预览',
    },
    pricing: {
      title: '简单透明的定价', subtitle: '选择适合您需求的方案',
      free: { title: '免费版', price: '$0', period: '/月', desc: '适合试用', feature1: '每天100积分', feature2: '基础视频剪辑', feature3: '720p导出质量', feature4: '含水印', cta: '开始使用' },
      starter: { title: '入门版', price: '$9.9', period: '/月', desc: '适合内容创作者', feature1: '每天500积分', feature2: '优先处理', feature3: '1080p导出质量', feature4: '无水印', feature5: '邮件支持', cta: '立即订阅' },
      pro: { title: '专业版', price: '$19.9', period: '/月', desc: '适合专业人士和团队', feature1: '无限积分', feature2: '最快处理速度', feature3: '4K导出质量', feature4: '无水印', feature5: 'API访问', feature6: '优先支持', cta: '立即订阅' },
    },
    login: {
      title: '登录', description: '访问您的账户', emailLabel: '邮箱', emailPlaceholder: 'you@example.com', passwordLabel: '密码', passwordPlaceholder: '••••••••', submitButton: '登录', orContinueWith: '或继续使用', googleButton: '使用Google登录', dontHaveAccount: '还没有账户？', signUp: '注册',
    },
    register: {
      title: '创建账户', description: '开始使用Clipop AI', nameLabel: '姓名', namePlaceholder: '张三', emailLabel: '邮箱', emailPlaceholder: 'you@example.com', passwordLabel: '密码', passwordPlaceholder: '••••••••', confirmPasswordLabel: '确认密码', confirmPasswordPlaceholder: '••••••••', sendCodeButton: '继续', sendingCode: '发送中...', codeLabel: '验证码', codePlaceholder: '输入6位验证码', verifyButton: '创建账户', codeNotReceived: '未收到验证码？', resendButton: '重新发送', resendIn: '重新发送', backButton: '返回', googleButton: '使用Google登录', alreadyHaveAccount: '已有账户？', signIn: '登录',
    },
    dashboard: { title: '控制台', credits: '可用积分', creditsReset: '每天00:00 UTC重置', history: '处理历史', noVideos: '暂无处理的视频', startProcessing: '开始处理视频' },
    admin: { title: '管理后台', blog: '博客管理', blogCreate: '创建帖子', blogTitle: '标题', blogCategory: '分类', blogContent: '内容', blogPublish: '发布', blogSave: '保存草稿', blogPublished: '已发布', blogDraft: '草稿' },
    blog: { title: '博客', readMore: '阅读更多', noPosts: '暂无帖子' },
    common: { loading: '加载中...', error: '发生错误', success: '成功', cancel: '取消', save: '保存', delete: '删除', edit: '编辑', search: '搜索' },
  }),
  
  'zh-Hant': flattenTranslations({
    ...commonTranslations,
    nav: {
      home: '首頁', blog: '部落格', pricing: '定價', login: '登入', register: '註冊', dashboard: '儀錶板', admin: '管理後台', logout: '登出', credits: '積分',
    },
    home: {
      hero: {
        title: '將長影片轉換為爆紅短片',
        subtitle: 'AI驅動的影片剪輯，自動提取長影片中最精彩的時刻',
        cta: '免費開始剪輯',
        secondary: '觀看演示',
      },
      features: {
        title: '強大的AI影片剪輯',
        auto: { title: '自動亮點檢測', desc: 'AI分析影片並自動識別最吸引人的時刻' },
        multi: { title: '多平台支援', desc: '支援從YouTube、B站匯入或上傳自己的影片檔案' },
        quick: { title: '快速匯出', desc: '以多種格式下載剪輯，適合任何社交平台' },
      },
    },
    video: {
      input: { title: '輸入影片', url: '影片連結 (YouTube/B站)', upload: '上傳影片', placeholder: '貼上YouTube或B站影片連結...' },
      process: '處理影片', processing: '處理中...', results: '生成的短片', highlights: '亮點分析', download: '下載', preview: '預覽',
    },
    pricing: {
      title: '簡單透明的定價', subtitle: '選擇適合您需求的方案',
      free: { title: '免費版', price: '$0', period: '/月', desc: '適合試用', feature1: '每天100積分', feature2: '基礎影片剪輯', feature3: '720p匯出品質', feature4: '含浮水印', cta: '開始使用' },
      starter: { title: '入門版', price: '$9.9', period: '/月', desc: '適合內容創作者', feature1: '每天500積分', feature2: '優先處理', feature3: '1080p匯出品質', feature4: '無浮水印', feature5: '郵件支援', cta: '立即訂閱' },
      pro: { title: '專業版', price: '$19.9', period: '/月', desc: '適合專業人士和團隊', feature1: '無限積分', feature2: '最快處理速度', feature3: '4K匯出品質', feature4: '無浮水印', feature5: 'API存取', feature6: '優先支援', cta: '立即訂閱' },
    },
    login: {
      title: '登入', description: '存取您的帳戶', emailLabel: '電子郵件', emailPlaceholder: 'you@example.com', passwordLabel: '密碼', passwordPlaceholder: '••••••••', submitButton: '登入', orContinueWith: '或繼續使用', googleButton: '使用Google登入', dontHaveAccount: '還沒有帳戶？', signUp: '註冊',
    },
    register: {
      title: '建立帳戶', description: '開始使用Clipop AI', nameLabel: '姓名', namePlaceholder: '張三', emailLabel: '電子郵件', emailPlaceholder: 'you@example.com', passwordLabel: '密碼', passwordPlaceholder: '••••••••', confirmPasswordLabel: '確認密碼', confirmPasswordPlaceholder: '••••••••', sendCodeButton: '繼續', sendingCode: '發送中...', codeLabel: '驗證碼', codePlaceholder: '輸入6位驗證碼', verifyButton: '建立帳戶', codeNotReceived: '未收到驗證碼？', resendButton: '重新發送', resendIn: '重新發送', backButton: '返回', googleButton: '使用Google登入', alreadyHaveAccount: '已有帳戶？', signIn: '登入',
    },
    dashboard: { title: '儀錶板', credits: '可用積分', creditsReset: '每天00:00 UTC重置', history: '處理歷史', noVideos: '暫無處理的影片', startProcessing: '開始處理影片' },
    admin: { title: '管理後台', blog: '部落格管理', blogCreate: '建立帖子', blogTitle: '標題', blogCategory: '分類', blogContent: '內容', blogPublish: '發佈', blogSave: '儲存草稿', blogPublished: '已發佈', blogDraft: '草稿' },
    blog: { title: '部落格', readMore: '閱讀更多', noPosts: '暫無帖子' },
    common: { loading: '載入中...', error: '發生錯誤', success: '成功', cancel: '取消', save: '儲存', delete: '刪除', edit: '編輯', search: '搜尋' },
  }),
  
  ja: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'ホーム', blog: 'ブログ', pricing: '価格', login: 'ログイン', register: '登録', dashboard: 'ダッシュボード', admin: '管理パネル', logout: 'ログアウト', credits: 'クレジット',
    },
    home: {
      hero: {
        title: '長い動画をバイラルショートに変換',
        subtitle: 'AI駆動の動画クリッピングで、長編コンテンツから最高の瞬間を自動的に抽出',
        cta: '無料でクリッピング開始',
        secondary: 'デモを見る',
      },
      features: {
        title: '強力なAI動画クリッピング',
        auto: { title: '自動ハイライト検出', desc: 'AIが動画を分析し、最も魅力的な瞬間を自動的に識別' },
        multi: { title: 'マルチプラットフォームサポート', desc: 'YouTube、Bilibiliからインポート、または自分の動画ファイルをアップロード' },
        quick: { title: 'クイックエクスポート', desc: '複数のフォーマットでクリップをダウンロードし、どのソーシャルプラットフォームにも対応' },
      },
    },
    video: {
      input: { title: '動画入力', url: '動画URL (YouTube/Bilibili)', upload: '動画アップロード', placeholder: 'YouTubeまたはBilibiliの動画リンクを貼り付け...' },
      process: '動画を処理', processing: '処理中...', results: '生成されたショート', highlights: 'ハイライト分析', download: 'ダウンロード', preview: 'プレビュー',
    },
    pricing: {
      title: 'シンプルで透明な価格設定', subtitle: '自分に合ったプランを選択',
      free: { title: '無料', price: '$0', period: '/月', desc: '試用に最適', feature1: '毎日100クレジット', feature2: '基本的な動画クリッピング', feature3: '720pエクスポート品質', feature4: 'ウォーターマーク付き', cta: '始める' },
      starter: { title: 'スターター', price: '$9.9', period: '/月', desc: 'コンテンツクリエイター向け', feature1: '毎日500クレジット', feature2: '優先処理', feature3: '1080pエクスポート品質', feature4: 'ウォーターマークなし', feature5: 'メールサポート', cta: '今すぐ購読' },
      pro: { title: 'プロ', price: '$19.9', period: '/月', desc: 'プロフェッショナル＆チーム向け', feature1: '無制限クレジット', feature2: '最速処理', feature3: '4Kエクスポート品質', feature4: 'ウォーターマークなし', feature5: 'APIアクセス', feature6: '優先サポート', cta: '今すぐ購読' },
    },
    login: {
      title: 'ログイン', description: 'アカウントにアクセス', emailLabel: 'メールアドレス', emailPlaceholder: 'you@example.com', passwordLabel: 'パスワード', passwordPlaceholder: '••••••••', submitButton: 'ログイン', orContinueWith: 'または続行', googleButton: 'Googleで続行', dontHaveAccount: 'アカウントをお持ちでない方は？', signUp: '登録',
    },
    register: {
      title: 'アカウント作成', description: 'Clipop AIを始める', nameLabel: 'フルネーム', namePlaceholder: 'John Doe', emailLabel: 'メールアドレス', emailPlaceholder: 'you@example.com', passwordLabel: 'パスワード', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'パスワード確認', confirmPasswordPlaceholder: '••••••••', sendCodeButton: '続行', sendingCode: '送信中...', codeLabel: '認証コード', codePlaceholder: '6桁のコードを入力', verifyButton: 'アカウント作成', codeNotReceived: 'コードを受け取っていませんか？', resendButton: '再送', resendIn: '再送', backButton: '戻る', googleButton: 'Googleで続行', alreadyHaveAccount: 'アカウントをお持ちですか？', signIn: 'ログイン',
    },
    dashboard: { title: 'ダッシュボード', credits: '利用可能なクレジット', creditsReset: '毎日00:00 UTCでリセット', history: '処理履歴', noVideos: 'まだ処理された動画はありません', startProcessing: '動画処理を開始' },
    admin: { title: '管理パネル', blog: 'ブログ管理', blogCreate: '投稿作成', blogTitle: 'タイトル', blogCategory: 'カテゴリ', blogContent: 'コンテンツ', blogPublish: '公開', blogSave: '下書き保存', blogPublished: '公開済み', blogDraft: '下書き' },
    blog: { title: 'ブログ', readMore: 'もっと読む', noPosts: 'まだ投稿はありません' },
    common: { loading: '読み込み中...', error: 'エラーが発生しました', success: '成功', cancel: 'キャンセル', save: '保存', delete: '削除', edit: '編集', search: '検索' },
  }),
  
  ko: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: '홈', blog: '블로그', pricing: '가격', login: '로그인', register: '회원가입', dashboard: '대시보드', admin: '관리자 패널', logout: '로그아웃', credits: '크레딧',
    },
    home: {
      hero: {
        title: '긴 동영상을 바이럴 쇼츠로 변환',
        subtitle: 'AI 기반 비디오 클리핑으로 롱폼 콘텐츠에서 최고의 순간을 자동 추출',
        cta: '무료로 클리핑 시작',
        secondary: '데모 보기',
      },
      features: {
        title: '강력한 AI 비디오 클리핑',
        auto: { title: '자동 하이라이트 감지', desc: 'AI가 비디오를 분석하고 가장 매력적인 순간을 자동으로 식별' },
        multi: { title: '다중 플랫폼 지원', desc: 'YouTube, Bilibili에서 가져오기 또는 직접 비디오 파일 업로드' },
        quick: { title: '빠른 내보내기', desc: '여러 형식으로 클립을 다운로드하여 모든 소셜 플랫폼에 사용 가능' },
      },
    },
    video: {
      input: { title: '비디오 입력', url: '비디오 URL (YouTube/Bilibili)', upload: '비디오 업로드', placeholder: 'YouTube 또는 Bilibili 비디오 링크 붙여넣기...' },
      process: '비디오 처리', processing: '처리 중...', results: '생성된 쇼츠', highlights: '하이라이트 분석', download: '다운로드', preview: '미리보기',
    },
    pricing: {
      title: '단순하고 투명한 가격', subtitle: '필요에 맞는 플랜 선택',
      free: { title: '무료', price: '$0', period: '/월', desc: '시도하기에 완벽', feature1: '매일 100 크레딧', feature2: '기본 비디오 클리핑', feature3: '720p 내보내기 품질', feature4: '워터마크 포함', cta: '시작하기' },
      starter: { title: '스타터', price: '$9.9', period: '/월', desc: '콘텐츠 크리에이터용', feature1: '매일 500 크레딧', feature2: '우선 처리', feature3: '1080p 내보내기 품질', feature4: '워터마크 없음', feature5: '이메일 지원', cta: '지금 구독' },
      pro: { title: '프로', price: '$19.9', period: '/월', desc: '프로페셔널 및 팀용', feature1: '무제한 크레딧', feature2: '가장 빠른 처리', feature3: '4K 내보내기 품질', feature4: '워터마크 없음', feature5: 'API 액세스', feature6: '우선 지원', cta: '지금 구독' },
    },
    login: {
      title: '로그인', description: '계정에 액세스', emailLabel: '이메일', emailPlaceholder: 'you@example.com', passwordLabel: '비밀번호', passwordPlaceholder: '••••••••', submitButton: '로그인', orContinueWith: '또는 계속하기', googleButton: 'Google로 계속', dontHaveAccount: '계정이 없으신가요?', signUp: '회원가입',
    },
    register: {
      title: '계정 생성', description: 'Clipop AI로 시작', nameLabel: '이름', namePlaceholder: 'John Doe', emailLabel: '이메일', emailPlaceholder: 'you@example.com', passwordLabel: '비밀번호', passwordPlaceholder: '••••••••', confirmPasswordLabel: '비밀번호 확인', confirmPasswordPlaceholder: '••••••••', sendCodeButton: '계속', sendingCode: '전송 중...', codeLabel: '인증 코드', codePlaceholder: '6자리 코드 입력', verifyButton: '계정 생성', codeNotReceived: '코드를 받지 못하셨나요?', resendButton: '재전송', resendIn: '재전송', backButton: '뒤로', googleButton: 'Google로 계속', alreadyHaveAccount: '이미 계정이 있으신가요?', signIn: '로그인',
    },
    dashboard: { title: '대시보드', credits: '사용 가능한 크레딧', creditsReset: '매일 00:00 UTC에 리셋', history: '처리 기록', noVideos: '아직 처리된 비디오가 없습니다', startProcessing: '비디오 처리 시작' },
    admin: { title: '관리자 패널', blog: '블로그 관리', blogCreate: '게시물 생성', blogTitle: '제목', blogCategory: '카테고리', blogContent: '내용', blogPublish: '게시', blogSave: '초안 저장', blogPublished: '게시됨', blogDraft: '초안' },
    blog: { title: '블로그', readMore: '더 읽기', noPosts: '아직 게시물이 없습니다' },
    common: { loading: '로딩 중...', error: '오류가 발생했습니다', success: '성공', cancel: '취소', save: '저장', delete: '삭제', edit: '편집', search: '검색' },
  }),
  
  de: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Start', blog: 'Blog', pricing: 'Preise', login: 'Anmelden', register: 'Registrieren', dashboard: 'Dashboard', admin: 'Admin-Panel', logout: 'Abmelden', credits: 'Guthaben',
    },
    home: {
      hero: {
        title: 'Lange Videos in virale Shorts verwandeln',
        subtitle: 'KI-gestütztes Video-Clipping extrahiert automatisch die besten Momente aus Ihrer Langform-Inhalte',
        cta: 'Kostenlos clippen',
        secondary: 'Demo ansehen',
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
      process: 'Video verarbeiten', processing: 'Verarbeitung...', results: 'Generierte Shorts', highlights: 'Highlight-Analyse', download: 'Herunterladen', preview: 'Vorschau',
    },
    pricing: {
      title: 'Einfache, transparente Preise', subtitle: 'Wählen Sie den Plan, der zu Ihren Bedürfnissen passt',
      free: { title: 'Kostenlos', price: '$0', period: '/Monat', desc: 'Perfekt zum Ausprobieren', feature1: '100 Credits täglich', feature2: 'Grundlegendes Video-Clipping', feature3: '720p Export-Qualität', feature4: 'Wasserzeichen enthalten', cta: 'Loslegen' },
      starter: { title: 'Starter', price: '$9.9', period: '/Monat', desc: 'Für Content-Ersteller', feature1: '500 Credits täglich', feature2: 'Prioritätsverarbeitung', feature3: '1080p Export-Qualität', feature4: 'Kein Wasserzeichen', feature5: 'E-Mail-Support', cta: 'Jetzt abonnieren' },
      pro: { title: 'Pro', price: '$19.9', period: '/Monat', desc: 'Für Profis & Teams', feature1: 'Unbegrenzte Credits', feature2: 'Schnellste Verarbeitung', feature3: '4K Export-Qualität', feature4: 'Kein Wasserzeichen', feature5: 'API-Zugriff', feature6: 'Prioritäts-Support', cta: 'Jetzt abonnieren' },
    },
    login: {
      title: 'Anmelden', description: 'Zugriff auf Ihr Konto', emailLabel: 'E-Mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Passwort', passwordPlaceholder: '••••••••', submitButton: 'Anmelden', orContinueWith: 'Oder fortfahren mit', googleButton: 'Mit Google fortfahren', dontHaveAccount: 'Sie haben kein Konto?', signUp: 'Registrieren',
    },
    register: {
      title: 'Konto erstellen', description: 'Starten Sie mit Clipop AI', nameLabel: 'Vollständiger Name', namePlaceholder: 'John Doe', emailLabel: 'E-Mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Passwort', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Passwort bestätigen', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Fortfahren', sendingCode: 'Senden...', codeLabel: 'Verifizierungscode', codePlaceholder: 'Geben Sie den 6-stelligen Code ein', verifyButton: 'Konto erstellen', codeNotReceived: 'Haben Sie den Code nicht erhalten?', resendButton: 'Erneut senden', resendIn: 'Erneut senden', backButton: 'Zurück', googleButton: 'Mit Google fortfahren', alreadyHaveAccount: 'Sie haben bereits ein Konto?', signIn: 'Anmelden',
    },
    dashboard: { title: 'Dashboard', credits: 'Verfügbare Credits', creditsReset: 'Täglich um 00:00 UTC zurückgesetzt', history: 'Verarbeitungsgeschichte', noVideos: 'Noch keine Videos verarbeitet', startProcessing: 'Video-Verarbeitung starten' },
    admin: { title: 'Admin-Panel', blog: 'Blog-Verwaltung', blogCreate: 'Beitrag erstellen', blogTitle: 'Titel', blogCategory: 'Kategorie', blogContent: 'Inhalt', blogPublish: 'Veröffentlichen', blogSave: 'Entwurf speichern', blogPublished: 'Veröffentlicht', blogDraft: 'Entwurf' },
    blog: { title: 'Blog', readMore: 'Mehr lesen', noPosts: 'Noch keine Beiträge' },
    common: { loading: 'Laden...', error: 'Ein Fehler ist aufgetreten', success: 'Erfolg', cancel: 'Abbrechen', save: 'Speichern', delete: 'Löschen', edit: 'Bearbeiten', search: 'Suchen' },
  }),
  
  fr: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Accueil', blog: 'Blog', pricing: 'Tarifs', login: 'Connexion', register: 'Inscription', dashboard: 'Tableau de bord', admin: 'Panel admin', logout: 'Déconnexion', credits: 'Crédits',
    },
    home: {
      hero: {
        title: 'Transformez des vidéos longues en courts-métrages viraux',
        subtitle: 'Montage vidéo alimenté par l\'IA qui extrait automatiquement les meilleurs moments de vos contenus longs',
        cta: 'Commencer le montage gratuitement',
        secondary: 'Voir la démo',
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
      process: 'Traiter la vidéo', processing: 'Traitement...', results: 'Shorts générés', highlights: 'Analyse des points forts', download: 'Télécharger', preview: 'Aperçu',
    },
    pricing: {
      title: 'Tarifs simples et transparents', subtitle: 'Choisissez le plan qui correspond à vos besoins',
      free: { title: 'Gratuit', price: '$0', period: '/mois', desc: 'Parfait pour essayer', feature1: '100 crédits par jour', feature2: 'Montage vidéo de base', feature3: 'Qualité d\'export 720p', feature4: 'Filigrane inclus', cta: 'Commencer' },
      starter: { title: 'Démarrage', price: '$9.9', period: '/mois', desc: 'Pour les créateurs de contenu', feature1: '500 crédits par jour', feature2: 'Traitement prioritaire', feature3: 'Qualité d\'export 1080p', feature4: 'Sans filigrane', feature5: 'Support par e-mail', cta: 'S\'abonner maintenant' },
      pro: { title: 'Pro', price: '$19.9', period: '/mois', desc: 'Pour les professionnels et les équipes', feature1: 'Crédits illimités', feature2: 'Traitement le plus rapide', feature3: 'Qualité d\'export 4K', feature4: 'Sans filigrane', feature5: 'Accès API', feature6: 'Support prioritaire', cta: 'S\'abonner maintenant' },
    },
    login: {
      title: 'Se connecter', description: 'Accéder à votre compte', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Mot de passe', passwordPlaceholder: '••••••••', submitButton: 'Se connecter', orContinueWith: 'Ou continuer avec', googleButton: 'Continuer avec Google', dontHaveAccount: 'Vous n\'avez pas de compte ?', signUp: 'S\'inscrire',
    },
    register: {
      title: 'Créer un compte', description: 'Commencer avec Clipop AI', nameLabel: 'Nom complet', namePlaceholder: 'John Doe', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Mot de passe', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Confirmer le mot de passe', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Continuer', sendingCode: 'Envoi...', codeLabel: 'Code de vérification', codePlaceholder: 'Entrez le code à 6 chiffres', verifyButton: 'Créer un compte', codeNotReceived: 'Vous n\'avez pas reçu le code ?', resendButton: 'Renvoyer', resendIn: 'Renvoyer dans', backButton: 'Retour', googleButton: 'Continuer avec Google', alreadyHaveAccount: 'Vous avez déjà un compte ?', signIn: 'Se connecter',
    },
    dashboard: { title: 'Tableau de bord', credits: 'Crédits disponibles', creditsReset: 'Réinitialisé quotidiennement à 00:00 UTC', history: 'Historique des traitements', noVideos: 'Aucune vidéo traitée pour le moment', startProcessing: 'Commencer le traitement de vidéos' },
    admin: { title: 'Panel admin', blog: 'Gestion du blog', blogCreate: 'Créer un article', blogTitle: 'Titre', blogCategory: 'Catégorie', blogContent: 'Contenu', blogPublish: 'Publier', blogSave: 'Enregistrer le brouillon', blogPublished: 'Publié', blogDraft: 'Brouillon' },
    blog: { title: 'Blog', readMore: 'Lire la suite', noPosts: 'Aucun article pour le moment' },
    common: { loading: 'Chargement...', error: 'Une erreur est survenue', success: 'Succès', cancel: 'Annuler', save: 'Enregistrer', delete: 'Supprimer', edit: 'Modifier', search: 'Rechercher' },
  }),
  
  it: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Home', blog: 'Blog', pricing: 'Prezzi', login: 'Accedi', register: 'Registrati', dashboard: 'Dashboard', admin: 'Pannello admin', logout: 'Esci', credits: 'Crediti',
    },
    home: {
      hero: {
        title: 'Trasforma video lunghi in virali shorts',
        subtitle: 'Montaggio video AI-powered che estrae automaticamente i momenti migliori dai tuoi contenuti lunghi',
        cta: 'Inizia a montare gratuitamente',
        secondary: 'Guarda la demo',
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
      process: 'Elabora video', processing: 'Elaborazione...', results: 'Shorts generati', highlights: 'Analisi degli highlights', download: 'Scarica', preview: 'Anteprima',
    },
    pricing: {
      title: 'Prezzi semplici e trasparenti', subtitle: 'Scegli il piano che si adatta alle tue esigenze',
      free: { title: 'Gratuito', price: '$0', period: '/mese', desc: 'Perfetto per provare', feature1: '100 crediti al giorno', feature2: 'Montaggio video base', feature3: 'Qualità esportazione 720p', feature4: 'Inclusa filigrana', cta: 'Inizia' },
      starter: { title: 'Starter', price: '$9.9', period: '/mese', desc: 'Per i creator di contenuti', feature1: '500 crediti al giorno', feature2: 'Elaborazione prioritaria', feature3: 'Qualità esportazione 1080p', feature4: 'Senza filigrana', feature5: 'Supporto email', cta: 'Iscriviti ora' },
      pro: { title: 'Pro', price: '$19.9', period: '/mese', desc: 'Per professionisti e team', feature1: 'Crediti illimitati', feature2: 'Elaborazione più veloce', feature3: 'Qualità esportazione 4K', feature4: 'Senza filigrana', feature5: 'Accesso API', feature6: 'Supporto prioritario', cta: 'Iscriviti ora' },
    },
    login: {
      title: 'Accedi', description: 'Accedi al tuo account', emailLabel: 'Email', emailPlaceholder: 'you@example.com', passwordLabel: 'Password', passwordPlaceholder: '••••••••', submitButton: 'Accedi', orContinueWith: 'Oppure continua con', googleButton: 'Continua con Google', dontHaveAccount: 'Non hai un account?', signUp: 'Registrati',
    },
    register: {
      title: 'Crea account', description: 'Inizia con Clipop AI', nameLabel: 'Nome completo', namePlaceholder: 'John Doe', emailLabel: 'Email', emailPlaceholder: 'you@example.com', passwordLabel: 'Password', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Conferma password', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Continua', sendingCode: 'Invio...', codeLabel: 'Codice di verifica', codePlaceholder: 'Inserisci il codice a 6 cifre', verifyButton: 'Crea account', codeNotReceived: 'Non hai ricevuto il codice?', resendButton: 'Invia di nuovo', resendIn: 'Invia di nuovo in', backButton: 'Indietro', googleButton: 'Continua con Google', alreadyHaveAccount: 'Hai già un account?', signIn: 'Accedi',
    },
    dashboard: { title: 'Dashboard', credits: 'Crediti disponibili', creditsReset: 'Reimpostato ogni giorno alle 00:00 UTC', history: 'Cronologia delle elaborazioni', noVideos: 'Nessun video elaborato ancora', startProcessing: 'Inizia l\'elaborazione dei video' },
    admin: { title: 'Pannello admin', blog: 'Gestione blog', blogCreate: 'Crea post', blogTitle: 'Titolo', blogCategory: 'Categoria', blogContent: 'Contenuto', blogPublish: 'Pubblica', blogSave: 'Salva bozza', blogPublished: 'Pubblicato', blogDraft: 'Bozza' },
    blog: { title: 'Blog', readMore: 'Leggi di più', noPosts: 'Nessun post ancora' },
    common: { loading: 'Caricamento...', error: 'Si è verificato un errore', success: 'Successo', cancel: 'Annulla', save: 'Salva', delete: 'Elimina', edit: 'Modifica', search: 'Cerca' },
  }),
  
  es: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Inicio', blog: 'Blog', pricing: 'Precios', login: 'Iniciar sesión', register: 'Registrarse', dashboard: 'Panel', admin: 'Panel admin', logout: 'Cerrar sesión', credits: 'Créditos',
    },
    home: {
      hero: {
        title: 'Convierte videos largos en virales shorts',
        subtitle: 'Recorte de video impulsado por IA que extrae automáticamente los mejores momentos de tu contenido largo',
        cta: 'Comienza a recortar gratis',
        secondary: 'Ver demo',
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
      process: 'Procesar video', processing: 'Procesando...', results: 'Shorts generados', highlights: 'Análisis de highlights', download: 'Descargar', preview: 'Vista previa',
    },
    pricing: {
      title: 'Precios simples y transparentes', subtitle: 'Elige el plan que se adapte a tus necesidades',
      free: { title: 'Gratis', price: '$0', period: '/mes', desc: 'Perfecto para probar', feature1: '100 créditos diarios', feature2: 'Recorte de video básico', feature3: 'Calidad de exportación 720p', feature4: 'Incluye marca de agua', cta: 'Empezar' },
      starter: { title: 'Inicio', price: '$9.9', period: '/mes', desc: 'Para creadores de contenido', feature1: '500 créditos diarios', feature2: 'Procesamiento prioritario', feature3: 'Calidad de exportación 1080p', feature4: 'Sin marca de agua', feature5: 'Soporte por correo', cta: 'Suscríbete ahora' },
      pro: { title: 'Pro', price: '$19.9', period: '/mes', desc: 'Para profesionales y equipos', feature1: 'Créditos ilimitados', feature2: 'Procesamiento más rápido', feature3: 'Calidad de exportación 4K', feature4: 'Sin marca de agua', feature5: 'Acceso API', feature6: 'Soporte prioritario', cta: 'Suscríbete ahora' },
    },
    login: {
      title: 'Iniciar sesión', description: 'Accede a tu cuenta', emailLabel: 'Correo electrónico', emailPlaceholder: 'you@example.com', passwordLabel: 'Contraseña', passwordPlaceholder: '••••••••', submitButton: 'Iniciar sesión', orContinueWith: 'O continúa con', googleButton: 'Continúa con Google', dontHaveAccount: '¿No tienes una cuenta?', signUp: 'Registrarse',
    },
    register: {
      title: 'Crear cuenta', description: 'Empieza con Clipop AI', nameLabel: 'Nombre completo', namePlaceholder: 'John Doe', emailLabel: 'Correo electrónico', emailPlaceholder: 'you@example.com', passwordLabel: 'Contraseña', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Confirmar contraseña', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Continuar', sendingCode: 'Enviando...', codeLabel: 'Código de verificación', codePlaceholder: 'Ingresa el código de 6 dígitos', verifyButton: 'Crear cuenta', codeNotReceived: '¿No recibiste el código?', resendButton: 'Reenviar', resendIn: 'Reenviar en', backButton: 'Volver', googleButton: 'Continúa con Google', alreadyHaveAccount: '¿Ya tienes una cuenta?', signIn: 'Iniciar sesión',
    },
    dashboard: { title: 'Panel', credits: 'Créditos disponibles', creditsReset: 'Se restablece diariamente a las 00:00 UTC', history: 'Historial de procesamiento', noVideos: 'Aún no hay videos procesados', startProcessing: 'Comienza a procesar videos' },
    admin: { title: 'Panel admin', blog: 'Gestión de blog', blogCreate: 'Crear publicación', blogTitle: 'Título', blogCategory: 'Categoría', blogContent: 'Contenido', blogPublish: 'Publicar', blogSave: 'Guardar borrador', blogPublished: 'Publicado', blogDraft: 'Borrador' },
    blog: { title: 'Blog', readMore: 'Leer más', noPosts: 'Aún no hay publicaciones' },
    common: { loading: 'Cargando...', error: 'Ocurrió un error', success: 'Éxito', cancel: 'Cancelar', save: 'Guardar', delete: 'Eliminar', edit: 'Editar', search: 'Buscar' },
  }),
  
  pt: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Início', blog: 'Blog', pricing: 'Preços', login: 'Entrar', register: 'Cadastrar', dashboard: 'Painel', admin: 'Painel admin', logout: 'Sair', credits: 'Créditos',
    },
    home: {
      hero: {
        title: 'Transforme vídeos longos em virais shorts',
        subtitle: 'Recorte de vídeo impulsionado por IA que extrai automaticamente os melhores momentos do seu conteúdo longo',
        cta: 'Comece a recortar gratuitamente',
        secondary: 'Assistir demo',
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
      process: 'Processar vídeo', processing: 'Processando...', results: 'Shorts gerados', highlights: 'Análise de highlights', download: 'Baixar', preview: 'Pré-visualizar',
    },
    pricing: {
      title: 'Preços simples e transparentes', subtitle: 'Escolha o plano que atende às suas necessidades',
      free: { title: 'Gratuito', price: '$0', period: '/mês', desc: 'Perfeito para experimentar', feature1: '100 créditos diários', feature2: 'Recorte de vídeo básico', feature3: 'Qualidade de exportação 720p', feature4: 'Com marca d\'água', cta: 'Começar' },
      starter: { title: 'Iniciante', price: '$9.9', period: '/mês', desc: 'Para criadores de conteúdo', feature1: '500 créditos diários', feature2: 'Processamento prioritário', feature3: 'Qualidade de exportação 1080p', feature4: 'Sem marca d\'água', feature5: 'Suporte por e-mail', cta: 'Inscreva-se agora' },
      pro: { title: 'Pro', price: '$19.9', period: '/mês', desc: 'Para profissionais e equipes', feature1: 'Créditos ilimitados', feature2: 'Processamento mais rápido', feature3: 'Qualidade de exportação 4K', feature4: 'Sem marca d\'água', feature5: 'Acesso à API', feature6: 'Suporte prioritário', cta: 'Inscreva-se agora' },
    },
    login: {
      title: 'Entrar', description: 'Acesse sua conta', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Senha', passwordPlaceholder: '••••••••', submitButton: 'Entrar', orContinueWith: 'Ou continue com', googleButton: 'Continue com o Google', dontHaveAccount: 'Não tem uma conta?', signUp: 'Cadastrar',
    },
    register: {
      title: 'Criar conta', description: 'Comece com o Clipop AI', nameLabel: 'Nome completo', namePlaceholder: 'John Doe', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Senha', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Confirmar senha', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Continuar', sendingCode: 'Enviando...', codeLabel: 'Código de verificação', codePlaceholder: 'Digite o código de 6 dígitos', verifyButton: 'Criar conta', codeNotReceived: 'Não recebeu o código?', resendButton: 'Reenviar', resendIn: 'Reenviar em', backButton: 'Voltar', googleButton: 'Continue com o Google', alreadyHaveAccount: 'Já tem uma conta?', signIn: 'Entrar',
    },
    dashboard: { title: 'Painel', credits: 'Créditos disponíveis', creditsReset: 'Redefinido diariamente às 00:00 UTC', history: 'Histórico de processamento', noVideos: 'Nenhum vídeo processado ainda', startProcessing: 'Comece a processar vídeos' },
    admin: { title: 'Painel admin', blog: 'Gerenciamento de blog', blogCreate: 'Criar post', blogTitle: 'Título', blogCategory: 'Categoria', blogContent: 'Conteúdo', blogPublish: 'Publicar', blogSave: 'Salvar rascunho', blogPublished: 'Publicado', blogDraft: 'Rascunho' },
    blog: { title: 'Blog', readMore: 'Ler mais', noPosts: 'Nenhum post ainda' },
    common: { loading: 'Carregando...', error: 'Ocorreu um erro', success: 'Sucesso', cancel: 'Cancelar', save: 'Salvar', delete: 'Excluir', edit: 'Editar', search: 'Pesquisar' },
  }),
  
  hi: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'होम', blog: 'ब्लॉग', pricing: 'मूल्य', login: 'लॉगिन', register: 'पंजीकरण', dashboard: 'डैशबोर्ड', admin: 'एडमिन पैनल', logout: 'लॉगआउट', credits: 'क्रेडिट',
    },
    home: {
      hero: {
        title: 'लंबे वीडियो को वायरल शॉर्ट्स में बदलें',
        subtitle: 'AI-संचालित वीडियो क्लिपिंग जो आपके लंबे कंटेंट से सबसे अच्छे क्षणों को स्वचालित रूप से निकालती है',
        cta: 'मुफ्त में क्लिपिंग शुरू करें',
        secondary: 'डेमो देखें',
      },
      features: {
        title: 'शक्तिशाली AI वीडियो क्लिपिंग',
        auto: { title: 'स्वचालित हाइलाइट डिटेक्शन', desc: 'AI आपके वीडियो का विश्लेषण करती है और स्वचालित रूप से सबसे आकर्षक क्षणों की पहचान करती है' },
        multi: { title: 'मल्टी-प्लेटफॉर्म सपोर्ट', desc: 'YouTube, Bilibili से आयात करें या अपनी वीडियो फाइलें अपलोड करें' },
        quick: { title: 'त्वरित एक्सपोर्ट', desc: 'अपने क्लिप्स को कई प्रारूपों में डाउनलोड करें, किसी भी सोशल प्लेटफॉर्म के लिए तैयार' },
      },
    },
    video: {
      input: { title: 'इनपुट वीडियो', url: 'वीडियो URL (YouTube/Bilibili)', upload: 'वीडियो अपलोड करें', placeholder: 'YouTube या Bilibili वीडियो लिंक पेस्ट करें...' },
      process: 'वीडियो प्रक्रिया करें', processing: 'प्रक्रिया हो रही है...', results: 'जनरेट किए गए शॉर्ट्स', highlights: 'हाइलाइट विश्लेषण', download: 'डाउनलोड', preview: 'पूर्वावलोकन',
    },
    pricing: {
      title: 'सरल, पारदर्शी मूल्य निर्धारण', subtitle: 'अपनी जरूरतों के अनुरूप प्लान चुनें',
      free: { title: 'मुफ्त', price: '$0', period: '/महीना', desc: 'प्रयोग के लिए सही', feature1: 'दैनिक 100 क्रेडिट', feature2: 'बेसिक वीडियो क्लिपिंग', feature3: '720p एक्सपोर्ट गुणवत्ता', feature4: 'वॉटरमार्क शामिल', cta: 'शुरू करें' },
      starter: { title: 'स्टार्टर', price: '$9.9', period: '/महीना', desc: 'कंटेंट क्रिएटर्स के लिए', feature1: 'दैनिक 500 क्रेडिट', feature2: 'प्राथमिकता प्रक्रिया', feature3: '1080p एक्सपोर्ट गुणवत्ता', feature4: 'वॉटरमार्क नहीं', feature5: 'ईमेल सपोर्ट', cta: 'अभी सब्सक्राइब करें' },
      pro: { title: 'प्रो', price: '$19.9', period: '/महीना', desc: 'पेशेवरों और टीमों के लिए', feature1: 'असीमित क्रेडिट', feature2: 'तेज़तम प्रक्रिया', feature3: '4K एक्सपोर्ट गुणवत्ता', feature4: 'वॉटरमार्क नहीं', feature5: 'API एक्सेस', feature6: 'प्राथमिकता सपोर्ट', cta: 'अभी सब्सक्राइब करें' },
    },
    login: {
      title: 'लॉगिन करें', description: 'अपना खाता एक्सेस करें', emailLabel: 'ईमेल', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: '••••••••', submitButton: 'लॉगिन करें', orContinueWith: 'या इसके साथ जारी रखें', googleButton: 'Google के साथ जारी रखें', dontHaveAccount: 'खाता नहीं है?', signUp: 'पंजीकरण करें',
    },
    register: {
      title: 'खाता बनाएं', description: 'Clipop AI के साथ शुरू करें', nameLabel: 'पूरा नाम', namePlaceholder: 'John Doe', emailLabel: 'ईमेल', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'पासवर्ड की पुष्टि करें', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'जारी रखें', sendingCode: 'भेज रहा है...', codeLabel: 'सत्यापन कोड', codePlaceholder: '6-अंक का कोड दर्ज करें', verifyButton: 'खाता बनाएं', codeNotReceived: 'कोड प्राप्त नहीं हुआ?', resendButton: 'पुनः भेजें', resendIn: 'पुनः भेजें', backButton: 'वापस', googleButton: 'Google के साथ जारी रखें', alreadyHaveAccount: 'पहले से ही खाता है?', signIn: 'लॉगिन करें',
    },
    dashboard: { title: 'डैशबोर्ड', credits: 'उपलब्ध क्रेडिट', creditsReset: 'रोज 00:00 UTC पर रीसेट', history: 'प्रक्रिया इतिहास', noVideos: 'अभी तक कोई वीडियो प्रोसेस नहीं किया गया', startProcessing: 'वीडियो प्रोसेसिंग शुरू करें' },
    admin: { title: 'एडमिन पैनल', blog: 'ब्लॉग प्रबंधन', blogCreate: 'पोस्ट बनाएं', blogTitle: 'शीर्षक', blogCategory: 'श्रेणी', blogContent: 'सामग्री', blogPublish: 'प्रकाशित करें', blogSave: 'ड्राफ्ट सहेजें', blogPublished: 'प्रकाशित', blogDraft: 'ड्राफ्ट' },
    blog: { title: 'ब्लॉग', readMore: 'और पढ़ें', noPosts: 'अभी तक कोई पोस्ट नहीं' },
    common: { loading: 'लोड हो रहा है...', error: 'एक त्रुटि हुई', success: 'सफलता', cancel: 'रद्द करें', save: 'सहेजें', delete: 'हटाएं', edit: 'संपादित करें', search: 'खोजें' },
  }),

  ar: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'الرئيسية', blog: 'المدونة', pricing: 'الأسعار', login: 'تسجيل الدخول', register: 'التسجيل', dashboard: 'لوحة التحكم', admin: 'لوحة المشرف', logout: 'تسجيل الخروج', credits: 'الرصيد',
    },
    home: {
      hero: {
        title: 'حوّل مقاطع الفيديو الطويلة إلى فيديوهات قصيرة فيروسية',
        subtitle: 'تقصية الفيديو بالذكاء الاصطناعي تستخرج أفضل اللحظات تلقائيًا من المحتوى الطويل',
        cta: 'ابدأ في القص مجانًا',
        secondary: 'شاهد العرض التوضيحي',
      },
      features: {
        title: 'تقصية فيديو ذكاء اصطناعي قوية',
        auto: { title: 'اكتشاف تلقائي لأبرز اللحظات', desc: 'يقوم الذكاء الاصطناعي بتحليل الفيديو وتحديد اللحظات الأكثر إثارة تلقائيًا' },
        multi: { title: 'دعم منصات متعددة', desc: 'استيراد من YouTube أو Bilibili أو رفع ملفات الفيديو الخاصة بك' },
        quick: { title: 'تصدير سريع', desc: 'قم بتنزيل مقاطعك في تنسيقات متعددة، جاهزة لأي منصة اجتماعية' },
      },
    },
    video: {
      input: { title: 'إدخال الفيديو', url: 'رابط الفيديو (YouTube/Bilibili)', upload: 'رفع فيديو', placeholder: 'لصق رابط فيديو YouTube أو Bilibili...' },
      process: 'معالجة الفيديو', processing: 'جارٍ المعالجة...', results: 'الفيديوهات القصيرة المنتجة', highlights: 'تحليل أبرز اللحظات', download: 'تنزيل', preview: 'معاينة',
    },
    pricing: {
      title: 'أسعار بسيطة وشفافة', subtitle: 'اختر الخطة التي تناسب احتياجاتك',
      free: { title: 'مجاني', price: '$0', period: '/شهر', desc: 'مثالي للتجربة', feature1: '100 رصيد يوميًا', feature2: 'تقصية فيديو أساسية', feature3: 'جودة تصدير 720p', feature4: 'تضمين علامة مائية', cta: 'ابدأ' },
      starter: { title: 'مبتدئ', price: '$9.9', period: '/شهر', desc: 'لمنشئي المحتوى', feature1: '500 رصيد يوميًا', feature2: 'معالجة ذات أولوية', feature3: 'جودة تصدير 1080p', feature4: 'بدون علامة مائية', feature5: 'دعم عبر البريد الإلكتروني', cta: 'اشترك الآن' },
      pro: { title: 'احترافي', price: '$19.9', period: '/شهر', desc: 'للأحترافيين والفرق', feature1: 'رصيد غير محدود', feature2: 'أسرع معالجة', feature3: 'جودة تصدير 4K', feature4: 'بدون علامة مائية', feature5: 'وصول API', feature6: 'دعم ذات أولوية', cta: 'اشترك الآن' },
    },
    login: {
      title: 'تسجيل الدخول', description: 'الوصول إلى حسابك', emailLabel: 'البريد الإلكتروني', emailPlaceholder: 'you@example.com', passwordLabel: 'كلمة المرور', passwordPlaceholder: '••••••••', submitButton: 'تسجيل الدخول', orContinueWith: 'أو تابع مع', googleButton: 'تابع مع Google', dontHaveAccount: 'ليس لديك حساب؟', signUp: 'التسجيل',
    },
    register: {
      title: 'إنشاء حساب', description: 'ابدأ مع Clipop AI', nameLabel: 'الاسم الكامل', namePlaceholder: 'John Doe', emailLabel: 'البريد الإلكتروني', emailPlaceholder: 'you@example.com', passwordLabel: 'كلمة المرور', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'تأكيد كلمة المرور', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'تابع', sendingCode: 'جارٍ الإرسال...', codeLabel: 'رمز التحقق', codePlaceholder: 'أدخل الرمز المكون من 6 أرقام', verifyButton: 'إنشاء حساب', codeNotReceived: 'لم تتلق الرمز؟', resendButton: 'إعادة الإرسال', resendIn: 'إعادة الإرسال في', backButton: 'رجوع', googleButton: 'تابع مع Google', alreadyHaveAccount: 'لديك حساب بالفعل؟', signIn: 'تسجيل الدخول',
    },
    dashboard: { title: 'لوحة التحكم', credits: 'الرصيد المتاح', creditsReset: 'إعادة التعيين يوميًا في 00:00 UTC', history: 'سجل المعالجات', noVideos: 'لم تتم معالجة أي فيديو بعد', startProcessing: 'ابدأ في معالجة الفيديوهات' },
    admin: { title: 'لوحة المشرف', blog: 'إدارة المدونة', blogCreate: 'إنشاء منشور', blogTitle: 'العنوان', blogCategory: 'الفئة', blogContent: 'المحتوى', blogPublish: 'نشر', blogSave: 'حفظ المسودة', blogPublished: 'منشور', blogDraft: 'مسودة' },
    blog: { title: 'المدونة', readMore: 'اقرأ المزيد', noPosts: 'لا توجد منشورات بعد' },
    common: { loading: 'جارٍ التحميل...', error: 'حدث خطأ', success: 'نجاح', cancel: 'إلغاء', save: 'حفظ', delete: 'حذف', edit: 'تحرير', search: 'بحث' },
  }),

  bn: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'হোম', blog: 'ব্লগ', pricing: 'মূল্য', login: 'লগইন', register: 'নিবন্ধন', dashboard: 'ড্যাশবোর্ড', admin: 'অ্যাডমিন প্যানেল', logout: 'লগআউট', credits: 'ক্রেডিট',
    },
    home: {
      hero: {
        title: 'দীর্ঘ ভিডিওগুলোকে ভাইরাল শর্টে রূপান্তর করুন',
        subtitle: 'AI-চালিত ভিডিও কাটিং যা আপনার দীর্ঘ ফর্মের কন্টেন্ট থেকে সেরা মুহূর্তগুলো স্বয়ংক্রিয়ভাবে বের করে নেয়',
        cta: 'বিনামূল্যে কাটিং শুরু করুন',
        secondary: 'ডেমো দেখুন',
      },
      features: {
        title: 'শক্তিশালী AI ভিডিও কাটিং',
        auto: { title: 'স্বয়ংক্রিয় হাইলাইট সনাক্তকরণ', desc: 'AI আপনার ভিডিও বিশ্লেষণ করে এবং সবচেয়ে আকর্ষণীয় মুহূর্তগুলো স্বয়ংক্রিয়ভাবে চিহ্নিত করে' },
        multi: { title: 'মাল্টি-প্ল্যাটফর্ম সমর্থন', desc: 'YouTube, Bilibili থেকে আমদানি করুন বা নিজের ভিডিও ফাইল আপলোড করুন' },
        quick: { title: 'দ্রুত এক্সপোর্ট', desc: 'আপনার ক্লিপগুলো একাধিক ফরম্যাটে ডাউনলোড করুন, যেকোনো সোশ্যাল প্ল্যাটফর্মের জন্য প্রস্তুত' },
      },
    },
    video: {
      input: { title: 'ইনপুট ভিডিও', url: 'ভিডিও URL (YouTube/Bilibili)', upload: 'ভিডিও আপলোড করুন', placeholder: 'YouTube বা Bilibili ভিডিও লিঙ্ক পেস্ট করুন...' },
      process: 'ভিডিও প্রক্রিয়া করুন', processing: 'প্রক্রিয়াধীন...', results: 'জেনারেটেড শর্ট', highlights: 'হাইলাইট বিশ্লেষণ', download: 'ডাউনলোড', preview: 'প্রিভিউ',
    },
    pricing: {
      title: 'সহজ, স্বচ্ছ মূল্য', subtitle: 'আপনার প্রয়োজনের সাথে মিলে প্ল্যান নির্বাচন করুন',
      free: { title: 'ফ্রি', price: '$0', period: '/মাস', desc: 'চেষ্টা করার জন্য নিখুঁত', feature1: 'প্রতিদিন 100 ক্রেডিট', feature2: 'বেসিক ভিডিও কাটিং', feature3: '720p এক্সপোর্ট মান', feature4: 'ওয়াটারমার্ক অন্তর্ভুক্ত', cta: 'শুরু করুন' },
      starter: { title: 'স্টার্টার', price: '$9.9', period: '/মাস', desc: 'কনটেন্ট ক্রিয়েটরদের জন্য', feature1: 'প্রতিদিন 500 ক্রেডিট', feature2: 'অগ্রাধিকার প্রক্রিয়াকরণ', feature3: '1080p এক্সপোর্ট মান', feature4: 'কোনো ওয়াটারমার্ক নেই', feature5: 'ইমেইল সাপোর্ট', cta: 'এখনই সাবস্ক্রাইব করুন' },
      pro: { title: 'প্রো', price: '$19.9', period: '/মাস', desc: 'পেশাদার ও টিমের জন্য', feature1: 'অসীম ক্রেডিট', feature2: 'দ্রুততম প্রক্রিয়াকরণ', feature3: '4K এক্সপোর্ট মান', feature4: 'কোনো ওয়াটারমার্ক নেই', feature5: 'API অ্যাক্সেস', feature6: 'অগ্রাধিকার সাপোর্ট', cta: 'এখনই সাবস্ক্রাইব করুন' },
    },
    login: {
      title: 'লগইন করুন', description: 'আপনার অ্যাক্সেস অ্যাক্সেস করুন', emailLabel: 'ইমেইল', emailPlaceholder: 'you@example.com', passwordLabel: 'পাসওয়ার্ড', passwordPlaceholder: '••••••••', submitButton: 'লগইন করুন', orContinueWith: 'অথবা চালিয়ে যান', googleButton: 'Google দিয়ে চালিয়ে যান', dontHaveAccount: 'আপনার অ্যাকাউন্ট নেই?', signUp: 'নিবন্ধন করুন',
    },
    register: {
      title: 'অ্যাকাউন্ট তৈরি করুন', description: 'Clipop AI দিয়ে শুরু করুন', nameLabel: 'পুরো নাম', namePlaceholder: 'John Doe', emailLabel: 'ইমেইল', emailPlaceholder: 'you@example.com', passwordLabel: 'পাসওয়ার্ড', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'পাসওয়ার্ড নিশ্চিত করুন', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'চালিয়ে যান', sendingCode: 'পাঠানো হচ্ছে...', codeLabel: 'যাচাই কোড', codePlaceholder: '6-সংখ্যার কোড লিখুন', verifyButton: 'অ্যাকাউন্ট তৈরি করুন', codeNotReceived: 'কোড পাননি?', resendButton: 'পুনরায় পাঠান', resendIn: 'পুনরায় পাঠান', backButton: 'ফিরে যান', googleButton: 'Google দিয়ে চালিয়ে যান', alreadyHaveAccount: 'আপনার ইতিমধ্যে অ্যাকাউন্ট আছে?', signIn: 'লগইন করুন',
    },
    dashboard: { title: 'ড্যাশবোর্ড', credits: 'উপলব্ধ ক্রেডিট', creditsReset: 'প্রতিদিন 00:00 UTC-তে রিসেট', history: 'প্রক্রিয়াকরণ ইতিহাস', noVideos: 'এখনো কোনো ভিডিও প্রক্রিয়া করা হয়নি', startProcessing: 'ভিডিও প্রক্রিয়াকরণ শুরু করুন' },
    admin: { title: 'অ্যাডমিন প্যানেল', blog: 'ব্লগ ব্যবস্থাপনা', blogCreate: 'পোস্ট তৈরি করুন', blogTitle: 'শিরোনাম', blogCategory: 'ক্যাটাগরি', blogContent: 'কনটেন্ট', blogPublish: 'প্রকাশ করুন', blogSave: 'ড্রাফট সংরক্ষণ করুন', blogPublished: 'প্রকাশিত', blogDraft: 'ড্রাফট' },
    blog: { title: 'ব্লগ', readMore: 'আরও পড়ুন', noPosts: 'এখনো কোনো পোস্ট নেই' },
    common: { loading: 'লোড হচ্ছে...', error: 'একটি ত্রুটি ঘটেছে', success: 'সাফল্য', cancel: 'বাতিল করুন', save: 'সংরক্ষণ করুন', delete: 'মুছে ফেলুন', edit: 'সম্পাদনা করুন', search: 'অনুসন্ধান করুন' },
  }),

  id: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Beranda', blog: 'Blog', pricing: 'Harga', login: 'Masuk', register: 'Daftar', dashboard: 'Dasbor', admin: 'Panel Admin', logout: 'Keluar', credits: 'Kredit',
    },
    home: {
      hero: {
        title: 'Ubah Video Panjang Menjadi Short Viral',
        subtitle: 'Potongan video bertenaga AI yang mengekstrak momen terbaik dari konten panjangmu secara otomatis',
        cta: 'Mulai Memotong Gratis',
        secondary: 'Tonton Demo',
      },
      features: {
        title: 'Potongan Video AI yang Kuat',
        auto: { title: 'Deteksi Sorotan Otomatis', desc: 'AI menganalisis videomu dan mengidentifikasi momen paling menarik secara otomatis' },
        multi: { title: 'Dukungan Multi-Platform', desc: 'Impor dari YouTube, Bilibili, atau unggah file video sendiri' },
        quick: { title: 'Ekspor Cepat', desc: 'Unduh klipmu dalam berbagai format, siap untuk platform sosial manapun' },
      },
    },
    video: {
      input: { title: 'Video Input', url: 'URL Video (YouTube/Bilibili)', upload: 'Unggah Video', placeholder: 'Tempel tautan video YouTube atau Bilibili...' },
      process: 'Proses Video', processing: 'Memproses...', results: 'Short yang Dihasilkan', highlights: 'Analisis Sorotan', download: 'Unduh', preview: 'Pratinjau',
    },
    pricing: {
      title: 'Harga yang Sederhana dan Transparan', subtitle: 'Pilih paket yang sesuai kebutuhanmu',
      free: { title: 'Gratis', price: '$0', period: '/bulan', desc: 'Cocok untuk mencoba', feature1: '100 kredit harian', feature2: 'Potongan video dasar', feature3: 'Kualitas ekspor 720p', feature4: 'Terdapat tanda air', cta: 'Mulai' },
      starter: { title: 'Pemula', price: '$9.9', period: '/bulan', desc: 'Untuk pembuat konten', feature1: '500 kredit harian', feature2: 'Proses prioritas', feature3: 'Kualitas ekspor 1080p', feature4: 'Tanpa tanda air', feature5: 'Dukungan email', cta: 'Berlangganan Sekarang' },
      pro: { title: 'Pro', price: '$19.9', period: '/bulan', desc: 'Untuk profesional dan tim', feature1: 'Kredit tidak terbatas', feature2: 'Proses tercepat', feature3: 'Kualitas ekspor 4K', feature4: 'Tanpa tanda air', feature5: 'Akses API', feature6: 'Dukungan prioritas', cta: 'Berlangganan Sekarang' },
    },
    login: {
      title: 'Masuk', description: 'Akses akunmu', emailLabel: 'Email', emailPlaceholder: 'you@example.com', passwordLabel: 'Kata Sandi', passwordPlaceholder: '••••••••', submitButton: 'Masuk', orContinueWith: 'Atau lanjutkan dengan', googleButton: 'Lanjutkan dengan Google', dontHaveAccount: 'Tidak punya akun?', signUp: 'Daftar',
    },
    register: {
      title: 'Buat Akun', description: 'Mulai dengan Clipop AI', nameLabel: 'Nama Lengkap', namePlaceholder: 'John Doe', emailLabel: 'Email', emailPlaceholder: 'you@example.com', passwordLabel: 'Kata Sandi', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Konfirmasi Kata Sandi', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Lanjutkan', sendingCode: 'Mengirim...', codeLabel: 'Kode Verifikasi', codePlaceholder: 'Masukkan kode 6 digit', verifyButton: 'Buat Akun', codeNotReceived: 'Tidak menerima kode?', resendButton: 'Kirim Ulang', resendIn: 'Kirim ulang dalam', backButton: 'Kembali', googleButton: 'Lanjutkan dengan Google', alreadyHaveAccount: 'Sudah punya akun?', signIn: 'Masuk',
    },
    dashboard: { title: 'Dasbor', credits: 'Kredit Tersedia', creditsReset: 'Reset harian jam 00:00 UTC', history: 'Riwayat Proses', noVideos: 'Belum ada video yang diproses', startProcessing: 'Mulai Memproses Video' },
    admin: { title: 'Panel Admin', blog: 'Manajemen Blog', blogCreate: 'Buat Postingan', blogTitle: 'Judul', blogCategory: 'Kategori', blogContent: 'Konten', blogPublish: 'Terbitkan', blogSave: 'Simpan Draf', blogPublished: 'Diterbitkan', blogDraft: 'Draf' },
    blog: { title: 'Blog', readMore: 'Baca Selengkapnya', noPosts: 'Belum ada postingan' },
    common: { loading: 'Memuat...', error: 'Terjadi kesalahan', success: 'Berhasil', cancel: 'Batal', save: 'Simpan', delete: 'Hapus', edit: 'Edit', search: 'Cari' },
  }),

  ms: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Laman Utama', blog: 'Blog', pricing: 'Harga', login: 'Log Masuk', register: 'Daftar', dashboard: 'Papan Pemuka', admin: 'Panel Admin', logout: 'Log Keluar', credits: 'Kredit',
    },
    home: {
      hero: {
        title: 'Tukar Video Panjang Menjadi Pendek Viral',
        subtitle: 'Potongan video berkuasa AI yang mengekstrak momen terbaik daripada kandungan panjang anda secara automatik',
        cta: 'Mula Memotong Secara Percuma',
        secondary: 'Tonton Demo',
      },
      features: {
        title: 'Potongan Video AI yang Berkuasa',
        auto: { title: 'Pengesanan Sorotan Automatik', desc: 'AI menganalisis video anda dan mengenal pasti momen paling menarik secara automatik' },
        multi: { title: 'Sokongan Pelbagai Platform', desc: 'Import daripada YouTube, Bilibili, atau muat naik fail video anda sendiri' },
        quick: { title: 'Eksport Pantas', desc: 'Muat turun klip anda dalam pelbagai format, sedia untuk mana-mana platform sosial' },
      },
    },
    video: {
      input: { title: 'Video Input', url: 'URL Video (YouTube/Bilibili)', upload: 'Muat Naik Video', placeholder: 'Tampal pautan video YouTube atau Bilibili...' },
      process: 'Proses Video', processing: 'Memproses...', results: 'Short yang Dijana', highlights: 'Analisis Sorotan', download: 'Muat Turun', preview: 'Pratonton',
    },
    pricing: {
      title: 'Harga yang Mudah dan Telus', subtitle: 'Pilih pelan yang sesuai keperluan anda',
      free: { title: 'Percuma', price: '$0', period: '/bulan', desc: 'Sempurna untuk mencuba', feature1: '100 kredit setiap hari', feature2: 'Potongan video asas', feature3: 'Kualiti eksport 720p', feature4: 'Tanda air termasuk', cta: 'Mula' },
      starter: { title: 'Pemula', price: '$9.9', period: '/bulan', desc: 'Untuk pencipta kandungan', feature1: '500 kredit setiap hari', feature2: 'Pemprosesan keutamaan', feature3: 'Kualiti eksport 1080p', feature4: 'Tiada tanda air', feature5: 'Sokongan e-mel', cta: 'Langgan Sekarang' },
      pro: { title: 'Pro', price: '$19.9', period: '/bulan', desc: 'Untuk profesional dan pasukan', feature1: 'Kredit tanpa had', feature2: 'Pemprosesan terpantas', feature3: 'Kualiti eksport 4K', feature4: 'Tiada tanda air', feature5: 'Akses API', feature6: 'Sokongan keutamaan', cta: 'Langgan Sekarang' },
    },
    login: {
      title: 'Log Masuk', description: 'Akses akaun anda', emailLabel: 'E-mel', emailPlaceholder: 'you@example.com', passwordLabel: 'Kata Laluan', passwordPlaceholder: '••••••••', submitButton: 'Log Masuk', orContinueWith: 'Atau teruskan dengan', googleButton: 'Teruskan dengan Google', dontHaveAccount: 'Tiada akaun?', signUp: 'Daftar',
    },
    register: {
      title: 'Buat Akaun', description: 'Mula dengan Clipop AI', nameLabel: 'Nama Penuh', namePlaceholder: 'John Doe', emailLabel: 'E-mel', emailPlaceholder: 'you@example.com', passwordLabel: 'Kata Laluan', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Sahkan Kata Laluan', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Teruskan', sendingCode: 'Menghantar...', codeLabel: 'Kod Pengesahan', codePlaceholder: 'Masukkan kod 6 digit', verifyButton: 'Buat Akaun', codeNotReceived: 'Tidak menerima kod?', resendButton: 'Hantar Semula', resendIn: 'Hantar semula dalam', backButton: 'Kembali', googleButton: 'Teruskan dengan Google', alreadyHaveAccount: 'Sudah mempunyai akaun?', signIn: 'Log Masuk',
    },
    dashboard: { title: 'Papan Pemuka', credits: 'Kredit Tersedia', creditsReset: 'Set semula harian pada 00:00 UTC', history: 'Sejarah Pemprosesan', noVideos: 'Belum ada video yang diproses', startProcessing: 'Mula Memproses Video' },
    admin: { title: 'Panel Admin', blog: 'Pengurusan Blog', blogCreate: 'Buat Siaran', blogTitle: 'Tajuk', blogCategory: 'Kategori', blogContent: 'Kandungan', blogPublish: 'Terbitkan', blogSave: 'Simpan Draf', blogPublished: 'Diterbitkan', blogDraft: 'Draf' },
    blog: { title: 'Blog', readMore: 'Baca Lagi', noPosts: 'Belum ada siaran' },
    common: { loading: 'Memuat...', error: 'Ralat berlaku', success: 'Berjaya', cancel: 'Batal', save: 'Simpan', delete: 'Padam', edit: 'Edit', search: 'Cari' },
  }),

  th: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'หน้าแรก', blog: 'บล็อก', pricing: 'ราคา', login: 'เข้าสู่ระบบ', register: 'สมัคร', dashboard: 'แดชบอร์ด', admin: 'แผงควบคุมผู้ดูแล', logout: 'ออกจากระบบ', credits: 'เครดิต',
    },
    home: {
      hero: {
        title: 'แปลงวิดีโอยาวให้เป็นวิดีโอสั้นไวรัล',
        subtitle: 'การตัดวิดีโอด้วย AI ที่ดึงช่วงเวลาที่ดีที่สุดออกจากเนื้อหายาวของคุณโดยอัตโนมัติ',
        cta: 'เริ่มตัดฟรี',
        secondary: 'ดูสาธิต',
      },
      features: {
        title: 'การตัดวิดีโอด้วย AI ที่ทรงพลัง',
        auto: { title: 'ตรวจจับไฮไลท์อัตโนมัติ', desc: 'AI วิเคราะห์วิดีโอของคุณและระบุช่วงเวลาที่น่าดึงดูดที่สุดโดยอัตโนมัติ' },
        multi: { title: 'รองรับหลายแพลตฟอร์ม', desc: 'นำเข้าจาก YouTube, Bilibili หรืออัปโหลดไฟล์วิดีโอของคุณเอง' },
        quick: { title: 'ส่งออกเร็ว', desc: 'ดาวน์โหลดคลิปของคุณในหลายรูปแบบ พร้อมใช้งานสำหรับแพลตฟอร์มโซเชียลใดๆ' },
      },
    },
    video: {
      input: { title: 'วิดีโออินพุต', url: 'URL วิดีโอ (YouTube/Bilibili)', upload: 'อัปโหลดวิดีโอ', placeholder: 'วางลิงก์วิดีโอ YouTube หรือ Bilibili...' },
      process: 'ประมวลผลวิดีโอ', processing: 'กำลังประมวลผล...', results: 'วิดีโอสั้นที่สร้างขึ้น', highlights: 'การวิเคราะห์ไฮไลท์', download: 'ดาวน์โหลด', preview: 'ดูตัวอย่าง',
    },
    pricing: {
      title: 'ราคาเรียบง่ายและโปร่งใส', subtitle: 'เลือกแผนที่เหมาะกับความต้องการของคุณ',
      free: { title: 'ฟรี', price: '$0', period: '/เดือน', desc: 'สมบูรณ์แบบสำหรับการทดลอง', feature1: '100 เครดิตต่อวัน', feature2: 'การตัดวิดีโอขั้นพื้นฐาน', feature3: 'คุณภาพส่งออก 720p', feature4: 'มีลายน้ำ', cta: 'เริ่มต้น' },
      starter: { title: 'เริ่มต้น', price: '$9.9', period: '/เดือน', desc: 'สำหรับผู้สร้างเนื้อหา', feature1: '500 เครดิตต่อวัน', feature2: 'ประมวลผลล่วงหน้า', feature3: 'คุณภาพส่งออก 1080p', feature4: 'ไม่มีลายน้ำ', feature5: 'การสนับสนุนทางอีเมล', cta: 'สมัครสมาชิกตอนนี้' },
      pro: { title: 'มืออาชีพ', price: '$19.9', period: '/เดือน', desc: 'สำหรับมืออาชีพและทีม', feature1: 'เครดิตไม่จำกัด', feature2: 'ประมวลผลเร็วที่สุด', feature3: 'คุณภาพส่งออก 4K', feature4: 'ไม่มีลายน้ำ', feature5: 'การเข้าถึง API', feature6: 'การสนับสนุนล่วงหน้า', cta: 'สมัครสมาชิกตอนนี้' },
    },
    login: {
      title: 'เข้าสู่ระบบ', description: 'เข้าถึงบัญชีของคุณ', emailLabel: 'อีเมล', emailPlaceholder: 'you@example.com', passwordLabel: 'รหัสผ่าน', passwordPlaceholder: '••••••••', submitButton: 'เข้าสู่ระบบ', orContinueWith: 'หรือดำเนินการต่อด้วย', googleButton: 'ดำเนินการต่อด้วย Google', dontHaveAccount: 'ยังไม่มีบัญชี?', signUp: 'สมัคร',
    },
    register: {
      title: 'สร้างบัญชี', description: 'เริ่มต้นด้วย Clipop AI', nameLabel: 'ชื่อเต็ม', namePlaceholder: 'John Doe', emailLabel: 'อีเมล', emailPlaceholder: 'you@example.com', passwordLabel: 'รหัสผ่าน', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'ยืนยันรหัสผ่าน', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'ดำเนินการต่อ', sendingCode: 'กำลังส่ง...', codeLabel: 'รหัสยืนยัน', codePlaceholder: 'กรอกรหัส 6 หลัก', verifyButton: 'สร้างบัญชี', codeNotReceived: 'ไม่ได้รับรหัส?', resendButton: 'ส่งอีกครั้ง', resendIn: 'ส่งอีกครั้งใน', backButton: 'ย้อนกลับ', googleButton: 'ดำเนินการต่อด้วย Google', alreadyHaveAccount: 'มีบัญชีแล้ว?', signIn: 'เข้าสู่ระบบ',
    },
    dashboard: { title: 'แดชบอร์ด', credits: 'เครดิตที่มีอยู่', creditsReset: 'รีเซ็ตทุกวันเวลา 00:00 UTC', history: 'ประวัติการประมวลผล', noVideos: 'ยังไม่มีวิดีโอที่ประมวลผล', startProcessing: 'เริ่มประมวลผลวิดีโอ' },
    admin: { title: 'แผงควบคุมผู้ดูแล', blog: 'การจัดการบล็อก', blogCreate: 'สร้างโพสต์', blogTitle: 'ชื่อเรื่อง', blogCategory: 'หมวดหมู่', blogContent: 'เนื้อหา', blogPublish: 'เผยแพร่', blogSave: 'บันทึกฉบับร่าง', blogPublished: 'เผยแพร่แล้ว', blogDraft: 'ฉบับร่าง' },
    blog: { title: 'บล็อก', readMore: 'อ่านต่อ', noPosts: 'ยังไม่มีโพสต์' },
    common: { loading: 'กำลังโหลด...', error: 'เกิดข้อผิดพลาด', success: 'สำเร็จ', cancel: 'ยกเลิก', save: 'บันทึก', delete: 'ลบ', edit: 'แก้ไข', search: 'ค้นหา' },
  }),

  he: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'דף הבית', blog: 'בלוג', pricing: 'מחירים', login: 'התחברות', register: 'הרשמה', dashboard: 'לוח בקרה', admin: 'לוח ניהול', logout: 'התנתקות', credits: 'קרדיטים',
    },
    home: {
      hero: {
        title: 'הפוך סרטונים ארוכים לסירטונים קצרים וויראליים',
        subtitle: 'חיתוך וידאו מונע AI שמחלץ את הרגעים הטובים ביותר מהתוכן הארוך שלך באופן אוטומטי',
        cta: 'התחל חיתוך בחינם',
        secondary: 'צפה בהדגמה',
      },
      features: {
        title: 'חיתוך וידאו AI רב עוצמה',
        auto: { title: 'זיהוי הדגשות אוטומטי', desc: 'AI מנתח את הוידאו שלך ומזהה את הרגעים המרתקים ביותר באופן אוטומטי' },
        multi: { title: 'תמיכה בפלטפורמות מרובות', desc: 'ייבא מ-YouTube, Bilibili או העלה קבצי וידאו משלך' },
        quick: { title: 'ייצוא מהיר', desc: 'הורד את הקליפים שלך בפורמטים מרובים, מוכנים לכל פלטפורמה חברתית' },
      },
    },
    video: {
      input: { title: 'וידאו קלט', url: 'כתובת וידאו (YouTube/Bilibili)', upload: 'העלה וידאו', placeholder: 'הדבק קישור וידאו של YouTube או Bilibili...' },
      process: 'עבד וידאו', processing: 'מעבד...', results: 'סרטונים קצרים שנוצרו', highlights: 'ניתוח הדגשות', download: 'הורד', preview: 'תצוגה מקדימה',
    },
    pricing: {
      title: 'מחירים פשוטים ושקופים', subtitle: 'בחר את התוכנית שמתאימה לצרכים שלך',
      free: { title: 'חינם', price: '$0', period: '/חודש', desc: 'מושלם לניסיון', feature1: '100 קרדיטים יומיים', feature2: 'חיתוך וידאו בסיסי', feature3: 'איכות ייצוא 720p', feature4: 'סימן מים כלול', cta: 'התחל' },
      starter: { title: 'מתחיל', price: '$9.9', period: '/חודש', desc: 'ליוצרי תוכן', feature1: '500 קרדיטים יומיים', feature2: 'עיבוד עדיף', feature3: 'איכות ייצוא 1080p', feature4: 'ללא סימן מים', feature5: 'תמיכה בדוא"ל', cta: 'הירשם עכשיו' },
      pro: { title: 'פרופסיונלי', price: '$19.9', period: '/חודש', desc: 'לפרופסיונלים ולצוותים', feature1: 'קרדיטים בלתי מוגבלים', feature2: 'עיבוד מהיר ביותר', feature3: 'איכות ייצוא 4K', feature4: 'ללא סימן מים', feature5: 'גישה ל-API', feature6: 'תמיכה עדיף', cta: 'הירשם עכשיו' },
    },
    login: {
      title: 'התחברות', description: 'גש לחשבון שלך', emailLabel: 'דוא"ל', emailPlaceholder: 'you@example.com', passwordLabel: 'סיסמא', passwordPlaceholder: '••••••••', submitButton: 'התחבר', orContinueWith: 'או המשך עם', googleButton: 'המשך עם Google', dontHaveAccount: 'אין לך חשבון?', signUp: 'הרשם',
    },
    register: {
      title: 'צור חשבון', description: 'התחל עם Clipop AI', nameLabel: 'שם מלא', namePlaceholder: 'John Doe', emailLabel: 'דוא"ל', emailPlaceholder: 'you@example.com', passwordLabel: 'סיסמא', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'אמת סיסמא', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'המשך', sendingCode: 'שולח...', codeLabel: 'קוד אימות', codePlaceholder: 'הזן קוד 6 ספרות', verifyButton: 'צור חשבון', codeNotReceived: 'לא קיבלת את הקוד?', resendButton: 'שלח שוב', resendIn: 'שלח שוב בעוד', backButton: 'חזור', googleButton: 'המשך עם Google', alreadyHaveAccount: 'כבר יש לך חשבון?', signIn: 'התחבר',
    },
    dashboard: { title: 'לוח בקרה', credits: 'קרדיטים זמינים', creditsReset: 'איפוס יומי בשעה 00:00 UTC', history: 'היסטוריית עיבוד', noVideos: 'עדיין לא עובדו וידאוים', startProcessing: 'התחל עיבוד וידאוים' },
    admin: { title: 'לוח ניהול', blog: 'ניהול בלוג', blogCreate: 'צור פוסט', blogTitle: 'כותרת', blogCategory: 'קטגוריה', blogContent: 'תוכן', blogPublish: 'פרסם', blogSave: 'שמור טיוטה', blogPublished: 'פורסם', blogDraft: 'טיוטה' },
    blog: { title: 'בלוג', readMore: 'קרא עוד', noPosts: 'עדיין אין פוסטים' },
    common: { loading: 'טוען...', error: 'אירעה שגיאה', success: 'הצלחה', cancel: 'בטל', save: 'שמור', delete: 'מחק', edit: 'עריכה', search: 'חפש' },
  }),

  ru: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Главная', blog: 'Блог', pricing: 'Цены', login: 'Войти', register: 'Регистрация', dashboard: 'Панель управления', admin: 'Панель администратора', logout: 'Выйти', credits: 'Кредиты',
    },
    home: {
      hero: {
        title: 'Превратите длинные видео в вирусные шорты',
        subtitle: 'Нарезка видео с помощью ИИ, которая автоматически извлекает лучшие моменты из вашего длинного контента',
        cta: 'Начать нарезку бесплатно',
        secondary: 'Смотреть демо',
      },
      features: {
        title: 'Мощная нарезка видео ИИ',
        auto: { title: 'Автоматическое обнаружение ярких моментов', desc: 'ИИ анализирует ваше видео и автоматически определяет самые привлекательные моменты' },
        multi: { title: 'Поддержка нескольких платформ', desc: 'Импортируйте из YouTube, Bilibili или загрузите свои видеофайлы' },
        quick: { title: 'Быстрый экспорт', desc: 'Скачивайте ваши клипы в нескольких форматах, готовых для любой социальной платформы' },
      },
    },
    video: {
      input: { title: 'Входное видео', url: 'URL видео (YouTube/Bilibili)', upload: 'Загрузить видео', placeholder: 'Вставьте ссылку на видео YouTube или Bilibili...' },
      process: 'Обработать видео', processing: 'Обрабатываем...', results: 'Сгенерированные шорты', highlights: 'Анализ ярких моментов', download: 'Скачать', preview: 'Предварительный просмотр',
    },
    pricing: {
      title: 'Простые, прозрачные цены', subtitle: 'Выберите план, который подходит вашим нуждам',
      free: { title: 'Бесплатно', price: '$0', period: '/месяц', desc: 'Идеально для пробы', feature1: '100 кредитов в день', feature2: 'Базовая нарезка видео', feature3: 'Качество экспорта 720p', feature4: 'Водяной знак включён', cta: 'Начать' },
      starter: { title: 'Начальный', price: '$9.9', period: '/месяц', desc: 'Для создателей контента', feature1: '500 кредитов в день', feature2: 'Приоритетная обработка', feature3: 'Качество экспорта 1080p', feature4: 'Без водяного знака', feature5: 'Поддержка по электронной почте', cta: 'Подписаться сейчас' },
      pro: { title: 'Профессиональный', price: '$19.9', period: '/месяц', desc: 'Для профессионалов и команд', feature1: 'Неограниченные кредиты', feature2: 'Самая быстрая обработка', feature3: 'Качество экспорта 4K', feature4: 'Без водяного знака', feature5: 'Доступ к API', feature6: 'Приоритетная поддержка', cta: 'Подписаться сейчас' },
    },
    login: {
      title: 'Вход', description: 'Доступ к вашему аккаунту', emailLabel: 'Электронная почта', emailPlaceholder: 'you@example.com', passwordLabel: 'Пароль', passwordPlaceholder: '••••••••', submitButton: 'Войти', orContinueWith: 'Или продолжить с', googleButton: 'Продолжить с Google', dontHaveAccount: 'Нет аккаунта?', signUp: 'Регистрация',
    },
    register: {
      title: 'Создать аккаунт', description: 'Начать с Clipop AI', nameLabel: 'Полное имя', namePlaceholder: 'John Doe', emailLabel: 'Электронная почта', emailPlaceholder: 'you@example.com', passwordLabel: 'Пароль', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Подтвердите пароль', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Продолжить', sendingCode: 'Отправляем...', codeLabel: 'Код подтверждения', codePlaceholder: 'Введите 6-значный код', verifyButton: 'Создать аккаунт', codeNotReceived: 'Не получили код?', resendButton: 'Отправить повторно', resendIn: 'Отправить повторно через', backButton: 'Назад', googleButton: 'Продолжить с Google', alreadyHaveAccount: 'Уже есть аккаунт?', signIn: 'Войти',
    },
    dashboard: { title: 'Панель управления', credits: 'Доступные кредиты', creditsReset: 'Сброс каждый день в 00:00 UTC', history: 'История обработки', noVideos: 'Ещё не обработано ни одного видео', startProcessing: 'Начать обработку видео' },
    admin: { title: 'Панель администратора', blog: 'Управление блогом', blogCreate: 'Создать публикацию', blogTitle: 'Заголовок', blogCategory: 'Категория', blogContent: 'Контент', blogPublish: 'Опубликовать', blogSave: 'Сохранить черновик', blogPublished: 'Опубликовано', blogDraft: 'Черновик' },
    blog: { title: 'Блог', readMore: 'Читать далее', noPosts: 'Публикаций пока нет' },
    common: { loading: 'Загрузка...', error: 'Произошла ошибка', success: 'Успешно', cancel: 'Отмена', save: 'Сохранить', delete: 'Удалить', edit: 'Редактировать', search: 'Поиск' },
  }),

  ur: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'ہوم', blog: 'بلاگ', pricing: 'قیمتیں', login: 'لاگ ان', register: 'رجسٹر', dashboard: 'ڈیش بورڈ', admin: 'ایڈمن پینل', logout: 'لاگ آؤٹ', credits: 'کریڈٹس',
    },
    home: {
      hero: {
        title: 'لمبے ویڈیوز کو وائرل شارٹس میں تبدیل کریں',
        subtitle: 'AI سے چلنے والی ویڈیو کٹنگ جو آپ کے طوالت والے مواد سے بہترین لمحات خود بخود نکالتی ہے',
        cta: 'مفت میں کٹنگ شروع کریں',
        secondary: 'ڈیمو دیکھیں',
      },
      features: {
        title: 'طاقتور AI ویڈیو کٹنگ',
        auto: { title: 'آٹو ہائی لائٹ ڈیٹیکشن', desc: 'AI آپ کی ویڈیو کا تجزیہ کرتا ہے اور سب سے زیادہ دلچسپ لمحات کو خود بخود شناخت کرتا ہے' },
        multi: { title: 'ملٹی پلیٹ فارم سپورٹ', desc: 'YouTube, Bilibili سے درآمد کریں یا اپنی ویڈیو فائلیں اپ لوڈ کریں' },
        quick: { title: 'فوری ایکسپورٹ', desc: 'اپنے کلپس کو متعدد فارمیٹس میں ڈاؤن لوڈ کریں، کسی بھی سوشل پلیٹ فارم کے لیے تیار' },
      },
    },
    video: {
      input: { title: 'ان پٹ ویڈیو', url: 'ویڈیو URL (YouTube/Bilibili)', upload: 'ویڈیو اپ لوڈ کریں', placeholder: 'YouTube یا Bilibili ویڈیو لنک پیسٹ کریں...' },
      process: 'ویڈیو پروسیس کریں', processing: 'پروسیس ہو رہا ہے...', results: 'تیار کردہ شارٹس', highlights: 'ہائی لائٹ تجزیہ', download: 'ڈاؤن لوڈ', preview: 'پری ویو',
    },
    pricing: {
      title: 'سادہ، شفاف قیمتیں', subtitle: 'اپنی ضروریات کے مطابق پلان منتخب کریں',
      free: { title: 'مفت', price: '$0', period: '/مہینہ', desc: 'آزمائش کے لیے بہترین', feature1: 'روزانہ 100 کریڈٹس', feature2: 'بنیادی ویڈیو کٹنگ', feature3: '720p ایکسپورٹ معیار', feature4: 'واٹر مارک شامل ہے', cta: 'شروع کریں' },
      starter: { title: 'سٹارٹر', price: '$9.9', period: '/مہینہ', desc: 'کنٹینٹ کری ایٹرز کے لیے', feature1: 'روزانہ 500 کریڈٹس', feature2: 'ترجیحی پروسیسنگ', feature3: '1080p ایکسپورٹ معیار', feature4: 'واٹر مارک نہیں', feature5: 'ای میل سپورٹ', cta: 'ابھی سبسکرائب کریں' },
      pro: { title: 'پرو', price: '$19.9', period: '/مہینہ', desc: 'پروفیشنلز اور ٹیموں کے لیے', feature1: 'لامحدود کریڈٹس', feature2: 'سب سے تیز پروسیسنگ', feature3: '4K ایکسپورٹ معیار', feature4: 'واٹر مارک نہیں', feature5: 'API تک رسائی', feature6: 'ترجیحی سپورٹ', cta: 'ابھی سبسکرائب کریں' },
    },
    login: {
      title: 'لاگ ان', description: 'اپنے اکاؤنٹ تک رسائی حاصل کریں', emailLabel: 'ای میل', emailPlaceholder: 'you@example.com', passwordLabel: 'پاس ورڈ', passwordPlaceholder: '••••••••', submitButton: 'لاگ ان', orContinueWith: 'یا جاری رکھیں', googleButton: 'Google کے ساتھ جاری رکھیں', dontHaveAccount: 'اکاؤنٹ نہیں ہے؟', signUp: 'رجسٹر',
    },
    register: {
      title: 'اکاؤنٹ بنائیں', description: 'Clipop AI کے ساتھ شروع کریں', nameLabel: 'پورا نام', namePlaceholder: 'John Doe', emailLabel: 'ای میل', emailPlaceholder: 'you@example.com', passwordLabel: 'پاس ورڈ', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'پاس ورڈ کی تصدیق کریں', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'جاری رکھیں', sendingCode: 'بھیجا جا رہا ہے...', codeLabel: 'توثیقی کوڈ', codePlaceholder: '6 ہندسوں کا کوڈ درج کریں', verifyButton: 'اکاؤنٹ بنائیں', codeNotReceived: 'کوڈ موصول نہیں ہوا؟', resendButton: 'دوبارہ بھیجیں', resendIn: 'دوبارہ بھیجیں', backButton: 'واپس', googleButton: 'Google کے ساتھ جاری رکھیں', alreadyHaveAccount: 'پہلے سے اکاؤنٹ ہے؟', signIn: 'لاگ ان',
    },
    dashboard: { title: 'ڈیش بورڈ', credits: 'دستیاب کریڈٹس', creditsReset: 'ہر روز 00:00 UTC پر ری سیٹ', history: 'پروسیسنگ کی تاریخ', noVideos: 'ابھی تک کوئی ویڈیو پروسیس نہیں ہوئی', startProcessing: 'ویڈیو پروسیسنگ شروع کریں' },
    admin: { title: 'ایڈمن پینل', blog: 'بلاگ مینجمنٹ', blogCreate: 'پوسٹ بنائیں', blogTitle: 'عنوان', blogCategory: 'قسم', blogContent: 'مواد', blogPublish: 'شائع کریں', blogSave: 'ڈرافٹ محفوظ کریں', blogPublished: 'شائع شدہ', blogDraft: 'ڈرافٹ' },
    blog: { title: 'بلاگ', readMore: 'مزید پڑھیں', noPosts: 'ابھی کوئی پوسٹ نہیں' },
    common: { loading: 'لوڈ ہو رہا ہے...', error: 'ایک خرابی پیش آگئی', success: 'کامیابی', cancel: 'منسوخ کریں', save: 'محفوظ کریں', delete: 'حذف کریں', edit: 'ترمیم کریں', search: 'تلاش کریں' },
  }),

  tr: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Ana Sayfa', blog: 'Blog', pricing: 'Fiyatlar', login: 'Giriş Yap', register: 'Kayıt Ol', dashboard: 'Kontrol Paneli', admin: 'Yönetici Paneli', logout: 'Çıkış Yap', credits: 'Kredi',
    },
    home: {
      hero: {
        title: 'Uzun Videoları Viral Kısa Videolara Dönüştürün',
        subtitle: 'Uzun formattaki içeriğinizden en iyi anları otomatik olarak çıkaran AI destekli video kırpma',
        cta: 'Ücretsiz Kırpmaya Başla',
        secondary: 'Demoyu İzle',
      },
      features: {
        title: 'Güçlü AI Video Kırpma',
        auto: { title: 'Otomatik Öne Çıkanları Algılama', desc: 'AI videonuzu analiz eder ve en ilgi çekici anları otomatik olarak tanımlar' },
        multi: { title: 'Çoklu Platform Desteği', desc: 'YouTube, Bilibili\'den içe aktarın veya kendi video dosyalarınızı yükleyin' },
        quick: { title: 'Hızlı İhracat', desc: 'Kliplerinizi birden fazla formatta indirin, herhangi bir sosyal platform için hazır' },
      },
    },
    video: {
      input: { title: 'Giriş Videosu', url: 'Video URL\'si (YouTube/Bilibili)', upload: 'Video Yükle', placeholder: 'YouTube veya Bilibili video bağlantısını yapıştırın...' },
      process: 'Videoyu İşle', processing: 'İşleniyor...', results: 'Oluşturulan Kısa Videolar', highlights: 'Öne Çıkan Analizi', download: 'İndir', preview: 'Önizleme',
    },
    pricing: {
      title: 'Basit, Şeffaf Fiyatlandırma', subtitle: 'İhtiyaçlarınıza uygun planı seçin',
      free: { title: 'Ücretsiz', price: '$0', period: '/ay', desc: 'Denemek için mükemmel', feature1: 'Günlük 100 kredi', feature2: 'Temel video kırpma', feature3: '720p ihracat kalitesi', feature4: 'Filigran dahil', cta: 'Başla' },
      starter: { title: 'Başlangıç', price: '$9.9', period: '/ay', desc: 'İçerik oluşturucular için', feature1: 'Günlük 500 kredi', feature2: 'Öncelikli işleme', feature3: '1080p ihracat kalitesi', feature4: 'Filigran yok', feature5: 'E-posta desteği', cta: 'Şimdi Abone Ol' },
      pro: { title: 'Profesyonel', price: '$19.9', period: '/ay', desc: 'Profesyoneller ve ekipler için', feature1: 'Sınırsız kredi', feature2: 'En hızlı işleme', feature3: '4K ihracat kalitesi', feature4: 'Filigran yok', feature5: 'API erişimi', feature6: 'Öncelikli destek', cta: 'Şimdi Abone Ol' },
    },
    login: {
      title: 'Giriş Yap', description: 'Hesabınıza erişin', emailLabel: 'E-posta', emailPlaceholder: 'you@example.com', passwordLabel: 'Şifre', passwordPlaceholder: '••••••••', submitButton: 'Giriş Yap', orContinueWith: 'Veya ile devam et', googleButton: 'Google ile devam et', dontHaveAccount: 'Hesabınız yok mu?', signUp: 'Kayıt Ol',
    },
    register: {
      title: 'Hesap Oluştur', description: 'Clipop AI ile başla', nameLabel: 'Tam Ad', namePlaceholder: 'John Doe', emailLabel: 'E-posta', emailPlaceholder: 'you@example.com', passwordLabel: 'Şifre', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Şifre Tekrar', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Devam Et', sendingCode: 'Gönderiliyor...', codeLabel: 'Doğrulama Kodu', codePlaceholder: '6 haneli kodu girin', verifyButton: 'Hesap Oluştur', codeNotReceived: 'Kodu almadınız mı?', resendButton: 'Yeniden Gönder', resendIn: 'içinde yeniden gönder', backButton: 'Geri', googleButton: 'Google ile devam et', alreadyHaveAccount: 'Zaten hesabınız var mı?', signIn: 'Giriş Yap',
    },
    dashboard: { title: 'Kontrol Paneli', credits: 'Mevcut Kredi', creditsReset: 'Her gün 00:00 UTC\'de sıfırlanır', history: 'İşleme Geçmişi', noVideos: 'Henüz işlenmiş video yok', startProcessing: 'Video İşlemeyi Başlat' },
    admin: { title: 'Yönetici Paneli', blog: 'Blog Yönetimi', blogCreate: 'Gönderi Oluştur', blogTitle: 'Başlık', blogCategory: 'Kategori', blogContent: 'İçerik', blogPublish: 'Yayınla', blogSave: 'Taslak Kaydet', blogPublished: 'Yayınlandı', blogDraft: 'Taslak' },
    blog: { title: 'Blog', readMore: 'Daha Fazla Oku', noPosts: 'Henüz gönderi yok' },
    common: { loading: 'Yükleniyor...', error: 'Bir hata oluştu', success: 'Başarılı', cancel: 'İptal', save: 'Kaydet', delete: 'Sil', edit: 'Düzenle', search: 'Ara' },
  }),

  vi: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Trang Chủ', blog: 'Blog', pricing: 'Giá Cả', login: 'Đăng Nhập', register: 'Đăng Ký', dashboard: 'Bảng Điều Khiển', admin: 'Bảng Quản Trị', logout: 'Đăng Xuất', credits: 'Tín Dụng',
    },
    home: {
      hero: {
        title: 'Chuyển Video Dài Thành Video Ngắn Viral',
        subtitle: 'Cắt video được hỗ trợ bởi AI tự động trích xuất những khoảnh khắc tốt nhất từ nội dung dài của bạn',
        cta: 'Bắt Đầu Cắt Miễn Phí',
        secondary: 'Xem Demo',
      },
      features: {
        title: 'Cắt Video AI Mạnh Mẽ',
        auto: { title: 'Phát Hiện Nổi Bật Tự Động', desc: 'AI phân tích video của bạn và tự động xác định những khoảnh khắc hấp dẫn nhất' },
        multi: { title: 'Hỗ Trợ Nhiều Nền Tảng', desc: 'Nhập từ YouTube, Bilibili hoặc tải lên tệp video của riêng bạn' },
        quick: { title: 'Xuất Nhanh', desc: 'Tải xuống các clip của bạn ở nhiều định dạng, sẵn sàng cho bất kỳ nền tảng xã hội nào' },
      },
    },
    video: {
      input: { title: 'Video Đầu Vào', url: 'URL Video (YouTube/Bilibili)', upload: 'Tải Lên Video', placeholder: 'Dán liên kết video YouTube hoặc Bilibili...' },
      process: 'Xử Lý Video', processing: 'Đang Xử Lý...', results: 'Video Ngắn Được Tạo', highlights: 'Phân Tích Nổi Bật', download: 'Tải Xuống', preview: 'Xem Trước',
    },
    pricing: {
      title: 'Giá Cả Đơn Giản, Trong Suốt', subtitle: 'Chọn gói phù hợp với nhu cầu của bạn',
      free: { title: 'Miễn Phí', price: '$0', period: '/tháng', desc: 'Hoàn hảo để dùng thử', feature1: '100 tín dụng mỗi ngày', feature2: 'Cắt video cơ bản', feature3: 'Chất lượng xuất 720p', feature4: 'Có hình mờ', cta: 'Bắt Đầu' },
      starter: { title: 'Bắt Đầu', price: '$9.9', period: '/tháng', desc: 'Dành cho người sáng tạo nội dung', feature1: '500 tín dụng mỗi ngày', feature2: 'Xử lý ưu tiên', feature3: 'Chất lượng xuất 1080p', feature4: 'Không có hình mờ', feature5: 'Hỗ trợ email', cta: 'Đăng Ký Ngay' },
      pro: { title: 'Chuyên Nghiệp', price: '$19.9', period: '/tháng', desc: 'Dành cho chuyên gia và nhóm', feature1: 'Tín dụng không giới hạn', feature2: 'Xử lý nhanh nhất', feature3: 'Chất lượng xuất 4K', feature4: 'Không có hình mờ', feature5: 'Truy cập API', feature6: 'Hỗ trợ ưu tiên', cta: 'Đăng Ký Ngay' },
    },
    login: {
      title: 'Đăng Nhập', description: 'Truy cập tài khoản của bạn', emailLabel: 'Email', emailPlaceholder: 'you@example.com', passwordLabel: 'Mật Khẩu', passwordPlaceholder: '••••••••', submitButton: 'Đăng Nhập', orContinueWith: 'Hoặc tiếp tục với', googleButton: 'Tiếp tục với Google', dontHaveAccount: 'Chưa có tài khoản?', signUp: 'Đăng Ký',
    },
    register: {
      title: 'Tạo Tài Khoản', description: 'Bắt đầu với Clipop AI', nameLabel: 'Họ và Tên', namePlaceholder: 'John Doe', emailLabel: 'Email', emailPlaceholder: 'you@example.com', passwordLabel: 'Mật Khẩu', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Xác Nhận Mật Khẩu', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Tiếp Tục', sendingCode: 'Đang gửi...', codeLabel: 'Mã Xác Nhận', codePlaceholder: 'Nhập mã 6 chữ số', verifyButton: 'Tạo Tài Khoản', codeNotReceived: 'Không nhận được mã?', resendButton: 'Gửi Lại', resendIn: 'Gửi lại trong', backButton: 'Quay Lại', googleButton: 'Tiếp tục với Google', alreadyHaveAccount: 'Đã có tài khoản?', signIn: 'Đăng Nhập',
    },
    dashboard: { title: 'Bảng Điều Khiển', credits: 'Tín Dụng Có Sẵn', creditsReset: 'Đặt lại hàng ngày lúc 00:00 UTC', history: 'Lịch Sử Xử Lý', noVideos: 'Chưa có video nào được xử lý', startProcessing: 'Bắt Đầu Xử Lý Video' },
    admin: { title: 'Bảng Quản Trị', blog: 'Quản Lý Blog', blogCreate: 'Tạo Bài Viết', blogTitle: 'Tiêu Đề', blogCategory: 'Danh Mục', blogContent: 'Nội Dung', blogPublish: 'Xuất Bản', blogSave: 'Lưu Bản Nháp', blogPublished: 'Đã Xuất Bản', blogDraft: 'Bản Nháp' },
    blog: { title: 'Blog', readMore: 'Đọc Thêm', noPosts: 'Chưa có bài viết nào' },
    common: { loading: 'Đang tải...', error: 'Đã xảy ra lỗi', success: 'Thành công', cancel: 'Hủy', save: 'Lưu', delete: 'Xóa', edit: 'Chỉnh Sửa', search: 'Tìm kiếm' },
  }),

  fa: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'خانه', blog: 'وبلاگ', pricing: 'قیمت‌ها', login: 'ورود', register: 'ثبت نام', dashboard: 'داشبورد', admin: 'پنل مدیریت', logout: 'خروج', credits: 'اعتبار',
    },
    home: {
      hero: {
        title: 'ویدیوهای بلند را به شورت‌های ویروسی تبدیل کنید',
        subtitle: 'برش ویدیو با هوش مصنوعی که بهترین لحظات را از محتوای بلند شما به طور خودکار استخراج می‌کند',
        cta: 'شروع برش رایگان',
        secondary: 'تماشای دمو',
      },
      features: {
        title: 'برش ویدیو قدرتمند با هوش مصنوعی',
        auto: { title: 'تشخیص خودکار هایلایت‌ها', desc: 'هوش مصنوعی ویدیو شما را تحلیل می‌کند و جذاب‌ترین لحظات را به طور خودکار شناسایی می‌کند' },
        multi: { title: 'پشتیبانی چند پلتفرمی', desc: 'از YouTube, Bilibili وارد کنید یا فایل‌های ویدیویی خودتان را آپلود کنید' },
        quick: { title: 'صادرات سریع', desc: 'کلیپ‌های خود را در فرمت‌های متعدد دانلود کنید، آماده برای هر پلتفرم اجتماعی' },
      },
    },
    video: {
      input: { title: 'ویدیو ورودی', url: 'URL ویدیو (YouTube/Bilibili)', upload: 'آپلود ویدیو', placeholder: 'لینک ویدیو YouTube یا Bilibili را چسبانید...' },
      process: 'پردازش ویدیو', processing: 'در حال پردازش...', results: 'شورت‌های تولید شده', highlights: 'تحلیل هایلایت‌ها', download: 'دانلود', preview: 'پیش‌نمایش',
    },
    pricing: {
      title: 'قیمت‌گذاری ساده و شفاف', subtitle: 'طرحی که با نیازهای شما مطابقت دارد را انتخاب کنید',
      free: { title: 'رایگان', price: '$0', period: '/ماه', desc: 'برای امتحان عالی است', feature1: '100 اعتبار روزانه', feature2: 'برش ویدیو پایه', feature3: 'کیفیت خروجی 720p', feature4: 'واترمارک موجود است', cta: 'شروع' },
      starter: { title: 'شروع', price: '$9.9', period: '/ماه', desc: 'برای سازندگان محتوا', feature1: '500 اعتبار روزانه', feature2: 'پردازش اولویت‌دار', feature3: 'کیفیت خروجی 1080p', feature4: 'بدون واترمارک', feature5: 'پشتیبانی ایمیل', cta: 'همین حالا اشتراک بگیرید' },
      pro: { title: 'حرفه‌ای', price: '$19.9', period: '/ماه', desc: 'برای حرفه‌ای‌ها و تیم‌ها', feature1: 'اعتبار نامحدود', feature2: 'سریع‌ترین پردازش', feature3: 'کیفیت خروجی 4K', feature4: 'بدون واترمارک', feature5: 'دسترسی API', feature6: 'پشتیبانی اولویت‌دار', cta: 'همین حالا اشتراک بگیرید' },
    },
    login: {
      title: 'ورود', description: 'به حساب خود دسترسی پیدا کنید', emailLabel: 'ایمیل', emailPlaceholder: 'you@example.com', passwordLabel: 'رمز عبور', passwordPlaceholder: '••••••••', submitButton: 'ورود', orContinueWith: 'یا ادامه با', googleButton: 'ادامه با Google', dontHaveAccount: 'حساب ندارید؟', signUp: 'ثبت نام',
    },
    register: {
      title: 'ایجاد حساب', description: 'شروع با Clipop AI', nameLabel: 'نام کامل', namePlaceholder: 'John Doe', emailLabel: 'ایمیل', emailPlaceholder: 'you@example.com', passwordLabel: 'رمز عبور', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'تأیید رمز عبور', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'ادامه', sendingCode: 'در حال ارسال...', codeLabel: 'کد تأیید', codePlaceholder: 'کد 6 رقمی را وارد کنید', verifyButton: 'ایجاد حساب', codeNotReceived: 'کد را دریافت نکردید؟', resendButton: 'ارسال مجدد', resendIn: 'ارسال مجدد در', backButton: 'بازگشت', googleButton: 'ادامه با Google', alreadyHaveAccount: 'از قبل حساب دارید؟', signIn: 'ورود',
    },
    dashboard: { title: 'داشبورد', credits: 'اعتبار موجود', creditsReset: 'بازنشانی روزانه در 00:00 UTC', history: 'تاریخچه پردازش', noVideos: 'هنوز هیچ ویدیویی پردازش نشده است', startProcessing: 'شروع پردازش ویدیوها' },
    admin: { title: 'پنل مدیریت', blog: 'مدیریت وبلاگ', blogCreate: 'ایجاد پست', blogTitle: 'عنوان', blogCategory: 'دسته بندی', blogContent: 'محتوا', blogPublish: 'انتشار', blogSave: 'ذخیره پیشنویس', blogPublished: 'منتشر شده', blogDraft: 'پیشنویس' },
    blog: { title: 'وبلاگ', readMore: 'ادامه مطلب', noPosts: 'هنوز هیچ پستی نیست' },
    common: { loading: 'در حال بارگذاری...', error: 'خطایی رخ داد', success: 'موفقیت', cancel: 'لغو', save: 'ذخیره', delete: 'حذف', edit: 'ویرایش', search: 'جستجو' },
  }),

  mr: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'मुख्यपृष्ठ', blog: 'ब्लॉग', pricing: 'किंमती', login: 'लॉगिन', register: 'नोंदणी', dashboard: 'डॅशबोर्ड', admin: 'अॅडमिन पॅनेल', logout: 'लॉगआउट', credits: 'क्रेडिटस',
    },
    home: {
      hero: {
        title: 'लांब व्हिडिओज व्हायरल शॉर्ट्समध्ये रूपांतरित करा',
        subtitle: 'AI-संचालित व्हिडिओ कटिंग जे तुमच्या दीर्घ सामग्रीमधून उत्कृष्ट क्षणे स्वयंचलितपणे काढते',
        cta: 'विनामूल्य कटिंग सुरू करा',
        secondary: 'डेमो पहा',
      },
      features: {
        title: 'शक्तिशाली AI व्हिडिओ कटिंग',
        auto: { title: 'ऑटो हायलाइट डिटेक्शन', desc: 'AI तुमचे व्हिडिओ विश्लेषण करतो आणि सर्वात आकर्षक क्षणे स्वयंचलितपणे ओळखतो' },
        multi: { title: 'मल्टी-प्लॅटफॉर्म सपोर्ट', desc: 'YouTube, Bilibili मधून आयात करा किंवा तुमचे स्वतःचे व्हिडिओ फाईल्स अपलोड करा' },
        quick: { title: 'जलद एक्सपोर्ट', desc: 'तुमचे क्लिप्स अनेक स्वरूपात डाउनलोड करा, कोणत्याही सोशल प्लॅटफॉर्मसाठी तयार' },
      },
    },
    video: {
      input: { title: 'इनपुट व्हिडिओ', url: 'व्हिडिओ URL (YouTube/Bilibili)', upload: 'व्हिडिओ अपलोड करा', placeholder: 'YouTube किंवा Bilibili व्हिडिओ लिंक पेस्ट करा...' },
      process: 'व्हिडिओ प्रक्रिया करा', processing: 'प्रक्रिया होत आहे...', results: 'निर्माण केलेले शॉर्ट्स', highlights: 'हायलाइट विश्लेषण', download: 'डाउनलोड', preview: 'पूर्वावलोकन',
    },
    pricing: {
      title: 'सोपी, पारदर्शक किंमती', subtitle: 'तुमच्या गरजेनुसार योजना निवडा',
      free: { title: 'विनामूल्य', price: '$0', period: '/मास', desc: 'वापरण्यासाठी उत्कृष्ट', feature1: 'दररोज 100 क्रेडिट्स', feature2: 'बेसिक व्हिडिओ कटिंग', feature3: '720p एक्सपोर्ट गुणवत्ता', feature4: 'वॉटरमार्क समाविष्ट', cta: 'सुरू करा' },
      starter: { title: 'स्टार्टर', price: '$9.9', period: '/मास', desc: 'कंटेंट क्रिएटर्ससाठी', feature1: 'दररोज 500 क्रेडिट्स', feature2: 'प्राधान्य प्रक्रिया', feature3: '1080p एक्सपोर्ट गुणवत्ता', feature4: 'वॉटरमार्क नाही', feature5: 'इमेल सपोर्ट', cta: 'सदस्यता घ्या आता' },
      pro: { title: 'प्रो', price: '$19.9', period: '/मास', desc: 'प्रोफेशनल्स आणि टीमसाठी', feature1: 'अमर्यादित क्रेडिट्स', feature2: 'सर्वात जलद प्रक्रिया', feature3: '4K एक्सपोर्ट गुणवत्ता', feature4: 'वॉटરमार्क नाही', feature5: 'API ऍक्सेस', feature6: 'प्राधान्य सपोर्ट', cta: 'सदस्यता घ्या आता' },
    },
    login: {
      title: 'लॉगिन', description: 'तुमच्या खात्यात प्रवेश करा', emailLabel: 'इमेल', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: '••••••••', submitButton: 'लॉगिन', orContinueWith: 'किंवा चालू ठेवा', googleButton: 'Google सह चालू ठेवा', dontHaveAccount: 'खाते नाही?', signUp: 'नोंदणी',
    },
    register: {
      title: 'खाते तयार करा', description: 'Clipop AI सह सुरू करा', nameLabel: 'पूर्ण नाव', namePlaceholder: 'John Doe', emailLabel: 'इमेल', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'पासवर्ड पुष्टी करा', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'चालू ठेवा', sendingCode: 'पाठवत आहे...', codeLabel: 'सत्यापन कोड', codePlaceholder: '6-अंकांचा कोड प्रविष्ट करा', verifyButton: 'खाते तयार करा', codeNotReceived: 'कोड मिळाला नाही?', resendButton: 'पुन्हा पाठवा', resendIn: 'पुन्हा पाठवा', backButton: 'मागे जा', googleButton: 'Google सह चालू ठेवा', alreadyHaveAccount: 'आधीच खाते आहे?', signIn: 'लॉगिन',
    },
    dashboard: { title: 'डॅशबोर्ड', credits: 'उपलब्ध क्रेडिट्स', creditsReset: 'दररोज 00:00 UTC वर रीसेट', history: 'प्रक्रिया इतिहास', noVideos: 'अद्याप कोणतेही व्हिडिओ प्रक्रिया केलेले नाही', startProcessing: 'व्हिडिओ प्रक्रिया सुरू करा' },
    admin: { title: 'अॅडमिन पॅनेल', blog: 'ब्लॉग मॅनेजमेंट', blogCreate: 'पोस्ट तयार करा', blogTitle: 'शीर्षक', blogCategory: 'श्रेणी', blogContent: 'सामग्री', blogPublish: 'प्रकाशित करा', blogSave: 'मसुदा सेव्ह करा', blogPublished: 'प्रकाशित', blogDraft: 'मसुदा' },
    blog: { title: 'ब्लॉग', readMore: 'अधिक वाचा', noPosts: 'अद्याप कोणतीही पोस्ट नाही' },
    common: { loading: 'लोड होत आहे...', error: 'त्रुटी आली', success: 'यश', cancel: 'रद्द करा', save: 'सेव्ह करा', delete: 'हटवा', edit: 'संपादित करा', search: 'शोधा' },
  }),

  ta: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'முகப்பு', blog: 'ப்லாக்', pricing: 'விலைகள்', login: 'உள்நுழைய', register: 'பதிவு செய்ய', dashboard: 'டாஷ்போர்டு', admin: 'நிர்வாக குழு', logout: 'வெளியேறு', credits: 'கிரெடிட்டுகள்',
    },
    home: {
      hero: {
        title: 'நீண்ட வீடியோக்களை வைரல் ஷார்ட்ஸாக மாற்று',
        subtitle: 'AI ஆல் இயங்கும் வீடியோ வெட்டுதல் உங்கள் நீண்ட உள்ளடக்கத்திலிருந்து சிறந்த நேரங்களை தானாக பிரித்தெடுக்கிறது',
        cta: 'இலவசமாக வெட்டுவதைத் தொடங்கு',
        secondary: 'டிமோவைப் பார்க்கவும்',
      },
      features: {
        title: 'சக்திவாய்ந்த AI வீடியோ வெட்டுதல்',
        auto: { title: 'தானியங்கி ஹைலைட் கண்டறிதல்', desc: 'AI உங்கள் வீடியோவை பகுப்பாய்வு செய்து, மிகவும் கவர்ச்சிகரமான நேரங்களை தானாக அடையாளம் காண்கிறது' },
        multi: { title: 'பல தள ஆதரவு', desc: 'YouTube, Bilibili இலிருந்து இறக்குமதி செய்யவும் அல்லது உங்கள் சொந்த வீடியோ கோப்புகளைப் பதிவேற்றவும்' },
        quick: { title: 'விரைவான ஏற்றுமதி', desc: 'உங்கள் கிளிப்களை பல வடிவங்களில் பதிவிறக்கவும், எந்த சமூக தளத்திற்கும் தயாராக இருக்கும்' },
      },
    },
    video: {
      input: { title: 'உள்ளீடு வீடியோ', url: 'வீடியோ URL (YouTube/Bilibili)', upload: 'வீடியோவைப் பதிவேற்று', placeholder: 'YouTube அல்லது Bilibili வீடியோ இணைப்பை ஒட்டவும்...' },
      process: 'வீடியோவை செயலாக்கு', processing: 'செயலாக்கிக்கொண்டிருக்கிறது...', results: 'உருவாக்கப்பட்ட ஷார்ட்ஸ்', highlights: 'ஹைலைட் பகுப்பாய்வு', download: 'பதிவிறக்கு', preview: 'முன்னோக்கி',
    },
    pricing: {
      title: 'எளிய, வெளிப்படையான விலைமுறை', subtitle: 'உங்கள் தேவைகளுக்கு பொருந்தும் திட்டத்தைத் தேர்ந்தெடுக்கவும்',
      free: { title: 'இலவசம்', price: '$0', period: '/மாதம்', desc: 'முயற்சிக்கு ஏற்றது', feature1: 'தினமும் 100 கிரெடிட்டுகள்', feature2: 'அடிப்படை வீடியோ வெட்டுதல்', feature3: '720p ஏற்றுமதி தரம்', feature4: 'நீர்மடம் சேர்க்கப்பட்டுள்ளது', cta: 'தொடங்கு' },
      starter: { title: 'தொடக்க நிலை', price: '$9.9', period: '/மாதம்', desc: 'உள்ளடக்க உருவாக்கிகளுக்கு', feature1: 'தினமும் 500 கிரெடிட்டுகள்', feature2: 'முன்னுரிமை செயலாக்கம்', feature3: '1080p ஏற்றுமதி தரம்', feature4: 'நீர்மடம் இல்லை', feature5: 'மின்னஞ்சல் ஆதரவு', cta: 'இப்போதே குழுசேர்' },
      pro: { title: 'தொழில்முறை', price: '$19.9', period: '/மாதம்', desc: 'தொழில்முறையவர்கள் மற்றும் குழுக்களுக்கு', feature1: 'வரையறுக்கப்படாத கிரெடிட்டுகள்', feature2: 'வேகமான செயலாக்கம்', feature3: '4K ஏற்றுமதி தரம்', feature4: 'நீர்மடம் இல்லை', feature5: 'API அணுகல்', feature6: 'முன்னுரிமை ஆதரவு', cta: 'இப்போதே குழுசேர்' },
    },
    login: {
      title: 'உள்நுழைய', description: 'உங்கள் கணக்கை அணுகவும்', emailLabel: 'மின்னஞ்சல்', emailPlaceholder: 'you@example.com', passwordLabel: 'கடவுச்சொல்', passwordPlaceholder: '••••••••', submitButton: 'உள்நுழைய', orContinueWith: 'அல்லது தொடர்ந்து', googleButton: 'Google உடன் தொடர்ந்து', dontHaveAccount: 'கணக்கு இல்லையா?', signUp: 'பதிவு செய்ய',
    },
    register: {
      title: 'கணக்கை உருவாக்கு', description: 'Clipop AI உடன் தொடங்கு', nameLabel: 'முழு பெயர்', namePlaceholder: 'John Doe', emailLabel: 'மின்னஞ்சல்', emailPlaceholder: 'you@example.com', passwordLabel: 'கடவுச்சொல்', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'கடவுச்சொல்லை உறுதிப்படுத்து', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'தொடர்ந்து', sendingCode: 'அனுப்புகிறது...', codeLabel: 'சரிபார்ப்பு குறியீடு', codePlaceholder: '6-இலக்க குறியீட்டை உள்ளிடவும்', verifyButton: 'கணக்கை உருவாக்கு', codeNotReceived: 'குறியீடு பெறவில்லையா?', resendButton: 'மறுபடியும் அனுப்பு', resendIn: 'மறுபடியும் அனுப்பு', backButton: 'பின்கொடு', googleButton: 'Google உடன் தொடர்ந்து', alreadyHaveAccount: 'ஏற்கனவே கணக்கு உள்ளதா?', signIn: 'உள்நுழைய',
    },
    dashboard: { title: 'டாஷ்போர்டு', credits: 'கிடைக்கும் கிரெடிட்டுகள்', creditsReset: 'ஒவ்வொரு நாளும் 00:00 UTC யில் மீட்டமைக்கப்படும்', history: 'செயலாக்க வரலாறு', noVideos: 'இதுவரை எந்த வீடியோவும் செயலாக்கப்படவில்லை', startProcessing: 'வீடியோ செயலாக்கத்தைத் தொடங்கு' },
    admin: { title: 'நிர்வாக குழு', blog: 'ப்லாக் மேலாண்மை', blogCreate: 'போஸ்ட்டை உருவாக்கு', blogTitle: 'தலைப்பு', blogCategory: 'வகை', blogContent: 'உள்ளடக்கம்', blogPublish: 'வெளியிடு', blogSave: 'வரைவு சேமிக்கவும்', blogPublished: 'வெளியிடப்பட்டது', blogDraft: 'வரைவு' },
    blog: { title: 'ப்லாக்', readMore: 'மேலும் வாசிக்க', noPosts: 'இதுவரை எந்த போஸ்டும் இல்லை' },
    common: { loading: 'ஏற்றுகிறது...', error: 'பிழை ஏற்பட்டது', success: 'வெற்றி', cancel: 'ரத்து செய்', save: 'சேமி', delete: 'நீக்கு', edit: 'திருத்து', search: 'தேடு' },
  }),

  pl: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Strona główna', blog: 'Blog', pricing: 'Cennik', login: 'Zaloguj się', register: 'Zarejestruj się', dashboard: 'Panel', admin: 'Panel administracyjny', logout: 'Wyloguj się', credits: 'Kredyty',
    },
    home: {
      hero: {
        title: 'Przekształć Długie Filmy W Viralne Shorts',
        subtitle: 'Kadrowanie wideo z AI, który automatycznie wyodrębnia najlepsze chwile z Twojego długiego materiału',
        cta: 'Zacznij Kadrować Za Darmo',
        secondary: 'Obejrzyj Demo',
      },
      features: {
        title: 'Potężne Kadrowanie Wideo z AI',
        auto: { title: 'Automatyczne Wykrywanie Najważniejszych Chwil', desc: 'AI analizuje Twoje wideo i automatycznie identyfikuje najciekawsze chwile' },
        multi: { title: 'Obsługa Wielu Platform', desc: 'Importuj z YouTube, Bilibili lub wgraj własne pliki wideo' },
        quick: { title: 'Szybki Eksport', desc: 'Pobieraj swoje klipy w wielu formatach, gotowe do dowolnej platformy społecznościowej' },
      },
    },
    video: {
      input: { title: 'Wejściowe Wideo', url: 'URL Wideo (YouTube/Bilibili)', upload: 'Wgraj Wideo', placeholder: 'Wklej link do wideo YouTube lub Bilibili...' },
      process: 'Przetwórz Wideo', processing: 'Przetwarzanie...', results: 'Wygenerowane Shorts', highlights: 'Analiza Najważniejszych Chwil', download: 'Pobierz', preview: 'Podgląd',
    },
    pricing: {
      title: 'Proste, Przezroczyste Ceny', subtitle: 'Wybierz plan pasujący do Twoich potrzeb',
      free: { title: 'Darmowy', price: '$0', period: '/miesiąc', desc: 'Idealny do wypróbowania', feature1: '100 kredytów dziennie', feature2: 'Podstawowe kadrowanie wideo', feature3: 'Jakość eksportu 720p', feature4: 'Znak wodny zawarty', cta: 'Zacznij' },
      starter: { title: 'Startowy', price: '$9.9', period: '/miesiąc', desc: 'Dla twórców treści', feature1: '500 kredytów dziennie', feature2: 'Priorytetowe przetwarzanie', feature3: 'Jakość eksportu 1080p', feature4: 'Brak znaku wodnego', feature5: 'Wsparcie e-mailowe', cta: 'Subskrybuj Teraz' },
      pro: { title: 'Profesjonalny', price: '$19.9', period: '/miesiąc', desc: 'Dla profesjonalistów i zespołów', feature1: 'Nieograniczone kredyty', feature2: 'Najszybsze przetwarzanie', feature3: 'Jakość eksportu 4K', feature4: 'Brak znaku wodnego', feature5: 'Dostęp do API', feature6: 'Priorytetowe wsparcie', cta: 'Subskrybuj Teraz' },
    },
    login: {
      title: 'Logowanie', description: 'Dostęp do Twojego konta', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Hasło', passwordPlaceholder: '••••••••', submitButton: 'Zaloguj się', orContinueWith: 'Lub kontynuuj z', googleButton: 'Kontynuuj z Google', dontHaveAccount: 'Nie masz konta?', signUp: 'Zarejestruj się',
    },
    register: {
      title: 'Utwórz Konto', description: 'Zacznij z Clipop AI', nameLabel: 'Imię i Nazwisko', namePlaceholder: 'John Doe', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Hasło', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Potwierdź Hasło', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Kontynuuj', sendingCode: 'Wysyłanie...', codeLabel: 'Kod Weryfikacyjny', codePlaceholder: 'Wprowadź 6-cyfrowy kod', verifyButton: 'Utwórz Konto', codeNotReceived: 'Nie otrzymałeś kodu?', resendButton: 'Wyślij Ponownie', resendIn: 'Wyślij ponownie w ciągu', backButton: 'Wstecz', googleButton: 'Kontynuuj z Google', alreadyHaveAccount: 'Masz już konto?', signIn: 'Zaloguj się',
    },
    dashboard: { title: 'Panel', credits: 'Dostępne Kredyty', creditsReset: 'Reset codziennie o 00:00 UTC', history: 'Historia Przetwarzania', noVideos: 'B jeszcze przetworzonych filmów', startProcessing: 'Rozpocznij Przetwarzanie Wideo' },
    admin: { title: 'Panel administracyjny', blog: 'Zarządzanie Blogiem', blogCreate: 'Utwórz Post', blogTitle: 'Tytuł', blogCategory: 'Kategoria', blogContent: 'Treść', blogPublish: 'Opublikuj', blogSave: 'Zapisz Wersję Roboczą', blogPublished: 'Opublikowano', blogDraft: 'Wersja Robocza' },
    blog: { title: 'Blog', readMore: 'Czytaj Dalej', noPosts: 'Nie ma jeszcze postów' },
    common: { loading: 'Ładowanie...', error: 'Wystąpił błąd', success: 'Sukces', cancel: 'Anuluj', save: 'Zapisz', delete: 'Usuń', edit: 'Edytuj', search: 'Szukaj' },
  }),

  te: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'హోమ్', blog: 'బ్లాగ్', pricing: 'ధరలు', login: 'లాగిన్', register: 'రిజిస్టర్', dashboard: 'డాష్బోర్డ్', admin: 'అడ్మిన్ ప్యానెల్', logout: 'లాగ్ఔట్', credits: 'క్రెడిట్స్',
    },
    home: {
      hero: {
        title: 'పొడవైన వీడియోలను వైరల్ షార్ట్‌లుగా మార్చండి',
        subtitle: 'AI సహాయంతో వీడియో కటింగ్ మీ పొడవైన కంటెంట్‌నుండి ఉత్తమ క్షణాలను స్వయంచాలకంగా తీసుకుంటుంది',
        cta: 'ఉచితంగా కటింగ్ ప్రారంభించండి',
        secondary: 'డేమోను చూడండి',
      },
      features: {
        title: 'శక్తివంతమైన AI వీడియో కటింగ్',
        auto: { title: 'ఆటో హైలైట్ డిటెక్షన్', desc: 'AI మీ వీడియోను విశ్లేషిస్తుంది మరియు అత్యంత ఆకర్షణీయమైన క్షణాలను స్వయంచాలకంగా గుర్తిస్తుంది' },
        multi: { title: 'మల్టీ-ప్లాట్‌ఫార్మ్ సపోర్ట్', desc: 'YouTube, Bilibili నుండి దిగుమతించండి లేదా మీ సొంత వీడియో ఫైళ్లను అప్‌లోడ్ చేయండి' },
        quick: { title: 'త్వరణ ఎక్స్‌పోర్ట్', desc: 'మీ క్లిప్‌లను అనేక ఫార్మాట్‌లలో డౌన్‌లోడ్ చేయండి, ఏదైనా సోషల్ ప్లాట్‌ఫార్మ్‌కు సిద్ధంగా ఉంటుంది' },
      },
    },
    video: {
      input: { title: 'ఇన్‌పుట్ వీడియో', url: 'వీడియో URL (YouTube/Bilibili)', upload: 'వీడియో అప్‌లోడ్ చేయండి', placeholder: 'YouTube లేదా Bilibili వీడియో లింక్‌ను పేస్ట్ చేయండి...' },
      process: 'వీడియోను ప్రాసెస్ చేయండి', processing: 'ప్రాసెస్ అవుతోంది...', results: 'తయారైన షార్ట్‌లు', highlights: 'హైలైట్ విశ్లేషణ', download: 'డౌన్‌లోడ్', preview: 'ప్రివ్యూ',
    },
    pricing: {
      title: 'సులభ, పారదర్శక ధరలు', subtitle: 'మీ అవసరాలకు సరైన ప్లాన్‌ను ఎంచుకోండి',
      free: { title: 'ఉచితం', price: '$0', period: '/నెల', desc: 'ప్రయత్నించడానికి పరిపూర్ణం', feature1: 'రోజుకు 100 క్రెడిట్స్', feature2: 'ప్రాథమిక వీడియో కటింగ్', feature3: '720p ఎక్స్‌పోర్ట్ నాణ్యత', feature4: 'వాటర్‌మార్క్ కలవు', cta: 'ప్రారంభించండి' },
      starter: { title: 'స్టార్టర్', price: '$9.9', period: '/నెల', desc: 'కంటెంట్ క్రియేటర్ల కోసం', feature1: 'రోజుకు 500 క్రెడిట్స్', feature2: 'ప్రాధాన్యత ప్రాసెసింగ్', feature3: '1080p ఎక్స్‌పోర్ట్ నాణ్యత', feature4: 'వాటర్‌మార్క్ లేదు', feature5: 'ఇమెయిల్ సపోర్ట్', cta: 'ఇప్పుడే సబ్‌స్క్రైబ్ చేయండి' },
      pro: { title: 'ప్రో', price: '$19.9', period: '/నెల', desc: 'ప్రొఫెషనల్స్ & టీమల కోసం', feature1: 'అపరిమిత క్రెడిట్స్', feature2: 'వేగవంతమైన ప్రాసెసింగ్', feature3: '4K ఎక్స్‌పోర్ట్ నాణ్యత', feature4: 'వాటర్‌మార్క్ లేదు', feature5: 'API యాక్సెస్', feature6: 'ప్రాధాన్యత సపోర్ట్', cta: 'ఇప్పుడే సబ్‌స్క్రైబ్ చేయండి' },
    },
    login: {
      title: 'లాగిన్', description: 'మీ ఖాతాను యాక్సెస్ చేయండి', emailLabel: 'ఇమెయిల్', emailPlaceholder: 'you@example.com', passwordLabel: 'పాస్‌వర్డ్', passwordPlaceholder: '••••••••', submitButton: 'లాగిన్', orContinueWith: 'లేదా కొనసాగించు', googleButton: 'Google తో కొనసాగించు', dontHaveAccount: 'ఖాతం లేదా?', signUp: 'రిజిస్టర్',
    },
    register: {
      title: 'ఖాతాను సృష్టించండి', description: 'Clipop AI తో ప్రారంభించండి', nameLabel: 'పూర్తి పేరు', namePlaceholder: 'John Doe', emailLabel: 'ఇమెయిల్', emailPlaceholder: 'you@example.com', passwordLabel: 'పాస్‌వర్డ్', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'పాస్‌వర్డ్ నిర్ధారించండి', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'కొనసాగించు', sendingCode: 'పంపుతోంది...', codeLabel: 'వెరిఫికేషన్ కోడ్', codePlaceholder: '6-అంకెల కోడ్‌ను నమోదు చేయండి', verifyButton: 'ఖాతాను సృష్టించండి', codeNotReceived: 'కోడ్ అందలేదా?', resendButton: 'మళ్ళీ పంపండి', resendIn: 'మళ్ళీ పంపండి', backButton: 'తిరిగి', googleButton: 'Google తో కొనసాగించు', alreadyHaveAccount: 'ఇప్పటికే ఖాతం ఉందా?', signIn: 'లాగిన్',
    },
    dashboard: { title: 'డాష్బోర్డ్', credits: 'అందుబాటులో ఉన్న క్రెడిట్స్', creditsReset: 'ప్రతిరోజు 00:00 UTC వద్ద రీసెట్', history: 'ప్రాసెసింగ్ చరిత్ర', noVideos: 'ఇంకా ఏ వీడియోలు ప్రాసెస్ చేయబడలేదు', startProcessing: 'వీడియో ప్రాసెసింగ్ ప్రారంభించండి' },
    admin: { title: 'అడ్మిన్ ప్యానెల్', blog: 'బ్లాగ్ మేనేజ్‌మెంట్', blogCreate: 'పోస్ట్ సృష్టించండి', blogTitle: 'శీర్షిక', blogCategory: 'వర్గం', blogContent: 'కంటెంట్', blogPublish: 'ప్రచురించు', blogSave: 'డ్రాఫ్ట్ సేవ్ చేయండి', blogPublished: 'ప్రచురించబడింది', blogDraft: 'డ్రాఫ్ట్' },
    blog: { title: 'బ్లాగ్', readMore: 'మరింత చదవండి', noPosts: 'ఇంకా పోస్ట్‌లు లేవు' },
    common: { loading: 'లోడ్ అవుతోంది...', error: 'లోపం సంభవించింది', success: 'విజయం', cancel: 'రద్దు చేయండి', save: 'సేవ్ చేయండి', delete: 'తొలగించు', edit: 'సవరించు', search: 'శోధించు' },
  }),

  ne: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'होम', blog: 'ब्लग', pricing: 'मूल्यहरू', login: 'लगइन', register: 'रजिस्टर', dashboard: 'ड्यासबोर्ड', admin: 'व्यवस्थापक प्यानेल', logout: 'लगआउट', credits: 'क्रेडिट्स',
    },
    home: {
      hero: {
        title: 'लामो भिडियोहरूलाई भाइरल सर्टहरूमा रूपान्तरण गर्नुहोस्',
        subtitle: 'AI-संचालित भिडियो काट्ने जसले तपाईंको लामो सामग्रीबाट उत्कृष्ट क्षणहरू स्वचालित रूपमा निकाल्छ',
        cta: 'नि:शुल्क काट्न सुरू गर्नुहोस्',
        secondary: 'डेमो हेर्नुहोस्',
      },
      features: {
        title: 'शक्तिशाली AI भिडियो काट्ने',
        auto: { title: 'अटो हाइलाइट डिटेक्शन', desc: 'AI ले तपाईंको भिडियोको विश्लेषण गर्छ र सबैभन्दा आकर्षक क्षणहरू स्वचालित रूपमा पहिचान गर्छ' },
        multi: { title: 'बहु-प्लेटफर्म समर्थन', desc: 'YouTube, Bilibili बाट आयात गर्नुहोस् वा आफ्नै भिडियो फाइलहरू अपलोड गर्नुहोस्' },
        quick: { title: 'छिटो निर्यात', desc: 'तपाईंको क्लिपहरू धेरै प्रारूपहरूमा डाउनलोड गर्नुहोस्, कुनै पनि सोशल प्लेटफर्मका लागि तयार' },
      },
    },
    video: {
      input: { title: 'इनपुट भिडियो', url: 'भिडियो URL (YouTube/Bilibili)', upload: 'भिडियो अपलोड गर्नुहोस्', placeholder: 'YouTube वा Bilibili भिडियो लिंक पेस्ट गर्नुहोस्...' },
      process: 'भिडियो प्रक्रिया गर्नुहोस्', processing: 'प्रक्रिया भइरहेको छ...', results: 'उत्पन्न गरिएका सर्टहरू', highlights: 'हाइलाइट विश्लेषण', download: 'डाउनलोड', preview: 'पूर्वावलोकन',
    },
    pricing: {
      title: 'सरल, पारदर्शी मूल्य निर्धारण', subtitle: 'तपाईंको आवश्यकताहरू अनुसार योजना चयन गर्नुहोस्',
      free: { title: 'नि:शुल्क', price: '$0', period: '/महिना', desc: 'प्रयास गर्नका लागि उत्कृष्ट', feature1: 'प्रतिदिन 100 क्रेडिट्स', feature2: 'आधारभूत भिडियो काट्ने', feature3: '720p निर्यात गुणस्तर', feature4: 'वाटरमार्क समावेश', cta: 'सुरू गर्नुहोस्' },
      starter: { title: 'स्टार्टर', price: '$9.9', period: '/महिना', desc: 'सामग्री सिर्जनाकर्ताहरूका लागि', feature1: 'प्रतिदिन 500 क्रेडिट्स', feature2: 'प्राथमिकता प्रक्रिया', feature3: '1080p निर्यात गुणस्तर', feature4: 'वाटरमार्क छैन', feature5: 'इमेल समर्थन', cta: 'अहिले सदस्यता लिनुहोस्' },
      pro: { title: 'प्रो', price: '$19.9', period: '/महिना', desc: 'पेशेवरहरू र टिमहरूका लागि', feature1: 'असीमित क्रेडिट्स', feature2: 'सबैभन्दा छिटो प्रक्रिया', feature3: '4K निर्यात गुणस्तर', feature4: 'वाटरमार्क छैन', feature5: 'API पहुँच', feature6: 'प्राथमिकता समर्थन', cta: 'अहिले सदस्यता लिनुहोस्' },
    },
    login: {
      title: 'लगइन', description: 'तपाईंको खातामा पहुँच गर्नुहोस्', emailLabel: 'इमेल', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: '••••••••', submitButton: 'लगइन', orContinueWith: 'वा जारी राख्नुहोस्', googleButton: 'Google सँग जारी राख्नुहोस्', dontHaveAccount: 'खाता छैन?', signUp: 'रजिस्टर',
    },
    register: {
      title: 'खाता सिर्जना गर्नुहोस्', description: 'Clipop AI सँग सुरू गर्नुहोस्', nameLabel: 'पूरा नाम', namePlaceholder: 'John Doe', emailLabel: 'इमेल', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'पासवर्ड पुष्टि गर्नुहोस्', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'जारी राख्नुहोस्', sendingCode: 'पठाइरहेको छ...', codeLabel: 'प्रमाणीकरण कोड', codePlaceholder: '6-अंकको कोड प्रविष्ट गर्नुहोस्', verifyButton: 'खाता सिर्जना गर्नुहोस्', codeNotReceived: 'कोड प्राप्त भएन?', resendButton: 'पुन: पठाउनुहोस्', resendIn: 'पुन: पठाउनुहोस्', backButton: 'फर्कनुहोस्', googleButton: 'Google सँग जारी राख्नुहोस्', alreadyHaveAccount: 'पहिले नै खाता छ?', signIn: 'लगइन',
    },
    dashboard: { title: 'ड्यासबोर्ड', credits: 'उपलब्ध क्रेडिट्स', creditsReset: 'प्रतिदिन 00:00 UTC मा रिसेट', history: 'प्रक्रिया इतिहास', noVideos: 'अहिलेसम्म कुनै भिडियो प्रक्रिया भएको छैन', startProcessing: 'भिडियो प्रक्रिया सुरू गर्नुहोस्' },
    admin: { title: 'व्यवस्थापक प्यानेल', blog: 'ब्लग व्यवस्थापन', blogCreate: 'पोस्ट सिर्जना गर्नुहोस्', blogTitle: 'शीर्षक', blogCategory: 'श्रेणी', blogContent: 'सामग्री', blogPublish: 'प्रकाशित गर्नुहोस्', blogSave: 'ड्राफ्ट सेभ गर्नुहोस्', blogPublished: 'प्रकाशित', blogDraft: 'ड्राफ्ट' },
    blog: { title: 'ब्लग', readMore: 'थप पढ्नुहोस्', noPosts: 'अहिलेसम्म कुनै पोस्ट छैन' },
    common: { loading: 'लोड भइरहेको छ...', error: 'त्रुटि भयो', success: 'सफलता', cancel: 'रद्द गर्नुहोस्', save: 'सेभ गर्नुहोस्', delete: 'मेटाउनुहोस्', edit: 'सम्पादन गर्नुहोस्', search: 'खोज्नुहोस्' },
  }),

  da: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Hjem', blog: 'Blog', pricing: 'Priser', login: 'Log ind', register: 'Opret', dashboard: 'Dashboard', admin: 'Admin Panel', logout: 'Log ud', credits: 'Krediter',
    },
    home: {
      hero: {
        title: 'Lav Lange Videoer Til Virale Shorts',
        subtitle: 'AI-drevet videoklipning, der automatisk udtrækker de bedste øjeblikke fra dit lange indhold',
        cta: 'Start Med Klipning Gratis',
        secondary: 'Se Demo',
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
      process: 'Behandling Af Video', processing: 'Behandler...', results: 'Genererede Shorts', highlights: 'Highlight Analyse', download: 'Download', preview: 'Forhåndsvisning',
    },
    pricing: {
      title: 'Enkel, Gennemsigtig Pris', subtitle: 'Vælg den plan, der passer til dine behov',
      free: { title: 'Gratis', price: '$0', period: '/måned', desc: 'Perfekt til at prøve', feature1: '100 krediter dagligt', feature2: 'Grundlæggende videoklipning', feature3: '720p eksportkvalitet', feature4: 'Vandmærke inkluderet', cta: 'Start' },
      starter: { title: 'Starter', price: '$9.9', period: '/måned', desc: 'Til indholdsoprettere', feature1: '500 krediter dagligt', feature2: 'Prioriteret behandling', feature3: '1080p eksportkvalitet', feature4: 'Intet vandmærke', feature5: 'E-mail-support', cta: 'Abonner Nu' },
      pro: { title: 'Pro', price: '$19.9', period: '/måned', desc: 'Til professionelle og teams', feature1: 'Ubegrænsede krediter', feature2: 'Hurtigste behandling', feature3: '4K eksportkvalitet', feature4: 'Intet vandmærke', feature5: 'API-adgang', feature6: 'Prioriteret support', cta: 'Abonner Nu' },
    },
    login: {
      title: 'Log ind', description: 'Adgang til din konto', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Adgangskode', passwordPlaceholder: '••••••••', submitButton: 'Log ind', orContinueWith: 'Eller fortsæt med', googleButton: 'Fortsæt med Google', dontHaveAccount: 'Har du ikke en konto?', signUp: 'Opret',
    },
    register: {
      title: 'Opret Konto', description: 'Start med Clipop AI', nameLabel: 'Fulde Navn', namePlaceholder: 'John Doe', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Adgangskode', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Bekræft Adgangskode', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Fortsæt', sendingCode: 'Sender...', codeLabel: 'Bekræftelseskode', codePlaceholder: 'Indtast 6-cifret kode', verifyButton: 'Opret Konto', codeNotReceived: 'Modtog du ikke koden?', resendButton: 'Send Igen', resendIn: 'Send igen om', backButton: 'Tilbage', googleButton: 'Fortsæt med Google', alreadyHaveAccount: 'Har du allerede en konto?', signIn: 'Log ind',
    },
    dashboard: { title: 'Dashboard', credits: 'Tilgængelige Krediter', creditsReset: 'Nulstilles dagligt kl. 00:00 UTC', history: 'Behandlingshistorik', noVideos: 'Ingen videoer behandlet endnu', startProcessing: 'Start Behandling Af Videoer' },
    admin: { title: 'Admin Panel', blog: 'Blog Administration', blogCreate: 'Opret Indlæg', blogTitle: 'Titel', blogCategory: 'Kategori', blogContent: 'Indhold', blogPublish: 'Udgiv', blogSave: 'Gem Udkast', blogPublished: 'Udgivet', blogDraft: 'Udkast' },
    blog: { title: 'Blog', readMore: 'Læs Mere', noPosts: 'Ingen indlæg endnu' },
    common: { loading: 'Indlæser...', error: 'Der opstod en fejl', success: 'Succes', cancel: 'Annuller', save: 'Gem', delete: 'Slet', edit: 'Rediger', search: 'Søg' },
  }),

  fi: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Koti', blog: 'Blogi', pricing: 'Hinnat', login: 'Kirjaudu sisään', register: 'Rekisteröidy', dashboard: 'Kojelauta', admin: 'Hallintapaneeli', logout: 'Kirjaudu ulos', credits: 'Luottokappaleet',
    },
    home: {
      hero: {
        title: 'Muuta Pitkät Videot Viralaisiksi Lyhytvideoiksi',
        subtitle: 'AI-vetoinen videoleikkaus, joka erottaa parhaat hetket pitkästä sisällöstäsi automaattisesti',
        cta: 'Aloita Leikkaus Ilmaiseksi',
        secondary: 'Katso Demo',
      },
      features: {
        title: 'Tehokas AI-videoleikkaus',
        auto: { title: 'Automaattinen Korostusten Tunnistus', desc: 'AI analysoi videosi ja tunnistaa kiinnostavimmat hetket automaattisesti' },
        multi: { title: 'Usean Alustan Tuki', desc: 'Tuo YouTube\'sta, Bilibili\'stä tai lataa omat videotiedostosi' },
        quick: { title: 'Nopea Vienti', desc: 'Lataa klipsisi useassa muodossa, valmiina mihin tahansa sosiaaliseen alustaan' },
      },
    },
    video: {
      input: { title: 'Syötevideo', url: 'Videon URL (YouTube/Bilibili)', upload: 'Lataa Video', placeholder: 'Liitä YouTube- tai Bilibili-videolinkki...' },
      process: 'Käsittele Video', processing: 'Käsitellään...', results: 'Luodut Lyhytvideot', highlights: 'Korostusten Analyysi', download: 'Lataa', preview: 'Esikatselu',
    },
    pricing: {
      title: 'Yksinkertainen, Läpinäkyvä Hinnoittelu', subtitle: 'Valitse tarpeisiisi sopiva suunnitelma',
      free: { title: 'Ilmainen', price: '$0', period: '/kuukausi', desc: 'Täydellinen kokeiluun', feature1: '100 luottokappaletta päivittäin', feature2: 'Perusvideoleikkaus', feature3: '720p vientikualiteetti', feature4: 'Vesileima mukana', cta: 'Aloita' },
      starter: { title: 'Aloittelija', price: '$9.9', period: '/kuukausi', desc: 'Sisällöntuottajille', feature1: '500 luottokappaletta päivittäin', feature2: 'Ensisijainen käsittely', feature3: '1080p vientikualiteetti', feature4: 'Ei vesileimaa', feature5: 'Sähköpostituki', cta: 'Tilaa Nyt' },
      pro: { title: 'Pro', price: '$19.9', period: '/kuukausi', desc: 'Ammattilaisille ja tiimeille', feature1: 'Rajoittomat luottokappaleet', feature2: 'Nopein käsittely', feature3: '4K vientikualiteetti', feature4: 'Ei vesileimaa', feature5: 'API-pääsy', feature6: 'Ensisijainen tuki', cta: 'Tilaa Nyt' },
    },
    login: {
      title: 'Kirjaudu sisään', description: 'Pääsy tilillesi', emailLabel: 'Sähköposti', emailPlaceholder: 'you@example.com', passwordLabel: 'Salasana', passwordPlaceholder: '••••••••', submitButton: 'Kirjaudu sisään', orContinueWith: 'Tai jatka', googleButton: 'Jatka Google\'lla', dontHaveAccount: 'Ei tiliä?', signUp: 'Rekisteröidy',
    },
    register: {
      title: 'Luo Tili', description: 'Aloita Clipop AI:n kanssa', nameLabel: 'Koko Nimi', namePlaceholder: 'John Doe', emailLabel: 'Sähköposti', emailPlaceholder: 'you@example.com', passwordLabel: 'Salasana', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Vahvista Salasana', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Jatka', sendingCode: 'Lähetetään...', codeLabel: 'Vahvistuskoodi', codePlaceholder: 'Syötä 6-numeroinen koodi', verifyButton: 'Luo Tili', codeNotReceived: 'Etkö saanut koodia?', resendButton: 'Lähetä Uudelleen', resendIn: 'Lähetä uudelleen', backButton: 'Takaisin', googleButton: 'Jatka Google\'lla', alreadyHaveAccount: 'Onko sinulla jo tili?', signIn: 'Kirjaudu sisään',
    },
    dashboard: { title: 'Kojelauta', credits: 'Saatavilla olevat Luottokappaleet', creditsReset: 'Nollataan päivittäin klo 00:00 UTC', history: 'Käsittelyhistoria', noVideos: 'Ei vielä käsiteltyjä videoita', startProcessing: 'Aloita Videoiden Käsittely' },
    admin: { title: 'Hallintapaneeli', blog: 'Blogin Hallinta', blogCreate: 'Luo Julkaisu', blogTitle: 'Otsikko', blogCategory: 'Kategoria', blogContent: 'Sisältö', blogPublish: 'Julkaise', blogSave: 'Tallenna Luonnos', blogPublished: 'Julkaistu', blogDraft: 'Luonnos' },
    blog: { title: 'Blogi', readMore: 'Lue Lisää', noPosts: 'Ei vielä julkaisuja' },
    common: { loading: 'Ladataan...', error: 'Tapahtui virhe', success: 'Onnistui', cancel: 'Peruuta', save: 'Tallenna', delete: 'Poista', edit: 'Muokkaa', search: 'Etsi' },
  }),

  nl: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Home', blog: 'Blog', pricing: 'Prijzen', login: 'Inloggen', register: 'Registreren', dashboard: 'Dashboard', admin: 'Beheerderspaneel', logout: 'Uitloggen', credits: 'Credits',
    },
    home: {
      hero: {
        title: 'Maak Lange Video\'s Viral Shorts',
        subtitle: 'AI-gestuurde videoknippen die automatisch de beste momenten uit je lange inhoud haalt',
        cta: 'Begin Gratis Met Knippen',
        secondary: 'Bekijk Demo',
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
      process: 'Verwerk Video', processing: 'Verwerken...', results: 'Gegenereerde Shorts', highlights: 'Highlight Analyse', download: 'Download', preview: 'Voorbeeld',
    },
    pricing: {
      title: 'Eenvoudige, Transparante Prijzen', subtitle: 'Kies het plan dat bij je behoeften past',
      free: { title: 'Gratis', price: '$0', period: '/maand', desc: 'Perfect om te proberen', feature1: '100 credits per dag', feature2: 'Basise videoknippen', feature3: '720p exportkwaliteit', feature4: 'Watermerk inbegrepen', cta: 'Begin' },
      starter: { title: 'Starter', price: '$9.9', period: '/maand', desc: 'Voor contentmakers', feature1: '500 credits per dag', feature2: 'Prioriteitsverwerking', feature3: '1080p exportkwaliteit', feature4: 'Geen watermerk', feature5: 'E-mailondersteuning', cta: 'Nu Abonneren' },
      pro: { title: 'Pro', price: '$19.9', period: '/maand', desc: 'Voor professionals en teams', feature1: 'Onbeperkte credits', feature2: 'Snelste verwerking', feature3: '4K exportkwaliteit', feature4: 'Geen watermerk', feature5: 'API-toegang', feature6: 'Prioriteitsondersteuning', cta: 'Nu Abonneren' },
    },
    login: {
      title: 'Inloggen', description: 'Toegang tot je account', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Wachtwoord', passwordPlaceholder: '••••••••', submitButton: 'Inloggen', orContinueWith: 'Of doorgaan met', googleButton: 'Doorgaan met Google', dontHaveAccount: 'Geen account?', signUp: 'Registreren',
    },
    register: {
      title: 'Account Aanmaken', description: 'Begin met Clipop AI', nameLabel: 'Volledige Naam', namePlaceholder: 'John Doe', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Wachtwoord', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Bevestig Wachtwoord', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Doorgaan', sendingCode: 'Versturen...', codeLabel: 'Verificatiecode', codePlaceholder: 'Voer 6-cijferige code in', verifyButton: 'Account Aanmaken', codeNotReceived: 'Code niet ontvangen?', resendButton: 'Opnieuw Versturen', resendIn: 'Opnieuw versturen', backButton: 'Terug', googleButton: 'Doorgaan met Google', alreadyHaveAccount: 'Heb je al een account?', signIn: 'Inloggen',
    },
    dashboard: { title: 'Dashboard', credits: 'Beschikbare Credits', creditsReset: 'Dagelijks gereset om 00:00 UTC', history: 'Verwerkingsgeschiedenis', noVideos: 'Nog geen video\'s verwerkt', startProcessing: 'Start Video Verwerking' },
    admin: { title: 'Beheerderspaneel', blog: 'Blog Beheer', blogCreate: 'Bericht Aanmaken', blogTitle: 'Titel', blogCategory: 'Categorie', blogContent: 'Inhoud', blogPublish: 'Publiceren', blogSave: 'Concept Opslaan', blogPublished: 'Gepubliceerd', blogDraft: 'Concept' },
    blog: { title: 'Blog', readMore: 'Lees Meer', noPosts: 'Nog geen berichten' },
    common: { loading: 'Laden...', error: 'Er is een fout opgetreden', success: 'Succes', cancel: 'Annuleren', save: 'Opslaan', delete: 'Verwijderen', edit: 'Bewerken', search: 'Zoeken' },
  }),

  no: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Hjem', blog: 'Blogg', pricing: 'Priser', login: 'Logg inn', register: 'Registrer', dashboard: 'Dashboard', admin: 'Admin Panel', logout: 'Logg ut', credits: 'Kreditter',
    },
    home: {
      hero: {
        title: 'Gjør Lange Videoer Til Virale Shorts',
        subtitle: 'AI-drevet videoklipping som automatisk trekker ut de beste øyeblikkene fra ditt lange innhold',
        cta: 'Start Med Klipping Gratis',
        secondary: 'Se Demo',
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
      process: 'Behandle Video', processing: 'Behandler...', results: 'Genererte Shorts', highlights: 'Highlight Analyse', download: 'Last Ned', preview: 'Forhåndsvisning',
    },
    pricing: {
      title: 'Enkel, Gjenomskinnelig Pris', subtitle: 'Velg den planen som passer dine behov',
      free: { title: 'Gratis', price: '$0', period: '/måned', desc: 'Perfekt for å prøve', feature1: '100 kreditter daglig', feature2: 'Grunnleggende videoklipping', feature3: '720p eksportkvalitet', feature4: 'Vannmerke inkludert', cta: 'Start' },
      starter: { title: 'Starter', price: '$9.9', period: '/måned', desc: 'For innholdsoprettere', feature1: '500 kreditter daglig', feature2: 'Prioritert behandling', feature3: '1080p eksportkvalitet', feature4: 'Intet vannmerke', feature5: 'E-post-støtte', cta: 'Abonner Nå' },
      pro: { title: 'Pro', price: '$19.9', period: '/måned', desc: 'For profesjonelle og team', feature1: 'Ubegrensede kreditter', feature2: 'Raskest behandling', feature3: '4K eksportkvalitet', feature4: 'Intet vannmerke', feature5: 'API-tilgang', feature6: 'Prioritert støtte', cta: 'Abonner Nå' },
    },
    login: {
      title: 'Logg inn', description: 'Tilgang til kontoen din', emailLabel: 'E-post', emailPlaceholder: 'you@example.com', passwordLabel: 'Passord', passwordPlaceholder: '••••••••', submitButton: 'Logg inn', orContinueWith: 'Eller fortsett med', googleButton: 'Fortsett med Google', dontHaveAccount: 'Har du ikke en konto?', signUp: 'Registrer',
    },
    register: {
      title: 'Opprett Konto', description: 'Start med Clipop AI', nameLabel: 'Fullt Navn', namePlaceholder: 'John Doe', emailLabel: 'E-post', emailPlaceholder: 'you@example.com', passwordLabel: 'Passord', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Bekreft Passord', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Fortsett', sendingCode: 'Sender...', codeLabel: 'Bekreftelseskode', codePlaceholder: 'Skriv inn 6-sifret kode', verifyButton: 'Opprett Konto', codeNotReceived: 'Mottok du ikke koden?', resendButton: 'Send Igjen', resendIn: 'Send igjen om', backButton: 'Tilbake', googleButton: 'Fortsett med Google', alreadyHaveAccount: 'Har du allerede en konto?', signIn: 'Logg inn',
    },
    dashboard: { title: 'Dashboard', credits: 'Tilgjengelige Kreditter', creditsReset: 'Tilbakestilles daglig kl. 00:00 UTC', history: 'Behandlingshistorikk', noVideos: 'Ingen videoer behandlet ennå', startProcessing: 'Start Behandling Av Videoer' },
    admin: { title: 'Admin Panel', blog: 'Blogg Administrasjon', blogCreate: 'Opprett Innlegg', blogTitle: 'Tittel', blogCategory: 'Kategori', blogContent: 'Innhold', blogPublish: 'Publiser', blogSave: 'Lagre Utkast', blogPublished: 'Publisert', blogDraft: 'Utkast' },
    blog: { title: 'Blogg', readMore: 'Les Mer', noPosts: 'Ingen innlegg ennå' },
    common: { loading: 'Laster...', error: 'Det oppstod en feil', success: 'Suksess', cancel: 'Avbryt', save: 'Lagre', delete: 'Slett', edit: 'Rediger', search: 'Søk' },
  }),

  sv: flattenTranslations({
    ...commonTranslations,
    nav: {
      home: 'Hem', blog: 'Blogg', pricing: 'Prissättning', login: 'Logga in', register: 'Registrera', dashboard: 'Instrumentpanel', admin: 'Admin Panel', logout: 'Logga ut', credits: 'Krediter',
    },
    home: {
      hero: {
        title: 'Gör Långa Videor Till Virala Shorts',
        subtitle: 'AI-drivenvideoklippning som automatiskt extraherar de bästa ögonblicken från ditt långa innehåll',
        cta: 'Börja Klippa Gratis',
        secondary: 'Se Demo',
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
      process: 'Bearbeta Video', processing: 'Bearbetar...', results: 'Genererade Shorts', highlights: 'Highlight Analys', download: 'Ladda Ner', preview: 'Förhandsvisa',
    },
    pricing: {
      title: 'Enkel, Transparent Prissättning', subtitle: 'Välj den plan som passar dina behov',
      free: { title: 'Gratis', price: '$0', period: '/månad', desc: 'Perfekt för att prova', feature1: '100 krediter dagligen', feature2: 'Grundläggande videoklippning', feature3: '720p exportkvalitet', feature4: 'Vattenmärke inkluderat', cta: 'Börja' },
      starter: { title: 'Starter', price: '$9.9', period: '/månad', desc: 'För innehållsskapare', feature1: '500 krediter dagligen', feature2: 'Prioriterad bearbetning', feature3: '1080p exportkvalitet', feature4: 'Inget vattenmärke', feature5: 'E-poststöd', cta: 'Prenumerera Nu' },
      pro: { title: 'Pro', price: '$19.9', period: '/månad', desc: 'För proffs och team', feature1: 'Obegränsade krediter', feature2: 'Snabbast bearbetning', feature3: '4K exportkvalitet', feature4: 'Inget vattenmärke', feature5: 'API-åtkomst', feature6: 'Prioriterat stöd', cta: 'Prenumerera Nu' },
    },
    login: {
      title: 'Logga in', description: 'Tillgång till ditt konto', emailLabel: 'E-post', emailPlaceholder: 'you@example.com', passwordLabel: 'Lösenord', passwordPlaceholder: '••••••••', submitButton: 'Logga in', orContinueWith: 'Eller fortsätt med', googleButton: 'Fortsätt med Google', dontHaveAccount: 'Har du inget konto?', signUp: 'Registrera',
    },
    register: {
      title: 'Skapa Konto', description: 'Börja med Clipop AI', nameLabel: 'Fullständigt Namn', namePlaceholder: 'John Doe', emailLabel: 'E-post', emailPlaceholder: 'you@example.com', passwordLabel: 'Lösenord', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Bekräfta Lösenord', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Fortsätt', sendingCode: 'Skickar...', codeLabel: 'Verifieringskod', codePlaceholder: 'Ange 6-siffrig kod', verifyButton: 'Skapa Konto', codeNotReceived: 'Fick du inte koden?', resendButton: 'Skicka Igen', resendIn: 'Skicka igen om', backButton: 'Tillbaka', googleButton: 'Fortsätt med Google', alreadyHaveAccount: 'Har du redan ett konto?', signIn: 'Logga in',
    },
    dashboard: { title: 'Instrumentpanel', credits: 'Tillgängliga Krediter', creditsReset: 'Återställs dagligen klockan 00:00 UTC', history: 'Bearbetningshistorik', noVideos: 'Inga videor bearbetade ännu', startProcessing: 'Starta Bearbetning Av Videor' },
    admin: { title: 'Admin Panel', blog: 'Blogg Hantering', blogCreate: 'Skapa Inlägg', blogTitle: 'Titel', blogCategory: 'Kategori', blogContent: 'Innehåll', blogPublish: 'Publicera', blogSave: 'Spara Utkast', blogPublished: 'Publicerad', blogDraft: 'Utkast' },
    blog: { title: 'Blogg', readMore: 'Läs Mer', noPosts: 'Inga inlägg ännu' },
    common: { loading: 'Laddar...', error: 'Ett fel uppstod', success: 'Lyckades', cancel: 'Avbryt', save: 'Spara', delete: 'Ta bort', edit: 'Redigera', search: 'Sök' },
  }),
};

export function useTranslation(locale: Locale) {
  return function t(key: string): string {
    const localeTranslations = translations[locale] || translations[defaultLocale];
    return localeTranslations[key] || translations[defaultLocale][key] || key;
  };
}