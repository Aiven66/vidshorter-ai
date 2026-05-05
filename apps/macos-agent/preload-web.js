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
  tryParseAndFix('vidshorter_demo_user');
  tryParseAndFix('vidshorter_registered_users');
  tryParseAndFix('vidshorter_demo_videos');
  const keys = Object.keys(localStorage);
  for (const k of keys) {
    if (k.startsWith('vidshorter_demo_videos_')) tryParseAndFix(k);
  }
} catch {}

contextBridge.exposeInMainWorld('vidshorterDesktop', {
  openSettings: () => ipcRenderer.invoke('open-settings'),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  copyLogs: () => ipcRenderer.invoke('copy-logs'),
  backToWeb: () => ipcRenderer.invoke('open-web-ui'),
  localGenerateHighlights: (url) => ipcRenderer.invoke('local-generate-highlights', { url }),
  openAuth: () => ipcRenderer.invoke('open-auth'),
  getAuthToken: async () => {
    const r = await ipcRenderer.invoke('get-auth-token');
    return r?.token || '';
  },
  clearAuthToken: async () => {
    return await ipcRenderer.invoke('clearAuthToken');
  },
  getMediaBaseUrl: async () => {
    const r = await ipcRenderer.invoke('get-media-base-url');
    return r?.baseUrl || '';
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  getAuthToken: async () => {
    const r = await ipcRenderer.invoke('get-auth-token');
    return r?.token || '';
  },
  clearAuthToken: async () => {
    return await ipcRenderer.invoke('clearAuthToken');
  },
  openAuth: () => ipcRenderer.invoke('open-auth'),
});
