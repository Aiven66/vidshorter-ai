import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Laman Utama', blog: 'Blog', pricing: 'Harga', login: 'Log Masuk', register: 'Daftar', dashboard: 'Papan Pemuka', admin: 'Panel Admin', logout: 'Log Keluar', credits: 'Kredit', download: 'Muat Turun Aplikasi', light: 'Cerah', dark: 'Gelap',
  },
  footer: {
  desc: 'Tukar video panjang anda kepada klip pendek yang menarik dengan analisis dan penyuntingan berkuasa AI.', quickLinks: 'Pautan Pantas', legal: 'Undang-undang', privacy: 'Dasar Privasi', terms: 'Terma Perkhidmatan', contact: 'Hubungi', rights: 'Hak cipta terpelihara.',
  },
  home: {
  hero: {
  badge: 'Pemprosesan Video Berkuasa AI',
  title: 'Tukar Video Panjang Menjadi Pendek Viral',
  subtitle: 'Potongan video berkuasa AI yang mengekstrak momen terbaik daripada kandungan panjang anda secara automatik',
  cta: 'Mula Memotong Secara Percuma',
  secondary: 'Tonton Demo',
  },
  howItWorks: {
  title: 'Cara Ia Berfungsi', step1: { title: 'Input Video', desc: 'Tampal URL atau muat naik video anda' }, step2: { title: 'Analisis AI', desc: 'AI mengesan sorotan secara automatik' }, step3: { title: 'Jana Klip', desc: 'Video pendek dihasilkan' }, step4: { title: 'Muat Turun', desc: 'Eksport dan kongsi di mana-mana' },
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
  creditsAvailable: 'kredit tersedia', signInToStart: 'untuk mula memproses video', pasteUrlPlaceholder: 'Tampal URL video (MP4, MOV, AVI...)', useLocalAgent: 'Gunakan Mac Agent tempatan (disyorkan untuk YouTube yang stabil)', uploadLocal: 'Muat naik fail video tempatan (disyorkan apabila pautan YouTube disekat)', selectedFile: 'Dipilih', downloadMacApp: 'Muat Turun Aplikasi Mac', viewPricing: 'Lihat Harga', clipsReady: 'klip sedia', playableClips: 'klip boleh dimainkan', failedClips: 'gagal', aiFinished: 'AI telah selesai memilih momen terkuat daripada video sumber anda.', openToPreview: 'Buka mana-mana klip sedia untuk pratonton, atau muat turun MP4 terus.', clipsBeingGenerated: 'Klip sedang dijana:', videoPreviewNotAvailable: 'Pratonton video tidak tersedia', clipMayStillProcessing: 'Klip mungkin masih diproses atau gagal dijana.', insufficientCredits: 'Kredit tidak mencukupi. Anda memerlukan sekurang-kurangnya 30 kredit.', enterVideoUrl: 'Sila masukkan URL video atau muat naik fail video tempatan.', enterValidUrl: 'Sila masukkan URL http(s) awam yang sah.',
  stage: {
  init: 'Memulakan...', extractFrames: 'Mengekstrak bingkai video...', framesExtracted: 'Bingkai berjaya diekstrak', framesUnavailable: 'Meneruskan dengan analisis', aiAnalysis: 'AI menganalisis kandungan video...', analysisComplete: 'Analisis selesai', generatingClip: 'Mencipta klip sorotan...', clipReady: 'Klip sorotan sedia', saving: 'Menyimpan keputusan...', complete: 'Pemprosesan selesai!', error: 'Ralat berlaku',
  },
  },
  pricing: {
  title: 'Harga yang Mudah dan Telus', subtitle: 'Pilih pelan yang sesuai keperluan anda',
  paymentNote: 'Alipay untuk China · Creem untuk Antarabangsa (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Semua pembayaran dijamin dengan penyulitan TLS 256-bit', faqTitle: 'Soalan Lazim', faq: { q1: 'Apakah kredit?', a1: 'Setiap kredit mewakili kuasa pemprosesan. Memproses klip video memerlukan 30 kredit.', q2: 'Bagaimana reset kredit harian berfungsi?', a2: 'Kredit direset kepada had harian pelan anda pada 00:00 UTC setiap hari. Kredit yang tidak digunakan tidak dibawa ke hadapan.', q3: 'Bolehkah saya menaik taraf atau menurunkan pelan saya?', a3: 'Ya, anda boleh menukar pelan anda bila-bila masa. Perubahan berkuat kuasa serta-merta.', q4: 'Sumber video apa yang disokong?', a4: 'Kami menyokong YouTube, Bilibili, dan muat naik fail video terus (MP4, MOV, AVI).', q5: 'Kaedah pembayaran apa yang disokong?', a5: 'Alipay untuk pengguna China, Creem (Visa, Mastercard, Apple Pay, Google Pay) untuk pengguna antarabangsa.' },
  mostPopular: 'Paling Popular',
  free: { title: 'Percuma', price: '$0', period: '/bulan', desc: 'Sempurna untuk mencuba', feature1: '100 kredit setiap hari', feature2: 'Potongan video asas', feature3: 'Kualiti eksport 720p', feature4: 'Tanda air termasuk', cta: 'Mula' },
  starter: { title: 'Pemula', price: '$9.9', period: '/bulan', desc: 'Untuk pencipta kandungan', feature1: '500 kredit setiap hari', feature2: 'Pemprosesan keutamaan', feature3: 'Kualiti eksport 1080p', feature4: 'Tiada tanda air', feature5: 'Sokongan e-mel', cta: 'Langgan Sekarang' },
  pro: { title: 'Pro', price: '$19.9', period: '/bulan', desc: 'Untuk profesional dan pasukan', feature1: 'Kredit tanpa had', feature2: 'Pemprosesan terpantas', feature3: 'Kualiti eksport 4K', feature4: 'Tiada tanda air', feature5: 'Akses API', feature6: 'Sokongan keutamaan', cta: 'Langgan Sekarang' },
  },
  downloadPage: {
  title: 'Muat Turun Clipop Agent', subtitle: 'Aplikasi desktop untuk pemprosesan video YouTube/Bilibili yang stabil', badge: 'Aplikasi Desktop', macTitle: 'macOS', macDesc: 'Untuk Mac Apple Silicon (M1/M2/M3/M4)', downloadButton: 'Muat Turun untuk macOS', version: 'Versi', fileSize: 'Saiz fail', requirements: 'macOS 12.0 atau lebih baru', installing: 'Panduan Pemasangan', step1: 'Klik butang muat turun untuk menyimpan fail .dmg', step2: 'Klik dua kali fail .dmg yang dimuat turun', step3: 'Seret Clipop Agent ke folder Applications', step4: 'Buka Clipop Agent dari Applications', notAvailable: 'Muat turun sedang disediakan, sila semak kemudian', backToHome: 'Kembali ke Laman Utama', whyDesktopTitle: 'Mengapa Gunakan Aplikasi Desktop?', features: { stable: { title: 'Pemprosesan Stabil', desc: 'Proses video secara tempatan dengan kestabilan maksimum' }, fast: { title: 'Muat Turun Pantas', desc: 'Muat turun video terus tanpa had pelayar' }, local: { title: 'Pemprosesan Tempatan', desc: 'Proses video pada Mac anda untuk privasi dan kelajuan' } },
  },
  login: {
  title: 'Log Masuk', description: 'Akses akaun anda', emailLabel: 'E-mel', emailPlaceholder: 'you@example.com', passwordLabel: 'Kata Laluan', passwordPlaceholder: '••••••••', submitButton: 'Log Masuk', orContinueWith: 'Atau teruskan dengan', googleButton: 'Teruskan dengan Google', dontHaveAccount: 'Tiada akaun?', signUp: 'Daftar',
  successTitle: 'Log Masuk Berjaya!', successMessage: 'Anda berjaya log masuk sebagai', successDesktopHint: 'Klik butang di bawah untuk kembali ke aplikasi desktop.', returnToDesktop: 'Kembali ke Clipop Agent', desktopNotOpened: 'Jika aplikasi desktop tidak terbuka secara automatik, sila pastikan Clipop Agent sedang berjalan.',
  },
  register: {
  title: 'Buat Akaun', description: 'Mula dengan Clipop AI', nameLabel: 'Nama Penuh', namePlaceholder: 'John Doe', emailLabel: 'E-mel', emailPlaceholder: 'you@example.com', passwordLabel: 'Kata Laluan', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Sahkan Kata Laluan', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Teruskan', sendingCode: 'Menghantar...', codeLabel: 'Kod Pengesahan', codePlaceholder: 'Masukkan kod 6 digit', verifyButton: 'Buat Akaun', codeNotReceived: 'Tidak menerima kod?', resendButton: 'Hantar Semula', resendIn: 'Hantar semula dalam', backButton: 'Kembali', googleButton: 'Teruskan dengan Google', alreadyHaveAccount: 'Sudah mempunyai akaun?', signIn: 'Log Masuk',
  errorNameRequired: 'Sila masukkan nama anda', errorEmailRequired: 'Sila masukkan e-mel anda', errorPasswordLength: 'Kata laluan mestilah sekurang-kurangnya 6 aksara', errorPasswordMismatch: 'Kata laluan tidak sepadan', errorEmailExists: 'E-mel ini sudah didaftarkan. Sila log masuk sebaliknya.', errorSendCode: 'Gagal menghantar kod', errorNetwork: 'Ralat rangkaian. Sila cuba lagi.', errorCodeLength: 'Sila masukkan kod 6 digit',
  successTitle: 'Akaun Dicipta!', successMessage: 'Akaun anda berjaya dicipta sebagai', successDesktopHint: 'Klik butang di bawah untuk kembali ke aplikasi desktop.', returnToDesktop: 'Kembali ke Clipop Agent', desktopNotOpened: 'Jika aplikasi desktop tidak terbuka secara automatik, sila pastikan Clipop Agent sedang berjalan.',
  },
  dashboard: { title: 'Papan Pemuka', credits: 'Kredit Tersedia', creditsReset: 'Set semula harian pada 00:00 UTC', history: 'Sejarah Pemprosesan', noVideos: 'Belum ada video yang diproses', startProcessing: 'Mula Memproses Video',
  untitled: 'Tanpa Tajuk', clip: 'Klip', clipsCount: 'sorotan', clipsHint: 'Klik mana-mana klip untuk dimainkan',
  desktopLoginDetected: 'Log Masuk Aplikasi Desktop Dikesan', desktopLoginHint: 'Klik butang di bawah untuk kembali ke Clipop Agent', returnToDesktop: 'Kembali ke Clipop Agent',
  welcomeBack: 'Selamat kembali',
  videosProcessed: 'Video Diproses', videosProcessedDesc: 'Jumlah video yang diproses', clipsGenerated: 'Klip Dijana', clipsGeneratedDesc: 'Jumlah klip sorotan',
  currentPlan: 'Pelan Semasa', upgradePlan: 'Tingkatkan Pelan',
  processNewVideo: 'Proses Video Baharu', feedback: 'Maklum Balas',
  historyHint: 'Klik rekod yang selesai untuk melihat klip sorotan',
  processNewVideoDesc: 'Pergi ke halaman utama untuk memproses video panjang baharu', goToProcessor: 'Pergi ke Pemproses Video',
  userFeedback: 'Maklum Balas Pengguna', feedbackDesc: 'Beritahu kami tentang ciri yang ingin anda tingkatkan atau masalah yang anda hadapi',
  feedbackPlaceholder: 'Masukkan maklum balas anda (cadangan, pepijat, permintaan ciri, dll.)', feedbackSubmitted: 'Dihantar, terima kasih atas maklum balas anda!',
  submitFeedback: 'Hantar Maklum Balas', feedbackFailed: 'Gagal menghantar maklum balas',
  statusPending: 'Menunggu', statusProcessing: 'Memproses', statusCompleted: '✓ Selesai', statusFailed: 'Gagal',
  },
  admin: { title: 'Panel Admin', blog: 'Pengurusan Blog', blogCreate: 'Buat Siaran', blogTitle: 'Tajuk', blogCategory: 'Kategori', blogContent: 'Kandungan', blogPublish: 'Terbitkan', blogSave: 'Simpan Draf', blogPublished: 'Diterbitkan', blogDraft: 'Draf' },
  blog: { title: 'Blog', readMore: 'Baca Lagi', noPosts: 'Belum ada siaran', subtitle: 'Berita terkini, petua, dan kemas kini daripada Clipop AI', views: 'paparan' },
  common: { loading: 'Memuat...', error: 'Ralat berlaku', success: 'Berjaya', cancel: 'Batal', save: 'Simpan', delete: 'Padam', edit: 'Edit', search: 'Cari', ready: 'Sedia', failed: 'Gagal', saving: 'Menyimpan...', score: 'Skor', user: 'Pengguna' },
};

export default translations;
