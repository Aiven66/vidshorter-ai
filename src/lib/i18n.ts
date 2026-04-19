export type Locale = 'en' | 'zh';

export const locales: Locale[] = ['en', 'zh'];
export const defaultLocale: Locale = 'en';

export const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.blog': 'Blog',
    'nav.pricing': 'Pricing',
    'nav.login': 'Login',
    'nav.register': 'Register',
    'nav.dashboard': 'Dashboard',
    'nav.admin': 'Admin Panel',
    'nav.logout': 'Logout',
    'nav.credits': 'Credits',
    
    // Home
    'home.hero.title': 'Transform Long Videos into Viral Shorts',
    'home.hero.subtitle': 'AI-powered video clipping that extracts the best moments from your long-form content automatically',
    'home.hero.cta': 'Start Clipping for Free',
    'home.hero.secondary': 'Watch Demo',
    
    // Features
    'features.title': 'Powerful AI Video Clipping',
    'features.auto.title': 'Auto Highlight Detection',
    'features.auto.desc': 'AI analyzes your video and identifies the most engaging moments automatically',
    'features.multi.title': 'Multi-Platform Support',
    'features.multi.desc': 'Import from YouTube, Bilibili, or upload your own video files',
    'features.quick.title': 'Quick Export',
    'features.quick.desc': 'Download your clips in multiple formats, ready for any social platform',
    
    // Video Processing
    'video.input.title': 'Input Video',
    'video.input.url': 'Video URL (YouTube/Bilibili)',
    'video.input.upload': 'Upload Video',
    'video.input.placeholder': 'Paste YouTube or Bilibili video link...',
    'video.process': 'Process Video',
    'video.processing': 'Processing...',
    'video.results': 'Generated Shorts',
    'video.highlights': 'Highlight Analysis',
    'video.download': 'Download',
    'video.preview': 'Preview',
    
    // Pricing
    'pricing.title': 'Simple, Transparent Pricing',
    'pricing.subtitle': 'Choose the plan that fits your needs',
    'pricing.free.title': 'Free',
    'pricing.free.price': '$0',
    'pricing.free.period': '/month',
    'pricing.free.desc': 'Perfect for trying out',
    'pricing.free.feature1': '300 credits daily',
    'pricing.free.feature2': 'Basic video clipping',
    'pricing.free.feature3': '720p export quality',
    'pricing.free.cta': 'Get Started',
    'pricing.basic.title': 'Basic',
    'pricing.basic.price': '$19',
    'pricing.basic.period': '/month',
    'pricing.basic.desc': 'For content creators',
    'pricing.basic.feature1': '1000 credits daily',
    'pricing.basic.feature2': 'Priority processing',
    'pricing.basic.feature3': '1080p export quality',
    'pricing.basic.feature4': 'No watermark',
    'pricing.basic.cta': 'Subscribe Now',
    'pricing.pro.title': 'Pro',
    'pricing.pro.price': '$49',
    'pricing.pro.period': '/month',
    'pricing.pro.desc': 'For professionals',
    'pricing.pro.feature1': 'Unlimited credits',
    'pricing.pro.feature2': 'Fastest processing',
    'pricing.pro.feature3': '4K export quality',
    'pricing.pro.feature4': 'API access',
    'pricing.pro.feature5': 'Priority support',
    'pricing.pro.cta': 'Subscribe Now',
    
    // Auth
    'auth.login.title': 'Welcome Back',
    'auth.login.subtitle': 'Sign in to your account',
    'auth.login.email': 'Email',
    'auth.login.password': 'Password',
    'auth.login.submit': 'Sign In',
    'auth.login.google': 'Continue with Google',
    'auth.login.noAccount': "Don't have an account?",
    'auth.login.register': 'Create one',
    'auth.register.title': 'Create Account',
    'auth.register.subtitle': 'Get started with VidShorter AI',
    'auth.register.name': 'Name',
    'auth.register.email': 'Email',
    'auth.register.password': 'Password',
    'auth.register.confirmPassword': 'Confirm Password',
    'auth.register.submit': 'Create Account',
    'auth.register.google': 'Continue with Google',
    'auth.register.hasAccount': 'Already have an account?',
    'auth.register.login': 'Sign in',
    
    // Dashboard
    'dashboard.title': 'Dashboard',
    'dashboard.credits': 'Available Credits',
    'dashboard.credits.reset': 'Resets daily at 8:00 AM',
    'dashboard.history': 'Processing History',
    'dashboard.noVideos': 'No videos processed yet',
    'dashboard.startProcessing': 'Start Processing Videos',
    
    // Admin
    'admin.title': 'Admin Panel',
    'admin.blog': 'Blog Management',
    'admin.blog.create': 'Create Post',
    'admin.blog.title': 'Title',
    'admin.blog.category': 'Category',
    'admin.blog.content': 'Content',
    'admin.blog.publish': 'Publish',
    'admin.blog.save': 'Save Draft',
    'admin.blog.published': 'Published',
    'admin.blog.draft': 'Draft',
    
    // Blog
    'blog.title': 'Blog',
    'blog.readMore': 'Read More',
    'blog.noPosts': 'No posts yet',
    
    // Common
    'common.loading': 'Loading...',
    'common.error': 'An error occurred',
    'common.success': 'Success',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.search': 'Search',
  },
  zh: {
    // Navigation
    'nav.home': '首页',
    'nav.blog': '博客',
    'nav.pricing': '定价',
    'nav.login': '登录',
    'nav.register': '注册',
    'nav.dashboard': '控制台',
    'nav.admin': '管理后台',
    'nav.logout': '退出登录',
    'nav.credits': '积分',
    
    // Home
    'home.hero.title': '将长视频自动转换为精彩短视频',
    'home.hero.subtitle': 'AI 智能分析视频亮点，自动剪辑生成爆款短视频',
    'home.hero.cta': '免费开始剪辑',
    'home.hero.secondary': '观看演示',
    
    // Features
    'features.title': '强大的 AI 视频剪辑功能',
    'features.auto.title': '自动亮点检测',
    'features.auto.desc': 'AI 自动分析视频，识别最精彩的片段',
    'features.multi.title': '多平台支持',
    'features.multi.desc': '支持 YouTube、B站链接或上传本地视频',
    'features.quick.title': '快速导出',
    'features.quick.desc': '多种格式导出，适配各大社交平台',
    
    // Video Processing
    'video.input.title': '输入视频',
    'video.input.url': '视频链接 (YouTube/B站)',
    'video.input.upload': '上传视频',
    'video.input.placeholder': '粘贴 YouTube 或 B站 视频链接...',
    'video.process': '处理视频',
    'video.processing': '处理中...',
    'video.results': '生成的短视频',
    'video.highlights': '亮点分析',
    'video.download': '下载',
    'video.preview': '预览',
    
    // Pricing
    'pricing.title': '简单透明的定价',
    'pricing.subtitle': '选择适合您的方案',
    'pricing.free.title': '免费版',
    'pricing.free.price': '$0',
    'pricing.free.period': '/月',
    'pricing.free.desc': '体验产品功能',
    'pricing.free.feature1': '每天 300 积分',
    'pricing.free.feature2': '基础视频剪辑',
    'pricing.free.feature3': '720p 导出质量',
    'pricing.free.cta': '开始使用',
    'pricing.basic.title': '基础版',
    'pricing.basic.price': '$19',
    'pricing.basic.period': '/月',
    'pricing.basic.desc': '适合内容创作者',
    'pricing.basic.feature1': '每天 1000 积分',
    'pricing.basic.feature2': '优先处理',
    'pricing.basic.feature3': '1080p 导出质量',
    'pricing.basic.feature4': '无水印',
    'pricing.basic.cta': '立即订阅',
    'pricing.pro.title': '专业版',
    'pricing.pro.price': '$49',
    'pricing.pro.period': '/月',
    'pricing.pro.desc': '适合专业用户',
    'pricing.pro.feature1': '无限积分',
    'pricing.pro.feature2': '最快处理速度',
    'pricing.pro.feature3': '4K 导出质量',
    'pricing.pro.feature4': 'API 接口',
    'pricing.pro.feature5': '优先支持',
    'pricing.pro.cta': '立即订阅',
    
    // Auth
    'auth.login.title': '欢迎回来',
    'auth.login.subtitle': '登录您的账户',
    'auth.login.email': '邮箱',
    'auth.login.password': '密码',
    'auth.login.submit': '登录',
    'auth.login.google': '使用 Google 登录',
    'auth.login.noAccount': '还没有账户？',
    'auth.login.register': '立即注册',
    'auth.register.title': '创建账户',
    'auth.register.subtitle': '开始使用 VidShorter AI',
    'auth.register.name': '姓名',
    'auth.register.email': '邮箱',
    'auth.register.password': '密码',
    'auth.register.confirmPassword': '确认密码',
    'auth.register.submit': '创建账户',
    'auth.register.google': '使用 Google 注册',
    'auth.register.hasAccount': '已有账户？',
    'auth.register.login': '立即登录',
    
    // Dashboard
    'dashboard.title': '控制台',
    'dashboard.credits': '可用积分',
    'dashboard.credits.reset': '每天上午 8 点重置',
    'dashboard.history': '处理历史',
    'dashboard.noVideos': '暂无处理记录',
    'dashboard.startProcessing': '开始处理视频',
    
    // Admin
    'admin.title': '管理后台',
    'admin.blog': '博客管理',
    'admin.blog.create': '发布文章',
    'admin.blog.title': '标题',
    'admin.blog.category': '分类',
    'admin.blog.content': '内容',
    'admin.blog.publish': '发布',
    'admin.blog.save': '保存草稿',
    'admin.blog.published': '已发布',
    'admin.blog.draft': '草稿',
    
    // Blog
    'blog.title': '博客',
    'blog.readMore': '阅读更多',
    'blog.noPosts': '暂无文章',
    
    // Common
    'common.loading': '加载中...',
    'common.error': '发生错误',
    'common.success': '成功',
    'common.cancel': '取消',
    'common.save': '保存',
    'common.delete': '删除',
    'common.edit': '编辑',
    'common.search': '搜索',
  },
};

export function getTranslation(locale: Locale, key: string): string {
  return translations[locale]?.[key] || translations['en']?.[key] || key;
}

export function useTranslation(locale: Locale) {
  return (key: string) => getTranslation(locale, key);
}
