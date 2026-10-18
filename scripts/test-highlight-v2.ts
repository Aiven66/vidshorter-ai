/**
 * highlight-v2 评分引擎单元测试（纯 node --import tsx，零外部服务）
 *
 * 运行：node --import tsx scripts/test-highlight-v2.ts
 *
 * 覆盖：
 *  1. 信号分位数归一（极值不压扁 / 幂等 / 常量轨道）
 *  2. 区间聚合与跨族共振（单信号不采信 → 多族共振加分）
 *  3. 句子 ID 反查时间戳（意群扩展 / min 补齐 / max 收缩 / 无效引用丢弃）
 *  4. 镜头吸附 + 人声尾音守卫 + 词边界
 *  5. 四维 rubric 合成、跨批稳定性、复评门保守取低
 *  6. 重叠去重与档位
 *  7. 规则档初筛（钩子窗胜过平淡窗 / 空转写安全返回）
 *  8. 端到端管道（模型档 / 规则档 / 全无效引用）
 *  9. 协议安全：模型输入里的伪造时间戳必须被忽略
 */

import {
  runHighlightPipeline,
  ruleBasedPreScreen,
  alignSelection,
  scoreCandidates,
  sanitizeRubric,
  durationFit,
  mergeOverlaps,
  normalizeTrack,
  aggregateRange,
  resonanceFamilies,
  buildSelectionMessages,
  buildReviewMessages,
  renderCueList,
  parseSelectionResponse,
  parseReviewResponse,
  type Cue,
  type Selection,
  type SignalPoint,
  type ScoredCandidate,
} from '../src/lib/server/highlight';

let passed = 0;
let failed = 0;

function ok(cond: unknown, name: string, detail?: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function approx(a: number, b: number, tol = 0.01): boolean {
  return Math.abs(a - b) <= tol;
}

// ── 测试夹具：3 分钟中文口播逐字稿 ──────────────────────────────────────────

function makeCues(): Cue[] {
  const raw = [
    [0, 4, '大家好，欢迎来到本期节目。'],
    [4, 9, '今天我们要聊一个很多人都关心的话题。'],
    [9, 15, '为什么你每天工作十二个小时，却依然赚不到钱？'],
    [15, 21, '答案可能会让你震惊，因为核心秘密只有一个。'],
    [21, 27, '大多数人把时间卖给了别人，而真正赚钱的人在购买时间。'],
    [27, 33, '这是第一个关键认知。'],
    [33, 40, '接下来我给你三个具体方法，每一个都经过验证。'],
    [40, 47, '第一，必须把重复性工作自动化，我自己用这个方法把效率提升了三倍。'],
    [47, 54, '第二，千万别只靠一份死工资，至少建立两个收入来源。'],
    [54, 61, '第三，也是最重要的一点，持续输出内容，让机会主动找到你。'],
    [61, 68, '好，我们先喝口水，等一下继续讲后面的部分。'],
    [68, 76, '嗯，那个，接下来这段其实也没啥，就是随便聊聊天气吧。'],
    [76, 84, '今天天气确实不错，阳光明媚的，适合出去走走。'],
    [84, 92, '那我们回到正题，2024 年我测试了五十个项目，只有三个活了下来。'],
    [92, 100, '重点来了，活下来的项目都有一个共同特征，那就是复购率超过百分之四十。'],
    [100, 108, '这个数据非常关键，因为获客成本越来越高，没有复购就没有利润。'],
    [108, 116, '很多人问我，普通人现在入局还来得及吗？我的答案是肯定的。'],
    [116, 124, '但前提是你必须先跑通最小闭环，再考虑放大。'],
    [124, 132, '具体怎么跑通？第一步，找到一个真实存在的痛点。'],
    [132, 140, '第二步，用最低成本做出解决方案，哪怕是手动交付。'],
    [140, 148, '第三步，找到十个愿意付费的用户，而不是十个说不错的朋友。'],
    [148, 156, '以上就是今天的全部内容，觉得有帮助的话记得点赞关注。'],
    [156, 164, '我们下期再见，拜拜。'],
  ] as Array<[number, number, string]>;
  return raw.map(([start, end, text], i) => ({ id: `c${i}`, start, end, text }));
}

/** 在某区间造一路高信号，其余位置低值。 */
function makeSignalTrack(
  kind: SignalPoint['kind'],
  hotRange: [number, number],
  hotValue = 0.95,
  coldValue = 0.1,
): SignalPoint[] {
  const points: SignalPoint[] = [];
  for (let t = 0; t <= 170; t += 2) {
    const inHot = t >= hotRange[0] && t <= hotRange[1];
    points.push({ t, kind, value: inHot ? hotValue + (Math.random() - 0.5) * 0.04 : coldValue });
  }
  return points;
}

console.log('\n[1] 信号归一化');
{
  // 极端爆点不应抬高基线：18 个稳定低值 + 2 个中高值 + 1 个爆表值
  const raw: SignalPoint[] = [
    ...Array.from({ length: 18 }, (_, i) => ({ t: i * 10, kind: 'loudness' as const, value: 0.2 })),
    { t: 190, kind: 'loudness', value: 0.5 },
    { t: 200, kind: 'loudness', value: 0.5 },
    { t: 210, kind: 'loudness', value: 100 },
  ];
  const norm = normalizeTrack(raw);
  const baseValues = norm.filter((p) => p.t < 180).map((p) => p.value);
  ok(Math.max(...baseValues) === 0, '分位数归一：单个极值不抬高普通区间基线', `max=${Math.max(...baseValues)}`);
  ok(norm.find((p) => p.t === 190)!.value === 1, 'p95 高值簇归一到 1');
  ok(norm.find((p) => p.t === 210)!.value === 1, '极值 clamp 到 1');

  // 幂等
  const idem = normalizeTrack([{ t: 0, kind: 'loudness', value: 0.3 }, { t: 1, kind: 'loudness', value: 0.8 }]);
  ok(approx(idem[0].value, 0.3) && approx(idem[1].value, 0.8), '已归一轨道幂等');

  // 常量轨道无区分度
  const constTrack = normalizeTrack([{ t: 0, kind: 'motion', value: 0.5 }, { t: 1, kind: 'motion', value: 0.5 }]);
  ok(constTrack.every((p) => p.value === 0), '常量轨道归一为 0（无区分度）');

  // 区间聚合
  const agg = aggregateRange(
    [{ t: 0, kind: 'danmaku', value: 0.9 }, { t: 5, kind: 'danmaku', value: 0.2 }, { t: 9, kind: 'danmaku', value: 0.8 }],
    'danmaku',
    0,
    10,
  );
  ok(agg !== null && approx(agg.peak, 0.9) && agg.mean > 0.2, '区间聚合 peak/mean 正确', agg ? `mean=${agg.mean.toFixed(2)}` : 'null');

  // 共振：单族 vs 多族
  const single = resonanceFamilies([
    { kind: 'loudness', family: 'audio', peak: 0.9, mean: 0.5, coverage: 0.5 },
    { kind: 'speechRate', family: 'audio', peak: 0.8, mean: 0.4, coverage: 0.4 },
  ]);
  ok(single.count === 1, '同族多路信号只算 1 个共振族（防 BGM 误判）');
  const multi = resonanceFamilies([
    { kind: 'loudness', family: 'audio', peak: 0.9, mean: 0.5, coverage: 0.5 },
    { kind: 'danmaku', family: 'audience', peak: 0.8, mean: 0.4, coverage: 0.4 },
    { kind: 'motion', family: 'visual', peak: 0.7, mean: 0.3, coverage: 0.3 },
  ]);
  ok(multi.count === 3, '三族共振识别为 3');
}

console.log('\n[2] 句子 ID → 时间戳对齐');
{
  const cues = makeCues();

  // 基本反查（选 c2-c5，跨度 24s 已 ≥min，不触发补齐；c1/c5 均为完整句边界）
  const span = alignSelection(cues, ['c2', 'c3', 'c4', 'c5']);
  ok(span !== null && approx(span.start, 9) && approx(span.end, 33), 'cueIds 反查时间戳正确', span ? `${span.start}-${span.end}` : 'null');

  // 无效引用
  const bad = alignSelection(cues, ['c999']);
  ok(bad === null, '全部无效的 cueIds 返回 null（绝不伪造时间）');
  const partial = alignSelection(cues, ['c2', 'c999']);
  ok(partial !== null && partial.missingCueIds.includes('c999'), '部分无效引用：保留有效部分并记录缺失');

  // 意群扩展：c5「这是第一个关键认知。」本身是完整句，c4 末尾是句号 → c4/c5 边界
  const sentence = alignSelection(cues, ['c5']);
  ok(sentence !== null && sentence.start >= 21, '单句选择向前扩展到句意起点', sentence ? `start=${sentence.start}` : 'null');

  // min 补齐：单条 6s cue 必须被补到 ≥21s
  const padded = alignSelection(cues, ['c0'], { window: { target: 28, min: 21, max: 35 } });
  ok(padded !== null && padded.end - padded.start >= 21, '不足最小时长自动补齐 cues', padded ? `len=${padded.end - padded.start}` : 'null');
  ok(padded !== null && padded.guards.durationAdjusted === true, '补齐动作写入 guards.durationAdjusted');

  // max 收缩：选很多 cue 超过 35s
  const many = alignSelection(cues, ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'], { window: { target: 28, min: 21, max: 35 } });
  ok(many !== null && many.end - many.start <= 35.5, '超过最大时长从两端收缩', many ? `len=${many.end - many.start}` : 'null');

  // 镜头吸附：切点附近 0.6s 内有镜头边界
  const snap = alignSelection(cues, ['c2', 'c3', 'c4'], {
    window: { target: 28, min: 21, max: 40 },
    shotBoundaries: [8.7, 33.4],
  });
  ok(snap !== null && snap.guards.shot === true, '镜头边界在半径内被吸附', snap ? JSON.stringify(snap.guards) : 'null');

  // 人声守卫：切点落在人声外且 0.5s 内有人声边缘时拉回
  const guarded = alignSelection(
    cues.map((c) => (c.id === 'c2' ? { ...c, start: 9.3, words: [{ t: 9.3, text: '为什么' }] } : c)),
    ['c2', 'c3', 'c4'],
    { window: { target: 28, min: 21, max: 40 }, voiceSegments: [{ start: 9.4, end: 33 }] },
  );
  ok(guarded !== null && guarded.guards.voice === true, '人声尾音守卫生效', guarded ? JSON.stringify(guarded.guards) : 'null');
}

console.log('\n[3] 评分器 rubric');
{
  const cues = makeCues();
  const signals = [
    ...makeSignalTrack('loudness', [84, 108]),
    ...makeSignalTrack('danmaku', [92, 108]),
    ...makeSignalTrack('motion', [40, 54], 0.4, 0.2), // 弱视觉信号，不构成共振
  ];
  // 预处理由 pipeline 做；这里直接给已归一信号（makeSignalTrack 已是 0..1）
  const byT = new Map<SignalPoint['kind'], SignalPoint[]>();
  for (const p of signals) {
    const list = byT.get(p.kind);
    if (list) list.push(p);
    else byT.set(p.kind, [p]);
  }
  const range = (s: number, e: number) => {
    const out = [];
    for (const [, pts] of byT) {
      const agg = aggregateRange(pts, pts[0].kind, s, e);
      if (agg) out.push(agg);
    }
    return out;
  };
  const reso = (rs: ReturnType<typeof range>) => resonanceFamilies(rs).count;

  const hot: Selection = {
    cueIds: ['c13', 'c14', 'c15'],
    rubric: { hook: 8.5, density: 8, structure: 8, virality: 7 },
    reason: '数据结论配合反问，是全片最强传播点',
    tags: ['金句', '数据'],
  };
  const bland: Selection = {
    cueIds: ['c10', 'c11', 'c12'],
    rubric: { hook: 4, density: 4, structure: 6, virality: 3.5 },
    reason: '闲聊段落',
  };

  const scored = scoreCandidates(
    cues,
    [
      { selection: hot, engine: 'cloud-llm' },
      { selection: bland, engine: 'cloud-llm' },
    ],
    range,
    reso,
    { locale: 'zh', window: { target: 28, min: 21, max: 35 } },
  );

  ok(scored.length === 2, '两个候选均产出');
  const top = scored.find((c) => c.cueIds.includes('c13'))!;
  const low = scored.find((c) => c.cueIds.includes('c10'))!;
  ok(top && low && top.score > low.score, '高能段分数高于闲聊段', `${top?.score} vs ${low?.score}`);
  ok(top.score >= 8, '高能段进入 8+ 分区', `score=${top.score}`);
  ok(top.resonanceFamilies >= 2, '高能段音频+观众双族共振', `families=${top.resonanceFamilies}`);
  const viralityContribution = top.dimensions.virality.contributions.some((x) => x.includes('共振'));
  ok(viralityContribution, '传播力贡献说明记录了共振加分');
  ok(!!top.quote && /复购|项目/.test(top.quote), '引用原话证据来自 cue 文本（非模型编造）', top.quote);
  ok(/「.+」/.test(top.reason), '理由附带原话引用', top.reason);
  ok(['strong', 'recommend'].includes(top.tier), '高能段档位为推荐以上', top.tier);

  // 分数边界
  ok(scored.every((c) => c.score >= 1 && c.score <= 10), '所有分数在 1..10');

  // 跨批稳定性：同一候选单独成批 vs 与强手同批，整数分差 ≤1
  const solo = scoreCandidates(cues, [{ selection: hot, engine: 'cloud-llm' }], range, reso, {
    locale: 'zh',
    window: { target: 28, min: 21, max: 35 },
  })[0];
  ok(Math.abs(solo.score - top.score) <= 1, '跨批校准只造成 ≤1 分漂移（跨视频可比）', `${solo.score} vs ${top.score}`);

  // 时长适配：甜蜜区 [21,35] 满分；越短/越长线性衰减（scale = 28）
  ok(
    approx(durationFit(28), 1) && approx(durationFit(21), 1) && approx(durationFit(35), 1),
    'durationFit：21-35s 甜蜜区满分',
  );
  ok(approx(durationFit(10), 0.607, 0.02), 'durationFit：10s 偏短衰减', durationFit(10).toFixed(2));
  ok(durationFit(60) < durationFit(10) && durationFit(10) < durationFit(28), 'durationFit：偏离越远分越低');

  // hook 只认真实开头窗口：峰值在尾部不得加 hook 分
  const selHead: Selection = { cueIds: ['c13', 'c14', 'c15'], rubric: { hook: 7, density: 6, structure: 7, virality: 6 }, reason: 'x' };
  const earlyRange = (s: number, e: number) => {
    const out = [];
    const pts = makeSignalTrack('loudness', [84, 87]);
    const agg = aggregateRange(pts, 'loudness', s, e);
    if (agg) out.push(agg);
    return out;
  };
  const lateRange = (s: number, e: number) => {
    const out = [];
    const pts = makeSignalTrack('loudness', [104, 108]);
    const agg = aggregateRange(pts, 'loudness', s, e);
    if (agg) out.push(agg);
    return out;
  };
  const earlyHook = scoreCandidates(cues, [{ selection: selHead, engine: 'rule' }], earlyRange, () => 1, {
    locale: 'zh',
    window: { target: 28, min: 21, max: 35 },
  })[0].dimensions.hook.score;
  const lateHook = scoreCandidates(cues, [{ selection: selHead, engine: 'rule' }], lateRange, () => 1, {
    locale: 'zh',
    window: { target: 28, min: 21, max: 35 },
  })[0].dimensions.hook.score;
  ok(earlyHook > lateHook, 'hook 加分只认开头 3 秒（尾部峰值不冒充钩子）', `early=${earlyHook} late=${lateHook}`);

  // sanitize
  const safe = sanitizeRubric({ hook: 99, density: 'x', structure: -5 });
  ok(safe.hook === 10 && safe.density === 0 && safe.structure === 0, 'rubric 清洗越界/非法值');
}

console.log('\n[4] 复评门与去重');
{
  const cues = makeCues();
  const noop = () => [];
  const sel: Selection = {
    cueIds: ['c13', 'c14', 'c15', 'c16'],
    rubric: { hook: 9, density: 9, structure: 8, virality: 9 },
    reason: '初评很高',
  };
  const scored = scoreCandidates(
    cues,
    [
      {
        selection: sel,
        review: { cueIds: sel.cueIds, rubric: { hook: 3, density: 8, structure: 8, virality: 4 } },
        engine: 'cloud-llm',
      },
    ],
    noop,
    () => 0,
    { locale: 'zh', window: { target: 28, min: 21, max: 35 } },
  )[0];
  ok(scored.reviewFlagged === true, '复评大分歧被标记 reviewFlagged');
  ok(scored.dimensions.hook.score <= 6, '分歧维保守取低（hook）', `hook=${scored.dimensions.hook.score}`);
  ok(/复评分歧/.test(scored.dimensions.hook.contributions.join()), '分歧维贡献说明可审计');
  ok(/人工复核/.test(scored.reason), '理由中提示人工复核');

  // 去重：两个高度重叠候选保留高分
  const a: ScoredCandidate = {
    id: 'a', cueIds: ['c2'], start: 9, end: 30, boundaryConfidence: 0.8, score: 9, rawScore: 8.6,
    percentile: 1, tier: 'strong', dimensions: {} as ScoredCandidate['dimensions'], reason: 'A', tags: ['x'],
    signals: [], resonanceFamilies: 0, reviewFlagged: false, engine: 'rule',
  };
  const b: ScoredCandidate = {
    ...a, id: 'b', start: 10, end: 28, score: 6, rawScore: 5.8, percentile: 0, tier: 'caution', reason: 'B', tags: ['y'],
  };
  const merged = mergeOverlaps([a, b]);
  ok(merged.length === 1 && merged[0].score === 9 && merged[0].tags.includes('y'), '重叠 ≥60% 去重并保留高分者');
}

console.log('\n[5] 规则档初筛（零 API Key）');
{
  const cues = makeCues();

  const picked = ruleBasedPreScreen(cues, [], { count: 6, locale: 'zh' });
  ok(picked.length >= 4, '规则档产出候选', `count=${picked.length}`);
  ok(picked.every((p) => p.cueIds.length > 0 && p.rubric.hook >= 0), '规则档输出合法 Selection 协议');

  // 含提问/秘密/必须 的金句区（c2-c9）应比天气闲聊区（c11-c12）排名更靠前
  const strongIdx = picked.findIndex((p) => p.cueIds.some((id) => ['c2', 'c3', 'c4', 'c8'].includes(id)));
  const blandIdx = picked.findIndex((p) => p.cueIds.some((id) => ['c11', 'c12'].includes(id)));
  ok(strongIdx !== -1, '钩子/金句区被规则档选中');
  if (strongIdx !== -1 && blandIdx !== -1) {
    ok(strongIdx < blandIdx, '金句区排在闲聊区之前');
  }

  // 信号共振让规则档更偏好高能区
  const withSignals = ruleBasedPreScreen(
    cues,
    [...makeSignalTrack('loudness', [84, 108]), ...makeSignalTrack('danmaku', [92, 108])],
    { count: 6 },
  );
  const hit = withSignals.find((p) => p.cueIds.some((id) => ['c13', 'c14', 'c15'].includes(id)));
  ok(!!hit && (hit.tags?.includes('多信号共振') || hit.tags?.includes('观众高能')), '共振区间被规则档识别并标注', hit?.tags?.join(','));

  // 空转写
  ok(ruleBasedPreScreen([]).length === 0, '空 cues 安全返回空数组');
}

console.log('\n[6] 端到端管道');
{
  const cues = makeCues();
  const signals = [
    ...makeSignalTrack('loudness', [84, 108]),
    ...makeSignalTrack('danmaku', [92, 108]),
    ...makeSignalTrack('laughter', [47, 54], 0.8, 0.15),
  ];

  // 模型档
  const modelResult = runHighlightPipeline(cues, {
    signals,
    engine: 'cloud-llm',
    selections: [
      { cueIds: ['c13', 'c14', 'c15'], rubric: { hook: 8, density: 8.5, structure: 7.5, virality: 8 }, reason: '数据爆点', tags: ['数据'] },
      { cueIds: ['c7', 'c8', 'c9'], rubric: { hook: 7, density: 7.5, structure: 7, virality: 6.5 }, reason: '方法论干货' },
      { cueIds: ['c11', 'c12'], rubric: { hook: 3, density: 3, structure: 6, virality: 3 }, reason: '闲聊' },
    ],
    locale: 'zh',
    desiredCount: 6,
  });
  ok(modelResult.engine === 'cloud-llm', '引擎档标记为 cloud-llm');
  ok(modelResult.candidates.length === 3, '三个模型候选全部产出');
  ok(modelResult.candidates[0].cueIds.join(',').includes('c13'), '数据爆点排第一', modelResult.candidates[0].cueIds.join(','));
  ok(modelResult.candidates[0].start >= 84 && modelResult.candidates[0].end <= 110, '时间戳来自逐字稿反查');
  ok(modelResult.candidates.every((c) => c.end - c.start >= 15), '候选均为有效成片时长');
  const top = modelResult.candidates[0];
  ok(top.resonanceFamilies >= 2 && /共振|弹幕|互动/.test(top.dimensions.virality.contributions.join()), '共振证据进入传播力维度');
  ok(top.dimensions.hook.modelScore !== undefined, '维度保留模型初评用于审计');

  // 规则档（不传 selections）
  const ruleResult = runHighlightPipeline(cues, { signals, desiredCount: 6, locale: 'zh' });
  ok(ruleResult.engine === 'rule' && ruleResult.warnings.includes('engine-fallback-rule'), '无 selections 自动回落规则档并告警');
  ok(ruleResult.candidates.length >= 4, '规则档端到端产出候选');
  ok(ruleResult.candidates.every((c) => c.score >= 1 && c.score <= 10 && c.reason), '规则档候选分数与理由齐全');

  // 全无效引用 → 空结果不崩溃
  const empty = runHighlightPipeline(cues, { selections: [{ cueIds: ['x1'], rubric: { hook: 9, density: 9, structure: 9, virality: 9 }, reason: 'bad' }] });
  ok(empty.candidates.length === 0, '全无效引用安全产出空列表');

  // 空 cues
  const noCues = runHighlightPipeline([], { signals });
  ok(noCues.candidates.length === 0 && noCues.warnings.includes('empty-cues'), '空转写安全降级');

  // 英文 locale
  const en = runHighlightPipeline(cues, {
    selections: [{ cueIds: ['c13', 'c14', 'c15'], rubric: { hook: 8, density: 8, structure: 7, virality: 8 }, reason: 'Data spike' }],
    locale: 'en',
  });
  ok(/: "/.test(en.candidates[0].reason) || /[A-Za-z]/.test(en.candidates[0].reason), '英文理由正常生成', en.candidates[0].reason);
}

console.log('\n[7] 协议安全：模型伪造时间戳必须被忽略');
{
  const cues = makeCues();
  // 模型越权在 JSON 里塞时间字段（运行时可能来自 JSON.parse，绕过 TS 类型）
  const malicious = JSON.parse(JSON.stringify({
    cueIds: ['c2', 'c3'],
    rubric: { hook: 8, density: 8, structure: 7, virality: 7 },
    reason: 'x',
    start_time: 9999,
    start: 9999,
    end: 8888,
  })) as Selection;
  const result = runHighlightPipeline(cues, { selections: [malicious] });
  const c = result.candidates[0];
  ok(c && c.start < 30 && c.end <= 30, '模型输出的伪造时间戳不生效，时间只来自 cues', `start=${c?.start} end=${c?.end}`);
}

console.log('\n[8] LLM 选段 JSON 协议');
{
  const cues = makeCues();
  const knownIds = cues.map((c) => c.id);

  // prompt 侧：逐字稿渲染不含时间信息，只给编号/说话人/情绪/文本
  const rendered = renderCueList(cues);
  ok(/^\[c0\]/.test(rendered) && !/\b\d{1,3}:\d{2}\b/.test(rendered), 'cue 渲染不含 mm:ss 时间码');
  const messages = buildSelectionMessages(cues, { desiredCount: 6, locale: 'zh' });
  ok(messages.length === 2 && messages[0].role === 'system' && messages[1].role === 'user', '选段 messages 结构');
  ok(/严禁输出时间戳/.test(messages[0].content) && /cueIds/.test(messages[1].content), 'system 明示时间戳禁令 + user 给 JSON 格式');
  ok(!/start|end|秒/.test(rendered), '发给模型的逐字稿不含任何时间提示');

  // 正常 JSON
  const normal = parseSelectionResponse(
    '{"selections":[{"cueIds":["c2","c3"],"rubric":{"hook":8.5,"density":8,"structure":7,"virality":7},"reason":"反问钩子","tags":["提问"]}]}',
    knownIds,
  );
  ok(normal.selections.length === 1 && normal.selections[0].cueIds[1] === 'c3', '标准 JSON 解析');
  ok(normal.selections[0].rubric.hook === 8.5 && normal.selections[0].tags?.[0] === '提问', 'rubric/tags 正确保留');

  // markdown 围栏 + 前后解释文字 + 尾随逗号
  const fenced = parseSelectionResponse(
    '好的，结果如下：\n```json\n{"selections":[{"cueIds":["c13","c14"],"rubric":{"hook":9,"density":8,"structure":8,"virality":8,},"reason":"数据",},]}\n```\n以上。',
    knownIds,
  );
  ok(fenced.selections.length === 1 && fenced.selections[0].cueIds[0] === 'c13', 'markdown 围栏 + 解释文字 + 尾随逗号容错');

  // 脏数据：数字 cueIds / 越界 rubric / 非法 tags
  const dirty = parseSelectionResponse(
    '{"selections":[{"cueIds":[2,"c3",null,"c3"],"rubric":{"hook":99,"density":"x"},"reason":"  ","tags":"金句"},{"cueIds":[],"rubric":{},"reason":"x"}]}',
    knownIds,
  );
  ok(dirty.selections.length === 1, '无 cueIds 条目被丢弃（保留另一条）');
  ok(dirty.selections[0].cueIds.join(',') === '2,c3', 'cueIds 字符串化 + 去重', dirty.selections[0].cueIds.join(','));
  ok(dirty.selections[0].rubric.hook === 10 && dirty.selections[0].rubric.density === 0, 'rubric 越界/非法被 sanitize');
  ok(dirty.selections[0].reason === '' && (!dirty.selections[0].tags || dirty.selections[0].tags.length === 0), '空 reason 与非法 tags 安全回落');

  // 未知 cueId：告警但保留（align 层裁决）
  const unknown = parseSelectionResponse('{"selections":[{"cueIds":["c2","c999"],"rubric":{"hook":7,"density":7,"structure":7,"virality":7}}]}', knownIds);
  ok(unknown.selections.length === 1 && unknown.warnings.some((w) => w.includes('unknown-cue:c999')), '未知 cueId 告警不剔除');

  // 白名单：伪造时间字段被剥离
  const sneaky = parseSelectionResponse(
    '{"selections":[{"cueIds":["c2"],"rubric":{"hook":7,"density":7,"structure":7,"virality":7},"start":99,"end":88,"start_time":1,"timestamp":5}]}',
    knownIds,
  );
  const obj = sneaky.selections[0] as unknown as Record<string, unknown>;
  ok(!('start' in obj) && !('end' in obj) && !('start_time' in obj) && !('timestamp' in obj), '解析白名单剥离全部时间字段');

  // max_tokens 截断修复
  const truncated = parseSelectionResponse(
    '{"selections":[{"cueIds":["c2","c3"],"rubric":{"hook":8,"density":8,"structure":7,"virality":7},"reason":"完整"},{"cueIds":["c13"],"rubric":{"hook":9,"density":',
    knownIds,
  );
  ok(truncated.selections.length === 1 && truncated.selections[0].reason === '完整', '截断 JSON 截尾修复保住完整候选');

  // 完全无法解析
  const garbage = parseSelectionResponse('我认为这个视频没有什么高光。', knownIds);
  ok(garbage.selections.length === 0 && garbage.warnings.some((w) => w.startsWith('json-parse-failed')), '非 JSON 输出安全失败并告警');

  // 盲评协议：解析 + prompt 不含初评分（防锚定）
  const reviewParsed = parseReviewResponse(
    '{"reviews":[{"cueIds":["c2","c3"],"rubric":{"hook":3,"density":7,"structure":6,"virality":4},"comment":"开场平"}]}',
    knownIds,
  );
  ok(reviewParsed.reviews.length === 1 && reviewParsed.reviews[0].rubric.hook === 3 && reviewParsed.reviews[0].comment === '开场平', '盲评 JSON 解析');
  const reviewMessages = buildReviewMessages(
    cues,
    [{ cueIds: ['c2', 'c3'], rubric: { hook: 9, density: 9, structure: 9, virality: 9 }, reason: '初评很高（不应泄露给复评）' }],
    { locale: 'zh' },
  );
  ok(/复评/.test(reviewMessages[0].content) && reviewMessages[1].content.includes('[c2]') && reviewMessages[1].content.includes('[c3]'), '盲评 prompt 包含候选原文');
  const picksArea = reviewMessages[1].content.split('#1')[1] ?? '';
  ok(!/初评很高/.test(reviewMessages[1].content) && !/rubric|hook|\b9\b/.test(picksArea), '盲评候选区不泄露初评理由与分数');
}

console.log(`\n────────────────────────────────────────`);
console.log(`highlight-v2 测试结果：${passed} 通过 / ${failed} 失败`);
if (failed > 0) {
  process.exit(1);
}
