/**
 * 本地 ASR 引擎随包分发：准备 sherpa-onnx 的 ASR / 说话人分离二进制（P0-1）
 *
 * 目标：把 macOS（arm64）版 `sherpa-onnx-offline` 与
 * `sherpa-onnx-offline-speaker-diarization` 落到 `resources/sherpa-onnx/asr/`，
 * 作为可执行产物随 Electron 应用一起分发，让「中文高精度转写 + 说话人分离」开箱即用。
 *
 * 为什么单独放 `asr/` 子目录，而不是直接塞进既有的 `resources/sherpa-onnx/bin`：
 *   既有的 bin/lib 是 **kokoro TTS** 用的另一套 sherpa-onnx 版本（v1.12.x，arm64），
 *   直接覆盖 lib/ 会带来 ABI 风险、可能弄坏已上线的语音合成。这里隔离成
 *   `asr/{bin,lib}` 子树，二者各自版本自洽、互不影响（rpath 为 `@loader_path/../lib`）。
 *
 * 只拷贝最小闭包：两个二进制 + 三个 dylib（≈30MB 解压后），不整包铺开。
 *
 * 幂等：两个二进制就绪且可执行 → 直接跳过（prepare:runner 在 dev 时也会调用）。
 * 覆盖：设置 `CLIPOP_SHERPA_ONNX_DIR` 且其中 `bin/sherpa-onnx-offline` 可用时直接采用。
 */

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');

const SHERPA_VERSION = 'v1.13.8';
const ARCHIVE_NAME = `sherpa-onnx-${SHERPA_VERSION}-osx-arm64-shared.tar.bz2`;
const ARCHIVE_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/${SHERPA_VERSION}/${ARCHIVE_NAME}`;

const OUT_ROOT = path.join(__dirname, '..', 'resources', 'sherpa-onnx', 'asr');
const OUT_BIN_DIR = path.join(OUT_ROOT, 'bin');
const OUT_LIB_DIR = path.join(OUT_ROOT, 'lib');

const BINARIES = ['sherpa-onnx-offline', 'sherpa-onnx-offline-speaker-diarization'];
const LIBS = ['libonnxruntime.dylib', 'libsherpa-onnx-c-api.dylib', 'libsherpa-onnx-cxx-api.dylib'];

// 就绪判定的最小体积：二进制 ≥256KB（diarization 二进制约 400KB），dylib ≥64KB（防半成品 / 占位文件）。
const MIN_BIN_BYTES = 256 * 1024;
const MIN_LIB_BYTES = 64 * 1024;

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
  const envProxy = (
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    ''
  ).trim();
  if (envProxy) return envProxy;
  if (await isLocalPortOpen(7890)) return 'http://127.0.0.1:7890';
  if (await isLocalPortOpen(7897)) return 'http://127.0.0.1:7897';
  return '';
}

async function fetchToFile(url, filePath, redirectsLeft = 5) {
  const proxy = await resolveHttpProxy();
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 600_000 }, (res) => {
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
      console.log(`[prepare-sherpa-asr] 下载失败，重试 ${i}/${attempts - 1} ...`);
    }
  }
}

function extract(archive, dest) {
  fsSync.mkdirSync(dest, { recursive: true });
  execFileSync('/usr/bin/tar', ['-xjf', archive, '-C', dest], { stdio: 'ignore' });
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

function sizeOf(filePath) {
  try { return fsSync.statSync(filePath).size; } catch { return 0; }
}

function isExecutable(filePath) {
  try {
    fsSync.accessSync(filePath, fsSync.constants.X_OK);
    return fsSync.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** 二进制可用性自检：能启动、且不是 dyld 动态库缺失导致失败。 */
function binaryUsable(bin) {
  if (!isExecutable(bin)) return false;
  const res = spawnSync(bin, ['--help'], { encoding: 'utf8', timeout: 20_000 });
  if (res.error && res.error.code === 'ENOENT') return false;
  if (res.error && res.error.code === 'EACCES') return false;
  const blob = `${res.stdout || ''}${res.stderr || ''}`;
  if (/dyld|Library not loaded|image not found/i.test(blob)) return false;
  return true;
}

function libsReady() {
  return LIBS.every((name) => sizeOf(path.join(OUT_LIB_DIR, name)) >= MIN_LIB_BYTES);
}

function binsReady() {
  return BINARIES.every((name) => {
    const p = path.join(OUT_BIN_DIR, name);
    return isExecutable(p) && sizeOf(p) >= MIN_BIN_BYTES;
  });
}

function adoptOverride() {
  const override = String(process.env.CLIPOP_SHERPA_ONNX_DIR || '').trim();
  if (!override) return false;
  const candidates = [path.join(override, 'bin', 'sherpa-onnx-offline'), path.join(override, 'sherpa-onnx-offline')];
  for (const candidate of candidates) {
    if (binaryUsable(candidate)) {
      console.log(`[prepare-sherpa-asr] 采用 CLIPOP_SHERPA_ONNX_DIR=${override}`);
      return true;
    }
  }
  return false;
}

async function main() {
  // ① 环境变量直接覆盖
  if (adoptOverride()) return;

  // ② 幂等：产物已就绪直接跳过
  if (binsReady() && libsReady() && BINARIES.every((n) => binaryUsable(path.join(OUT_BIN_DIR, n)))) {
    console.log('[prepare-sherpa-asr] resources/sherpa-onnx/asr 已就绪，跳过');
    return;
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clipop-sherpa-'));
  try {
    const archive = path.join(tmpRoot, ARCHIVE_NAME);
    console.log(`[prepare-sherpa-asr] 下载 ${ARCHIVE_NAME} ...`);
    await download(ARCHIVE_URL, archive);

    const srcRoot = path.join(tmpRoot, 'src');
    extract(archive, srcRoot);

    // 二进制：递归按文件名定位，兼容压缩包内层目录改名。
    const foundBins = BINARIES.map((name) => ({ name, src: findFile(srcRoot, new RegExp(`^${name}$`)) }));
    const missing = foundBins.filter((b) => !b.src);
    if (missing.length) {
      throw new Error(`压缩包中未找到：${missing.map((m) => m.name).join(', ')}`);
    }

    // dylib：仅取最小闭包中列出的三个。
    const foundLibs = LIBS.map((name) => ({ name, src: findFile(srcRoot, new RegExp(`^${name.replace(/\./g, '\\.')}$`)) }))
      .filter((l) => l.src);

    await fs.rm(OUT_BIN_DIR, { recursive: true, force: true });
    await fs.rm(OUT_LIB_DIR, { recursive: true, force: true });
    await fs.mkdir(OUT_BIN_DIR, { recursive: true });
    await fs.mkdir(OUT_LIB_DIR, { recursive: true });

    for (const { name, src } of foundBins) {
      const dst = path.join(OUT_BIN_DIR, name);
      await fs.copyFile(src, dst);
      await fs.chmod(dst, 0o755);
      execFileSync('codesign', ['--force', '-s', '-', dst], { stdio: 'ignore' });
    }
    for (const { name, src } of foundLibs) {
      const dst = path.join(OUT_LIB_DIR, name);
      await fs.copyFile(src, dst);
      await fs.chmod(dst, 0o755);
      try { execFileSync('codesign', ['--force', '-s', '-', dst], { stdio: 'ignore' }); } catch {}
    }

    if (!binsReady()) throw new Error('拷贝后二进制体积校验失败');
    for (const name of BINARIES) {
      const bin = path.join(OUT_BIN_DIR, name);
      if (!binaryUsable(bin)) throw new Error(`${name} 自检失败（可能缺少 dylib）`);
    }

    try { execFileSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', OUT_ROOT], { stdio: 'ignore' }); } catch {}
    console.log(`[prepare-sherpa-asr] 完成 -> ${path.relative(process.cwd(), OUT_BIN_DIR)}`);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => {
  process.stderr.write('[prepare-sherpa-asr] ' + (e && e.message ? e.message : String(e)) + '\n');
  process.exit(1);
});