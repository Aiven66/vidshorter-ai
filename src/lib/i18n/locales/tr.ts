import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Ana Sayfa', blog: 'Blog', pricing: 'Fiyatlar', login: 'Giriş Yap', register: 'Kayıt Ol', dashboard: 'Kontrol Paneli', admin: 'Yönetici Paneli', logout: 'Çıkış Yap', credits: 'Kredi', download: 'Uygulamayı İndir', light: 'Açık', dark: 'Koyu',
  },
  common: {
  error: 'Hata', ready: 'Hazır', failed: 'Başarısız', saving: 'Kaydediliyor...', score: 'Puan', user: 'Kullanıcı',
  loading: 'Yükleniyor...', success: 'Başarılı', cancel: 'İptal', save: 'Kaydet', delete: 'Sil', edit: 'Düzenle', search: 'Ara',
  },
  footer: {
  desc: 'AI destekli analiz ve düzenleme ile uzun videolarınızı ilgi çekici kısa kliplere dönüştürün.',
  quickLinks: 'Hızlı Bağlantılar', legal: 'Yasal', privacy: 'Gizlilik Politikası', terms: 'Hizmet Şartları', contact: 'İletişim', rights: 'Tüm hakları saklıdır.',
  },
  home: {
  hero: {
  badge: 'AI Destekli Video İşleme',
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
  howItWorks: {
  title: 'Nasıl Çalışır',
  step1: { title: 'Video Girin', desc: 'URL yapıştırın veya videonuzu yükleyin' },
  step2: { title: 'AI Analizi', desc: 'AI öne çıkanları otomatik algılar' },
  step3: { title: 'Klip Oluştur', desc: 'Kısa videolar oluşturulur' },
  step4: { title: 'İndirin', desc: 'Dışa aktarın ve her yerde paylaşın' },
  },
  },
  video: {
  input: { title: 'Giriş Videosu', url: 'Video URL\'si (YouTube/Bilibili)', upload: 'Video Yükle', placeholder: 'YouTube veya Bilibili video bağlantısını yapıştırın...' },
  process: 'Videoyu İşle', processing: 'İşleniyor...', analyze: 'Analiz Et', results: 'Oluşturulan Kısa Videolar', highlights: 'Öne Çıkan Analizi', download: 'İndir', preview: 'Önizleme',
  creditsAvailable: 'kredi mevcut', signInToStart: 'video işlemeye başlamak için', pasteUrlPlaceholder: 'Video URL\'si yapıştırın (MP4, MOV, AVI...)', useLocalAgent: 'Yerel Mac Agent kullanın (kararlı YouTube için önerilir)', uploadLocal: 'Yerel video dosyası yükleyin (YouTube bağlantısı engellendiğinde önerilir)', selectedFile: 'Seçilen', downloadMacApp: 'Mac Uygulamasını İndir', viewPricing: 'Fiyatları Gör', clipsReady: 'klip hazır', playableClips: 'oynatılabilir klip', failedClips: 'başarısız', aiFinished: 'AI kaynak videonuzdan en güçlü anları seçmeyi tamamladı.', openToPreview: 'Satır içi önizleme için hazır herhangi bir klibi açın veya MP4\'ü doğrudan indirin.', clipsBeingGenerated: 'Klipler oluşturuluyor:', videoPreviewNotAvailable: 'Video önizleme mevcut değil', clipMayStillProcessing: 'Klip hala işleniyor veya oluşturma başarısız olmuş olabilir.', insufficientCredits: 'Yetersiz kredi. En az 30 krediye ihtiyacınız var.', enterVideoUrl: 'Lütfen bir video URL\'si girin veya yerel bir video dosyası yükleyin.', enterValidUrl: 'Lütfen geçerli bir genel http(s) video URL\'si girin.',
  stage: {
  init: 'Başlatılıyor...', extractFrames: 'Video kareleri çıkarılıyor...', framesExtracted: 'Kareler başarıyla çıkarıldı', framesUnavailable: 'Analizle devam ediliyor', aiAnalysis: 'AI video içeriğini analiz ediyor...', analysisComplete: 'Analiz tamamlandı', generatingClip: 'Öne çıkan klip oluşturuluyor...', clipReady: 'Öne çıkan klip hazır', saving: 'Sonuçlar kaydediliyor...', complete: 'İşleme tamamlandı!', error: 'Hata oluştu',
  },
  },
  pricing: {
  title: 'Basit, Şeffaf Fiyatlandırma', subtitle: 'İhtiyaçlarınıza uygun planı seçin',
  paymentNote: 'Çin için Alipay · Uluslararası için Creem (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Tüm ödemeler TLS 256-bit şifreleme ile güvende', faqTitle: 'Sıkça Sorulan Sorular', faq: { q1: 'Kredi nedir?', a1: 'Her kredi işlem gücünü temsil eder. Bir video klibi işlemek 30 kredi tutar.', q2: 'Günlük kredi sıfırlama nasıl çalışır?', a2: 'Krediler her gün 00:00 UTC\'de planınızın günlük limitine sıfırlanır. Kullanılmayan krediler devretmez.', q3: 'Planımı yükseltebilir veya düşürebilir miyim?', a3: 'Evet, planınızı istediğiniz zaman değiştirebilirsiniz. Değişiklikler hemen yürürlüğe girer.', q4: 'Hangi video kaynakları destekleniyor?', a4: 'YouTube, Bilibili ve doğrudan video dosya yüklemelerini (MP4, MOV, AVI) destekliyoruz.', q5: 'Hangi ödeme yöntemleri destekleniyor?', a5: 'Çin kullanıcıları için Alipay, uluslararası kullanıcılar için Creem (Visa, Mastercard, Apple Pay, Google Pay).' },
  mostPopular: 'En Popüler',
  free: { title: 'Ücretsiz', price: '$0', period: '/ay', desc: 'Denemek için mükemmel', feature1: 'Günlük 100 kredi', feature2: 'Temel video kırpma', feature3: '720p ihracat kalitesi', feature4: 'Filigran dahil', cta: 'Başla' },
  starter: { title: 'Başlangıç', price: '$9.9', period: '/ay', desc: 'İçerik oluşturucular için', feature1: 'Günlük 500 kredi', feature2: 'Öncelikli işleme', feature3: '1080p ihracat kalitesi', feature4: 'Filigran yok', feature5: 'E-posta desteği', cta: 'Şimdi Abone Ol' },
  pro: { title: 'Profesyonel', price: '$19.9', period: '/ay', desc: 'Profesyoneller ve ekipler için', feature1: 'Sınırsız kredi', feature2: 'En hızlı işleme', feature3: '4K ihracat kalitesi', feature4: 'Filigran yok', feature5: 'API erişimi', feature6: 'Öncelikli destek', cta: 'Şimdi Abone Ol' },
  },
  downloadPage: {
  title: 'Clipop Agent İndir', subtitle: 'Kararlı YouTube/Bilibili video işleme için masaüstü uygulaması', badge: 'Masaüstü Uygulaması', macTitle: 'macOS', macDesc: 'Apple Silicon (M1/M2/M3/M4) Mac\'ler için', downloadButton: 'macOS için İndir', version: 'Sürüm', fileSize: 'Dosya boyutu', requirements: 'macOS 12.0 veya sonrası', installing: 'Kurulum Kılavuzu', step1: '.dmg dosyasını kaydetmek için indirme düğmesine tıklayın', step2: 'İndirilen .dmg dosyasına çift tıklayın', step3: 'Clipop Agent\'ı Uygulamalar klasörüne sürükleyin', step4: 'Uygulamalar\'dan Clipop Agent\'ı açın', notAvailable: 'İndirme hazırlanıyor, lütfen daha sonra tekrar kontrol edin', backToHome: 'Ana Sayfaya Dön', whyDesktopTitle: 'Masaüstü Uygulamasını Neden Kullanmalısınız?', features: { stable: { title: 'Kararlı İşleme', desc: 'Maksimum kararlılıkla videoları yerel olarak işleyin' }, fast: { title: 'Hızlı İndirme', desc: 'Tarayıcı kısıtlamaları olmadan videoları doğrudan indirin' }, local: { title: 'Yerel İşleme', desc: 'Gizlilik ve hız için videoları Mac\'inizde işleyin' } },
  },
  login: {
  title: 'Giriş Yap', description: 'Hesabınıza erişin', emailLabel: 'E-posta', emailPlaceholder: 'you@example.com', passwordLabel: 'Şifre', passwordPlaceholder: '••••••••', submitButton: 'Giriş Yap', orContinueWith: 'Veya ile devam et', googleButton: 'Google ile devam et', dontHaveAccount: 'Hesabınız yok mu?', signUp: 'Kayıt Ol',
  successTitle: 'Giriş Başarılı!', successMessage: 'Olarak başarıyla giriş yaptınız', successDesktopHint: 'Masaüstü uygulamasına dönmek için aşağıdaki düğmeye tıklayın.', returnToDesktop: 'Clipop Agent\'a Dön', desktopNotOpened: 'Masaüstü uygulaması otomatik olarak açılmazsa, lütfen Clipop Agent\'ın çalıştığından emin olun.',
  },
  register: {
  title: 'Hesap Oluştur', description: 'Clipop AI ile başla', nameLabel: 'Tam Ad', namePlaceholder: 'John Doe', emailLabel: 'E-posta', emailPlaceholder: 'you@example.com', passwordLabel: 'Şifre', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Şifre Tekrar', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Devam Et', sendingCode: 'Gönderiliyor...', codeLabel: 'Doğrulama Kodu', codePlaceholder: '6 haneli kodu girin', verifyButton: 'Hesap Oluştur', codeNotReceived: 'Kodu almadınız mı?', resendButton: 'Yeniden Gönder', resendIn: 'içinde yeniden gönder', backButton: 'Geri', googleButton: 'Google ile devam et', alreadyHaveAccount: 'Zaten hesabınız var mı?', signIn: 'Giriş Yap',
  errorNameRequired: 'Lütfen adınızı girin', errorEmailRequired: 'Lütfen e-postanızı girin', errorPasswordLength: 'Şifre en az 6 karakter olmalıdır', errorPasswordMismatch: 'Şifreler uyuşmuyor', errorEmailExists: 'Bu e-posta zaten kayıtlı. Lütfen giriş yapın.', errorSendCode: 'Kod gönderilemedi', errorNetwork: 'Ağ hatası. Lütfen tekrar deneyin.', errorCodeLength: 'Lütfen 6 haneli kodu girin',
  successTitle: 'Hesap Oluşturuldu!', successMessage: 'Hesabınız başarıyla oluşturuldu olarak', successDesktopHint: 'Masaüstü uygulamasına dönmek için aşağıdaki düğmeye tıklayın.', returnToDesktop: 'Clipop Agent\'a Dön', desktopNotOpened: 'Masaüstü uygulaması otomatik olarak açılmazsa, lütfen Clipop Agent\'ın çalıştığından emin olun.',
  },
  dashboard: { title: 'Kontrol Paneli', credits: 'Mevcut Kredi', creditsReset: 'Her gün 00:00 UTC\'de sıfırlanır', history: 'İşleme Geçmişi', noVideos: 'Henüz işlenmiş video yok', startProcessing: 'Video İşlemeyi Başlat',
  untitled: 'Başlıksız', clip: 'Klip', clipsCount: 'öne çıkan', clipsHint: 'Oynatmak için herhangi bir klibe tıklayın',
  desktopLoginDetected: 'Masaüstü Uygulaması Girişi Algılandı', desktopLoginHint: 'Clipop Agent\'a dönmek için aşağıdaki düğmeye tıklayın', returnToDesktop: 'Clipop Agent\'a Dön',
  welcomeBack: 'Tekrar hoş geldiniz',
  videosProcessed: 'İşlenen Videolar', videosProcessedDesc: 'Toplam işlenen video', clipsGenerated: 'Oluşturulan Klipler', clipsGeneratedDesc: 'Toplam öne çıkan klip',
  currentPlan: 'Mevcut Plan', upgradePlan: 'Planı Yükselt',
  processNewVideo: 'Yeni Video İşle', feedback: 'Geri Bildirim',
  historyHint: 'Öne çıkan klipleri görüntülemek için tamamlanmış kayıtları genişletin',
  processNewVideoDesc: 'Yeni bir uzun video işlemek için ana sayfaya gidin', goToProcessor: 'Video İşleyiciye Git',
  userFeedback: 'Kullanıcı Geri Bildirimi', feedbackDesc: 'İyileştirmek istediğiniz özellikleri veya karşılaştığınız sorunları bize bildirin',
  feedbackPlaceholder: 'Geri bildiriminizi girin (öneriler, hatalar, özellik istekleri vb.)', feedbackSubmitted: 'Gönderildi, geri bildiriminiz için teşekkürler!',
  submitFeedback: 'Geri Bildirim Gönder', feedbackFailed: 'Geri bildirim gönderilemedi',
  statusPending: 'Beklemede', statusProcessing: 'İşleniyor', statusCompleted: '✓ Tamamlandı', statusFailed: 'Başarısız',
  },
  admin: { title: 'Yönetici Paneli', blog: 'Blog Yönetimi', blogCreate: 'Gönderi Oluştur', blogTitle: 'Başlık', blogCategory: 'Kategori', blogContent: 'İçerik', blogPublish: 'Yayınla', blogSave: 'Taslak Kaydet', blogPublished: 'Yayınlandı', blogDraft: 'Taslak' },
  blog: { title: 'Blog', readMore: 'Daha Fazla Oku', noPosts: 'Henüz gönderi yok', subtitle: 'Clipop AI\'den en son haberler, ipuçları ve güncellemeler', views: 'görüntülenme' },
  common: { loading: 'Yükleniyor...', error: 'Bir hata oluştu', success: 'Başarılı', cancel: 'İptal', save: 'Kaydet', delete: 'Sil', edit: 'Düzenle', search: 'Ara' },
};

export default translations;
