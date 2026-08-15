/**
 * 临时测试：通用电商平台（JSON-LD Product）解析增强
 */
import { parseProduct } from '../src/lib/url-extract/fetcher';

const shopifyLikeHtml = `<!DOCTYPE html>
<html>
<head>
<meta property="og:title" content="Hydro Flask All Around Travel Tumbler">
<meta property="og:description" content="Cold stays cold for 24 hours. Hot stays hot for 12 hours. The All Around Tumbler is designed with a 360° lid. Dishwasher safe. Fits most cupholders.">
<meta property="og:image" content="https://cdn.example.com/tumbler.jpg">
<script type="application/ld+json">
{
  "@type": "Product",
  "name": "Hydro Flask All Around Travel Tumbler",
  "brand": { "name": "Hydro Flask" },
  "description": "Cold stays cold for 24 hours. Hot stays hot for 12 hours. The All Around Tumbler is designed with a 360° lid. Dishwasher safe and easy to clean.",
  "image": "https://cdn.example.com/tumbler-hires.jpg",
  "offers": { "price": "34.95", "priceCurrency": "USD" },
  "aggregateRating": { "ratingValue": "4.7", "reviewCount": "15234" }
}
</script>
</head>
<body></body>
</html>`;

async function main() {
  const p = parseProduct(shopifyLikeHtml, 'https://shop.example.com/products/tumbler');
  console.log(JSON.stringify(p, null, 2));

  const checks: Array<[string, boolean]> = [
    ['name', p.name === 'Hydro Flask All Around Travel Tumbler'],
    ['priceDisplay $34.95', p.priceDisplay === '$34.95'],
    ['currency USD', p.currency === 'USD'],
    ['brand', p.brand === 'Hydro Flask'],
    ['rating 4.7', p.rating === '4.7'],
    ['reviewCount 15,234', p.reviewCount === '15,234'],
    ['highlights >= 3', (p.highlights?.length ?? 0) >= 3],
  ];
  let pass = 0, fail = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} [${label}]`);
    ok ? pass++ : fail++;
  }
  console.log(`\n${pass} passed, ${fail} failed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
