import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Beranda', blog: 'Blog', pricing: 'Harga', login: 'Masuk', register: 'Daftar', dashboard: 'Dasbor', admin: 'Panel Admin', logout: 'Keluar', credits: 'Kredit', download: 'Unduh Aplikasi', light: 'Terang', dark: 'Gelap',
  },
  footer: {
  desc: 'Ubah video panjangmu menjadi klip pendek yang menarik dengan analisis dan pengeditan bertenaga AI.', quickLinks: 'Tautan Cepat', legal: 'Legal', privacy: 'Kebijakan Privasi', terms: 'Ketentuan Layanan', contact: 'Kontak', rights: 'Hak cipta dilindungi.',
  },
  home: {
  hero: {
  badge: 'Pemrosesan Video Bertenaga AI',
  title: 'Ubah Video Panjang Menjadi Short Viral',
  subtitle: 'Potongan video bertenaga AI yang mengekstrak momen terbaik dari konten panjangmu secara otomatis',
  cta: 'Mulai Memotong Gratis',
  secondary: 'Tonton Demo',
  },
  howItWorks: {
  title: 'Cara Kerjanya', step1: { title: 'Input Video', desc: 'Tempel URL atau unggah videomu' }, step2: { title: 'Analisis AI', desc: 'AI mendeteksi sorotan secara otomatis' }, step3: { title: 'Buat Klip', desc: 'Video pendek dibuat' }, step4: { title: 'Unduh', desc: 'Ekspor dan bagikan di mana saja' },
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
  creditsAvailable: 'kredit tersedia', signInToStart: 'untuk mulai memproses video', pasteUrlPlaceholder: 'Tempel URL video (MP4, MOV, AVI...)', useLocalAgent: 'Gunakan Mac Agent lokal (disarankan untuk YouTube yang stabil)', uploadLocal: 'Unggah file video lokal (disarankan saat tautan YouTube diblokir)', selectedFile: 'Dipilih', downloadMacApp: 'Unduh Aplikasi Mac', viewPricing: 'Lihat Harga', clipsReady: 'klip siap', playableClips: 'klip dapat diputar', failedClips: 'gagal', aiFinished: 'AI telah selesai memilih momen terkuat dari video sumbermu.', openToPreview: 'Buka klip yang siap untuk mempratinjaunya, atau unduh MP4 langsung.', clipsBeingGenerated: 'Klip sedang dibuat:', videoPreviewNotAvailable: 'Pratinjau video tidak tersedia', clipMayStillProcessing: 'Klip mungkin masih diproses atau gagal dibuat.', insufficientCredits: 'Kredit tidak cukup. Kamu membutuhkan setidaknya 30 kredit.', enterVideoUrl: 'Silakan masukkan URL video atau unggah file video lokal.', enterValidUrl: 'Silakan masukkan URL http(s) publik yang valid.',
  stage: {
  init: 'Menginisialisasi...', extractFrames: 'Mengekstrak frame video...', framesExtracted: 'Frame berhasil diekstrak', framesUnavailable: 'Melanjutkan dengan analisis', aiAnalysis: 'AI menganalisis konten video...', analysisComplete: 'Analisis selesai', generatingClip: 'Membuat klip sorotan...', clipReady: 'Klip sorotan siap', saving: 'Menyimpan hasil...', complete: 'Pemrosesan selesai!', error: 'Terjadi kesalahan',
  },
  },
  pricing: {
  title: 'Harga yang Sederhana dan Transparan', subtitle: 'Pilih paket yang sesuai kebutuhanmu',
  paymentNote: 'Alipay untuk Tiongkok · Creem untuk Internasional (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Semua pembayaran dijamin dengan enkripsi TLS 256-bit', faqTitle: 'Pertanyaan yang Sering Diajukan', faq: { q1: 'Apa itu kredit?', a1: 'Setiap kredit mewakili kekuatan pemrosesan. Memproses klip video memakan 30 kredit.', q2: 'Bagaimana cara kerja reset kredit harian?', a2: 'Kredit direset ke batas harian paketmu setiap hari pukul 00:00 UTC. Kredit yang tidak digunakan tidak ditransfer.', q3: 'Bisakah saya meningkatkan atau menurunkan paket?', a3: 'Ya, kamu bisa mengubah paketmu kapan saja. Perubahan berlaku segera.', q4: 'Sumber video apa yang didukung?', a4: 'Kami mendukung YouTube, Bilibili, dan unggahan file video langsung (MP4, MOV, AVI).', q5: 'Metode pembayaran apa yang didukung?', a5: 'Alipay untuk pengguna Tiongkok, Creem (Visa, Mastercard, Apple Pay, Google Pay) untuk pengguna internasional.' },
  mostPopular: 'Paling Populer',
  free: { title: 'Gratis', price: '$0', period: '/bulan', desc: 'Cocok untuk mencoba', feature1: '100 kredit harian', feature2: 'Potongan video dasar', feature3: 'Kualitas ekspor 720p', feature4: 'Terdapat tanda air', cta: 'Mulai' },
  starter: { title: 'Pemula', price: '$9.9', period: '/bulan', desc: 'Untuk pembuat konten', feature1: '500 kredit harian', feature2: 'Proses prioritas', feature3: 'Kualitas ekspor 1080p', feature4: 'Tanpa tanda air', feature5: 'Dukungan email', cta: 'Berlangganan Sekarang' },
  pro: { title: 'Pro', price: '$19.9', period: '/bulan', desc: 'Untuk profesional dan tim', feature1: 'Kredit tidak terbatas', feature2: 'Proses tercepat', feature3: 'Kualitas ekspor 4K', feature4: 'Tanpa tanda air', feature5: 'Akses API', feature6: 'Dukungan prioritas', cta: 'Berlangganan Sekarang' },
  },
  downloadPage: {
  title: 'Unduh Clipop Agent', subtitle: 'Aplikasi desktop untuk pemrosesan video YouTube/Bilibili yang stabil', badge: 'Aplikasi Desktop', macTitle: 'macOS', macDesc: 'Untuk Mac Apple Silicon (M1/M2/M3/M4)', downloadButton: 'Unduh untuk macOS', version: 'Versi', fileSize: 'Ukuran file', requirements: 'macOS 12.0 atau lebih baru', installing: 'Panduan Instalasi', step1: 'Klik tombol unduh untuk menyimpan file .dmg', step2: 'Klik dua kali file .dmg yang diunduh', step3: 'Seret Clipop Agent ke folder Applications', step4: 'Buka Clipop Agent dari Applications', notAvailable: 'Unduhan sedang disiapkan, silakan cek kembali nanti', backToHome: 'Kembali ke Beranda', whyDesktopTitle: 'Mengapa Menggunakan Aplikasi Desktop?', features: { stable: { title: 'Pemrosesan Stabil', desc: 'Proses video secara lokal dengan stabilitas maksimal' }, fast: { title: 'Unduhan Cepat', desc: 'Unduh video langsung tanpa batasan browser' }, local: { title: 'Pemrosesan Lokal', desc: 'Proses video di Mac-mu untuk privasi dan kecepatan' } },
  },
  login: {
  title: 'Masuk', description: 'Akses akunmu', emailLabel: 'Email', emailPlaceholder: 'you@example.com', passwordLabel: 'Kata Sandi', passwordPlaceholder: '••••••••', submitButton: 'Masuk', orContinueWith: 'Atau lanjutkan dengan', googleButton: 'Lanjutkan dengan Google', dontHaveAccount: 'Tidak punya akun?', signUp: 'Daftar',
  successTitle: 'Login Berhasil!', successMessage: 'Kamu berhasil login sebagai', successDesktopHint: 'Klik tombol di bawah untuk kembali ke aplikasi desktop.', returnToDesktop: 'Kembali ke Clipop Agent', desktopNotOpened: 'Jika aplikasi desktop tidak terbuka otomatis, pastikan Clipop Agent sedang berjalan.',
  },
  register: {
  title: 'Buat Akun', description: 'Mulai dengan Clipop AI', nameLabel: 'Nama Lengkap', namePlaceholder: 'John Doe', emailLabel: 'Email', emailPlaceholder: 'you@example.com', passwordLabel: 'Kata Sandi', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Konfirmasi Kata Sandi', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Lanjutkan', sendingCode: 'Mengirim...', codeLabel: 'Kode Verifikasi', codePlaceholder: 'Masukkan kode 6 digit', verifyButton: 'Buat Akun', codeNotReceived: 'Tidak menerima kode?', resendButton: 'Kirim Ulang', resendIn: 'Kirim ulang dalam', backButton: 'Kembali', googleButton: 'Lanjutkan dengan Google', alreadyHaveAccount: 'Sudah punya akun?', signIn: 'Masuk',
  errorNameRequired: 'Silakan masukkan namamu', errorEmailRequired: 'Silakan masukkan emailmu', errorPasswordLength: 'Kata sandi harus minimal 6 karakter', errorPasswordMismatch: 'Kata sandi tidak cocok', errorEmailExists: 'Email ini sudah terdaftar. Silakan login.', errorSendCode: 'Gagal mengirim kode', errorNetwork: 'Kesalahan jaringan. Silakan coba lagi.', errorCodeLength: 'Silakan masukkan kode 6 digit',
  successTitle: 'Akun Dibuat!', successMessage: 'Akunmu berhasil dibuat sebagai', successDesktopHint: 'Klik tombol di bawah untuk kembali ke aplikasi desktop.', returnToDesktop: 'Kembali ke Clipop Agent', desktopNotOpened: 'Jika aplikasi desktop tidak terbuka otomatis, pastikan Clipop Agent sedang berjalan.',
  },
  dashboard: { title: 'Dasbor', credits: 'Kredit Tersedia', creditsReset: 'Reset harian jam 00:00 UTC', history: 'Riwayat Proses', noVideos: 'Belum ada video yang diproses', startProcessing: 'Mulai Memproses Video',
  untitled: 'Tanpa Judul', clip: 'Klip', clipsCount: 'sorotan', clipsHint: 'Klik klip apa saja untuk memutar',
  desktopLoginDetected: 'Login Aplikasi Desktop Terdeteksi', desktopLoginHint: 'Klik tombol di bawah untuk kembali ke Clipop Agent', returnToDesktop: 'Kembali ke Clipop Agent',
  welcomeBack: 'Selamat datang kembali',
  videosProcessed: 'Video Diproses', videosProcessedDesc: 'Total video yang diproses', clipsGenerated: 'Klip Dibuat', clipsGeneratedDesc: 'Total klip sorotan',
  currentPlan: 'Paket Saat Ini', upgradePlan: 'Tingkatkan Paket',
  processNewVideo: 'Proses Video Baru', feedback: 'Umpan Balik',
  historyHint: 'Klik catatan yang selesai untuk melihat klip sorotan',
  processNewVideoDesc: 'Pergi ke halaman beranda untuk memproses video panjang baru', goToProcessor: 'Pergi ke Pemroses Video',
  userFeedback: 'Umpan Balik Pengguna', feedbackDesc: 'Beritahu kami tentang fitur yang ingin kamu tingkatkan atau masalah yang kamu temui',
  feedbackPlaceholder: 'Masukkan umpan balikmu (saran, bug, permintaan fitur, dll.)', feedbackSubmitted: 'Terkirim, terima kasih atas umpan balikmu!',
  submitFeedback: 'Kirim Umpan Balik', feedbackFailed: 'Gagal mengirim umpan balik',
  statusPending: 'Tertunda', statusProcessing: 'Memproses', statusCompleted: '✓ Selesai', statusFailed: 'Gagal',
  },
  admin: { title: 'Panel Admin', blog: 'Manajemen Blog', blogCreate: 'Buat Postingan', blogTitle: 'Judul', blogCategory: 'Kategori', blogContent: 'Konten', blogPublish: 'Terbitkan', blogSave: 'Simpan Draf', blogPublished: 'Diterbitkan', blogDraft: 'Draf' },
  blog: { title: 'Blog', readMore: 'Baca Selengkapnya', noPosts: 'Belum ada postingan', subtitle: 'Berita terbaru, tips, dan pembaruan dari Clipop AI', views: 'tayangan' },
  common: { loading: 'Memuat...', error: 'Terjadi kesalahan', success: 'Berhasil', cancel: 'Batal', save: 'Simpan', delete: 'Hapus', edit: 'Edit', search: 'Cari', ready: 'Siap', failed: 'Gagal', saving: 'Menyimpan...', score: 'Skor', user: 'Pengguna' },
};

export default translations;
