/**
 * AI 成片 —— 服务端渲染编排（sharp 画面 + msedge TTS 旁白 + ffmpeg 合成）。
 *
 * 流程（全部在 /tmp 内完成，本模块**不删除任何文件**，中间产物路径推入调用方传入的
 * `tempPaths`，由调用方 finally 统一清理）：
 *   1) 逐个分镜：sharp 把 SVG 背景光栅化为 PNG（画面**不含文字**——文字统一交给 libass，
 *      否则 librsvg 在无 CJK 字体的容器里会把中文渲染成豆腐块）
 *   2) 逐个分镜：TTS 合成旁白 MP3，并用 ffmpeg 探测真实时长 → 该分镜的镜头时长
 *   3) 逐分镜生成统一规格片段（静帧 + 旁白音轨，30fps / yuv420p / aac）
 *   4) xfade + acrossfade 交叉淡化拼接（失败自动降级 concat 硬拼）
 *   5) 成片单 pass：烧录标题/字幕（ASS）+ 免费档水印 overlay + BGM 混音
 *
 * 音画对齐不变量：每个分镜的镜头时长 = 该分镜旁白的实测时长，因此字幕/标题的
 * 时间轴与画面天然对齐，无需额外的对齐推理。
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  findFfmpegBinary,
  probeDuration,
  stitchClipsXfade,
  stitchClipsConcat,
} from '../recap/render';
import { setupFontConfig, DEFAULT_SUBTITLE_STYLE, type SubtitleStyle } from '../subtitles';
import { synthesizeVoiceover, type VoiceProsody } from '../voiceover';
import { getWatermarkPngPath } from '../video-export';
import {
  buildSceneFrameSvg,
  buildKenBurnsVf,
  buildStaticVf,
  frameSize,
  buildPhotoOverlaySvg,
} from './frame';
import { generateSceneImages } from './image';
import { resolveAiVideoTemplate, type AiVideoTemplate } from '../../ai-video-templates';
import type { AiVideoScene, AiVideoTarget } from '../../ai-video';

const execFileAsync = promisify(execFile);

/** 分镜间转场时长（秒）——与 compile-clips / recap 同量级 */
export const AI_VIDEO_XFADE_SEC = 0.4;

/** 单个分镜镜头时长下限（旁白极短时仍给足画面停留时间，避免一闪而过） */
const MIN_SCENE_SEC = 2.2;

const BGM_VOLUME = 0.12;

/** 旁白/字幕的 ASS 时间格式。 */
function assTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s.toFixed(2)).padStart(5, '0')}`;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/[{}]/g, '')
    .trim();
}

/** #RRGGBB → ASS 的 &HAABBGGRR（ASS 是 BGR 序）。非法输入回落白色。 */
function hexToAssColor(hex: string, alpha = '00'): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `&H${alpha}FFFFFF`;
  const r = m[1].slice(0, 2);
  const g = m[1].slice(2, 4);
  const b = m[1].slice(4, 6);
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

/**
 * 生成标题 + 字幕的 ASS 文件（PlayRes 固定 1080x1920，libass 按输出分辨率等比缩放）。
 * Title = 画面主标题（顶部居中，粗描边，颜色取模版强调色）；Sub = 旁白字幕（底部居中，半透明黑框）。
 */
export async function buildSceneAssFile(
  cues: Array<{ start: number; end: number; headline: string; narration: string }>,
  style: SubtitleStyle = DEFAULT_SUBTITLE_STYLE,
  runId: string,
  visual?: AiVideoTemplate['visual'],
  opts?: { light?: boolean; totalSec?: number; brand?: string },
): Promise<string | null> {
  if (cues.length === 0) return null;
  const outline = style.outline === 'none' ? 0 : style.outline === 'light' ? 2 : 4;
  const light = opts?.light === true;
  const titleSize = visual?.titleSize ?? 88;
  const titleBold = visual && visual.bold === false ? 0 : -1;
  // 浅底（AI 画卡版式）用墨色文字 + 白描边；深底（SVG 回落版式）用强调色 + 深描边。
  const titleColor = light
    ? hexToAssColor(visual?.ink || '#111111')
    : hexToAssColor(visual?.accent || '#FFFFFF');
  const outlineColor = light ? '&H00FFFFFF' : '&H00101010';
  const titleOutline = light ? 1 : outline + 1;
  const subOutline = light ? 1 : outline;
  const subColor = light ? hexToAssColor(visual?.ink || '#111111') : '&H00FFFFFF';
  // 浅底不使用字幕黑框（黑框在浅色纸上非常突兀）
  const subBack = light ? '&H00000000' : style.background === 'box' ? '&H96000000' : '&H00000000';
  const brand = escapeAssText(opts?.brand || '');
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Title：顶部居中大字（Alignment 8），MarginV 从上往下 300px
    `Style: Title, Noto Sans SC, ${titleSize}, ${titleColor}, &H000000FF, ${outlineColor}, &H00000000, ${titleBold}, 0, 0, 0, 100, 100, 0, 0, 1, ${titleOutline}, ${light ? 1 : 3}, 8, 70, 70, 300, 1`,
    // Sub：底部居中字幕（Alignment 2），MarginV 从下往上 300px（对齐 Pixelle image_full 的 bottom: 300px）
    `Style: Sub, Noto Sans SC, 56, ${subColor}, &H000000FF, ${outlineColor}, ${subBack}, -1, 0, 0, 0, 100, 100, 0, 0, 1, ${subOutline}, 2, 2, 70, 70, 300, 1`,
    // Foot：左下角品牌页脚（Alignment 1）
    `Style: Foot, Noto Sans SC, 30, ${light ? hexToAssColor(visual?.ink || '#111111') : '&H00FFFFFF'}, &H000000FF, ${outlineColor}, &H00000000, 0, 0, 0, 0, 100, 100, 0, 0, 1, 0, 0, 1, 90, 90, 150, 1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const events: string[] = [];
  for (const c of cues) {
    const start = assTime(c.start);
    const end = assTime(c.end);
    const headline = escapeAssText(c.headline);
    const narration = escapeAssText(c.narration);
    if (headline) events.push(`Dialogue: 0,${start},${end},Title,,0,0,0,,${headline}`);
    if (narration) events.push(`Dialogue: 0,${start},${end},Sub,,0,0,0,,${narration}`);
  }
  // 品牌页脚贯穿全片（对应 Pixelle 模版左下角的作者署名）
  const totalSec = opts?.totalSec && opts.totalSec > 0 ? opts.totalSec : cues[cues.length - 1].end;
  if (brand) events.push(`Dialogue: 0,${assTime(0)},${assTime(totalSec)},Foot,,0,0,0,,${brand}`);
  if (events.length === 0) return null;

  const assPath = join(tmpdir(), `aivideo-sub-${runId}.ass`);
  await writeFile(assPath, `${header}\n${events.join('\n')}\n`, 'utf8');
  return assPath;
}

/**
 * 编码单个分镜片段（静态帧 + 旁白音轨，统一 30fps / yuv420p / 方形像素，便于 xfade 拼接）。
 * 先试 Ken Burns 动画裁剪（`vf`），失败则回落到静态缩放（保证任何 ffmpeg 版本都能出片）。
 */
async function encodeSegment(
  ffmpegPath: string,
  pngPath: string,
  mp3Path: string,
  durSec: number,
  vf: string,
  staticVf: string,
  segPath: string,
): Promise<void> {
  const base = [
    '-y',
    '-loop', '1', '-framerate', '30', '-i', pngPath,
    '-i', mp3Path,
    '-t', durSec.toFixed(3),
  ];
  const tail = [
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
    '-movflags', '+faststart', '-avoid_negative_ts', 'make_zero',
    segPath,
  ];
  const opts = { maxBuffer: 40 * 1024 * 1024, timeout: 120_000, env: { ...process.env, LANG: 'C' } };
  try {
    await execFileAsync(ffmpegPath, [...base, '-vf', vf, ...tail], opts);
  } catch (e) {
    console.warn('[ai-video/render] ken burns vf failed, static fallback:', e instanceof Error ? e.message.slice(0, 200) : e);
    await execFileAsync(ffmpegPath, [...base, '-vf', staticVf, ...tail], opts);
  }
}

/**
 * 渲染一条 AI 成片。
 *
 * @param tempPaths 调用方传入的可变数组，本模块所有中间产物路径都会 push 进来。
 * @returns 成片时长（秒）；成片文件写在 outPath（调用方负责流式返回后删除）。
 */
export async function renderAiVideo(params: {
  scenes: AiVideoScene[];
  /** msedge-tts 声线 ID（由调用方按 locale 解析） */
  voice: string;
  target: AiVideoTarget;
  /** 成片输出路径（调用方生成，流式响应 close 后删除） */
  outPath: string;
  /** 中间文件命名前缀（保证并发隔离） */
  runId: string;
  tempPaths: string[];
  /** BGM 心情（public/bgm/{mood}.mp3）；null = 不加 BGM */
  bgmMood?: string | null;
  /** 竖屏模版 id（决定配色/版式/字幕样式/语速音调）；缺省用默认模版 */
  templateId?: string | null;
}): Promise<number> {
  const { scenes, voice, target, outPath, runId, tempPaths } = params;
  if (scenes.length === 0) throw new Error('ai-video: no scenes to render');

  const template = resolveAiVideoTemplate(params.templateId);
  const ffmpegPath = await findFfmpegBinary();
  if (!ffmpegPath) throw new Error('ffmpeg binary not found');

  const { width: W, height: H } = target;
  // 帧按 KEN_BURNS_SCALE 放大渲染（保留像素细节），运镜裁剪后再缩回目标分辨率
  const { w: FW, h: FH } = frameSize(W, H);
  const staticVf = buildStaticVf(W, H);
  const sharp = (await import('sharp')).default;
  const prosody: VoiceProsody = { rate: template.rate, pitch: template.pitch };

  // ── 1) 逐分镜：AI 实拍配图（或模版 SVG 帧）+ 旁白 MP3 + 实测时长 ──────────
  const segPaths: string[] = [];
  const durations: number[] = [];
  const cues: Array<{ start: number; end: number; headline: string; narration: string }> = [];
  let timeline = 0;

  // 逐分镜 AI 实拍配图（Pixelle image_full 版式核心：AI 图全幅铺满 + 顶部标题 +
  // 底部字幕 + 品牌页脚）。串行提交防 DashScope 429；失败/未配置 Key → 对应项
  // 为 null，该分镜回落 SVG 版式。
  const liveImages = await generateSceneImages(
    scenes.map((s) => s.narration),
    template.imageStyle,
    1,
  );
  const overlaySvg = Buffer.from(buildPhotoOverlaySvg(FW, FH));
  const liveCount = liveImages.filter(Boolean).length;
  console.log(
    `[ai-video/render] photo mode: ${liveCount}/${scenes.length} scenes use AI live images (template=${template.id})`,
  );

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];

    const pngPath = join(tmpdir(), `aivideo-bg-${runId}-${i}.png`);
    tempPaths.push(pngPath);
    const liveImg = liveImages[i];
    if (liveImg) {
      // 实拍路径：AI 图 cover 全幅 + 暗角/上下渐变覆盖层（对应 Pixelle 的
      // text-shadow 黑描边可读性处理），文字仍统一交给 libass 烧录。
      await sharp(liveImg)
        .resize(FW, FH, { fit: 'cover', position: 'attention' })
        .composite([{ input: overlaySvg }])
        .png()
        .toFile(pngPath);
    } else {
      const svg = buildSceneFrameSvg(template, FW, FH, i, scenes.length);
      await sharp(Buffer.from(svg)).png().toFile(pngPath);
    }

    const mp3Path = join(tmpdir(), `aivideo-voice-${runId}-${i}.mp3`);
    tempPaths.push(mp3Path);
    const audio = await synthesizeVoiceover(scene.narration, voice, prosody);
    await writeFile(mp3Path, audio);

    const probed = await probeDuration(ffmpegPath, mp3Path);
    const dur = Math.max(MIN_SCENE_SEC, probed > 0 ? probed : MIN_SCENE_SEC);

    const segPath = join(tmpdir(), `aivideo-seg-${runId}-${i}.mp4`);
    tempPaths.push(segPath);
    await encodeSegment(ffmpegPath, pngPath, mp3Path, dur, buildKenBurnsVf(W, H, i, dur), staticVf, segPath);

    const actual = await probeDuration(ffmpegPath, segPath);
    const segDur = actual > 0 ? actual : dur;
    segPaths.push(segPath);
    durations.push(segDur);

    // 字幕/标题先按「未转场压缩」的原始时间轴排布，拼接后再按实际转场次数整体前移
    cues.push({ start: timeline, end: timeline + Math.max(0.4, segDur), headline: scene.headline, narration: scene.narration });
    timeline += segDur;
    console.log(`[ai-video/render] scene ${i}: want=${dur.toFixed(2)}s got=${segDur.toFixed(2)}s`);
  }

  // ── 2) 转场拼接：xfade 优先，失败降级 concat ─────────────────────────────
  let stitchedPath = segPaths[0];
  let usedXfade = false;
  if (segPaths.length > 1) {
    const stitchPath = join(tmpdir(), `aivideo-stitch-${runId}.mp4`);
    tempPaths.push(stitchPath);
    try {
      await stitchClipsXfade(ffmpegPath, segPaths, durations, stitchPath, AI_VIDEO_XFADE_SEC);
      stitchedPath = stitchPath;
      usedXfade = true;
      console.log('[ai-video/render] xfade stitch ok');
    } catch (e) {
      console.warn('[ai-video/render] xfade failed, concat fallback:', e instanceof Error ? e.message.slice(0, 300) : e);
      const listPath = join(tmpdir(), `aivideo-list-${runId}.txt`);
      tempPaths.push(listPath);
      await writeFile(listPath, segPaths.map((p) => `file '${p}'`).join('\n'));
      await stitchClipsConcat(ffmpegPath, listPath, stitchPath);
      stitchedPath = stitchPath;
      console.log('[ai-video/render] concat fallback ok');
    }
  }

  // 转场重叠使净时间轴提前：每发生一次 xfade，其后内容整体前移 AI_VIDEO_XFADE_SEC。
  // concat 兜底是硬拼（不重叠），时间轴保持原样，绝不能位移。
  if (usedXfade) {
    for (let i = 0; i < cues.length; i++) {
      const shift = i * AI_VIDEO_XFADE_SEC;
      cues[i] = {
        ...cues[i],
        start: Math.max(0, cues[i].start - shift),
        end: Math.max(0.4, cues[i].end - shift),
      };
    }
  }

  // ── 3) 成片单 pass：烧字幕/标题 + 免费档水印 + BGM 混音 ────────────────────
  const assPath = await buildSceneAssFile(cues, DEFAULT_SUBTITLE_STYLE, runId, template.visual);
  if (assPath) tempPaths.push(assPath);
  const fontConfigPath = await setupFontConfig();
  if (fontConfigPath) tempPaths.push(fontConfigPath);

  const wmPng = target.watermark ? await getWatermarkPngPath() : null;
  if (target.watermark && !wmPng) console.warn('[ai-video/render] watermark png unavailable, exporting without it');

  // null = 明确不加 BGM；undefined = 走模版自带心情；非法值同样回落模版心情
  const bgmMood = params.bgmMood === null ? '' : params.bgmMood && /^[a-z]+$/.test(params.bgmMood) ? params.bgmMood : template.bgmMood;
  let bgmPath = '';
  const bgmCandidate = join(process.cwd(), 'public', 'bgm', `${bgmMood}.mp3`);
  const bgmStat = await stat(bgmCandidate).catch(() => null);
  if (bgmStat && bgmStat.size > 5_000) bgmPath = bgmCandidate;

  const args: string[] = ['-y', '-i', stitchedPath];
  let wmIndex = -1;
  if (wmPng) {
    wmIndex = args.filter((a) => a === '-i').length; // 下一个 -i 的输入序号
    args.push('-i', wmPng);
  }
  let bgmIndex = -1;
  if (bgmPath) {
    bgmIndex = args.filter((a) => a === '-i').length;
    args.push('-stream_loop', '-1', '-i', bgmPath);
  }

  const filters: string[] = [];
  // 滤镜链内的视频标签（恒带方括号）；最终 -map 用 videoLabel（无滤镜时是流选择器 '0:v'）。
  let videoBase = '[0:v]';
  if (assPath) {
    // 不用 force_style：本片 ASS 已按 Style 区分 Title(顶部)/Sub(底部)，
    // 强行 force_style 会把 Alignment 覆盖成同一个值，标题会被拽到底部。
    const assFilterPath = assPath.replace(/\\/g, '/');
    const fontsDir = join(process.cwd(), 'public', 'fonts');
    filters.push(`[0:v]subtitles=${assFilterPath}:fontsdir=${fontsDir}[vsub]`);
    videoBase = '[vsub]';
  }
  if (wmPng && wmIndex >= 0) {
    filters.push(`[${wmIndex}:v]scale=w=-2:h=64[wm]`);
    filters.push(`${videoBase}[wm]overlay=(main_w-overlay_w-24):(main_h-overlay_h-24):eof_action=repeat[vout]`);
    videoBase = '[vout]';
  }
  const videoLabel = filters.length > 0 ? videoBase : '0:v';

  const mixLabels: string[] = ['[0:a]'];
  if (bgmPath && bgmIndex >= 0) {
    filters.push(`[${bgmIndex}:a]volume=${BGM_VOLUME}[bg]`);
    mixLabels.push('[bg]');
  }
  let audioLabel = '0:a';
  if (mixLabels.length > 1) {
    // duration=first：旁白（[0:a]）是第一路输入，BGM 用 -stream_loop 铺满，
    // 若用 longest 会因 BGM 无限循环而永不结束。
    filters.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:normalize=0[aout]`);
    audioLabel = '[aout]';
  }

  if (filters.length > 0) args.push('-filter_complex', filters.join(';'));
  args.push('-map', videoLabel, '-map', audioLabel);
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p');
  args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100');
  args.push('-movflags', '+faststart', '-shortest', '-avoid_negative_ts', 'make_zero', outPath);

  console.log(
    `[ai-video/render] composite: template=${template.id} layout=${template.visual.layout} scenes=${scenes.length} ${W}x${H} subs=${!!assPath} wm=${!!wmPng} bgm=${bgmPath ? bgmMood : '-'}`,
  );

  await execFileAsync(ffmpegPath, args, {
    maxBuffer: 60 * 1024 * 1024,
    timeout: 280_000,
    env: { ...process.env, LANG: 'C' },
  });

  const outStat = await stat(outPath).catch(() => null);
  if (!outStat || outStat.size < 20_000) throw new Error('ai-video render: output too small or missing');

  return probeDuration(ffmpegPath, outPath);
}