const { contextBridge, ipcRenderer } = require('electron');

function tryParseAndFix(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    JSON.parse(raw);
  } catch {
    try { localStorage.removeItem(key); } catch {}
  }
}

try {
  tryParseAndFix('clipop_demo_user');
  tryParseAndFix('clipop_registered_users');
  tryParseAndFix('clipop_demo_videos');
  const keys = Object.keys(localStorage);
  for (const k of keys) {
    if (k.startsWith('clipop_demo_videos_')) tryParseAndFix(k);
  }
} catch {}

const desktopBridge = {
  openSettings: () => ipcRenderer.invoke('open-settings'),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  copyLogs: () => ipcRenderer.invoke('copy-logs'),
  backToWeb: () => ipcRenderer.invoke('open-web-ui'),
  localGenerateHighlights: (url) => ipcRenderer.invoke('local-generate-highlights', { url }),
  openAuth: () => ipcRenderer.invoke('open-auth'),
  openWebLogin: () => ipcRenderer.invoke('open-web-login'),
  openWebRegister: () => ipcRenderer.invoke('open-web-register'),
  getAuthCallbackUrl: async () => {
    const r = await ipcRenderer.invoke('get-auth-callback-url');
    return r?.callbackUrl || '';
  },
  getAuthToken: async () => {
    const r = await ipcRenderer.invoke('getAuthToken');
    return r?.token || '';
  },
  clearAuthToken: async () => {
    return await ipcRenderer.invoke('clearAuthToken');
  },
  getMediaBaseUrl: async () => {
    const r = await ipcRenderer.invoke('get-media-base-url');
    return r?.baseUrl || '';
  },
};

contextBridge.exposeInMainWorld('vidshorterDesktop', desktopBridge);
contextBridge.exposeInMainWorld('clipopDesktop', desktopBridge);

contextBridge.exposeInMainWorld('electronAPI', {
  getAuthToken: async () => {
    const r = await ipcRenderer.invoke('getAuthToken');
    return r?.token || '';
  },
  clearAuthToken: async () => {
    return await ipcRenderer.invoke('clearAuthToken');
  },
  openAuth: () => ipcRenderer.invoke('open-auth'),
  openWebLogin: () => ipcRenderer.invoke('open-web-login'),
  openWebRegister: () => ipcRenderer.invoke('open-web-register'),
  getAuthCallbackUrl: async () => {
    const r = await ipcRenderer.invoke('get-auth-callback-url');
    return r?.callbackUrl || '';
  },
  getMediaBaseUrl: async () => {
    const r = await ipcRenderer.invoke('get-media-base-url');
    return r?.baseUrl || '';
  },
});
