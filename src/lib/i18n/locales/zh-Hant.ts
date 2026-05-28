import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: '首頁', blog: '部落格', pricing: '定價', login: '登入', register: '註冊', dashboard: '儀錶板', admin: '管理後台', logout: '登出', credits: '積分', download: '下載應用程式', light: '淺色', dark: '深色',
  },
  common: {
  error: '發生錯誤', ready: '就緒', failed: '失敗', saving: '儲存中...', score: '評分', user: '使用者',
  loading: '載入中...', success: '成功', cancel: '取消', save: '儲存', delete: '刪除', edit: '編輯', search: '搜尋',
  },
  footer: {
  desc: 'AI驅動的影片剪輯，將長影片自動轉化為精彩短影片片段。',
  quickLinks: '快速連結', legal: '法律條款', privacy: '隱私權政策', terms: '服務條款', contact: '聯絡我們', rights: '保留所有權利。',
  },
  home: {
  hero: {
  badge: 'AI驅動的影片處理',
  title: '將長影片轉換為爆紅短片',
  subtitle: 'AI驅動的影片剪輯，自動提取長影片中最精彩的時刻',
  cta: '免費開始剪輯',
  secondary: '觀看演示',
  },
  howItWorks: {
  title: '使用流程',
  step1: { title: '輸入影片', desc: '貼上連結或上傳影片' },
  step2: { title: 'AI分析', desc: 'AI自動偵測精彩時刻' },
  step3: { title: '生成片段', desc: '自動建立短影片' },
  step4: { title: '下載', desc: '匯出並分享到任何平台' },
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
  process: '處理影片', processing: '處理中...', analyze: '分析', results: '生成的短片', highlights: '亮點分析', download: '下載', preview: '預覽',
  creditsAvailable: '積分可用', signInToStart: '後開始處理影片', pasteUrlPlaceholder: '貼上影片連結 (MP4, MOV, AVI...)', useLocalAgent: '使用本機 Mac 用戶端（推薦用於穩定的 YouTube 處理）', uploadLocal: '上傳本機影片檔案（YouTube連結無法存取時推薦使用）', selectedFile: '已選擇', downloadMacApp: '下載 Mac 用戶端', viewPricing: '查看定價', clipsReady: '個片段就緒', playableClips: '個可播放片段', failedClips: '個失敗', aiFinished: 'AI 已完成從來源影片中篩選最精彩時刻。', openToPreview: '點擊就緒片段可線上預覽，或直接下載 MP4 檔案。', clipsBeingGenerated: '正在生成片段：', videoPreviewNotAvailable: '影片預覽不可用', clipMayStillProcessing: '該片段可能仍在處理中或生成失敗。', insufficientCredits: '積分不足，至少需要30積分。', enterVideoUrl: '請輸入影片連結或上傳本機影片檔案。', enterValidUrl: '請輸入有效的 http(s) 影片連結。',
  stage: {
  init: '初始化中...', extractFrames: '提取影片幀...', framesExtracted: '幀提取成功', framesUnavailable: '繼續分析', aiAnalysis: 'AI 正在分析影片內容...', analysisComplete: '分析完成', generatingClip: '正在建立精彩片段...', clipReady: '精彩片段已就緒', saving: '儲存結果中...', complete: '處理完成！', error: '發生錯誤',
  },
  },
  pricing: {
  title: '簡單透明的定價', subtitle: '選擇適合您需求的方案',
  paymentNote: '國內支援支付寶 · 海外支援 Creem（Visa / Mastercard / Apple Pay / Google Pay）', secureNote: '所有支付均採用 TLS 256位加密保護', faqTitle: '常見問題', faq: { q1: '什麼是積分？', a1: '每個積分代表處理能力。處理一個影片片段消耗30積分。', q2: '每日積分如何重置？', a2: '積分每天 UTC 00:00 重置為方案對應的每日額度。未使用的積分不結轉。', q3: '可以升級或降級方案嗎？', a3: '可以，您可以隨時更改方案，更改立即生效。', q4: '支援哪些影片來源？', a4: '支援 YouTube、B站 和本機影片檔案上傳（MP4、MOV、AVI）。', q5: '支援哪些支付方式？', a5: '國內使用者支援支付寶掃碼支付，海外使用者支援 Creem（Visa、Mastercard、Apple Pay、Google Pay）。' },
  mostPopular: '最受歡迎',
  free: { title: '免費版', price: '$0', period: '/月', desc: '適合試用', feature1: '每天100積分', feature2: '基礎影片剪輯', feature3: '720p匯出品質', feature4: '含浮水印', cta: '開始使用' },
  starter: { title: '入門版', price: '$9.9', period: '/月', desc: '適合內容創作者', feature1: '每天500積分', feature2: '優先處理', feature3: '1080p匯出品質', feature4: '無浮水印', feature5: '郵件支援', cta: '立即訂閱' },
  pro: { title: '專業版', price: '$19.9', period: '/月', desc: '適合專業人士和團隊', feature1: '無限積分', feature2: '最快處理速度', feature3: '4K匯出品質', feature4: '無浮水印', feature5: 'API存取', feature6: '優先支援', cta: '立即訂閱' },
  },
  downloadPage: {
  title: '下載 Clipop Agent', subtitle: '桌面應用程式，穩定處理 YouTube/B站 影片', badge: '桌面應用程式', macTitle: 'macOS', macDesc: '適用於 Apple Silicon (M1/M2/M3/M4) Mac', downloadButton: '下載 macOS 版本', version: '版本', fileSize: '檔案大小', requirements: 'macOS 12.0 或更高版本', installing: '安裝指南', step1: '點擊下載按鈕儲存 .dmg 檔案', step2: '雙擊下載的 .dmg 檔案', step3: '將 Clipop Agent 拖曳到應用程式資料夾', step4: '從應用程式中開啟 Clipop Agent', notAvailable: '下載正在準備中，請稍後再來查看', backToHome: '返回首頁', whyDesktopTitle: '為什麼要使用桌面用戶端？', features: { stable: { title: '穩定處理', desc: '在本機穩定處理影片' }, fast: { title: '快速下載', desc: '直接下載影片，不受瀏覽器限制' }, local: { title: '本機處理', desc: '在 Mac 上處理影片，保護隱私且更快速' } },
  },
  login: {
  title: '登入', description: '存取您的帳戶', emailLabel: '電子郵件', emailPlaceholder: 'you@example.com', passwordLabel: '密碼', passwordPlaceholder: '••••••••', submitButton: '登入', orContinueWith: '或繼續使用', googleButton: '使用Google登入', dontHaveAccount: '還沒有帳戶？', signUp: '註冊',
  successTitle: '登入成功！', successMessage: '您已成功登入', successDesktopHint: '點擊下方按鈕返回桌面應用程式。', returnToDesktop: '返回 Clipop Agent', desktopNotOpened: '如果桌面應用程式沒有自動開啟，請確保 Clipop Agent 正在執行。',
  },
  register: {
  title: '建立帳戶', description: '開始使用Clipop AI', nameLabel: '姓名', namePlaceholder: '張三', emailLabel: '電子郵件', emailPlaceholder: 'you@example.com', passwordLabel: '密碼', passwordPlaceholder: '••••••••', confirmPasswordLabel: '確認密碼', confirmPasswordPlaceholder: '••••••••', sendCodeButton: '繼續', sendingCode: '發送中...', codeLabel: '驗證碼', codePlaceholder: '輸入6位驗證碼', verifyButton: '建立帳戶', codeNotReceived: '未收到驗證碼？', resendButton: '重新發送', resendIn: '重新發送', backButton: '返回', googleButton: '使用Google登入', alreadyHaveAccount: '已有帳戶？', signIn: '登入',
  errorNameRequired: '請輸入您的姓名', errorEmailRequired: '請輸入您的電子郵件', errorPasswordLength: '密碼至少需要6個字元', errorPasswordMismatch: '密碼不一致', errorEmailExists: '此電子郵件已註冊，請改為登入。', errorSendCode: '無法發送驗證碼', errorNetwork: '網路錯誤，請重試。', errorCodeLength: '請輸入6位驗證碼',
  successTitle: '帳戶建立成功！', successMessage: '您的帳戶已成功建立', successDesktopHint: '點擊下方按鈕返回桌面應用程式。', returnToDesktop: '返回 Clipop Agent', desktopNotOpened: '如果桌面應用程式沒有自動開啟，請確保 Clipop Agent 正在執行。',
  },
  dashboard: { title: '儀錶板', credits: '可用積分', creditsReset: '每天00:00 UTC重置', history: '處理歷史', noVideos: '暫無處理的影片', startProcessing: '開始處理影片',
  untitled: '未命名', clip: '片段', clipsCount: '個亮點', clipsHint: '點擊任何片段以播放',
  desktopLoginDetected: '偵測到桌面應用程式登入', desktopLoginHint: '點擊下方按鈕返回 Clipop Agent', returnToDesktop: '返回 Clipop Agent',
  welcomeBack: '歡迎回來',
  videosProcessed: '已處理影片', videosProcessedDesc: '總共處理的影片', clipsGenerated: '已生成片段', clipsGeneratedDesc: '總共的亮點片段',
  currentPlan: '目前方案', upgradePlan: '升級方案',
  processNewVideo: '處理新影片', feedback: '意見回饋',
  historyHint: '點擊已完成的記錄以展開並查看亮點片段',
  processNewVideoDesc: '前往首頁處理新的長影片', goToProcessor: '前往影片處理器',
  userFeedback: '使用者意見回饋', feedbackDesc: '告訴我們您想改善的功能或遇到的問題',
  feedbackPlaceholder: '輸入您的意見回饋（建議、錯誤、功能請求等）', feedbackSubmitted: '已提交，感謝您的意見回饋！',
  submitFeedback: '提交意見回饋', feedbackFailed: '無法提交意見回饋',
  statusPending: '等待中', statusProcessing: '處理中', statusCompleted: '✓ 已完成', statusFailed: '失敗',
  },
  admin: { title: '管理後台', blog: '部落格管理', blogCreate: '建立帖子', blogTitle: '標題', blogCategory: '分類', blogContent: '內容', blogPublish: '發佈', blogSave: '儲存草稿', blogPublished: '已發佈', blogDraft: '草稿' },
  blog: { title: '部落格', readMore: '閱讀更多', noPosts: '暫無帖子', subtitle: '來自 Clipop AI 的最新消息、技巧和更新', views: '次觀看' },
};

export default translations;
