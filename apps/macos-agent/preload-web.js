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
  localModelsStatus: () => ipcRenderer.invoke('local-models:status'),
  localModelsPrepare: (ids) => ipcRenderer.invoke('local-models:prepare', { ids }),
  localTranscribe: (input) => ipcRenderer.invoke('local-transcribe', input),
  localHighlightRulesLoad: (profileId) => ipcRenderer.invoke('local-highlight-rules:load', { profileId }),
  localHighlightRulesSave: (rules) => ipcRenderer.invoke('local-highlight-rules:save', { rules }),
  localHighlightsPlan: (input) => ipcRenderer.invoke('local-highlights:plan', input),
  localRenderPublishable: (input) => ipcRenderer.invoke('local-render:publishable', input),
  localDownload: (input) => ipcRenderer.invoke('local-download', input),
  brandKitList: () => ipcRenderer.invoke('brand-kit:list'),
  brandKitGetActive: () => ipcRenderer.invoke('brand-kit:get-active'),
  brandKitSave: (brand) => ipcRenderer.invoke('brand-kit:save', brand),
  brandKitRemove: (id) => ipcRenderer.invoke('brand-kit:remove', id),
  brandKitSetActive: (id) => ipcRenderer.invoke('brand-kit:set-active', id),
  brandKitPickLogo: () => ipcRenderer.invoke('brand-kit:pick-logo'),
  projectList: () => ipcRenderer.invoke('project:list'),
  projectCreate: (input) => ipcRenderer.invoke('project:create', input),
  projectRead: (input) => ipcRenderer.invoke('project:read', input),
  projectSave: (input) => ipcRenderer.invoke('project:save', input),
  projectRemove: (id) => ipcRenderer.invoke('project:remove', { id }),
  projectImport: () => ipcRenderer.invoke('project:import'),
  projectExport: (id) => ipcRenderer.invoke('project:export', { id }),
  projectRelink: (input) => ipcRenderer.invoke('project:relink', input),
  ahaPickVideo: () => ipcRenderer.invoke('local-aha:pick-video'),
  ahaFirstClip: (input) => ipcRenderer.invoke('local-aha:first-clip', input),
  ahaExport: (input) => ipcRenderer.invoke('local-aha:export', input),
  onLocalModelsProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('local-models:progress', handler);
    return () => ipcRenderer.removeListener('local-models:progress', handler);
  },
  realHumanStatus: () => ipcRenderer.invoke('realhuman:status'),
  realHumanDownloadModels: () => ipcRenderer.invoke('realhuman:download-models'),
  realHumanListHosts: () => ipcRenderer.invoke('realhuman:list-hosts'),
  realHumanGenerate: (input) => ipcRenderer.invoke('realhuman:generate', input),
  realHumanCancel: () => ipcRenderer.invoke('realhuman:cancel'),
  onRealHumanEvent: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('realhuman:event', handler);
    return () => ipcRenderer.removeListener('realhuman:event', handler);
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
