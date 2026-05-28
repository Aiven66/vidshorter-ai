import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'ホーム', blog: 'ブログ', pricing: '価格', login: 'ログイン', register: '登録', dashboard: 'ダッシュボード', admin: '管理パネル', logout: 'ログアウト', credits: 'クレジット', download: 'アプリをダウンロード', light: 'ライト', dark: 'ダーク',
  },
  footer: {
  desc: 'AI駆動の分析と編集で、長い動画を魅力的なショートクリップに変換。', quickLinks: 'クイックリンク', legal: '法務', privacy: 'プライバシーポリシー', terms: '利用規約', contact: 'お問い合わせ', rights: 'All rights reserved.',
  },
  home: {
  hero: {
  badge: 'AI駆動の動画処理',
  title: '長い動画をバイラルショートに変換',
  subtitle: 'AI駆動の動画クリッピングで、長編コンテンツから最高の瞬間を自動的に抽出',
  cta: '無料でクリッピング開始',
  secondary: 'デモを見る',
  },
  howItWorks: {
  title: '使い方', step1: { title: '動画を入力', desc: 'URLを貼り付けるか動画をアップロード' }, step2: { title: 'AI分析', desc: 'AIが自動的にハイライトを検出' }, step3: { title: 'クリップ生成', desc: 'ショート動画が作成されます' }, step4: { title: 'ダウンロード', desc: 'エクスポートしてどこでも共有' },
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
  process: '動画を処理', processing: '処理中...', analyze: '分析', results: '生成されたショート', highlights: 'ハイライト分析', download: 'ダウンロード', preview: 'プレビュー',
  creditsAvailable: 'クレジット利用可能', signInToStart: '動画処理を開始するには', pasteUrlPlaceholder: '動画URLを貼り付け (MP4, MOV, AVI...)', useLocalAgent: 'ローカルMacエージェントを使用（安定したYouTube処理に推奨）', uploadLocal: 'ローカル動画ファイルをアップロード（YouTubeリンクがブロックされている場合に推奨）', selectedFile: '選択済み', downloadMacApp: 'Macアプリをダウンロード', viewPricing: '料金を見る', clipsReady: 'クリップ準備完了', playableClips: '再生可能なクリップ', failedClips: '失敗', aiFinished: 'AIがソース動画から最も強力な瞬間の選択を完了しました。', openToPreview: '準備完了のクリップを開いてプレビューするか、MP4を直接ダウンロードしてください。', clipsBeingGenerated: 'クリップ生成中:', videoPreviewNotAvailable: '動画プレビューは利用できません', clipMayStillProcessing: 'クリップはまだ処理中か、生成に失敗した可能性があります。', insufficientCredits: 'クレジット不足です。最低30クレジットが必要です。', enterVideoUrl: '動画URLを入力するか、ローカル動画ファイルをアップロードしてください。', enterValidUrl: '有効な公開http(s)動画URLを入力してください。',
  stage: {
  init: '初期化中...', extractFrames: '動画フレームを抽出中...', framesExtracted: 'フレームの抽出に成功しました', framesUnavailable: '分析を続行します', aiAnalysis: 'AIが動画コンテンツを分析中...', analysisComplete: '分析完了', generatingClip: 'ハイライトクリップを作成中...', clipReady: 'ハイライトクリップ準備完了', saving: '結果を保存中...', complete: '処理完了！', error: 'エラーが発生しました',
  },
  },
  pricing: {
  title: 'シンプルで透明な価格設定', subtitle: '自分に合ったプランを選択',
  paymentNote: '中国向けAlipay · 海外向けCreem (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'すべての支払いはTLS 256ビット暗号化で保護されています', faqTitle: 'よくある質問', faq: { q1: 'クレジットとは何ですか？', a1: '各クレジットは処理能力を表します。動画クリップの処理には30クレジットが必要です。', q2: '毎日のクレジットリセットはどのように機能しますか？', a2: 'クレジットは毎日00:00 UTCにプランの日次上限にリセットされます。未使用のクレジットは繰り越されません。', q3: 'プランをアップグレードまたはダウングレードできますか？', a3: 'はい、いつでもプランを変更できます。変更は即座に反映されます。', q4: 'どの動画ソースがサポートされていますか？', a4: 'YouTube、Bilibili、および直接動画ファイルのアップロード（MP4, MOV, AVI）をサポートしています。', q5: 'どの支払い方法がサポートされていますか？', a5: '中国のユーザー向けにAlipay、海外のユーザー向けにCreem（Visa, Mastercard, Apple Pay, Google Pay）をサポートしています。' },
  mostPopular: '最も人気',
  free: { title: '無料', price: '$0', period: '/月', desc: '試用に最適', feature1: '毎日100クレジット', feature2: '基本的な動画クリッピング', feature3: '720pエクスポート品質', feature4: 'ウォーターマーク付き', cta: '始める' },
  starter: { title: 'スターター', price: '$9.9', period: '/月', desc: 'コンテンツクリエイター向け', feature1: '毎日500クレジット', feature2: '優先処理', feature3: '1080pエクスポート品質', feature4: 'ウォーターマークなし', feature5: 'メールサポート', cta: '今すぐ購読' },
  pro: { title: 'プロ', price: '$19.9', period: '/月', desc: 'プロフェッショナル＆チーム向け', feature1: '無制限クレジット', feature2: '最速処理', feature3: '4Kエクスポート品質', feature4: 'ウォーターマークなし', feature5: 'APIアクセス', feature6: '優先サポート', cta: '今すぐ購読' },
  },
  downloadPage: {
  title: 'Clipop Agentをダウンロード', subtitle: '安定したYouTube/Bilibili動画処理のためのデスクトップアプリ', badge: 'デスクトップアプリ', macTitle: 'macOS', macDesc: 'Apple Silicon (M1/M2/M3/M4) Mac向け', downloadButton: 'macOS版をダウンロード', version: 'バージョン', fileSize: 'ファイルサイズ', requirements: 'macOS 12.0以降', installing: 'インストールガイド', step1: 'ダウンロードボタンをクリックして.dmgファイルを保存', step2: 'ダウンロードした.dmgファイルをダブルクリック', step3: 'Clipop Agentをアプリケーションフォルダにドラッグ', step4: 'アプリケーションからClipop Agentを開く', notAvailable: 'ダウンロードの準備中です。後でもう一度確認してください', backToHome: 'ホームに戻る', whyDesktopTitle: 'デスクトップアプリを使う理由は？', features: { stable: { title: '安定した処理', desc: '最大の安定性でローカルに動画を処理' }, fast: { title: '高速ダウンロード', desc: 'ブラウザの制限なしで動画を直接ダウンロード' }, local: { title: 'ローカル処理', desc: 'プライバシーとスピードのためにMac上で動画を処理' } },
  },
  login: {
  title: 'ログイン', description: 'アカウントにアクセス', emailLabel: 'メールアドレス', emailPlaceholder: 'you@example.com', passwordLabel: 'パスワード', passwordPlaceholder: '••••••••', submitButton: 'ログイン', orContinueWith: 'または続行', googleButton: 'Googleで続行', dontHaveAccount: 'アカウントをお持ちでない方は？', signUp: '登録',
  successTitle: 'ログイン成功！', successMessage: 'ログインしました：', successDesktopHint: '下のボタンをクリックしてデスクトップアプリに戻ってください。', returnToDesktop: 'Clipop Agentに戻る', desktopNotOpened: 'デスクトップアプリが自動的に開かない場合は、Clipop Agentが実行されていることを確認してください。',
  },
  register: {
  title: 'アカウント作成', description: 'Clipop AIを始める', nameLabel: 'フルネーム', namePlaceholder: 'John Doe', emailLabel: 'メールアドレス', emailPlaceholder: 'you@example.com', passwordLabel: 'パスワード', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'パスワード確認', confirmPasswordPlaceholder: '••••••••', sendCodeButton: '続行', sendingCode: '送信中...', codeLabel: '認証コード', codePlaceholder: '6桁のコードを入力', verifyButton: 'アカウント作成', codeNotReceived: 'コードを受け取っていませんか？', resendButton: '再送', resendIn: '再送', backButton: '戻る', googleButton: 'Googleで続行', alreadyHaveAccount: 'アカウントをお持ちですか？', signIn: 'ログイン',
  errorNameRequired: '名前を入力してください', errorEmailRequired: 'メールアドレスを入力してください', errorPasswordLength: 'パスワードは6文字以上である必要があります', errorPasswordMismatch: 'パスワードが一致しません', errorEmailExists: 'このメールアドレスは既に登録されています。ログインしてください。', errorSendCode: 'コードの送信に失敗しました', errorNetwork: 'ネットワークエラー。もう一度お試しください。', errorCodeLength: '6桁のコードを入力してください',
  successTitle: 'アカウント作成完了！', successMessage: 'アカウントが作成されました：', successDesktopHint: '下のボタンをクリックしてデスクトップアプリに戻ってください。', returnToDesktop: 'Clipop Agentに戻る', desktopNotOpened: 'デスクトップアプリが自動的に開かない場合は、Clipop Agentが実行されていることを確認してください。',
  },
  dashboard: { title: 'ダッシュボード', credits: '利用可能なクレジット', creditsReset: '毎日00:00 UTCでリセット', history: '処理履歴', noVideos: 'まだ処理された動画はありません', startProcessing: '動画処理を開始',
  untitled: '無題', clip: 'クリップ', clipsCount: 'ハイライト', clipsHint: 'クリップをクリックして再生',
  desktopLoginDetected: 'デスクトップアプリのログインを検出', desktopLoginHint: '下のボタンをクリックしてClipop Agentに戻る', returnToDesktop: 'Clipop Agentに戻る',
  welcomeBack: 'おかえりなさい',
  videosProcessed: '処理済み動画', videosProcessedDesc: '合計処理済み動画', clipsGenerated: '生成されたクリップ', clipsGeneratedDesc: '合計ハイライトクリップ',
  currentPlan: '現在のプラン', upgradePlan: 'プランをアップグレード',
  processNewVideo: '新しい動画を処理', feedback: 'フィードバック',
  historyHint: '完了したレコードをクリックして展開し、ハイライトクリップを表示',
  processNewVideoDesc: 'ホームページに移動して新しい長い動画を処理', goToProcessor: '動画プロセッサに移動',
  userFeedback: 'ユーザーフィードバック', feedbackDesc: '改善したい機能や遭遇した問題をお知らせください',
  feedbackPlaceholder: 'フィードバックを入力（提案、バグ、機能リクエストなど）', feedbackSubmitted: '送信完了、フィードバックありがとうございます！',
  submitFeedback: 'フィードバックを送信', feedbackFailed: 'フィードバックの送信に失敗しました',
  statusPending: '保留中', statusProcessing: '処理中', statusCompleted: '✓ 完了', statusFailed: '失敗',
  },
  admin: { title: '管理パネル', blog: 'ブログ管理', blogCreate: '投稿作成', blogTitle: 'タイトル', blogCategory: 'カテゴリ', blogContent: 'コンテンツ', blogPublish: '公開', blogSave: '下書き保存', blogPublished: '公開済み', blogDraft: '下書き' },
  blog: { title: 'ブログ', readMore: 'もっと読む', noPosts: 'まだ投稿はありません', subtitle: 'Clipop AIの最新ニュース、ヒント、アップデート', views: '閲覧数' },
  common: { loading: '読み込み中...', error: 'エラーが発生しました', success: '成功', cancel: 'キャンセル', save: '保存', delete: '削除', edit: '編集', search: '検索', ready: '準備完了', failed: '失敗', saving: '保存中...', score: 'スコア', user: 'ユーザー' },
};

export default translations;
