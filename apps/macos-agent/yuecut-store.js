'use strict';

/**
 * YueCut · 本地工作区持久化（零依赖，JSON 文件 + 原子写）
 *
 * 目录结构（rootDir 由主进程注入 userData/yuecut）：
 *   batches/{batchId}.json   批次（素材 + 候选 + 人工决策 + 导出任务）
 *   products.json            商品库（由 yuecut-products 的 store 管理）
 *   settings.json            主播档案、导出目录、全局规则
 *
 * 所有数据只落本机，不上传。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function createYuecutStore({ rootDir }) {
  if (!rootDir) throw new Error('yuecut-store: rootDir is required');
  const batchesDir = path.join(rootDir, 'batches');

  async function ensureDirs() {
    await fsp.mkdir(batchesDir, { recursive: true });
  }

  function id(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  }

  async function writeJson(file, data) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(2).toString('hex')}`;
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tmp, file);
  }

  function readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return fallback;
    }
  }

  const batchFile = (batchId) => path.join(batchesDir, `${String(batchId).replace(/[^a-zA-Z0-9_-]/g, '')}.json`);

  // ── 批次 ──

  async function listBatches() {
    await ensureDirs();
    const names = await fsp.readdir(batchesDir).catch(() => []);
    const batches = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const b = readJson(path.join(batchesDir, name), null);
      if (b && b.id) {
        // 列表只回摘要，避免一次载入全部候选
        batches.push({
          id: b.id,
          name: b.name,
          streamer: b.streamer || '',
          platform: b.platform || '',
          createdAt: b.createdAt,
          materialCount: Array.isArray(b.materials) ? b.materials.length : 0,
          candidateCount: Array.isArray(b.candidates) ? b.candidates.length : 0,
          confirmedCount: Array.isArray(b.candidates) ? b.candidates.filter((c) => c.status === 'confirmed').length : 0,
        });
      }
    }
    return batches.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function getBatch(batchId) {
    const b = readJson(batchFile(batchId), null);
    return b;
  }

  async function createBatch(data = {}) {
    await ensureDirs();
    const now = new Date().toISOString();
    const batch = {
      id: id('batch'),
      name: String(data.name || '未命名批次').slice(0, 80),
      streamer: String(data.streamer || '').slice(0, 40),
      platform: String(data.platform || '').slice(0, 40),
      createdAt: now,
      rulesVersion: String(data.rulesVersion || '1.3'),
      rules: data.rules || null,
      materials: [],
      candidates: [],
      exportJobs: [],
    };
    await writeJson(batchFile(batch.id), batch);
    return batch;
  }

  async function patchBatch(batchId, patch) {
    const b = await getBatch(batchId);
    if (!b) throw new Error('批次不存在');
    const allowed = ['name', 'streamer', 'platform', 'rules', 'rulesVersion'];
    for (const k of allowed) if (k in patch) b[k] = patch[k];
    await writeJson(batchFile(b.id), b);
    return b;
  }

  // ── 素材 ──

  async function addMaterials(batchId, items) {
    const b = await getBatch(batchId);
    if (!b) throw new Error('批次不存在');
    const added = [];
    for (const item of Array.isArray(items) ? items : []) {
      const mat = {
        id: id('mat'),
        fileName: String(item.fileName || '').slice(0, 200),
        filePath: String(item.filePath || ''),
        mediaUrl: String(item.mediaUrl || ''),
        duration: Number(item.duration) || 0,
        sizeBytes: Number(item.sizeBytes) || 0,
        status: ['queued', 'analyzing', 'done', 'error'].includes(item.status) ? item.status : 'queued',
        progress: 0,
        error: '',
        candidateCount: 0,
        asrEngine: '',
        locale: String(item.locale || 'yue'),
        addedAt: new Date().toISOString(),
        analyzedAt: '',
      };
      b.materials.push(mat);
      added.push(mat);
    }
    await writeJson(batchFile(b.id), b);
    return added;
  }

  async function patchMaterial(batchId, materialId, patch) {
    const b = await getBatch(batchId);
    if (!b) return null;
    const mat = b.materials.find((m) => m.id === materialId);
    if (!mat) return null;
    const fields = ['status', 'progress', 'error', 'candidateCount', 'asrEngine', 'duration', 'sizeBytes', 'analyzedAt', 'mediaUrl'];
    for (const k of fields) if (k in patch) mat[k] = patch[k];
    await writeJson(batchFile(b.id), b);
    return mat;
  }

  // ── 候选 ──

  async function replaceCandidates(batchId, materialId, candidates) {
    const b = await getBatch(batchId);
    if (!b) throw new Error('批次不存在');
    // 保留同时间码候选的既有人工决策（重跑分析不覆盖人工判断）
    const prev = new Map(
      b.candidates
        .filter((c) => c.materialId === materialId && (c.status === 'confirmed' || c.status === 'rejected' || c.status === 'deferred'))
        .map((c) => [`${c.start}-${c.end}`, c.status]),
    );
    b.candidates = b.candidates.filter((c) => c.materialId !== materialId);
    for (const c of candidates) {
      const key = `${c.start}-${c.end}`;
      b.candidates.push({
        ...c,
        materialId,
        status: prev.has(key) ? prev.get(key) : (c.status || 'pending'),
      });
    }
    const mat = b.materials.find((m) => m.id === materialId);
    if (mat) mat.candidateCount = candidates.length;
    await writeJson(batchFile(b.id), b);
    return b.candidates.filter((c) => c.materialId === materialId);
  }

  async function setDecision(batchId, candidateId, status) {
    const b = await getBatch(batchId);
    if (!b) return null;
    const c = b.candidates.find((x) => x.id === candidateId);
    if (!c) return null;
    if (!['pending', 'confirmed', 'deferred', 'rejected'].includes(status)) return c;
    c.status = status;
    c.decidedAt = status === 'pending' ? '' : new Date().toISOString();
    await writeJson(batchFile(b.id), b);
    return c;
  }

  // ── 导出任务 ──

  async function addExportJobs(batchId, items) {
    const b = await getBatch(batchId);
    if (!b) throw new Error('批次不存在');
    const now = new Date().toISOString();
    const jobs = [];
    for (const item of Array.isArray(items) ? items : []) {
      const job = {
        id: id('job'),
        candidateId: String(item.candidateId || ''),
        materialId: String(item.materialId || ''),
        title: String(item.title || '').slice(0, 120),
        outputPath: '',
        outputName: '',
        srtName: '',
        encoder: '',
        duration: 0,
        status: ['queued', 'rendering', 'done', 'error'].includes(item.status) ? item.status : 'queued',
        progress: 0,
        error: '',
        createdAt: now,
        finishedAt: '',
      };
      b.exportJobs.push(job);
      jobs.push(job);
    }
    await writeJson(batchFile(b.id), b);
    return jobs;
  }

  async function patchExportJob(batchId, jobId, patch) {
    const b = await getBatch(batchId);
    if (!b) return null;
    const job = b.exportJobs.find((j) => j.id === jobId);
    if (!job) return null;
    const fields = ['status', 'progress', 'error', 'outputPath', 'outputName', 'srtName', 'encoder', 'duration', 'finishedAt'];
    for (const k of fields) if (k in patch) job[k] = patch[k];
    await writeJson(batchFile(b.id), b);
    return job;
  }

  // ── 设置 ──

  function defaultSettings(homeMoviesDir) {
    return {
      locale: 'zh',
      streamers: [{ name: '阿欣甄选', platform: '抖音主号' }],
      activeStreamer: '阿欣甄选',
      exportDir: path.join(homeMoviesDir || '', 'YueCut'),
      rules: null,
    };
  }

  async function getSettings(fallback) {
    await ensureDirs();
    return readJson(path.join(rootDir, 'settings.json'), fallback || defaultSettings(''));
  }

  async function saveSettings(patch, fallback) {
    const cur = (await getSettings(fallback)) || defaultSettings('');
    const next = { ...cur, ...patch };
    await writeJson(path.join(rootDir, 'settings.json'), next);
    return next;
  }

  /** 今日处理素材数 / 产出切片数（跨批次，用于底部状态栏）。 */
  async function todayStats() {
    const batches = await listBatches();
    let processed = 0;
    let clips = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const sum of batches) {
      const b = await getBatch(sum.id);
      if (!b) continue;
      for (const m of b.materials || []) {
        if (String(m.analyzedAt || '').slice(0, 10) === today) processed += 1;
      }
      for (const j of b.exportJobs || []) {
        if (j.status === 'done' && String(j.finishedAt || '').slice(0, 10) === today) clips += 1;
      }
    }
    return { processed, clips };
  }

  return {
    rootDir,
    newId: id,
    ensureDirs,
    listBatches,
    getBatch,
    createBatch,
    patchBatch,
    addMaterials,
    patchMaterial,
    replaceCandidates,
    setDecision,
    addExportJobs,
    patchExportJob,
    getSettings,
    saveSettings,
    defaultSettings,
    todayStats,
  };
}

module.exports = { createYuecutStore };
