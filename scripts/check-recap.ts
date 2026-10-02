/**
 * Recap Studio 单测（pnpm test:recap）
 *
 * 只测纯逻辑：归一化 / LLM 解析 / 音画对齐 / 字幕时间轴 / LLM 配置解析。
 * 不碰网络、不碰 ffmpeg、不 import 任何 `@/` 别名模块（tsx 直接可跑）。
 */

import assert from 'node:assert/strict';
import {
  RECAP_MAX_CHAPTERS,
  RECAP_MAX_NARRATION_CHARS,
  normalizeRecapScript,
  normalizeRecapTargetSec,
  recapNarrationChars,
} from '../src/lib/recap';
import { buildLocalRecapDraft, parseRecapScriptJson, resolveRecapLlmConfig } from '../src/lib/server/recap/script';
import { buildNarrationCues, chapterNarrationTexts, planRecapTimeline, recapTokens } from '../src/lib/server/recap/align';
import { commonTranslations } from '../src/lib/i18n/common';
import zhTranslations from '../src/lib/i18n/locales/zh';

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function chapter(narration: string, extra: Record<string, unknown> = {}) {
  return { title: 't', narration, ...extra };
}

console.log('\n[normalizeRecapScript]');

ok('合法稿通过并重排 index', () => {
  const s = normalizeRecapScript({
    hook: '一句话钩子',
    title: '标题',
    targetDurationSec: 120,
    chapters: [chapter('第一段解说内容。'), chapter('第二段解说内容。')],
  });
  assert.ok(s);
  assert.equal(s.chapters.length, 2);
  assert.deepEqual(s.chapters.map((c) => c.index), [1, 2]);
  assert.equal(s.targetDurationSec, 120);
  assert.equal(s.engine, 'llm');
});

ok('章节超上限被截断', () => {
  const s = normalizeRecapScript({
    hook: '',
    title: '',
    targetDurationSec: 180,
    chapters: Array.from({ length: 10 }, (_, i) => chapter(`第${i}段解说。`)),
  });
  assert.ok(s);
  assert.equal(s.chapters.length, RECAP_MAX_CHAPTERS);
});

ok('空 narration → null', () => {
  assert.equal(normalizeRecapScript({ hook: 'h', chapters: [chapter('   ')] }), null);
});

ok('无章节 → null', () => {
  assert.equal(normalizeRecapScript({ hook: 'h', chapters: [] }), null);
  assert.equal(normalizeRecapScript(null), null);
});

ok('总字符超限 → null', () => {
  const big = '啊'.repeat(400);
  const s = normalizeRecapScript({
    hook: '',
    chapters: Array.from({ length: RECAP_MAX_CHAPTERS }, () => chapter(big)),
    targetDurationSec: 180,
  });
  assert.equal(s, null);
  // 单章被截断到 400 → 6×400 = 2400 > 2000
  assert.ok(RECAP_MAX_CHAPTERS * 400 > RECAP_MAX_NARRATION_CHARS);
});

ok('非法 / 过短锚点被丢弃，越界负值被丢弃', () => {
  const s = normalizeRecapScript({
    hook: '',
    chapters: [
      chapter('a', { sourceStart: 10, sourceEnd: 12 }),      // 合法
      chapter('b', { sourceStart: 10, sourceEnd: 10.5 }),    // 过短 → 丢
      chapter('c', { sourceStart: -5, sourceEnd: 20 }),      // 负 → 丢
      chapter('d', { sourceStart: 'x', sourceEnd: 20 }),     // 非数字 → 丢
    ],
    targetDurationSec: 120,
  });
  assert.ok(s);
  assert.equal(s.chapters[0].sourceStart, 10);
  assert.equal(s.chapters[0].sourceEnd, 12);
  assert.equal(s.chapters[1].sourceStart, undefined);
  assert.equal(s.chapters[2].sourceStart, undefined);
  assert.equal(s.chapters[3].sourceStart, undefined);
});

ok('engine 白名单：local 保留，其它一律 llm', () => {
  const base = { hook: '', chapters: [chapter('解说。')], targetDurationSec: 60 };
  assert.equal(normalizeRecapScript({ ...base, engine: 'local' })?.engine, 'local');
  assert.equal(normalizeRecapScript({ ...base, engine: 'gpt' })?.engine, 'llm');
});

ok('normalizeRecapTargetSec 命中白名单', () => {
  assert.equal(normalizeRecapTargetSec(59), 60);
  assert.equal(normalizeRecapTargetSec(100), 120);
  assert.equal(normalizeRecapTargetSec(175), 180);
  assert.equal(normalizeRecapTargetSec(undefined), 120);
  assert.equal(normalizeRecapTargetSec('abc'), 120);
});

ok('recapNarrationChars 统计 hook + 各章', () => {
  const s = normalizeRecapScript({
    hook: '钩子',
    chapters: [chapter('一二三'), chapter('四五六')],
    targetDurationSec: 60,
  });
  assert.ok(s);
  assert.equal(recapNarrationChars(s), 2 + 3 + 3);
});

console.log('\n[parseRecapScriptJson]');

ok('干净 JSON 通过', () => {
  const s = parseRecapScriptJson(JSON.stringify({
    hook: '钩子',
    title: '标题',
    chapters: [chapter('解说内容一。'), chapter('解说内容二。')],
  }));
  assert.ok(s);
  assert.equal(s.chapters.length, 2);
  assert.equal(s.engine, 'llm');
});

ok('markdown 围栏 + 前后杂文可解析', () => {
  const raw = '好的，这是结果：\n```json\n{"hook":"h","chapters":[{"narration":"第一章解说。"}]}\n```\n以上。';
  const s = parseRecapScriptJson(raw);
  assert.ok(s);
  assert.equal(s.chapters.length, 1);
});

ok('非法结构 → null', () => {
  assert.equal(parseRecapScriptJson('not json at all'), null);
  assert.equal(parseRecapScriptJson('{"hook":"h"}'), null);
  assert.equal(parseRecapScriptJson('{"chapters":[{"narration":""}]}'), null);
});

ok('模型自报 engine 不被采信', () => {
  const s = parseRecapScriptJson('{"engine":"local","hook":"h","chapters":[{"narration":"解说。"}]}');
  assert.ok(s);
  assert.equal(s.engine, 'llm');
});

console.log('\n[resolveRecapLlmConfig]');

ok('无 aiConfig 且无 env → null（不碰网络）', () => {
  const saved = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  delete process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  try {
    assert.equal(resolveRecapLlmConfig(undefined), null);
    assert.equal(resolveRecapLlmConfig(null), null);
    assert.equal(resolveRecapLlmConfig({ enabled: false, apiKey: 'k' }), null);
    assert.equal(resolveRecapLlmConfig({ enabled: true, apiKey: '   ' }), null);
  } finally {
    if (saved != null) process.env.COZE_WORKLOAD_IDENTITY_API_KEY = saved;
  }
});

ok('请求体 aiConfig 优先，缺省模型回落默认', () => {
  const cfg = resolveRecapLlmConfig({ enabled: true, apiKey: '  abc  ', baseUrl: 'https://x' });
  assert.ok(cfg);
  assert.equal(cfg.apiKey, 'abc');
  assert.equal(cfg.baseUrl, 'https://x');
  assert.equal(cfg.model, 'doubao-seed-1-8-251228');
});

console.log('\n[planRecapTimeline]');

/** 造 N 条 3 秒台词，每条含互不相同的 token，便于验证文本重合度选窗 */
function makeCues(count: number, idPrefix: string) {
  return Array.from({ length: count }, (_, i) => ({
    start: i * 3,
    end: i * 3 + 3,
    text: `${idPrefix}${i} keyword${i} topic${i}`,
  }));
}

ok('Σ片时长 == 该章解说时长，且落在 [0, source]，同章不重叠', () => {
  const cues = makeCues(100, 's');
  const durations = [12, 25, 47];
  const plan = planRecapTimeline({
    chapterDurations: durations,
    chapterTexts: ['alpha beta', 'gamma delta', 'epsilon zeta'],
    cues,
    sourceDuration: 300,
    headroomSec: 0.4,
  });
  assert.ok(plan);
  assert.ok(Math.abs(plan.totalDuration - 84) < 0.01);
  plan.chapters.forEach((c, i) => {
    const sum = c.pieces.reduce((s, p) => s + (p.end - p.start), 0);
    assert.ok(Math.abs(sum - durations[i]) < 0.1, `chapter ${i} sum=${sum} want=${durations[i]}`);
    // 章内不重叠（按源时间排序）
    const sorted = [...c.pieces].sort((a, b) => a.start - b.start);
    for (let k = 1; k < sorted.length; k++) {
      assert.ok(sorted[k].start >= sorted[k - 1].end - 0.001, 'pieces overlap inside chapter');
    }
    for (const p of c.pieces) {
      assert.ok(p.start >= 0 && p.end <= 300 + 0.001, 'piece out of source range');
      if (durations[i] >= 3) assert.ok(p.end - p.start >= 1.5 - 0.001, 'piece too short');
    }
  });
  // 成片时间轴连续且总长 == ΣD
  let cursor = 0;
  for (const c of plan.chapters) {
    assert.ok(Math.abs(c.start - cursor) < 0.01);
    cursor += durations[c.chapterIndex - 1];
    assert.ok(Math.abs(c.end - cursor) < 0.01);
  }
});

ok('A-Roll 命中与解说词文本重合度最高的窗', () => {
  const cues = makeCues(60, 's');
  // 90s~105s 这段连续 5 条字幕就是第 1 章解说的内容 → 该段窗口应得分最高
  for (let i = 0; i < 5; i++) {
    cues[30 + i] = { start: 90 + i * 3, end: 93 + i * 3, text: `s${30 + i} unicorn rainbow quantum keyword${30 + i}` };
  }
  const plan = planRecapTimeline({
    chapterDurations: [10],
    chapterTexts: ['unicorn rainbow quantum'],
    cues,
    sourceDuration: 180,
  });
  assert.ok(plan);
  assert.equal(plan.chapters[0].pieces[0].start, 90);
});

ok('长解说自动 B-Roll 补齐（片数 = ceil(D/30)）', () => {
  const cues = makeCues(200, 'k');
  const plan = planRecapTimeline({
    chapterDurations: [70],
    chapterTexts: ['x'],
    cues,
    sourceDuration: 600,
  });
  assert.ok(plan);
  const pieces = plan.chapters[0].pieces;
  assert.equal(pieces.length, 3);
  assert.equal(pieces[0].role, 'a-roll');
  assert.equal(pieces[1].role, 'b-roll');
  assert.equal(pieces[2].role, 'b-roll');
});

ok('跨章去重：第 2 章不重复使用第 1 章已占素材', () => {
  const cues = makeCues(40, 's');
  cues[0] = { start: 0, end: 3, text: 'unique alpha' };
  cues[1] = { start: 3, end: 6, text: 'unique beta' };
  const plan = planRecapTimeline({
    chapterDurations: [40, 40],
    chapterTexts: ['unique alpha', 'unique beta'],
    cues,
    sourceDuration: 500,
  });
  assert.ok(plan);
  const used = new Set(plan.chapters[0].pieces.map((p) => p.start));
  for (const p of plan.chapters[1].pieces) {
    assert.ok(!used.has(p.start), `chapter 2 reused chapter 1 window at ${p.start}`);
  }
});

ok('无字幕但 LLM 给了锚点 → 仍可对齐', () => {
  const plan = planRecapTimeline({
    chapterDurations: [20],
    chapterTexts: [''],
    cues: [],
    sourceDuration: 0,
    anchors: [{ start: 40, end: 80 }],
  });
  assert.ok(plan);
  assert.equal(plan.chapters[0].pieces[0].start, 40);
  assert.ok(Math.abs(plan.chapters[0].pieces[0].end - 60) < 0.01);
});

ok('锚点被占用时回落打分选窗', () => {
  const cues = makeCues(40, 's');
  const plan = planRecapTimeline({
    chapterDurations: [10, 10],
    chapterTexts: ['a', 'b'],
    cues,
    sourceDuration: 200,
    anchors: [{ start: 30, end: 60 }, { start: 30, end: 60 }],
  });
  assert.ok(plan);
  assert.equal(plan.chapters[0].pieces[0].start, 30);
  assert.ok(plan.chapters[1].pieces[0].start !== 30);
});

ok('完全无源信息 → null', () => {
  assert.equal(planRecapTimeline({ chapterDurations: [10], chapterTexts: ['a'], cues: [], sourceDuration: 0 }), null);
  assert.equal(planRecapTimeline({ chapterDurations: [], chapterTexts: [], cues: [], sourceDuration: 100 }), null);
});

ok('分片数受 RECAP_MAX_PIECES 约束', () => {
  const cues = makeCues(400, 's');
  const plan = planRecapTimeline({
    chapterDurations: [33, 33, 33, 33, 33, 33],
    chapterTexts: ['a', 'b', 'c', 'd', 'e', 'f'],
    cues,
    sourceDuration: 1200,
  });
  assert.ok(plan);
  const total = plan.chapters.reduce((s, c) => s + c.pieces.length, 0);
  assert.ok(total <= 12, `too many pieces: ${total}`);
  // 每章时长仍精确
  plan.chapters.forEach((c) => {
    const sum = c.pieces.reduce((s, p) => s + (p.end - p.start), 0);
    assert.ok(Math.abs(sum - 33) < 0.1);
  });
});

console.log('\n[buildNarrationCues]');

ok('行数正确 / 时间单调不减 / 末条 end == 章节末尾', () => {
  const cues = buildNarrationCues([
    { text: '第一句解说内容稍微长一点点，用来触发一次换行处理。', start: 0, duration: 6 },
    { text: '第二句。', start: 6, duration: 2 },
  ]);
  assert.ok(cues.length >= 3);
  for (let i = 1; i < cues.length; i++) {
    assert.ok(cues[i].start >= cues[i - 1].start - 0.001, 'start not monotonic');
    assert.ok(cues[i].end >= cues[i].start, 'end < start');
  }
  for (const c of cues) assert.ok(c.text.length <= 22, `line too long: ${c.text.length}`);
  assert.equal(cues[cues.length - 1].end, 8);
  assert.equal(cues[0].start, 0);
  // 章节边界：第 1 章的最后一行结束于 6
  const firstChapterLast = cues.filter((c) => c.end <= 6.001).pop();
  assert.equal(firstChapterLast?.end, 6);
});

ok('超长无标点文本被硬切成多行', () => {
  const cues = buildNarrationCues([{ text: '啊'.repeat(50), start: 0, duration: 5 }]);
  assert.equal(cues.length, 3);
  assert.equal(cues[0].text.length, 22);
});

console.log('\n[chapterNarrationTexts / recapTokens]');

ok('钩子并入第 1 章（旁白与视频等长的前提）', () => {
  const s = normalizeRecapScript({
    hook: '黄金三秒',
    chapters: [chapter('正文一'), chapter('正文二')],
    targetDurationSec: 60,
  });
  assert.ok(s);
  const texts = chapterNarrationTexts(s);
  assert.equal(texts[0], '黄金三秒 正文一');
  assert.equal(texts[1], '正文二');
});

ok('recapTokens：中文 bigram + 英文小写词', () => {
  const t = recapTokens('人工智能 AI Rocks');
  assert.ok(t.has('人工'));
  assert.ok(t.has('智能'));
  assert.ok(t.has('ai'));
  assert.ok(t.has('rocks'));
});

console.log('\n[buildLocalRecapDraft]');

ok('无字幕 → null；有字幕 → engine=local 且章节 ≤6', () => {
  assert.equal(buildLocalRecapDraft({ segments: [], targetDurationSec: 120 }), null);

  const segments = Array.from({ length: 120 }, (_, i) => ({
    start: i * 3,
    duration: 3,
    text: `第${i}段讲解内容，主题是关键词${i % 7}，这里补充一些说明文字。`,
  }));
  const draft = buildLocalRecapDraft({ segments, targetDurationSec: 120, videoTitle: '测试视频', locale: 'zh' });
  assert.ok(draft);
  assert.equal(draft.engine, 'local');
  assert.ok(draft.chapters.length >= 3 && draft.chapters.length <= RECAP_MAX_CHAPTERS);
  assert.ok(draft.hook.length > 0);
  assert.ok(recapNarrationChars(draft) <= RECAP_MAX_NARRATION_CHARS);
  // 本地草稿带源锚点（来自高光时间戳），可被对齐算法优先采用
  assert.ok(draft.chapters.some((c) => c.sourceStart != null));
});

console.log('\n[i18n · video.recap.* / nav.recap / pricing.pro.feature7]');

/** 深路径取值（zh 未覆盖时回落 en——与 i18n/index.ts 的 mergeTranslations 同语义） */
function pick(tree: Record<string, unknown>, path: string): unknown {
  let cur: unknown = tree;
  for (const seg of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

const RECAP_I18N_KEYS = [
  'nav.recap',
  'pricing.pro.feature7',
  'video.recap.badge',
  'video.recap.heroTitle',
  'video.recap.heroSubtitle',
  'video.recap.placeholder',
  'video.recap.urlRequired',
  'video.recap.durationLabel',
  'video.recap.duration60',
  'video.recap.duration120',
  'video.recap.duration180',
  'video.recap.step1',
  'video.recap.step2',
  'video.recap.generate',
  'video.recap.generating',
  'video.recap.engineLlm',
  'video.recap.engineLocal',
  'video.recap.hookLabel',
  'video.recap.titleLabel',
  'video.recap.chapterLabel',
  'video.recap.narrationLabel',
  'video.recap.keyQuoteLabel',
  'video.recap.addChapter',
  'video.recap.removeChapter',
  'video.recap.render',
  'video.recap.rendering',
  'video.recap.orientationLabel',
  'video.recap.orientationLandscape',
  'video.recap.orientationVertical',
  'video.recap.voiceLabel',
  'video.recap.voiceAuto',
  'video.recap.bgmLabel',
  'video.recap.bgmNone',
  'video.recap.bgmCalm',
  'video.recap.bgmEnergetic',
  'video.recap.bgmWarm',
  'video.recap.originalVolumeLabel',
  'video.recap.resultTitle',
  'video.recap.download',
  'video.recap.renderHint',
  'video.recap.loginRequired',
  'video.recap.loginCta',
  'video.recap.upgradeTitle',
  'video.recap.upgradeDesc',
  'video.recap.upgradeCta',
  'video.recap.notProTitle',
  'video.recap.aiUnavailable',
  'video.recap.localDraftCta',
  'video.recap.noTranscript',
  // 页面复用的既有声线译名
  'video.voiceover.voices.zh-CN-YunxiNeural',
  'video.voiceover.voices.en-US-GuyNeural',
];

ok('en/zh 关键 key 齐备，且 zh 的 recap 文案已本地化', () => {
  const en = commonTranslations as unknown as Record<string, unknown>;
  const zh = zhTranslations as unknown as Record<string, unknown>;
  for (const key of RECAP_I18N_KEYS) {
    assert.equal(typeof pick(en, key), 'string', `en missing: ${key}`);
    assert.equal(typeof pick(zh, key), 'string', `zh missing: ${key}`);
  }
  // 抽查：zh 的 recap 文案确实是中文（未被英文基线漏下来）
  const zhHero = pick(zh, 'video.recap.heroTitle');
  assert.ok(typeof zhHero === 'string' && /[\u4e00-\u9fa5]/.test(zhHero), 'zh recap not localized');
});

console.log(`\n全部通过：${passed} 项\n`);