/** quick edge-tts connectivity probe */
'use strict';
const crypto = require('crypto');
const WebSocket = require('ws');
const { HttpsProxyAgent } = require('https-proxy-agent');

const TRUSTED = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
function gec() {
  let ticks = BigInt(Math.floor(Date.now() / 1000 + 11644473600)) * 10000000n;
  ticks -= ticks % 30000000000000n;
  return crypto.createHash('sha256').update(ticks.toString() + TRUSTED).digest('hex').toUpperCase();
}

const variants = [
  { name: 'direct-ch131', proxy: null, ver: '1-131.0.2903.112' },
  { name: 'direct-ch130', proxy: null, ver: '1-130.0.2849.68' },
  { name: 'proxy-ch131', proxy: 'http://127.0.0.1:7897', ver: '1-131.0.2903.112' },
];

(async () => {
  for (const v of variants) {
    await new Promise((res) => {
      const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED}&Sec-MS-GEC=${gec()}&Sec-MS-GEC-Version=${v.ver}&ConnectionId=${crypto.randomBytes(16).toString('hex')}`;
      const ws = new WebSocket(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
          Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        },
        agent: v.proxy ? new HttpsProxyAgent(v.proxy) : undefined,
        handshakeTimeout: 8000,
      });
      const t = setTimeout(() => { console.log(v.name, 'TIMEOUT'); try { ws.terminate(); } catch (_) {} res(); }, 10000);
      ws.on('open', () => { clearTimeout(t); console.log(v.name, 'OPEN OK ✓'); try { ws.close(); } catch (_) {} res(); });
      ws.on('error', (e) => { clearTimeout(t); console.log(v.name, 'ERR', e.message); res(); });
      ws.on('unexpected-response', (_req, r) => { clearTimeout(t); console.log(v.name, 'HTTP', r.statusCode); res(); });
    });
  }
})();
