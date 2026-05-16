const { ipcRenderer } = require('electron');

let logBox = null;

function formatTime() {
  const d = new Date();
  return d.toISOString().slice(11, 23);
}

function addLog(msg, type = 'info') {
  if (!logBox) logBox = document.getElementById('logBox');
  if (!logBox) return;

  const div = document.createElement('div');
  div.className = type;
  div.innerHTML = `<span class="time">[${formatTime()}]</span> ${msg}`;
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

function setStatus(id, status) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('active', 'error');
  if (status === 'active') el.classList.add('active');
  if (status === 'error') el.classList.add('error');
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value || '(none)';
}

async function refreshSaved() {
  addLog('Refreshing saved auth...', 'info');
  const cfg = await ipcRenderer.invoke('get-config');
  setValue('savedToken', cfg.authToken ? (cfg.authToken.slice(0, 30) + '...') : '(none)');
  setValue('savedEmail', cfg.authEmail || '(none)');
  setStatus('tokenStatus', cfg.authToken ? 'active' : '');
}

document.addEventListener('DOMContentLoaded', async () => {
  addLog('Debug UI loaded', 'success');
  
  // 初始刷新
  await refreshSaved();

  // 监听事件
  ipcRenderer.on('log', (_, msg) => addLog(msg, 'info'));
  ipcRenderer.on('deepLinkReceived', (_, data) => {
    addLog(`Deep Link received: ${data.url}`, 'success');
    setValue('lastDeepLink', data.url);
    setValue('parsedToken', data.token ? (data.token.slice(0, 30) + '...') : '(none)');
    setValue('parsedEmail', data.email || '(none)');
    setValue('parsedUserId', data.userId || '(none)');
    setValue('parsedName', data.name || '(none)');
    setStatus('deepLinkStatus', 'active');
    refreshSaved();
  });

  // 按钮事件
  document.getElementById('testDeepLink').addEventListener('click', async () => {
    addLog('Testing deep link...', 'info');
    const result = await ipcRenderer.invoke('testDeepLink');
    addLog(`Test result: ${result}`, 'success');
  });

  document.getElementById('clearAuth').addEventListener('click', async () => {
    addLog('Clearing auth...', 'info');
    await ipcRenderer.invoke('clearAuthToken');
    await refreshSaved();
    addLog('Auth cleared', 'success');
  });

  document.getElementById('refreshSaved').addEventListener('click', async () => {
    await refreshSaved();
  });
});