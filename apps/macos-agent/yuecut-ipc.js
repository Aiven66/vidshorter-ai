'use strict';

/**
 * YueCut 粤剪 · 主进程 IPC 注册
 *
 * 纯本地链路：导入（硬链接到媒体目录）→ SenseVoice 粤语转写 → 规则管线评分
 * → 人工决策 → VideoToolbox/x264 批量渲染。零云端、零基座模型 API。
 */

const fsSync = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const { analyzeMaterial, normalizeRules, DEFAULT_RULES } = require('./yuecut-pipeline');
const { createProductStore, SEED_PRODUCTS } = require('./yuecut-products');
const { createYuecutStore } = require('./yuecut-store');
const { renderClip, outputFileName, detectHardwareEncoder } = require('./yuecut-export');

const VIDEO_EXT_RE = /\.(mp4|mov|m4v|mkv|avi|webm|flv|ts|m2ts)$/i;

function sanitizeSeg(s, fallback) {
  const v = String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return v || fallback;
}

function registerYuecutIpc(deps) {
  const {
    ipcMain, app, dialog,
    getMediaBaseUrl,
    getUploadDir,
    createLocalTranscriber,
    modelStatus,
    modelPrepare,
    ffmpegPath,
    probeDurationSeconds,
  } = deps;

  const rootDir = path.join(app.getPath('userData'), 'yuecut');
  const store = createYuecutStore({ rootDir });
  const productStore = createProductStore({ filePath: path.join(rootDir, 'products.json'), seed: SEED_PRODUCTS });

  async function settings() {
    await store.ensureDirs();
    const fallback = store.defaultSettings(path.join(app.getPath('home'), 'Movies'));
    return store.getSettings(fallback);
  }

  async function rules() {
    const s = await settings();
    return normalizeRules(s.rules || DEFAULT_RULES);
  }

  async function products() {
    await productStore.ensureSeed();
    return productStore.list();
  }

  function send(sender, channel, payload) {
    try { sender.send(channel, payload); } catch {}
  }

  // ── 基础 ──
  ipcMain.handle('yuecut:version', () => app.getVersion());

  ipcMain.handle('yuecut:settings:get', async () => settings());
  ipcMain.handle('yuecut:settings:save', async (_e, patch) => store.saveSettings(patch || {}, store.defaultSettings(path.join(app.getPath('home'), 'Movies'))));

  ipcMain.handle('yuecut:rules:get', async () => rules());
  ipcMain.handle('yuecut:rules:save', async (_e, input) => {
    const next = normalizeRules(input);
    await store.saveSettings({ rules: next }, store.defaultSettings(path.join(app.getPath('home'), 'Movies')));
    return next;
  });

  ipcMain.handle('yuecut:today-stats', async () => store.todayStats());

  ipcMain.handle('yuecut:pick-directory', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.canceled || !r.filePaths?.[0] ? '' : r.filePaths[0];
  });

  ipcMain.handle('yuecut:select-videos', async () => {
    const r = await dialog.showOpenDialog({
      title: '选择直播回放 / 原始视频',
      properties: ['openFile', 'multiFile'],
      filters: [{ name: '视频文件', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'flv', 'ts', 'm2ts'] }],
    });
    if (r.canceled) return [];
    return Promise.all(r.filePaths.map(async (filePath) => {
      const st = await fsp.stat(filePath).catch(() => null);
      return { filePath, fileName: path.basename(filePath), sizeBytes: st?.size || 0 };
    }));
  });

  ipcMain.handle('yuecut:stat-file', async (_e, filePath) => {
    const st = await fsp.stat(filePath);
    return st.size;
  });

  // ── 商品库 ──
  ipcMain.handle('yuecut:products:list', async () => products());
  ipcMain.handle('yuecut:products:save', async (_e, product) => productStore.save(product));
  ipcMain.handle('yuecut:products:remove', async (_e, id) => productStore.remove(id));
  ipcMain.handle('yuecut:products:bulk-save', async (_e, list) => {
    let saved = [];
    for (const p of Array.isArray(list) ? list : []) {
      // eslint-disable-next-line no-await-in-loop
      saved.push(await productStore.save(p));
    }
    return saved;
  });

  // ── 批次 / 素材 / 决策 ──
  ipcMain.handle('yuecut:batches:list', async () => store.listBatches());
  ipcMain.handle('yuecut:batches:get', async (_e, id) => store.getBatch(id));
  ipcMain.handle('yuecut:batches:create', async (_e, data) => store.createBatch(data || {}));
  ipcMain.handle('yuecut:batches:patch', async (_e, id, patch) => store.patchBatch(id, patch || {}));
  ipcMain.handle('yuecut:materials:patch', async (_e, batchId, materialId, patch) =>
    store.patchMaterial(batchId, materialId, patch || {}));
  ipcMain.handle('yuecut:decision', async (_e, batchId, candidateId, status) =>
    store.setDecision(batchId, candidateId, status));

  /**
   * 把任意位置的源素材以硬链接方式放入媒体服务目录（失败回落拷贝），
   * 返回可 Range 播放的 127.0.0.1 URL。不复制大文件、不上传。
   */
  async function linkToMedia(filePath) {
    await getMediaBaseUrl();
    const uploadDir = getUploadDir();
    await fsp.mkdir(uploadDir, { recursive: true });
    const st = await fsp.stat(filePath);
    const ext = (path.extname(filePath) || '.mp4').toLowerCase();
    const hash = crypto.createHash('sha1')
      .update(`${filePath}:${st.size}:${Math.floor(st.mtimeMs)}`).digest('hex').slice(0, 24);
    const name = `yc_${hash}${VIDEO_EXT_RE.test(ext) ? ext : '.mp4'}`;
    const dest = path.join(uploadDir, name);
    if (!fsSync.existsSync(dest)) {
      try {
        await fsp.link(filePath, dest);
      } catch (e) {
        if (e && e.code === 'EEXIST') { /* 并发时已存在，忽略 */ }
        else { await fsp.copyFile(filePath, dest); }
      }
    }
    return `${await getMediaBaseUrl()}/api/local-video/${name}`;
  }

  ipcMain.handle('yuecut:material:import', async (event, batchId, item) => {
    const filePath = String(item?.filePath || '');
    if (!filePath || !fsSync.existsSync(filePath)) throw new Error('素材文件不存在');
    const fileName = String(item.fileName || path.basename(filePath)).slice(0, 200);
    const st = await fsp.stat(filePath);
    send(event.sender, 'yuecut:event', { type: 'import-progress', batchId, progress: 30, message: '探测媒体信息' });
    const mediaUrl = await linkToMedia(filePath);
    const duration = await probeDurationSeconds(filePath, 0);
    const [mat] = await store.addMaterials(batchId, [{
      fileName, filePath, mediaUrl,
      duration, sizeBytes: st.size, status: 'queued', locale: 'yue',
    }]);
    send(event.sender, 'yuecut:event', { type: 'import-progress', batchId, materialId: mat.id, progress: 100 });
    return mat;
  });

  // ── 分析（粤语 SenseVoice + 规则管线）──
  ipcMain.handle('yuecut:material:analyze', async (event, batchId, materialId) => {
    const batch = await store.getBatch(batchId);
    const mat = batch?.materials?.find((m) => m.id === materialId);
    if (!mat) throw new Error('素材不存在');

    await store.patchMaterial(batchId, materialId, { status: 'analyzing', progress: 5, error: '' });
    send(event.sender, 'yuecut:event', {
      type: 'analyze-progress', batchId, materialId, progress: 8, message: '粤语语音转写（SenseVoice）',
    });

    let transcript;
    try {
      const transcriber = createLocalTranscriber();
      transcript = await transcriber.transcribe({
        inputPath: mat.filePath,
        locale: 'yue',
        engine: 'sensevoice',
        wantWords: true,
      });
    } catch (e) {
      await store.patchMaterial(batchId, materialId, {
        status: 'error', progress: 0,
        error: e && e.message ? e.message : String(e),
      });
      send(event.sender, 'yuecut:event', {
        type: 'analyze-progress', batchId, materialId, status: 'error', progress: 0,
        message: e && e.message ? e.message : String(e),
      });
      throw e;
    }

    send(event.sender, 'yuecut:event', { type: 'analyze-progress', batchId, materialId, progress: 88, message: '规则评分与商品核验' });

    const prods = await products();
    const ruleSet = batch.rules ? normalizeRules(batch.rules) : await rules();
    const result = analyzeMaterial({
      cues: transcript.cues || [],
      duration: mat.duration || transcript.duration || 0,
      products: prods,
      rules: ruleSet,
      signals: null, // 量级优先：全量响度提取耗时，后续按窗提取
    });

    await store.replaceCandidates(batchId, materialId, result.candidates);
    await store.patchMaterial(batchId, materialId, {
      status: 'done',
      progress: 100,
      candidateCount: result.candidates.length,
      asrEngine: transcript.engine || 'sensevoice',
      analyzedAt: new Date().toISOString(),
      error: result.usedFallback ? 'ASR 无有效转写，使用了兜底（无候选）' : '',
    });
    send(event.sender, 'yuecut:event', {
      type: 'analyze-progress', batchId, materialId, status: 'done', progress: 100,
      message: `${result.candidates.length} candidates`,
    });
    return result;
  });

  // ── 导出队列 ──
  ipcMain.handle('yuecut:jobs:add', async (_e, batchId, candidateIds) => {
    const batch = await store.getBatch(batchId);
    if (!batch) throw new Error('批次不存在');
    const exist = new Set(batch.exportJobs.filter((j) => j.status !== 'error').map((j) => j.candidateId));
    const items = (Array.isArray(candidateIds) ? candidateIds : [])
      .filter((id) => !exist.has(id))
      .map((id) => {
        const c = batch.candidates.find((x) => x.id === id);
        return c ? { candidateId: id, materialId: c.materialId, title: c.title } : null;
      })
      .filter(Boolean);
    return store.addExportJobs(batchId, items);
  });

  ipcMain.handle('yuecut:batch:render', async (event, batchId) => {
    const batch = await store.getBatch(batchId);
    if (!batch) throw new Error('批次不存在');
    const s = await settings();
    const ex = s.export || {};
    const width = ex.resolution === '720' ? 720 : 1080;
    const height = ex.resolution === '720' ? 1280 : 1920;
    const baseOut = ex.exportDir || path.join(app.getPath('home'), 'Movies', 'YueCut');
    const outDir = path.join(baseOut, sanitizeSeg(batch.name, 'batch'));

    const todo = batch.exportJobs.filter((j) => j.status === 'queued' || j.status === 'error');
    let doneCount = 0;
    const ffmpeg = ffmpegPath();

    for (let i = 0; i < todo.length; i += 1) {
      const job = todo[i];
      const cand = batch.candidates.find((c) => c.id === job.candidateId);
      const mat = batch.materials.find((m) => m.id === job.materialId);
      if (!cand || !mat) {
        // eslint-disable-next-line no-await-in-loop
        await store.patchExportJob(batchId, job.id, { status: 'error', error: '候选或素材已不存在', finishedAt: new Date().toISOString() });
        continue;
      }
      const seq = batch.exportJobs.filter((j) => j.status === 'done').length + doneCount + 1;
      const fileName = outputFileName({ streamer: batch.streamer || s.activeStreamer || '', title: cand.title, index: seq });
      const baseName = fileName.replace(/\.mp4$/, '');
      const priceText = cand.product
        ? `${cand.packSize > 1 ? `${cand.packSize}支 ` : ''}¥${cand.product.price}`
        : (cand.prices?.[0] ? `¥${cand.prices[0].amount}` : '');
      const hookText = String(cand.quote || cand.title || '').replace(/[「」『』"]/g, '').slice(0, 16);

      send(event.sender, 'yuecut:event', {
        type: 'job-progress', batchId, jobId: job.id, status: 'rendering', progress: 1,
      });
      // eslint-disable-next-line no-await-in-loop
      await store.patchExportJob(batchId, job.id, { status: 'rendering', progress: 1, error: '' });

      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await renderClip({
          ffmpegPath: ffmpeg,
          inputPath: mat.filePath,
          outDir,
          clip: { start: cand.start, end: cand.end },
          cues: (cand.cues || []).map((c) => ({ start: c.start, end: c.end, text: c.text, textZh: cand.transcriptZh })),
          outputName: fileName,
          baseName,
          streamer: batch.streamer || s.activeStreamer || '',
          title: cand.title,
          index: seq,
          settings: {
            width, height, fps: 30,
            videoCodec: ex.codec === 'libx264' ? 'libx264' : 'auto',
            burnSubtitles: ex.burnSubtitles !== false,
            keepSrt: ex.keepSrt !== false,
            subtitleLang: ex.subtitleLang === 'zh' ? 'zh' : 'yue',
            stylePreset: ex.stylePreset === 'simple' ? 'simple' : 'commerce',
            hookText, priceText,
          },
          onProgress: (p) => {
            send(event.sender, 'yuecut:event', {
              type: 'job-progress', batchId, jobId: job.id,
              status: 'rendering', progress: p.progress, message: p.message,
            });
          },
        });
        // eslint-disable-next-line no-await-in-loop
        await store.patchExportJob(batchId, job.id, {
          status: 'done', progress: 100,
          outputPath: r.outputPath, outputName: r.outputName, srtName: r.srtName,
          encoder: r.encoder, duration: r.duration, finishedAt: new Date().toISOString(),
        });
        send(event.sender, 'yuecut:event', {
          type: 'job-progress', batchId, jobId: job.id, status: 'done', progress: 100,
        });
        doneCount += 1;
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        // eslint-disable-next-line no-await-in-loop
        await store.patchExportJob(batchId, job.id, {
          status: 'error', progress: 0, error: msg, finishedAt: new Date().toISOString(),
        });
        send(event.sender, 'yuecut:event', {
          type: 'job-progress', batchId, jobId: job.id, status: 'error', progress: 0, error: msg,
        });
      }
    }
    return { total: todo.length, done: doneCount, outDir };
  });

  // ── 模型 / 引擎 ──
  ipcMain.handle('yuecut:models:status', async () => modelStatus());
  ipcMain.handle('yuecut:models:prepare', async (event, ids) =>
    modelPrepare(ids || ['sensevoice-small'], (p) => send(event.sender, 'local-models:progress', p)));

  let hwCache = null;
  ipcMain.handle('yuecut:engine:info', async () => {
    const bin = ffmpegPath();
    if (hwCache === null && bin) hwCache = await detectHardwareEncoder(bin).catch(() => null);
    return {
      ffmpeg: !!bin,
      hardwareEncoder: hwCache,
      exportDir: path.join(app.getPath('home'), 'Movies', 'YueCut'),
    };
  });

  return { rootDir, store, productStore };
}

module.exports = { registerYuecutIpc };
