const { ipcRenderer } = require('electron');

let translations = {};

function applyTranslations(trans) {
  translations = trans || {};
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[key]) {
      el.textContent = translations[key];
    }
  });
}

function t(key) {
  return translations[key] || key;
}

async function loadConfig() {
  const data = await ipcRenderer.invoke('get-config');
  applyTranslations(data.translations);
  return data;
}

function maskToken(token) {
  if (!token) return t('debug.none');
  if (token.length <= 8) return '****';
  return token.slice(0, 4) + '...' + token.slice(-4);
}

async function refresh() {
  const data = await loadConfig();
  const cfg = data.config;

  document.getElementById('deepLinkStatus').className = 'dot active';
  document.getElementById('tokenStatus').className = cfg.authToken ? 'dot active' : 'dot error';

  document.getElementById('savedToken').textContent = maskToken(cfg.authToken);
  document.getElementById('savedEmail').textContent = cfg.authEmail || t('debug.none');

  const logs = data.logs || [];
  const logBox = document.getElementById('logBox');
  logBox.innerHTML = logs.map(l => {
    const cls = l.includes('[ERROR]') ? 'error' : l.includes('[SUCCESS]') ? 'success' : 'info';
    return `<span class="${cls}">${l}</span>`;
  }).join('\n');
  logBox.scrollTop = logBox.scrollHeight;
}

document.getElementById('testDeepLink').addEventListener('click', async () => {
  await ipcRenderer.invoke('test-deep-link');
  setTimeout(refresh, 500);
});

document.getElementById('clearAuth').addEventListener('click', async () => {
  await ipcRenderer.invoke('clear-auth');
  setTimeout(refresh, 500);
});

document.getElementById('refreshSaved').addEventListener('click', refresh);

refresh();
