/**
 * 临时测试：模拟生产环境（en-US）抓取 Amazon，dump 价格区域 HTML 结构
 */
import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import * as fs from 'fs';

const url = 'https://www.amazon.com/medicube-Collagen-Volufiline-Under-Eyes-Forehead/dp/B0GHMZXX8Y/ref=ast_sto_dp_puis?th=1&psc=1';

const headers: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
};

function get(targetUrl: string, redirectCount = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = targetUrl.startsWith('https') ? https : http;
    const req = lib.get(targetUrl, { headers }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0) && res.headers.location && redirectCount < 5) {
        res.resume();
        resolve(get(new URL(res.headers.location, targetUrl).toString(), redirectCount + 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const enc = (res.headers['content-encoding'] || '').toLowerCase();
        const finish = (b: Buffer) => resolve(b);
        if (enc.includes('br')) zlib.brotliDecompress(raw, (e, d) => finish(e ? raw : d));
        else if (enc.includes('gzip')) zlib.gunzip(raw, (e, d) => finish(e ? raw : d));
        else if (enc.includes('deflate')) zlib.inflate(raw, (e, d) => finish(e ? raw : d));
        else finish(raw);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function main() {
  const buf = await get(url);
  const html = buf.toString('utf-8');
  console.log('html length:', html.length);
  fs.writeFileSync('/Users/aiven/Desktop/AI/codex/projects/scripts/.amazon-en.html', html);

  // 检查各价格容器
  const probes: Array<[string, RegExp]> = [
    ['a-offscreen any', /class=["'][^"']*a-offscreen[^"']*["'][^>]*>([^<]{1,60})</gi],
    ['corePrice', /corePrice[\s\S]{0,300}?([\d.,]+)\s*<\/span>/i],
    ['apex_desktop', /apex_desktop[\s\S]{0,600}?([\d.,]+)\s*<\/span>/i],
    ['priceblock', /priceblock[\s\S]{0,300}?([\d.,]+)/i],
    ['a-price-whole', /class=["'][^"']*a-price-whole[^"']*["'][^>]*>([^<]+)</i],
    ['a-price-fraction', /class=["'][^"']*a-price-fraction[^"']*["'][^>]*>([^<]+)</i],
    ['a-price symbol', /class=["'][^"']*a-price-symbol[^"']*["'][^>]*>([^<]+)</i],
    ['buybox price', /buyBox[\s\S]{0,800}?a-offscreen[^>]*>([^<]{1,60})</i],
  ];
  for (const [label, re] of probes) {
    if (re.global) {
      const all = [...html.matchAll(re)].map((m) => m[1].trim()).slice(0, 6);
      console.log(`[${label}] (${all.length}):`, JSON.stringify(all));
    } else {
      const m = html.match(re);
      console.log(`[${label}]:`, m ? JSON.stringify(m[1].trim()) : 'NOT FOUND');
    }
  }
  console.log('title:', html.match(/<title[^>]*>([^<]+)</i)?.[1]?.slice(0, 80));
}

main().catch((e) => { console.error(e); process.exit(1); });
