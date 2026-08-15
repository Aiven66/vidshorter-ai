/**
 * 临时测试：Amazon 价格解析多格式验证（合成 HTML，覆盖 US$/CNY/€/新版 DOM 等）
 */
import { parseAmazonProduct } from '../src/lib/url-extract/fetcher';

function makeAmazonHtml(opts: {
  priceHtml: string;
  title?: string;
}): string {
  const title = opts.title ?? 'medicube PDRN Pink Collagen Volume Multi Balm Stick';
  return `<!DOCTYPE html>
<html>
<head><title>Amazon.com: ${title}</title></head>
<body>
<span id="productTitle">${title}</span>
<div id="corePriceDisplay_desktop_feature_div">
  <div class="a-section a-spacing-none aok-align-center">
    ${opts.priceHtml}
  </div>
</div>
<div id="feature-bullets">
  <li><span>[ALL-IN-ONE VOLUME & GLOW BALM] Bring back the look of plump skin with this multi balm stick.</span></li>
  <li><span>[VOLUFILINE BOOST] Helps improve the look of hollow areas for visibly plumper skin.</span></li>
</div>
<span id="bylineInfo">Visit the medicube Store</span>
<i id="acrPopover" class="a-icon a-icon-star a-star-4" title="4.3 out of 5 stars">
<span id="acrCustomerReviewText" aria-label="1,829 ratings">1,829</span>
</body>
</html>`;
}

const cases: Array<{ label: string; html: string }> = [
  {
    label: 'US$ 前缀（Vercel 美国出口 IP 常见格式）',
    html: makeAmazonHtml({
      priceHtml: '<span class="a-price aok-align-center reinventPricePriceToPayMargin priceToPay"><span class="a-offscreen">US$21.99</span><span aria-hidden="true"><span class="a-price-symbol">US$</span><span class="a-price-whole">21</span><span class="a-price-fraction">99</span></span></span>',
    }),
  },
  {
    label: '$ 美元标准格式',
    html: makeAmazonHtml({
      priceHtml: '<span class="a-price"><span class="a-offscreen">$21.99</span></span>',
    }),
  },
  {
    label: 'CNY 格式（中国 IP）',
    html: makeAmazonHtml({
      priceHtml: '<span class="a-price"><span class="a-offscreen">CNY134.21</span></span>',
    }),
  },
  {
    label: '欧元欧式小数 134,21',
    html: makeAmazonHtml({
      priceHtml: '<span class="a-price"><span class="a-offscreen">134,21&nbsp;€</span></span>',
    }),
  },
  {
    label: 'List 划线价 + 主价（噪声过滤）',
    html: makeAmazonHtml({
      priceHtml: `<span class="a-price"><span class="a-offscreen">$18.50</span></span>
      <span class="a-size-base a-color-secondary">List: <span class="a-offscreen">$29.99</span></span>
      <span class="a-price"><span class="a-offscreen">$00</span></span>`,
    }),
  },
  {
    label: '新版 DOM：无 a-offscreen，仅 symbol+whole+fraction',
    html: makeAmazonHtml({
      priceHtml: '<span class="a-price"><span aria-hidden="true"><span class="a-price-symbol">US$</span><span class="a-price-whole">34<span class="a-price-decimal">.</span></span><span class="a-price-fraction">90</span></span></span>',
    }),
  },
  {
    label: 'Typical: 参考价 + 主价',
    html: makeAmazonHtml({
      priceHtml: `<span class="a-price"><span class="a-offscreen">$27.00</span></span>
      <span class="a-size-base">Typical: <span class="a-offscreen">Typical: $32.00</span></span>`,
    }),
  },
  {
    label: '主价容器内 List: 划线价（容器内）',
    html: makeAmazonHtml({
      priceHtml: `<span class="a-price"><span class="a-offscreen">$19.99</span></span>
      <span class="a-size-base">List: <span class="a-offscreen">List: $35.00</span></span>`,
    }),
  },
  {
    label: '推荐位价格不干扰主价（无容器时靠 a-price 精确匹配）',
    html: `<!DOCTYPE html>
<html><body>
<span id="productTitle">Test Product</span>
<div class="sponsored"><span class="a-offscreen">$4.20</span><span class="a-offscreen">$75.61</span></div>
<span class="a-price reinventPricePriceToPayMargin priceToPay" data-a-size="xl"><span class="a-offscreen">$28.50</span></span>
<div id="feature-bullets"><li><span>Feature one bullet text here for testing purposes only.</span></li></div>
<span id="bylineInfo">Brand: TestBrand</span>
</body></html>`,
  },
];

async function main() {
  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    const product = parseAmazonProduct(c.html, 'https://www.amazon.com/dp/B0TEST');
    const line = `price=${product.priceDisplay ?? '(none)'} orig=${product.originalPriceDisplay ?? '(none)'} currency=${product.currency ?? '-'}`;
    const ok = !!product.price;
    if (ok) pass++; else fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} [${c.label}] → ${line}`);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
