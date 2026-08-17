/**
 * AI 工具箱验证脚本
 * 1. i18n 完整性（en 必须全量，zh 必须全量翻译）
 * 2. 关键文件与结构存在性
 * 3. 算法单元测试（Lab 色彩转换 roundtrip、掩码形态学、窗口尺寸约束、delogo 命令构建）
 *
 * 运行: node --import tsx scripts/check-ai-tools.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadLocaleTranslations } from '../src/lib/i18n/index';
import {
  rgbToLab,
  labToRgb,
  dilateMask,
  maskBoundingBox,
  fitSize,
} from '../src/lib/ai-tools/image-utils';

const REQUIRED_KEYS = [
  'nav.aiTools',
  'aiTools.title',
  'aiTools.subtitle',
  'aiTools.privacyBadge',
  'aiTools.tabImageDewatermark',
  'aiTools.tabVideoDewatermark',
  'aiTools.tabUpscale',
  'aiTools.tabColorize',
  'aiTools.footerNote',
  'aiTools.selectImage',
  'aiTools.selectVideo',
  'aiTools.uploadImageHint',
  'aiTools.uploadVideoHint',
  'aiTools.processing',
  'aiTools.processFailed',
  'aiTools.loadingModel',
  'aiTools.downloadingModel',
  'aiTools.modelCacheHint',
  'aiTools.before',
  'aiTools.after',
  'aiTools.compare',
  'aiTools.downloadPng',
  'aiTools.downloadMp4',
  'aiTools.dewatermarkHint',
  'aiTools.brushSize',
  'aiTools.undo',
  'aiTools.clearMask',
  'aiTools.maskRequired',
  'aiTools.removeWatermark',
  'aiTools.videoDewatermarkHint',
  'aiTools.clearRegions',
  'aiTools.regionsSelected',
  'aiTools.rectRequired',
  'aiTools.upscaleHint',
  'aiTools.upscaleImage',
  'aiTools.colorizeHint',
  'aiTools.colorizeImage',
  'aiTools.colorStrength',
  'aiTools.editAgain',
  'aiTools.changeImage',
  'aiTools.newImage',
  'aiTools.changeVideo',
  'aiTools.newVideo',
];

async function checkI18n() {
  for (const locale of ['en', 'zh'] as const) {
    const translations = await loadLocaleTranslations(locale);
    for (const key of REQUIRED_KEYS) {
      const value = translations[key];
      assert.notEqual(value, key, `${locale} is missing ${key}`);
      assert.equal(typeof value, 'string', `${locale}.${key} must be a string`);
      assert.ok(value.trim().length > 0, `${locale}.${key} must not be empty`);
    }
  }
  const zh = await loadLocaleTranslations('zh');
  assert.equal(zh['nav.aiTools'], 'AI 工具箱');
  assert.equal(zh['aiTools.title'], 'AI 工具箱');
  assert.ok((zh['aiTools.tabImageDewatermark'] as string).includes('去水印'));
  console.log('✓ i18n keys complete (en + zh)');
}

function checkFiles() {
  const files = [
    'src/app/ai-tools/page.tsx',
    'src/components/ai-tools/image-dewatermark.tsx',
    'src/components/ai-tools/video-dewatermark.tsx',
    'src/components/ai-tools/image-upscale.tsx',
    'src/components/ai-tools/image-colorization.tsx',
    'src/lib/ai-tools/model-loader.ts',
    'src/lib/ai-tools/image-utils.ts',
    'src/lib/ai-tools/lama.ts',
    'src/lib/ai-tools/colorize.ts',
  ];
  for (const file of files) {
    assert.ok(existsSync(file), `missing file: ${file}`);
  }

  // 侧边栏导航入口
  const appShell = readFileSync('src/components/app-shell.tsx', 'utf8');
  assert.ok(appShell.includes("href: '/ai-tools'"), 'app-shell must link to /ai-tools');
  assert.ok(appShell.includes("labelKey: 'aiTools'"), 'app-shell must use aiTools labelKey');

  // 页面必须懒加载四个工具组件（避免首屏打包 transformers/onnxruntime）
  const page = readFileSync('src/app/ai-tools/page.tsx', 'utf8');
  assert.ok(page.includes('lazy('), 'page must lazy-load tool components');

  // 去水印组件必须含 LaMa 调用 + 涂抹掩码交互
  const dewatermark = readFileSync('src/components/ai-tools/image-dewatermark.tsx', 'utf8');
  assert.ok(dewatermark.includes('lamaInpaint'), 'image-dewatermark must call lamaInpaint');
  assert.ok(dewatermark.includes('PointerDown'), 'image-dewatermark must support brush painting');

  // 视频去水印必须 delogo + boxblur 回退
  const video = readFileSync('src/components/ai-tools/video-dewatermark.tsx', 'utf8');
  assert.ok(video.includes('delogo='), 'video-dewatermark must use delogo filter');
  assert.ok(video.includes('boxblur'), 'video-dewatermark must have boxblur fallback');

  // 超分必须用 Swin2SR
  const upscale = readFileSync('src/components/ai-tools/image-upscale.tsx', 'utf8');
  assert.ok(upscale.includes('getUpscaler'), 'image-upscale must use Swin2SR pipeline');

  // 上色必须用 colorizeImage
  const colorize = readFileSync('src/components/ai-tools/image-colorization.tsx', 'utf8');
  assert.ok(colorize.includes('colorizeImage'), 'image-colorization must call colorizeImage');
  console.log('✓ files and structure valid');
}

function checkLabRoundtrip() {
  // rgbToLab → labToRgb roundtrip：中灰、纯色、黑白极值
  const samples: Array<[number, number, number]> = [
    [255, 255, 255],
    [0, 0, 0],
    [128, 128, 128],
    [200, 50, 50],
    [50, 180, 90],
    [30, 60, 220],
    [250, 200, 40],
  ];
  for (const [r, g, b] of samples) {
    const [L, a, bb] = rgbToLab(r, g, b);
    assert.ok(L >= -0.01 && L <= 100.01, `L out of range: ${L}`);
    assert.ok(a >= -128 && a <= 128, `a out of range: ${a}`);
    assert.ok(bb >= -128 && bb <= 128, `b out of range: ${bb}`);
    const [r2, g2, b2] = labToRgb(L, a, bb);
    const err = Math.max(Math.abs(r - r2), Math.abs(g - g2), Math.abs(b - b2));
    assert.ok(err <= 2, `roundtrip error too large for (${r},${g},${b}): ${err}`);
  }
  // 黑白灰的 a/b 必须接近 0（中性色）
  const [, aGray, bGray] = rgbToLab(128, 128, 128);
  assert.ok(Math.abs(aGray) < 1 && Math.abs(bGray) < 1, `gray must be neutral, got a=${aGray} b=${bGray}`);
  console.log('✓ Lab color conversion roundtrip (max err ≤ 2)');
}

function checkDilateAndBBox() {
  // 5x5 掩码，中心一个白点，膨胀 1px → 十字 5 点
  const mask = new Uint8ClampedArray(5 * 5 * 4);
  const setWhite = (x: number, y: number) => { mask[(y * 5 + x) * 4] = 255; };
  setWhite(2, 2);
  const dilated = dilateMask(mask, 5, 5, 1);
  const count = dilated.reduce((s, v) => s + v, 0);
  assert.equal(count, 5, `dilate should produce 5 pixels, got ${count}`);

  const bbox = maskBoundingBox(mask, 5, 5);
  assert.deepEqual(bbox, { x: 2, y: 2, w: 1, h: 1 });

  const empty = maskBoundingBox(new Uint8ClampedArray(5 * 5 * 4), 5, 5);
  assert.equal(empty, null);
  console.log('✓ mask dilation + bounding box');
}

function checkFitSize() {
  assert.deepEqual(fitSize(800, 600, 960), { width: 800, height: 600 });
  assert.deepEqual(fitSize(1920, 1080, 960), { width: 960, height: 540 });
  assert.deepEqual(fitSize(1000, 2000, 960), { width: 480, height: 960 });
  console.log('✓ fitSize constraints');
}

function checkDelogoCommand() {
  // 复现组件中的坐标 clamp 逻辑
  const toDelogoCoords = (rect: { x: number; y: number; w: number; h: number }, vw: number, vh: number) => {
    let x = Math.round(rect.x * vw);
    let y = Math.round(rect.y * vh);
    let w = Math.round(rect.w * vw);
    let h = Math.round(rect.h * vh);
    x = Math.max(1, Math.min(vw - 3, x));
    y = Math.max(1, Math.min(vh - 3, y));
    w = Math.max(1, Math.min(vw - x - 1, w));
    h = Math.max(1, Math.min(vh - y - 1, h));
    return { x, y, w, h };
  };

  // 边缘区域必须被 clamp 到合法范围（delogo 要求 x>=1, x+w<=vw-1）
  const edge = toDelogoCoords({ x: 0, y: 0, w: 1, h: 1 }, 1920, 1080);
  assert.equal(edge.x, 1);
  assert.equal(edge.y, 1);
  assert.ok(edge.x + edge.w <= 1919);
  assert.ok(edge.y + edge.h <= 1079);

  // 正常区域
  const normal = toDelogoCoords({ x: 0.05, y: 0.05, w: 0.2, h: 0.1 }, 1920, 1080);
  const filter = `delogo=x=${normal.x}:y=${normal.y}:w=${normal.w}:h=${normal.h}`;
  assert.ok(/^delogo=x=\d+:y=\d+:w=\d+:h=\d+$/.test(filter), `bad filter: ${filter}`);
  console.log('✓ delogo command construction');
}

async function main() {
  await checkI18n();
  checkFiles();
  checkLabRoundtrip();
  checkDilateAndBBox();
  checkFitSize();
  checkDelogoCommand();
  console.log('\nAll AI Toolbox checks passed ✓');
}

main().catch((error) => {
  console.error('\nAI Toolbox check FAILED:', error.message);
  process.exit(1);
});
