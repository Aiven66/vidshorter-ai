import { access } from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * P0 — 付费导出差异真落地：
 *   free   → 720p + 水印
 *   starter→ 1080p 无水印
 *   pro    → 4K 无水印
 *
 * 分辨率作为“上限 cap”注入 ffmpeg scale：当源本身低于目标分辨率时绝不放大
 * （避免虚假画质/文件膨胀），超过目标时才降采样。水印则对 free 导出叠加。
 *
 * ⚠️ 水印实现说明：生产（Vercel）的 ffmpeg-static linux 构建【不含 drawtext】
 * （实测 strings 无 drawtext，含 overlay/subtitles）。因此水印改为 overlay 叠加
 * 一张 "clipopai.com" PNG，不使用 drawtext/系统字体。
 */

export interface VideoExportTarget {
  label: '720p' | '1080p' | '4k';
  maxW: number;
  maxH: number;
  watermark: boolean;
}

export function resolveExportTarget(plan?: string | null): VideoExportTarget {
  if (plan === 'pro') return { label: '4k', maxW: 3840, maxH: 2160, watermark: false };
  if (plan === 'starter') return { label: '1080p', maxW: 1920, maxH: 1080, watermark: false };
  return { label: '720p', maxW: 1280, maxH: 720, watermark: true };
}

/**
 * 构建 cap 型 scale 滤镜（含偶数补齐 + pad，保证输出 yuv420p 合法尺寸）。
 * 格式与 video-clipper.ts 的 VERCEL_SCALE 一致。
 */
export function buildScaleFilter(target: VideoExportTarget): string {
  const w = String(target.maxW);
  const h = String(target.maxH);
  return `scale=trunc(min(iw\\,${w})/2)*2:trunc(min(ih\\,${h})/2)*2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`;
}

/**
 * 只需 scale 时返回 -vf 滤镜串（分辨率 cap）。含水印时调用方改用
 * buildWatermarkArgs（两输入 filter_complex）。
 */
export function buildExportVf(target: VideoExportTarget): string | null {
  if (target.watermark || target.label !== '720p') {
    return buildScaleFilter(target);
  }
  return null;
}

/** 9:16 竖屏输出规格（Starter+ 权益）。 */
export const VERTICAL_OUT_W = 1080;
export const VERTICAL_OUT_H = 1920;
/** 背景模糊强度（boxblur 半径 / 迭代次数；值越大越糊）。 */
const VERTICAL_BG_BLUR_RADIUS = 24;
const VERTICAL_BG_BLUR_POWER = 2;

/**
 * 9:16 竖屏「blur-fit」复合滤镜图（filter_complex，Starter+ 权益）：
 * 把整幅源画面按 contain 缩放后居中叠加在「同画面放大裁满 + 高斯模糊」的背景上，
 * 输出 1080x1920。
 *
 * 为什么不裁条跟踪人物：源多为 16:9 会议/舞台/幻灯片画面，任何基于显著性/人像分割的
 * 裁条在「当前帧没有人物」或多人切换时都会把说话人裁出画面（线上实测：裁切窗漂到
 * 幻灯片上，成片里看不到人）。blur-fit 绝不裁切源内容 → 人物/图表/字幕始终完整可见，
 * 也是短视频平台处理横屏素材的标准做法。
 *
 * 因为 `split` 会把输入分成两路，此图必须用 `-filter_complex` + `-map [vout]`，
 * 不能塞进 `-vf` 线性链。
 *
 * @param postChain 叠加完成后的追加滤镜链（如 `subtitles=...`、`fps=30,format=yuv420p`）
 * @param inLabel   输入视频标签，默认 `[0:v]`；jump-cut 前置链接入时传其输出标签
 * @returns 以 `[vout]` 结尾的滤镜图
 */
export function buildVerticalComplex(postChain?: string | null, inLabel: string = '[0:v]'): string {
  const w = VERTICAL_OUT_W;
  const h = VERTICAL_OUT_H;
  // 逐条链路数组 + join(';') 拼接：标签/分号的分隔关系由数组结构保证，
  // 不依赖长模板串的相邻拼接（线上曾出现 `[bgb];` 在构建产物中丢失、
  // 导致 ffmpeg 报 “Trailing garbage after a filter” 的问题）。
  const chains = [
    `${inLabel}split=2[bg][fg]`,
    `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=${VERTICAL_BG_BLUR_RADIUS}:${VERTICAL_BG_BLUR_POWER}[bgb]`,
    `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs]`,
    '[bgb][fgs]overlay=(W-w)/2:(H-h)/2[vmain]',
  ];
  const graph = chains.join(';');
  const post = postChain && postChain.trim();
  return post ? `${graph};[vmain]${post}[vout]` : graph.split('[vmain]').join('[vout]');
}

// ── 水印（clipopai.com，透明底白字+阴影，640x140）────────────────────────────
// 生成方式：运行时用 sharp 将内联 SVG <text> 光栅化并写入 /tmp（memoized）。
// 要点：
//   * drawtext 在生产（Vercel）ffmpeg-static 不可用，故用 overlay 叠加一张 PNG。
//   * 之前曾内嵌 base64 常量，但该 b64 是截断的 PNG（IDAT 中途截断、无 IEND），
//     ffmpeg 报 “Invalid data found when processing input”。改用 sharp 每次运行
//     实时渲染，保证输出永远是合法 PNG，彻底根除截断/损坏问题。
//   * sharp 已作为 serverExternalPackage 存在（ai-tools 服务端推理在用），无需新增依赖。
function watermarkSvg(): string {
  const text = 'clipopai.com';
  return (
    `<svg width="640" height="140" xmlns="http://www.w3.org/2000/svg">` +
    `<text x="320" y="92" font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="700"` +
    ` fill="rgba(255,255,255,0.96)" text-anchor="middle"` +
    ` stroke="rgba(0,0,0,0.68)" stroke-width="6" paint-order="stroke" stroke-linejoin="round">${text}</text>` +
    `</svg>`
  );
}

let wmPathMemo: string | null = null;
let wmWritePromise: Promise<string | null> | null = null;

async function fileExists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** 将水印 PNG 落到 /tmp（memoized，用 sharp 实时渲染）。任何失败返回 null（调用方跳过水印，不致命）。 */
export async function getWatermarkPngPath(): Promise<string | null> {
  if (wmPathMemo) return wmPathMemo;
  if (!wmWritePromise) {
    wmWritePromise = (async () => {
      const p = path.join(os.tmpdir(), 'clipopai-wm.png');
      try {
        if (await fileExists(p)) {
          wmPathMemo = p;
          return p;
        }
        await writeWatermarkPng(p);
        wmPathMemo = p;
        return p;
      } catch {
        return null;
      }
    })();
  }
  return wmWritePromise;
}

/** 用 sharp 将水印 SVG 光栅化写入指定路径（延迟加载原生绑定，失败由调用方吞掉）。 */
async function writeWatermarkPng(p: string): Promise<void> {
  const sharp = (await import('sharp')).default;
  await sharp(Buffer.from(watermarkSvg())).png().toFile(p);
}

/** 每帧水印叠加的 overlay 高度（相对输出宽度，避免过大）。 */
const WM_HEIGHT = 64;

/**
 * 构建两输入 filter_complex 水印叠加参数（free 导出用）。返回 null 表示无需水印。
 * @param exportVf  分辨率 cap 滤镜串（输入标签之后的首段）；无则跳过 scale。
 * @param wmPng     已落地的水印 PNG 路径。
 * @param inLabel   输入视频标签，默认 `[0:v]`；jump-cut 前置链接入时传其输出标签。
 *
 * ⚠️ 不用 `-loop 1` 让 PNG 无限循环：生产 Vercel 上会把实例 OOM 杀掉（无限输入 +
 * overlay 需要持续缓冲）。改为单帧 PNG 输入，overlay 用 eof_action=repeat —— 主视频
 * 持续时重复最后一帧（水印帧），整段都保持水印，且输入有界、内存稳定。
 */
export function buildWatermarkArgs(
  exportVf: string | null,
  wmPng: string,
  inLabel: string = '[0:v]',
): { filterComplex: string; extraInputs: string[] } | null {
  const base = exportVf ? `${inLabel}${exportVf}[base];` : '';
  const filterComplex =
    `${base}[1:v]scale=w=-2:h=${WM_HEIGHT}[wm];` +
    `[base][wm]overlay=(main_w-overlay_w-24):(main_h-overlay_h-24):eof_action=repeat[out]`;
  return { filterComplex, extraInputs: ['-i', wmPng] };
}