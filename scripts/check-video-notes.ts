/**
 * 高光笔记 LLM 升级验证脚本
 * 1. parseNoteJson: 合法 JSON / markdown 围栏 / 前后杂文 / 非法 JSON / 缺字段 / level 越界
 * 2. downsampleSegments: 200 段 → ≤60 行、每行带 [MM:SS] 锚点、总字符 ≤6000、顺序保持
 * 3. generateNoteWithLLM: 未配置 COZE key → 立即返回 null（不触碰网络）；空字幕 → null
 *
 * 运行: node --import tsx scripts/check-video-notes.ts
 */
import assert from 'node:assert/strict';
import {
  parseNoteJson,
  downsampleSegments,
  generateNoteWithLLM,
} from '../src/lib/server/video-notes/llm-note-generator';

const VALID_NOTE = {
  summary: 'Overview of the video content.',
  highlights: [
    { timestamp: '00:05', startSeconds: 5, text: 'Key moment one', level: 'critical' },
    { timestamp: '00:12', startSeconds: 12, text: 'Key moment two', level: 'important' },
  ],
  takeaways: ['Takeaway one', 'Takeaway two'],
  corePoints: [
    { index: 1, title: 'Point 1', detail: 'Detail of point one', sourceTimestamps: ['00:05'], weight: 0.8 },
  ],
};

function makeSegments(count: number) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({ start: i * 2, duration: 2, text: `Segment text number ${i} with some content` });
  }
  return arr;
}

function checkParseValid() {
  const parsed = parseNoteJson(JSON.stringify(VALID_NOTE));
  assert.ok(parsed, 'valid JSON must parse');
  assert.equal(parsed.summary, 'Overview of the video content.');
  assert.equal(parsed.highlights.length, 2);
  assert.equal(parsed.highlights[0].level, 'critical');
  assert.equal(parsed.highlights[1].level, 'important');
  assert.equal(parsed.highlights[0].startSeconds, 5);
  assert.deepEqual(parsed.takeaways, ['Takeaway one', 'Takeaway two']);
  assert.equal(parsed.corePoints.length, 1);
  assert.equal(parsed.corePoints[0].index, 1);
  assert.equal(parsed.corePoints[0].weight, 0.8);
  assert.deepEqual(parsed.corePoints[0].sourceTimestamps, ['00:05']);
  console.log('✓ parseNoteJson accepts valid JSON');
}

function checkParseFencedAndNoise() {
  const fenced = parseNoteJson('```json\n' + JSON.stringify(VALID_NOTE) + '\n```');
  assert.ok(fenced, 'markdown-fenced JSON must parse');
  const noisy = parseNoteJson('Sure, here is your note:\n' + JSON.stringify(VALID_NOTE) + '\nThat is all.');
  assert.ok(noisy, 'JSON with surrounding prose must parse');
  const trailingComma = parseNoteJson('{"summary":"S","highlights":[{"timestamp":"00:01","startSeconds":1,"text":"t","level":"critical"}],"takeaways":["a"],"corePoints":[{"index":1,"title":"p","detail":"d"}],}');
  assert.equal(trailingComma, null, 'JSON.parse rejects trailing commas -> null');
  console.log('✓ parseNoteJson strips fences and surrounding prose');
}

function checkParseInvalid() {
  assert.equal(parseNoteJson(''), null, 'empty must be null');
  assert.equal(parseNoteJson('not json at all'), null, 'garbage must be null');
  assert.equal(parseNoteJson('{"summary":123}'), null, 'non-string summary must be null');
  assert.equal(parseNoteJson('{"summary":"ok","highlights":[]}'), null, 'empty highlights must be null');
  assert.equal(
    parseNoteJson(
      JSON.stringify({
        summary: 'ok',
        highlights: [{ timestamp: '00:01', startSeconds: 1, text: 't', level: 'critical' }],
        takeaways: [],
      }),
    ),
    null,
    'empty takeaways must be null',
  );
  assert.equal(
    parseNoteJson(
      JSON.stringify({
        summary: 'ok',
        highlights: [{ timestamp: '00:01', startSeconds: 1, text: 't', level: 'critical' }],
        takeaways: ['a'],
        corePoints: [],
      }),
    ),
    null,
    'empty corePoints must be null',
  );
  console.log('✓ parseNoteJson rejects malformed structures');
}

function checkLevelCoercion() {
  const parsed = parseNoteJson(
    JSON.stringify({
      summary: 'ok',
      highlights: [{ timestamp: '00:01', startSeconds: 1, text: 't', level: 'medium' }],
      takeaways: ['a'],
      corePoints: [{ index: 1, title: 'p', detail: 'd' }],
    }),
  );
  assert.ok(parsed, 'invalid level should still parse');
  assert.equal(parsed.highlights[0].level, 'important', 'invalid level coerced to important');
  assert.equal(parsed.corePoints[0].weight, 0.5, 'missing weight defaults to 0.5');
  console.log('✓ parseNoteJson coerces invalid level / missing weight');
}

function checkDownsample() {
  const lines = downsampleSegments(makeSegments(200));
  assert.ok(lines.length <= 60, `sampled lines must be <= 60, got ${lines.length}`);
  assert.ok(lines.length >= 30, `sampled lines should still be substantial, got ${lines.length}`);
  for (const line of lines) {
    assert.match(line, /^\[\d{2}:\d{2}\] .+/, `line must carry [MM:SS] anchor: ${line}`);
  }
  const total = lines.join('').length;
  assert.ok(total <= 6000, `total chars must be <= 6000, got ${total}`);

  // 短字幕不抽样、不截断
  const short = downsampleSegments(makeSegments(3));
  assert.equal(short.length, 3, 'short transcripts keep all segments');
  assert.deepEqual(downsampleSegments([]), [], 'empty segments -> empty lines');
  console.log('✓ downsampleSegments caps segments/chars and keeps timestamps');
}

async function checkNoKey() {
  const prevKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  const prevBase = process.env.COZE_INTEGRATION_BASE_URL;
  const prevModel = process.env.COZE_INTEGRATION_MODEL_BASE_URL;
  delete process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  delete process.env.COZE_INTEGRATION_BASE_URL;
  delete process.env.COZE_INTEGRATION_MODEL_BASE_URL;

  try {
    const result = await generateNoteWithLLM(
      makeSegments(10),
      'Title',
      'https://bilibili.com/video/BV1xx411c7mD',
      'bilibili',
      'zh',
    );
    assert.equal(result, null, 'no COZE key must return null without network');
    const empty = await generateNoteWithLLM([], 'Title', 'u', 'youtube', 'en');
    assert.equal(empty, null, 'empty transcript must return null');
  } finally {
    if (prevKey) process.env.COZE_WORKLOAD_IDENTITY_API_KEY = prevKey;
    if (prevBase) process.env.COZE_INTEGRATION_BASE_URL = prevBase;
    if (prevModel) process.env.COZE_INTEGRATION_MODEL_BASE_URL = prevModel;
  }
  console.log('✓ generateNoteWithLLM degrades to null without key / transcript');
}

async function main() {
  checkParseValid();
  checkParseFencedAndNoise();
  checkParseInvalid();
  checkLevelCoercion();
  checkDownsample();
  await checkNoKey();
  console.log('\nAll video-note LLM generator checks passed ✓');
}

main().catch((error) => {
  console.error('\nVideo-note LLM generator check FAILED:', error.message);
  process.exit(1);
});
