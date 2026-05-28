import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: '홈', blog: '블로그', pricing: '가격', login: '로그인', register: '회원가입', dashboard: '대시보드', admin: '관리자 패널', logout: '로그아웃', credits: '크레딧', download: '앱 다운로드', light: '라이트', dark: '다크',
  },
  footer: {
  desc: 'AI 기반 분석 및 편집으로 긴 동영상을 매력적인 짧은 클립으로 변환하세요.', quickLinks: '빠른 링크', legal: '법적 고지', privacy: '개인정보 처리방침', terms: '이용약관', contact: '문의', rights: 'All rights reserved.',
  },
  home: {
  hero: {
  badge: 'AI 기반 비디오 처리',
  title: '긴 동영상을 바이럴 쇼츠로 변환',
  subtitle: 'AI 기반 비디오 클리핑으로 롱폼 콘텐츠에서 최고의 순간을 자동 추출',
  cta: '무료로 클리핑 시작',
  secondary: '데모 보기',
  },
  howItWorks: {
  title: '사용 방법', step1: { title: '동영상 입력', desc: 'URL을 붙여넣거나 동영상 업로드' }, step2: { title: 'AI 분석', desc: 'AI가 자동으로 하이라이트를 감지' }, step3: { title: '클립 생성', desc: '짧은 동영상이 생성됩니다' }, step4: { title: '다운로드', desc: '내보내고 어디서나 공유' },
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
  process: '비디오 처리', processing: '처리 중...', analyze: '분석', results: '생성된 쇼츠', highlights: '하이라이트 분석', download: '다운로드', preview: '미리보기',
  creditsAvailable: '크레딧 사용 가능', signInToStart: '비디오 처리를 시작하려면', pasteUrlPlaceholder: '비디오 URL 붙여넣기 (MP4, MOV, AVI...)', useLocalAgent: '로컬 Mac 에이전트 사용 (안정적인 YouTube 처리에 권장)', uploadLocal: '로컬 비디오 파일 업로드 (YouTube 링크가 차단된 경우 권장)', selectedFile: '선택됨', downloadMacApp: 'Mac 앱 다운로드', viewPricing: '가격 보기', clipsReady: '클립 준비 완료', playableClips: '재생 가능한 클립', failedClips: '실패', aiFinished: 'AI가 소스 비디오에서 가장 강력한 순간의 선택을 완료했습니다.', openToPreview: '준비된 클립을 열어 미리보거나 MP4를 직접 다운로드하세요.', clipsBeingGenerated: '클립 생성 중:', videoPreviewNotAvailable: '비디오 미리보기를 사용할 수 없습니다', clipMayStillProcessing: '클립이 아직 처리 중이거나 생성에 실패했을 수 있습니다.', insufficientCredits: '크레딧이 부족합니다. 최소 30크레딧이 필요합니다.', enterVideoUrl: '비디오 URL을 입력하거나 로컬 비디오 파일을 업로드하세요.', enterValidUrl: '유효한 공개 http(s) 비디오 URL을 입력하세요.',
  stage: {
  init: '초기화 중...', extractFrames: '비디오 프레임 추출 중...', framesExtracted: '프레임 추출 성공', framesUnavailable: '분석 계속 진행', aiAnalysis: 'AI가 비디오 콘텐츠 분석 중...', analysisComplete: '분석 완료', generatingClip: '하이라이트 클립 생성 중...', clipReady: '하이라이트 클립 준비 완료', saving: '결과 저장 중...', complete: '처리 완료!', error: '오류 발생',
  },
  },
  pricing: {
  title: '단순하고 투명한 가격', subtitle: '필요에 맞는 플랜 선택',
  paymentNote: '중국용 Alipay · 해외용 Creem (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: '모든 결제는 TLS 256비트 암호화로 보호됩니다', faqTitle: '자주 묻는 질문', faq: { q1: '크레딧이란 무엇인가요?', a1: '각 크레딧은 처리 능력을 나타냅니다. 비디오 클립 처리에는 30크레딧이 필요합니다.', q2: '일일 크레딧 리셋은 어떻게 작동하나요?', a2: '크레딧은 매일 00:00 UTC에 플랜의 일일 한도로 리셋됩니다. 미사용 크레딧은 이월되지 않습니다.', q3: '플랜을 업그레이드하거나 다운그레이드할 수 있나요?', a3: '네, 언제든지 플랜을 변경할 수 있습니다. 변경 사항은 즉시 적용됩니다.', q4: '어떤 비디오 소스가 지원되나요?', a4: 'YouTube, Bilibili 및 직접 비디오 파일 업로드(MP4, MOV, AVI)를 지원합니다.', q5: '어떤 결제 방법이 지원되나요?', a5: '중국 사용자용 Alipay, 해외 사용자용 Creem(Visa, Mastercard, Apple Pay, Google Pay)을 지원합니다.' },
  mostPopular: '가장 인기',
  free: { title: '무료', price: '$0', period: '/월', desc: '시도하기에 완벽', feature1: '매일 100 크레딧', feature2: '기본 비디오 클리핑', feature3: '720p 내보내기 품질', feature4: '워터마크 포함', cta: '시작하기' },
  starter: { title: '스타터', price: '$9.9', period: '/월', desc: '콘텐츠 크리에이터용', feature1: '매일 500 크레딧', feature2: '우선 처리', feature3: '1080p 내보내기 품질', feature4: '워터마크 없음', feature5: '이메일 지원', cta: '지금 구독' },
  pro: { title: '프로', price: '$19.9', period: '/월', desc: '프로페셔널 및 팀용', feature1: '무제한 크레딧', feature2: '가장 빠른 처리', feature3: '4K 내보내기 품질', feature4: '워터마크 없음', feature5: 'API 액세스', feature6: '우선 지원', cta: '지금 구독' },
  },
  downloadPage: {
  title: 'Clipop Agent 다운로드', subtitle: '안정적인 YouTube/Bilibili 비디오 처리를 위한 데스크톱 앱', badge: '데스크톱 앱', macTitle: 'macOS', macDesc: 'Apple Silicon (M1/M2/M3/M4) Mac용', downloadButton: 'macOS용 다운로드', version: '버전', fileSize: '파일 크기', requirements: 'macOS 12.0 이상', installing: '설치 가이드', step1: '다운로드 버튼을 클릭하여 .dmg 파일 저장', step2: '다운로드한 .dmg 파일을 더블클릭', step3: 'Clipop Agent를 응용 프로그램 폴더로 드래그', step4: '응용 프로그램에서 Clipop Agent 열기', notAvailable: '다운로드 준비 중입니다. 나중에 다시 확인해 주세요', backToHome: '홈으로 돌아가기', whyDesktopTitle: '데스크톱 앱을 사용하는 이유는?', features: { stable: { title: '안정적인 처리', desc: '최대 안정성으로 로컬에서 비디오 처리' }, fast: { title: '빠른 다운로드', desc: '브라우저 제한 없이 비디오를 직접 다운로드' }, local: { title: '로컬 처리', desc: '개인정보 보호와 속도를 위해 Mac에서 비디오 처리' } },
  },
  login: {
  title: '로그인', description: '계정에 액세스', emailLabel: '이메일', emailPlaceholder: 'you@example.com', passwordLabel: '비밀번호', passwordPlaceholder: '••••••••', submitButton: '로그인', orContinueWith: '또는 계속하기', googleButton: 'Google로 계속', dontHaveAccount: '계정이 없으신가요?', signUp: '회원가입',
  successTitle: '로그인 성공!', successMessage: '로그인되었습니다:', successDesktopHint: '아래 버튼을 클릭하여 데스크톱 앱으로 돌아가세요.', returnToDesktop: 'Clipop Agent로 돌아가기', desktopNotOpened: '데스크톱 앱이 자동으로 열리지 않으면 Clipop Agent가 실행 중인지 확인하세요.',
  },
  register: {
  title: '계정 생성', description: 'Clipop AI로 시작', nameLabel: '이름', namePlaceholder: 'John Doe', emailLabel: '이메일', emailPlaceholder: 'you@example.com', passwordLabel: '비밀번호', passwordPlaceholder: '••••••••', confirmPasswordLabel: '비밀번호 확인', confirmPasswordPlaceholder: '••••••••', sendCodeButton: '계속', sendingCode: '전송 중...', codeLabel: '인증 코드', codePlaceholder: '6자리 코드 입력', verifyButton: '계정 생성', codeNotReceived: '코드를 받지 못하셨나요?', resendButton: '재전송', resendIn: '재전송', backButton: '뒤로', googleButton: 'Google로 계속', alreadyHaveAccount: '이미 계정이 있으신가요?', signIn: '로그인',
  errorNameRequired: '이름을 입력해 주세요', errorEmailRequired: '이메일을 입력해 주세요', errorPasswordLength: '비밀번호는 6자 이상이어야 합니다', errorPasswordMismatch: '비밀번호가 일치하지 않습니다', errorEmailExists: '이 이메일은 이미 등록되어 있습니다. 로그인해 주세요.', errorSendCode: '코드 전송에 실패했습니다', errorNetwork: '네트워크 오류. 다시 시도해 주세요.', errorCodeLength: '6자리 코드를 입력해 주세요',
  successTitle: '계정 생성 완료!', successMessage: '계정이 생성되었습니다:', successDesktopHint: '아래 버튼을 클릭하여 데스크톱 앱으로 돌아가세요.', returnToDesktop: 'Clipop Agent로 돌아가기', desktopNotOpened: '데스크톱 앱이 자동으로 열리지 않으면 Clipop Agent가 실행 중인지 확인하세요.',
  },
  dashboard: { title: '대시보드', credits: '사용 가능한 크레딧', creditsReset: '매일 00:00 UTC에 리셋', history: '처리 기록', noVideos: '아직 처리된 비디오가 없습니다', startProcessing: '비디오 처리 시작',
  untitled: '제목 없음', clip: '클립', clipsCount: '하이라이트', clipsHint: '클립을 클릭하여 재생',
  desktopLoginDetected: '데스크톱 앱 로그인 감지', desktopLoginHint: '아래 버튼을 클릭하여 Clipop Agent로 돌아가기', returnToDesktop: 'Clipop Agent로 돌아가기',
  welcomeBack: '다시 오셨군요',
  videosProcessed: '처리된 비디오', videosProcessedDesc: '총 처리된 비디오', clipsGenerated: '생성된 클립', clipsGeneratedDesc: '총 하이라이트 클립',
  currentPlan: '현재 플랜', upgradePlan: '플랜 업그레이드',
  processNewVideo: '새 비디오 처리', feedback: '피드백',
  historyHint: '완료된 기록을 클릭하여 확장하고 하이라이트 클립 보기',
  processNewVideoDesc: '홈페이지로 이동하여 새로운 긴 비디오 처리', goToProcessor: '비디오 프로세서로 이동',
  userFeedback: '사용자 피드백', feedbackDesc: '개선하고 싶은 기능이나 겪은 문제를 알려주세요',
  feedbackPlaceholder: '피드백을 입력하세요 (제안, 버그, 기능 요청 등)', feedbackSubmitted: '제출 완료, 피드백 감사합니다!',
  submitFeedback: '피드백 제출', feedbackFailed: '피드백 제출에 실패했습니다',
  statusPending: '대기 중', statusProcessing: '처리 중', statusCompleted: '✓ 완료', statusFailed: '실패',
  },
  admin: { title: '관리자 패널', blog: '블로그 관리', blogCreate: '게시물 생성', blogTitle: '제목', blogCategory: '카테고리', blogContent: '내용', blogPublish: '게시', blogSave: '초안 저장', blogPublished: '게시됨', blogDraft: '초안' },
  blog: { title: '블로그', readMore: '더 읽기', noPosts: '아직 게시물이 없습니다', subtitle: 'Clipop AI의 최신 뉴스, 팁, 업데이트', views: '조회수' },
  common: { loading: '로딩 중...', error: '오류가 발생했습니다', success: '성공', cancel: '취소', save: '저장', delete: '삭제', edit: '편집', search: '검색', ready: '준비 완료', failed: '실패', saving: '저장 중...', score: '점수', user: '사용자' },
};

export default translations;
