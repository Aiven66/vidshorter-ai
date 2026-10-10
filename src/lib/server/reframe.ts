import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, readdir, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { KeepSegment } from '@/lib/server/jump-cut';
import { detectFaceCenter } from '@/lib/server/face-detect';

/**
 * P0 — 竖屏智能追焦构图（Auto-Reframe，Starter+ 权益）。
 *
 * 目标：把 16:9 横屏源按 9:16 裁切时，让裁切窗跟着说话人水平移动，主体居中，
 * 而不是像 blur-fit 那样「整幅缩小 + 上下模糊条」（主体偏小、观感差）。
 *
 * ⚠️ 主体定位分两级：**优先真实人脸检测**（face-detect.ts 的 YuNet ONNX，232KB
 * 公开 CDN 直链），检测器不可用或本帧无脸时，回落到**零新增依赖的启发式**
 * （YCbCr 肤色掩码 + 列向边缘能量）。两级产出同一个契约（水平重心 + 置信度），
 * 后段的时序平滑与滤镜构建完全共用：
 *   1. 用 ffmpeg 按固定间隔抽帧（缩到宽 320）到 /tmp，**逐帧处理完立刻删除**；
 *   2. 人脸检测命中 → 取主脸重心；否则用 sharp 解码为 RGB 跑启发式（YCbCr 肤色
 *      掩码 + 列向边缘能量）；
 *   3. 得到该帧人物的水平重心与置信度；
 *   4. 时序 EMA 平滑 + deadband 抑制抖动 → 少量控制点 → 裁切路径。
 *
 * ⚠️ 安全优先：全局置信度不足（幻灯片/无人/全屏动画/源本身比 9:16 还窄）一律返回 null，
 * 由调用方回落到既有 blur-fit。绝不重演「裁切窗漂到幻灯片上、把人裁出画面」的老问题。
 *
 * ⚠️ 内存纪律（吸取 cut-clip OOM 教训）：只处理降采样后的帧，逐帧读、逐帧删；
 * 绝不整块 readFile 视频输出。
 */

/** 分析用的归一化帧宽（像素）。所有重心/裁切比例都在此坐标系里计算。 */
const NORM_W = 320;
/** 抽帧间隔上限对应的目标时长：短 clip 用 2fps，长 clip 降到 1fps（控制帧数与耗时）。 */
const FPS_SHORT = 2;
const FPS_LONG = 1;
const LONG_CLIP_SEC = 45;
/** 抽帧硬上限（保底，防极端时长）。 */
const MAX_FRAMES = 200;

/** 肤色像素占比低于此值视为「本帧无主体」。 */
const SKIN_MIN_RATIO = 0.005;
/** 肤色像素占比达到此值即认为本帧主体置信度为 1。 */
const SKIN_FULL_RATIO = 0.05;
/** 重心得分中「肤色密度」与「边缘能量」的权重。 */
const SKIN_W = 1;
const EDGE_W = 0.6;

/** 时序 EMA 平滑系数（越大越跟手，越小越平缓）。 */
const EMA_ALPHA = 0.3;
/** 裁切路径控制点上限（控制表达式长度与运动幅度）。 */
const KNOTS_MAX = 12;
/** deadband 阶梯（归一化像素）：逐级加大直到控制点数达标，抑制无意义微抖。 */
const DEADBAND_LADDER = [6, 12, 20, 32];

/** 中心偏置：把重心向画面中心轻微回归，降低「被远处暖色物体带偏」的风险。 */
const CENTER_BIAS = 0.12;

/** 全局置信度门槛：同时满足才开始追焦，否则回落 blur-fit。 */
const MIN_VALID_FRAMES = 4;
const MIN_COVERAGE = 0.6;
const MIN_MEAN_CONF = 0.5;
const MIN_GLOBAL_CONF = 0.35;

/** 竖屏裁切窗宽高比（宽/高）。 */
export const CROP_RATIO = 9 / 16;

/** ffmpeg 可直接读取的输入（本地文件或 CF Worker /stream URL）。 */
export interface ReframeInput {
  /** 本地文件路径，或 ffmpeg 可读取的 URL。 */
  source: string;
  /** 输入参数（URL 时放 headers/reconnect；插在 -i 之前）。 */
  inputArgs?: string[];
}

/** 追焦结果：裁切窗左边界随时间的归一化路径（分段线性）。 */
export interface ReframePath {
  /** 控制点时间（相对 clip 起点，秒），升序，首点为 0。 */
  times: number[];
  /** 控制点对应的裁切窗左边界归一化比例（0 ~ 1-cropRatio）。 */
  fractions: number[];
  /** 裁切窗宽/高比（固定 9/16）。 */
  cropRatio: number;
  /** 全局置信度 0..1。 */
  confidence: number;
  /** 诊断：有效帧数 / 覆盖率。 */
  validFrames: number;
  coverage: number;
}

interface FrameStat {
  /** clip 相对时间（秒） */
  t: number;
  /** 归一化坐标下的水平重心（像素） */
  center: number | null;
  /** 本帧置信度 0..1 */
  conf: number;
}

const execFileAsync = promisify(execFile);

/**
 * 分析源视频，产出竖屏裁切路径。任何「不确定」都返回 null，由调用方回落 blur-fit。
 *
 * @param ffmpegPath 已确认可用的 ffmpeg 可执行文件路径
 * @param input      源（本地文件或 CF Worker /stream URL）
 * @param opts       startTime/duration 为 clip 窗口（与后续裁切共用同一时间基准）
 */
export async function analyzeSubjectPath(
  ffmpegPath: string,
  input: ReframeInput,
  opts: { startTime: number; duration: number },
): Promise<ReframePath | null> {
  const duration = Number.isFinite(opts.duration) && opts.duration > 0 ? opts.duration : 0;
  const startTime = Number.isFinite(opts.startTime) && opts.startTime > 0 ? opts.startTime : 0;
  if (duration <= 0) return null;

  const dir = join(tmpdir(), `rf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    await mkdir(dir, { recursive: true });
    const fps = duration > LONG_CLIP_SEC ? FPS_LONG : FPS_SHORT;
    const frameCount = await extractFrames(ffmpegPath, input, { startTime, duration, fps, dir });
    if (frameCount < MIN_VALID_FRAMES) return null;

    const files = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();
    const sharp = (await import('sharp')).default;
    const step = 1 / fps;
    const stats: FrameStat[] = [];
    let normH = 0;

    for (let i = 0; i < files.length; i++) {
      const p = join(dir, files[i]);
      const buf = await readFile(p);
      // 逐帧处理完立刻删除，磁盘/内存占用与总时长无关。
      await rm(p, { force: true }).catch(() => {});
      const { data, info } = await sharp(buf)
        .removeAlpha()
        .resize({ width: NORM_W })
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (!normH) normH = info.height;
      const t = i * step;
      // 优先真实人脸检测（主体定位更准，不再靠「像皮肤的区域」猜）；
      // 检测器不可用、或本帧无足够大的脸 → 回落到启发式（同一归一化坐标系）。
      const face = await detectFaceCenter(buf);
      stats.push(
        face
          ? { t, center: face.centerX * NORM_W, conf: face.confidence }
          : analyzeFrame(data, info.width, info.height, info.channels, t),
      );
    }

    if (!normH || normH <= 0) return null;
    return buildPath(stats, normH, duration);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[reframe] analysis failed (non-fatal, falling back to blur-fit): ${msg.slice(0, 300)}`);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** 抽帧：按 fps 缩到宽 NORM_W 的 JPEG 序列落到 dir，返回实际帧数。 */
async function extractFrames(
  ffmpegPath: string,
  input: ReframeInput,
  o: { startTime: number; duration: number; fps: number; dir: string },
): Promise<number> {
  const args: string[] = ['-y', '-nostdin', '-v', 'error'];
  // 输入 seek（-ss 在 -i 之前）：与后续裁切用同一基准，滤镜里的 t 从 0 开始。
  args.push('-ss', String(o.startTime));
  if (input.inputArgs?.length) args.push(...input.inputArgs);
  args.push('-i', input.source, '-t', String(o.duration));
  args.push(
    '-an', '-sn',
    '-vf', `fps=${o.fps},scale=${NORM_W}:-2`,
    '-frames:v', String(MAX_FRAMES),
    '-q:v', '6', '-start_number', '1',
    join(o.dir, 'f_%05d.jpg'),
  );
  await execFileAsync(ffmpegPath, args, {
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
    env: { ...process.env, LANG: 'C' },
  });
  return (await readdir(o.dir)).filter((f) => f.endsWith('.jpg')).length;
}

/**
 * 单帧分析：YCbCr 肤色掩码 + 列向边缘能量 → 水平重心与置信度。
 * 全部在归一化坐标系（宽 NORM_W）内完成，因此输出与源分辨率无关。
 */
function analyzeFrame(
  data: Buffer,
  W: number,
  H: number,
  ch: number,
  t: number,
): FrameStat {
  const colSkin = new Float32Array(W);
  const colEdge = new Float32Array(W);

  // 边缘像素不参与（Sobel 需要邻域），故从 1 开始、到 W-2/H-2 结束。
  for (let y = 1; y < H - 1; y++) {
    const row = y * W;
    for (let x = 1; x < W - 1; x++) {
      const i = (row + x) * ch;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // BT.601 亮度/色度
      const yy = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      // 经典肤色区间（Chai & Ngan），Y 下限放宽以覆盖较暗肤色。
      if (yy > 30 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) colSkin[x] += 1;

      // 列向边缘能量（水平 + 垂直梯度幅值，用亮度近似）
      const lgx = (data[(row + x + 1) * ch] - data[(row + x - 1) * ch]) * 0.299
        + (data[(row + x + 1) * ch + 1] - data[(row + x - 1) * ch + 1]) * 0.587
        + (data[(row + x + 1) * ch + 2] - data[(row + x - 1) * ch + 2]) * 0.114;
      const lgy = (data[((y + 1) * W + x) * ch] - data[((y - 1) * W + x) * ch]) * 0.299
        + (data[((y + 1) * W + x) * ch + 1] - data[((y - 1) * W + x) * ch + 1]) * 0.587
        + (data[((y + 1) * W + x) * ch + 2] - data[((y - 1) * W + x) * ch + 2]) * 0.114;
      colEdge[x] += Math.abs(lgx) + Math.abs(lgy);
    }
  }

  let skinTotal = 0;
  let skinMax = 0;
  let edgeMax = 0;
  for (let x = 0; x < W; x++) {
    skinTotal += colSkin[x];
    if (colSkin[x] > skinMax) skinMax = colSkin[x];
    if (colEdge[x] > edgeMax) edgeMax = colEdge[x];
  }
  const inner = Math.max(1, (W - 2) * (H - 2));
  const skinRatio = skinTotal / inner;
  const conf = Math.min(1, skinRatio / SKIN_FULL_RATIO);
  if (skinRatio < SKIN_MIN_RATIO || skinMax <= 0) {
    return { t, center: null, conf };
  }

  // 每帧各自归一化后加权：肤色柱权重最高，边缘能量补充（人体轮廓/发丝）。
  let num = 0;
  let den = 0;
  for (let x = 0; x < W; x++) {
    const w = SKIN_W * (colSkin[x] / skinMax) + EDGE_W * (edgeMax > 0 ? colEdge[x] / edgeMax : 0);
    num += x * w;
    den += w;
  }
  if (den <= 0) return { t, center: null, conf };
  return { t, center: num / den, conf };
}

/** 时序平滑 + deadband + 控制点裁剪 → ReframePath；置信度不足返回 null。 */
function buildPath(stats: FrameStat[], normH: number, duration: number): ReframePath | null {
  const valid = stats.filter((s) => s.center !== null && s.conf > 0);
  if (valid.length < MIN_VALID_FRAMES) return null;

  const coverage = valid.length / stats.length;
  const meanConf = valid.reduce((a, s) => a + s.conf, 0) / valid.length;
  const confidence = meanConf * coverage;
  if (coverage < MIN_COVERAGE || meanConf < MIN_MEAN_CONF || confidence < MIN_GLOBAL_CONF) {
    console.warn(
      `[reframe] low confidence (coverage=${coverage.toFixed(2)}, meanConf=${meanConf.toFixed(2)}) → blur-fit`,
    );
    return null;
  }

  // 源比 9:16 还窄 → 按高度裁 9:16 会越界，直接交给 blur-fit。
  if (normH <= 0 || NORM_W / normH < CROP_RATIO) {
    console.warn('[reframe] source is not wider than 9:16 → blur-fit');
    return null;
  }

  // EMA 平滑
  const ema: number[] = [];
  let s = valid[0].center as number;
  for (const f of valid) {
    s = EMA_ALPHA * s + (1 - EMA_ALPHA) * (f.center as number);
    ema.push(s);
  }

  // deadband 阶梯：逐级加大阈值直到控制点数达标（抑制微抖，保留有意义的移动）。
  let times: number[] = [];
  let centers: number[] = [];
  for (const db of DEADBAND_LADDER) {
    times = [0];
    centers = [ema[0]];
    let cur = ema[0];
    for (let i = 1; i < valid.length; i++) {
      if (Math.abs(ema[i] - cur) > db) {
        cur = ema[i];
        times.push(valid[i].t);
        centers.push(cur);
      }
    }
    if (times.length <= KNOTS_MAX) break;
  }

  const cropW = normH * CROP_RATIO;
  const minC = cropW / 2;
  const maxC = NORM_W - cropW / 2;
  /** 裁切窗可移动的余量（归一化像素）。 */
  const slack = NORM_W - cropW;
  const clamp = (v: number) => Math.min(maxC, Math.max(minC, v));
  // ⚠️ 分母必须是「可移动余量」而不是整幅宽度：滤镜里 x = (iw-ow)*frac，
  // frac 是裁切窗在余量上的占比。用整幅宽度会让窗只能走到 ~63% 的位置（追不动）。
  const toFrac = (c: number) => {
    const biased = clamp(clamp(c) * (1 - CENTER_BIAS) + (NORM_W / 2) * CENTER_BIAS);
    const f = (biased - cropW / 2) / slack;
    return Math.min(1, Math.max(0, f));
  };

  const fractions = centers.map((c) => Number(toFrac(c).toFixed(5)));
  const lastT = times[times.length - 1];
  const lastF = fractions[fractions.length - 1];

  return {
    // 末尾补一个 duration 控制点，保证表达式段落划分覆盖整段。
    times: lastT >= duration - 0.05 ? times : [...times, duration],
    fractions: lastT >= duration - 0.05 ? fractions : [...fractions, lastF],
    cropRatio: CROP_RATIO,
    confidence: Number(confidence.toFixed(3)),
    validFrames: valid.length,
    coverage: Number(coverage.toFixed(3)),
  };
}

/**
 * 把追焦路径从「原 clip 时间轴」映射到「粗剪后时间轴」（jump-cut + 竖屏组合时必须做，
 * 否则裁切路径整体错位）。落在被剪区间内的控制点压缩到切口处，保证平移连续。
 */
export function remapReframePath(path: ReframePath, segments: KeepSegment[]): ReframePath {
  if (!segments || segments.length === 0) return path;

  const offsets: number[] = [];
  let acc = 0;
  for (const seg of segments) {
    offsets.push(acc);
    acc += seg.end - seg.start;
  }
  const total = acc;

  const mapT = (t: number): number => {
    if (t <= segments[0].start) return 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (t < seg.start) return offsets[i]; // 落在切口（被剪区间）→ 压缩到该切口位置
      if (t <= seg.end) return offsets[i] + (t - seg.start);
    }
    return total;
  };

  const times: number[] = [];
  const fractions: number[] = [];
  for (let i = 0; i < path.times.length; i++) {
    const nt = Number(mapT(path.times[i]).toFixed(3));
    // 压缩后可能出现重复时间点 → 只保留最后一个（避免表达式分母为 0）。
    if (times.length > 0 && nt - times[times.length - 1] < 0.05) {
      fractions[fractions.length - 1] = path.fractions[i];
      continue;
    }
    times.push(nt);
    fractions.push(path.fractions[i]);
  }
  if (times.length === 0) return path;
  return { ...path, times, fractions };
}

/**
 * 构建 9:16 追焦裁切滤镜图（blur-fit 的替代分支）。
 *
 * 用 crop 的**时间相关表达式**做分段线性平移：
 *   crop=w=trunc(ih*9/16/2)*2:h=ih:x='(iw-ow)*<分段线性比例>':y=0
 * 已验证生产同款 ffmpeg 支持 crop 的动态 x（逐帧求值），且输入 `-ss` seek 后
 * 滤镜里的 `t` 从 0 开始，与抽帧分析的时间基准一致。
 *
 * ⚠️ 表达式里的单引号是 ffmpeg filtergraph 自身的引用机制，必须保留：
 * 没有它，表达式内的 `,`（if/lerp 的参数分隔）会被当成滤镜链分隔符。
 *
 * @param path      追焦路径（已重映射到输出时间轴）
 * @param postChain 叠加完成后的追加滤镜链（如 `subtitles=...`）
 * @param inLabel   输入视频标签，默认 `[0:v]`；jump-cut 前置链接入时传其输出标签
 * @returns 以 `[vout]` 结尾的滤镜图
 */
export function buildReframeComplex(
  path: ReframePath,
  postChain?: string | null,
  inLabel: string = '[0:v]',
): string {
  const expr = fractionExpression(path);
  const chain =
    `${inLabel}crop=w=trunc(ih*${CROP_RATIO.toFixed(6)}/2)*2:h=ih:x='(iw-ow)*(${expr})':y=0,` +
    `scale=${VERTICAL_W}:${VERTICAL_H}:force_original_aspect_ratio=increase,crop=${VERTICAL_W}:${VERTICAL_H},setsar=1[vmain]`;
  const graph = chain;
  const post = postChain && postChain.trim();
  return post ? `${graph};[vmain]${post}[vout]` : graph.split('[vmain]').join('[vout]');
}

/** 竖屏输出规格（与 video-export.ts 保持一致）。 */
const VERTICAL_W = 1080;
const VERTICAL_H = 1920;

/** 生成控制点之间的分段线性表达式（嵌套 if + lerp，最后一段取末值）。 */
function fractionExpression(path: ReframePath): string {
  const { times, fractions } = path;
  const f = (v: number) => v.toFixed(5);
  if (times.length === 1) return f(fractions[0]);

  let expr = f(fractions[fractions.length - 1]);
  for (let i = times.length - 2; i >= 0; i--) {
    const t0 = f(times[i]);
    const t1 = f(times[i + 1]);
    const f0 = f(fractions[i]);
    const f1 = f(fractions[i + 1]);
    const span = times[i + 1] - times[i];
    // 时间点重合时退化为取后值（remap 后理应不会出现，这里只是兜底）。
    const inner = span <= 0 ? f1 : `lerp(${f0},${f1},(t-${t0})/(${t1}-${t0}))`;
    expr = `if(lt(t,${t1}),${inner},${expr})`;
  }
  return expr;
}