// 调试 detectWatermark 各 zone 中间结果 — 用后即删
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const IMG = '/Users/aiven/.trae-cn/attachments/6a943db22f1256d4a294840b/08a534cc-a487-467a-92a8-b90161b0a7b8_2df378e3-71a9-43dc-8a31-b916817f2571_微信图片_20260904222022_1128_246.png';
const { data, info } = await sharp(readFileSync(IMG), { failOn: 'none' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;

const width = W, height = H;
const rgba = data;
const zw = Math.max(48, Math.round(width * 0.46));
const zh = Math.max(48, Math.round(height * 0.3));
const zones = [
  { name: 'br', x0: width - zw, y0: height - zh },
  { name: 'bl', x0: 0, y0: height - zh },
  { name: 'tr', x0: width - zw, y0: 0 },
  { name: 'tl', x0: 0, y0: 0 },
  { name: 'bc', x0: Math.round((width - zw) / 2), y0: height - zh },
];

for (const zone of zones) {
  const zwEff = Math.min(zw, width - zone.x0);
  const zhEff = Math.min(zh, height - zone.y0);
  const zoneArea = zwEff * zhEff;
  const lum = new Uint8Array(zoneArea);
  for (let y = 0; y < zhEff; y++) {
    const rowOff = (zone.y0 + y) * width + zone.x0;
    for (let x = 0; x < zwEff; x++) {
      const pi = (rowOff + x) * 4;
      lum[y * zwEff + x] = (0.299 * rgba[pi] + 0.587 * rgba[pi + 1] + 0.114 * rgba[pi + 2]) | 0;
    }
  }
  const bs = Math.max(16, Math.ceil(Math.min(zwEff, zhEff) / 8));
  const bw = Math.ceil(zwEff / bs), bh = Math.ceil(zhEff / bs);
  const blockMed = new Uint8Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const hist = new Uint32Array(256);
    const x1 = Math.min(zwEff, (bx + 1) * bs), y1 = Math.min(zhEff, (by + 1) * bs);
    const n = (x1 - bx * bs) * (y1 - by * bs);
    for (let y = by * bs; y < y1; y++) for (let x = bx * bs; x < x1; x++) hist[lum[y * zwEff + x]]++;
    let acc = 0; const half = n >> 1;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > half) { blockMed[by * bw + bx] = v; break; } }
  }
  const residual = new Int16Array(zoneArea);
  const absRes = new Uint16Array(zoneArea);
  for (let y = 0; y < zhEff; y++) {
    const by = Math.min(bh - 1, (y / bs) | 0);
    for (let x = 0; x < zwEff; x++) {
      const bx = Math.min(bw - 1, (x / bs) | 0);
      const r = lum[y * zwEff + x] - blockMed[by * bw + bx];
      residual[y * zwEff + x] = r; absRes[y * zwEff + x] = Math.abs(r);
    }
  }
  const sortedAbs = Array.from(absRes).sort((a, b) => a - b);
  const mad = sortedAbs[sortedAbs.length >> 1];
  const thr = Math.max(24, Math.min(72, Math.round(3 * 1.4826 * mad)));

  for (const polarity of [1, -1]) {
    const cand = new Uint8Array(zoneArea);
    let candCount = 0;
    for (let i = 0; i < zoneArea; i++) { if (polarity * residual[i] > thr) { cand[i] = 1; candCount++; } }
    // 连通域
    const blobs = [];
    const visited = new Uint8Array(zoneArea);
    const queue = new Int32Array(zoneArea);
    for (let seed = 0; seed < zoneArea; seed++) {
      if (!cand[seed] || visited[seed]) continue;
      let head = 0, tail = 0; queue[tail++] = seed; visited[seed] = 1;
      let bx0 = zwEff, by0 = zhEff, bx1 = -1, by1 = -1;
      while (head < tail) {
        const p = queue[head++]; const px = p % zwEff, py = (p / zwEff) | 0;
        if (px < bx0) bx0 = px; if (px > bx1) bx1 = px;
        if (py < by0) by0 = py; if (py > by1) by1 = py;
        for (let dy = -1; dy <= 1; dy++) { const ny = py + dy; if (ny < 0 || ny >= zhEff) continue;
          for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = px + dx; if (nx < 0 || nx >= zwEff) continue;
            const ni = ny * zwEff + nx; if (cand[ni] && !visited[ni]) { visited[ni] = 1; queue[tail++] = ni; } } }
      }
      const area = tail, w = bx1 - bx0 + 1, h = by1 - by0 + 1;
      if (area < 10 || area > zoneArea * 0.08) continue;
      if (w > zwEff * 0.8 || h > zhEff * 0.6) continue;
      blobs.push({ x0: bx0 + zone.x0, y0: by0 + zone.y0, x1: bx1 + zone.x0, y1: by1 + zone.y0, area });
    }
    const tag = `zone=${zone.name} pol=${polarity > 0 ? '+' : '-'} thr=${thr} cand=${(100 * candCount / zoneArea).toFixed(1)}% blobs=${blobs.length}`;
    if (blobs.length === 0) { console.log(`${tag} → skip`); continue; }
    // 显示 blob 摘要（按面积排序前 12 个）
    blobs.sort((a, b) => b.area - a.area);
    const summary = blobs.slice(0, 12).map(b => `(${b.x0},${b.y0})-${b.x1},${b.y1} a=${b.area}`).join(' | ');
    console.log(`${tag}`);
    console.log(`   top blobs: ${summary}`);
  }
}
