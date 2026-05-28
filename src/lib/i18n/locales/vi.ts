import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Trang Chủ', blog: 'Blog', pricing: 'Giá Cả', login: 'Đăng Nhập', register: 'Đăng Ký', dashboard: 'Bảng Điều Khiển', admin: 'Bảng Quản Trị', logout: 'Đăng Xuất', credits: 'Tín Dụng', download: 'Tải Ứng Dụng', light: 'Sáng', dark: 'Tối',
  },
  common: {
  error: 'Lỗi', ready: 'Sẵn sàng', failed: 'Thất bại', saving: 'Đang lưu...', score: 'Điểm', user: 'Người dùng',
  loading: 'Đang tải...', success: 'Thành công', cancel: 'Hủy', save: 'Lưu', delete: 'Xóa', edit: 'Chỉnh Sửa', search: 'Tìm kiếm',
  },
  footer: {
  desc: 'Chuyển đổi video dài thành các đoạn ngắn hấp dẫn với phân tích và chỉnh sửa bằng AI.',
  quickLinks: 'Liên Kết Nhanh', legal: 'Pháp Lý', privacy: 'Chính Sách Bảo Mật', terms: 'Điều Khoản Dịch Vụ', contact: 'Liên Hệ', rights: 'Bảo lưu mọi quyền.',
  },
  home: {
  hero: {
  badge: 'Xử Lý Video Bằng AI',
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
  howItWorks: {
  title: 'Cách Thức Hoạt Động',
  step1: { title: 'Nhập Video', desc: 'Dán URL hoặc tải lên video' },
  step2: { title: 'Phân Tích AI', desc: 'AI tự động phát hiện điểm nổi bật' },
  step3: { title: 'Tạo Clip', desc: 'Video ngắn được tạo ra' },
  step4: { title: 'Tải Xuống', desc: 'Xuất và chia sẻ mọi nơi' },
  },
  },
  video: {
  input: { title: 'Video Đầu Vào', url: 'URL Video (YouTube/Bilibili)', upload: 'Tải Lên Video', placeholder: 'Dán liên kết video YouTube hoặc Bilibili...' },
  process: 'Xử Lý Video', processing: 'Đang Xử Lý...', analyze: 'Phân Tích', results: 'Video Ngắn Được Tạo', highlights: 'Phân Tích Nổi Bật', download: 'Tải Xuống', preview: 'Xem Trước',
  creditsAvailable: 'tín dụng khả dụng', signInToStart: 'để bắt đầu xử lý video', pasteUrlPlaceholder: 'Dán URL video (MP4, MOV, AVI...)', useLocalAgent: 'Sử dụng Agent Mac cục bộ (khuyên dùng cho YouTube ổn định)', uploadLocal: 'Tải lên tệp video cục bộ (khuyên dùng khi liên kết YouTube bị chặn)', selectedFile: 'Đã chọn', downloadMacApp: 'Tải Ứng Dụng Mac', viewPricing: 'Xem Bảng Giá', clipsReady: 'clip sẵn sàng', playableClips: 'clip có thể phát', failedClips: 'thất bại', aiFinished: 'AI đã hoàn tất việc chọn các khoảnh khắc nổi bật nhất từ video gốc của bạn.', openToPreview: 'Mở bất kỳ clip sẵn sàng nào để xem trước trực tiếp hoặc tải xuống MP4 trực tiếp.', clipsBeingGenerated: 'Đang tạo clip:', videoPreviewNotAvailable: 'Xem trước video không khả dụng', clipMayStillProcessing: 'Clip có thể vẫn đang xử lý hoặc tạo thất bại.', insufficientCredits: 'Không đủ tín dụng. Bạn cần ít nhất 30 tín dụng.', enterVideoUrl: 'Vui lòng nhập URL video hoặc tải lên tệp video cục bộ.', enterValidUrl: 'Vui lòng nhập URL video http(s) công khai hợp lệ.',
  stage: {
  init: 'Đang khởi tạo...', extractFrames: 'Đang trích xuất khung hình video...', framesExtracted: 'Trích xuất khung hình thành công', framesUnavailable: 'Tiếp tục phân tích', aiAnalysis: 'AI đang phân tích nội dung video...', analysisComplete: 'Phân tích hoàn tất', generatingClip: 'Đang tạo clip nổi bật...', clipReady: 'Clip nổi bật sẵn sàng', saving: 'Đang lưu kết quả...', complete: 'Xử lý hoàn tất!', error: 'Đã xảy ra lỗi',
  },
  },
  pricing: {
  title: 'Giá Cả Đơn Giản, Trong Suốt', subtitle: 'Chọn gói phù hợp với nhu cầu của bạn',
  paymentNote: 'Alipay cho Trung Quốc · Creem cho Quốc tế (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Tất cả thanh toán được bảo mật bằng mã hóa TLS 256-bit', faqTitle: 'Câu Hỏi Thường Gặp', faq: { q1: 'Tín dụng là gì?', a1: 'Mỗi tín dụng đại diện cho năng lực xử lý. Xử lý một clip video tiêu tốn 30 tín dụng.', q2: 'Cách đặt lại tín dụng hàng ngày hoạt động như thế nào?', a2: 'Tín dụng được đặt lại về giới hạn hàng ngày của gói lúc 00:00 UTC mỗi ngày. Tín dụng không sử dụng không được chuyển sang.', q3: 'Tôi có thể nâng cấp hoặc hạ cấp gói không?', a3: 'Có, bạn có thể thay đổi gói bất cứ lúc nào. Thay đổi có hiệu lực ngay lập tức.', q4: 'Nguồn video nào được hỗ trợ?', a4: 'Chúng tôi hỗ trợ YouTube, Bilibili và tải lên tệp video trực tiếp (MP4, MOV, AVI).', q5: 'Phương thức thanh toán nào được hỗ trợ?', a5: 'Alipay cho người dùng Trung Quốc, Creem (Visa, Mastercard, Apple Pay, Google Pay) cho người dùng quốc tế.' },
  mostPopular: 'Phổ Biến Nhất',
  free: { title: 'Miễn Phí', price: '$0', period: '/tháng', desc: 'Hoàn hảo để dùng thử', feature1: '100 tín dụng mỗi ngày', feature2: 'Cắt video cơ bản', feature3: 'Chất lượng xuất 720p', feature4: 'Có hình mờ', cta: 'Bắt Đầu' },
  starter: { title: 'Bắt Đầu', price: '$9.9', period: '/tháng', desc: 'Dành cho người sáng tạo nội dung', feature1: '500 tín dụng mỗi ngày', feature2: 'Xử lý ưu tiên', feature3: 'Chất lượng xuất 1080p', feature4: 'Không có hình mờ', feature5: 'Hỗ trợ email', cta: 'Đăng Ký Ngay' },
  pro: { title: 'Chuyên Nghiệp', price: '$19.9', period: '/tháng', desc: 'Dành cho chuyên gia và nhóm', feature1: 'Tín dụng không giới hạn', feature2: 'Xử lý nhanh nhất', feature3: 'Chất lượng xuất 4K', feature4: 'Không có hình mờ', feature5: 'Truy cập API', feature6: 'Hỗ trợ ưu tiên', cta: 'Đăng Ký Ngay' },
  },
  downloadPage: {
  title: 'Tải Clipop Agent', subtitle: 'Ứng dụng máy tính để xử lý video YouTube/Bilibili ổn định', badge: 'Ứng Dụng Máy Tính', macTitle: 'macOS', macDesc: 'Dành cho Mac Apple Silicon (M1/M2/M3/M4)', downloadButton: 'Tải cho macOS', version: 'Phiên bản', fileSize: 'Kích thước tệp', requirements: 'macOS 12.0 trở lên', installing: 'Hướng Dẫn Cài Đặt', step1: 'Nhấn nút tải xuống để lưu tệp .dmg', step2: 'Nhấp đúp vào tệp .dmg đã tải', step3: 'Kéo Clipop Agent vào thư mục Ứng dụng', step4: 'Mở Clipop Agent từ Ứng dụng', notAvailable: 'Tải xuống đang được chuẩn bị, vui lòng kiểm tra lại sau', backToHome: 'Về Trang Chủ', whyDesktopTitle: 'Tại Sao Nên Dùng Ứng Dụng Máy Tính?', features: { stable: { title: 'Xử Lý Ổn Định', desc: 'Xử lý video cục bộ với độ ổn định tối đa' }, fast: { title: 'Tải Xuống Nhanh', desc: 'Tải video trực tiếp không bị giới hạn trình duyệt' }, local: { title: 'Xử Lý Cục Bộ', desc: 'Xử lý video trên Mac để bảo mật và tốc độ' } },
  },
  login: {
  title: 'Đăng Nhập', description: 'Truy cập tài khoản của bạn', emailLabel: 'Email', emailPlaceholder: 'you@example.com', passwordLabel: 'Mật Khẩu', passwordPlaceholder: '••••••••', submitButton: 'Đăng Nhập', orContinueWith: 'Hoặc tiếp tục với', googleButton: 'Tiếp tục với Google', dontHaveAccount: 'Chưa có tài khoản?', signUp: 'Đăng Ký',
  successTitle: 'Đăng Nhập Thành Công!', successMessage: 'Bạn đã đăng nhập thành công với tư cách', successDesktopHint: 'Nhấn nút bên dưới để quay lại ứng dụng máy tính.', returnToDesktop: 'Quay Lại Clipop Agent', desktopNotOpened: 'Nếu ứng dụng máy tính không tự động mở, vui lòng đảm bảo Clipop Agent đang chạy.',
  },
  register: {
  title: 'Tạo Tài Khoản', description: 'Bắt đầu với Clipop AI', nameLabel: 'Họ và Tên', namePlaceholder: 'John Doe', emailLabel: 'Email', emailPlaceholder: 'you@example.com', passwordLabel: 'Mật Khẩu', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Xác Nhận Mật Khẩu', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Tiếp Tục', sendingCode: 'Đang gửi...', codeLabel: 'Mã Xác Nhận', codePlaceholder: 'Nhập mã 6 chữ số', verifyButton: 'Tạo Tài Khoản', codeNotReceived: 'Không nhận được mã?', resendButton: 'Gửi Lại', resendIn: 'Gửi lại trong', backButton: 'Quay Lại', googleButton: 'Tiếp tục với Google', alreadyHaveAccount: 'Đã có tài khoản?', signIn: 'Đăng Nhập',
  errorNameRequired: 'Vui lòng nhập tên của bạn', errorEmailRequired: 'Vui lòng nhập email', errorPasswordLength: 'Mật khẩu phải có ít nhất 6 ký tự', errorPasswordMismatch: 'Mật khẩu không khớp', errorEmailExists: 'Email này đã được đăng ký. Vui lòng đăng nhập.', errorSendCode: 'Gửi mã thất bại', errorNetwork: 'Lỗi mạng. Vui lòng thử lại.', errorCodeLength: 'Vui lòng nhập mã 6 chữ số',
  successTitle: 'Tài Khoản Đã Tạo!', successMessage: 'Tài khoản của bạn đã được tạo thành công với tư cách', successDesktopHint: 'Nhấn nút bên dưới để quay lại ứng dụng máy tính.', returnToDesktop: 'Quay Lại Clipop Agent', desktopNotOpened: 'Nếu ứng dụng máy tính không tự động mở, vui lòng đảm bảo Clipop Agent đang chạy.',
  },
  dashboard: { title: 'Bảng Điều Khiển', credits: 'Tín Dụng Có Sẵn', creditsReset: 'Đặt lại hàng ngày lúc 00:00 UTC', history: 'Lịch Sử Xử Lý', noVideos: 'Chưa có video nào được xử lý', startProcessing: 'Bắt Đầu Xử Lý Video',
  untitled: 'Không Tiêu Đề', clip: 'Clip', clipsCount: 'điểm nổi bật', clipsHint: 'Nhấn vào bất kỳ clip nào để phát',
  desktopLoginDetected: 'Phát Hiện Đăng Nhập Từ Ứng Dụng Máy Tính', desktopLoginHint: 'Nhấn nút bên dưới để quay lại Clipop Agent', returnToDesktop: 'Quay Lại Clipop Agent',
  welcomeBack: 'Chào mừng trở lại',
  videosProcessed: 'Video Đã Xử Lý', videosProcessedDesc: 'Tổng video đã xử lý', clipsGenerated: 'Clip Đã Tạo', clipsGeneratedDesc: 'Tổng clip nổi bật',
  currentPlan: 'Gói Hiện Tại', upgradePlan: 'Nâng Cấp Gói',
  processNewVideo: 'Xử Lý Video Mới', feedback: 'Phản Hồi',
  historyHint: 'Nhấn vào bản ghi đã hoàn tất để mở rộng và xem clip nổi bật',
  processNewVideoDesc: 'Đi đến trang chủ để xử lý video dài mới', goToProcessor: 'Đi Đến Bộ Xử Lý Video',
  userFeedback: 'Phản Hồi Người Dùng', feedbackDesc: 'Cho chúng tôi biết về tính năng bạn muốn cải thiện hoặc vấn đề bạn gặp phải',
  feedbackPlaceholder: 'Nhập phản hồi của bạn (gợi ý, lỗi, yêu cầu tính năng, v.v.)', feedbackSubmitted: 'Đã gửi, cảm ơn phản hồi của bạn!',
  submitFeedback: 'Gửi Phản Hồi', feedbackFailed: 'Gửi phản hồi thất bại',
  statusPending: 'Chờ Xử Lý', statusProcessing: 'Đang Xử Lý', statusCompleted: '✓ Hoàn Tất', statusFailed: 'Thất Bại',
  },
  admin: { title: 'Bảng Quản Trị', blog: 'Quản Lý Blog', blogCreate: 'Tạo Bài Viết', blogTitle: 'Tiêu Đề', blogCategory: 'Danh Mục', blogContent: 'Nội Dung', blogPublish: 'Xuất Bản', blogSave: 'Lưu Bản Nháp', blogPublished: 'Đã Xuất Bản', blogDraft: 'Bản Nháp' },
  blog: { title: 'Blog', readMore: 'Đọc Thêm', noPosts: 'Chưa có bài viết nào', subtitle: 'Tin tức mới nhất, mẹo và cập nhật từ Clipop AI', views: 'lượt xem' },
  common: { loading: 'Đang tải...', error: 'Đã xảy ra lỗi', success: 'Thành công', cancel: 'Hủy', save: 'Lưu', delete: 'Xóa', edit: 'Chỉnh Sửa', search: 'Tìm kiếm' },
};

export default translations;
