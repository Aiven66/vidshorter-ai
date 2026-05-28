import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'דף הבית', blog: 'בלוג', pricing: 'מחירים', login: 'התחברות', register: 'הרשמה', dashboard: 'לוח בקרה', admin: 'לוח ניהול', logout: 'התנתקות', credits: 'קרדיטים', download: 'הורד אפליקציה', light: 'בהיר', dark: 'כהה',
  },
  common: {
  error: 'אירעה שגיאה', ready: 'מוכן', failed: 'נכשל', saving: 'שומר...', score: 'ציון', user: 'משתמש',
  loading: 'טוען...', success: 'הצלחה', cancel: 'בטל', save: 'שמור', delete: 'מחק', edit: 'עריכה', search: 'חפש',
  },
  footer: {
  desc: 'הפוך את הסרטונים הארוכים שלך לקליפים קצרים מרתקים עם ניתוח ועריכה מונעי AI',
  quickLinks: 'קישורים מהירים', legal: 'משפטי', privacy: 'מדיניות פרטיות', terms: 'תנאי שימוש', contact: 'צור קשר', rights: 'כל הזכויות שמורות',
  },
  home: {
  hero: {
  badge: 'עיבוד וידאו מונע AI',
  title: 'הפוך סרטונים ארוכים לסירטונים קצרים וויראליים',
  subtitle: 'חיתוך וידאו מונע AI שמחלץ את הרגעים הטובים ביותר מהתוכן הארוך שלך באופן אוטומטי',
  cta: 'התחל חיתוך בחינם',
  secondary: 'צפה בהדגמה',
  },
  howItWorks: {
  title: 'איך זה עובד',
  step1: { title: 'קלט וידאו', desc: 'הדבק URL או העלה את הוידאו שלך' },
  step2: { title: 'ניתוח AI', desc: 'AI מזהה הדגשות אוטומטית' },
  step3: { title: 'צור קליפים', desc: 'סרטונים קצרים נוצרים' },
  step4: { title: 'הורדה', desc: 'ייצא ושתף בכל מקום' },
  },
  features: {
  title: 'חיתוך וידאו AI רב עוצמה',
  auto: { title: 'זיהוי הדגשות אוטומטי', desc: 'AI מנתח את הוידאו שלך ומזהה את הרגעים המרתקים ביותר באופן אוטומטי' },
  multi: { title: 'תמיכה בפלטפורמות מרובות', desc: 'ייבא מ-YouTube, Bilibili או העלה קבצי וידאו משלך' },
  quick: { title: 'ייצוא מהיר', desc: 'הורד את הקליפים שלך בפורמטים מרובים, מוכנים לכל פלטפורמה חברתית' },
  },
  },
  video: {
  input: { title: 'וידאו קלט', url: 'כתובת וידאו (YouTube/Bilibili)', upload: 'העלה וידאו', placeholder: 'הדבק קישור וידאו של YouTube או Bilibili...' },
  process: 'עבד וידאו', processing: 'מעבד...', analyze: 'נתח', results: 'סרטונים קצרים שנוצרו', highlights: 'ניתוח הדגשות', download: 'הורד', preview: 'תצוגה מקדימה',
  creditsAvailable: 'קרדיטים זמינים', signInToStart: 'כדי להתחיל לעבד וידאו', pasteUrlPlaceholder: 'הדבק כתובת וידאו (MP4, MOV, AVI...)', useLocalAgent: 'השתמש ב-Agent Mac מקומי (מומלץ ל-YouTube יציב)', uploadLocal: 'העלה קובץ וידאו מקומי (מומלץ כאשר קישור YouTube חסום)', selectedFile: 'נבחר', downloadMacApp: 'הורד אפליקציית Mac', viewPricing: 'צפה במחירים', clipsReady: 'קליפים מוכנים', playableClips: 'קליפים לניגון', failedClips: 'נכשלו', aiFinished: 'AI סיים לבחור את הרגעים החזקים ביותר מהוידאו המקורי שלך.', openToPreview: 'פתח קליפ מוכן כלשהו לתצוגה מקדימה, או הורד MP4 ישירות.', clipsBeingGenerated: 'קליפים בתהליך יצירה:', videoPreviewNotAvailable: 'תצוגה מקדימה של וידאו אינה זמינה', clipMayStillProcessing: 'הקליפ עדיין עשוי להיות בתהליך עיבוד או שהיצירה נכשלה.', insufficientCredits: 'אין מספיק קרדיטים. אתה צריך לפחות 30 קרדיטים.', enterVideoUrl: 'אנא הזן כתובת וידאו או העלה קובץ וידאו מקומי.', enterValidUrl: 'אנא הזן כתובת וידאו http(s) ציבורית חוקית.',
  stage: {
  init: 'מאתחל...', extractFrames: 'מחלץ פריימים מהוידאו...', framesExtracted: 'פריימים חולצו בהצלחה', framesUnavailable: 'ממשיך עם הניתוח', aiAnalysis: 'AI מנתח את תוכן הוידאו...', analysisComplete: 'הניתוח הושלם', generatingClip: 'יוצר קליפ הדגשה...', clipReady: 'קליפ הדגשה מוכן', saving: 'שומר תוצאות...', complete: 'העיבוד הושלם!', error: 'אירעה שגיאה',
  },
  },
  pricing: {
  title: 'מחירים פשוטים ושקופים', subtitle: 'בחר את התוכנית שמתאימה לצרכים שלך',
  paymentNote: 'Alipay לסין · Creem לבינלאומי (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'כל התשלומים מאובטחים בהצפנת TLS 256-ביט', faqTitle: 'שאלות נפוצות', faq: { q1: 'מה זה קרדיט?', a1: 'כל קרדיט מייצג כוח עיבוד. עיבוד קליפ וידאו עולה 30 קרדיטים.', q2: 'איך עובד איפוס הקרדיטים היומי?', a2: 'הקרדיטים מתאפסים למגבלה היומית של התוכנית שלך ב-00:00 UTC כל יום. קרדיטים שלא נוצלו אינם מועברים.', q3: 'האם אפשר לשדרג או להוריד את התוכנית?', a3: 'כן, אתה יכול לשנות את התוכנית שלך בכל עת. השינויים נכנסים לתוקף מיד.', q4: 'אילו מקורות וידאו נתמכים?', a4: 'אנו תומכים ב-YouTube, Bilibili והעלאת קבצי וידאו ישירות (MP4, MOV, AVI).', q5: 'אילו שיטות תשלום נתמכות?', a5: 'Alipay למשתמשים בסין, Creem (Visa, Mastercard, Apple Pay, Google Pay) למשתמשים בינלאומיים.' },
  mostPopular: 'הפופולרי ביותר',
  free: { title: 'חינם', price: '$0', period: '/חודש', desc: 'מושלם לניסיון', feature1: '100 קרדיטים יומיים', feature2: 'חיתוך וידאו בסיסי', feature3: 'איכות ייצוא 720p', feature4: 'סימן מים כלול', cta: 'התחל' },
  starter: { title: 'מתחיל', price: '$9.9', period: '/חודש', desc: 'ליוצרי תוכן', feature1: '500 קרדיטים יומיים', feature2: 'עיבוד עדיף', feature3: 'איכות ייצוא 1080p', feature4: 'ללא סימן מים', feature5: 'תמיכה בדוא"ל', cta: 'הירשם עכשיו' },
  pro: { title: 'פרופסיונלי', price: '$19.9', period: '/חודש', desc: 'לפרופסיונלים ולצוותים', feature1: 'קרדיטים בלתי מוגבלים', feature2: 'עיבוד מהיר ביותר', feature3: 'איכות ייצוא 4K', feature4: 'ללא סימן מים', feature5: 'גישה ל-API', feature6: 'תמיכה עדיף', cta: 'הירשם עכשיו' },
  },
  downloadPage: {
  title: 'הורד Clipop Agent', subtitle: 'אפליקציית שולחן עבודה לעיבוד וידאו YouTube/Bilibili יציב', badge: 'אפליקציית שולחן עבודה', macTitle: 'macOS', macDesc: 'עבור Mac Apple Silicon (M1/M2/M3/M4)', downloadButton: 'הורד עבור macOS', version: 'גרסה', fileSize: 'גודל קובץ', requirements: 'macOS 12.0 ואילך', installing: 'מדריך התקנה', step1: 'לחץ על כפתור ההורדה כדי לשמור את קובץ ה-.dmg', step2: 'לחץ לחיצה כפולה על קובץ ה-.dmg שהורד', step3: 'גרור את Clipop Agent לתיקיית האפליקציות', step4: 'פתח את Clipop Agent מהאפליקציות', notAvailable: 'ההורדה בהכנה, אנא בדוק שוב מאוחר יותר', backToHome: 'חזרה לדף הבית', whyDesktopTitle: 'למה להשתמש באפליקציית שולחן העבודה?', features: { stable: { title: 'עיבוד יציב', desc: 'עבד וידאו מקומית עם יציבות מקסימלית' }, fast: { title: 'הורדות מהירות', desc: 'הורד וידאו ישירות ללא מגבלות דפדפן' }, local: { title: 'עיבוד מקומי', desc: 'עבד וידאו ב-Mac שלך לפרטיות ומהירות' } },
  },
  login: {
  title: 'התחברות', description: 'גש לחשבון שלך', emailLabel: 'דוא"ל', emailPlaceholder: 'you@example.com', passwordLabel: 'סיסמא', passwordPlaceholder: '••••••••', submitButton: 'התחבר', orContinueWith: 'או המשך עם', googleButton: 'המשך עם Google', dontHaveAccount: 'אין לך חשבון?', signUp: 'הרשם',
  successTitle: 'התחברות הצליחה!', successMessage: 'התחברת בהצלחה כ-', successDesktopHint: 'לחץ על הכפתור למטה כדי לחזור לאפליקציית שולחן העבודה.', returnToDesktop: 'חזור ל-Clipop Agent', desktopNotOpened: 'אם אפליקציית שולחן העבודה לא נפתחת אוטומטית, אנא ודא ש-Clipop Agent פועל.',
  },
  register: {
  title: 'צור חשבון', description: 'התחל עם Clipop AI', nameLabel: 'שם מלא', namePlaceholder: 'John Doe', emailLabel: 'דוא"ל', emailPlaceholder: 'you@example.com', passwordLabel: 'סיסמא', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'אמת סיסמא', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'המשך', sendingCode: 'שולח...', codeLabel: 'קוד אימות', codePlaceholder: 'הזן קוד 6 ספרות', verifyButton: 'צור חשבון', codeNotReceived: 'לא קיבלת את הקוד?', resendButton: 'שלח שוב', resendIn: 'שלח שוב בעוד', backButton: 'חזור', googleButton: 'המשך עם Google', alreadyHaveAccount: 'כבר יש לך חשבון?', signIn: 'התחבר',
  errorNameRequired: 'אנא הזן את שמך', errorEmailRequired: 'אנא הזן את הדוא"ל שלך', errorPasswordLength: 'הסיסמא חייבת להכיל לפחות 6 תווים', errorPasswordMismatch: 'הסיסמאות אינן תואמות', errorEmailExists: 'דוא"ל זה כבר רשום. אנא התחבר במקום.', errorSendCode: 'שליחת הקוד נכשלה', errorNetwork: 'שגיאת רשת. אנא נסה שוב.', errorCodeLength: 'אנא הזן קוד בן 6 ספרות',
  successTitle: 'החשבון נוצר!', successMessage: 'החשבון שלך נוצר בהצלחה כ-', successDesktopHint: 'לחץ על הכפתור למטה כדי לחזור לאפליקציית שולחן העבודה.', returnToDesktop: 'חזור ל-Clipop Agent', desktopNotOpened: 'אם אפליקציית שולחן העבודה לא נפתחת אוטומטית, אנא ודא ש-Clipop Agent פועל.',
  },
  dashboard: { title: 'לוח בקרה', credits: 'קרדיטים זמינים', creditsReset: 'איפוס יומי בשעה 00:00 UTC', history: 'היסטוריית עיבוד', noVideos: 'עדיין לא עובדו וידאוים', startProcessing: 'התחל עיבוד וידאוים',
  untitled: 'ללא כותרת', clip: 'קליפ', clipsCount: 'הדגשות', clipsHint: 'לחץ על קליפ כלשהו לניגון',
  desktopLoginDetected: 'זוהתה התחברות מאפליקציית שולחן העבודה', desktopLoginHint: 'לחץ על הכפתור למטה כדי לחזור ל-Clipop Agent', returnToDesktop: 'חזור ל-Clipop Agent',
  welcomeBack: 'ברוך השב',
  videosProcessed: 'וידאוים מעובדים', videosProcessedDesc: 'סה"כ וידאוים מעובדים', clipsGenerated: 'קליפים שנוצרו', clipsGeneratedDesc: 'סה"כ קליפי הדגשה',
  currentPlan: 'תוכנית נוכחית', upgradePlan: 'שדרג תוכנית',
  processNewVideo: 'עבד וידאו חדש', feedback: 'משוב',
  historyHint: 'לחץ על רשומות שהושלמו כדי להרחיב ולצפות בקליפי הדגשה',
  processNewVideoDesc: 'עבור לדף הבית כדי לעבד וידאו ארוך חדש', goToProcessor: 'עבור למעבד הוידאו',
  userFeedback: 'משוב משתמשים', feedbackDesc: 'ספר לנו על תכונות שתרצה לשפר או בעיות שנתקלת בהן',
  feedbackPlaceholder: 'הזן את המשוב שלך (הצעות, באגים, בקשות תכונות וכו\')', feedbackSubmitted: 'נשלח, תודה על המשוב שלך!',
  submitFeedback: 'שלח משוב', feedbackFailed: 'שליחת המשוב נכשלה',
  statusPending: 'ממתין', statusProcessing: 'מעבד', statusCompleted: '✓ הושלם', statusFailed: 'נכשל',
  },
  admin: { title: 'לוח ניהול', blog: 'ניהול בלוג', blogCreate: 'צור פוסט', blogTitle: 'כותרת', blogCategory: 'קטגוריה', blogContent: 'תוכן', blogPublish: 'פרסם', blogSave: 'שמור טיוטה', blogPublished: 'פורסם', blogDraft: 'טיוטה' },
  blog: { title: 'בלוג', readMore: 'קרא עוד', noPosts: 'עדיין אין פוסטים', subtitle: 'חדשות אחרונות, טיפים ועדכונים מ-Clipop AI', views: 'צפיות' },
};

export default translations;
