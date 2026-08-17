/**
 * AI 工具箱验证脚本（云端推理架构）
 * 1. i18n 完整性（en 必须全量，zh 必须全量翻译）
 * 2. 关键文件与结构存在性（服务端推理库 + 4 个 API 路由 + 前端云调用）
 * 3. 算法单元测试（Lab 色彩转换、掩码形态学、窗口尺寸约束、delogo 命令构建）
 *
 * 运行: node --import tsx scripts/check-ai-tools.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadLocaleTranslations } from '../src/lib/i18n/index';
import {
  fitSize,
  roundToMultiple,
  rgbRawToLChannel,
  labToRgbInto,
  dilateBinary,
  maskBBoxSingleChannel,
} from '../src/lib/server/ai-tools/image-ops';

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
  'aiTools.needsLogin',
  'aiTools.signInToUse',
  'aiTools.uploading',
  'aiTools.serverProcessing',
  'aiTools.processing',
  'aiTools.processFailed',
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
  'aiTools.videoTooLarge',
  'aiTools.videoTooLong',
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
    // 页面 + 组件
    'src/app/ai-tools/page.tsx',
    'src/components/ai-tools/image-dewatermark.tsx',
    'src/components/ai-tools/video-dewatermark.tsx',
    'src/components/ai-tools/image-upscale.tsx',
    'src/components/ai-tools/image-colorization.tsx',
    // 前端云调用
    'src/lib/ai-tools/client-api.ts',
    'src/lib/ai-tools/image-utils.ts',
    // 服务端推理
    'src/lib/server/ai-tools/inference.ts',
    'src/lib/server/ai-tools/lama.ts',
    'src/lib/server/ai-tools/colorize.ts',
    'src/lib/server/ai-tools/upscale.ts',
    'src/lib/server/ai-tools/image-ops.ts',
    'src/lib/server/ai-tools/storage.ts',
    // API 路由
    'src/app/api/ai-tools/image-dewatermark/route.ts',
    'src/app/api/ai-tools/video-dewatermark/route.ts',
    'src/app/api/ai-tools/image-upscale/route.ts',
    'src/app/api/ai-tools/image-colorization/route.ts',
  ];
  for (const file of files) {
    assert.ok(existsSync(file), `missing file: ${file}`);
  }

  // 浏览器端推理已移除（用户零模型下载）
  const removed = [
    'src/lib/ai-tools/model-loader.ts',
    'src/lib/ai-tools/lama.ts',
    'src/lib/ai-tools/colorize.ts',
  ];
  for (const file of removed) {
    assert.ok(!existsSync(file), `browser-side inference must be removed: ${file}`);
  }

  // 侧边栏导航入口
  const appShell = readFileSync('src/components/app-shell.tsx', 'utf8');
  assert.ok(appShell.includes("href: '/ai-tools'"), 'app-shell must link to /ai-tools');
  assert.ok(appShell.includes("labelKey: 'aiTools'"), 'app-shell must use aiTools labelKey');

  // 页面必须懒加载四个工具组件
  const page = readFileSync('src/app/ai-tools/page.tsx', 'utf8');
  assert.ok(page.includes('lazy('), 'page must lazy-load tool components');

  // 四个组件必须是云调用（uploadAiInput + callAiTool），不得本地推理
  const toolChecks: Array<[string, string]> = [
    ['src/components/ai-tools/image-dewatermark.tsx', 'image-dewatermark'],
    ['src/components/ai-tools/video-dewatermark.tsx', 'video-dewatermark'],
    ['src/components/ai-tools/image-upscale.tsx', 'image-upscale'],
    ['src/components/ai-tools/image-colorization.tsx', 'image-colorization'],
  ];
  for (const [file, tool] of toolChecks) {
    const src = readFileSync(file, 'utf8');
    assert.ok(src.includes('uploadAiInput'), `${file} must upload input to storage`);
    assert.ok(src.includes(`'${tool}'`), `${file} must call ${tool} API`);
    assert.ok(src.includes('useAuth'), `${file} must check login state`);
  }

  // 图片去水印必须保留涂抹掩码交互
  const dewatermark = readFileSync('src/components/ai-tools/image-dewatermark.tsx', 'utf8');
  assert.ok(dewatermark.includes('PointerDown'), 'image-dewatermark must support brush painting');

  // 服务端视频去水印必须 delogo + boxblur 回退
  const videoRoute = readFileSync('src/app/api/ai-tools/video-dewatermark/route.ts', 'utf8');
  assert.ok(videoRoute.includes('delogo='), 'video route must use delogo filter');
  assert.ok(videoRoute.includes('boxblur'), 'video route must have boxblur fallback');

  // 模型源必须可配置（GitHub Releases 主源）
  const inference = readFileSync('src/lib/server/ai-tools/inference.ts', 'utf8');
  assert.ok(inference.includes('MODEL_SOURCES'), 'inference must define model sources');
  console.log('✓ files and structure valid (cloud inference)');
}

function checkLabConversions() {
  // rgbRawToLChannel: 白色 L=100，黑色 L=0，中灰 L≈53.6
  const px = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255]);
  const white = rgbRawToLChannel(px(255, 255, 255), 1, 1);
  assert.ok(Math.abs(white.L[0] - 100) < 0.01, `white L must be 100, got ${white.L[0]}`);
  const black = rgbRawToLChannel(px(0, 0, 0), 1, 1);
  assert.ok(Math.abs(black.L[0]) < 0.01, `black L must be 0, got ${black.L[0]}`);
  const gray = rgbRawToLChannel(px(128, 128, 128), 1, 1);
  assert.ok(Math.abs(gray.L[0] - 53.585) < 0.5, `gray L≈53.6, got ${gray.L[0]}`);

  // labToRgbInto: a=b=0 时必须还原中性灰（roundtrip via L）
  const out = new Uint8ClampedArray(4);
  const L = new Float64Array([gray.L[0]]);
  const zero = new Float64Array([0]);
  labToRgbInto(out, L, zero, zero);
  const [r, g, b] = [out[0], out[1], out[2]];
  assert.ok(Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1, `neutral gray must stay neutral, got ${r},${g},${b}`);
  assert.ok(Math.abs(r - 128) <= 2, `gray roundtrip must be ~128, got ${r}`);
  console.log('✓ Lab color conversions (server image-ops)');
}

function checkDilateAndBBox() {
  // 5x5 掩码，中心一个白点，膨胀 1px → 十字 5 点
  const mask = new Uint8Array(5 * 5);
  mask[2 * 5 + 2] = 1;
  const dilated = dilateBinary(mask, 5, 5, 1);
  const count = dilated.reduce((s, v) => s + v, 0);
  assert.equal(count, 5, `dilate should produce 5 pixels, got ${count}`);

  const bbox = maskBBoxSingleChannel(mask, 5, 5, 0);
  assert.deepEqual(bbox, { x: 2, y: 2, w: 1, h: 1 });

  const empty = maskBBoxSingleChannel(new Uint8Array(5 * 5), 5, 5, 0);
  assert.equal(empty, null);
  console.log('✓ mask dilation + bounding box (server image-ops)');
}

function checkFitSize() {
  assert.deepEqual(fitSize(800, 600, 960), { width: 800, height: 600 });
  assert.deepEqual(fitSize(1920, 1080, 960), { width: 960, height: 540 });
  assert.deepEqual(fitSize(1000, 2000, 960), { width: 480, height: 960 });

  // roundToMultiple：Swin2SR 要求 64 的倍数
  assert.deepEqual(roundToMultiple(500, 300, 64), { width: 512, height: 320 });
  assert.deepEqual(roundToMultiple(10, 10, 64), { width: 64, height: 64 });
  console.log('✓ fitSize + roundToMultiple constraints');
}

function checkDelogoCommand() {
  // 复现服务端路由的坐标 clamp 逻辑
  const toDelogoCoords = (rect: { x: number; y: number; w: number; h: number }, vw: number, vh: number) => {
    const px = Math.max(2, Math.round(rect.x * vw) & ~1);
    const py = Math.max(2, Math.round(rect.y * vh) & ~1);
    const pw = Math.max(2, Math.min(Math.round(rect.w * vw) & ~1, vw - px - 2));
    const ph = Math.max(2, Math.min(Math.round(rect.h * vh) & ~1, vh - py - 2));
    return { x: px, y: py, w: pw, h: ph };
  };

  // 边缘区域必须被 clamp 到合法范围
  const edge = toDelogoCoords({ x: 0, y: 0, w: 1, h: 1 }, 1920, 1080);
  assert.equal(edge.x, 2);
  assert.equal(edge.y, 2);
  assert.ok(edge.x + edge.w <= 1918);
  assert.ok(edge.y + edge.h <= 1078);

  // 正常区域
  const normal = toDelogoCoords({ x: 0.05, y: 0.05, w: 0.2, h: 0.1 }, 1920, 1080);
  const filter = `delogo=x=${normal.x}:y=${normal.y}:w=${normal.w}:h=${normal.h}`;
  assert.ok(/^delogo=x=\d+:y=\d+:w=\d+:h=\d+$/.test(filter), `bad filter: ${filter}`);
  console.log('✓ delogo command construction');
}

async function main() {
  await checkI18n();
  checkFiles();
  checkLabConversions();
  checkDilateAndBBox();
  checkFitSize();
  checkDelogoCommand();
  console.log('\nAll AI Toolbox (cloud) checks passed ✓');
}

main().catch((error) => {
  console.error('\nAI Toolbox check FAILED:', error.message);
  process.exit(1);
});
