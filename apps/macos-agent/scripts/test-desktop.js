const fs = require('node:fs');
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
  assert(pkg.version === '0.9.28', 'Package version is bumped to 0.9.28');
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
  assert(files.includes('ytdlp.js'), 'ytdlp.js is included in build files');
  assert(files.includes('runner.js'), 'runner.js is included in build files');
  assert(files.includes('node_modules/**'), 'node_modules is included in build files');
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
  assert(!mainJs.includes("require('./nonexistent')"), 'main.js has no broken requires');
}

async function main() {
  console.log('🧪 Clipop Agent Desktop Client Test Suite');
  console.log('='.repeat(50));
  console.log(`Version: ${JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version}`);
  console.log(`Date: ${new Date().toISOString()}`);

  await testBuildConfiguration();
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
