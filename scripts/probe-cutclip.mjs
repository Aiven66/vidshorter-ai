import { readFileSync } from 'node:fs';
const { fetch: ufetch, FormData, ProxyAgent } = await import('undici');
const dispatcher = new ProxyAgent('http://127.0.0.1:7897');
globalThis.fetch = (u, o) => ufetch(u, { ...o, dispatcher });

const src = readFileSync('/tmp/vs-src-color.mp4');
for (const plan of ['free', 'starter']) {
  const fd = new FormData();
  fd.append('file', new Blob([src], { type: 'video/mp4' }), 'clip.mp4');
  fd.append('startTime', '1');
  fd.append('duration', '2');
  fd.append('plan', plan);
  const r = await fetch('https://www.clipopai.com/api/cut-clip', { method: 'POST', body: fd });
  const t = await r.text();
  const m =
    t.match(/<h1[^>]*>([^<]+)<\/h1>/) ||
    t.match(/<pre[^>]*>([\s\S]*?)<\/pre>/) ||
    t.match(/"message":"([^"]+)"/) ||
    t.match(/data-next-error="([^"]*)"/);
  console.log(`[${plan}] status=${r.status} bodyLen=${t.length}`);
  if (!r.ok) console.log('  err:', m ? m[1].slice(0, 500) : t.slice(0, 400));
}