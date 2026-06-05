import assert from 'node:assert/strict';
import { loadLocaleTranslations, locales } from '../src/lib/i18n/index';

const requiredKeys = [
  'home.hero.badge',
  'home.hero.title',
  'home.hero.subtitle',
  'home.visual.longVideo',
  'home.visual.source',
  'home.visual.scanning',
  'home.visual.clipsReady',
  'home.visual.engine',
  'home.visual.signals',
  'home.visual.exports',
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
  assert.equal(zh['home.visual.scanning'], 'AI 正在扫描高光时刻');
  assert.equal(zh['video.analyze'], '分析');

  console.log(`Home page i18n checks passed for ${locales.length} locales.`);
}

main();
