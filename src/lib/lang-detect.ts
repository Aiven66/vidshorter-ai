/**
 * 简单的语言检测工具
 * 通过 Unicode 范围和字符模式检测文本语言
 * 不依赖外部 API，纯客户端/服务端可用
 */

/**
 * 检测文本的主要语言
 * 返回 i18n locale 代码
 */
export function detectLanguage(text: string): string {
  if (!text || !text.trim()) return 'en';

  const sample = text.trim();

  // 中文字符 (CJK Unified Ideographs)
  const chineseRegex = /[\u4e00-\u9fff]/g;
  // 日文假名 (Hiragana + Katakana)
  const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/g;
  // 韩文字符 (Hangul)
  const koreanRegex = /[\uac00-\ud7af\u1100-\u11ff]/g;
  // 阿拉伯文
  const arabicRegex = /[\u0600-\u06ff]/g;
  // 希伯来文
  const hebrewRegex = /[\u0590-\u05ff]/g;
  // 泰文
  const thaiRegex = /[\u0e00-\u0e7f]/g;
  // 印地文 (Devanagari)
  const devanagariRegex = /[\u0900-\u097f]/g;
  // 俄文 (Cyrillic)
  const cyrillicRegex = /[\u0400-\u04ff]/g;
  // 孟加拉文
  const bengaliRegex = /[\u0980-\u09ff]/g;
  // 乌尔都文 (Arabic script, but specific patterns)
  // 泰米尔文
  const tamilRegex = /[\u0b80-\u0bff]/g;
  // 泰卢固文
  const teluguRegex = /[\u0c00-\u0c7f]/g;
  // 波斯文 (Arabic script extended)
  // 马拉地文 (Devanagari)
  // 尼泊尔文 (Devanagari)
  // 越南文 (Latin with diacritics)
  const vietnameseRegex = /[\u00c0-\u00ff\u0100-\u017f]|đ|Đ/ig;

  // 统计各语言字符数量
  const counts: Record<string, number> = {
    zh: (sample.match(chineseRegex) || []).length,
    ja: (sample.match(japaneseRegex) || []).length,
    ko: (sample.match(koreanRegex) || []).length,
    ar: (sample.match(arabicRegex) || []).length,
    he: (sample.match(hebrewRegex) || []).length,
    th: (sample.match(thaiRegex) || []).length,
    hi: (sample.match(devanagariRegex) || []).length,
    ru: (sample.match(cyrillicRegex) || []).length,
    bn: (sample.match(bengaliRegex) || []).length,
    ta: (sample.match(tamilRegex) || []).length,
    te: (sample.match(teluguRegex) || []).length,
  };

  // 找出字符数最多的语言
  let maxLang = 'en';
  let maxCount = 0;

  for (const [lang, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxLang = lang;
    }
  }

  // 如果没有检测到非英文字符，返回英文
  if (maxCount === 0) {
    // 检查越南文（使用拉丁字母但有特殊变音符号）
    if (vietnameseRegex.test(sample)) return 'vi';

    // 检查一些拉丁字母语言的特征词
    // 这些语言使用拉丁字母，但有一些特征词
    const lowerSample = sample.toLowerCase();

    // 德语特征
    if (/\b(der|die|das|und|ist|ein|eine|für|mit|auf|aus|bei|noch|auch|wird|können|sollte)\b/i.test(lowerSample)) return 'de';
    // 法语特征
    if (/\b(le|la|les|de|des|du|et|est|un|une|pour|dans|avec|sur|pas|que|qui|comment)\b/i.test(lowerSample)) return 'fr';
    // 西班牙语特征
    if (/\b(el|la|los|las|de|en|y|que|por|con|para|una|como|pero|más|este|esta|del)\b/i.test(lowerSample)) return 'es';
    // 葡萄牙语特征
    if (/\b(o|a|os|as|de|em|e|que|um|uma|para|com|não|por|mais|como|mas|dos|das)\b/i.test(lowerSample)) return 'pt';
    // 意大利语特征
    if (/\b(il|la|le|lo|gli|di|e|in|che|per|un|una|con|non|più|anche|questo|questa)\b/i.test(lowerSample)) return 'it';
    // 荷兰语特征
    if (/\b(de|het|een|van|en|in|is|dat|op|te|zijn|niet|met|ook|voor|maar|hun)\b/i.test(lowerSample)) return 'nl';
    // 丹麦语特征
    if (/\b(det|den|de|og|er|en|et|at|til|med|på|af|har|som|kan|ikke|vil)\b/i.test(lowerSample)) return 'da';
    // 挪威语特征
    if (/\b(det|den|de|og|er|en|et|å|til|med|på|av|har|som|kan|ikke|vil|skal)\b/i.test(lowerSample)) return 'no';
    // 瑞典语特征
    if (/\b(det|den|de|och|är|en|ett|att|till|med|på|av|har|som|kan|inte|ska|eller)\b/i.test(lowerSample)) return 'sv';
    // 印尼语/马来语特征
    if (/\b(yang|dan|di|ke|dari|ini|itu|dengan|untuk|tidak|akan|pada|adalah|seperti|juga|bisa)\b/i.test(lowerSample)) return 'id';
    // 土耳其语特征
    if (/\b(ve|bir|bu|da|için|ile|ne|olarak|gibi|daha|her|en|çok|yeni|ancak|aynı)\b/i.test(lowerSample)) return 'tr';
    // 波兰语特征
    if (/\b(i|w|na|z|do|się|nie|że|to|jest|od|po|za|przez|tak|ale|czy)\b/i.test(lowerSample)) return 'pl';
    // 芬兰语特征
    if (/\b(ja|on|ei|oli|se|ne|tämä|joka|hän|että|mutta|myös|kuin|niin|vain|voida)\b/i.test(lowerSample)) return 'fi';

    return 'en';
  }

  // 区分简体中文和繁体中文
  if (maxLang === 'zh') {
    const traditionalRegex = /[\u3400-\u4dbf\uf900-\ufaff]|國|說|學|開|電|網|點|書|車|長|門|問|時|東|買|賣|過|還|裡|學|對|話|機|經|動|現|關|將|區|華|總|請|產|單|種|場|樂|壓|選|據|結|構|應|認|質|運|爭|歷|養|據|擔|據|據/i;
    if (traditionalRegex.test(sample)) return 'zh-Hant';
    return 'zh';
  }

  return maxLang;
}

/**
 * 判断文章是否匹配指定语言
 * @param title 文章标题
 * @param locale 目标语言
 */
export function isArticleInLanguage(title: string, locale: string): boolean {
  const detectedLang = detectLanguage(title);
  return detectedLang === locale;
}

/**
 * 获取语言的友好名称
 */
export function getLanguageName(locale: string): string {
  const names: Record<string, string> = {
    en: 'English',
    zh: '中文',
    'zh-Hant': '繁體中文',
    ja: '日本語',
    ko: '한국어',
    de: 'Deutsch',
    fr: 'Français',
    it: 'Italiano',
    es: 'Español',
    pt: 'Português',
    hi: 'हिन्दी',
    ar: 'العربية',
    bn: 'বাংলা',
    id: 'Bahasa Indonesia',
    ms: 'Bahasa Melayu',
    th: 'ไทย',
    he: 'עברית',
    ru: 'Русский',
    ur: 'اردو',
    tr: 'Türkçe',
    vi: 'Tiếng Việt',
    fa: 'فارسی',
    mr: 'मराठी',
    ta: 'தமிழ்',
    pl: 'Polski',
    te: 'తెలుగు',
    ne: 'नेपाली',
    da: 'Dansk',
    fi: 'Suomi',
    nl: 'Nederlands',
    no: 'Norsk',
    sv: 'Svenska',
  };
  return names[locale] || locale;
}
