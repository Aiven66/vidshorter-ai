const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agent', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  copyLogs: () => ipcRenderer.invoke('copy-logs'),
  onLog: (fn) => {
    ipcRenderer.on('log', (_evt, line) => fn(line));
  },
});
