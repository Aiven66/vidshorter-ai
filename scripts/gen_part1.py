#!/usr/bin/env python3
"""Generate complete blog-content.ts file with 35+ articles."""
from pathlib import Path

OUTPUT = Path("src/lib/blog-content.ts")

# ============ TRANSLATION TEMPLATES (32 locales) ============
TRANSLATIONS = {
    "en": {"intro": "This guide explains how Clipop AI turns long video links or local long videos into short highlight clips with AI.",
           "keywords": "Target keywords", "practical": "Practical workflow", "faq": "FAQ",
           "cta": "Start with a long video URL or upload a local video and let Clipop AI find the strongest moments.",
           "originalTitle": "Original English article", "category": "AI Video Clipping", "titleSuffix": ""},
    "zh": {"intro": "这篇指南介绍 Clipop AI 如何把长视频链接或本地长视频，通过 AI 转成高光时刻短视频。",
           "keywords": "目标关键词", "practical": "实操流程", "faq": "常见问题",
           "cta": "现在输入长视频链接或上传本地长视频，让 Clipop AI 自动提取最精彩的高光片段。",
           "originalTitle": "英文原文标题", "category": "AI视频剪辑", "titleSuffix": "：AI 高光短视频指南"},
    "zh-Hant": {"intro": "這篇指南介紹 Clipop AI 如何把長影片連結或本機長影片，透過 AI 轉成高光時刻短影片。",
                "keywords": "目標關鍵字", "practical": "實作流程", "faq": "常見問題",
                "cta": "現在輸入長影片連結或上傳本機長影片，讓 Clipop AI 自動提取最精彩的高光片段。",
                "originalTitle": "英文原文標題", "category": "AI影片剪輯", "titleSuffix": "：AI 高光短影片指南"},
    "ja": {"intro": "このガイドでは、Clipop AI が長い動画リンクやローカル動画を、AI によってハイライトショート動画に変換する方法を説明します。",
           "keywords": "ターゲットキーワード", "practical": "実用的なワークフロー", "faq": "よくある質問",
           "cta": "長い動画URLを入力するか、ローカル動画をアップロードして、Clipop AI に最も魅力的な瞬間を見つけてもらいましょう。",
           "originalTitle": "英語の原文タイトル", "category": "AI動画クリッピング", "titleSuffix": "：AIハイライトショート動画ガイド"},
    "ko": {"intro": "이 가이드에서는 Clipop AI가 긴 영상 링크나 로컬 긴 영상을 AI로 하이라이트 쇼트 동영상으로 변환하는 방법을 설명합니다.",
           "keywords": "타겟 키워드", "practical": "실용적인 워크플로우", "faq": "자주 묻는 질문",
           "cta": "긴 영상 URL을 입력하거나 로컬 영상을 업로드하고 Clipop AI가 가장 인상적인 순간을 찾아내게 하세요.",
           "originalTitle": "영어 원본 제목", "category": "AI 영상 클리핑", "titleSuffix": "：AI 하이라이트 쇼트 가이드"},
    "de": {"intro": "Dieser Leitfaden erklärt, wie Clipop AI lange Videolinks oder lokale lange Videos mit KI in kurze Highlight-Clips umwandelt.",
           "keywords": "Ziel-Keywords", "practical": "Praktischer Arbeitsablauf", "faq": "Häufig gestellte Fragen",
           "cta": "Geben Sie eine lange Video-URL ein oder laden Sie ein lokales Video hoch und lassen Sie Clipop AI die stärksten Momente finden.",
           "originalTitle": "Original-Titel auf Englisch", "category": "KI-Video-Clipping", "titleSuffix": "：KI-Highlight-Short-Guide"},
    "fr": {"intro": "Ce guide explique comment Clipop AI transforme des liens de vidéos longues ou des vidéos longues locales en courts extraits phares grâce à l'IA.",
           "keywords": "Mots-clés cibles", "practical": "Flux de travail pratique", "faq": "FAQ",
           "cta": "Saisissez une URL de vidéo longue ou téléchargez une vidéo locale et laissez Clipop AI trouver les moments les plus marquants.",
           "originalTitle": "Titre original en anglais", "category": "Découpage vidéo IA", "titleSuffix": "：Guide des extraits courts IA"},
    "it": {"intro": "Questa guida spiega come Clipop AI trasforma collegamenti di video lunghi o video lunghi locali in brevi clip in evidenza con l'AI.",
           "keywords": "Parole chiave target", "practical": "Flusso di lavoro pratico", "faq": "Domande frequenti",
           "cta": "Inserisci un URL di video lungo o carica un video locale e lascia che Clipop AI trovi i momenti più forti.",
           "originalTitle": "Titolo originale inglese", "category": "Ritaglio video AI", "titleSuffix": "：Guida clip brevi evidenza AI"},
    "es": {"intro": "Esta guía explica cómo Clipop AI transforma enlaces de videos largos o videos largos locales en clips cortos destacados con IA.",
           "keywords": "Palabras clave objetivo", "practical": "Flujo de trabajo práctico", "faq": "Preguntas frecuentes",
           "cta": "Introduce una URL de video largo o sube un video local y deja que Clipop AI encuentre los momentos más destacados.",
           "originalTitle": "Título original en inglés", "category": "Recorte de video con IA", "titleSuffix": "：Guía de clips cortos destacados con IA"},
    "pt": {"intro": "Este guia explica como o Clipop AI transforma links de vídeos longos ou vídeos longos locais em clips curtos destacados com IA.",
           "keywords": "Palavras-chave alvo", "practical": "Fluxo de trabalho prático", "faq": "Perguntas frequentes",
           "cta": "Digite uma URL de vídeo longo ou faça upload de um vídeo local e deixe o Clipop AI encontrar os momentos mais marcantes.",
           "originalTitle": "Título original em português", "category": "Recorte de vídeo com IA", "titleSuffix": "：Guia de clips curtos com IA"},
    "hi": {"intro": "यह गाइड बताती है कि Clipop AI लंबे वीडियो लिंक या स्थानीय लंबे वीडियो को AI के साथ शॉर्ट हाइलाइट क्लिप में कैसे बदलता है।",
           "keywords": "लक्ष्य कीवर्ड", "practical": "व्यावहारिक वर्कफ़्लो", "faq": "अक्सर पूछे जाने वाले प्रश्न",
           "cta": "एक लंबा वीडियो URL दर्ज करें या स्थानीय वीडियो अपलोड करें और Clipop AI को सबसे मजबूत क्षण ढूंढने दें।",
           "originalTitle": "अंग्रेज़ी मूल शीर्षक", "category": "AI वीडियो क्लिपिंग", "titleSuffix": "：AI हाइलाइट शॉर्ट्स गाइड"},
    "ar": {"intro": "يشرح هذا الدليل كيف يحول Clipop AI روابط الفيديو الطويلة أو ملفات الفيديو المحلية الطويلة إلى مقاطع فيديو قصيرة بارزة باستخدام الذكاء الاصطناعي.",
           "keywords": "الكلمات المفتاحية المستهدفة", "practical": "سير العمل العملي", "faq": "الأسئلة الشائعة",
           "cta": "أدخل عنوان URL لفيديو طويل أو قم بتحميل فيديو محلي ودع Clipop AI يجد اللحظات الأقوى.",
           "originalTitle": "العنوان الأصلي باللغة الإنجليزية", "category": "قص الفيديو بالذكاء الاصطناعي", "titleSuffix": "：دليل المقاطع القصيرة البارزة بالذكاء الاصطناعي"},
    "bn": {"intro": "এই গাইডে ব্যাখ্যা করা হয়েছে কিভাবে Clipop AI লম্বা ভিডিও লিঙ্ক বা স্থানীয় লম্বা ভিডিওকে AI দিয়ে শর্ট হাইলাইট ক্লিপে রুপান্তর করে।",
           "keywords": "টার্গেট কীওয়ার্ড", "practical": "ব্যবহারিক ওয়ার্কফ্লো", "faq": "সাধারণ প্রশ্ন",
           "cta": "একটি লম্বা ভিডিও URL প্রবেশ করান বা স্থানীয় ভিডিও আপলোড করুন এবং Clipop AI কে সবচেয়ে শক্তিশালী মুহূর্তগুলি খুঁজে বের করতে দিন।",
           "originalTitle": "ইংরেজি মূল শিরোনাম", "category": "AI ভিডিও ক্লিপিং", "titleSuffix": "：AI হাইলাইট শর্টস গাইড"},
    "id": {"intro": "Panduan ini menjelaskan bagaimana Clipop AI mengubah tautan video panjang atau video panjang lokal menjadi klip sorotan pendek dengan AI.",
           "keywords": "Kata kunci target", "practical": "Alur kerja praktis", "faq": "Pertanyaan yang sering diajukan",
           "cta": "Masukkan URL video panjang atau unggah video lokal dan biarkan Clipop AI menemukan momen terkuat.",
           "originalTitle": "Judul asli bahasa Inggris", "category": "Pemotongan video AI", "titleSuffix": "：Panduan klip sorotan pendek AI"},
    "ms": {"intro": "Panduan ini menerangkan bagaimana Clipop AI menukarkan pautan video panjang atau video panjang tempatan kepada klip sorotan pendek dengan AI.",
           "keywords": "Kata kunci sasaran", "practical": "Aliran kerja praktikal", "faq": "Soalan-soalan lazim",
           "cta": "Masukkan URL video panjang atau muat naik video tempatan dan biarkan Clipop AI mencari momen terkuat.",
           "originalTitle": "Tajuk asal bahasa Inggeris", "category": "Pemotongan video AI", "titleSuffix": "：Panduan klip sorotan pendek AI"},
    "th": {"intro": "คู่มือนี้อธิบายว่า Clipop AI เปลี่ยนลิงก์วิดีโอที่ยาวหรือวิดีโอที่ยาวในเครื่องให้เป็นคลิปไฮไลที่สั้นๆ ด้วย AI อย่างไร",
           "keywords": "คำค้นหาเป้าหมาย", "practical": "เวิร์กโฟลว์จริง", "faq": "คำถามที่พบบ่อย",
           "cta": "ป้อน URL วิดีโอที่ยาวหรืออัปโหลดวิดีโอในเครื่องและปล่อยให้ Clipop AI ค้นหาช่วงเวลาที่ดีที่สุด",
           "originalTitle": "ชื่อหัวข้ออังกฤษต้นฉบับ", "category": "การตัดต่อวิดีโอด้วย AI", "titleSuffix": "：คู่มือวิดีโอสั้นไฮไลท์ AI"},
    "he": {"intro": "מדריך זה מסביר איך Clipop AI הופך קישורי וידאו ארוכים או וידאוים מקומיים ארוכים לקליפי היילייט קצרים עם בינה מלאכותית.",
           "keywords": "מילות מפתח יעד", "practical": "זרימת עבודה מעשית", "faq": "שאלות נפוצות",
           "cta": "הזן כתובת URL של וידאו ארוך או העלה וידאו מקומי ותן ל-Clipop AI למצוא את הרגעים החזקים ביותר.",
           "originalTitle": "כותרת מקורית באנגלית", "category": "חיתוך וידאו עם בינה מלאכותית", "titleSuffix": "：מדריך לקליפי היילייט קצרים עם בינה מלאכותית"},
    "ru": {"intro": "Это руководство объясняет, как Clipop AI превращает ссылки на длинные видео или локальные длинные видео в короткие клипы с выделенными моментами с помощью ИИ.",
           "keywords": "Целевые ключевые слова", "practical": "Практический рабочий процесс", "faq": "Часто задаваемые вопросы",
           "cta": "Введите URL длинного видео или загрузите локальное видео и позвольте Clipop AI найти самые яркие моменты.",
           "originalTitle": "Оригинальное название на английском", "category": "ИИ-обрезка видео", "titleSuffix": "：Руководство по коротким клипам ИИ"},
    "ur": {"intro": "یہ گائیڈ بتاتا ہے کہ Clipop AI لمبے ویڈیو لنکس یا مقامی لمبے ویڈیوز کو AI کے ساتھ مختصر ہائی لائٹ کلپس میں کیسے تبدیل کرتا ہے۔",
           "keywords": "ہدف کلیدی الفاظ", "practical": "عملی ورک فلو", "faq": "عام سوالات",
           "cta": "لمبا ویڈیو URL درج کریں یا مقامی ویڈیو اپ لوڈ کریں اور Clipop AI کو طاقتور ترین لمحات تلاش کرنے دیں۔",
           "originalTitle": "اصلی انگریزی عنوان", "category": "AI ویڈیو کلپنگ", "titleSuffix": "：AI ہائی لائٹ شارٹس گائیڈ"},
    "tr": {"intro": "Bu kılavuz, Clipop AI'nin uzun video bağlantılarını veya yerel uzun videoları AI ile kısa öne çıkan kliplere nasıl dönüştürdüğünü açıklar.",
           "keywords": "Hedef anahtar kelimeler", "practical": "İş akışı pratiği", "faq": "Sıkça sorulan sorular",
           "cta": "Uzun bir video URL girin veya yerel bir video yükleyin ve Clipop AI'nın en güçlü anları bulmasına izin verin.",
           "originalTitle": "İngilizce orijinal başlık", "category": "AI video kırpma", "titleSuffix": "：AI öne çıkan kısa kılavuzu"},
    "vi": {"intro": "Hướng dẫn này giải thích cách Clipop AI biến các liên kết video dài hoặc video dài cục bộ thành các clip nổi bật ngắn với AI.",
           "keywords": "Từ khóa mục tiêu", "practical": "Quy trình thực tế", "faq": "Câu hỏi thường gặp",
           "cta": "Nhập URL video dài hoặc tải lên video cục bộ và để Clipop AI tìm những khoảnh khắc mạnh mẽ nhất.",
           "originalTitle": "Tiêu đề tiếng Anh gốc", "category": "Cắt video AI", "titleSuffix": "：Hướng dẫn clip ngắn nổi bật AI"},
    "fa": {"intro": "این راهنما توضیح می‌دهد که Clipop AI چگونه پیوندهای ویدیویی طولانی یا ویدیوهای طولانی محلی را با استفاده از هوش مصنوعی به کلیپ‌های کوتاه برجسته تبدیل می‌کند.",
           "keywords": "کلید واژه‌های هدف", "practical": "گردش کار عملی", "faq": "سوالات متداول",
           "cta": "یک URL ویدیویی طولانی وارد کنید یا یک ویدیوی محلی را بارگذاری کنید و اجازه دهید Clipop AI قوی‌ترین لحظات را پیدا کند.",
           "originalTitle": "عنوان اصلی انگلیسی", "category": "برش ویدیویی با هوش مصنوعی", "titleSuffix": "：راهنمای کلیپ‌های کوتاه برجسته با هوش مصنوعی"},
    "mr": {"intro": "हे मार्गदर्शक Clipop AI लांग व्हिडिओ लिंक किंवा स्थानिक लांग व्हिडिओंना AI सह लहान हायलाइट क्लिप्समध्ये कसे रूपांतर करते ते स्पष्ट करते.",
           "keywords": "लक्ष्य कीवर्ड", "practical": "व्यावहारिक वर्कफ्लो", "faq": "वारंवार विचारले जाणारे प्रश्न",
           "cta": "लांग व्हिडिओ URL प्रविष्ट करा किंवा स्थानिक व्हिडिओ अपलोड करा आणि Clipop AI ला सर्वात बळीशाली क्षण शोधू द्या.",
           "originalTitle": "इंग्लिश मूल शीर्षक", "category": "AI व्हिडिओ क्लिपिंग", "titleSuffix": "：AI हायलाइट शॉर्ट्स गाईड"},
    "ta": {"intro": "இந்த வழிகாட்டி Clipop AI நீண்ட வீடியோ இணைப்புகளை அல்லது உள்ளூர் நீண்ட வீடியோக்களை AI கொண்டு குறுகிய ஹைலைட் கிளிப்களாக எவ்வாறு மாற்றுகிறது என்பதை விளக்குகிறது.",
           "keywords": "இலக்கு முக்கிய சொற்கள்", "practical": "நடைமுறை பணி ஓட்டம்", "faq": "அடிக்கடி கேட்கப்படும் கேள்விகள்",
           "cta": "ஒரு நீண்ட வீடியோ URL ஐ உள்ளிடவும் அல்லது உள்ளூர் வீடியோவை பதிவேற்றவும், Clipop AI வுக்கு வலுவான தருணங்களைக் கண்டறிய அனுமதிக்கவும்.",
           "originalTitle": "ஆங்கில அசல் தலைப்பு", "category": "AI வீடியோ கிளிப்பிங்", "titleSuffix": "：AI ஹைலைட் ஷார்ட்ஸ் வழிகாட்டி"},
    "pl": {"intro": "Ten przewodnik wyjaśnia, jak Clipop AI przekształca długie linki do filmów lub lokalne długie filmy na krótkie klipy z najciekawszymi momentami za pomocą AI.",
           "keywords": "Słowa kluczowe docelowe", "practical": "Praktyczny przepływ pracy", "faq": "Częste pytania",
           "cta": "Wpisz adres URL długiego filmu lub prześlij lokalny film i pozwól Clipop AI znaleźć najsilniejsze momenty.",
           "originalTitle": "Oryginalny tytuł angielski", "category": "Przycinanie filmów AI", "titleSuffix": "：Przewodnik po krótkich klipach AI"},
    "te": {"intro": "Clipop AI పొడవైన వీడియో లింకులను లేదా స్థానిక పొడవైన వీడియోలను AI తో చిన్న హైలైట్ క్లిప్‌లుగా ఎలా మారుస్తుందో ఈ గైడ్ వివరిస్తుంది.",
           "keywords": "లక్ష్య కీవర్డ్‌లు", "practical": "ఆచరణీయ వర్క్‌ఫ్లో", "faq": "తరచుగా అడిగే ప్రశ్నలు",
           "cta": "పొడవైన వీడియో URL ని నమోదు చేయండి లేదా స్థానిక వీడియోని అప్‌లోడ్ చేయండి మరియు Clipop AI కు బలమైన క్షణాలను కనుగొనడానికి అనుమతించండి.",
           "originalTitle": "ఆంగ్ల అసలు శీర్షిక", "category": "AI వీడియో క్లిప్పింగ్", "titleSuffix": "：AI హైలైట్ శార్ట్‌లు గైడ్"},
    "ne": {"intro": "यो गाइडले Clipop AI ले लामो भिडियो लिंकहरू वा स्थानीय लामो भिडियोहरूलाई AI द्वारा छोटो हाइलाइट क्लिपहरूमा कसरी रूपान्तरण गर्छ भनेर वर्णन गर्दछ।",
           "keywords": "लक्ष्य कीवर्डहरू", "practical": "व्यावहारिक कार्यप्रवाह", "faq": "अक्सर सोधिने प्रश्नहरू",
           "cta": "एउटा लामो भिडियो URL प्रविष्ट गर्नुहोस् वा स्थानीय भिडियो अपलोड गर्नुहोस् र Clipop AI लाई सबैभन्दा बलिया क्षणहरू फेला पार्न दिनुहोस्।",
           "originalTitle": "अंग्रेजी मूल शीर्षक", "category": "AI भिडियो क्लिपिङ", "titleSuffix": "：AI हाइलाइट सर्ट्स गाइड"},
    "da": {"intro": "Denne guide forklarer, hvordan Clipop AI omdanner lange videolinks eller lokale lange videoer til korte highlight-klip med AI.",
           "keywords": "Mål-Keywords", "practical": "Praktisk arbejdsgang", "faq": "Ofte stillede spørgsmål",
           "cta": "Indtast en lang video-URL eller upload en lokal video, og lad Clipop AI finde de stærkeste øjeblikke.",
           "originalTitle": "Original engelsk titel", "category": "AI-videoklipning", "titleSuffix": "：Guide til AI-highlight shorts"},
    "fi": {"intro": "Tämä opas selittää, kuinka Clipop AI muuttaa pitkiä videolinkkejä tai paikallisia pitkiä videoita lyhyiksi kohokohtaklipeiksi AI:llä.",
           "keywords": "Kohdeavainsanat", "practical": "Käytännöllinen työprosessi", "faq": "Usein kysytyt kysymykset",
           "cta": "Syötä pitkän videon URL tai lataa paikallinen video ja anna Clipop AI:n löytää vahvimmat hetket.",
           "originalTitle": "Alkuperäinen englanninkielinen otsikko", "category": "AI-videoleikkaus", "titleSuffix": "：Opas AI-kohokohta-klipille"},
    "nl": {"intro": "Deze gids legt uit hoe Clipop AI lange videolinks of lokale lange video's omzet in korte highlight-clips met AI.",
           "keywords": "Doelzoekwoorden", "practical": "Praktische workflow", "faq": "Veelgestelde vragen",
           "cta": "Voer een lange video-URL in of upload een lokale video en laat Clipop AI de sterkste momenten vinden.",
           "originalTitle": "Originele Engelse titel", "category": "AI-videoknippen", "titleSuffix": "：Gids voor AI-highlight shorts"},
    "no": {"intro": "Denne veiledningen forklarer hvordan Clipop AI gjør om lange videolenker eller lokale lange videoer til korte highlight-klipp med AI.",
           "keywords": "Mål-Keywords", "practical": "Praktisk arbeidsflyt", "faq": "Ofte stilte spørsmål",
           "cta": "Skriv inn en lang video-URL eller last opp en lokal video og la Clipop AI finne de sterkeste øyeblikkene.",
           "originalTitle": "Original engelsk tittel", "category": "AI-videoklipping", "titleSuffix": "：Veiledning for AI-highlight shorts"},
    "sv": {"intro": "Den här guiden förklarar hur Clipop AI omvandlar långa videolänkar eller lokala långa videor till korta highlight-klipp med AI.",
           "keywords": "Mål-Keywords", "practical": "Praktiskt arbetsflöde", "faq": "Vanliga frågor",
           "cta": "Ange en lång video-URL eller ladda upp en lokal video och låt Clipop AI hitta de starkaste ögonblicken.",
           "originalTitle": "Original engelsk titel", "category": "AI-videoklippning", "titleSuffix": "：Guide för AI-highlight shorts"},
}

# Now generate blog-content.ts
lines = []
lines.append('// Auto-generated blog content for Clipop AI.')
lines.append('import { Locale, locales } from \'@/lib/i18n/index\';')
lines.append('')
lines.append('export interface BlogPost {')
lines.append('  id: string;')
lines.append('  title: string;')
lines.append('  category: string;')
lines.append('  content: string;')
lines.append('  cover_image: string | null;')
lines.append('  created_at: string;')
lines.append('  view_count?: number;')
lines.append('  is_published?: boolean;')
lines.append('  locale?: Locale;')
lines.append('  translation_group?: string;')
lines.append('}')
lines.append('')
lines.append('type BlogRow = Partial<BlogPost> & {')
lines.append('  coverImage?: string | null;')
lines.append('  cover_image?: string | null;')
lines.append('  viewCount?: number;')
lines.append('  view_count?: number;')
lines.append('  isPublished?: boolean;')
lines.append('  is_published?: boolean;')
lines.append('  createdAt?: string;')
lines.append('  created_at?: string;')
lines.append('  translationGroup?: string;')
lines.append('  translation_group?: string;')
lines.append('};')
lines.append('')
lines.append('type BlogArticleSeed = {')
lines.append('  slug: string;')
lines.append('  category: { en: string; zh: string; \'zh-Hant\': string };')
lines.append('  coverImageId: number;')
lines.append('  daysAgo: number;')
lines.append('  views: number;')
lines.append('  en: { title: string; content: string };')
lines.append('  zh: { title: string; content: string };')
lines.append('  \'zh-Hant\': { title: string; content: string };')
lines.append('};')
lines.append('')
lines.append('export const BLOG_STORAGE_KEY = \'clipop_blog_posts_v4\';')
lines.append('')

# ========== COVER IMAGE GENERATION ==========
lines.append('// ===================== COVER IMAGE GENERATION =====================')
lines.append('')
lines.append('const categoryImages: Record<string, number> = {')
lines.append('  \'ai-video-clipping\': 1,')
lines.append('  \'youtube-shorts\': 2,')
lines.append('  \'content-repurposing\': 3,')
lines.append('  \'local-video-upload\': 4,')
lines.append('  \'ai-technology\': 5,')
lines.append('  \'seo-strategy\': 6,')
lines.append('  \'podcast-clips\': 7,')
lines.append('  \'marketing-teams\': 8,')
lines.append('  \'comparison\': 9,')
lines.append('  \'best-practices\': 10,')
lines.append('  \'bilibili-workflow\': 11,')
lines.append('  \'tiktok\': 12,')
lines.append('  \'instagram-reels\': 13,')
lines.append('  \'douyin\': 14,')
lines.append('  \'xiaohongshu\': 15,')
lines.append('};')
lines.append('')
lines.append('function getCategoryKey(category: string): string {')
lines.append('  return category.toLowerCase().replace(/\\s+/g, \'-\').replace(/[^a-z0-9-]/g, \'\');')
lines.append('}')
lines.append('')
lines.append('function getCategoryImageId(category: string): number {')
lines.append('  const key = getCategoryKey(category);')
lines.append('  if (categoryImages[key]) return categoryImages[key];')
lines.append('  let hash = 0;')
lines.append('  for (let i = 0; i < category.length; i++) {')
lines.append('    hash = ((hash << 5) - hash) + category.charCodeAt(i);')
lines.append('    hash |= 0;')
lines.append('  }')
lines.append('  return Math.abs(hash) % 30 + 1;')
lines.append('}')
lines.append('')
lines.append('export function generateCoverImageUrl(')
lines.append('  _title: string,')
lines.append('  category: string,')
lines.append('  _variant: number = 1,')
lines.append('): string {')
lines.append('  const imageId = getCategoryImageId(category);')
lines.append('  return `https://picsum.photos/seed/clipop${imageId}/800/450`;')
lines.append('}')
lines.append('')
lines.append('export function getDefaultCoverImage(category: string): string {')
lines.append('  const imageId = getCategoryImageId(category);')
lines.append('  return `https://picsum.photos/seed/clipop${imageId}/800/450`;')
lines.append('}')
lines.append('')

# ========== TRANSLATIONS ==========
lines.append('// ===================== 32-LANGUAGE TRANSLATION TEMPLATES =====================')
lines.append('')
lines.append('type BlogLocaleCopy = {')
lines.append('  intro: string;')
lines.append('  keywords: string;')
lines.append('  practical: string;')
lines.append('  faq: string;')
lines.append('  cta: string;')
lines.append('  originalTitle: string;')
lines.append('  category: string;')
lines.append('  titleSuffix: string;')
lines.append('};')
lines.append('')
lines.append('const blogTranslations: Record<Locale, BlogLocaleCopy> = {')

# We need to write them in a valid TypeScript order matching the Locale union
locale_order = ['en','zh','zh-Hant','ja','ko','de','fr','it','es','pt','hi','ar','bn','id','ms','th','he','ru','ur','tr','vi','fa','mr','ta','pl','te','ne','da','fi','nl','no','sv']
for loc in locale_order:
    t = TRANSLATIONS[loc]
    lines.append(f'  {loc}: {{')
    lines.append(f'    intro: \"{t[\"intro\"]}\",')
    lines.append(f'    keywords: \"{t[\"keywords\"]}\",')
    lines.append(f'    practical: \"{t[\"practical\"]}\",')
    lines.append(f'    faq: \"{t[\"faq\"]}\",')
    lines.append(f'    cta: \"{t[\"cta\"]}\",')
    lines.append(f'    originalTitle: \"{t[\"originalTitle\"]}\",')
    lines.append(f'    category: \"{t[\"category\"]}\",')
    lines.append(f'    titleSuffix: \"{t[\"titleSuffix\"]}\",')
    lines.append('  },')
lines.append('};')
lines.append('')

OUTPUT.write_text("\n".join(lines), encoding="utf-8")
print(f"Part 1 written: {len(lines)} lines")
