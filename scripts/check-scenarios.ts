/**
 * 场景化预置验证脚本
 * 1. scenarios.ts 数据模块不变式（4 场景、id 唯一、参数白名单、normalize 归一化）
 * 2. i18n 完整性（en 必须全量，zh 必须全量翻译）
 *
 * 运行: node --import tsx scripts/check-scenarios.ts
 */
import assert from 'node:assert/strict';
import { loadLocaleTranslations } from '../src/lib/i18n/index';
import {
  SCENARIOS,
  SCENARIO_IDS,
  normalizeScenario,
} from '../src/lib/scenarios';

const BGMMOODS = ['calm', 'energetic', 'warm'] as const;
const ALLOWED_DURATIONS = [0, 15, 30, 60];
const ALLOWED_CLIPS = [0, 3, 5, 10];

function checkData() {
  assert.equal(SCENARIOS.length, 4, 'must define exactly 4 scenarios');
  assert.equal(new Set(SCENARIO_IDS).size, 4, 'scenario ids must be unique');

  for (const s of SCENARIOS) {
    assert.ok(SCENARIO_IDS.includes(s.id), `unknown id ${s.id}`);
    assert.ok(ALLOWED_DURATIONS.includes(s.targetDuration), `${s.id}: bad targetDuration ${s.targetDuration}`);
    assert.ok(ALLOWED_CLIPS.includes(s.maxClips), `${s.id}: bad maxClips ${s.maxClips}`);
    assert.ok(BGMMOODS.includes(s.bgmMood), `${s.id}: bad bgmMood ${s.bgmMood}`);
    assert.equal(typeof s.template, 'string', `${s.id}: template must be string`);
    assert.equal(typeof s.voice, 'string', `${s.id}: voice must be string`);
    assert.equal(typeof s.voiceover, 'boolean', `${s.id}: voiceover must be boolean`);
    assert.equal(typeof s.bgm, 'boolean', `${s.id}: bgm must be boolean`);
    assert.equal(typeof s.subtitles, 'boolean', `${s.id}: subtitles must be boolean`);
    assert.equal(typeof s.vertical, 'boolean', `${s.id}: vertical must be boolean`);
  }

  // normalize：合法 id → 原对象；非法/未知 → null
  for (const s of SCENARIOS) {
    assert.equal(normalizeScenario(s.id), s, `normalize(${s.id}) must return the preset`);
  }
  assert.equal(normalizeScenario('talk'), SCENARIOS[0]);
  assert.equal(normalizeScenario(undefined), null);
  assert.equal(normalizeScenario(null), null);
  assert.equal(normalizeScenario(''), null);
  assert.equal(normalizeScenario('  talk  '), SCENARIOS[0], 'must trim whitespace');
  assert.equal(normalizeScenario('unknown-scenario'), null);
  assert.equal(normalizeScenario(42), null);
  console.log('✓ scenarios data invariants (4 presets + normalize)');
}

async function checkI18n() {
  const REQUIRED = [
    'video.scenario.label',
    'video.scenario.none',
    'video.scenario.talk.label',
    'video.scenario.talk.hint',
    'video.scenario.explainer.label',
    'video.scenario.explainer.hint',
    'video.scenario.vlog.label',
    'video.scenario.vlog.hint',
    'video.scenario.clean.label',
    'video.scenario.clean.hint',
  ];
  for (const locale of ['en', 'zh'] as const) {
    const translations = await loadLocaleTranslations(locale);
    for (const key of REQUIRED) {
      const value = translations[key];
      assert.notEqual(value, key, `${locale} is missing ${key}`);
      assert.equal(typeof value, 'string', `${locale}.${key} must be a string`);
      assert.ok(value.trim().length > 0, `${locale}.${key} must not be empty`);
    }
  }
  const zh = await loadLocaleTranslations('zh');
  assert.equal(zh['video.scenario.label'], '快捷预设');
  assert.ok((zh['video.scenario.talk.label'] as string).includes('口播'));
  console.log('✓ i18n keys complete (en + zh)');
}

async function main() {
  checkData();
  await checkI18n();
  console.log('\nAll scenario preset checks passed ✓');
}

main().catch((error) => {
  console.error('\nScenario preset check FAILED:', error.message);
  process.exit(1);
});
