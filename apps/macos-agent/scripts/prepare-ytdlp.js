const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const YT_DLP_DARWIN_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
const OUT_PATH = path.join(__dirname, '..', 'bin', 'yt-dlp');

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
    const out = fsSync.createWriteStream(filePath);
    const req = https.get(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 30_000 }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location && redirectsLeft > 0) {
        const nextUrl = new URL(res.headers.location, url).toString();
        try { res.resume(); } catch {}
        out.close(() => {
          fs.rm(filePath, { force: true }).catch(() => {}).finally(() => {
            fetchToFile(nextUrl, filePath, redirectsLeft - 1).then(resolve, reject);
          });
        });
        return;
      }
      if (code >= 300) {
        reject(new Error('HTTP ' + code));
        try { res.resume(); } catch {}
        return;
      }
      res.pipe(out);
      out.on('finish', () => resolve());
    });
    req.on('timeout', () => {
      try { req.destroy(new Error('ETIMEDOUT')); } catch {}
    });
    req.on('error', reject);
    out.on('error', reject);
  });
}

async function sniff(filePath, bytes = 16) {
  const fd = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fd.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fd.close().catch(() => {});
  }
}

function looksLikeMachO(prefix) {
  if (!prefix || prefix.length < 4) return false;
  const x = prefix.readUInt32BE(0);
  const y = prefix.readUInt32LE(0);
  return (
    x === 0xcafebabe
    || x === 0xcefaedfe
    || x === 0xcffaedfe
    || y === 0xfeedface
    || y === 0xfeedfacf
    || y === 0xbebafeca
  );
}

async function validate(filePath) {
  const st = await fs.stat(filePath);
  if (!st.isFile()) throw new Error('not file');
  if (st.size < 500_000) throw new Error('too small');
  const p = await sniff(filePath, 16);
  const s = p.toString('utf8').toLowerCase();
  if (s.includes('<html') || s.includes('<!doctype')) throw new Error('html');
  if (!looksLikeMachO(p)) throw new Error('not macho');
}

async function main() {
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  const tmp = `${OUT_PATH}.download`;

  try {
    await validate(OUT_PATH);
    return;
  } catch {}

  await fs.rm(tmp, { force: true }).catch(() => {});
  await fs.rm(OUT_PATH, { force: true }).catch(() => {});
  await fetchToFile(YT_DLP_DARWIN_URL, tmp);
  await fs.chmod(tmp, 0o755);
  await validate(tmp);
  await fs.rename(tmp, OUT_PATH);
  try { execFileSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', OUT_PATH], { stdio: 'ignore' }); } catch {}
}

main().catch((e) => {
  process.stderr.write((e && e.message ? e.message : String(e)) + '\n');
  process.exit(1);
});
