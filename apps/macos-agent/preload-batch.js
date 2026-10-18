'use strict';

/* YueCut 批量剪辑窗口的 preload：只暴露明确的 IPC 方法，contextIsolation 开启。 */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('yuecut', {
  // 基础
  getVersion: () => ipcRenderer.invoke('yuecut:version'),
  getSettings: () => ipcRenderer.invoke('yuecut:settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('yuecut:settings:save', patch),
  pickDirectory: () => ipcRenderer.invoke('yuecut:pick-directory'),
  statFile: (p) => ipcRenderer.invoke('yuecut:stat-file', p),
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return ''; }
  },

  // 批次 / 素材
  listBatches: () => ipcRenderer.invoke('yuecut:batches:list'),
  getBatch: (id) => ipcRenderer.invoke('yuecut:batches:get', id),
  createBatch: (data) => ipcRenderer.invoke('yuecut:batches:create', data),
  patchBatch: (id, patch) => ipcRenderer.invoke('yuecut:batches:patch', id, patch),
  selectVideos: () => ipcRenderer.invoke('yuecut:select-videos'),
  importMaterial: (batchId, item) => ipcRenderer.invoke('yuecut:material:import', batchId, item),
  patchMaterial: (batchId, materialId, patch) =>
    ipcRenderer.invoke('yuecut:materials:patch', batchId, materialId, patch),
  analyze: (batchId, materialId) => ipcRenderer.invoke('yuecut:material:analyze', batchId, materialId),
  setDecision: (batchId, candidateId, status) =>
    ipcRenderer.invoke('yuecut:decision', batchId, candidateId, status),

  // 商品库 / 规则
  productsList: () => ipcRenderer.invoke('yuecut:products:list'),
  productSave: (p) => ipcRenderer.invoke('yuecut:products:save', p),
  productRemove: (id) => ipcRenderer.invoke('yuecut:products:remove', id),
  productsBulkSave: (list) => ipcRenderer.invoke('yuecut:products:bulk-save', list),
  rulesGet: () => ipcRenderer.invoke('yuecut:rules:get'),
  rulesSave: (r) => ipcRenderer.invoke('yuecut:rules:save', r),

  // 导出
  addExportJobs: (batchId, candidateIds) => ipcRenderer.invoke('yuecut:jobs:add', batchId, candidateIds),
  renderBatch: (batchId) => ipcRenderer.invoke('yuecut:batch:render', batchId),

  // 模型 / 引擎
  modelsStatus: () => ipcRenderer.invoke('yuecut:models:status'),
  modelsPrepare: (onProgress) => {
    const listener = (_e, p) => {
      if (typeof onProgress === 'function') onProgress(p || {});
    };
    ipcRenderer.on('local-models:progress', listener);
    return ipcRenderer.invoke('yuecut:models:prepare', ['sensevoice-small'])
      .finally(() => ipcRenderer.removeListener('local-models:progress', listener));
  },
  engineInfo: () => ipcRenderer.invoke('yuecut:engine:info'),
  todayStats: () => ipcRenderer.invoke('yuecut:today-stats'),

  // 主进程推进事件
  onEvent: (cb) => {
    const listener = (_e, payload) => cb(payload || {});
    ipcRenderer.on('yuecut:event', listener);
    return () => ipcRenderer.removeListener('yuecut:event', listener);
  },
});
