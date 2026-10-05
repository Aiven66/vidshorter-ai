'use strict';

/**
 * 本地高光打分与规划（P0-2 意图可控高光）
 *
 * 纯函数模块：不依赖 Electron / fs / 子进程，便于单测与复用。
 *
 * 输入 ASR cues（可选词级时间戳与信号），输出已经过「用户规则约束」的候选片段：
 *  - keep 规则命中 → 强制入选、score 置顶，并附可解释的 reason
 *  - drop 规则命中 → 硬剔除；与 drop 时间区间部分重叠时先裁剪，剩余不足 minLen 才丢弃
 *  - 没有任何 ASR cues 时不猜测内容，返回 usedFallback=true，交由调用方走均匀取点兜底
 *
 * 信号说明（后续 P0-1/P0-2 的音频分析可逐步接入，缺省即不参与打分）：
 *  - signals.loudness: [{ start, end, value }]  value 归一到 0..1
 *  - signals.emotion:  [{ start, end, kind, value }]  kind 如 'laughter'
 *  - cue.speaker: number（说话人分离可用时）
 */

const DEFAULT_PREFS = {
  clipCount: 'auto',
  minLen: 20,
  maxLen: 60,
  hookFirstSeconds: 3,
  keepPunchlines: true,
  stripFillers: true,
};

/** 打分权重：ASR 语义与 keep 规则权重最高，其余信号作为加成。 */
const WEIGHTS = {
  keepKeyword: 100,
  keepRange: 90,
  keepSpeaker: 80,
  punchline: 18,
  loudness: 14,
  laughter: 12,
  pace: 8,
  hook: 6,
};

/** reason 文案：按 locale 输出，UI 可直接展示。 */
const LABELS = {
  zh: {
    keepKeyword: (k) => `含关键词：${k}`,
    keepRange: () => '命中保留区间',
    keepSpeaker: (s) => `匹配说话人 ${s}`,
    punchline: () => '金句',
    loudness: () => '响度峰值',
    laughter: () => '笑声/情绪高点',
    pace: () => '语速突变',
    hook: (n) => `开头 ${n}s 有钩子`,
  },
  en: {
    keepKeyword: (k) => `Keyword: ${k}`,
    keepRange: () => 'Inside keep range',
    keepSpeaker: (s) => `Speaker ${s} matched`,
    punchline: () => 'Punchline',
    loudness: () => 'Loudness peak',
    laughter: () => 'Laughter / emotion peak',
    pace: () => 'Speech pace shift',
    hook: (n) => `Hook within first ${n}s`,
  },
};

/** 口头禅/语气词：用于去填充词与金句判定（中英常用）。 */
const FILLERS = [
  '嗯', '呃', '啊', '那个', '这个', '就是', '然后', '其实', '反正', '你知道',
  'um', 'uh', 'erm', 'like', 'you know', 'i mean', 'basically', 'actually',
];

function labelsFor(locale) {
  return String(locale || '').toLowerCase().startsWith('zh') ? LABELS.zh : LABELS.en;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round3(v) {
  return Math.round(Number(v) * 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* 容错归一化                                                          */
/* ------------------------------------------------------------------ */

function normalizePrefs(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const wantCount = src.clipCount;
  const clipCount = wantCount === 'auto' || !isFiniteNumber(wantCount)
    ? 'auto'
    : clamp(Math.round(wantCount), 1, 12);
  const minLen = clamp(isFiniteNumber(src.minLen) ? src.minLen : DEFAULT_PREFS.minLen, 5, 300);
  const maxLen = clamp(isFiniteNumber(src.maxLen) ? src.maxLen : DEFAULT_PREFS.maxLen, minLen, 600);
  return {
    clipCount,
    minLen,
    maxLen,
    hookFirstSeconds: clamp(
      isFiniteNumber(src.hookFirstSeconds) ? src.hookFirstSeconds : DEFAULT_PREFS.hookFirstSeconds,
      0,
      30,
    ),
    keepPunchlines: src.keepPunchlines !== false,
    stripFillers: src.stripFillers !== false,
    ...(isFiniteNumber(src.keepSpeaker) ? { keepSpeaker: src.keepSpeaker } : {}),
  };
}

function normalizeRule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind;
  if (kind === 'keyword') {
    const text = String(raw.text || '').trim();
    return text ? { kind: 'keyword', text } : null;
  }
  if (kind === 'timeRange') {
    const start = Number(raw.start);
    const end = Number(raw.end);
    if (!isFiniteNumber(start) || !isFiniteNumber(end)) return null;
    if (end <= start) return null;
    return { kind: 'timeRange', start: Math.max(0, start), end: Math.max(0, end) };
  }
  if (kind === 'speaker') {
    const speaker = Number(raw.speaker);
    if (!isFiniteNumber(speaker)) return null;
    return { kind: 'speaker', speaker };
  }
  return null;
}

function normalizeRules(raw, profileId) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const keep = (Array.isArray(src.keep) ? src.keep : []).map(normalizeRule).filter(Boolean);
  const drop = (Array.isArray(src.drop) ? src.drop : []).map(normalizeRule).filter(Boolean);
  return {
    profileId: String((src.profileId ?? profileId) || 'default'),
    keep,
    drop,
    prefs: normalizePrefs(src.prefs),
  };
}

function normalizeCues(cues) {
  if (!Array.isArray(cues)) return [];
  const out = [];
  for (const cue of cues) {
    if (!cue || typeof cue !== 'object') continue;
    const start = Number(cue.start);
    const end = Number(cue.end);
    if (!isFiniteNumber(start) || !isFiniteNumber(end) || end <= start) continue;
    const item = { start, end, text: String(cue.text || '').trim() };
    if (isFiniteNumber(Number(cue.speaker))) item.speaker = Number(cue.speaker);
    out.push(item);
  }
  return out.sort((a, b) => a.start - b.start);
}

function normalizeWords(words) {
  if (!Array.isArray(words)) return [];
  const out = [];
  for (const w of words) {
    if (!w || typeof w !== 'object') continue;
    const start = Number(w.start);
    const end = Number(w.end);
    const text = String(w.text || '').trim();
    if (!isFiniteNumber(start) || !isFiniteNumber(end) || end < start || !text) continue;
    out.push({ start, end, text });
  }
  return out.sort((a, b) => a.start - b.start);
}

/* ------------------------------------------------------------------ */
/* 文本工具                                                            */
/* ------------------------------------------------------------------ */

function stripFillers(text, locale) {
  let out = String(text || '');
  const list = String(locale || '').toLowerCase().startsWith('zh')
    ? FILLERS.filter((f) => /[\u4e00-\u9fff]/.test(f))
    : FILLERS.filter((f) => !/[\u4e00-\u9fff]/.test(f));
  for (const f of list) {
    const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(^|\\s|[，,。.!！?？、])${escaped}(?=\\s|[，,。.!！?？、]|$)`, 'gi'), '$1');
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** 金句启发式：短句 + 强收尾（感叹/反问/引号），或含转折强调词。 */
function looksLikePunchline(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  const chars = t.replace(/\s/g, '').length;
  if (chars < 6 || chars > 60) return false;
  const strongEnd = /[！!？?]\s*$/.test(t);
  const quoted = /[“”"「」]/.test(t);
  const emphasis = /(其实|关键|最重要|记住|一定|千万|核心|secret|key|never|always)/i.test(t);
  return strongEnd || quoted || emphasis;
}

function joinText(cues) {
  return cues.map((c) => c.text).filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim();
}

function buildTitle(text, index, prefs, locale) {
  const cleaned = prefs.stripFillers ? stripFillers(text, locale) : String(text || '');
  const flat = cleaned.replace(/\s+/g, ' ').trim();
  if (!flat) return `Highlight ${index}`;
  return flat.length > 24 ? `${flat.slice(0, 24)}…` : flat;
}

/* ------------------------------------------------------------------ */
/* 区间工具                                                            */
/* ------------------------------------------------------------------ */

function overlapLen(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** 从 [start,end] 中减去所有 drop 区间，返回长度最大的剩余子区间（无剩余返回 null）。 */
function subtractRanges(start, end, ranges) {
  let segments = [[start, end]];
  for (const r of ranges) {
    const next = [];
    for (const [s, e] of segments) {
      const cut = overlapLen(s, e, r.start, r.end);
      if (cut <= 0) {
        next.push([s, e]);
        continue;
      }
      if (r.start > s) next.push([s, Math.min(e, r.start)]);
      if (r.end < e) next.push([Math.max(s, r.end), e]);
    }
    segments = next;
  }
  if (!segments.length) return null;
  let best = segments[0];
  for (const seg of segments) {
    if (seg[1] - seg[0] > best[1] - best[0]) best = seg;
  }
  return { start: best[0], end: best[1] };
}

/* ------------------------------------------------------------------ */
/* 候选窗口与打分                                                      */
/* ------------------------------------------------------------------ */

/** 无显式条数时的片长自适应（与 local-highlights 的均匀兜底口径保持一致）。 */
function pickAutoCount(durationSec) {
  const d = Math.max(0, Math.floor(durationSec || 0));
  if (d >= 2 * 60 * 60) return 10;
  if (d >= 90 * 60) return 9;
  if (d >= 60 * 60) return 8;
  if (d >= 40 * 60) return 7;
  if (d >= 25 * 60) return 6;
  if (d >= 15 * 60) return 5;
  if (d >= 8 * 60) return 4;
  return 3;
}

function pickAutoLen(durationSec) {
  const d = Math.max(0, Math.floor(durationSec || 0));
  if (d <= 8 * 60) return 35;
  if (d <= 20 * 60) return 50;
  return 60;
}

/** 以某个 cue 为锚点开窗：从锚点起向后取目标时长，再夹到 [minLen, maxLen] 与全片范围内。 */
function windowAroundCue(cue, prefs, duration) {
  const target = clamp(pickAutoLen(duration), prefs.minLen, prefs.maxLen);
  const start = clamp(cue.start, 0, Math.max(0, duration - prefs.minLen));
  const end = clamp(start + target, start + prefs.minLen, Math.min(duration || start + target, start + prefs.maxLen));
  return { start, end };
}

/** 按 cue 生成候选窗口，并把落在同一窗口内的相邻 cue 合并（避免重复候选）。 */
function buildCandidates(cues, prefs, duration) {
  const out = [];
  for (const cue of cues) {
    const win = windowAroundCue(cue, prefs, duration);
    const last = out[out.length - 1];
    if (last && win.start < last.end - 0.5) {
      last.end = Math.max(last.end, win.end);
      last.cues.push(cue);
      continue;
    }
    out.push({ start: win.start, end: win.end, cues: [cue] });
  }
  return out.map((c) => ({ ...c, end: Math.min(duration || c.end, c.end) }));
}

/** 计算窗口内的局部信号峰值（响度/情绪），无信号时为 0。 */
function peakSignal(signals, start, end) {
  const list = Array.isArray(signals) ? signals : [];
  let peak = 0;
  for (const s of list) {
    if (!s || !isFiniteNumber(Number(s.start)) || !isFiniteNumber(Number(s.end))) continue;
    if (overlapLen(start, end, Number(s.start), Number(s.end)) <= 0) continue;
    const v = Number(s.value);
    if (isFiniteNumber(v) && v > peak) peak = v;
  }
  return clamp(peak, 0, 1);
}

/** 窗口语速相对全片基准的突变倍数（无词级时间戳时返回 0）。 */
function paceShift(words, start, end) {
  if (!words.length) return 0;
  const span = Math.max(0.001, end - start);
  const inWin = words.filter((w) => overlapLen(start, end, w.start, w.end) > 0).length;
  const localRate = inWin / span;
  const total = words.length;
  const globalSpan = Math.max(0.001, words[words.length - 1].end - words[0].start);
  const globalRate = total / globalSpan;
  if (!globalRate) return 0;
  return localRate / globalRate;
}

/**
 * 对单个候选窗口打分。
 * 返回 { score, reason[] }；drop 规则的剔除/裁剪在 planHighlights 中先行处理。
 */
function scoreClip(candidate, { rules, prefs, words, signals, locale, duration }) {
  const label = labelsFor(locale);
  const cues = candidate.cues || [];
  const text = joinText(cues);
  const reasons = [];
  let score = 0;

  // ① keep 规则（强制入选，权重最高）
  let forced = false;
  const keepKeywords = rules.keep
    .filter((r) => r.kind === 'keyword')
    .map((r) => r.text)
    .filter((k) => text.toLowerCase().includes(k.toLowerCase()));
  if (keepKeywords.length) {
    forced = true;
    score += WEIGHTS.keepKeyword;
    reasons.push(label.keepKeyword(keepKeywords.join('、')));
  }
  const keepRanges = rules.keep.filter(
    (r) => r.kind === 'timeRange' && overlapLen(candidate.start, candidate.end, r.start, r.end) >= prefs.hookFirstSeconds,
  );
  if (keepRanges.length) {
    forced = true;
    score += WEIGHTS.keepRange;
    reasons.push(label.keepRange());
  }
  const keepSpeakers = rules.keep.filter((r) => r.kind === 'speaker');
  if (keepSpeakers.length) {
    const hit = cues.some((c) => keepSpeakers.some((r) => r.speaker === c.speaker));
    if (hit) {
      forced = true;
      score += WEIGHTS.keepSpeaker;
      const speaker = cues.find((c) => keepSpeakers.some((r) => r.speaker === c.speaker));
      reasons.push(label.keepSpeaker(speaker ? speaker.speaker : keepSpeakers[0].speaker));
    }
  }
  if (prefs.keepSpeaker !== undefined) {
    if (cues.some((c) => c.speaker === prefs.keepSpeaker)) {
      forced = true;
      score += WEIGHTS.keepSpeaker;
      reasons.push(label.keepSpeaker(prefs.keepSpeaker));
    } else {
      // 指定了只保留某说话人，其余候选不参与竞争
      return { score: -1, reason: [], forced: false, excluded: true };
    }
  }

  // ② ASR 语义：金句
  if (prefs.keepPunchlines && looksLikePunchline(text)) {
    score += WEIGHTS.punchline;
    reasons.push(label.punchline());
  }

  // ③ 响度峰值
  const loud = peakSignal(signals && signals.loudness, candidate.start, candidate.end);
  if (loud >= 0.6) {
    score += WEIGHTS.loudness * loud;
    reasons.push(label.loudness());
  }

  // ④ 笑声/情绪高点
  const emo = peakSignal(signals && signals.emotion, candidate.start, candidate.end);
  if (emo >= 0.5) {
    score += WEIGHTS.laughter * emo;
    reasons.push(label.laughter());
  }

  // ⑤ 语速突变
  const pace = paceShift(words, candidate.start, candidate.end);
  if (pace >= 1.35 || (pace > 0 && pace <= 0.65)) {
    score += WEIGHTS.pace;
    reasons.push(label.pace());
  }

  // ⑥ 开头钩子
  if (prefs.hookFirstSeconds > 0 && candidate.start <= prefs.hookFirstSeconds) {
    score += WEIGHTS.hook;
    reasons.push(label.hook(prefs.hookFirstSeconds));
  }

  // 有内容但没命中任何信号时，给一个与文本长度弱相关的基线分，避免全是 0 分导致顺序随机
  if (score === 0) score = Math.min(6, text.replace(/\s/g, '').length / 20);

  return { score: round3(score), reason: reasons, forced, excluded: false };
}

/* ------------------------------------------------------------------ */
/* 规划主流程                                                          */
/* ------------------------------------------------------------------ */

function dropReason(candidate, rules, text, locale) {
  const label = labelsFor(locale);
  const keyword = rules.drop
    .filter((r) => r.kind === 'keyword')
    .find((r) => text.toLowerCase().includes(r.text.toLowerCase()));
  if (keyword) return { kind: 'keyword', rule: keyword, reason: label.keepKeyword(keyword.text) };
  const speaker = rules.drop
    .filter((r) => r.kind === 'speaker')
    .find((r) => (candidate.cues || []).some((c) => c.speaker === r.speaker));
  if (speaker) return { kind: 'speaker', rule: speaker, reason: label.keepSpeaker(speaker.speaker) };
  return null;
}

/**
 * 规划高光片段（只规划，不渲染）。
 *
 * @returns {{ clips: Array, usedFallback: boolean, droppedCount: number }}
 */
function planHighlights({
  cues,
  words,
  duration,
  rules,
  locale,
  desiredCount,
  signals,
} = {}) {
  const normalizedRules = normalizeRules(rules, rules && rules.profileId);
  const prefs = normalizedRules.prefs;
  const safeCues = normalizeCues(cues);
  const safeWords = normalizeWords(words);
  const totalDuration = isFiniteNumber(Number(duration)) && Number(duration) > 0
    ? Number(duration)
    : (safeCues.length ? safeCues[safeCues.length - 1].end : 0);

  // 无 ASR 内容可依据 → 交由调用方走均匀取点兜底
  if (!safeCues.length || totalDuration <= 0) {
    return { clips: [], usedFallback: true, droppedCount: 0 };
  }

  const count = isFiniteNumber(Number(desiredCount)) && Number(desiredCount) > 0
    ? clamp(Math.round(Number(desiredCount)), 1, 12)
    : (prefs.clipCount === 'auto' ? pickAutoCount(totalDuration) : prefs.clipCount);

  const dropRanges = normalizedRules.drop.filter((r) => r.kind === 'timeRange');

  const candidates = [];
  let droppedCount = 0;

  for (const raw of buildCandidates(safeCues, prefs, totalDuration)) {
    let segment = { start: raw.start, end: raw.end };
    const cuesIn = raw.cues;
    const text = joinText(cuesIn);

    // drop 关键词 / 说话人：整段剔除
    if (dropReason({ cues: cuesIn }, normalizedRules, text, locale)) {
      droppedCount += 1;
      continue;
    }

    // drop 时间区间：先裁剪（含重叠片段裁剪），剩余不足 minLen 才丢弃
    if (dropRanges.length) {
      const trimmed = subtractRanges(segment.start, segment.end, dropRanges);
      if (!trimmed || trimmed.end - trimmed.start < prefs.minLen) {
        droppedCount += 1;
        continue;
      }
      segment = trimmed;
    }

    const cuesKept = cuesIn.filter((c) => overlapLen(segment.start, segment.end, c.start, c.end) > 0);
    const cand = { start: segment.start, end: segment.end, cues: cuesKept.length ? cuesKept : cuesIn };
    const scored = scoreClip(cand, {
      rules: normalizedRules,
      prefs,
      words: safeWords,
      signals,
      locale,
      duration: totalDuration,
    });
    if (scored.excluded) {
      droppedCount += 1;
      continue;
    }
    candidates.push({ ...cand, score: scored.score, reason: scored.reason, forced: scored.forced });
  }

  // 按分数排序，高分优先；同分时长者优先
  candidates.sort((a, b) => (b.score - a.score) || ((b.end - b.start) - (a.end - a.start)));

  // 贪心去重：与已选片段重叠超过较短段 40% 则跳过
  const selected = [];
  const tooClose = (a, b) => {
    const ov = overlapLen(a.start, a.end, b.start, b.end);
    const shorter = Math.min(a.end - a.start, b.end - b.start);
    return shorter > 0 && ov / shorter > 0.4;
  };
  for (const cand of candidates) {
    if (selected.some((s) => tooClose(s, cand))) continue;
    selected.push(cand);
  }

  // 配额：forced 全保留，其余按分数补足
  const forced = selected.filter((s) => s.forced);
  const others = selected.filter((s) => !s.forced);
  const room = Math.max(0, count - forced.length);
  const picked = [...forced, ...others.slice(0, room)]
    .sort((a, b) => a.start - b.start)
    .slice(0, Math.max(count, forced.length));

  const clips = picked.map((c, i) => {
    const text = joinText(c.cues);
    const wordsIn = safeWords.filter((w) => overlapLen(c.start, c.end, w.start, w.end) > 0);
    return {
      start: round3(c.start),
      end: round3(c.end),
      title: buildTitle(text, i + 1, prefs, locale),
      score: c.score,
      reason: c.reason,
      asrCues: c.cues.map((x) => ({
        start: round3(x.start),
        end: round3(x.end),
        text: x.text,
        ...(x.speaker !== undefined ? { speaker: x.speaker } : {}),
      })),
      ...(wordsIn.length
        ? { words: wordsIn.map((w) => ({ start: round3(w.start), end: round3(w.end), text: w.text })) }
        : {}),
    };
  });

  return { clips, usedFallback: false, droppedCount };
}

module.exports = {
  DEFAULT_PREFS,
  WEIGHTS,
  normalizePrefs,
  normalizeRule,
  normalizeRules,
  normalizeCues,
  normalizeWords,
  stripFillers,
  looksLikePunchline,
  subtractRanges,
  overlapLen,
  pickAutoCount,
  pickAutoLen,
  scoreClip,
  planHighlights,
};
