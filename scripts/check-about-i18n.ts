import assert from 'node:assert/strict';
import { loadLocaleTranslations, locales } from '../src/lib/i18n/index';

const requiredKeys = [
  'nav.about',
  'about.hero.badge',
  'about.hero.title',
  'about.hero.subtitle',
  'about.hero.getStarted',
  'about.stats.activeUsers',
  'about.stats.videosProcessed',
  'about.stats.userSatisfaction',
  'about.stats.languages',
  'about.productVision.title',
  'about.productVision.subtitle',
  'about.productVision.futureTitle',
  'about.productVision.futurePara1',
  'about.productVision.futurePara2',
  'about.productVision.benefits.0',
  'about.productVision.benefits.1',
  'about.productVision.benefits.2',
  'about.productVision.benefits.3',
  'about.features.title',
  'about.features.subtitle',
  'about.features.aiIntelligence.title',
  'about.features.aiIntelligence.desc',
  'about.features.fastProcessing.title',
  'about.features.fastProcessing.desc',
  'about.features.multiPlatform.title',
  'about.features.multiPlatform.desc',
  'about.features.privacyFirst.title',
  'about.features.privacyFirst.desc',
  'about.values.title',
  'about.values.subtitle',
  'about.values.userCentric.title',
  'about.values.userCentric.desc',
  'about.values.continuous.title',
  'about.values.continuous.desc',
  'about.values.community.title',
  'about.values.community.desc',
  'about.geo.title',
  'about.geo.subtitle',
  'about.geo.seo.title',
  'about.geo.seo.desc',
  'about.geo.multiLang.title',
  'about.geo.multiLang.desc',
  'about.geo.regional.title',
  'about.geo.regional.desc',
  'about.cta.title',
  'about.cta.subtitle',
  'about.cta.button',
];

async function main() {
  assert.equal(locales.length, 32, 'platform should expose 32 locales');

  for (const locale of locales) {
    const translations = await loadLocaleTranslations(locale);
    for (const key of requiredKeys) {
      const value = translations[key];
      assert.notEqual(value, key, `${locale} is missing ${key}`);
      assert.equal(typeof value, 'string', `${locale}.${key} must be a string`);
      assert.ok(value.trim().length > 0, `${locale}.${key} must not be empty`);
    }
  }

  console.log(`About page i18n checks passed for ${locales.length} locales.`);
}

main();
