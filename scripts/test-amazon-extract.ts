/**
 * 临时测试：Amazon 商品链接抓取 + 解析效果
 */
import { fetchPage, parseAmazonProduct, parseProduct, isAmazonUrl } from '../src/lib/url-extract/fetcher';

const urls = [
  'https://www.amazon.com/medicube-Collagen-Volufiline-Under-Eyes-Forehead/dp/B0GHMZXX8Y/ref=ast_sto_dp_puis?th=1&psc=1',
];

async function main() {
for (const url of urls) {
  console.log('='.repeat(80));
  console.log('URL:', url);
  try {
    const t0 = Date.now();
    const page = await fetchPage(url, 25000);
    const ms = Date.now() - t0;
    console.log(`fetched in ${ms}ms, html length = ${page.html.length}`);
    console.log('title tag:', (page.html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || 'N/A').trim());
    // 检测是否命中机器人验证页
    const blocked = /api-services-support@amazon\.com|Robot Check|Enter the characters you see below/i.test(page.html);
    console.log('bot-check page?', blocked);
    const product = isAmazonUrl(url)
      ? parseAmazonProduct(page.html, page.finalUrl)
      : parseProduct(page.html, page.finalUrl);
    console.log('PRODUCT:', JSON.stringify(product, null, 2));
  } catch (e) {
    console.error('FETCH FAILED:', e instanceof Error ? e.message : e);
  }
}
}

main().catch((e) => { console.error(e); process.exit(1); });
