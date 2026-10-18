#!/usr/bin/env node
/**
 * YueCut 粤剪 · 后端纯函数单元测试（零外部服务 / 零模型 API / 零网络）
 *
 * 运行：node scripts/check-yuecut.js
 *
 * 覆盖：
 *  1. 中文口语数字与价格提取（¥ / 蚊 / 中文数字 / 「個半」/ 去重）
 *  2. 粤语口语 → 书面中文、话术词类钩子、转写稳定度启发
 *  3. 商品库匹配与价格交叉核验（一致 / 多件折算一致 / 冲突 / 未匹配）
 *  4. 候选管线：滑窗、四维转化分、标签、SKU 标注、冲突转待定、低置信度标复核、NMS
 *  5. 导出：SRT/ASS 生成、9:16 裁剪滤镜、文件命名
 *  6. 工作区持久化：批次/素材/决策/导出任务落盘与重读
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const AGENT_DIR = path.join(__dirname, '..', 'apps', 'macos-agent');
const yc = require(path.join(AGENT_DIR, 'yuecut-cantonese'));
const products = require(path.join(AGENT_DIR, 'yuecut-products'));
const pipeline = require(path.join(AGENT_DIR, 'yuecut-pipeline'));
const exp = require(path.join(AGENT_DIR, 'yuecut-export'));
const { createYuecutStore } = require(path.join(AGENT_DIR, 'yuecut-store'));

let passed = 0;
let failed = 0;
function ok(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${name} — ${e.message}`);
  }
}
async function okAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${name} — ${e.message}`);
  }
}

// ── 1. 价格与数字 ──────────────────────────────────────────────────────────

const sellingCues = [
  { start: 0, end: 6, text: '姊妹們，點解你哋用咁多補水產品，塊面都係乾？' },
  { start: 6, end: 12, text: '呢支雙萃精華，我自己用咗成個月，敷完第二日塊面仲係水潤。' },
  { start: 12, end: 18, text: '上臉好快吸收，搓勻佢就得，敏感肌都唔會刺激，唔使怕。' },
  { start: 18, end: 24, text: '平時正裝一支一百二十九蚊，今晚兩支裝到手都係一百二十九蚊！' },
  { start: 24, end: 30, text: '數量有限，想嘅姊妹直接點左下角購物車一號鏈接落單啦！' },
];
const PRODUCTS = [
  {
    id: 'p_jh', sku: 'JH-032', name: '双萃精华', spec: '30ml × 2', price: 129, unit: '组',
    aliases: ['雙萃精華', '双萃精华', '精華', '兩支裝', '兩支', '双萃'],
  },
  {
    id: 'p_mm', sku: 'MM-020', name: '玻尿酸补水面膜', spec: '20 片', price: 59.9, unit: '盒',
    aliases: ['補水', '面膜', '補水面膜', '玻尿酸'],
  },
];

console.log('1) 粤语数字 / 价格提取');

ok('阿拉伯 + 粤语单位：129蚊', () => {
  const r = yc.extractPrices('今日129蚊俾大家');
  assert.equal(r[0].amount, 129);
});
ok('货币符号：¥129', () => {
  const r = yc.extractPrices('到手價 ¥129');
  assert.equal(r[0].amount, 129);
  assert.equal(r[0].source, 'symbol');
});
ok('中文口语数字：一百二十九蚊 → 129', () => {
  const r = yc.extractPrices('正裝一百二十九蚊');
  assert.ok(r.some((p) => p.amount === 129));
});
ok('粤语尾数：六十四個半 → 64.5', () => {
  const r = yc.extractPrices('一支先六十四個半咋');
  assert.ok(r.some((p) => p.amount === 64.5 && p.source === 'chinese-half'));
});
ok('小数：59.9蚊', () => {
  const r = yc.extractPrices('一盒59.9蚊');
  assert.equal(r[0].amount, 59.9);
});
ok('重复价格去重且按金额降序', () => {
  const r = yc.extractPrices('129蚊真係129蚊，仲有59蚊');
  const n129 = r.filter((p) => p.amount === 129);
  assert.equal(n129.length, 1);
  assert.ok(r[0].amount >= r[r.length - 1].amount);
});
ok('parseChineseNumber：一百二十九 / 兩 / 拾佰', () => {
  assert.equal(yc.parseChineseNumber('一百二十九'), 129);
  assert.equal(yc.parseChineseNumber('兩'), 2);
  assert.equal(yc.parseChineseNumber('三百'), 300);
});

// ── 2. 粤语转换 / 词类 / 稳定度 ─────────────────────────────────────────────

console.log('2) 粤语转换、话术词类、转写稳定度');

ok('yueToWritten：而家/唔使/嘅 口语转书面', () => {
  const zh = yc.yueToWritten('而家唔使一百二十九蚊嘅話，就快啲落單');
  assert.match(zh, /现在/);
  assert.match(zh, /不用/);
  assert.ok(!zh.includes('嘅話'));
});
ok('HOOK 钩子识别：點解反问在开头', () => {
  assert.equal(yc.hasHookAtStart('點解你哋用咁多面膜都係乾？', 28), true);
  assert.equal(yc.hasHookAtStart('今日天氣幾好我哋傾下計', 28), false);
});
ok('词类命中：效果演示 / 顾虑解答 / CTA', () => {
  assert.ok(yc.includesAny('上臉搓勻好快吸收', yc.DEMO_TERMS));
  assert.ok(yc.includesAny('敏感肌會唔會刺激', yc.OBJECTION_TERMS));
  assert.ok(yc.includesAny('點左下角購物車落單', yc.CTA_TERMS));
});
ok('transcriptionStability：正常话术高分、事件标记低分、短句扣分', () => {
  const good = yc.transcriptionStability(sellingCues[4].text, 6);
  assert.ok(good >= 85, `正常话术应≥85，实得 ${good}`);
  const music = yc.transcriptionStability('[音乐] [applause]', 6);
  assert.ok(music <= 60, `事件标记应低分，实得 ${music}`);
  const tiny = yc.transcriptionStability('係啊', 8);
  assert.ok(tiny <= 70, `字数密度不足应扣分，实得 ${tiny}`);
});
ok('assEscape：换行转 \\N、危险花括号移除', () => {
  assert.equal(yc.assEscape('第一行\n第二行'), '第一行\\N第二行');
  assert.equal(yc.assEscape('a{b}c'), 'a b c');
});

// ── 3. 商品与价格核验 ───────────────────────────────────────────────────────

console.log('3) SKU 匹配与价格交叉核验');

ok('别名匹配商品（含完整名加权）', () => {
  const hit = products.matchProduct('呢支雙萃精華真係正', PRODUCTS);
  assert.ok(hit);
  assert.equal(hit.product.sku, 'JH-032');
  assert.ok(hit.hits.includes('雙萃精華'));
});
ok('价格一致：129 匹配商品库总价', () => {
  const hit = products.matchProduct('雙萃精華兩支裝', PRODUCTS);
  const c = products.crossCheck('今晚兩支裝到手129蚊', hit.product);
  assert.equal(c.status, 'matched');
});
ok('多件折算：兩支裝总价129，口播单件64.5 也算一致', () => {
  const hit = products.matchProduct('雙萃精華兩支裝', PRODUCTS);
  const c = products.crossCheck('一支先64.5蚊，兩支129蚊', hit.product);
  assert.equal(c.status, 'matched');
  assert.equal(c.expectedUnit, 64.5);
});
ok('价格冲突：报价 99 与库价 129 → conflict', () => {
  const hit = products.matchProduct('雙萃精華', PRODUCTS);
  const c = products.crossCheck('今日俾大家99蚊', hit.product);
  assert.equal(c.status, 'conflict');
  assert.match(c.reason, /不一致/);
});
ok('有报价无商品 → unmatched；商品无报价 → none', () => {
  assert.equal(products.crossCheck('今日99蚊', null).status, 'unmatched');
  const hit = products.matchProduct('雙萃精華', PRODUCTS);
  assert.equal(products.crossCheck('呢支精華好正', hit.product).status, 'none');
});
ok('detectPackSize：兩支 / 3瓶 / ×2', () => {
  assert.equal(products.detectPackSize('兩支裝'), 2);
  assert.equal(products.detectPackSize('3瓶一組'), 3);
  assert.equal(products.detectPackSize('套裝 ×2'), 2);
});

// ── 4. 管线 ─────────────────────────────────────────────────────────────────

console.log('4) 候选生成管线');

const sellingText = sellingCues.map((c) => c.text).join('');

ok('完整成交话术产出候选：≥80 分、价格爆点、SKU 命中、价格一致', () => {
  const res = pipeline.analyzeMaterial({ cues: sellingCues, products: PRODUCTS, duration: 30 });
  assert.equal(res.usedFallback, false);
  assert.ok(res.candidates.length >= 1, '应至少产出 1 个候选');
  const top = res.candidates[0];
  assert.ok(top.score >= 80, `转化分应≥80，实得 ${top.score}`);
  assert.equal(top.tag, 'price');
  assert.ok(top.tags.includes('objection') || top.tags.includes('demo'));
  assert.equal(top.product.sku, 'JH-032');
  assert.equal(top.priceStatus, 'matched');
  assert.equal(top.status, 'pending');
  assert.ok(top.quote.length > 0);
  assert.ok(top.transcriptZh.includes('现在') || top.transcriptZh.includes('精华'));
  ['hook', 'price', 'complete'].forEach((k) => {
    assert.ok(Number.isInteger(top.dimensions[k]) && top.dimensions[k] >= 0 && top.dimensions[k] <= 100);
  });
});

ok('报价冲突自动转待定并打 price-conflict 标记', () => {
  const cues = sellingCues.map((c) => ({ ...c }));
  cues[3] = { start: 18, end: 24, text: '平時一百二十九蚊，今日俾大家九十九蚊就得，兩支帶走！' };
  const res = pipeline.analyzeMaterial({
    cues, products: PRODUCTS, duration: 30,
    rules: { prefs: { minScore: 0 } },
  });
  const conflicted = res.candidates.filter((c) => c.priceStatus === 'conflict');
  assert.ok(conflicted.length >= 1);
  assert.equal(conflicted[0].status, 'deferred');
  assert.ok(conflicted[0].flags.includes('price-conflict'));
  assert.ok(conflicted[0].dimensions.price <= 38);
});

ok('无商品指向的闲聊在 requireProduct 下被剔除', () => {
  const chatter = [
    { start: 0, end: 7, text: '今日天氣真係唔錯，我哋隨便傾吓計先。' },
    { start: 7, end: 14, text: '聽日可能會落雨，大家記得出門帶遮呀。' },
    { start: 14, end: 22, text: '好啦咁我哋而家先休息一陣，遲啲再開直播。' },
  ];
  const res = pipeline.analyzeMaterial({ cues: chatter, products: PRODUCTS, duration: 22 });
  assert.equal(res.candidates.length, 0);
});

ok('重叠窗口 NMS 去重', () => {
  // 同一成交段内多个起点会产生高度重叠窗，只保留最高分一个
  const dense = [
    { start: 0, end: 5, text: '姊妹們，點解你哋塊面成日乾？' },
    ...sellingCues.slice(1),
  ];
  const res = pipeline.analyzeMaterial({
    cues: dense, products: PRODUCTS, duration: 30,
    rules: { prefs: { minScore: 60 } },
  });
  const same = res.candidates.filter((c) => c.product && c.product.sku === 'JH-032');
  for (let i = 0; i < same.length; i += 1) {
    for (let j = i + 1; j < same.length; j += 1) {
      const ov = Math.max(0, Math.min(same[i].end, same[j].end) - Math.max(same[i].start, same[j].start));
      const shorter = Math.min(same[i].duration, same[j].duration);
      assert.ok(ov / shorter < 0.5, '保留候选之间重叠必须 < 50%');
    }
  }
});

ok('低转写稳定度 → needReview + low-stability 标记', () => {
  const fixed = [
    sellingCues[0], sellingCues[1], sellingCues[2],
    { start: 18, end: 19, text: '[音乐]' },
    { start: 19, end: 25, text: sellingCues[3].text },
    { start: 25, end: 31, text: sellingCues[4].text },
  ];
  const res = pipeline.analyzeMaterial({ cues: fixed, products: PRODUCTS, duration: 31 });
  const flagged = res.candidates.find((c) => c.needReview);
  assert.ok(flagged, '应至少有一个候选被标待复核');
  assert.ok(flagged.flags.includes('low-stability'));
  assert.ok(flagged.stability < 85);
});

ok('空转写安全返回 usedFallback，不抛错', () => {
  const res = pipeline.analyzeMaterial({ cues: [], products: PRODUCTS });
  assert.equal(res.candidates.length, 0);
  assert.equal(res.usedFallback, true);
});

ok('规则归一化：阈值裁剪与默认值', () => {
  const r = pipeline.normalizeRules({ prefs: { minScore: 999, flagStabilityBelow: -5 } });
  assert.equal(r.prefs.minScore, 100);
  assert.equal(r.prefs.flagStabilityBelow, 0);
  assert.equal(r.prefs.minLen, 20);
});

ok('候选携带 cue 时间码供预览/渲染，且中文转写字段存在', () => {
  const res = pipeline.analyzeMaterial({ cues: sellingCues, products: PRODUCTS, duration: 30 });
  const top = res.candidates[0];
  assert.ok(Array.isArray(top.cues) && top.cues.length >= 3);
  top.cues.forEach((c) => assert.ok(c.end > c.start && typeof c.text === 'string'));
  assert.ok(typeof top.transcriptZh === 'string' && top.transcriptZh.length > 0);
});

void sellingText;

// ── 5. 导出 ─────────────────────────────────────────────────────────────────

console.log('5) SRT / ASS / 导出规格');

ok('SRT 时间码与内容（按成片偏移）', () => {
  const srt = exp.buildSrt(sellingCues.slice(3), 18);
  assert.match(srt, /00:00:00,000 --> 00:00:06,000/);
  assert.match(srt, /一百二十九蚊/);
  assert.match(srt, /^1\n/m);
});
ok('ASS 含白字 Sub 与柠绿 Hook 样式 + 价格行事件', () => {
  const ass = exp.buildAss({
    cues: sellingCues, offset: 0, duration: 30,
    hookText: '唔係一支，係兩支！', priceText: '两支到手 ¥129',
  });
  assert.match(ass, /Style: Sub,PingFang SC/);
  assert.match(ass, /Style: Hook,PingFang SC/);
  assert.match(ass, /兩支/);
  assert.match(ass, /129/);
  assert.match(ass, /Dialogue: 1/);
});
ok('9:16 滤镜链包含 crop/scale 与 subtitles 烧录', () => {
  const [, vf] = exp.buildPortraitChain(1080, 1920, 'yc-x.ass');
  assert.match(vf, /crop=/);
  assert.match(vf, /scale=1080:1920/);
  assert.match(vf, /subtitles=yc-x\.ass/);
});
ok('文件命名：主播_主题_序号 且非法字符替换', () => {
  const name = exp.outputFileName({ streamer: '阿欣/甄选', title: '双萃:到手价', index: 7 });
  assert.equal(name, '阿欣_甄选_双萃_到手价_007.mp4');
  assert.ok(!/[\\/:*?"<>|]/.test(name));
});

// ── 6. 持久化 ───────────────────────────────────────────────────────────────

console.log('6) 工作区持久化');

(async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'yuecut-test-'));
  try {
    const store = createYuecutStore({ rootDir: tmp });
    await store.ensureDirs();

    await okAsync('创建批次并落盘', async () => {
      const b = await store.createBatch({ name: '6/12 直播', streamer: '阿欣甄选' });
      assert.ok(b.id.startsWith('batch_'));
      assert.ok(fs.existsSync(path.join(tmp, 'batches', `${b.id}.json`)));
    });

    const list = await store.listBatches();
    const batchId = list[0].id;

    await okAsync('导入素材：状态机 queued → analyzing → done', async () => {
      const [m] = await store.addMaterials(batchId, [{
        fileName: 'live.mp4', filePath: '/tmp/live.mp4', duration: 3600, sizeBytes: 1,
      }]);
      assert.equal(m.status, 'queued');
      const p = await store.patchMaterial(batchId, m.id, { status: 'analyzing', progress: 40 });
      assert.equal(p.progress, 40);
      const d = await store.patchMaterial(batchId, m.id, {
        status: 'done', progress: 100, analyzedAt: new Date().toISOString(), asrEngine: 'sensevoice',
      });
      assert.equal(d.status, 'done');
    });

    const batch = await store.getBatch(batchId);
    const materialId = batch.materials[0].id;
    const res = pipeline.analyzeMaterial({ cues: sellingCues, products: PRODUCTS, duration: 30 });

    await okAsync('写入候选 + 人工决策并持久化', async () => {
      const saved = await store.replaceCandidates(batchId, materialId, res.candidates);
      assert.ok(saved.length >= 1);
      const decided = await store.setDecision(batchId, saved[0].id, 'confirmed');
      assert.equal(decided.status, 'confirmed');
      const reloaded = await store.getBatch(batchId);
      assert.equal(reloaded.candidates[0].status, 'confirmed');
      assert.equal(reloaded.materials[0].candidateCount, saved.length);
    });

    await okAsync('重跑分析不覆盖已做的人工决策', async () => {
      const b0 = await store.getBatch(batchId);
      const confirmedId = b0.candidates[0].id;
      const again = await store.replaceCandidates(batchId, materialId, res.candidates);
      const kept = again.find((c) => c.id === confirmedId || (c.start === b0.candidates[0].start && c.end === b0.candidates[0].end));
      assert.ok(kept);
      assert.equal(kept.status, 'confirmed');
    });

    await okAsync('导出任务 queued → rendering → done，今日统计更新', async () => {
      const b0 = await store.getBatch(batchId);
      const [job] = await store.addExportJobs(batchId, [{
        candidateId: b0.candidates[0].id, materialId, title: b0.candidates[0].title,
      }]);
      await store.patchExportJob(batchId, job.id, { status: 'rendering', progress: 50, encoder: 'h264_videotoolbox' });
      await store.patchExportJob(batchId, job.id, {
        status: 'done', progress: 100, outputName: 'a.mp4', finishedAt: new Date().toISOString(),
      });
      const stats = await store.todayStats();
      assert.equal(stats.processed, 1);
      assert.equal(stats.clips, 1);
    });

    await okAsync('设置：默认导出目录在 ~/Movies/YueCut', async () => {
      const s = await store.saveSettings({ activeStreamer: '阿欣甄选' }, store.defaultSettings('/Users/t/Movies'));
      assert.match(s.exportDir, /YueCut$/);
      assert.equal(s.activeStreamer, '阿欣甄选');
    });
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }

  console.log(`\nYueCut tests: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
