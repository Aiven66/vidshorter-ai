import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'หน้าแรก', blog: 'บล็อก', pricing: 'ราคา', login: 'เข้าสู่ระบบ', register: 'สมัคร', dashboard: 'แดชบอร์ด', admin: 'แผงควบคุมผู้ดูแล', logout: 'ออกจากระบบ', credits: 'เครดิต', download: 'ดาวน์โหลดแอป', light: 'สว่าง', dark: 'มืด',
  },
  common: {
  error: 'เกิดข้อผิดพลาด', ready: 'พร้อม', failed: 'ล้มเหลว', saving: 'กำลังบันทึก...', score: 'คะแนน', user: 'ผู้ใช้',
  loading: 'กำลังโหลด...', success: 'สำเร็จ', cancel: 'ยกเลิก', save: 'บันทึก', delete: 'ลบ', edit: 'แก้ไข', search: 'ค้นหา',
  },
  footer: {
  desc: 'เปลี่ยนวิดีโอยาวของคุณให้เป็นคลิปสั้นที่น่าสนใจด้วยการวิเคราะห์และแก้ไขด้วย AI',
  quickLinks: 'ลิงก์ด่วน', legal: 'กฎหมาย', privacy: 'นโยบายความเป็นส่วนตัว', terms: 'ข้อกำหนดการใช้บริการ', contact: 'ติดต่อ', rights: 'สงวนลิขสิทธิ์',
  },
  home: {
  hero: {
  badge: 'การประมวลผลวิดีโอด้วย AI',
  title: 'แปลงวิดีโอยาวให้เป็นวิดีโอสั้นไวรัล',
  subtitle: 'การตัดวิดีโอด้วย AI ที่ดึงช่วงเวลาที่ดีที่สุดออกจากเนื้อหายาวของคุณโดยอัตโนมัติ',
  cta: 'เริ่มตัดฟรี',
  secondary: 'ดูสาธิต',
  },
  howItWorks: {
  title: 'วิธีการใช้งาน',
  step1: { title: 'ป้อนวิดีโอ', desc: 'วาง URL หรืออัปโหลดวิดีโอ' },
  step2: { title: 'วิเคราะห์ด้วย AI', desc: 'AI ตรวจจับไฮไลท์อัตโนมัติ' },
  step3: { title: 'สร้างคลิป', desc: 'สร้างวิดีโอสั้น' },
  step4: { title: 'ดาวน์โหลด', desc: 'ส่งออกและแชร์ได้ทุกที่' },
  },
  features: {
  title: 'การตัดวิดีโอด้วย AI ที่ทรงพลัง',
  auto: { title: 'ตรวจจับไฮไลท์อัตโนมัติ', desc: 'AI วิเคราะห์วิดีโอของคุณและระบุช่วงเวลาที่น่าดึงดูดที่สุดโดยอัตโนมัติ' },
  multi: { title: 'รองรับหลายแพลตฟอร์ม', desc: 'นำเข้าจาก YouTube, Bilibili หรืออัปโหลดไฟล์วิดีโอของคุณเอง' },
  quick: { title: 'ส่งออกเร็ว', desc: 'ดาวน์โหลดคลิปของคุณในหลายรูปแบบ พร้อมใช้งานสำหรับแพลตฟอร์มโซเชียลใดๆ' },
  },
  },
  video: {
  input: { title: 'วิดีโออินพุต', url: 'URL วิดีโอ (YouTube/Bilibili)', upload: 'อัปโหลดวิดีโอ', placeholder: 'วางลิงก์วิดีโอ YouTube หรือ Bilibili...' },
  process: 'ประมวลผลวิดีโอ', processing: 'กำลังประมวลผล...', analyze: 'วิเคราะห์', results: 'วิดีโอสั้นที่สร้างขึ้น', highlights: 'การวิเคราะห์ไฮไลท์', download: 'ดาวน์โหลด', preview: 'ดูตัวอย่าง',
  creditsAvailable: 'เครดิตที่มี', signInToStart: 'เพื่อเริ่มประมวลผลวิดีโอ', pasteUrlPlaceholder: 'วาง URL วิดีโอ (MP4, MOV, AVI...)', useLocalAgent: 'ใช้ Mac Agent ในเครื่อง (แนะนำสำหรับ YouTube ที่เสถียร)', uploadLocal: 'อัปโหลดไฟล์วิดีโอในเครื่อง (แนะนำเมื่อลิงก์ YouTube ถูกบล็อก)', selectedFile: 'ที่เลือก', downloadMacApp: 'ดาวน์โหลดแอป Mac', viewPricing: 'ดูราคา', clipsReady: 'คลิปพร้อม', playableClips: 'คลิปเล่นได้', failedClips: 'ล้มเหลว', aiFinished: 'AI ได้เลือกช่วงเวลาที่ดีที่สุดจากวิดีโอต้นฉบับของคุณเรียบร้อยแล้ว', openToPreview: 'เปิดคลิปที่พร้อมเพื่อดูตัวอย่าง หรือดาวน์โหลด MP4 โดยตรง', clipsBeingGenerated: 'กำลังสร้างคลิป:', videoPreviewNotAvailable: 'ไม่มีตัวอย่างวิดีโอ', clipMayStillProcessing: 'คลิปอาจยังคงประมวลผลอยู่หรือสร้างล้มเหลว', insufficientCredits: 'เครดิตไม่เพียงพอ คุณต้องมีอย่างน้อย 30 เครดิต', enterVideoUrl: 'กรุณาป้อน URL วิดีโอหรืออัปโหลดไฟล์วิดีโอในเครื่อง', enterValidUrl: 'กรุณาป้อน URL วิดีโอ http(s) สาธารณะที่ถูกต้อง',
  stage: {
  init: 'กำลังเริ่มต้น...', extractFrames: 'กำลังแยกเฟรมวิดีโอ...', framesExtracted: 'แยกเฟรมสำเร็จ', framesUnavailable: 'ดำเนินการวิเคราะห์ต่อ', aiAnalysis: 'AI กำลังวิเคราะห์เนื้อหาวิดีโอ...', analysisComplete: 'วิเคราะห์เสร็จสิ้น', generatingClip: 'กำลังสร้างคลิปไฮไลท์...', clipReady: 'คลิปไฮไลท์พร้อม', saving: 'กำลังบันทึกผลลัพธ์...', complete: 'ประมวลผลเสร็จสิ้น!', error: 'เกิดข้อผิดพลาด',
  },
  },
  pricing: {
  title: 'ราคาเรียบง่ายและโปร่งใส', subtitle: 'เลือกแผนที่เหมาะกับความต้องการของคุณ',
  paymentNote: 'Alipay สำหรับจีน · Creem สำหรับต่างประเทศ (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'การชำระเงินทั้งหมดปลอดภัยด้วยการเข้ารหัส TLS 256 บิต', faqTitle: 'คำถามที่พบบ่อย', faq: { q1: 'เครดิตคืออะไร?', a1: 'เครดิตแต่ละหน่วยแทนพลังการประมวลผล การประมวลผลคลิปวิดีโอหนึ่งคลิปใช้ 30 เครดิต', q2: 'การรีเซ็ตเครดิตรายวันทำงานอย่างไร?', a2: 'เครดิตจะรีเซ็ตเป็นขีดจำกัดรายวันตามแผนของคุณเวลา 00:00 UTC ทุกวัน เครดิตที่ไม่ได้ใช้จะไม่สะสม', q3: 'ฉันสามารถอัปเกรดหรือดาวน์เกรดแผนได้หรือไม่?', a3: 'ได้ คุณสามารถเปลี่ยนแผนได้ตลอดเวลา การเปลี่ยนแปลงมีผลทันที', q4: 'รองรับแหล่งวิดีโอใดบ้าง?', a4: 'รองรับ YouTube, Bilibili และอัปโหลดไฟล์วิดีโอโดยตรง (MP4, MOV, AVI)', q5: 'รองรับวิธีชำระเงินใดบ้าง?', a5: 'Alipay สำหรับผู้ใช้ในจีน, Creem (Visa, Mastercard, Apple Pay, Google Pay) สำหรับผู้ใช้ต่างประเทศ' },
  mostPopular: 'ยอดนิยม',
  free: { title: 'ฟรี', price: '$0', period: '/เดือน', desc: 'สมบูรณ์แบบสำหรับการทดลอง', feature1: '100 เครดิตต่อวัน', feature2: 'การตัดวิดีโอขั้นพื้นฐาน', feature3: 'คุณภาพส่งออก 720p', feature4: 'มีลายน้ำ', cta: 'เริ่มต้น' },
  starter: { title: 'เริ่มต้น', price: '$9.9', period: '/เดือน', desc: 'สำหรับผู้สร้างเนื้อหา', feature1: '500 เครดิตต่อวัน', feature2: 'ประมวลผลล่วงหน้า', feature3: 'คุณภาพส่งออก 1080p', feature4: 'ไม่มีลายน้ำ', feature5: 'การสนับสนุนทางอีเมล', cta: 'สมัครสมาชิกตอนนี้' },
  pro: { title: 'มืออาชีพ', price: '$19.9', period: '/เดือน', desc: 'สำหรับมืออาชีพและทีม', feature1: 'เครดิตไม่จำกัด', feature2: 'ประมวลผลเร็วที่สุด', feature3: 'คุณภาพส่งออก 4K', feature4: 'ไม่มีลายน้ำ', feature5: 'การเข้าถึง API', feature6: 'การสนับสนุนล่วงหน้า', cta: 'สมัครสมาชิกตอนนี้' },
  },
  downloadPage: {
  title: 'ดาวน์โหลด Clipop Agent', subtitle: 'แอปเดสก์ท็อปสำหรับประมวลผลวิดีโอ YouTube/Bilibili อย่างเสถียร', badge: 'แอปเดสก์ท็อป', macTitle: 'macOS', macDesc: 'สำหรับ Mac Apple Silicon (M1/M2/M3/M4)', downloadButton: 'ดาวน์โหลดสำหรับ macOS', version: 'เวอร์ชัน', fileSize: 'ขนาดไฟล์', requirements: 'macOS 12.0 ขึ้นไป', installing: 'คู่มือการติดตั้ง', step1: 'คลิกปุ่มดาวน์โหลดเพื่อบันทึกไฟล์ .dmg', step2: 'ดับเบิลคลิกไฟล์ .dmg ที่ดาวน์โหลด', step3: 'ลาก Clipop Agent ไปยังโฟลเดอร์ Applications', step4: 'เปิด Clipop Agent จาก Applications', notAvailable: 'กำลังเตรียมดาวน์โหลด กรุณาตรวจสอบอีกครั้งในภายหลัง', backToHome: 'กลับหน้าแรก', whyDesktopTitle: 'ทำไมต้องใช้แอปเดสก์ท็อป?', features: { stable: { title: 'ประมวลผลเสถียร', desc: 'ประมวลผลวิดีโอในเครื่องด้วยความเสถียรสูงสุด' }, fast: { title: 'ดาวน์โหลดเร็ว', desc: 'ดาวน์โหลดวิดีโอโดยตรงโดยไม่มีข้อจำกัดของเบราว์เซอร์' }, local: { title: 'ประมวลผลในเครื่อง', desc: 'ประมวลผลวิดีโอบน Mac ของคุณเพื่อความเป็นส่วนตัวและความเร็ว' } },
  },
  login: {
  title: 'เข้าสู่ระบบ', description: 'เข้าถึงบัญชีของคุณ', emailLabel: 'อีเมล', emailPlaceholder: 'you@example.com', passwordLabel: 'รหัสผ่าน', passwordPlaceholder: '••••••••', submitButton: 'เข้าสู่ระบบ', orContinueWith: 'หรือดำเนินการต่อด้วย', googleButton: 'ดำเนินการต่อด้วย Google', dontHaveAccount: 'ยังไม่มีบัญชี?', signUp: 'สมัคร',
  successTitle: 'เข้าสู่ระบบสำเร็จ!', successMessage: 'คุณได้เข้าสู่ระบบในฐานะ', successDesktopHint: 'คลิกปุ่มด้านล่างเพื่อกลับไปยังแอปเดสก์ท็อป', returnToDesktop: 'กลับไปยัง Clipop Agent', desktopNotOpened: 'หากแอปเดสก์ท็อปไม่เปิดอัตโนมัติ กรุณาตรวจสอบว่า Clipop Agent กำลังทำงานอยู่',
  },
  register: {
  title: 'สร้างบัญชี', description: 'เริ่มต้นด้วย Clipop AI', nameLabel: 'ชื่อเต็ม', namePlaceholder: 'John Doe', emailLabel: 'อีเมล', emailPlaceholder: 'you@example.com', passwordLabel: 'รหัสผ่าน', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'ยืนยันรหัสผ่าน', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'ดำเนินการต่อ', sendingCode: 'กำลังส่ง...', codeLabel: 'รหัสยืนยัน', codePlaceholder: 'กรอกรหัส 6 หลัก', verifyButton: 'สร้างบัญชี', codeNotReceived: 'ไม่ได้รับรหัส?', resendButton: 'ส่งอีกครั้ง', resendIn: 'ส่งอีกครั้งใน', backButton: 'ย้อนกลับ', googleButton: 'ดำเนินการต่อด้วย Google', alreadyHaveAccount: 'มีบัญชีแล้ว?', signIn: 'เข้าสู่ระบบ',
  errorNameRequired: 'กรุณากรอกชื่อของคุณ', errorEmailRequired: 'กรุณากรอกอีเมล', errorPasswordLength: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', errorPasswordMismatch: 'รหัสผ่านไม่ตรงกัน', errorEmailExists: 'อีเมลนี้ถูกลงทะเบียนแล้ว กรุณาเข้าสู่ระบบ', errorSendCode: 'ไม่สามารถส่งรหัสได้', errorNetwork: 'ข้อผิดพลาดของเครือข่าย กรุณาลองอีกครั้ง', errorCodeLength: 'กรุณากรอกรหัส 6 หลัก',
  successTitle: 'สร้างบัญชีสำเร็จ!', successMessage: 'บัญชีของคุณถูกสร้างในฐานะ', successDesktopHint: 'คลิกปุ่มด้านล่างเพื่อกลับไปยังแอปเดสก์ท็อป', returnToDesktop: 'กลับไปยัง Clipop Agent', desktopNotOpened: 'หากแอปเดสก์ท็อปไม่เปิดอัตโนมัติ กรุณาตรวจสอบว่า Clipop Agent กำลังทำงานอยู่',
  },
  dashboard: { title: 'แดชบอร์ด', credits: 'เครดิตที่มีอยู่', creditsReset: 'รีเซ็ตทุกวันเวลา 00:00 UTC', history: 'ประวัติการประมวลผล', noVideos: 'ยังไม่มีวิดีโอที่ประมวลผล', startProcessing: 'เริ่มประมวลผลวิดีโอ',
  untitled: 'ไม่มีชื่อ', clip: 'คลิป', clipsCount: 'ไฮไลท์', clipsHint: 'คลิกคลิปใดๆ เพื่อเล่น',
  desktopLoginDetected: 'ตรวจพบการเข้าสู่ระบบแอปเดสก์ท็อป', desktopLoginHint: 'คลิกปุ่มด้านล่างเพื่อกลับไปยัง Clipop Agent', returnToDesktop: 'กลับไปยัง Clipop Agent',
  welcomeBack: 'ยินดีต้อนรับกลับ',
  videosProcessed: 'วิดีโอที่ประมวลผลแล้ว', videosProcessedDesc: 'วิดีโอที่ประมวลผลทั้งหมด', clipsGenerated: 'คลิปที่สร้างแล้ว', clipsGeneratedDesc: 'คลิปไฮไลท์ทั้งหมด',
  currentPlan: 'แผนปัจจุบัน', upgradePlan: 'อัปเกรดแผน',
  processNewVideo: 'ประมวลผลวิดีโอใหม่', feedback: 'ข้อเสนอแนะ',
  historyHint: 'คลิกรายการที่เสร็จสิ้นเพื่อขยายและดูคลิปไฮไลท์',
  processNewVideoDesc: 'ไปที่หน้าแรกเพื่อประมวลผลวิดีโอยาวใหม่', goToProcessor: 'ไปยังตัวประมวลผลวิดีโอ',
  userFeedback: 'ข้อเสนอแนะจากผู้ใช้', feedbackDesc: 'บอกเราเกี่ยวกับฟีเจอร์ที่คุณต้องการปรับปรุงหรือปัญหาที่คุณพบ',
  feedbackPlaceholder: 'กรอกข้อเสนอแนะของคุณ (ข้อเสนอ, บั๊ก, คำขอฟีเจอร์ ฯลฯ)', feedbackSubmitted: 'ส่งเรียบร้อยแล้ว ขอบคุณสำหรับข้อเสนอแนะ!',
  submitFeedback: 'ส่งข้อเสนอแนะ', feedbackFailed: 'ไม่สามารถส่งข้อเสนอแนะได้',
  statusPending: 'รอดำเนินการ', statusProcessing: 'กำลังประมวลผล', statusCompleted: '✓ เสร็จสิ้น', statusFailed: 'ล้มเหลว',
  },
  admin: { title: 'แผงควบคุมผู้ดูแล', blog: 'การจัดการบล็อก', blogCreate: 'สร้างโพสต์', blogTitle: 'ชื่อเรื่อง', blogCategory: 'หมวดหมู่', blogContent: 'เนื้อหา', blogPublish: 'เผยแพร่', blogSave: 'บันทึกฉบับร่าง', blogPublished: 'เผยแพร่แล้ว', blogDraft: 'ฉบับร่าง' },
  blog: { title: 'บล็อก', readMore: 'อ่านต่อ', noPosts: 'ยังไม่มีโพสต์', subtitle: 'ข่าวสาร เคล็ดลับ และอัปเดตล่าสุดจาก Clipop AI', views: 'เข้าชม' },
};

export default translations;
