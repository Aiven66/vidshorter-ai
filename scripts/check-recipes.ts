/**
 * 配方（Recipe）单测（pnpm test:recipes）
 *
 * 只测纯逻辑：白名单归一化 / 名称归一化 / 列表解析与去重排序 / CRUD / 档位上限 / i18n 齐备。
 * 不碰网络、不碰 DB、不碰 localStorage（node 下无 window，正好验证存储适配的降级分支）。
 */

import assert from 'node:assert/strict';
import {
  DEFAULT_RECIPE_CONFIG,
  MAX_RECIPE_NAME,
  RECIPE_LIMIT_FREE,
  canAddRecipe,
  createRecipe,
  extractRecipeConfig,
  loadRecipes,
  normalizeRecipeName,
  parseRecipeList,
  recipeLimitForPlan,
  recipesStorageKey,
  removeRecipe,
  sanitizeRecipe,
  saveRecipes,
  serializeRecipeList,
  upsertRecipe,
  type Recipe,
  type RecipeConfig,
} from '../src/lib/recipes';
import { commonTranslations } from '../src/lib/i18n/common';
import zhTranslations from '../src/lib/i18n/locales/zh';

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const FULL_CONFIG: RecipeConfig = {
  quality: 'hd',
  exportVertical: true,
  exportSubtitles: false,
  exportJumpCut: true,
  exportVoiceover: true,
  voiceoverVoice: 'alloy',
  exportBgm: true,
  bgmMood: 'warm',
  bgmOrigVol: 42,
  exportKaraoke: true,
  subStyle: { size: 'large', position: 'top', outline: 'none', background: 'none', highlight: 'cyan' },
  subLang: 'zh',
  exportTemplate: 'vertical',
  scenario: 'talk',
  maxClips: 7,
  targetDuration: 45,
};

function recipe(id: string, updatedAt: number, name = id): Recipe {
  return { id, name, config: DEFAULT_RECIPE_CONFIG, createdAt: updatedAt, updatedAt };
}

console.log('\n[extractRecipeConfig]');

ok('合法配置原样保留', () => {
  assert.deepEqual(extractRecipeConfig(FULL_CONFIG), FULL_CONFIG);
});

ok('非对象输入 → 全默认', () => {
  for (const raw of [null, undefined, 42, 'x', []]) {
    assert.deepEqual(extractRecipeConfig(raw), DEFAULT_RECIPE_CONFIG);
  }
});

ok('非法枚举 / 越界数字回落默认，未知字段被丢弃', () => {
  const c = extractRecipeConfig({
    quality: 'ultra',
    bgmMood: 'loud',
    bgmOrigVol: 999,
    maxClips: -5,
    targetDuration: 99999,
    exportVertical: 'yes',
    somethingElse: 'nope',
  });
  assert.equal(c.quality, DEFAULT_RECIPE_CONFIG.quality);
  assert.equal(c.bgmMood, DEFAULT_RECIPE_CONFIG.bgmMood);
  assert.equal(c.bgmOrigVol, 100);
  assert.equal(c.maxClips, 0);
  assert.equal(c.targetDuration, 600);
  assert.equal(c.exportVertical, DEFAULT_RECIPE_CONFIG.exportVertical);
  assert.equal('somethingElse' in c, false);
});

ok('字幕样式逐字段校验，损坏字段各自回落', () => {
  const c = extractRecipeConfig({
    subStyle: { size: 'huge', position: 'top', outline: 'bold', background: 'x', highlight: 'blue' },
  });
  assert.equal(c.subStyle.size, DEFAULT_RECIPE_CONFIG.subStyle.size);
  assert.equal(c.subStyle.position, 'top'); // 合法保留
  assert.equal(c.subStyle.outline, 'bold');
  assert.equal(c.subStyle.background, DEFAULT_RECIPE_CONFIG.subStyle.background);
  assert.equal(c.subStyle.highlight, DEFAULT_RECIPE_CONFIG.subStyle.highlight);
});

ok('文本字段去首尾空白并截断', () => {
  const c = extractRecipeConfig({ voiceoverVoice: '  alloy  ', exportTemplate: 't'.repeat(100) });
  assert.equal(c.voiceoverVoice, 'alloy');
  assert.equal(c.exportTemplate.length, 40);
});

console.log('\n[normalizeRecipeName / sanitizeRecipe]');

ok('名称合并空白、去首尾、按上限截断', () => {
  assert.equal(normalizeRecipeName('  我的   配方  '), '我的 配方');
  assert.equal(normalizeRecipeName('x'.repeat(MAX_RECIPE_NAME + 20)).length, MAX_RECIPE_NAME);
  assert.equal(normalizeRecipeName(null), '');
  assert.equal(normalizeRecipeName('   '), '');
});

ok('id / name 缺失或非法 → null', () => {
  assert.equal(sanitizeRecipe(null), null);
  assert.equal(sanitizeRecipe({}), null);
  assert.equal(sanitizeRecipe({ id: 'a', name: '   ' }), null);
  assert.equal(sanitizeRecipe({ name: 'x', config: {} }), null);
});

ok('合法条目补全时间戳并归一化 config', () => {
  const r = sanitizeRecipe({ id: 'a', name: '  A ', config: { quality: 'hd' } });
  assert.ok(r);
  assert.equal(r!.id, 'a');
  assert.equal(r!.name, 'A');
  assert.equal(r!.config.quality, 'hd');
  assert.equal(r!.config.exportSubtitles, DEFAULT_RECIPE_CONFIG.exportSubtitles);
  assert.equal(typeof r!.createdAt, 'number');
  assert.equal(r!.updatedAt, r!.createdAt); // updatedAt 缺失回落 createdAt
});

console.log('\n[parseRecipeList]');

ok('JSON 字符串 / 原始数组都能解析；非法输入 → []', () => {
  const list = [recipe('a', 1), recipe('b', 2)];
  assert.deepEqual(parseRecipeList(serializeRecipeList(list)).map((r) => r.id), ['b', 'a']);
  assert.deepEqual(parseRecipeList(list).length, 2);
  for (const raw of ['', '   ', '{bad json', '{"a":1}', null, undefined, 42]) {
    assert.deepEqual(parseRecipeList(raw), []);
  }
});

ok('按 id 去重（保留首次）并按 updatedAt 降序', () => {
  const parsed = parseRecipeList([
    recipe('a', 100),
    recipe('b', 300),
    recipe('a', 500), // 重复 id：丢弃
    recipe('c', 200),
  ]);
  assert.deepEqual(parsed.map((r) => r.id), ['b', 'c', 'a']);
});

ok('列表中的坏条目被跳过而非整体失败', () => {
  const parsed = parseRecipeList([null, { id: 'ok', name: 'OK' }, 42, { id: '', name: 'x' }]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'ok');
});

console.log('\n[createRecipe / upsert / remove]');

ok('createRecipe 注入 id/时间，非法名回落 Recipe', () => {
  const r = createRecipe('  talking head ', { quality: 'hd' }, { id: 'fixed', now: 123 });
  assert.equal(r.id, 'fixed');
  assert.equal(r.createdAt, 123);
  assert.equal(r.updatedAt, 123);
  assert.equal(r.name, 'talking head');
  assert.equal(r.config.quality, 'hd');
  assert.equal(createRecipe('   ', {}, { now: 1 }).name, 'Recipe');
});

ok('upsert 覆盖同 id 并置顶，不改原数组', () => {
  const base = [recipe('a', 100), recipe('b', 200)];
  const updated: Recipe = { ...recipe('a', 300), name: 'A2' };
  const next = upsertRecipe(base, updated);
  assert.deepEqual(next.map((r) => r.id), ['a', 'b']);
  assert.equal(next[0].name, 'A2');
  assert.equal(base.length, 2); // 原数组未被修改
  assert.equal(base[0].name, 'a');

  const added = upsertRecipe(base, recipe('c', 400));
  assert.deepEqual(added.map((r) => r.id), ['c', 'b', 'a']);
});

ok('remove 按 id 删除且不命中时保持等价', () => {
  const base = [recipe('a', 1), recipe('b', 2)];
  assert.deepEqual(removeRecipe(base, 'a').map((r) => r.id), ['b']);
  assert.deepEqual(removeRecipe(base, 'zzz').map((r) => r.id), ['a', 'b']);
});

console.log('\n[档位上限]');

ok('免费档 1 条；Starter/Pro/admin 不限量', () => {
  assert.equal(RECIPE_LIMIT_FREE, 1);
  assert.equal(recipeLimitForPlan('free'), 1);
  assert.equal(recipeLimitForPlan('starter'), Infinity);
  assert.equal(recipeLimitForPlan('pro'), Infinity);
  assert.equal(recipeLimitForPlan('free', true), Infinity);
  assert.equal(recipeLimitForPlan(null), 1);
});

ok('canAddRecipe 边界（免费档 0 条可加、1 条不可加）', () => {
  assert.equal(canAddRecipe('free', 0), true);
  assert.equal(canAddRecipe('free', 1), false);
  assert.equal(canAddRecipe('free', 999), false);
  assert.equal(canAddRecipe('starter', 999), true);
  assert.equal(canAddRecipe('free', 1, true), true);
  assert.equal(canAddRecipe('free', -3), true); // 负数夹到 0
});

console.log('\n[存储适配]');

ok('storage key 按账号隔离', () => {
  assert.equal(recipesStorageKey('u1'), 'clipop_recipes:u1');
  assert.notEqual(recipesStorageKey('u1'), recipesStorageKey('u2'));
});

ok('node（无 window）下 load 返回 [] / save 返回 false，绝不抛错', () => {
  assert.deepEqual(loadRecipes('u1'), []);
  assert.deepEqual(loadRecipes(null), []);
  assert.equal(saveRecipes('u1', [recipe('a', 1)]), false);
  assert.equal(saveRecipes(null, []), false);
});

console.log('\n[i18n · video.recipe.*]');

function pick(tree: Record<string, unknown>, path: string): unknown {
  let cur: unknown = tree;
  for (const seg of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

const RECIPE_I18N_KEYS = [
  'video.recipe.label',
  'video.recipe.hint',
  'video.recipe.saveTitle',
  'video.recipe.namePlaceholder',
  'video.recipe.save',
  'video.recipe.cancel',
  'video.recipe.apply',
  'video.recipe.appliedShort',
  'video.recipe.delete',
  'video.recipe.empty',
  'video.recipe.nameRequired',
  'video.recipe.storageFailed',
  'video.recipe.loginTitle',
  'video.recipe.loginDesc',
  'video.recipe.loginCta',
  'video.recipe.limitTitle',
  'video.recipe.limitDesc',
  'video.recipe.upgradeCta',
];

ok('en/zh 关键 key 齐备，且 zh 已本地化', () => {
  const en = commonTranslations as unknown as Record<string, unknown>;
  const zh = zhTranslations as unknown as Record<string, unknown>;
  for (const key of RECIPE_I18N_KEYS) {
    assert.equal(typeof pick(en, key), 'string', `en missing: ${key}`);
    assert.equal(typeof pick(zh, key), 'string', `zh missing: ${key}`);
  }
  const zhLabel = pick(zh, 'video.recipe.label');
  assert.ok(typeof zhLabel === 'string' && /[\u4e00-\u9fa5]/.test(zhLabel), 'zh recipe not localized');
});

console.log(`\n全部通过：${passed} 项\n`);
