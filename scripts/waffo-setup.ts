/**
 * Waffo Pancake — 一次性初始化脚本。
 *
 * 在 Waffo 商店中创建 Starter / Pro 的月度订阅商品，并打印可直接粘贴到
 * 环境变量里的 WAFFO_PRODUCT_IDS 映射。
 *
 * 用法：
 *   pnpm waffo:setup              # 创建商品（幂等：已映射的 plan 会跳过）
 *   pnpm waffo:setup -- --publish # 同时把测试版本发布到 production
 *
 * 依赖环境变量：WAFFO_MERCHANT_ID / WAFFO_PRIVATE_KEY / WAFFO_STORE_ID。
 * 私钥只从本机 .env.local / .env 读取，不会上传或回显到对话。
 */
import { config } from 'dotenv';
import { BillingPeriod, TaxCategory, WaffoPancake } from '@waffo/pancake-ts';

// .env.local 优先（若某键在其中有定义则以其为准），shell 已存在的环境变量始终优先。
config({ path: '.env.local' });
config({ path: '.env' });

const PLAN_CATALOG = [
  {
    planId: 'starter',
    name: 'Clipop AI — Starter',
    description: 'Monthly Starter subscription for Clipop AI.',
    amount: '9.90',
  },
  {
    planId: 'pro',
    name: 'Clipop AI — Pro',
    description: 'Monthly Pro subscription for Clipop AI.',
    amount: '19.90',
  },
] as const;

function parseExistingMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function main() {
  const merchantId = process.env.WAFFO_MERCHANT_ID?.trim();
  const privateKey = process.env.WAFFO_PRIVATE_KEY?.trim();
  const storeId = process.env.WAFFO_STORE_ID?.trim();
  const baseUrl = process.env.WAFFO_BASE_URL?.trim() || undefined;
  const publish = process.argv.includes('--publish');

  if (!merchantId || !privateKey || !storeId) {
    console.error('缺少 WAFFO_MERCHANT_ID / WAFFO_PRIVATE_KEY / WAFFO_STORE_ID。');
    console.error('请把它们写入本机 .env.local（或 .env）后重新执行：pnpm waffo:setup');
    process.exit(1);
  }

  const client = new WaffoPancake({ merchantId, privateKey, baseUrl });
  const resolved: Record<string, string> = parseExistingMap(process.env.WAFFO_PRODUCT_IDS);

  for (const plan of PLAN_CATALOG) {
    if (resolved[plan.planId]) {
      console.log(`↷ ${plan.planId}：已映射到 ${resolved[plan.planId]}，跳过创建`);
      continue;
    }

    const { product } = await client.subscriptionProducts.create({
      storeId,
      name: plan.name,
      description: plan.description,
      billingPeriod: BillingPeriod.Monthly,
      prices: { USD: { amount: plan.amount, taxCategory: TaxCategory.SaaS } },
      metadata: { plan_id: plan.planId, source: 'clipop_ai' },
    });

    console.log(`✓ ${plan.planId}：已创建 ${product.id}（${product.name} · $${plan.amount}/月）`);
    resolved[plan.planId] = product.id;

    if (publish) {
      try {
        await client.subscriptionProducts.publish({ id: product.id });
        console.log(`  ↳ 已发布到 production：${product.id}`);
      } catch (err) {
        console.warn(`  ↳ 发布跳过：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://www.clipopai.com';

  console.log('\n── 把下面这行加入环境变量（本地 .env / Vercel）──');
  console.log(`WAFFO_PRODUCT_IDS=${JSON.stringify(resolved)}`);
  console.log('\n── 在 Waffo 后台注册 Webhook URL ──');
  console.log(`${appUrl}/api/payment/waffo/webhook`);
  console.log('\n完成后再回填 WAFFO_PRODUCT_IDS 即可走真实收银台（否则后端仍为 demo 模式）。');
}

main().catch((err) => {
  console.error('初始化失败：', err instanceof Error ? err.message : err);
  process.exit(1);
});
