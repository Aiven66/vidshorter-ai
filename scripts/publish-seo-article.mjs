// SEO Article Publisher for Clipop AI
// A self-contained script that publishes a blog article directly to Supabase
// Usage: node scripts/publish-seo-article.js
//
// Environment variables needed:
//   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL / COZE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY / COZE_SUPABASE_SERVICE_ROLE

import { createClient } from '@supabase/supabase-js';

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.COZE_SUPABASE_URL ||
    '';
}

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.COZE_SUPABASE_SERVICE_ROLE ||
    '';
}

function generateCoverImageUrl(title, category, variant = 1) {
  const coreTopic = category.replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase();
  const cleanTitle = title.replace(/clipopai/gi, 'Clipop AI').replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  const prompt = `Professional blog thumbnail for an article about ${coreTopic}. "${cleanTitle}" - modern design, blue and purple gradient accents, clean typography, video editing software concept, content creator workspace vibe, high quality, 16:9 ratio, hero image style v${variant}`;
  return `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=landscape_16_9`;
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ======== 32 Locale definitions ========
const LOCALES = [
  { code: 'en', titleSuffix: '', category: 'AI Video Clipping', intro: 'This guide explains how Clipop AI turns long videos into short highlight clips with AI.', keywords: 'Target keywords', practical: 'Practical workflow', faq: 'FAQ', cta: 'Start with a long video URL or upload a local video and let Clipop AI find the strongest moments.' },
  { code: 'zh', titleSuffix: '：AI高光短视频指南', category: 'AI视频剪辑', intro: '本指南介绍 Clipop AI 如何把长视频通过 AI 转成高光短视频。', keywords: '目标关键词', practical: '实操流程', faq: '常见问题', cta: '现在粘贴长视频链接或上传本地视频，让 Clipop AI 自动提取最精彩的高光片段。' },
  { code: 'zh-Hant', titleSuffix: '：AI高光短影片指南', category: 'AI影片剪輯', intro: '本指南介紹 Clipop AI 如何把長影片透過 AI 轉成高光時刻短影片。', keywords: '目標關鍵字', practical: '實作流程', faq: '常見問題', cta: '現在貼上長影片連結或上傳本機長影片，讓 Clipop AI 自動提取最精彩的高光片段。' },
  { code: 'ja', titleSuffix: '：AIハイライトショート動画ガイド', category: 'AI動画クリッピング', intro: 'このガイドでは、Clipop AIが長い動画リンクやローカル動画をAIによってハイライトショート動画に変換する方法を説明します。', keywords: 'ターゲットキーワード', practical: '実用的なワークフロー', faq: 'よくある質問', cta: '長い動画URLを入力するか、ローカル動画をアップロードして、Clipop AIに最も魅力的な瞬間を見つけてもらいましょう。' },
  { code: 'ko', titleSuffix: '：AI 하이라이트 쇼트 가이드', category: 'AI 영상 클리핑', intro: '이 가이드에서는 Clipop AI가 긴 영상 링크나 로컬 긴 영상을 AI로 하이라이트 쇼트 동영상으로 변환하는 방법을 설명합니다.', keywords: '타겟 키워드', practical: '실용적인 워크플로우', faq: '자주 묻는 질문', cta: '긴 영상 URL을 입력하거나 로컬 영상을 업로드하고 Clipop AI가 가장 인상적인 순간을 찾아내게 하세요.' },
  { code: 'de', titleSuffix: '：KI-Highlight-Short-Guide', category: 'KI-Video-Clipping', intro: 'Dieser Leitfaden erklärt, wie Clipop AI lange Videolinks oder lokale lange Videos mit KI in kurze Highlight-Clips umwandelt.', keywords: 'Ziel-Keywords', practical: 'Praktischer Arbeitsablauf', faq: 'Häufig gestellte Fragen', cta: 'Geben Sie eine lange Video-URL ein oder laden Sie ein lokales Video hoch und lassen Sie Clipop AI die stärksten Momente finden.' },
  { code: 'fr', titleSuffix: '：Guide des extraits courts IA', category: 'Découpage vidéo IA', intro: 'Ce guide explique comment Clipop AI transforme des liens de vidéos longues ou des vidéos longues locales en courts extraits phares grâce à l\'IA.', keywords: 'Mots-clés cibles', practical: 'Flux de travail pratique', faq: 'FAQ', cta: 'Saisissez une URL de vidéo longue ou téléchargez une vidéo locale et laissez Clipop AI trouver les moments les plus marquants.' },
  { code: 'it', titleSuffix: '：Guida clip brevi evidenza AI', category: 'Ritaglio video AI', intro: 'Questa guida spiega come Clipop AI trasforma collegamenti di video lunghi o video lunghi locali in brevi clip in evidenza con l\'AI.', keywords: 'Parole chiave target', practical: 'Flusso di lavoro pratico', faq: 'Domande frequenti', cta: 'Inserisci un URL di video lungo o carica un video locale e lascia che Clipop AI trovi i momenti più forti.' },
  { code: 'es', titleSuffix: '：Guía de clips cortos destacados con IA', category: 'Recorte de video con IA', intro: 'Esta guía explica cómo Clipop AI transforma enlaces de videos largos o videos largos locales en clips cortos destacados con IA.', keywords: 'Palabras clave objetivo', practical: 'Flujo de trabajo práctico', faq: 'Preguntas frecuentes', cta: 'Introduce una URL de video largo o sube un video local y deja que Clipop AI encuentre los momentos más destacados.' },
  { code: 'pt', titleSuffix: '：Guia de clips curtos em destaque com IA', category: 'Recorte de vídeo com IA', intro: 'Este guia explica como o Clipop AI transforma links de vídeos longos ou vídeos longos locais em clips curtos destacados com IA.', keywords: 'Palavras-chave alvo', practical: 'Fluxo de trabalho prático', faq: 'Perguntas frequentes', cta: 'Digite uma URL de vídeo longo ou faça upload de um vídeo local e deixe o Clipop AI encontrar os momentos mais marcantes.' },
  { code: 'hi', titleSuffix: '：AI हाइलाइट शॉर्ट्स गाइड', category: 'AI वीडियो क्लिपिंग', intro: 'यह गाइड बताती है कि Clipop AI लंबे वीडियो लिंक या स्थानीय लंबे वीडियो को AI के साथ शॉर्ट हाइलाइट क्लिप में कैसे बदलता है।', keywords: 'लक्ष्य कीवर्ड', practical: 'व्यावहारिक वर्कफ़्लो', faq: 'अक्सर पूछे जाने वाले प्रश्न', cta: 'एक लंबा वीडियो URL दर्ज करें या स्थानीय वीडियो अपलोड करें और Clipop AI को सबसे मजबूत क्षण ढूंढने दें।' },
  { code: 'ar', titleSuffix: '：دليل المقاطع القصيرة البارزة بالذكاء الاصطناعي', category: 'قص الفيديو بالذكاء الاصطناعي', intro: 'يشرح هذا الدليل كيف يحول Clipop AI روابط الفيديو الطويلة أو ملفات الفيديو المحلية الطويلة إلى مقاطع فيديو قصيرة بارزة باستخدام الذكاء الاصطناعي。', keywords: 'الكلمات المفتاحية المستهدفة', practical: 'سير العمل العملي', faq: 'الأسئلة الشائعة', cta: 'أدخل عنوان URL لفيديو طويل أو قم بتحميل فيديو محلي ودع Clipop AI يجد اللحظات الأقوى.' },
  { code: 'bn', titleSuffix: '：AI হাইলাইট শর্টস গাইড', category: 'AI ভিডিও ক্লিপিং', intro: 'এই গাইডে ব্যাখ্যা করা হয়েছে কিভাবে Clipop AI লম্বা ভিডিও লিঙ্ক বা স্থানীয় লম্বা ভিডিওকে AI দিয়ে শর্ট হাইলাইট ক্লিপে রূপান্তর করে।', keywords: 'টার্গেট কীওয়ার্ড', practical: 'ব্যবহারিক ওয়ার্কফ্লো', faq: 'সাধারণ প্রশ্ন', cta: 'একটি লম্বা ভিডিও URL প্রবেশ করান বা স্থানীয় ভিডিও আপলোড করুন এবং Clipop AI কে সবচেয়ে শক্তিশালী মুহূর্তগুলি খুঁজে বের করতে দিন।' },
  { code: 'id', titleSuffix: '：Panduan klip sorotan pendek AI', category: 'Pemotongan video AI', intro: 'Panduan ini menjelaskan bagaimana Clipop AI mengubah tautan video panjang atau video panjang lokal menjadi klip sorotan pendek dengan AI.', keywords: 'Kata kunci target', practical: 'Alur kerja praktis', faq: 'Pertanyaan yang sering diajukan', cta: 'Masukkan URL video panjang atau unggah video lokal dan biarkan Clipop AI menemukan momen terkuat.' },
  { code: 'ms', titleSuffix: '：Panduan klip sorotan pendek AI', category: 'Pemotongan video AI', intro: 'Panduan ini menerangkan bagaimana Clipop AI menukarkan pautan video panjang atau video panjang tempatan kepada klip sorotan pendek dengan AI.', keywords: 'Kata kunci sasaran', practical: 'Aliran kerja praktikal', faq: 'Soalan-soalan lazim', cta: 'Masukkan URL video panjang atau muat naik video tempatan dan biarkan Clipop AI mencari momen terkuat.' },
  { code: 'th', titleSuffix: '：คู่มือวิดีโอสั้นไฮไลท์ AI', category: 'การตัดต่อวิดีโอด้วย AI', intro: 'คู่มือนี้อธิบายว่า Clipop AI เปลี่ยนลิงก์วิดีโอที่ยาวหรือวิดีโอที่ยาวในเครื่องให้เป็นคลิปไฮไลท์สั้นๆ ด้วย AI อย่างไร', keywords: 'คำค้นหาเป้าหมาย', practical: 'เวิร์กโฟลว์จริง', faq: 'คำถามที่พบบ่อย', cta: 'ป้อน URL วิดีโอที่ยาวหรืออัปโหลดวิดีโอในเครื่องและปล่อยให้ Clipop AI ค้นหาช่วงเวลาที่ดีที่สุด' },
  { code: 'he', titleSuffix: '：מדריך לקליפים קצרים מודגשים עם בינה מלאכותית', category: 'חיתוך וידאו עם בינה מלאכותית', intro: 'מדריך זה מסביר איך Clipop AI הופך קישורים לוידאו ארוכים או קבצי וידאו מקומיים ארוכים לקליפים קצרים מודגשים עם בינה מלאכותית.', keywords: 'מילות מפתח יעד', practical: 'זרימת עבודה מעשית', faq: 'שאלות נפוצות', cta: 'הזן כתובת URL של וידאו ארוך או העלה וידאו מקומי ותן ל-Clipop AI למצוא את הרגעים החזקים ביותר.' },
  { code: 'ru', titleSuffix: '：Руководство по коротким клипам с ИИ', category: 'ИИ-обрезка видео', intro: 'Это руководство объясняет, как Clipop AI превращает ссылки на длинные видео или локальные длинные видео в короткие клипы с выделенными моментами с помощью ИИ.', keywords: 'Целевые ключевые слова', practical: 'Практический рабочий процесс', faq: 'Часто задаваемые вопросы', cta: 'Введите URL длинного видео или загрузите локальное видео и позвольте Clipop AI найти самые яркие моменты.' },
  { code: 'ur', titleSuffix: '：AI ہائی لائٹ شارٹس گائیڈ', category: 'AI ویڈیو کلپنگ', intro: 'یہ گائیڈ بتاتا ہے کہ Clipop AI لمبے ویڈیو لنکس یا مقامی لمبے ویڈیوز کو AI کے ساتھ مختصر ہائی لائٹ کلپس میں کیسے تبدیل کرتا ہے۔', keywords: 'ہدف کلیدی الفاظ', practical: 'عملی ورک فلو', faq: 'عام سوالات', cta: 'لمبا ویڈیو URL درج کریں یا مقامی ویڈیو اپ لوڈ کریں اور Clipop AI کو طاقتور ترین لمحات تلاش کرنے دیں۔' },
  { code: 'tr', titleSuffix: '：AI öne çıkan kısa klipler rehberi', category: 'AI video kırpma', intro: 'Bu kılavuz, Clipop AI\'nin uzun video bağlantılarını veya yerel uzun videoları AI ile nasıl kısa öne çıkan kliplere dönüştürdüğünü açıklar.', keywords: 'Hedef anahtar kelimeler', practical: 'İş akışı pratiği', faq: 'Sıkça sorulan sorular', cta: 'Uzun bir video URL girin veya yerel bir video yükleyin ve Clipop AI\'ın en güçlü anları bulmasına izin verin.' },
  { code: 'vi', titleSuffix: '：Hướng dẫn các clip ngắn nổi bật AI', category: 'Cắt video AI', intro: 'Hướng dẫn này giải thích cách Clipop AI biến các liên kết video dài hoặc video dài cục bộ thành các clip ngắn nổi bật với AI.', keywords: 'Từ khóa mục tiêu', practical: 'Quy trình thực tế', faq: 'Câu hỏi thường gặp', cta: 'Nhập URL video dài hoặc tải lên video cục bộ và để Clipop AI tìm những khoảnh khắc mạnh mẽ nhất.' },
  { code: 'fa', titleSuffix: '：راهنمای کلیپ‌های کوتاه برجسته با هوش مصنوعی', category: 'برش ویدیویی با هوش مصنوعی', intro: 'این راهنما توضیح می‌دهد که Clipop AI چگونه پیوندهای ویدیویی طولانی یا ویدیوهای طولانی محلی را با استفاده از هوش مصنوعی به کلیپ‌های کوتاه برجسته تبدیل می‌کند.', keywords: 'کلید واژه‌های هدف', practical: 'گردش کار عملی', faq: 'سوالات متداول', cta: 'یک URL ویدیویی طولانی وارد کنید یا یک ویدیوی محلی را بارگذاری کنید و اجازه دهید Clipop AI قوی‌ترین لحظات را پیدا کند.' },
  { code: 'mr', titleSuffix: '：AI हायलाइट शॉर्ट्स मार्गदर्शक', category: 'AI व्हिडिओ क्लिपिंग', intro: 'हा मार्गदर्शक Clipop AI लांग व्हिडिओ लिंक किंवा स्थानीय लांग व्हिडिओंना AI सह लहान हायलाइट क्लिप्समध्ये कसे रूपांतरित करते ते स्पष्ट करतो.', keywords: 'लक्ष्य कीवर्ड', practical: 'व्यावहारिक वर्कफ्लो', faq: 'वारंवार विचारले जाणारे प्रश्न', cta: 'लांग व्हिडिओ URL प्रविष्ट करा किंवा स्थानीय व्हिडिओ अपलोड करा आणि Clipop AI ला सर्वात बळीशाली क्षण शोधू द्या.' },
  { code: 'ta', titleSuffix: '：AI ஹைலைட் ஷார்ட்ஸ் வழிகாட்டி', category: 'AI வீடியோ கிளிப்பிங்', intro: 'இந்த வழிகாட்டி Clipop AI நீண்ட வீடியோ இணைப்புகளை அல்லது உள்ளூர் நீண்ட வீடியோக்களை AI கொண்டு குறுகிய ஹைலைட் கிளிப்களாக எவ்வாறு மாற்றுகிறது என்பதை விளக்குகிறது.', keywords: 'இலக்கு முக்கிய சொற்கள்', practical: 'நடைமுறை பணி ஓட்டம்', faq: 'அடிக்கடி கேட்கப்படும் கேள்விகள்', cta: 'ஒரு நீண்ட வீடியோ URL ஐ உள்ளிடவும் அல்லது உள்ளூர் வீடியோவை பதிவேற்றவும், மிகவும் வலுவான தருணங்களைக் கண்டறிய Clipop AI ஐ அனுமதிக்கவும்.' },
  { code: 'pl', titleSuffix: '：Przewodnik po krótkich klipach z AI', category: 'Przycinanie wideo AI', intro: 'Ten przewodnik wyjaśnia, jak Clipop AI przekształca długie linki do filmów lub lokalne długie filmy na krótkie klipy z najciekawszymi momentami za pomocą AI.', keywords: 'Słowa kluczowe docelowe', practical: 'Praktyczny przepływ pracy', faq: 'Częste pytania', cta: 'Wpisz adres URL długiego filmu lub prześlij lokalny film i pozwól Clipop AI znaleźć najsilniejsze momenty.' },
  { code: 'te', titleSuffix: '：AI హైలైట్ శార్ట్స్ గైడ్', category: 'AI వీడియో క్లిప్పింగ్', intro: 'Clipop AI పొడవైన వీడియో లింకులను లేదా స్థానిక పొడవైన వీడియోలను AI తో చిన్న హైలైట్ క్లిప్‌లుగా ఎలా మారుస్తుందో ఈ గైడ్ వివరిస్తుంది.', keywords: 'లక్ష్య కీవర్డ్‌లు', practical: 'ఆచరణీయ వర్క్‌ఫ్లో', faq: 'తరచుగా అడిగే ప్రశ్నలు', cta: 'పొడవైన వీడియో URL ని నమోదు చేయండి లేదా స్థానిక వీడియోని అప్‌లోడ్ చేయండి మరియు బలమైన క్షణాలను కనుగొనడానికి Clipop AI ని అనుమతించండి.' },
  { code: 'ne', titleSuffix: '：AI हाइलाइट सर्ट्स गाइड', category: 'AI भिडियो क्लिपिङ', intro: 'यो गाइड Clipop AI ले लामो भिडियो लिङ्कहरू वा स्थानीय लामो भिडियोहरूलाई AI द्वारा छोटो हाइलाइट क्लिपहरूमा कसरी रूपान्तरण गर्छ भनेर वर्णन गर्दछ।', keywords: 'लक्ष्य कीवर्डहरू', practical: 'व्यावहारिक कार्यप्रवाह', faq: 'अक्सर सोधिने प्रश्नहरू', cta: 'लामो भिडियो URL प्रविष्ट गर्नुहोस् वा स्थानीय भिडियो अपलोड गर्नुहोस् र Clipop AI लाई सबैभन्दा बलियो क्षणहरू फेला पार्न दिनुहोस्।' },
  { code: 'da', titleSuffix: '：Guide til korte fremhævede klip med AI', category: 'AI-videoklipning', intro: 'Denne guide forklarer, hvordan Clipop AI omdanner lange videolinks eller lokale lange videoer til korte fremhævede klip med AI.', keywords: 'Mål-Keywords', practical: 'Praktisk arbejdsgang', faq: 'Ofte stillede spørgsmål', cta: 'Indtast en lang video-URL eller upload en lokal video og lad Clipop AI finde de stærkeste øjeblikke.' },
  { code: 'fi', titleSuffix: '：Opas lyhyisiin korostettuihin klippeihin tekoälyllä', category: 'Tekoälyn videoleikkaus', intro: 'Tämä opas selittää, kuinka Clipop AI muuttaa pitkiä videolinkkejä tai paikallisia pitkiä videoita lyhyiksi kohokohta klipeiksi tekoälyllä.', keywords: 'Kohdeavainsanat', practical: 'Käytännöllinen työprosessi', faq: 'Usein kysytyt kysymykset', cta: 'Syötä pitkän videon URL tai lataa paikallinen video ja anna Clipop AI:n löytää vahvimmat hetket.' },
  { code: 'nl', titleSuffix: '：Gids voor korte gemarkeerde clips met AI', category: 'AI-videoknippen', intro: 'Deze gids legt uit hoe Clipop AI lange videolinks of lokale lange video\'s omzet in korte gemarkeerde clips met AI.', keywords: 'Doelzoekwoorden', practical: 'Praktische workflow', faq: 'Veelgestelde vragen', cta: 'Voer een lange video-URL in of upload een lokale video en laat Clipop AI de sterkste momenten vinden.' },
  { code: 'no', titleSuffix: '：Veiledning for korte fremhevede klipp med AI', category: 'AI-videoklipping', intro: 'Denne veiledningen forklarer hvordan Clipop AI gjør lange videolenker eller lokale lange videoer til korte fremhevede klipp med AI.', keywords: 'Mål-Keywords', practical: 'Praktisk arbeidsflyt', faq: 'Ofte stilte spørsmål', cta: 'Skriv inn en lang video-URL eller last opp en lokal video og la Clipop AI finne de sterkeste øyeblikkene.' },
  { code: 'sv', titleSuffix: '：Guide för korta markerade klipp med AI', category: 'AI-videoklippning', intro: 'Den här guiden förklarar hur Clipop AI omvandlar långa videolänkar eller lokala långa videor till korta markerade klipp med AI.', keywords: 'Mål-Keywords', practical: 'Praktiskt arbetsflöde', faq: 'Vanliga frågor', cta: 'Ange en lång video-URL eller ladda upp en lokal video och låt Clipop AI hitta de starkaste ögonblicken.' },
];

function createLocalizedPosts(input) {
  const now = new Date().toISOString();
  const group = `admin-${Date.now()}`;
  const originalText = stripHtml(input.content);
  const defaultCover = generateCoverImageUrl(input.title, input.category, 1);
  const coverImage = input.coverImage || defaultCover;

  return LOCALES.map((loc) => {
    let title, content;

    if (loc.code === 'en') {
      title = input.title;
      content = input.content;
    } else {
      title = `${input.title}${loc.titleSuffix}`;
      content = `<p>${loc.intro}</p><h2>Original English Title</h2><p><strong>${input.title}</strong></p><h2>${loc.keywords}</h2><p>${input.category}</p><h2>${loc.practical}</h2><p>${originalText}</p><h2>${loc.faq}</h2><p>Is Clipop AI free to try? Yes, you can start by pasting a long video URL or uploading a local file. How fast are clips generated? Most long videos under 60 minutes produce short clips within minutes. Can I use clips for commercial campaigns? Yes, you own the output for your own content.</p><p>${loc.cta}</p>`;
    }

    return {
      id: `${group}-${loc.code}`,
      title,
      category: loc.code === 'en' ? input.category : loc.category,
      content,
      cover_image: coverImage,
      created_at: now,
      view_count: 0,
      is_published: true,
      locale: loc.code,
      translation_group: group,
    };
  });
}

// ======== Article content (English) ========
const SEO_TITLE = "How to Turn Long YouTube Videos into Viral Short Clips with AI";
const SEO_CATEGORY = "YouTube Shorts";
const SEO_CONTENT = `<p>Long-form YouTube videos are an incredible content asset. A single 30-minute interview, webinar, or tutorial already contains enough material to fuel weeks of short-form posting — if you can find the right moments. The problem is that manual clipping is slow, inconsistent, and expensive. In this guide, we break down a practical workflow for turning long YouTube videos into short clips that actually perform.</p>
<h2>Why repurposing long video is the highest-leverage content play</h2>
<p>Every piece of long-form content you publish already contains the hooks, stories, and lessons your audience cares about. The challenge is not creating more — it is surfacing what is already there. A 60-minute podcast, product demo, or expert interview typically contains 10 to 20 moments that could stand alone as short-form clips. Repurposing is not about cutting corners. It is about making the value in your existing content visible to more people, in the places they already spend time.</p>
<h2>How AI identifies moments worth clipping</h2>
<p>Modern video analysis tools look at multiple signals together: audio energy, speech emphasis, topic transitions, pauses before punchlines, and even visual changes in the frame. These signals are combined to score segments of the video. The top-scoring segments become candidate clips. The key insight is that what makes a clip travel is not simply volume or excitement — it is the presence of a clear, self-contained idea that works without the surrounding context. A good clip should feel like a complete thought, not a random cut.</p>
<h2>A practical step-by-step workflow</h2>
<p><strong>Step 1 — Prepare your source video.</strong> Use the original YouTube link or a local video file. Higher-quality source material produces better clips, so always work from the best file you have.</p>
<p><strong>Step 2 — Run highlight detection.</strong> The tool analyzes the video and produces a list of candidate segments. Each segment includes a start time, end time, and a brief description of what happens in that moment.</p>
<p><strong>Step 3 — Select the moments you want.</strong> Look for segments with a clear hook in the first three seconds. Short-form platforms reward fast starts. If the clip does not grab attention immediately, it will not perform — even if the content itself is excellent.</p>
<p><strong>Step 4 — Export and publish.</strong> Export the selected clips. Most creators publish across YouTube Shorts, TikTok, Instagram Reels, and Chinese platforms like Xiaohongshu and Douyin. Add captions to match the platform tone, and use the hook as the opening line of your description.</p>
<h2>The 3-second rule for short-form</h2>
<p>The single most common mistake creators make when repurposing is choosing the wrong starting point. A clip that begins mid-sentence or opens with generic filler will stop scrolling. The opening three seconds must contain something the viewer wants to see — a surprising statement, a before-and-after, a clear question, or a confident take. If you cannot identify the hook in those first seconds, the clip is not ready to publish.</p>
<h2>What makes a clip shareable</h2>
<p>Not every segment is equally shareable. The best clips usually fit one of these patterns: a clear before-and-after, a short story with an unexpected ending, a counterintuitive tip, a strong opinion, or a quick how-to. These patterns work because they give the viewer a reason to watch until the end and a reason to share. A clip that is just "interesting content" will not travel. A clip that delivers a specific, actionable result — or a strong emotional response — will.</p>
<h2>How many clips per video</h2>
<p>As a rough guide, expect 8 to 15 usable clips per hour of high-quality content. The exact number depends on how dense the source material is. A tightly edited interview will produce more clips than a casual conversation. Rather than forcing a fixed number, focus on quality: take only the segments where the clip works as a standalone piece without needing the full video for context.</p>
<h2>Text overlays are not decoration</h2>
<p>Short videos are often watched without sound. Subtitles and text overlays are not decoration — they are the primary way viewers follow what is happening. A well-titled clip with clear text overlays will dramatically outperform the same clip without them. Make sure your titles and on-screen text are large enough to read on a phone and appear early enough to catch the scrolling viewer.</p>
<h2>Measuring what actually works</h2>
<p>Track two numbers per clip: watch-through rate and share rate. Watch-through tells you if the opening three seconds are doing their job. Share rate tells you if the content resonates strongly enough to be passed along. Over time, you will see which formats perform best for your audience. Use that signal to decide what kind of clips to extract from your next long video.</p>
<h2>Start without overthinking</h2>
<p>The biggest barrier to repurposing is not technical — it is deciding to start. Pick one video you have already published. Run it through a clipping tool. Select three to five segments. Publish them across the platforms where your audience lives. Treat this first attempt as a learning exercise. The data from those initial clips will teach you more than any theoretical guide ever could.</p>`;

async function publish() {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing environment variables');
    console.error('Set either:');
    console.error('  NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    console.error('  or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    console.error('  or COZE_SUPABASE_URL + COZE_SUPABASE_SERVICE_ROLE');
    process.exit(1);
  }

  console.log('📝 Publishing SEO Article to Clipop AI...');
  console.log(`Title: ${SEO_TITLE}`);
  console.log(`Category: ${SEO_CATEGORY}`);
  console.log(`Supabase URL: ${supabaseUrl.substring(0, 30)}...\n`);

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminUser = {
    id: 'demo-admin-id',
    email: 'admin@126.com',
    name: 'Admin',
    role: 'admin',
  };

  try {
    // Ensure author exists
    console.log('🔑 Ensuring author exists in users table...');
    const { data: existingByEmail } = await client
      .from('users')
      .select('id')
      .eq('email', adminUser.email)
      .maybeSingle();

    let authorId;
    if (existingByEmail?.id) {
      authorId = existingByEmail.id;
      console.log(`✓ Found existing author: ${authorId}`);
    } else {
      const { data, error } = await client
        .from('users')
        .upsert({
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
        .select('id')
        .maybeSingle();

      if (error) throw error;
      authorId = (data?.id) || adminUser.id;
      console.log(`✓ Created new author: ${authorId}`);
    }

    // Generate cover image
    const coverImage = generateCoverImageUrl(SEO_TITLE, SEO_CATEGORY, 1);
    console.log(`✓ Generated cover image URL`);

    // Create 32 localized versions
    const localizedPosts = createLocalizedPosts({
      title: SEO_TITLE,
      category: SEO_CATEGORY,
      content: SEO_CONTENT,
      coverImage,
      publish: true,
    });

    console.log(`✓ Created ${localizedPosts.length} localized versions`);

    // Prepare database rows
    const rows = localizedPosts.map(post => ({
      id: post.id,
      title: post.title,
      category: post.category,
      content: post.content,
      cover_image: post.cover_image,
      author_id: authorId,
      is_published: true,
      view_count: post.view_count || 0,
      created_at: post.created_at,
      updated_at: new Date().toISOString(),
    }));

    // Insert into database
    console.log('\n💾 Writing to blogs table...');
    const { error } = await client
      .from('blogs')
      .upsert(rows, { onConflict: 'id' });

    if (error) throw error;

    console.log('\n========================================');
    console.log('✅ SUCCESS! SEO article published.');
    console.log('========================================');
    console.log(`📊 Article count: ${localizedPosts.length} language versions`);
    console.log(`🏷️  Category: ${SEO_CATEGORY}`);
    console.log(`👤 Author ID: ${authorId}`);
    console.log(`🗓️ Published: ${new Date().toLocaleString()}`);
    console.log('\n📱 View in admin:');
    console.log('   → Login as admin@126.com');
    console.log('   → Management → Blog Management');
    console.log('\n🌍 Live on website:');
    console.log('   → Blog page (shows matching language)');
    console.log('========================================\n');
  } catch (err) {
    console.error('\n❌ Failed to publish:');
    console.error(err instanceof Error ? err.message : err);
    if (err?.details) console.error('Details:', err.details);
    process.exit(1);
  }
}

publish();
