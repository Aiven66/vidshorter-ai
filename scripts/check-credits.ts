/**
 * 月度积分重构单测（pnpm test:credits）
 *
 * 只测纯逻辑：额度真源 / 周期边界 / 跨周期判定 / 存量订阅判定。
 * 另含一条文案一致性守卫：任何 locale 的定价文案都不得再出现「无限额度」或旧的 500/日。
 * 不碰网络、不碰 DB。
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CREDIT_COST,
  FREE_DAILY_CREDITS,
  LEGACY_DAILY_SUNSET_ISO,
  PLAN_MONTHLY_CREDITS,
  hasQuotaCrossed,
  isLegacyPaidRow,
  isPaidPlan,
  planQuota,
  quotaResetDescription,
  quotaTransactionType,
  resetBoundary,
  subscriptionPeriodEnd,
} from '../src/lib/plan-credits';

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const utc = (s: string) => new Date(s);

console.log('\n[额度真源]');

ok('单条片子成本 = 60，免费档 = 60/日', () => {
  assert.equal(CREDIT_COST, 60);
  assert.equal(FREE_DAILY_CREDITS, 60);
});

ok('付费档月度额度 = Starter 6,000 / Pro 20,000', () => {
  assert.equal(PLAN_MONTHLY_CREDITS.starter, 6000);
  assert.equal(PLAN_MONTHLY_CREDITS.pro, 20000);
});

console.log('\n[planQuota]');

ok('免费档：60/日、非存量', () => {
  for (const plan of [null, undefined, 'free', '', 'enterprise']) {
    assert.deepEqual(planQuota(plan), { amount: 60, period: 'day', legacy: false });
  }
});

ok('付费档：月度额度、非存量', () => {
  assert.deepEqual(planQuota('starter'), { amount: 6000, period: 'month', legacy: false });
  assert.deepEqual(planQuota('pro'), { amount: 20000, period: 'month', legacy: false });
});

ok('存量付费：沿用旧的日额度且标记 legacy', () => {
  assert.deepEqual(planQuota('starter', { legacyPaid: true }), { amount: 500, period: 'day', legacy: true });
  assert.deepEqual(planQuota('pro', { legacyPaid: true }), { amount: 1_000_000, period: 'day', legacy: true });
});

ok('legacyPaid 对免费档无效（不会误发付费额度）', () => {
  assert.deepEqual(planQuota('free', { legacyPaid: true }), { amount: 60, period: 'day', legacy: false });
});

console.log('\n[isPaidPlan / isLegacyPaidRow]');

ok('isPaidPlan 只认 starter / pro', () => {
  assert.equal(isPaidPlan('starter'), true);
  assert.equal(isPaidPlan('pro'), true);
  assert.equal(isPaidPlan('free'), false);
  assert.equal(isPaidPlan(null), false);
  assert.equal(isPaidPlan('Pro'), false);
});

ok('免费档永远不是存量付费', () => {
  assert.equal(isLegacyPaidRow('free', null, utc('2026-09-01T00:00:00Z')), false);
});

ok('写了 current_period_end 的付费行 = 新版月度订阅，非存量', () => {
  assert.equal(
    isLegacyPaidRow('pro', '2026-10-13T00:00:00.000Z', utc('2026-09-20T00:00:00Z')),
    false,
  );
});

ok('未写 current_period_end 且在 sunset 之前 = 存量', () => {
  assert.equal(isLegacyPaidRow('starter', null, utc('2026-09-25T00:00:00Z')), true);
});

ok('sunset 之后即使没有 period_end 也不再按存量处理', () => {
  assert.equal(isLegacyPaidRow('starter', null, utc('2026-11-01T00:00:00Z')), false);
  assert.equal(LEGACY_DAILY_SUNSET_ISO, '2026-10-26T00:00:00.000Z');
});

console.log('\n[resetBoundary]');

ok('日界 = UTC 当日 00:00', () => {
  assert.equal(resetBoundary('day', utc('2026-09-25T17:43:00Z')), '2026-09-25T00:00:00.000Z');
});

ok('月界 = UTC 当月 1 日 00:00', () => {
  assert.equal(resetBoundary('month', utc('2026-09-25T17:43:00Z')), '2026-09-01T00:00:00.000Z');
});

console.log('\n[hasQuotaCrossed]');

ok('从未重置过 → 需要重置', () => {
  assert.equal(hasQuotaCrossed('day', null), true);
  assert.equal(hasQuotaCrossed('month', undefined), true);
  assert.equal(hasQuotaCrossed('day', 'not-a-date'), true);
});

ok('同一 UTC 日 → 日额度不重置', () => {
  assert.equal(
    hasQuotaCrossed('day', '2026-09-25T00:00:00.000Z', utc('2026-09-25T23:59:59Z')),
    false,
  );
});

ok('跨 UTC 日 → 日额度重置', () => {
  assert.equal(
    hasQuotaCrossed('day', '2026-09-24T00:00:00.000Z', utc('2026-09-25T00:00:00Z')),
    true,
  );
});

ok('同月不同日 → 月额度不重置', () => {
  assert.equal(
    hasQuotaCrossed('month', '2026-09-01T00:00:00.000Z', utc('2026-09-25T12:00:00Z')),
    false,
  );
});

ok('跨月 / 跨年 → 月额度重置', () => {
  assert.equal(
    hasQuotaCrossed('month', '2026-09-01T00:00:00.000Z', utc('2026-10-01T00:00:00Z')),
    true,
  );
  assert.equal(
    hasQuotaCrossed('month', '2025-12-01T00:00:00.000Z', utc('2026-01-01T00:00:00Z')),
    true,
  );
});

console.log('\n[流水类型与说明]');

ok('周期映射到不同的 transaction type', () => {
  assert.equal(quotaTransactionType('day'), 'daily_reset');
  assert.equal(quotaTransactionType('month'), 'monthly_reset');
});

ok('说明明文写清周期 / 方案 / 额度（不静默）', () => {
  assert.equal(
    quotaResetDescription('starter', planQuota('starter')),
    'Monthly credits reset (starter: 6000)',
  );
  assert.equal(
    quotaResetDescription('free', planQuota('free'), true),
    'Daily credits reset (free: 60) — new user',
  );
});

ok('存量订阅的说明显式标注 legacy', () => {
  assert.equal(
    quotaResetDescription('pro', planQuota('pro', { legacyPaid: true })),
    'Daily credits reset (pro: 1000000) — legacy daily quota',
  );
});

console.log('\n[subscriptionPeriodEnd]');

ok('订阅周期终点 = now + 1 个月', () => {
  assert.equal(subscriptionPeriodEnd(utc('2026-09-13T00:00:00.000Z')), '2026-10-13T00:00:00.000Z');
});

console.log('\n[定价文案一致性守卫]');

const LOCALE_DIR = join(process.cwd(), 'src/lib/i18n/locales');
const UNLIMITED_WORDS =
  /unlimited|无限|無限|無制限|무제한|نامحدود|অসীম|ubegrænset|unbegrenzt|ilimitad|illimit|rajoittamat|בלתי מוגבל|असीमित|अमर्यादित|terbatas|tanpa had|onbeperk|nieogranic|неогранич|obegräns|வரையறுக்கப்படாத|అపరిమిత|ไม่จำกัด|sınırsız|لامحدود|giới hạn/i;

function field(source: string, block: string, key: string): string | null {
  const m = source.match(new RegExp(`${block}:\\s*\\{[^}]*?${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
  return m ? m[1] : null;
}

/** pricing.faq 的取值（home.faq 也含 q2/a2，必须锚在 pricing 块内；a2 可能用双引号）。 */
function pricingFaqA2(source: string): string | null {
  const single = source.match(/pricing:\s*\{[\s\S]*?faq:\s*\{[^}]*?a2:\s*'((?:[^'\\]|\\.)*)'/);
  if (single) return single[1];
  const double = source.match(/pricing:\s*\{[\s\S]*?faq:\s*\{[^}]*?a2:\s*"((?:[^"\\]|\\.)*)"/);
  return double ? double[1] : null;
}

const localeFiles = readdirSync(LOCALE_DIR).filter((f) => f.endsWith('.ts'));
assert.ok(localeFiles.length >= 30, `expected >=30 locale files, got ${localeFiles.length}`);

ok('每个 locale 的 pro 额度都已改成真实数字（无「无限」）', () => {
  for (const file of localeFiles) {
    const src = readFileSync(join(LOCALE_DIR, file), 'utf8');
    const pro = field(src, 'pro', 'feature1');
    if (pro === null) continue; // en.ts 无覆盖，回退英文基线
    assert.ok(!UNLIMITED_WORDS.test(pro), `${file}: pro.feature1 仍为无限 — ${pro}`);
    assert.ok(/\d/.test(pro), `${file}: pro.feature1 缺少数字 — ${pro}`);
  }
});

ok('每个 locale 的 starter 额度都不再是 500/日', () => {
  for (const file of localeFiles) {
    const src = readFileSync(join(LOCALE_DIR, file), 'utf8');
    const starter = field(src, 'starter', 'feature1');
    if (starter === null) continue;
    assert.ok(!/(^|\D)500(\D|$)/.test(starter), `${file}: starter.feature1 仍是旧值 — ${starter}`);
    assert.ok(/\d/.test(starter), `${file}: starter.feature1 缺少数字 — ${starter}`);
  }
});

ok('每个 locale 的免费档都写着 60/日（不是旧的 100）', () => {
  for (const file of localeFiles) {
    const src = readFileSync(join(LOCALE_DIR, file), 'utf8');
    const free = field(src, 'free', 'feature1');
    if (free === null) continue;
    assert.ok(!/(^|\D)100(\D|$)/.test(free), `${file}: free.feature1 仍是旧值 — ${free}`);
  }
});

ok('每个 locale 的 FAQ 答案都写明 6,000 / 20,000 月度额度', () => {
  for (const file of localeFiles) {
    const src = readFileSync(join(LOCALE_DIR, file), 'utf8');
    const a2 = pricingFaqA2(src);
    if (!a2) continue;
    assert.ok(/6[.,\s]?000/.test(a2), `${file}: faq.a2 缺少 Starter 月度额度 — ${a2}`);
    assert.ok(/20[.,\s]?000/.test(a2), `${file}: faq.a2 缺少 Pro 月度额度 — ${a2}`);
  }
});

ok('英文基线的定价与 FAQ 也是月度口径', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/i18n/common.ts'), 'utf8');
  assert.equal(field(src, 'starter', 'feature1'), '6,000 credits monthly');
  assert.equal(field(src, 'pro', 'feature1'), '20,000 credits monthly');
  assert.equal(field(src, 'free', 'feature1'), '60 credits daily (1 clip)');
  assert.ok(/monthly/.test(pricingFaqA2(src) ?? ''));
});

console.log(`\n✅ credits checks passed: ${passed}\n`);