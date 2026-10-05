'use strict';

/**
 * T1.3 本地音频信号提取冒烟测试
 *
 * 无 ffmpeg 环境：仅验证纯函数解析/归一化 + 结构化失败路径（exit 0）。
 * 有 ffmpeg 环境：合成一段「响—静—响」音频，跑通 extractSignals 真实链路。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const {
  parseSilences,
  parseLoudness,
  parseIntegratedLufs,
  normalizeLoudnessPoints,
  bucketize,
  applySilence,
  deriveEmotion,
  buildSignals,
  normalizeSignals,
  extractSignals,
} = require('../local-signals');
const { ffmpegPath } = require('../local-highlights');

let checks = 0;
function assert(cond, message) {
  checks += 1;
  if (!cond) throw new Error(`assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  checks += 1;
  if (actual !== expected) throw new Error(`assertion failed: ${message} (expected ${expected}, got ${actual})`);
}

const SILENCE_LOG = [
  '[silencedetect @ 0x7f] silence_start: 2.5',
  '[silencedetect @ 0x7f] silence_end: 6.02 | silence_duration: 3.52',
  '[silencedetect @ 0x7f] silence_start: 9',
];

const LOUDNESS_LOG = [
  'frame:0    pts:0       pts_time:0',
  'lavfi.r128.M=-70.5',
  'frame:1    pts:4800    pts_time:0.1',
  'lavfi.r128.M=-22.0',
  'frame:2    pts:9600    pts_time:0.2',
  'lavfi.r128.M=-18.0',
  'frame:3    pts:14400   pts_time:0.3',
  'lavfi.r128.M=-inf',
  'lavfi.r128.I=-16.4',
].join('\n');

async function main() {
  // ① 静音解析：成对闭合 + 未闭合用 duration 收尾
  const silences = parseSilences(SILENCE_LOG, 12);
  assertEqual(silences.length, 2, 'silences paired');
  assertEqual(silences[0].start, 2.5, 'first silence start');
  assertEqual(silences[0].end, 6.02, 'first silence end');
  assertEqual(silences[1].end, 12, 'dangling silence closed at duration');
  assertEqual(parseSilences(SILENCE_LOG, 0).length, 1, 'dangling dropped without duration');

  // ② 响度解析：pts_time 关联 + -inf 兜底
  const points = parseLoudness(LOUDNESS_LOG);
  assertEqual(points.length, 4, 'loudness points parsed');
  assertEqual(points[0].time, 0, 'point time from pts_time');
  assertEqual(points[1].lufs, -22, 'point lufs parsed');
  assertEqual(points[3].lufs, -120, 'silence treated as -120');
  assertEqual(parseIntegratedLufs(LOUDNESS_LOG), -16.4, 'integrated lufs parsed');

  // ③ 动态归一化：把 p05..p95 拉到 0..1
  const norm = normalizeLoudnessPoints([
    { time: 0, lufs: -30 }, { time: 1, lufs: -25 },
    { time: 2, lufs: -20 }, { time: 3, lufs: -15 },
    { time: 4, lufs: -10 }, { time: 5, lufs: -10 },
  ]);
  assert(norm.every((p) => p.value >= 0 && p.value <= 1), 'normalized within 0..1');
  assertEqual(norm[norm.length - 1].value, 1, 'loudest maps to 1');

  // ④ 桶聚合取峰值
  const windows = bucketize(norm, { windowSec: 2, duration: 6 });
  assertEqual(windows.length, 3, 'bucketized into 3 windows');
  assertEqual(windows[2].end, 6, 'last window clamped to duration');
  assertEqual(windows[2].value, 1, 'bucket keeps peak');

  // ⑤ 静音抑制 + 情绪派生
  const quieted = applySilence([{ start: 0, end: 4, value: 0.9 }], [{ start: 0, end: 4 }]);
  assertEqual(quieted[0].value, 0, 'fully silent window zeroed');
  const emotion = deriveEmotion(
    [{ start: 0, end: 3, value: 0.2 }, { start: 3, end: 6, value: 0.8 }],
    [{ start: 0, end: 3, value: 0.85 }, { start: 3, end: 6, value: 0.8 }],
  );
  assertEqual(emotion.length, 1, 'only high-band spike flagged');
  assertEqual(emotion[0].kind, 'laughter', 'emotion kind');
  assertEqual(emotion[0].start, 0, 'emotion window start');

  // ⑥ buildSignals 端到端（纯函数）
  const built = buildSignals({
    fullPoints: parseLoudness(LOUDNESS_LOG),
    bandPoints: parseLoudness(LOUDNESS_LOG),
    silences,
    duration: 12,
    integratedLufs: -16.4,
    windowSec: 3,
  });
  assert(Array.isArray(built.loudness) && built.loudness.length > 0, 'buildSignals loudness');
  assertEqual(built.integratedLufs, -16.4, 'buildSignals keeps integrated lufs');
  assertEqual(built.silences.length, 2, 'buildSignals keeps silences');

  // ⑦ 外部 signals 清洗：坏数据被剔除
  const cleaned = normalizeSignals({
    loudness: [{ start: 1, end: 2, value: 0.5 }, { start: 3, end: 2, value: 0.5 }, { nope: 1 }],
    emotion: [{ start: 1, end: 2, value: 2, kind: 'laughter' }],
  });
  assertEqual(cleaned.loudness.length, 1, 'invalid loudness dropped');
  assertEqual(cleaned.loudness[0].value, 0.5, 'valid loudness kept');
  assertEqual(cleaned.emotion[0].value, 1, 'emotion value clamped');
  assertEqual(cleaned.emotion[0].kind, 'laughter', 'emotion kind kept');

  // ⑧ 结构化失败：无 ffmpeg / 输入缺失
  let code = '';
  try {
    await extractSignals({ inputPath: 'x.mp4', ffmpegPath: '' });
  } catch (err) {
    code = err && err.code ? err.code : '';
  }
  assertEqual(code, 'NO_FFMPEG', 'no ffmpeg yields structured error');

  const bin = ffmpegPath();
  if (bin) {
    code = '';
    try {
      await extractSignals({ inputPath: path.join(os.tmpdir(), 'clipop-missing-input.mp4'), ffmpegPath: bin });
    } catch (err) {
      code = err && err.code ? err.code : '';
    }
    assertEqual(code, 'SIGNALS_INPUT_MISSING', 'missing input yields structured error');
  }

  // ⑨ 环境具备时跑通真实提取链路
  if (bin) {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'clipop-signals-test-'));
    const wav = path.join(tmp, 'tone.wav');
    // 0-2s 响 → 2-4s 静 → 4-6s 响
    const filter = [
      'aevalsrc=0.6*sin(2*PI*440*t):d=2[s1]',
      'anullsrc=r=16000:cl=mono:d=2[s2]',
      'aevalsrc=0.6*sin(2*PI*880*t):d=2[s3]',
      '[s1][s2][s3]concat=n=3:v=0:a=1[out]',
    ].join(';');
    await execFileAsync(
      bin,
      ['-hide_banner', '-y', '-filter_complex', filter, '-map', '[out]', '-ac', '1', '-ar', '16000', wav],
      { timeout: 60_000 },
    );
    const live = await extractSignals({ inputPath: wav, ffmpegPath: bin, duration: 6, windowSec: 1 });
    assert(Array.isArray(live.loudness), 'live loudness array');
    assert(live.loudness.length > 0, 'live loudness non-empty');
    assert(live.silences.length >= 1, 'live silence detected');
    const allValues = live.loudness.map((w) => w.value);
    assert(allValues.every((v) => v >= 0 && v <= 1), 'live values normalized');
    console.log(
      `[live] signals ready: loudness=${live.loudness.length}, emotion=${live.emotion.length}, ` +
        `silences=${live.silences.length}, points=${live.stats.loudnessPoints}`,
    );
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  } else {
    console.log('[skip] 未检测到 ffmpeg，跳过真实信号提取');
  }

  console.log(`local-signals test passed (${checks} assertions)`);
}

main().catch((err) => {
  console.error(`local-signals test failed: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
