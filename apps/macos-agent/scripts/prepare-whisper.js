/**
 * 本地 ASR 引擎随包分发：构建并准备 whisper.cpp 的 whisper-cli（P0-1）
 *
 * 目标：把 macOS 版 whisper-cli 落到 `bin/whisper/whisper-cli`，作为可执行产物随 Electron
 * 应用一起分发（与既有 `bin/yt-dlp` 同一工程惯例），让本地转写开箱即用、无需用户安装。
 *
 * 方案：自举 CMake + 从源码静态编译。
 *   先试过 Homebrew bottle（whisper.cpp / ggml / libomp），但其 ggml 后端搜索路径被硬编码到
 *   `/opt/homebrew/Cellar/ggml/<ver>/libexec`，脱离 brew 安装无法运行（ggml_backend_dev_init
 *   断言失败）。改为静态编译：产物为单个自包含 Mach-O，只依赖 /usr/lib 与 /System 框架。
 *
 *   - CPU 后端静态链接（本机 Command Line Tools 不含 Metal 工具链，故关闭 Metal）。
 *   - CMake 从 cmake.org 下载独立包，whisper.cpp 源码取自 codeload.github.com。
 *
 * 幂等：`bin/whisper/whisper-cli --help` 能跑就直接跳过（prepare:runner 在 dev 时也会调用）。
 * 覆盖：设置 `CLIPOP_WHISPER_CLI` 且可用时直接采用，不做构建。
 */

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');

const OUT_DIR = path.join(__dirname, '..', 'bin', 'whisper');
const OUT_BIN = path.join(OUT_DIR, 'whisper-cli');

const CMAKE_VERSION = '4.4.4';
const CMAKE_URL = `https://cmake.org/files/v4.4/cmake-${CMAKE_VERSION}-macos-universal.tar.gz`;
const WHISPER_TAG = 'v1.9.4';
const WHISPER_URL = `https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/tags/${WHISPER_TAG}`;

async function isLocalPortOpen(port) {
  return await new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: 200 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function resolveHttpProxy() {
  const envProxy = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || '').trim();
  if (envProxy) return envProxy;
  if (await isLocalPortOpen(7890)) return 'http://127.0.0.1:7890';
  return '';
}

async function fetchToFile(url, filePath, redirectsLeft = 5) {
  const proxy = await resolveHttpProxy();
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 300_000 }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location && redirectsLeft > 0) {
        const nextUrl = new URL(res.headers.location, url).toString();
        try { res.resume(); } catch {}
        fs.rm(filePath, { force: true }).catch(() => {}).finally(() => {
          fetchToFile(nextUrl, filePath, redirectsLeft - 1).then(resolve, reject);
        });
        return;
      }
      if (code >= 300) {
        reject(new Error('HTTP ' + code));
        try { res.resume(); } catch {}
        return;
      }
      const out = fsSync.createWriteStream(filePath);
      res.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('timeout', () => {
      try { req.destroy(new Error('ETIMEDOUT')); } catch {}
    });
    req.on('error', reject);
  });
}

async function download(url, filePath, attempts = 3) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await fs.rm(filePath, { force: true }).catch(() => {});
      await fetchToFile(url, filePath);
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`[prepare-whisper] 下载失败，重试 ${i}/${attempts - 1} ...`);
    }
  }
}

function extract(archive, dest) {
  fsSync.mkdirSync(dest, { recursive: true });
  execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', dest], { stdio: 'ignore' });
}

function findFile(root, re) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fsSync.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && re.test(entry.name)) return full;
    }
  }
  return '';
}

function findDir(root, re) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fsSync.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (re.test(entry.name)) return full;
      stack.push(full);
    }
  }
  return '';
}

function runsOk(bin) {
  try {
    execFileSync(bin, ['--help'], { stdio: 'ignore', timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (res.status !== 0) {
    const detail = res.error ? res.error.message : `exit ${res.status}, signal ${res.signal || '-'}`;
    throw new Error(`${cmd} ${args[0] || ''} 失败（${detail}）`);
  }
}

async function main() {
  // ① 环境变量直接覆盖
  const override = String(process.env.CLIPOP_WHISPER_CLI || '').trim();
  if (override && runsOk(override)) {
    console.log(`[prepare-whisper] 采用 CLIPOP_WHISPER_CLI=${override}`);
    return;
  }

  // ② 幂等：产物已就绪直接跳过
  if (fsSync.existsSync(OUT_BIN) && runsOk(OUT_BIN)) {
    console.log('[prepare-whisper] bin/whisper 已就绪，跳过');
    return;
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clipop-whisper-'));
  const buildDir = `${OUT_DIR}.build`;
  try {
    // ③ CMake 独立包
    const cmakeArchive = path.join(tmpRoot, 'cmake.tar.gz');
    console.log('[prepare-whisper] 下载 CMake ...');
    await download(CMAKE_URL, cmakeArchive);
    const cmakeRoot = path.join(tmpRoot, 'cmake');
    extract(cmakeArchive, cmakeRoot);
    const cmakeApp = findDir(cmakeRoot, /^CMake\.app$/);
    const cmakeBin = cmakeApp ? path.join(cmakeApp, 'Contents', 'bin', 'cmake') : '';
    if (!cmakeBin || !fsSync.existsSync(cmakeBin)) throw new Error('CMake 独立包中未找到 cmake');

    // ④ whisper.cpp 源码
    const srcArchive = path.join(tmpRoot, 'whisper.tar.gz');
    console.log('[prepare-whisper] 下载 whisper.cpp 源码 ...');
    await download(WHISPER_URL, srcArchive);
    const srcRoot = path.join(tmpRoot, 'src');
    extract(srcArchive, srcRoot);
    const project = findDir(srcRoot, /^whisper\.cpp-/);
    if (!project || !fsSync.existsSync(path.join(project, 'CMakeLists.txt'))) {
      throw new Error('whisper.cpp 源码结构异常');
    }

    // ⑤ 静态编译 whisper-cli（CPU 后端；本机无 Metal 工具链）
    console.log('[prepare-whisper] 静态编译 whisper-cli ...');
    run(cmakeBin, [
      '-B', 'build',
      '-DCMAKE_BUILD_TYPE=Release',
      '-DBUILD_SHARED_LIBS=OFF',
      '-DGGML_METAL=OFF',
      '-DGGML_BACKEND_DL=OFF',
      '-DGGML_ACCELERATE=ON',
      '-DWHISPER_BUILD_TESTS=OFF',
      '-DWHISPER_BUILD_EXAMPLES=ON',
      '-DWHISPER_BUILD_SERVER=OFF',
      '-DWHISPER_SDL2=OFF',
      '-DWHISPER_COREML=OFF',
      '-DCMAKE_OSX_ARCHITECTURES=arm64',
    ], project);
    run(cmakeBin, ['--build', 'build', '--config', 'Release', '--target', 'whisper-cli', '-j', '4'], project);

    const built = findFile(path.join(project, 'build', 'bin'), /^whisper-cli$/);
    if (!built) throw new Error('构建未产出 whisper-cli');

    await fs.rm(buildDir, { recursive: true, force: true });
    await fs.mkdir(buildDir, { recursive: true });
    await fs.copyFile(built, path.join(buildDir, 'whisper-cli'));
    await fs.chmod(path.join(buildDir, 'whisper-cli'), 0o755);
    execFileSync('codesign', ['--force', '-s', '-', path.join(buildDir, 'whisper-cli')], { stdio: 'ignore' });

    if (!runsOk(path.join(buildDir, 'whisper-cli'))) throw new Error('whisper-cli --help 自检失败');

    await fs.rm(OUT_DIR, { recursive: true, force: true });
    await fs.rename(buildDir, OUT_DIR);
    try { execFileSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', OUT_DIR], { stdio: 'ignore' }); } catch {}
    console.log(`[prepare-whisper] 完成 -> ${path.relative(process.cwd(), OUT_BIN)}`);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(buildDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write('[prepare-whisper] ' + (e && e.message ? e.message : String(e)) + '\n');
  process.exit(1);
});
