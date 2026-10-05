import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLocaleTranslations, locales } from '../src/lib/i18n/index';

const requiredKeys = [
  'home.hero.badge',
  'home.hero.title',
  'home.hero.subtitle',
  'home.hero.startFree',
  'home.hero.freeCredits',
  'home.highlights.bilibili.title',
  'home.highlights.bilibili.desc',
  'home.highlights.local.title',
  'home.highlights.local.desc',
  'home.highlights.ai.title',
  'home.highlights.ai.desc',
  'home.highlights.shorts.title',
  'home.highlights.shorts.desc',
  'home.visual.title',
  'home.visual.subtitle',
  'home.visual.longVideo',
  'home.visual.source',
  'home.visual.scanning',
  'home.visual.clipsReady',
  'home.visual.engine',
  'home.visual.signals',
  'home.visual.exports',
  'home.faq.title',
  'home.faq.subtitle',
  'home.faq.q1',
  'home.faq.a1',
  'home.faq.q2',
  'home.faq.a2',
  'home.faq.q3',
  'home.faq.a3',
  'home.faq.q4',
  'home.faq.a4',
  'home.faq.q5',
  'home.faq.a5',
  'video.input.title',
  'video.creditsAvailable',
  'video.pasteUrlPlaceholder',
  'video.analyze',
  'video.useLocalAgent',
  'video.uploadLocal',
];

async function main() {
  for (const locale of locales) {
    const translations = await loadLocaleTranslations(locale);
    for (const key of requiredKeys) {
      const value = translations[key];
      assert.notEqual(value, key, `${locale} is missing ${key}`);
      assert.equal(typeof value, 'string', `${locale}.${key} must be a string`);
      assert.ok(value.trim().length > 0, `${locale}.${key} must not be empty`);
    }
  }

  const zh = await loadLocaleTranslations('zh');
  assert.equal(zh['home.hero.title'], '将长视频转换为爆款短视频');
  assert.equal(zh['home.hero.freeCredits'], '注册即可获得60积分（每天1次生成）');
  assert.match(zh['home.hero.subtitle'], /B站视频链接/);
  assert.equal(zh['home.highlights.bilibili.title'], '支持 B站和 YouTube 链接');
  assert.equal(zh['home.visual.scanning'], 'AI 正在扫描高光时刻');
  assert.equal(zh['home.faq.title'], '常见问题');
  assert.equal(zh['video.analyze'], '分析');

  const pageSource = readFileSync('src/app/page.tsx', 'utf8');
  const videoClipsPageSource = readFileSync('src/app/video-clips/page.tsx', 'utf8');
  const homeSectionsSource = readFileSync('src/components/home/home-sections.tsx', 'utf8');
  const homeStartButtonSource = readFileSync('src/components/home/home-start-button.tsx', 'utf8');
  // 首页只做营销落地（渲染 HomeLanding）；视频处理器已迁至 /video-clips，
  // 由首页输入/上传后跳转过去（见 HomeLanding 的 goProcess/handleFile）。
  assert.match(pageSource, /HomeLanding/);
  assert.match(videoClipsPageSource, /id="core-video-processor"/);
  assert.match(videoClipsPageSource, /ClientVideoProcessor/);
  assert.match(homeSectionsSource, /HomeStartButton/);
  assert.match(homeStartButtonSource, /useAuth/);
  assert.match(homeStartButtonSource, /scrollIntoView/);
  // P0-2 免登录试跑：首页 CTA 不再强制跳转注册，改为滚动到处理器试跑一条低清预览。
  assert.doesNotMatch(homeStartButtonSource, /router\.push\('\/register'\)/);

  console.log(`Home page i18n checks passed for ${locales.length} locales.`);
}

main();
