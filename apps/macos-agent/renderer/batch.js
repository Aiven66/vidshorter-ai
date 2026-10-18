'use strict';

/* YueCut 粤剪 · AI 批量剪辑工作台（renderer，原生 JS）
 * 所有数据走 window.yuecut IPC（见 preload-batch.js），纯本地，无网络依赖。 */

const api = window.yuecut;

const I18N = {
  zh: {
    'win.workspace': '本地工作区',
    'brand.sub': 'AI 批量剪辑', 'brand.slogan': '让剪辑回到判断本身',
    'batch.internal': '内部验证',
    'step.import': '导入素材', 'step.analyze': 'AI 分析', 'step.confirm': '批量确认', 'step.export': '导出',
    'drawer.rules': '剪切规则',
    'sources.title': '素材源', 'sources.import': '批量导入素材', 'sources.hint': '拖入直播回放 / 原始视频，文件不离开本机',
    'sources.products': '商品库', 'sources.retry': '重试失败', 'sources.drop': '拖入视频文件即可导入',
    'cand.title': 'AI 候选片段',
    'tab.pending': '待确认', 'tab.confirmed': '已确认', 'tab.deferred': '待定',
    'filter.score80': '评分 ≥ 80', 'filter.score90': '评分 ≥ 90', 'filter.allProducts': '全部商品',
    'filter.lowconf': '粤语低置信度', 'filter.conflict': '价格冲突', 'filter.sort': '评分优先',
    'cand.selectAll': '全选当前结果', 'cand.timebase': '时间码基于源素材',
    'cand.selectedSuffix': ' 条已选', 'cand.selected': '已选 ',
    'batch.selected': ' 条已选',
    'batch.confirm': '批量确认', 'batch.queue': '加入导出队列', 'batch.subtitle': '字幕样式', 'batch.reject': '剔除',
    'pv.title': '预览与确认', 'pv.subtitleTrack': '字幕轨', 'pv.localAsr': '本地 SenseVoice 转写',
    'pv.product': '商品与价格', 'pv.transcript': '话术全文', 'pv.locate': '定位原素材',
    'pv.noProduct': '未匹配商品（按规则已保留）', 'pv.sku.linked': 'SKU 已匹配', 'pv.sku.conflict': '价格冲突 · 待定',
    'pv.sku.none': '未匹配到 SKU',
    'decide.confirm': '确认', 'decide.defer': '待定', 'decide.reject': '剔除',
    'export.title': '本地导出队列', 'export.settings': '导出设置',
    'stats.candidates': '本批次候选', 'stats.confirmed': '已确认', 'stats.pending': '待人工判断',
    'sb.localOnly': '素材不离开此 Mac',
    'sb.todayPrefix': '今日已处理', 'sb.todayMid': '条素材 / 产出', 'sb.todaySuffix': '条切片',
    'tag.price': '价格爆点', 'tag.objection': '顾虑解答', 'tag.demo': '效果演示',
    'tag.tutorial': '使用教学', 'tag.talk': '话术',
    'mat.queued': '待处理', 'mat.analyzing': '分析中', 'mat.done': '已完成', 'mat.error': '分析失败',
    'mat.queuePos': '排队', 'mat.candidates': '条候选', 'mat.retry': '重试',
    'empty.pending': '暂无待确认片段\n导入素材并完成 AI 分析后，候选片段会出现在这里',
    'empty.confirmed': '还没有确认的片段\n用快捷键 A 确认当前片段',
    'empty.deferred': '没有待定片段\n价格冲突或转写存疑的片段会进入这里',
    'en.notice': '英文转写：本地词库暂不包含英译能力，离线版本不自动生成英文翻译以免出错。需要英文字幕时，请在导出后交人工翻译 SRT。',
    'toast.imported': '已导入素材（本地引用，未上传）',
    'toast.modelMissing': '粤语转写模型未就绪，请先在引擎面板下载 SenseVoice 模型',
    'toast.analyzing': '正在分析：',
    'toast.analyzed': '分析完成，发现候选片段 ',
    'toast.analyzeFail': '分析失败：',
    'toast.confirmed': '已确认', 'toast.deferred': '已标记待定', 'toast.rejected': '已剔除',
    'toast.batchConfirm': '条已确认', 'toast.batchQueue': '条已加入导出队列',
    'toast.batchReject': '条已剔除', 'toast.undo': '撤销',
    'toast.queuedExist': '所选片段已在导出队列中',
    'toast.rulesSaved': '剪切规则已保存（对新分析生效，可重新分析素材）',
    'toast.productsSaved': '商品库已保存',
    'toast.exportDone': '批量导出完成：',
    'toast.exportFail': '导出失败：',
    'toast.exportEmpty': '导出队列为空',
    'drawer.rules': '剪切规则', 'drawer.export': '导出设置', 'drawer.subtitle': '批量字幕样式',
    'drawer.engine': '本地处理引擎', 'drawer.products': '商品库管理',
    'btn.done': '完成', 'btn.download': '下载模型', 'btn.addProduct': '新增商品', 'btn.save': '保存',
    'btn.chooseDir': '选取', 'btn.retryNow': '重新分析全部素材',
  },
  en: {
    'win.workspace': 'Local workspace',
    'brand.sub': 'Batch AI Clipping', 'brand.slogan': 'Back to judgment itself',
    'batch.internal': 'Internal pilot',
    'step.import': 'Import', 'step.analyze': 'AI analysis', 'step.confirm': 'Review', 'step.export': 'Export',
    'drawer.rules': 'Clip rules',
    'sources.title': 'Sources', 'sources.import': 'Import footage', 'sources.hint': 'Drop live replays / raw videos — files stay on this Mac',
    'sources.products': 'Products', 'sources.retry': 'Retry failed', 'sources.drop': 'Drop video files to import',
    'cand.title': 'AI candidates',
    'tab.pending': 'To review', 'tab.confirmed': 'Confirmed', 'tab.deferred': 'On hold',
    'filter.score80': 'Score ≥ 80', 'filter.score90': 'Score ≥ 90', 'filter.allProducts': 'All products',
    'filter.lowconf': 'Low Cantonese confidence', 'filter.conflict': 'Price conflicts', 'filter.sort': 'Score first',
    'cand.selectAll': 'Select all on screen', 'cand.timebase': 'Timecodes refer to source',
    'cand.selectedSuffix': ' selected', 'cand.selected': 'Selected ',
    'batch.selected': ' selected',
    'batch.confirm': 'Confirm', 'batch.queue': 'Add to export queue', 'batch.subtitle': 'Subtitle style', 'batch.reject': 'Discard',
    'pv.title': 'Preview & decision', 'pv.subtitleTrack': 'Subtitle track', 'pv.localAsr': 'on-device SenseVoice',
    'pv.product': 'Product & price', 'pv.transcript': 'Transcript', 'pv.locate': 'Locate in source',
    'pv.noProduct': 'No product matched (kept by rule)', 'pv.sku.linked': 'SKU matched', 'pv.sku.conflict': 'Price conflict · on hold',
    'pv.sku.none': 'No SKU matched',
    'decide.confirm': 'Confirm', 'decide.defer': 'Hold', 'decide.reject': 'Reject',
    'export.title': 'Local export queue', 'export.settings': 'Export settings',
    'stats.candidates': 'Candidates', 'stats.confirmed': 'Confirmed', 'stats.pending': 'Pending review',
    'sb.localOnly': 'Footage never leaves this Mac',
    'sb.todayPrefix': 'Processed today', 'sb.todayMid': 'videos /', 'sb.todaySuffix': 'clips',
    'tag.price': 'Price burst', 'tag.objection': 'Objection', 'tag.demo': 'Demo',
    'tag.tutorial': 'Tutorial', 'tag.talk': 'Talk',
    'mat.queued': 'Queued', 'mat.analyzing': 'Analyzing', 'mat.done': 'Done', 'mat.error': 'Failed',
    'mat.queuePos': 'position', 'mat.candidates': 'candidates', 'mat.retry': 'Retry',
    'empty.pending': 'Nothing to review yet\nImport footage and run AI analysis to generate candidates',
    'empty.confirmed': 'No confirmed clips yet\nPress A to confirm the current clip',
    'empty.deferred': 'Nothing on hold\nPrice conflicts and uncertain transcripts land here',
    'en.notice': 'English transcript: the offline lexical engine does not translate into English. No machine English subtitles are generated in this offline build to avoid errors; translate the exported SRT manually.',
    'toast.imported': 'Footage imported (local reference only, not uploaded)',
    'toast.modelMissing': 'Cantonese ASR model is not ready. Download SenseVoice in the engine panel first.',
    'toast.analyzing': 'Analyzing: ',
    'toast.analyzed': 'Analysis done, candidates found: ',
    'toast.analyzeFail': 'Analysis failed: ',
    'toast.confirmed': 'Confirmed', 'toast.deferred': 'Marked on hold', 'toast.rejected': 'Rejected',
    'toast.batchConfirm': ' confirmed', 'toast.batchQueue': ' added to export queue',
    'toast.batchReject': ' rejected', 'toast.undo': 'Undo',
    'toast.queuedExist': 'Selected clips are already queued',
    'toast.rulesSaved': 'Rules saved (applies to new analysis; re-analyze existing footage if needed)',
    'toast.productsSaved': 'Product library saved',
    'toast.exportDone': 'Export finished: ',
    'toast.exportFail': 'Export failed: ',
    'toast.exportEmpty': 'Export queue is empty',
    'drawer.rules': 'Clip rules', 'drawer.export': 'Export settings', 'drawer.subtitle': 'Subtitle style',
    'drawer.engine': 'On-device engine', 'drawer.products': 'Product library',
    'btn.done': 'Done', 'btn.download': 'Download model', 'btn.addProduct': 'Add product', 'btn.save': 'Save',
    'btn.chooseDir': 'Choose', 'btn.retryNow': 'Re-analyze all footage',
  },
  yue: {
    'win.workspace': '本機工作區',
    'brand.sub': 'AI 批量剪輯', 'brand.slogan': '令剪輯返返去判斷本身',
    'batch.internal': '內部驗證',
    'step.import': '導入素材', 'step.analyze': 'AI 分析', 'step.confirm': '批量確認', 'step.export': '導出',
    'drawer.rules': '剪切規則',
    'sources.title': '素材源', 'sources.import': '批量導入素材', 'sources.hint': '拖入直播回放 / 原始片，文件唔離開呢部 Mac',
    'sources.products': '商品庫', 'sources.retry': '重試失敗', 'sources.drop': '拖入視頻文件就可以導入',
    'cand.title': 'AI 候選片段',
    'tab.pending': '待確認', 'tab.confirmed': '已確認', 'tab.deferred': '待定',
    'filter.score80': '評分 ≥ 80', 'filter.score90': '評分 ≥ 90', 'filter.allProducts': '全部商品',
    'filter.lowconf': '粵語低置信度', 'filter.conflict': '價格衝突', 'filter.sort': '評分優先',
    'cand.selectAll': '全選當前結果', 'cand.timebase': '時間碼基於源素材',
    'cand.selectedSuffix': ' 條已選', 'cand.selected': '已選 ',
    'batch.selected': ' 條已選',
    'batch.confirm': '批量確認', 'batch.queue': '加入導出隊列', 'batch.subtitle': '字幕樣式', 'batch.reject': '剔除',
    'pv.title': '預覽同確認', 'pv.subtitleTrack': '字幕軌', 'pv.localAsr': '本機 SenseVoice 轉寫',
    'pv.product': '商品同價錢', 'pv.transcript': '話術全文', 'pv.locate': '定位原素材',
    'pv.noProduct': '未匹配商品（按規則保留）', 'pv.sku.linked': 'SKU 已匹配', 'pv.sku.conflict': '價格衝突 · 待定',
    'pv.sku.none': '未匹配到 SKU',
    'decide.confirm': '確認', 'decide.defer': '待定', 'decide.reject': '剔除',
    'export.title': '本機導出隊列', 'export.settings': '導出設置',
    'stats.candidates': '本批次候選', 'stats.confirmed': '已確認', 'stats.pending': '待人工判斷',
    'sb.localOnly': '素材唔離開呢部 Mac',
    'sb.todayPrefix': '今日已處理', 'sb.todayMid': '條素材 / 產出', 'sb.todaySuffix': '條切片',
    'tag.price': '價格爆點', 'tag.objection': '顧慮解答', 'tag.demo': '效果示範',
    'tag.tutorial': '使用教學', 'tag.talk': '話術',
    'mat.queued': '待處理', 'mat.analyzing': '分析緊', 'mat.done': '已完成', 'mat.error': '分析失敗',
    'mat.queuePos': '排隊', 'mat.candidates': '條候選', 'mat.retry': '重試',
    'empty.pending': '暫時冇待確認片段\n導入素材同完成 AI 分析之後，候選片段會出喺呢度',
    'empty.confirmed': '未確認片段\n撳快捷鍵 A 確認當前片段',
    'empty.deferred': '冇待定片段\n價格衝突或者轉寫存疑嘅片段會入呢度',
    'en.notice': '英文轉寫：離線詞庫未包含英譯能力，本機版本唔會自動生成英文翻譯，避免出錯；需要英文字幕請導出 SRT 後人工翻譯。',
    'toast.imported': '已導入素材（本機引用，冇上傳）',
    'toast.modelMissing': '粵語轉寫模型未就緒，請先喺引擎面板下載 SenseVoice 模型',
    'toast.analyzing': '分析緊：',
    'toast.analyzed': '分析完成，發現候選片段 ',
    'toast.analyzeFail': '分析失敗：',
    'toast.confirmed': '已確認', 'toast.deferred': '已標記待定', 'toast.rejected': '已剔除',
    'toast.batchConfirm': '條已確認', 'toast.batchQueue': '條已加入導出隊列',
    'toast.batchReject': '條已剔除', 'toast.undo': '還原',
    'toast.queuedExist': '所選片段已經喺導出隊列',
    'toast.rulesSaved': '剪切規則已保存（對新分析生效，可以重新分析素材）',
    'toast.productsSaved': '商品庫已保存',
    'toast.exportDone': '批量導出完成：',
    'toast.exportFail': '導出失敗：',
    'toast.exportEmpty': '導出隊列係空',
    'drawer.rules': '剪切規則', 'drawer.export': '導出設置', 'drawer.subtitle': '批量字幕樣式',
    'drawer.engine': '本機處理引擎', 'drawer.products': '商品庫管理',
    'btn.done': '完成', 'btn.download': '下載模型', 'btn.addProduct': '新增商品', 'btn.save': '保存',
    'btn.chooseDir': '選取', 'btn.retryNow': '重新分析全部素材',
  },
};

const state = {
  lang: 'zh',
  batch: null,
  products: [],
  rules: null,
  settings: null,
  tab: 'pending',
  minScore: 0,
  productFilter: 'all',
  lowConfOnly: false,
  conflictOnly: false,
  selected: new Set(),
  activeId: null,
  subLang: 'yue',
  analyzing: false,
  modelReady: false,
  undo: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (key) => (I18N[state.lang] && I18N[state.lang][key]) || I18N.zh[key] || key;

function fmtTC(sec) {
  const v = Math.max(0, Number(sec) || 0);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = Math.floor(v % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
let toastTimer;
function notify(text, undoFn) {
  $('#toast-text').textContent = text;
  const undoBtn = $('#toast-undo');
  if (undoFn) {
    state.undo = undoFn;
    undoBtn.hidden = false;
    undoBtn.textContent = t('toast.undo');
  } else {
    state.undo = null;
    undoBtn.hidden = true;
  }
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3600);
}

function materials() { return state.batch?.materials || []; }
function candidates() { return state.batch?.candidates || []; }
function jobs() { return state.batch?.exportJobs || []; }
function matOf(cand) { return materials().find((m) => m.id === cand.materialId); }

function filteredCandidates() {
  return candidates()
    .filter((c) => c.status === state.tab)
    .filter((c) => c.score >= state.minScore)
    .filter((c) => (state.productFilter === 'all' ? true : c.product?.id === state.productFilter))
    .filter((c) => (state.lowConfOnly ? c.needReview : true))
    .filter((c) => (state.conflictOnly ? c.priceStatus === 'conflict' : true))
    .sort((a, b) => b.score - a.score || a.start - b.start);
}

function applyI18n() {
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'zh';
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('#ui-lang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === state.lang));
}

// ── 渲染：素材列表 ──────────────────────────────────────────────────────────

function renderMaterials() {
  const list = $('#sources-list');
  const mats = materials();
  $('#sources-count').textContent = String(mats.length).padStart(2, '0');
  const queuedCount = mats.filter((m) => m.status === 'queued').length;
  list.innerHTML = mats.map((m) => {
    let statusHtml = '';
    if (m.status === 'done') {
      statusHtml = `<span class="primary"><i class="ic-check"></i> ${t('mat.done')}</span><span class="muted">${m.candidateCount || 0} ${t('mat.candidates')}</span>`;
    } else if (m.status === 'analyzing') {
      statusHtml = `<span class="primary">${t('mat.analyzing')} · ${m.progress || 0}%</span><span class="muted">${m.candidateCount || 0} ${t('mat.candidates')}</span>
        <div class="mat-bar"><div style="width:${m.progress || 0}%"></div></div>`;
    } else if (m.status === 'error') {
      statusHtml = `<span class="mat-error"><i class="ic-warning"></i> ${t('mat.error')}</span><button class="mat-retry" data-retry="${m.id}">${t('mat.retry')}</span>`;
    } else {
      statusHtml = `<span class="muted"><i class="ic-clock"></i> ${t('mat.queued')}${queuedCount > 1 ? ` · ${t('mat.queuePos')}` : ''}</span><span>${m.candidateCount || 0} ${t('mat.candidates')}</span>`;
    }
    return `<div class="mat" data-mat="${m.id}">
      <div class="mat-row">
        <div class="mat-ic"><i class="ic-video"></i></div>
        <div style="min-width:0">
          <div class="mat-name" title="${esc(m.fileName)}">${esc(m.fileName)}</div>
          <div class="mat-meta">${fmtTC(m.duration)} · ${fmtSize(m.sizeBytes)}</div>
        </div>
      </div>
      <div class="mat-status">${statusHtml}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-retry]').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); analyzeOne(btn.dataset.retry); });
  });
}

// ── 渲染：候选卡片 ──────────────────────────────────────────────────────────

function renderCandidates() {
  const list = filteredCandidates();
  const all = candidates();
  $('#cand-total').textContent = all.length;
  $('#tab-pending').textContent = all.filter((c) => c.status === 'pending').length;
  $('#tab-confirmed').textContent = all.filter((c) => c.status === 'confirmed').length;
  $('#tab-deferred').textContent = all.filter((c) => c.status === 'deferred').length;
  $('#lowconf-count').textContent = all.filter((c) => c.needReview).length;
  $('#conflict-count').textContent = all.filter((c) => c.priceStatus === 'conflict').length;

  const wrap = $('#cards');
  const empty = $('#cand-empty');
  if (!list.length) {
    wrap.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = t(`empty.${state.tab}`).replace('\n', '<br>');
  } else {
    empty.hidden = true;
    wrap.innerHTML = list.map((c, idx) => {
      const m = matOf(c);
      const sel = state.selected.has(c.id);
      const scoreMid = c.score < 90;
      const quote = c.quote || c.transcriptYue || '';
      const tagCls = c.tag === 'price' ? '' : 'neutral';
      const flags = [];
      if (c.priceStatus === 'conflict') flags.push(`<span class="flag conflict-f">${t('pv.sku.conflict')}</span>`);
      if (c.needReview) flags.push(`<span class="flag low">${t('filter.lowconf')} ${c.stability}%</span>`);
      const product = c.product ? `
        <span class="sku"><i class="ic-cube"></i>${esc(c.product.name)} ${esc(c.product.spec || '')}<em>${esc(c.product.sku || '')}</em></span>
        <strong class="price">¥${c.product.price}<small> / ${esc(c.product.unit)}</small></strong>`
        : '<span class="muted tiny">' + t('pv.sku.none') + '</span>';
      return `<article class="card ${sel ? 'selected' : ''} ${c.id === state.activeId ? 'active' : ''} ${c.priceStatus === 'conflict' ? 'conflict' : ''}" data-id="${c.id}">
        ${c.score >= 90 && c.status === 'pending' ? '<div class="acc"></div>' : ''}
        <div class="card-inner">
          <input class="pick" type="checkbox" ${sel ? 'checked' : ''} data-id="${c.id}" />
          <div class="card-main">
            <div class="card-top">
              <div class="card-title"><span class="rank">#${String(idx + 1).padStart(2, '0')}</span><h3>${esc(c.title)}</h3></div>
              <div class="score ${scoreMid ? 'mid' : ''}"><strong>${c.score}</strong> <span class="muted">分</span></div>
            </div>
            <div class="card-meta">
              <span class="mono">${fmtTC(c.start)} → ${fmtTC(c.end)}</span><span>· ${Math.round(c.duration)}s</span>
              <span class="tag ${tagCls}">${t(`tag.${c.tag}`)}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:7px;flex-wrap:wrap">${product}</div>
            <div class="quote-row">
              <span class="lang-badge">粤</span><p class="quote">「${esc(quote)}」</p>
              <span class="conf ${c.stability >= 85 ? 'ok' : 'warn'}">${c.stability}%${c.stability >= 85 ? ' ✓' : ' ⚠'}</span>
            </div>
            ${flags.length ? `<div class="flag-row">${flags.join('')}</div>` : ''}
            ${c.priceNote ? `<p class="ai-reason" style="color:var(--warn)">${esc(c.priceNote)}</p>` : ''}
            <p class="ai-reason"><i class="ic-wand"></i> ${esc(reasonText(c))}</p>
          </div>
        </div>
      </article>`;
    }).join('');

    wrap.querySelectorAll('article').forEach((art) => {
      art.addEventListener('click', (e) => {
        if (e.target.closest('.pick')) return;
        selectCandidate(art.dataset.id, { autoplay: false });
      });
    });
    wrap.querySelectorAll('.pick').forEach((cb) => {
      cb.addEventListener('change', () => toggleSelected(cb.dataset.id, cb.checked));
    });
  }
  if (list.length && !list.some((c) => c.id === state.activeId)) {
    selectCandidate(list[0].id);
  }
  updateSelectionUI();
  renderStats();
}

function reasonText(c) {
  const parts = [];
  if (c.dimensions.hook >= 70) parts.push(state.lang === 'zh' ? '开场钩子明确' : state.lang === 'en' ? 'Strong opening hook' : '開場钩子明確');
  if (c.priceStatus === 'matched') parts.push(state.lang === 'zh' ? '报价与商品库一致' : state.lang === 'en' ? 'Price matches library' : '報價同商品庫一致');
  if (c.tags.includes('demo')) parts.push(state.lang === 'zh' ? '含现场演示' : state.lang === 'en' ? 'Includes demo' : '有現場示範');
  if (c.tags.includes('objection')) parts.push(state.lang === 'zh' ? '回应购买顾虑' : state.lang === 'en' ? 'Handles objection' : '回應購買顧慮');
  if (c.dimensions.complete >= 80) parts.push(state.lang === 'zh' ? '成交引导完整' : state.lang === 'en' ? 'Full call-to-action' : '成交引導完整');
  return parts.slice(0, 3).join(' · ');
}

function updateSelectionUI() {
  const list = filteredCandidates();
  const n = state.selected.size;
  $('#batch-count').textContent = n;
  $('#selection-label').textContent = n ? `${t('cand.selected')}${n}` : '';
  $('#batch-bar').hidden = n === 0;
  const visibleIds = new Set(list.map((c) => c.id));
  const picked = [...state.selected].filter((id) => visibleIds.has(id)).length;
  $('#select-all').checked = list.length > 0 && picked === list.length;
  $('#select-all').indeterminate = picked > 0 && picked < list.length;
}

function toggleSelected(id, on) {
  if (on) state.selected.add(id); else state.selected.delete(id);
  updateSelectionUI();
  const el = document.querySelector(`.card[data-id="${id}"]`);
  if (el) el.classList.toggle('selected', on);
}

// ── 渲染：右侧预览 ──────────────────────────────────────────────────────────

const video = $('#pv-video');
let segEnd = null;

function selectCandidate(id, opts = {}) {
  const c = candidates().find((x) => x.id === id);
  if (!c) return;
  state.activeId = id;
  const m = matOf(c);
  $('#pv-rank').innerHTML = `#${String(c.rank).padStart(2, '0')} <span class="primary">${t(`tab.${c.status === 'pending' ? 'pending' : c.status === 'confirmed' ? 'confirmed' : 'deferred'}`)}</span>`;
  if (m?.mediaUrl) {
    if (video.dataset.src !== m.mediaUrl) {
      video.src = m.mediaUrl;
      video.dataset.src = m.mediaUrl;
    }
    video.currentTime = c.start;
    segEnd = c.end;
    video.pause();
  }
  // 烧录字幕预览
  const hook = (c.quote || c.transcriptYue || '').replace(/[「」『』"]/g, '');
  $('#pv-burn-hook').textContent = hook.slice(0, 14);
  $('#pv-burn-price').textContent = c.product
    ? `${c.packSize > 1 ? `${c.packSize}${state.lang === 'en' ? 'pcs ' : '支 '}` : ''}¥${c.product.price}`
    : (c.prices[0] ? `¥${c.prices[0].amount}` : '');
  $('#pv-streamer').textContent = `${state.settings?.activeStreamer || ''} · ${esc(m?.fileName || '')}`;
  $('#pv-cur').textContent = fmtTC(0);
  $('#pv-dur').textContent = fmtTC(c.duration);
  $('#pv-tc-source').textContent = `${fmtTC(c.start)} → ${fmtTC(c.end)}`;
  // 字幕轨
  $('#sub-track').innerHTML = (c.cues || []).map((cu) =>
    `<span class="sub-seg" data-start="${cu.start}">${esc(cu.text.slice(0, 10))}</span>`).join('');
  $('#sub-stability').textContent = `${t('filter.lowconf').replace('粤语', '')} ${c.stability}%`;
  $('#sub-stability').className = c.stability >= 85 ? 'primary' : 'warn';
  // 商品
  const sku = $('#pv-sku-state');
  if (!c.product) {
    sku.textContent = t('pv.sku.none');
    sku.className = 'tiny muted';
    $('#pv-product').innerHTML = `<p class="tiny">${t('pv.noProduct')}</p>`;
  } else {
    sku.textContent = c.priceStatus === 'conflict' ? t('pv.sku.conflict') : t('pv.sku.linked');
    sku.className = c.priceStatus === 'conflict' ? 'tiny' : 'tiny primary';
    $('#pv-product').innerHTML = `
      <div><p class="pname">${esc(c.product.name)} ${esc(c.product.spec || '')}</p>
      <p class="pmeta">${esc(c.product.sku || '')} · ${esc(c.product.unit)}</p></div>
      <span class="pprice">¥${c.product.price}</span>`;
  }
  renderTranscript(c);
  // 维度条
  const d = c.dimensions;
  const dims = [
    [state.lang === 'zh' ? '开场吸引力' : state.lang === 'en' ? 'Hook' : '開場吸引力', d.hook],
    [state.lang === 'zh' ? '价格清晰度' : state.lang === 'en' ? 'Price clarity' : '價格清晰度', d.price],
    [state.lang === 'zh' ? '语义完整度' : state.lang === 'en' ? 'Completeness' : '語義完整度', d.complete],
  ];
  $('#pv-dims').innerHTML = dims.map(([label, val]) => `
    <div class="dim ${val >= 85 ? 'strong' : ''}">
      <div class="tiny"><span>${label}</span><span>${val}</span></div>
      <div class="dim-bar"><div class="dim-fill" style="width:${val}%"></div></div>
    </div>`).join('');
  renderCandidates();
  if (opts.autoplay) video.play().catch(() => {});
}

function renderTranscript(c) {
  const el = $('#pv-transcript');
  const notice = $('#en-notice');
  if (state.subLang === 'yue') {
    el.textContent = `「${c.transcriptYue || ''}」`;
    notice.hidden = true;
  } else if (state.subLang === 'zh') {
    el.textContent = `「${c.transcriptZh || ''}」`;
    notice.hidden = true;
  } else {
    el.textContent = '';
    notice.textContent = t('en.notice');
    notice.hidden = false;
  }
}

video.addEventListener('timeupdate', () => {
  const c = candidates().find((x) => x.id === state.activeId);
  if (!c) return;
  const into = video.currentTime - c.start;
  const pct = Math.max(0, Math.min(100, (into / c.duration) * 100));
  $('#pv-progress-fill').style.width = `${pct}%`;
  $('#pv-progress-knob').style.left = `${pct}%`;
  $('#pv-cur').textContent = fmtTC(Math.max(0, into));
  $$('#sub-track .sub-seg').forEach((s) => {
    const cs = Number(s.dataset.start);
    s.classList.toggle('hot', video.currentTime >= cs && video.currentTime <= cs + 6);
  });
  if (segEnd != null && video.currentTime >= segEnd) {
    video.pause();
    video.currentTime = c.start;
  }
});
$('#pv-progress').addEventListener('click', (e) => {
  const c = candidates().find((x) => x.id === state.activeId);
  if (!c) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  video.currentTime = c.start + ratio * c.duration;
});
$$('#pv-play, #pv-play-btn2').forEach((b) => b.addEventListener('click', () => {
  if (!video.src) return;
  if (video.paused) video.play().catch(() => {}); else video.pause();
}));
$('#pv-locate').addEventListener('click', () => {
  const c = candidates().find((x) => x.id === state.activeId);
  if (c) { video.currentTime = c.start; video.pause(); }
});

// ── 决策 ────────────────────────────────────────────────────────────────────

async function decide(status, idsArg) {
  const ids = idsArg || (state.activeId ? [state.activeId] : []);
  if (!ids.length) return;
  const prev = ids.map((id) => ({ id, status: candidates().find((c) => c.id === id)?.status }));
  await Promise.all(ids.map((id) => api.setDecision(state.batch.id, id, status)));
  const b = await api.getBatch(state.batch.id);
  state.batch = b;
  ids.forEach((id) => state.selected.delete(id));
  renderCandidates();
  renderMaterials();
  renderJobs();
  // 当前预览项离开当前列表时，自动跳到当前筛选结果的下一条
  const remain = filteredCandidates();
  if (!remain.some((c) => c.id === state.activeId) && remain.length) selectCandidate(remain[0].id);
  if (!idsArg) notify(`${t(`toast.${status === 'confirmed' ? 'confirmed' : status === 'deferred' ? 'deferred' : 'rejected'}`)} #${shortRank(ids[0])}`, async () => {
    await Promise.all(prev.map((p) => p.status && api.setDecision(state.batch.id, p.id, p.status)));
    state.batch = await api.getBatch(state.batch.id);
    renderCandidates(); renderMaterials(); renderJobs();
  });
}
function shortRank(id) {
  const c = candidates().find((x) => x.id === id);
  return c ? String(c.rank).padStart(2, '0') : '';
}

$('#btn-decide-confirm').addEventListener('click', () => decide('confirmed'));
$('#btn-decide-defer').addEventListener('click', () => decide('deferred'));
$('#btn-decide-reject').addEventListener('click', () => decide('rejected'));

// ── 队列 / 导出 ─────────────────────────────────────────────────────────────

function renderStats() {
  const cs = candidates();
  $('#stat-candidates').innerHTML = `${cs.length} <small>${state.lang === 'en' ? '' : '条'}</small>`;
  $('#stat-confirmed').innerHTML = `${cs.filter((c) => c.status === 'confirmed').length} <small>条</small>`;
  $('#stat-pending').innerHTML = `${cs.filter((c) => c.status === 'pending').length} <small>条</small>`;
}

function renderJobs() {
  const js = jobs();
  $('#export-count').textContent = js.length;
  const rendering = js.filter((j) => j.status === 'rendering').length;
  const queued = js.filter((j) => j.status === 'queued').length;
  const done = js.filter((j) => j.status === 'done').length;
  $('#export-sum').textContent = [rendering && `${rendering} 渲染中`, queued && `${queued} 排队中`, done && `${done} 已完成`].filter(Boolean).join(' · ');
  $('#export-all-label').textContent = `${state.lang === 'en' ? 'Export' : '批量导出'} (${queued + rendering || js.length})`;
  $('#jobs').innerHTML = js.slice(0, 3).map((j, i) => {
    if (j.status === 'done') {
      return `<div class="job done"><i class="ic-check primary"></i><div class="job-body">
        <div class="jname"><span>${esc(j.outputName || j.title)}</span><span>✓</span></div>
        <p class="tiny" style="margin-top:3px">${j.encoder ? `硬件编码 · ${Math.round(j.duration)}s` : `${Math.round(j.duration)}s`}</p></div></div>`;
    }
    if (j.status === 'error') {
      return `<div class="job error"><i class="ic-warning"></i><div class="job-body">
        <div class="jname"><span>${esc(j.title)}</span></div><p class="tiny" style="margin-top:3px">${esc((j.error || '').slice(0, 60))}</p></div></div>`;
    }
    const pct = j.status === 'rendering' ? j.progress : 0;
    return `<div class="job">${j.status === 'rendering' ? '<i class="ic-film primary"></i>' : `<span class="jnum">${String(i + 1).padStart(2, '0')}</span>`}
      <div class="job-body"><div class="jname"><span>${esc(j.title)}.mp4</span><span class="${j.status === 'rendering' ? 'primary' : 'muted'}">${pct}%</span></div>
      <div class="jbar"><div class="jfill" style="width:${pct}%"></div></div></div></div>`;
  }).join('');
}

async function addSelectedToQueue() {
  const ids = [...state.selected];
  if (!ids.length) return;
  const exist = new Set(jobs().map((j) => j.candidateId));
  const fresh = ids.filter((id) => !exist.has(id));
  if (!fresh.length) { notify(t('toast.queuedExist')); return; }
  await api.addExportJobs(state.batch.id, fresh);
  state.batch = await api.getBatch(state.batch.id);
  renderJobs();
  notify(`${fresh.length}${t('toast.batchQueue')}`);
}

$('#btn-batch-confirm').addEventListener('click', () => decide('confirmed', [...state.selected]));
$('#btn-batch-queue').addEventListener('click', addSelectedToQueue);
$('#btn-batch-reject').addEventListener('click', () => decide('rejected', [...state.selected]));
$('#btn-batch-subtitle').addEventListener('click', () => openDrawer('subtitle'));

$('#btn-export-all').addEventListener('click', async () => {
  const pending = jobs().filter((j) => j.status === 'queued' || j.status === 'error');
  if (!pending.length) { notify(t('toast.exportEmpty')); return; }
  try {
    await api.renderBatch(state.batch.id);
    state.batch = await api.getBatch(state.batch.id);
    renderJobs();
    const okN = jobs().filter((j) => j.status === 'done').length;
    notify(`${t('toast.exportDone')} ${okN}`);
    refreshToday();
  } catch (e) {
    notify(t('toast.exportFail') + (e.message || e));
  }
});

// ── 导入 / 分析 ─────────────────────────────────────────────────────────────

async function importPaths(paths) {
  const valid = paths.filter(Boolean);
  if (!valid.length) return;
  for (const p of valid) {
    const fileName = p.split(/[/\\]/).pop();
    const size = await api.statFile(p).catch(() => 0);
    const mats = await api.importMaterial(state.batch.id, { filePath: p, fileName, sizeBytes: size });
    void mats;
  }
  state.batch = await api.getBatch(state.batch.id);
  renderMaterials();
  notify(`${valid.length} · ${t('toast.imported')}`);
  pumpQueue();
}

async function analyzeOne(materialId) {
  if (!state.modelReady) {
    notify(t('toast.modelMissing'));
    openDrawer('engine');
    return;
  }
  await api.patchMaterial(state.batch.id, materialId, { status: 'analyzing', progress: 2, error: '' });
  state.batch = await api.getBatch(state.batch.id);
  renderMaterials();
  try {
    await api.analyze(state.batch.id, materialId);
    state.batch = await api.getBatch(state.batch.id);
    renderMaterials(); renderCandidates();
    if (!state.activeId && candidates().length) selectCandidate(candidates()[0].id);
    refreshToday();
  } catch (e) {
    state.batch = await api.getBatch(state.batch.id);
    renderMaterials();
    notify(t('toast.analyzeFail') + (e.message || e));
  }
}

async function pumpQueue() {
  if (state.analyzing) return;
  state.analyzing = true;
  try {
    let next = materials().find((m) => m.status === 'queued');
    while (next) {
      if (!state.modelReady) {
        notify(t('toast.modelMissing'));
        openDrawer('engine');
        break;
      }
      notify(t('toast.analyzing') + next.fileName);
      // eslint-disable-next-line no-await-in-loop
      await analyzeOne(next.id);
      state.batch = await api.getBatch(state.batch.id);
      // eslint-disable-next-line no-await-in-loop
      next = materials().find((m) => m.status === 'queued');
    }
  } finally {
    state.analyzing = false;
  }
}

$('#btn-import').addEventListener('click', () => $('#files').click());
$('#files').addEventListener('change', async (e) => {
  const paths = [...e.target.files].map((f) => api.pathForFile(f)).filter(Boolean);
  await importPaths(paths);
  e.target.value = '';
});
$('#btn-retry-all').addEventListener('click', () => {
  materials().filter((m) => m.status === 'error').forEach((m) => analyzeOne(m.id));
});

// 拖拽
const sourcesEl = document.querySelector('.sources');
['dragenter', 'dragover'].forEach((ev) => sourcesEl.addEventListener(ev, (e) => {
  e.preventDefault(); sourcesEl.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((ev) => sourcesEl.addEventListener(ev, (e) => {
  e.preventDefault();
  if (ev === 'dragleave' && sourcesEl.contains(e.relatedTarget)) return;
  sourcesEl.classList.remove('dragging');
}));
sourcesEl.addEventListener('drop', async (e) => {
  const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  await importPaths(paths);
});

// ── tabs / filters / select-all ─────────────────────────────────────────────

$$('#cand-tabs button').forEach((b) => b.addEventListener('click', () => {
  state.tab = b.dataset.tab;
  $$('#cand-tabs button').forEach((x) => x.classList.toggle('active', x === b));
  renderCandidates();
  const first = filteredCandidates()[0];
  if (first && !filteredCandidates().some((c) => c.id === state.activeId)) selectCandidate(first.id);
}));
$('#score-filter').addEventListener('change', (e) => { state.minScore = Number(e.target.value); renderCandidates(); });
$('#product-filter').addEventListener('change', (e) => { state.productFilter = e.target.value; renderCandidates(); });
$('#btn-low-confidence').addEventListener('click', (e) => {
  state.lowConfOnly = !state.lowConfOnly;
  e.currentTarget.style.borderColor = state.lowConfOnly ? 'rgba(212,183,130,.6)' : '';
  renderCandidates();
});
$('#btn-conflict-only').addEventListener('click', (e) => {
  state.conflictOnly = !state.conflictOnly;
  e.currentTarget.style.borderColor = state.conflictOnly ? 'rgba(223,157,145,.6)' : '';
  renderCandidates();
});
$('#select-all').addEventListener('change', (e) => {
  filteredCandidates().forEach((c) => toggleSelected(c.id, e.target.checked));
  renderCandidates();
});

// 字幕语言
$$('#sub-lang button').forEach((b) => b.addEventListener('click', () => {
  state.subLang = b.dataset.lang;
  $$('#sub-lang button').forEach((x) => x.classList.toggle('active', x === b));
  const c = candidates().find((x) => x.id === state.activeId);
  if (c) renderTranscript(c);
}));
// UI 语言
$$('#ui-lang button').forEach((b) => b.addEventListener('click', async () => {
  state.lang = b.dataset.lang;
  await api.saveSettings({ locale: state.lang });
  applyI18n(); renderCandidates(); renderMaterials(); renderJobs(); renderProductFilter();
  const c = candidates().find((x) => x.id === state.activeId);
  if (c) selectCandidate(c.id);
}));

// 快捷键：A 确认 / S 待定 / D 剔除 / ⌘I 导入 / ⌘↵ 导出
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if ($('#overlay').hidden === false) { if (e.key === 'Escape') closeDrawer(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); $('#files').click(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); $('#btn-export-all').click(); return; }
  const map = { a: 'confirmed', s: 'deferred', d: 'rejected' };
  const status = map[e.key.toLowerCase()];
  if (status) decide(status);
});
$('#toast-undo').addEventListener('click', async () => {
  if (state.undo) { await state.undo(); state.undo = null; $('#toast').hidden = true; }
});

// ── 抽屉 ────────────────────────────────────────────────────────────────────

function openDrawer(type) {
  $('#drawer-title').textContent = t(`drawer.${type}`);
  $('#drawer-content').innerHTML = '';
  $('#drawer-foot').innerHTML = '';
  if (type === 'rules') renderRulesDrawer();
  if (type === 'export') renderExportDrawer();
  if (type === 'subtitle') renderSubtitleDrawer();
  if (type === 'engine') renderEngineDrawer();
  if (type === 'products') renderProductsDrawer();
  $('#overlay').hidden = false;
}
function closeDrawer() { $('#overlay').hidden = true; }
$('#drawer-close').addEventListener('click', closeDrawer);
$('#overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeDrawer(); });
$('#rules-open').addEventListener('click', () => openDrawer('rules'));
$('#cand-rules-link').addEventListener('click', () => openDrawer('rules'));
$('#export-open').addEventListener('click', () => openDrawer('export'));
$('#engine-open').addEventListener('click', () => openDrawer('engine'));
$('#products-open').addEventListener('click', () => openDrawer('products'));

function renderRulesDrawer() {
  const p = state.rules.prefs;
  $('#drawer-content').innerHTML = `
    <span class="pill primary">${esc(state.rules.name)} / v${esc(state.rules.version)}</span>
    <p class="tiny" style="margin:12px 0 18px;line-height:1.8">${state.lang === 'en'
      ? 'Shared team rules for this batch. Changes apply to new analysis runs.'
      : '本批次统一应用的团队规则，修改后对新分析生效。'}</p>
    <div class="dcard"><b>01 · ${state.lang === 'en' ? 'Keep complete selling flow' : '保留完整成交话术'}</b>
      <p>${state.lang === 'en' ? 'Product intro → price → call-to-action. Clip length:' : '商品介绍 → 价格权益 → 下单引导。片段长度区间（秒）：'}</p>
      <div class="drow" style="margin-top:8px">
        <input class="dinput" id="r-min" type="number" value="${p.minLen}" min="8" max="120" />
        <input class="dinput" id="r-max" type="number" value="${p.maxLen}" min="15" max="300" />
      </div></div>
    <div class="dcard"><b>02 · ${state.lang === 'en' ? 'Target score threshold' : '推荐转化分阈值'}</b>
      <p><input class="dinput" id="r-score" type="number" value="${p.minScore}" min="0" max="100" style="margin-top:6px" /></p></div>
    <div class="dcard"><b>03 · ${state.lang === 'en' ? 'Cantonese review flag' : '粤语转写待复核阈值'}</b>
      <p><input class="dinput" id="r-stab" type="number" value="${p.flagStabilityBelow}" min="0" max="100" style="margin-top:6px" /></p></div>
    <label class="dcheck"><input type="checkbox" id="r-product" ${p.requireProduct ? 'checked' : ''} />${state.lang === 'en' ? 'Require product match (drop chatter)' : '必须匹配商品库 SKU（剔除无商品指向的闲聊）'}</label>
    <label class="dcheck"><input type="checkbox" id="r-cta" ${p.preferCta ? 'checked' : ''} />${state.lang === 'en' ? 'Prefer clips with call-to-action' : '优先保留下单引导完整的片段'}</label>
    <button class="tool" id="r-reanalyze" style="width:100%;justify-content:center;margin-top:6px">${t('btn.retryNow')}</button>`;
  $('#drawer-foot').innerHTML = `<button class="btn-primary" id="r-save">${t('btn.done')}</button>`;
  $('#r-save').addEventListener('click', async () => {
    state.rules = {
      ...state.rules,
      prefs: {
        ...p,
        minLen: Number($('#r-min').value) || p.minLen,
        maxLen: Number($('#r-max').value) || p.maxLen,
        minScore: Number($('#r-score').value) || 0,
        flagStabilityBelow: Number($('#r-stab').value) || 0,
        requireProduct: $('#r-product').checked,
        preferCta: $('#r-cta').checked,
      },
    };
    await api.rulesSave(state.rules);
    await api.patchBatch(state.batch.id, { rulesVersion: state.rules.version, rules: state.rules });
    $('#rules-ver').textContent = `v${state.rules.version}`;
    notify(t('toast.rulesSaved'));
    closeDrawer();
  });
  $('#r-reanalyze').addEventListener('click', async () => {
    $('#r-save').click();
    const done = materials().filter((m) => m.status === 'done' || m.status === 'error');
    for (const m of done) {
      // eslint-disable-next-line no-await-in-loop
      await api.patchMaterial(state.batch.id, m.id, { status: 'queued', progress: 0, error: '', candidateCount: 0 });
    }
    state.batch = await api.getBatch(state.batch.id);
    renderMaterials();
    pumpQueue();
  });
}

function renderExportDrawer() {
  const s = state.settings.export || {};
  $('#drawer-content').innerHTML = `
    <label class="dlabel">${state.lang === 'en' ? 'Resolution' : '视频规格'}</label>
    <select class="dselect" id="e-res">
      <option value="1080" ${s.resolution !== '720' ? 'selected' : ''}>1080 × 1920 · 9:16</option>
      <option value="720" ${s.resolution === '720' ? 'selected' : ''}>720 × 1280 · 9:16</option>
    </select>
    <label class="dlabel">${state.lang === 'en' ? 'Codec' : '编码'}</label>
    <select class="dselect" id="e-codec">
      <option value="auto" ${s.codec !== 'libx264' ? 'selected' : ''}>H.264 · VideoToolbox 硬件编码（不可用时自动回落 x264）</option>
      <option value="libx264" ${s.codec === 'libx264' ? 'selected' : ''}>H.264 · libx264 软件编码</option>
    </select>
    <label class="dcheck"><input type="checkbox" id="e-burn" ${s.burnSubtitles !== false ? 'checked' : ''} />${state.lang === 'en' ? 'Burn subtitles into video' : '烧录字幕到画面'}</label>
    <label class="dcheck"><input type="checkbox" id="e-srt" ${s.keepSrt !== false ? 'checked' : ''} />${state.lang === 'en' ? 'Also export SRT sidecar' : '同时导出 SRT 字幕文件'}</label>
    <label class="dlabel">${state.lang === 'en' ? 'Subtitle language' : '字幕语言'}</label>
    <select class="dselect" id="e-lang">
      <option value="yue" ${s.subtitleLang !== 'zh' ? 'selected' : ''}>粤语 · 保留原口吻</option>
      <option value="zh" ${s.subtitleLang === 'zh' ? 'selected' : ''}>中文 · 本地词库转换</option>
    </select>
    <label class="dlabel">${state.lang === 'en' ? 'Save location' : '保存位置'}</label>
    <div class="dpath"><input class="dinput" id="e-dir" value="${esc(s.exportDir || '')}" readonly /><button class="tool" id="e-pick">${t('btn.chooseDir')}</button></div>
    <div class="dcard" style="margin-top:14px"><p>${state.lang === 'en'
      ? 'File name: streamer_topic_index.mp4 — exported clips are reviewed manually; nothing is auto-published.'
      : '文件命名：主播_话术主题_序号.mp4；导出后由人工审核发布，不自动分发账号。'}</p></div>`;
  $('#e-pick').addEventListener('click', async () => {
    const dir = await api.pickDirectory();
    if (dir) $('#e-dir').value = dir;
  });
  $('#drawer-foot').innerHTML = `<button class="btn-primary" id="e-save">${t('btn.done')}</button>`;
  $('#e-save').addEventListener('click', async () => {
    state.settings.export = {
      resolution: $('#e-res').value,
      codec: $('#e-codec').value,
      burnSubtitles: $('#e-burn').checked,
      keepSrt: $('#e-srt').checked,
      subtitleLang: $('#e-lang').value,
      exportDir: $('#e-dir').value,
    };
    await api.saveSettings({ export: state.settings.export });
    $('#export-spec').textContent = `H.264 / ${state.settings.export.resolution === '720' ? '720 × 1280' : '1080 × 1920'} / 30 fps`;
    closeDrawer();
  });
}

function renderSubtitleDrawer() {
  const s = state.settings.export || {};
  $('#drawer-content').innerHTML = `
    <p class="tiny" style="margin-bottom:16px">${state.lang === 'en' ? 'Applied to checked clips — raw transcript is never modified.' : '应用于勾选片段，不改动原始转写。'}</p>
    <div class="preset-preview"><p class="pp-hook">唔係一支啊，係兩支！</p><p class="pp-price">两支到手 ¥129</p></div>
    <label class="dlabel">${state.lang === 'en' ? 'Style preset' : '样式预设'}</label>
    <select class="dselect" id="s-preset">
      <option value="commerce" ${s.stylePreset !== 'simple' ? 'selected' : ''}>${state.lang === 'en' ? 'High contrast: white text / lime price' : '带货高对比 · 白字 / 柠绿价格'}</option>
      <option value="simple" ${s.stylePreset === 'simple' ? 'selected' : ''}>${state.lang === 'en' ? 'Simple white text with black outline' : '简洁白字 · 黑色描边'}</option>
    </select>
    <p class="tiny" style="line-height:1.9;margin-top:14px">${state.lang === 'en'
      ? 'Bottom safe area 15% · max 14 characters per line · price highlighted from SKU match.'
      : '底部安全区 15% · 每行最多 14 字 · 价格按 SKU 匹配结果突出显示。'}</p>`;
  $('#drawer-foot').innerHTML = `<button class="btn-primary" id="s-save">${t('btn.done')}</button>`;
  $('#s-save').addEventListener('click', async () => {
    state.settings.export = { ...(state.settings.export || {}), stylePreset: $('#s-preset').value };
    await api.saveSettings({ export: state.settings.export });
    closeDrawer();
  });
}

async function renderEngineDrawer() {
  $('#drawer-content').innerHTML = `<p class="tiny">…</p>`;
  const [status, info] = await Promise.all([api.modelsStatus(), api.engineInfo()]);
  const sense = (status.models || []).find((m) => m.id === 'sensevoice-small') || status.sensevoice || null;
  const ready = !!(sense && (sense.ready || sense.prepared || sense.exists));
  state.modelReady = ready;
  const dot = $('#engine-dot');
  dot.classList.toggle('off', !ready);
  $('#engine-label').textContent = ready
    ? (state.lang === 'en' ? 'Engine ready' : '本地引擎就绪')
    : (state.lang === 'en' ? 'ASR model needed' : '粤语模型待下载');
  $('#sb-engine').textContent = info.hardwareEncoder
    ? `VideoToolbox 硬件编码可用 · ffmpeg ${info.ffmpegVersion || ''}`.trim()
    : '硬件编码不可用 · 将使用 x264';
  $('#drawer-content').innerHTML = `
    <span class="pill ${ready ? 'primary' : ''}">${ready ? '● ' + (state.lang === 'en' ? 'Ready · offline' : '引擎就绪 · 离线可用') : '○ ' + (state.lang === 'en' ? 'Model download required (one-time)' : '需一次性下载模型')}</span>
    <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
      <div class="dcard engine-line"><span>SenseVoice Small · ${state.lang === 'en' ? 'Cantonese / zh / en ASR' : '粤语 / 中 / 英 语音转写'}</span><span class="${ready ? 'ok' : 'bad'}">${ready ? (state.lang === 'en' ? 'ready' : '已就绪') : (state.lang === 'en' ? 'not ready' : '未就绪')}</span></div>
      <div class="dcard engine-line"><span>${state.lang === 'en' ? 'Product library' : '商品库 / 话术词库'}</span><span class="ok">${state.products.length} SKU</span></div>
      <div class="dcard engine-line"><span>${state.lang === 'en' ? 'Hardware encoder' : '视频渲染 / 硬件编码'}</span><span class="${info.hardwareEncoder ? 'ok' : 'bad'}">${info.hardwareEncoder ? 'VideoToolbox' : (state.lang === 'en' ? 'x264 fallback' : 'x264 软件回落')}</span></div>
    </div>
    ${ready ? '' : `<button class="btn-primary dl-btn" id="m-download"><i class="ic-download"></i>${t('btn.download')} SenseVoice${state.lang === 'en' ? ' (≈ 470 MB)' : '（约 470 MB）'}</button>
      <div class="dprog" id="m-prog" hidden><div style="width:0%"></div></div><p class="tiny" id="m-msg" style="margin-top:8px"></p>`}
    <p class="tiny" style="line-height:1.9;margin-top:16px">${state.lang === 'en'
      ? 'All transcription and rendering runs on this device. Footage is never uploaded; no foundation-model API is used.'
      : '所有转写与渲染均在此设备执行，素材不上传云端，不依赖基座模型 API。'}</p>`;
  const dl = $('#m-download');
  if (dl) dl.addEventListener('click', async () => {
    dl.disabled = true;
    const bar = $('#m-prog');
    bar.hidden = false;
    try {
      await api.modelsPrepare((p) => {
        const pct = Math.round((p.pct ?? p.progress ?? 0) * 100);
        bar.firstElementChild.style.width = `${pct}%`;
        $('#m-msg').textContent = p.stage || p.message || '';
      });
      state.modelReady = true;
      closeDrawer();
      pumpQueue();
    } catch (e) {
      $('#m-msg').textContent = String(e.message || e);
      dl.disabled = false;
    }
  });
}

function renderProductFilter() {
  const sel = $('#product-filter');
  const cur = state.productFilter;
  sel.innerHTML = `<option value="all">${t('filter.allProducts')}</option>` +
    state.products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  sel.value = cur || 'all';
}

async function renderProductsDrawer() {
  $('#drawer-content').innerHTML = `
    <p class="tiny" style="margin-bottom:12px;line-height:1.8">${state.lang === 'en'
      ? 'Local SKU library used to match talk tracks and cross-check spoken prices. Conflicts move clips to “on hold”.'
      : '本地 SKU 库用于匹配话术、交叉核验口播价格；价格冲突的片段自动转「待定」。'}</p>
    <table class="ptable">
      <thead><tr><th>${state.lang === 'en' ? 'Name' : '商品名'}</th><th>SKU</th><th>${state.lang === 'en' ? 'Spec' : '规格'}</th><th>${state.lang === 'en' ? 'Price ¥' : '价格 ¥'}</th><th>${state.lang === 'en' ? 'Aliases (comma)' : '别名（逗号分隔）'}</th><th></th></tr></thead>
      <tbody id="p-body"></tbody>
    </table>
    <button class="tool" id="p-add" style="margin-top:12px;width:100%;justify-content:center"><i class="ic-plus"></i>${t('btn.addProduct')}</button>`;
  const body = $('#p-body');
  const row = (p) => `<tr data-id="${esc(p.id)}">
    <td><input data-k="name" value="${esc(p.name)}"></td>
    <td><input data-k="sku" value="${esc(p.sku)}"></td>
    <td><input data-k="spec" value="${esc(p.spec)}"></td>
    <td><input data-k="price" type="number" step="0.1" value="${p.price}"></td>
    <td><input data-k="aliases" value="${esc((p.aliases || []).join(','))}"></td>
    <td><button class="p-del" data-del="${esc(p.id)}"><i class="ic-trash"></i></button></td>
  </tr>`;
  const draw = () => {
    body.innerHTML = state.products.map(row).join('') + row({ id: '', name: '', sku: '', spec: '', price: '', aliases: [] });
  };
  draw();
  $('#p-add').addEventListener('click', () => {
    state.products.push({ id: `p_${Date.now().toString(36)}`, name: '', sku: '', spec: '', price: 0, unit: '件', aliases: [], active: true });
    draw();
  });
  body.addEventListener('input', (e) => {
    const tr = e.target.closest('tr');
    const id = tr?.dataset.id;
    const k = e.target.dataset.k;
    if (!id || !k) {
      // 末行（新行）：给个临时 id 进入内存列表
      if (tr && !tr.dataset.id) {
        tr.dataset.id = `p_${Date.now().toString(36)}`;
        state.products.push({ id: tr.dataset.id, name: '', sku: '', spec: '', price: 0, unit: '件', aliases: [], active: true });
      }
      return;
    }
    const p = state.products.find((x) => x.id === id);
    if (!p) return;
    p[k] = k === 'price' ? Number(e.target.value) : k === 'aliases' ? e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : e.target.value;
  });
  body.addEventListener('click', async (e) => {
    const id = e.target.closest('[data-del]')?.dataset.del;
    if (!id) return;
    state.products = state.products.filter((p) => p.id !== id);
    await api.productRemove(id).catch(() => {});
    draw();
  });
  $('#drawer-foot').innerHTML = `<button class="btn-primary" id="p-save">${t('btn.save')}</button>`;
  $('#p-save').addEventListener('click', async () => {
    const rows = [...body.querySelectorAll('tr')];
    const list = [];
    for (const tr of rows) {
      const get = (k) => tr.querySelector(`[data-k="${k}"]`)?.value.trim() || '';
      const name = get('name');
      if (!name) continue;
      list.push({
        id: tr.dataset.id || undefined,
        name, sku: get('sku'), spec: get('spec'),
        price: Number(get('price')) || 0, unit: '件',
        aliases: get('aliases').split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      });
    }
    state.products = await api.productsBulkSave(list);
    renderProductFilter();
    notify(t('toast.productsSaved'));
    closeDrawer();
  });
}

// ── 主进程事件 ──────────────────────────────────────────────────────────────

api.onEvent((ev) => {
  if (!state.batch || ev.batchId !== state.batch.id) return;
  const m = ev.materialId && materials().find((x) => x.id === ev.materialId);
  if (ev.type === 'analyze-progress' && m) {
    m.progress = ev.progress;
    if (ev.message) m.error = '';
    renderMaterials();
  }
  if (ev.type === 'job-progress') {
    const j = jobs().find((x) => x.id === ev.jobId);
    if (j) {
      j.status = ev.status || j.status;
      j.progress = ev.progress;
      if (ev.error) j.error = ev.error;
      renderJobs();
    }
  }
  if (ev.type === 'models-progress') {
    const bar = $('#m-prog');
    if (bar && !bar.hidden) {
      bar.firstElementChild.style.width = `${Math.round((ev.pct ?? ev.progress ?? 0) * 100)}%`;
      $('#m-msg').textContent = ev.stage || ev.message || '';
    }
  }
});

async function refreshToday() {
  const stats = await api.todayStats();
  $('#sb-processed').textContent = stats.processed;
  $('#sb-clips').textContent = stats.clips;
}

// ── boot ────────────────────────────────────────────────────────────────────

async function boot() {
  $('#app-version').textContent = `v${await api.getVersion()}`;
  state.settings = await api.getSettings();
  state.lang = ['zh', 'en', 'yue'].includes(state.settings.locale) ? state.settings.locale : 'zh';
  state.settings.export = state.settings.export || {
    resolution: '1080', codec: 'auto', burnSubtitles: true, keepSrt: true,
    subtitleLang: 'yue', stylePreset: 'commerce',
    exportDir: state.settings.exportDir || '',
  };
  $('#export-spec').textContent = `H.264 / ${state.settings.export.resolution === '720' ? '720 × 1280' : '1080 × 1920'} / 30 fps`;
  applyI18n();

  state.products = await api.productsList();
  renderProductFilter();
  state.rules = await api.rulesGet();
  $('#rules-ver').textContent = `v${state.rules.version}`;
  $('#cand-rules-name').textContent = state.rules.name;

  // 批次：取最近一个，否则新建
  let batches = await api.listBatches();
  if (!batches.length) {
    const b = await api.createBatch({
      name: `${todayStr()} ${state.lang === 'en' ? 'batch' : '批次'}`,
      streamer: state.settings.activeStreamer || '',
      rulesVersion: state.rules.version,
      rules: state.rules,
    });
    state.batch = b;
  } else {
    state.batch = await api.getBatch(batches[0].id);
  }
  $('#batch-name').value = state.batch.name;
  $('#streamer-name').textContent = state.settings.activeStreamer || '—';
  $('#streamer-platform').textContent = state.settings.streamers?.[0]?.platform ? `/ ${state.settings.streamers[0].platform}` : '';
  $('#batch-meta').textContent = `${todayStr()} · ${materials().length} ${state.lang === 'en' ? 'videos' : '条素材'} · ${t('drawer.rules')} v${state.rules.version}`;

  $('#batch-name').addEventListener('change', async (e) => {
    await api.patchBatch(state.batch.id, { name: e.target.value || state.batch.name });
  });

  renderMaterials();
  renderCandidates();
  renderJobs();
  refreshToday();

  // 引擎状态（静默）
  try {
    const [status, info] = await Promise.all([api.modelsStatus(), api.engineInfo()]);
    const sense = (status.models || []).find((m) => m.id === 'sensevoice-small') || status.sensevoice || null;
    state.modelReady = !!(sense && (sense.ready || sense.prepared || sense.exists));
    const dot = $('#engine-dot');
    dot.classList.toggle('off', !state.modelReady);
    $('#engine-label').textContent = state.modelReady
      ? (state.lang === 'en' ? 'Engine ready' : '本地引擎就绪')
      : (state.lang === 'en' ? 'ASR model needed' : '粤语模型待下载');
    $('#sb-engine').textContent = info.hardwareEncoder
      ? 'VideoToolbox 硬件编码可用'
      : '硬件编码不可用 · 将使用 x264';
  } catch { /* 引擎信息不可用时静默 */ }

  if (materials().some((m) => m.status === 'queued')) pumpQueue();
}

boot().catch((e) => {
  $('#cand-empty').hidden = false;
  $('#cand-empty').textContent = `Boot error: ${e.message || e}`;
});
