/**
 * AI 成片渲染冒烟（一次性探针）：
 * 绕过 HTTP/鉴权，直接驱动 renderAiVideo，验证 sharp + msedge-tts + ffmpeg 全链路能出可播放 MP4。
 * 运行：node --import tsx .pwtest/ai-video-smoke.ts
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { renderAiVideo } from '../src/lib/server/ai-video/render';
import { parseScriptJson, buildLocalScript } from '../src/lib/server/ai-video/script';
import { findFfmpegBinary } from '../src/lib/server/recap/render';
import { AI_VIDEO_TEMPLATES, resolveAiVideoTemplate } from '../src/lib/ai-video-templates';

const execFileAsync = promisify(execFile);
const runId = `smoke-${Date.now()}`;

async function main() {
  // 1) 归一化白名单：合法输入保留，非法输入返回 null（自动回落本地模板）
  const ok = parseScriptJson('```json\n{"title":"t","scenes":[{"headline":"a","narration":"b"},{"headline":"c","narration":"d"},{"headline":"e","narration":"f"},{"headline":"g","narration":"h"}]}\n```');
  const bad = parseScriptJson('not json at all');
  console.log(`[smoke] normalize ok=${ok?.scenes.length} bad=${bad === null ? 'null(as expected)' : 'LEAK'}`);
  if (!ok) throw new Error('normalize rejected a valid 4-scene script');
  if (bad !== null) throw new Error('normalize accepted invalid JSON');

  // 2) 渲染（中文 4 分镜，免费档规格 720x1280 + 水印）
  const scenes = [
    { headline: '你可能一直忽略了它', narration: '今天聊聊晨间习惯。它看起来很小，但影响可能超出你的想象。' },
    { headline: '先说结论', narration: '最重要的结论只有一句：越早了解，越早受益。' },
    { headline: '具体怎么做', narration: '第一步，先明确你要解决的问题；第二步，从一个最小可行的尝试开始。' },
    { headline: '最后一句', narration: '别等到别人都在用了，你才想起来。现在就开始。' },
  ];
  const outPath = join(tmpdir(), `aivideo-${runId}.mp4`);
  const tempPaths: string[] = [];
  const t0 = Date.now();
  const duration = await renderAiVideo({
    scenes,
    voice: 'zh-CN-XiaoxiaoNeural',
    target: { width: 720, height: 1280, watermark: true },
    outPath,
    runId,
    tempPaths,
    bgmMood: 'calm',
  });
  const s = await stat(outPath);
  console.log(`[smoke] rendered ${s.size} bytes, duration=${duration.toFixed(2)}s, elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // 3) 全解码校验：ffmpeg -v error 无输出 = 每帧每包都能解码
  const ffmpeg = await findFfmpegBinary();
  try {
    const { stderr } = await execFileAsync(ffmpeg, ['-v', 'error', '-i', outPath, '-f', 'null', '-'], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 180_000,
    });
    if (String(stderr).trim()) throw new Error(`decode errors:\n${String(stderr).slice(0, 800)}`);
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    const detail = String(err.stderr || err.message || '');
    if (detail.includes('decode errors')) throw e;
    if (detail.trim()) throw new Error(`ffmpeg decode failed:\n${detail.slice(0, 800)}`);
  }
  console.log('[smoke] full decode: no errors');

  // 4) 规格断言：9:16、有音轨
  const probe = await execFileAsync(ffmpeg, ['-hide_banner', '-i', outPath], { maxBuffer: 4 * 1024 * 1024 }).catch(
    (e: { stderr?: string }) => ({ stderr: String(e.stderr || '') }),
  );
  const info = String((probe as { stderr?: string }).stderr || '');
  const videoLine = info.match(/Stream #0:0.*Video: ([^,]+), [^,]*, (\d+)x(\d+)/);
  const hasAudio = /Stream #0:1.*Audio:/.test(info);
  console.log(`[smoke] video=${videoLine?.[1]} ${videoLine?.[2]}x${videoLine?.[3]} audio=${hasAudio}`);
  if (videoLine?.[2] !== '720' || videoLine?.[3] !== '1280') throw new Error('unexpected resolution');
  if (!hasAudio) throw new Error('missing audio stream');

  if (s.size < 20_000) throw new Error('output too small');

  // 5) 付费档分支：1080x1920、无水印（滤镜链只有 subtitles，map [vsub]）
  const out2 = join(tmpdir(), `aivideo-${runId}-paid.mp4`);
  const temp2: string[] = [];
  const dur2 = await renderAiVideo({
    scenes: scenes.slice(0, 4),
    voice: 'zh-CN-XiaoxiaoNeural',
    target: { width: 1080, height: 1920, watermark: false },
    outPath: out2,
    runId: `${runId}-paid`,
    tempPaths: temp2,
    bgmMood: null,
  });
  const probe2 = await execFileAsync(ffmpeg, ['-hide_banner', '-i', out2], { maxBuffer: 4 * 1024 * 1024 }).catch(
    (e: { stderr?: string }) => ({ stderr: String(e.stderr || '') }),
  );
  const info2 = String((probe2 as { stderr?: string }).stderr || '');
  const v2 = info2.match(/Stream #0:0.*Video: [^,]+, [^,]*, (\d+)x(\d+)/);
  console.log(`[smoke] paid branch: ${v2?.[1]}x${v2?.[2]} duration=${dur2.toFixed(2)}s`);
  if (v2?.[1] !== '1080' || v2?.[2] !== '1920') throw new Error('paid branch resolution mismatch');

  // 6) 7 类竖屏模版各出 1 条分镜：分辨率/音轨/全解码 + Ken Burns 运镜真正生效
  const md5 = (buf: Buffer) => createHash('md5').update(buf).digest('hex');
  const outs3: string[] = [];
  const temp3: string[] = [];
  for (const tpl of AI_VIDEO_TEMPLATES) {
    const resolved = resolveAiVideoTemplate(tpl.id);
    const scene = buildLocalScript('晨间习惯', 'zh', resolved).scenes[0];
    if (!scene) throw new Error(`${tpl.id}: local script produced no scenes`);

    const out = join(tmpdir(), `aivideo-${runId}-${tpl.id}.mp4`);
    outs3.push(out);

    // 捕获 Ken Burns 回落告警：一旦出现即说明动画裁剪没生效（静帧出片 = 回归失败）
    const warns: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warns.push(args.map((a) => String(a)).join(' '));
      origWarn(...args);
    };
    let dur = 0;
    try {
      dur = await renderAiVideo({
        scenes: [scene],
        voice: 'zh-CN-XiaoxiaoNeural',
        target: { width: 720, height: 1280, watermark: true },
        outPath: out,
        runId: `${runId}-${tpl.id}`,
        tempPaths: temp3,
        bgmMood: tpl.bgmMood,
        templateId: tpl.id,
      });
    } finally {
      console.warn = origWarn;
    }

    const p = await execFileAsync(ffmpeg, ['-hide_banner', '-i', out], { maxBuffer: 4 * 1024 * 1024 }).catch(
      (e: { stderr?: string }) => ({ stderr: String(e.stderr || '') }),
    );
    const line = String((p as { stderr?: string }).stderr || '');
    const v = line.match(/Stream #0:0.*Video: [^,]+, [^,]*, (\d+)x(\d+)/);
    if (v?.[1] !== '720' || v?.[2] !== '1280') throw new Error(`${tpl.id}: resolution ${v?.[1]}x${v?.[2]}`);
    if (!/Stream #0:1.*Audio:/.test(line)) throw new Error(`${tpl.id}: missing audio stream`);

    // 全解码校验
    const dec = await execFileAsync(ffmpeg, ['-v', 'error', '-i', out, '-f', 'null', '-'], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120_000,
    }).catch((e: { stderr?: string; message?: string }) => ({ stderr: String(e.stderr || e.message || '') }));
    if (String((dec as { stderr?: string }).stderr || '').trim()) {
      throw new Error(`${tpl.id}: decode errors: ${String((dec as { stderr?: string }).stderr).slice(0, 300)}`);
    }

    if (warns.some((w) => w.includes('ken burns vf failed'))) {
      throw new Error(`${tpl.id}: ken burns vf failed, fell back to static`);
    }

    // 抽两帧比对：单个分镜内标题/字幕/水印恒定，两帧不同只能来自运镜裁剪
    const f1 = join(tmpdir(), `aivideo-${runId}-${tpl.id}-f1.png`);
    const f2 = join(tmpdir(), `aivideo-${runId}-${tpl.id}-f2.png`);
    outs3.push(f1, f2);
    const t1 = Math.max(0.15, dur * 0.15);
    const t2 = Math.max(t1 + 0.4, dur * 0.75);
    await execFileAsync(ffmpeg, ['-y', '-ss', t1.toFixed(2), '-i', out, '-frames:v', '1', f1], { maxBuffer: 16 * 1024 * 1024 });
    await execFileAsync(ffmpeg, ['-y', '-ss', t2.toFixed(2), '-i', out, '-frames:v', '1', f2], { maxBuffer: 16 * 1024 * 1024 });
    const [b1, b2] = await Promise.all([readFile(f1), readFile(f2)]);
    if (md5(b1) === md5(b2)) throw new Error(`${tpl.id}: frames identical — ken burns not moving`);

    console.log(`[smoke] template ${tpl.id}: 720x1280 + audio + decode ok + ken burns moving (dur=${dur.toFixed(2)}s)`);
  }

  await unlink(outPath).catch(() => {});
  await unlink(out2).catch(() => {});
  await Promise.all([...outs3].map((p) => unlink(p).catch(() => {})));
  await Promise.all([...tempPaths, ...temp2, ...temp3].map((p) => unlink(p).catch(() => {})));
  console.log('[smoke] PASS');
}

main().catch((e) => {
  console.error('[smoke] FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
});