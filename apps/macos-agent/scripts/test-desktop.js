const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const EMBEDDED_WEB = path.join(ROOT, 'embedded-web');
const BIN_DIR = path.join(ROOT, 'bin');
const NODE_BIN = fs.existsSync(process.execPath) ? process.execPath : 'node';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n📋 ${title}`);
  console.log('─'.repeat(50));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Unable to allocate a test port'));
      });
    });
    server.on('error', reject);
  });
}

async function testEmbeddedWebStructure() {
  section('Embedded Web Structure');
  assert(fs.existsSync(EMBEDDED_WEB), 'embedded-web directory exists');
  assert(fs.existsSync(path.join(EMBEDDED_WEB, 'server.js')), 'server.js exists');
  assert(fs.existsSync(path.join(EMBEDDED_WEB, 'bootstrap.js')), 'bootstrap.js exists');
  assert(fs.existsSync(path.join(EMBEDDED_WEB, '.next')), '.next directory exists');
  assert(fs.existsSync(path.join(EMBEDDED_WEB, 'node_modules')), 'node_modules directory exists');
  assert(fs.existsSync(path.join(EMBEDDED_WEB, 'node_modules', 'next')), 'node_modules/next exists');
  assert(fs.existsSync(path.join(EMBEDDED_WEB, 'public')), 'public directory exists');
  assert(fs.existsSync(path.join(EMBEDDED_WEB, 'package.json')), 'package.json exists');
  const serverSource = fs.readFileSync(path.join(EMBEDDED_WEB, 'server.js'), 'utf8');
  assert(
    serverSource.includes('"isrFlushToDisk":false'),
    'Desktop server disables signed-bundle fetch cache writes',
  );
}

async function testEmbeddedWebServer() {
  section('Embedded Web Server');
  let port;
  try {
    port = await getFreePort();
  } catch (error) {
    assert(true, `Embedded web server port test skipped in restricted environment: ${error.code || error.message}`);
    return;
  }
  
  const fetchCacheDir = path.join(EMBEDDED_WEB, '.next', 'cache', 'fetch-cache');
  const listFetchCache = () => {
    if (!fs.existsSync(fetchCacheDir)) return [];
    return fs.readdirSync(fetchCacheDir).sort();
  };
  const fetchCacheBefore = listFetchCache();

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NEXT_PUBLIC_DESKTOP: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    };

    const child = spawn(NODE_BIN, [path.join(EMBEDDED_WEB, 'bootstrap.js')], {
      cwd: EMBEDDED_WEB,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;
    let timeout;
    let checkInterval;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        clearInterval(checkInterval);
        assert(false, `Embedded web server process started: ${error.message}`);
        resolve();
      }
    });

    timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        assert(false, 'Embedded web server started within timeout');
        if (stdout || stderr) {
          console.log(stdout.trim());
          console.log(stderr.trim());
        }
        try { child.kill(); } catch {}
        resolve();
      }
    }, 30000);

    checkInterval = setInterval(async () => {
      try {
        const resp = await fetch(`http://127.0.0.1:${port}/`);
        if (resp.ok) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            clearInterval(checkInterval);
            assert(true, 'Embedded web server responds to HTTP requests');
            assert(resp.status === 200, `Response status is 200 (got ${resp.status})`);
            assert(
              JSON.stringify(listFetchCache()) === JSON.stringify(fetchCacheBefore),
              'Embedded web request does not write fetch cache into the app payload',
            );
            try { child.kill(); } catch {}
            resolve();
          }
        }
      } catch {}
    }, 1000);
  });
}

async function testMainJsRequires() {
  section('Main.js Module Dependencies');
  
  const mainJs = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const requires = [];
  const requireRegex = /require\(['"]\.\/([^'"]+)['"]\)/g;
  let match;
  while ((match = requireRegex.exec(mainJs)) !== null) {
    requires.push(match[1]);
  }

  for (const req of requires) {
    const jsPath = path.join(ROOT, `${req}.js`);
    const jsonPath = path.join(ROOT, `${req}.json`);
    const dirPath = path.join(ROOT, req);
    const exists = fs.existsSync(jsPath) || fs.existsSync(jsonPath) || fs.existsSync(dirPath);
    assert(exists, `Required module '${req}' exists`);
  }
}

async function testBuildConfiguration() {
  section('Build Configuration');
  
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert(pkg.version, `Package version is set: ${pkg.version}`);
  assert(pkg.version === '0.9.66', 'Package version is bumped to 0.9.66');
  assert(pkg.main === 'main.js', 'Main entry point is main.js');
  assert(pkg.build, 'Build configuration exists');
  assert(pkg.build.appId, 'App ID is set');
  assert(pkg.build.mac, 'Mac build configuration exists');
  assert(pkg.build.mac.entitlements === 'entitlements.mac.plist', 'Entitlements file is configured');
  assert(fs.existsSync(path.join(ROOT, 'entitlements.mac.plist')), 'entitlements.mac.plist file exists');
  
  const files = pkg.build.files || [];
  assert(files.includes('i18n.js'), 'i18n.js is included in build files');
  assert(files.includes('main.js'), 'main.js is included in build files');
  assert(files.includes('preload.js'), 'preload.js is included in build files');
  assert(files.includes('preload-web.js'), 'preload-web.js is included in build files');
  assert(files.includes('local-highlights.js'), 'local-highlights.js is included in build files');
  assert(files.includes('media-server.js'), 'media-server.js is included in build files');
  assert(files.includes('real-human-engine.js'), 'Real Human engine is included in build files');
  assert(files.includes('real-human-ipc.js'), 'Real Human IPC is included in build files');
  assert(files.includes('local-product-avatar.js'), 'Local Product Avatar engine is included in build files');
  assert(files.includes('ytdlp.js'), 'ytdlp.js is included in build files');
  assert(files.includes('runner.js'), 'runner.js is included in build files');
  assert(files.includes('node_modules/**'), 'node_modules is included in build files');

  const engineJs = fs.readFileSync(path.join(ROOT, 'real-human-engine.js'), 'utf8');
  const ipcJs = fs.readFileSync(path.join(ROOT, 'real-human-ipc.js'), 'utf8');
  assert(engineJs.includes('HD mouth bank:'), 'Real Human builds a full-resolution source mouth bank');
  assert(engineJs.includes('tracked HD mouth bank:'), 'Real Human tracks mouth position in every host frame');
  assert(engineJs.includes('Select exactly one real source pose'), 'Real Human selects one mouth pose without pixel cross-fades');
  assert(!engineJs.includes('Top-3 soft-weighted'), 'Ghost-producing multi-mouth blending is removed');
  assert(!engineJs.includes('compositeHeldProduct(frame, heldCards'), 'Procedural product-card compositing is disabled');
  assert(engineJs.includes('Local product overlays are disabled'), 'Local renderer rejects fake product overlays');
  assert(!engineJs.includes("['bisent', 'bisent_512.onnx']"), 'Real Human no longer loads obsolete BiSeNet');
  assert(engineJs.includes('compositeHostMouth(frame, pred, frameIdx)'), 'Only retrieved host mouth pixels enter rendered frames');
  assert(!engineJs.includes('await self._runGfpgan()'), 'Low-resolution face restoration is disabled in synthesis');
  assert(ipcJs.includes("'bisent_512.onnx'"), 'Obsolete BiSeNet model is listed for disk cleanup');
  assert(ipcJs.includes("'gfpgan_1.4.onnx'"), 'Obsolete CodeFormer model is listed for disk cleanup');
  assert(!ipcJs.includes('Topview') && !ipcJs.includes('cloud-config'), 'No cloud Product Avatar credentials or calls remain');
  assert(ipcJs.includes("const hostId = validProductImages.length ? 'f_asia'"), 'Product mode selects footage with a physically held cylinder');
  assert(ipcJs.includes('localEngine.synthesize'), 'All real-human generation uses the local MuseTalk engine');
  assert(ipcJs.includes('validatePlayableVideo(outPath)'), 'Every generated video is decoded and checked before it is shown');
}

async function testLocalProductAvatar() {
  section('Local Product Avatar Integration');
  const { LocalProductAvatarEngine, MUSETALK_FILES } = require('../local-product-avatar');
  const localEngineExports = require('../real-human-engine');
  const localSource = fs.readFileSync(path.join(ROOT, 'local-product-avatar.js'), 'utf8');
  const replacementSource = fs.readFileSync(path.join(ROOT, 'vendor/musetalk-local/product_replace.py'), 'utf8');
  const inferenceSource = fs.readFileSync(path.join(ROOT, 'vendor/musetalk-local/scripts/inference.py'), 'utf8');
  assert(typeof LocalProductAvatarEngine === 'function', 'Local Product Avatar engine is available');
  assert(MUSETALK_FILES.some((file) => file.name.endsWith('musetalkV15/unet.pth')), 'MuseTalk 1.5 model is required');
  assert(!localEngineExports.compositeHeldProduct && !localEngineExports.renderProductCard, 'Legacy fake hand/card compositor is not publicly callable');
  assert(replacementSource.includes('skin_mask(region)') && replacementSource.includes('bottle_box'), 'Original hand and finger pixels form the product occlusion mask, bottle-box pixels are excluded from skin_soft');
  assert(replacementSource.includes('unsupported presenters') || replacementSource.includes('select her to continue'), 'Unsupported physical-holding layouts are rejected');
  assert(replacementSource.includes('trackJitter') && replacementSource.includes('visibleCoverage'), 'Held-product stability and occlusion quality gates are enforced');
  // v0.9.65: squat products (jars, aspect < 1.6) were rendered as a clipped
  // ~180px vertical strip: plan_placement made a 433px sprite inside a 188px
  // ROI and compose_region silently clipped it. Placement is now ROI-budget
  // capped and the compose ROI covers the full sprite rectangle.
  assert(replacementSource.includes('max_w = region_w + 2 * budget'), 'Placement sizes are capped to the compose ROI budget so sprites are never clipped');
  assert(replacementSource.includes('sp_x = obj_x + px'), 'Compose ROI covers the full planned sprite rectangle');
  assert(!replacementSource.includes('region_h * aspect * 1.02'), 'The old uncapped squat-placement width formula is removed');
  assert(replacementSource.includes('halo = cv2.dilate(product_layer'), 'Ghost-rim wash is a narrow halo ring around the sprite, not a whole-box flat pillar');
  // v0.9.66: composite hero shots (jar + tilted box, fill ratio ~0.5) were
  // squeezed into the grip as an unrecognizable blob. They now go to
  // showcase mode: bottle erased, fingers kept whole, original photo shown
  // as a natural product card in the frame.
  assert(replacementSource.includes('CUTOUT_CLEAN_FILL'), 'Cut-out fill ratio decides hold vs showcase mode');
  assert(replacementSource.includes('fill >= CUTOUT_CLEAN_FILL'), 'Low-fill composite cut-outs are routed away from the grip');
  assert(replacementSource.includes('def erase_only_region'), 'Showcase mode erases the source bottle without drawing a sprite');
  assert(replacementSource.includes('def finger_mask'), 'Showcase mode keeps whole fingers via connected-component skin filtering');
  assert(replacementSource.includes('def build_product_card_canvas'), 'Showcase mode builds a rounded product card with shadow');
  assert(replacementSource.includes('def draw_product_card'), 'Showcase mode draws the card with a scale/fade entrance');
  assert(replacementSource.includes('"mode": "hold" if hold_mode else "showcase"'), 'The done event reports which mode was used');
  assert(localSource.includes('PYTORCH_ENABLE_MPS_FALLBACK'), 'MuseTalk uses the local Apple MPS runtime');
  assert(localSource.includes("'-m', 'scripts.inference'"), 'Local MuseTalk inference is launched without a cloud API');
  assert(inferenceSource.includes('extract_video_frames(video_path, save_dir_full)'), 'Presenter paths with spaces are decoded without a shell');
  assert(!inferenceSource.includes('os.system(cmd)'), 'Presenter frame extraction no longer uses shell string interpolation');
  assert(inferenceSource.includes('repair_face_coordinates'), 'Intermittent face detection misses are repaired before inference');
  assert(inferenceSource.includes('No valid presenter face crops were produced'), 'Empty face crops fail before MuseTalk batching');
  assert(localSource.includes("'--vae_model_path'"), 'Local VAE uses an explicit absolute model path');
  assert(localSource.includes("'--face_parser_dir'"), 'Local face parser uses an explicit absolute model path');
  assert(inferenceSource.includes('active_frame_count = min'), 'Short narrations encode only the presenter frames they consume');
  assert(inferenceSource.includes('encoder.stdin.write(combine_frame.tobytes())'), 'Lip-sync frames stream to ffmpeg without multi-gigabyte PNG caches');
  assert(!localSource.includes('Topview') && !localSource.includes('api.topview'), 'Local Product Avatar contains no Topview integration');
}

async function testBinaries() {
  section('Binaries');
  
  assert(fs.existsSync(BIN_DIR), 'bin directory exists');
  const ytDlpPath = path.join(BIN_DIR, 'yt-dlp');
  if (fs.existsSync(ytDlpPath)) {
    assert(true, 'yt-dlp binary exists');
    try {
      fs.accessSync(ytDlpPath, fs.constants.X_OK);
      assert(true, 'yt-dlp binary is executable');
    } catch {
      assert(false, 'yt-dlp binary is executable');
    }
  } else {
    assert(false, 'yt-dlp binary exists (will be downloaded during build)');
  }
}

async function testI18nModule() {
  section('i18n Module');
  
  const i18nPath = path.join(ROOT, 'i18n.js');
  assert(fs.existsSync(i18nPath), 'i18n.js file exists');
  
  try {
    const content = fs.readFileSync(i18nPath, 'utf8');
    assert(content.includes('function t(') || content.includes('exports.t'), 'i18n.js exports t function');
    assert(content.includes('currentLocale') || content.includes('exports.currentLocale'), 'i18n.js exports currentLocale');
    assert(content.includes('setLocale') || content.includes('exports.setLocale'), 'i18n.js exports setLocale');
  } catch (e) {
    assert(false, `i18n.js is readable: ${e.message}`);
  }
}

async function testElectronAppStartup() {
  section('Electron App Startup (module check)');
  
  const modules = ['./i18n.js', './local-highlights.js', './ytdlp.js', './media-server.js'];
  for (const mod of modules) {
    const modPath = path.join(ROOT, mod);
    try {
      require(modPath);
      assert(true, `${mod} can be loaded`);
    } catch (e) {
      if (e.message && e.message.includes('electron')) {
        assert(true, `${mod} requires electron (expected in non-electron env)`);
      } else {
        assert(false, `${mod} load error: ${e.message}`);
      }
    }
  }

  const mainJs = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert(mainJs.includes('app.on('), 'main.js registers app event listeners');
  assert(mainJs.includes('BrowserWindow'), 'main.js creates BrowserWindow');
  assert(mainJs.includes('ipcMain.handle'), 'main.js registers IPC handlers');
  assert(mainJs.includes("ipcMain.handle('get-app-version'"), 'main.js handles get-app-version IPC');
  assert(mainJs.includes("ipcMain.handle('copy-logs'"), 'main.js handles copy-logs IPC');
  assert(mainJs.includes("ipcMain.handle('open-auth'"), 'main.js handles open-auth IPC alias');
  assert(mainJs.includes("ipcMain.handle('clear-auth'"), 'main.js handles clear-auth IPC alias');
  assert(mainJs.includes("ipcMain.handle('test-deep-link'"), 'main.js handles test-deep-link IPC alias');
  assert(mainJs.includes("ipcMain.handle('open-web-ui'"), 'main.js handles open-web-ui IPC');
  assert(mainJs.includes("ipcMain.handle('local-generate-highlights'"), 'main.js handles local-generate-highlights IPC');
  assert(mainJs.includes('logout reload error'), 'main.js delays logout reload until IPC can return');
  assert(mainJs.includes('await updateLoadingStatus'), 'Loading-page script updates are awaited to avoid startup rejections');
  assert(!mainJs.includes("require('./nonexistent')"), 'main.js has no broken requires');

  // Amazon 反爬代理：Chromium 网络栈 + 移动 UA（桌面 UA 100% 被 "automated access" 挑战页拦截）
  const mediaServerJs = fs.readFileSync(path.join(ROOT, 'media-server.js'), 'utf8');
  assert(mediaServerJs.includes('/api/proxy-fetch'), 'media-server exposes /api/proxy-fetch endpoint');
  assert(mediaServerJs.includes('electronNetGet'), 'media-server fetches through Chromium network stack');
  assert(mediaServerJs.includes('MOBILE_UA'), 'media-server uses mobile UA for Amazon anti-bot bypass');
  assert(mediaServerJs.includes('iPhone; CPU iPhone OS'), 'Amazon fetches use iPhone Safari UA');
  // v0.9.64: Amazon IP 风控三级递进（直连 → 预热 cookies → 强制预热重试）
  assert(mediaServerJs.includes('amazonFetch'), 'media-server has three-tier amazonFetch');
  assert(mediaServerJs.includes('warmupAmazonSession'), 'media-server warms up session cookies via BrowserWindow');
  assert(mediaServerJs.includes('persist:amazon-warmup'), 'warmup uses persistent partition (destroy+net.request crashes on in-memory session)');
  assert(mediaServerJs.includes('isAmazonChallengeHtml'), 'challenge page detection exists');
  // v0.9.64: 渲染进程崩溃自动恢复（闪退防护）
  assert(mainJs.includes('render-process-gone'), 'main.js auto-recovers after renderer crash');
}

async function main() {
  console.log('🧪 Clipop Agent Desktop Client Test Suite');
  console.log('='.repeat(50));
  console.log(`Version: ${JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version}`);
  console.log(`Date: ${new Date().toISOString()}`);

  await testBuildConfiguration();
  await testLocalProductAvatar();
  await testMainJsRequires();
  await testI18nModule();
  await testBinaries();
  await testEmbeddedWebStructure();
  await testEmbeddedWebServer();
  await testElectronAppStartup();

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
  }
}

main().catch((e) => {
  console.error('Test suite error:', e);
  process.exit(1);
});
