// Generate icon.ico from icon.png for Windows builds.
// ICO format: 6-byte header + N x 16-byte directory entries + PNG data for each size.
// Modern Windows (Vista+) supports PNG-embedded ICO, which avoids BMP header complexity.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const SRC_PNG = path.join(__dirname, '..', 'icon.png');
const OUT_ICO = path.join(__dirname, '..', 'icon.ico');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

function sipsResize(src, dst, size) {
  execSync(`sips -z ${size} ${size} "${src}" --out "${dst}"`, { stdio: 'pipe' });
}

function buildIco(entries) {
  // entries: [{ size, pngBuffer }]
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = 1 (icon)
  header.writeUInt16LE(count, 4);

  const dirSize = 16 * count;
  let offset = 6 + dirSize;
  const dirs = [];
  for (const e of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, 0); // width
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, 1); // height
    dir.writeUInt8(0, 2); // color count
    dir.writeUInt8(0, 3); // reserved
    dir.writeUInt16LE(1, 4); // planes
    dir.writeUInt16LE(32, 6); // bit count
    dir.writeUInt32LE(e.pngBuffer.length, 8); // bytes in res
    dir.writeUInt32LE(offset, 12); // image offset
    dirs.push(dir);
    offset += e.pngBuffer.length;
  }

  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.pngBuffer)]);
}

function main() {
  if (!fs.existsSync(SRC_PNG)) {
    console.error('Source PNG not found:', SRC_PNG);
    process.exit(1);
  }

  const tmpDir = path.join(__dirname, '..', '.tmp-ico');
  fs.mkdirSync(tmpDir, { recursive: true });

  const entries = [];
  for (const size of SIZES) {
    const tmpPng = path.join(tmpDir, `icon-${size}.png`);
    try {
      sipsResize(SRC_PNG, tmpPng, size);
    } catch (e) {
      console.warn(`[icon.ico] Failed to resize to ${size}: ${e.message}`);
      continue;
    }
    const buf = fs.readFileSync(tmpPng);
    entries.push({ size, pngBuffer: buf });
    console.log(`[icon.ico] Added ${size}x${size} (${buf.length} bytes)`);
  }

  if (entries.length === 0) {
    console.error('No icon entries generated');
    process.exit(1);
  }

  const ico = buildIco(entries);
  fs.writeFileSync(OUT_ICO, ico);
  console.log(`[icon.ico] Generated ${OUT_ICO} (${ico.length} bytes, ${entries.length} sizes)`);

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

main();
