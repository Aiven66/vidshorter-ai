/**
 * 批量生产队列单测（pnpm test:batch）
 *
 * 只测纯逻辑：URL 归一化 / 聚合统计 / 状态判定 / 阶段映射 / 片段归一化 / 排队决策 / i18n key 齐备。
 * 不碰网络、不碰 DB、不构造 SupabaseClient。
 */

import assert from 'node:assert/strict';
import {
  BATCH_ERROR_CODES,
  BATCH_KICK_MIN_AGE_MS,
  BATCH_MAX_ITEMS,
  BATCH_SLOT_STALE_MS,
  TERMINAL_VIDEO_STATUSES,
  isTerminalVideoStatus,
  normalizeBatchUrls,
  summarizeBatchItems,
  type BatchItem,
} from '../src/lib/video-batch';
import { classifyClipUrl, normalizeClipRows, stageFor } from '../src/lib/server/video-status';
import { planPump, resolveBatchConcurrency, type QueueRow } from '../src/lib/server/video-batch-queue';
import { commonTranslations } from '../src/lib/i18n/common';
import zhTranslations from '../src/lib/i18n/locales/zh';

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function item(status: string, clipsGenerated = 0): Pick<BatchItem, 'status' | 'clipsGenerated'> {
  return { status, clipsGenerated };
}

console.log('\n[normalizeBatchUrls]');

ok('多分隔符切分：换行 / 逗号 / 中文逗号 / 顿号 / 分号 / 空白', () => {
  const r = normalizeBatchUrls('https://a.com/1\nhttps://a.com/2,https://a.com/3，https://a.com/4、https://a.com/5；https://a.com/6 https://a.com/7');
  assert.equal(r.ok, true);
  assert.equal(r.urls.length, 7);
  assert.equal(r.invalidCount, 0);
  assert.equal(r.duplicateCount, 0);
});

ok('去重保留首次出现顺序', () => {
  const r = normalizeBatchUrls('https://a.com/2\nhttps://a.com/1\nhttps://a.com/2');
  assert.equal(r.ok, true);
  assert.deepEqual(r.urls, ['https://a.com/2', 'https://a.com/1']);
  assert.equal(r.duplicateCount, 1);
});

ok('非 http(s) / 超长条目被丢弃并计数', () => {
  const r = normalizeBatchUrls(`ftp://a.com/x\nnot-a-url\nhttps://a.com/${'a'.repeat(1200)}\nhttps://ok.com/1`);
  assert.equal(r.ok, true);
  assert.deepEqual(r.urls, ['https://ok.com/1']);
  assert.equal(r.invalidCount, 3);
});

ok('数组输入同样支持（含数组元素内的分隔符）', () => {
  const r = normalizeBatchUrls(['https://a.com/1 https://a.com/2', 'https://a.com/3']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.urls, ['https://a.com/1', 'https://a.com/2', 'https://a.com/3']);
});

ok('空输入 / 全非法 → ok:false + invalidRequest', () => {
  for (const raw of ['', '   \n  ', 'not-a-url', null, undefined, 42, []]) {
    const r = normalizeBatchUrls(raw);
    assert.equal(r.ok, false, `should fail: ${String(raw)}`);
    assert.equal(r.code, BATCH_ERROR_CODES.invalidRequest);
    assert.deepEqual(r.urls, []);
  }
});

ok('恰好上限放行，超出上限一律拒绝（绝不静默截断）', () => {
  const exact = Array.from({ length: BATCH_MAX_ITEMS }, (_, i) => `https://a.com/${i}`).join('\n');
  const over = Array.from({ length: BATCH_MAX_ITEMS + 1 }, (_, i) => `https://a.com/${i}`).join('\n');

  const okResult = normalizeBatchUrls(exact);
  assert.equal(okResult.ok, true);
  assert.equal(okResult.urls.length, BATCH_MAX_ITEMS);

  const overResult = normalizeBatchUrls(over);
  assert.equal(overResult.ok, false);
  assert.equal(overResult.code, BATCH_ERROR_CODES.invalidRequest);
  // 拒绝时不返回部分结果，用户必须自己改数量
  assert.equal(overResult.urls.length, BATCH_MAX_ITEMS + 1);
});

console.log('\n[summarizeBatchItems]');

ok('各状态计数 + finished/done/percent', () => {
  const s = summarizeBatchItems([
    item('pending'),
    item('processing', 2),
    item('completed', 5),
    item('partial', 1),
    item('link_only_completed', 0),
    item('failed'),
    item('weird_unknown_state', 3),
  ]);
  assert.equal(s.total, 7);
  assert.equal(s.pending, 1);
  assert.equal(s.processing, 2); // processing + 未知非终态
  assert.equal(s.completed, 1);
  assert.equal(s.partial, 1);
  assert.equal(s.linkOnly, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.finished, 4);
  assert.equal(s.done, false);
  assert.equal(s.percent, Math.round((4 / 7) * 100));
  assert.equal(s.clipsGenerated, 11);
});

ok('全部终态 → done:true / percent:100', () => {
  const s = summarizeBatchItems([item('completed', 1), item('failed')]);
  assert.equal(s.done, true);
  assert.equal(s.percent, 100);
  assert.equal(s.finished, 2);
});

ok('空列表 → done:false / percent:0（不出现 0/0 的 NaN）', () => {
  const s = summarizeBatchItems([]);
  assert.equal(s.total, 0);
  assert.equal(s.done, false);
  assert.equal(s.percent, 0);
  assert.equal(s.clipsGenerated, 0);
});

ok('负 / 非有限 clipsGenerated 被夹到 0', () => {
  const s = summarizeBatchItems([
    { status: 'completed', clipsGenerated: -3 },
    { status: 'completed', clipsGenerated: Number.NaN },
  ]);
  assert.equal(s.clipsGenerated, 0);
});

console.log('\n[isTerminalVideoStatus]');

ok('终态集合为唯一来源', () => {
  assert.deepEqual(
    [...TERMINAL_VIDEO_STATUSES],
    ['completed', 'partial', 'link_only_completed', 'failed'],
  );
  for (const s of TERMINAL_VIDEO_STATUSES) assert.equal(isTerminalVideoStatus(s), true);
  for (const s of ['pending', 'processing', '', null, undefined]) assert.equal(isTerminalVideoStatus(s), false);
});

console.log('\n[classifyClipUrl]');

ok('空 URL → failed', () => {
  assert.equal(classifyClipUrl(''), 'failed');
  assert.equal(classifyClipUrl(null), 'failed');
  assert.equal(classifyClipUrl(undefined), 'failed');
});

ok('内联 data / data-url / 存储签名 → completed', () => {
  assert.equal(classifyClipUrl('data:video/mp4;base64,AAAA'), 'completed');
  assert.equal(classifyClipUrl('data-url:https://x/y.mp4'), 'completed');
  assert.equal(
    classifyClipUrl('https://proj.supabase.co/storage/v1/object/sign/clips/a.mp4?token=xyz'),
    'completed',
  );
});

ok('YouTube 时间戳页面 URL → link_only；其它 https 文件 → completed', () => {
  assert.equal(classifyClipUrl('https://youtu.be/dQw4w9WgXcQ?t=30s'), 'link_only');
  assert.equal(classifyClipUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s'), 'link_only');
  assert.equal(classifyClipUrl('https://cdn.example.com/a.mp4'), 'completed');
});

console.log('\n[stageFor]');

ok('阶段边界与终态映射', () => {
  assert.equal(stageFor('processing', 0), 'init');
  assert.equal(stageFor('processing', 19), 'init');
  assert.equal(stageFor('processing', 20), 'ai_analysis');
  assert.equal(stageFor('processing', 44), 'ai_analysis');
  assert.equal(stageFor('processing', 45), 'generating_clip');
  assert.equal(stageFor('pending', 0), 'init');
  assert.equal(stageFor('completed', 100), 'complete');
  assert.equal(stageFor('partial', 100), 'complete');
  assert.equal(stageFor('link_only_completed', 100), 'complete');
  assert.equal(stageFor('failed', 100), 'error');
});

console.log('\n[normalizeClipRows]');

ok('link_only 暴露 linkOnlyUrl，其它不带该字段', () => {
  const rows = [
    {
      url: 'https://youtu.be/abc?t=12s',
      highlight_title: '开场',
      start_time: 12,
      end_time: 30,
      duration: 18,
      highlight_summary: 's',
      thumbnail_url: 'https://t/1.jpg',
    },
    { url: 'data:video/mp4;base64,AAAA', start_time: 1, end_time: 2 },
  ];
  const clips = normalizeClipRows('vid-1', rows);
  assert.equal(clips.length, 2);
  assert.equal(clips[0].id, 'vid-1-clip-0');
  assert.equal(clips[0].status, 'link_only');
  assert.equal(clips[0].linkOnlyUrl, 'https://youtu.be/abc?t=12s');
  assert.equal(clips[0].title, '开场');
  assert.equal(clips[0].startTime, 12);
  assert.equal(clips[1].status, 'completed');
  assert.equal('linkOnlyUrl' in clips[1], false);
  assert.equal(clips[1].title, '');
  assert.equal(clips[1].duration, 0);
});

ok('null / undefined 行 → 空数组', () => {
  assert.deepEqual(normalizeClipRows('v', null), []);
  assert.deepEqual(normalizeClipRows('v', undefined), []);
});

console.log('\n[planPump]');

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
function row(partial: Partial<QueueRow> & { id: string }): QueueRow {
  return {
    status: 'pending',
    progress: 0,
    updated_at: null,
    created_at: new Date(T0).toISOString(),
    ...partial,
  };
}
function iso(offsetMs: number) {
  return new Date(T0 + offsetMs).toISOString();
}

ok('空队列的 pending 按 created_at 升序填满并发槽', () => {
  const plan = planPump(
    [
      row({ id: 'b', created_at: iso(-60_000) }),
      row({ id: 'a', created_at: iso(-120_000) }),
      row({ id: 'c', created_at: iso(-30_000) }),
    ],
    { concurrency: 2, minAgeMs: 0, now: T0 },
  );
  assert.equal(plan.active, 0);
  assert.equal(plan.slots, 2);
  assert.deepEqual(plan.start, ['a', 'b']);
  assert.equal(plan.pendingRemaining, 1);
  assert.deepEqual(plan.stalled, []);
});

ok('未满 minAgeMs 的新条目不启动（避免与提交时的踢重复），但仍计入等待数', () => {
  const plan = planPump(
    [row({ id: 'a', created_at: iso(-5_000) })],
    { concurrency: 2, minAgeMs: BATCH_KICK_MIN_AGE_MS, now: T0 },
  );
  assert.deepEqual(plan.start, []);
  assert.equal(plan.pendingRemaining, 1);
});

ok('刚提交（未熟）的条目 + 已熟条目 → 等待数合并统计', () => {
  const plan = planPump(
    [
      row({ id: 'ripe', created_at: iso(-300_000) }),
      row({ id: 'fresh', created_at: iso(-1_000) }),
    ],
    { concurrency: 1, minAgeMs: BATCH_KICK_MIN_AGE_MS, now: T0 },
  );
  assert.deepEqual(plan.start, ['ripe']);
  assert.equal(plan.pendingRemaining, 1); // fresh 还没熟，但用户应该看得到它在等
});

ok('新鲜的非终态行占用并发槽', () => {
  const plan = planPump(
    [
      row({ id: 'run', status: 'processing', progress: 30, updated_at: iso(-60_000) }),
      row({ id: 'a', created_at: iso(-300_000) }),
      row({ id: 'b', created_at: iso(-200_000) }),
    ],
    { concurrency: 2, minAgeMs: 0, now: T0 },
  );
  assert.equal(plan.active, 1);
  assert.equal(plan.slots, 1);
  assert.deepEqual(plan.start, ['a']);
  assert.equal(plan.pendingRemaining, 1);
});

ok('僵尸（久未更新）不占槽但仍被点名', () => {
  const plan = planPump(
    [
      row({ id: 'zombie', status: 'processing', progress: 30, updated_at: iso(-(BATCH_SLOT_STALE_MS + 60_000)) }),
      row({ id: 'a', created_at: iso(-300_000) }),
    ],
    { concurrency: 1, minAgeMs: 0, now: T0 },
  );
  assert.equal(plan.active, 0);
  assert.equal(plan.slots, 1);
  assert.deepEqual(plan.start, ['a']);
  assert.deepEqual(plan.stalled, ['zombie']);
});

ok('终态行既不算活跃也不启动', () => {
  const plan = planPump(
    [
      row({ id: 'done', status: 'completed', progress: 100, updated_at: iso(-60_000) }),
      row({ id: 'dead', status: 'failed', progress: 0, updated_at: iso(-60_000) }),
    ],
    { concurrency: 2, minAgeMs: 0, now: T0 },
  );
  assert.equal(plan.active, 0);
  assert.deepEqual(plan.start, []);
  assert.deepEqual(plan.stalled, []);
});

ok('已被认领过的行（updated_at 非空 / progress>0）不重复启动', () => {
  const plan = planPump(
    [
      row({ id: 'claimed', updated_at: iso(-10_000) }),
      row({ id: 'moved', progress: 10 }),
    ],
    { concurrency: 2, minAgeMs: 0, now: T0 },
  );
  assert.deepEqual(plan.start, []);
  assert.equal(plan.active, 1); // claimed 是新鲜非终态 → 占槽
  assert.equal(plan.pendingRemaining, 0);
});

ok('并发为 0 或已满 → 不启动任何条目', () => {
  const rows = [row({ id: 'a', created_at: iso(-300_000) }), row({ id: 'b', created_at: iso(-200_000) })];
  assert.deepEqual(planPump(rows, { concurrency: 0, minAgeMs: 0, now: T0 }).start, []);

  const full = planPump(
    [
      row({ id: 'r1', status: 'processing', progress: 10, updated_at: iso(-10_000) }),
      row({ id: 'r2', status: 'processing', progress: 10, updated_at: iso(-10_000) }),
      ...rows,
    ],
    { concurrency: 2, minAgeMs: 0, now: T0 },
  );
  assert.equal(full.active, 2);
  assert.deepEqual(full.start, []);
  assert.equal(full.pendingRemaining, 2);
});

console.log('\n[resolveBatchConcurrency]');

ok('无 env → 默认；非法/越界被 clamp 到 1..5', () => {
  const saved = process.env.BATCH_CONCURRENCY;
  try {
    delete process.env.BATCH_CONCURRENCY;
    assert.ok(resolveBatchConcurrency() >= 1);

    process.env.BATCH_CONCURRENCY = 'abc';
    assert.equal(resolveBatchConcurrency(), 2);

    process.env.BATCH_CONCURRENCY = '0';
    assert.equal(resolveBatchConcurrency(), 1);

    process.env.BATCH_CONCURRENCY = '99';
    assert.equal(resolveBatchConcurrency(), 5);

    process.env.BATCH_CONCURRENCY = '3.7';
    assert.equal(resolveBatchConcurrency(), 3);
  } finally {
    if (saved == null) delete process.env.BATCH_CONCURRENCY;
    else process.env.BATCH_CONCURRENCY = saved;
  }
});

console.log('\n[i18n · nav.batch / video.batch.* / pricing.starter.feature6]');

/** 深路径取值（zh 未覆盖时回落 en——与 i18n/index.ts 的 mergeTranslations 同语义） */
function pick(tree: Record<string, unknown>, path: string): unknown {
  let cur: unknown = tree;
  for (const seg of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

const BATCH_I18N_KEYS = [
  'nav.batch',
  'pricing.starter.feature6',
  'video.batch.badge',
  'video.batch.heroTitle',
  'video.batch.heroSubtitle',
  'video.batch.formTitle',
  'video.batch.placeholder',
  'video.batch.parsedCount',
  'video.batch.invalidCount',
  'video.batch.duplicateCount',
  'video.batch.costNote',
  'video.batch.submit',
  'video.batch.submitting',
  'video.batch.clearQueue',
  'video.batch.queueTitle',
  'video.batch.concurrency',
  'video.batch.activeSlots',
  'video.batch.pendingSlots',
  'video.batch.progressLabel',
  'video.batch.clipsTotal',
  'video.batch.countCompleted',
  'video.batch.countPartial',
  'video.batch.countLinkOnly',
  'video.batch.countFailed',
  'video.batch.drainHint',
  'video.batch.loadingQueue',
  'video.batch.stalledBadge',
  'video.batch.stalledHint',
  'video.batch.clipsOf',
  'video.batch.downloadClip',
  'video.batch.openOnYouTube',
  'video.batch.clipUnavailable',
  'video.batch.itemStage',
  'video.batch.stage_init',
  'video.batch.stage_ai_analysis',
  'video.batch.stage_generating_clip',
  'video.batch.stage_complete',
  'video.batch.stage_error',
  'video.batch.statusPending',
  'video.batch.statusProcessing',
  'video.batch.statusCompleted',
  'video.batch.statusPartial',
  'video.batch.statusLinkOnly',
  'video.batch.statusFailed',
  'video.batch.queueDrained',
  'video.batch.invalidRequest',
  'video.batch.insufficientCredits',
  'video.batch.quotaExceeded',
  'video.batch.requestFailed',
  'video.batch.pollFailed',
  'video.batch.sessionExpired',
  'video.batch.loginRequired',
  'video.batch.loginCta',
  'video.batch.upgradeTitle',
  'video.batch.upgradeDesc',
  'video.batch.upgradeCta',
];

ok('en/zh 关键 key 齐备，且 zh 的 batch 文案已本地化', () => {
  const en = commonTranslations as unknown as Record<string, unknown>;
  const zh = zhTranslations as unknown as Record<string, unknown>;
  for (const key of BATCH_I18N_KEYS) {
    assert.equal(typeof pick(en, key), 'string', `en missing: ${key}`);
    assert.equal(typeof pick(zh, key), 'string', `zh missing: ${key}`);
  }
  const zhHero = pick(zh, 'video.batch.heroTitle');
  assert.ok(typeof zhHero === 'string' && /[\u4e00-\u9fa5]/.test(zhHero), 'zh batch not localized');
});

ok('错误码服务端/前端共用同一份字面量', () => {
  assert.deepEqual(BATCH_ERROR_CODES, {
    unauthorized: 'batch_unauthorized',
    requiresPaid: 'batch_requires_paid',
    invalidRequest: 'batch_invalid_request',
    insufficientCredits: 'batch_insufficient_credits',
    quotaExceeded: 'batch_quota_exceeded',
    failed: 'batch_failed',
  });
});

console.log(`\n全部通过：${passed} 项\n`);