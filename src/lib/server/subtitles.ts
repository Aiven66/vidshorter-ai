import { access, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { translateCues } from '@/lib/server/subtitle-translate';
import { normalizeSubtitleLang, isNativeTranscript, YT_LANG_CODES } from '@/lib/subtitle-langs';

/**
 * P0 — AI 自动字幕（烧录进导出，Starter+ 付费权益）。
 *
 * 方案：用 youtube-transcript 拉取 YouTube 官方字幕 cues（非 ASR，零新增依赖），
 * 过滤到 clip 时间窗口 [startTime, startTime+duration]，重定基到 clip 相对时间，
 * 生成带样式的 ASS 字幕文件（下三分之一 + 描边 + 圆角背景），再由 cut-clip 的
 * `subtitles=<path>` 滤镜烧录进视频。
 *
 * 兜底：YouTube 无字幕或拉取失败时返回 null，调用方优雅跳过（不致命）。生产 ffmpeg
 * 有 libass→subtitles 滤镜（无 drawtext），因此用 ASS/VTT 而非 drawtext。
 */

export interface SubtitleCue {
  start: number; // 秒（clip 相对时间）
  end: number;   // 秒
  text: string;
}

export interface ClipCuesResult {
  cues: SubtitleCue[];
  /** 实际拉到的 YouTube 字幕语言（如 'en' / 'zh-Hans'）；无字幕为 null。 */
  lang: string | null;
}

/** 本部署可自指的基址（用于 self-fetch 到 Edge Runtime 路由）。 */
function selfBaseUrl(): string {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, '')}`;
  const raw =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SERVER_URL ||
    '';
  return raw.trim().replace(/\/+$/, '');
}

/**
 * 经本项目的 Edge Runtime 路由（`/api/yt-transcript`）抓取逐字稿。
 *
 * Vercel 的 AWS Lambda 出口 IP 被 YouTube 拦截 —— `youtube-transcript` 直连
 * watch 页在生产必然失败，导致字幕/粗剪/Recap/高光笔记全部拿不到 cues。
 * Edge Runtime 走另一套出口网络，因此在生产作为首选来源；路由不可达或无字幕
 * 时返回空数组，调用方回落 `youtube-transcript`（本地 dev 仍然可用）。
 */
async function fetchCuesViaEdgeRoute(
  videoId: string,
  preferredLang?: string | null,
): Promise<ClipCuesResult> {
  const base = selfBaseUrl();
  if (!base) return { cues: [], lang: null };

  const preferred = normalizeSubtitleLang(preferredLang);
  const lang = preferred ? YT_LANG_CODES[preferred]?.[0] || '' : '';

  const u = new URL(`${base}/api/yt-transcript`);
  u.searchParams.set('videoId', videoId);
  if (lang) u.searchParams.set('lang', lang);

  const res = await fetch(u.toString(), {
    signal: AbortSignal.timeout(25_000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return { cues: [], lang: null };

  const data = (await res.json()) as { cues?: unknown; lang?: unknown };
  const cues: SubtitleCue[] = (Array.isArray(data.cues) ? data.cues : [])
    .map((item) => {
      const c = item as { start?: unknown; end?: unknown; text?: unknown };
      return {
        start: Number(c.start ?? NaN),
        end: Number(c.end ?? NaN),
        text: String(c.text ?? '').trim(),
      };
    })
    .filter((c) => c.text && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start);

  return { cues, lang: cues.length > 0 ? String(data.lang || lang || 'en') : null };
}

/**
 * 拉取 YouTube 原始字幕 cues（绝对时间，未过滤窗口）。语言顺序同上：
 * preferredLang 官方字幕 → 英文 → 中文 → 自动字幕。带 8s 超时防挂起。
 * 仅供本模块内 `fetchClipCuesWithLang` / `fetchFullTranscript` 复用。
 */
async function fetchRawYouTubeCues(
  videoId: string,
  preferredLang?: string | null,
): Promise<ClipCuesResult> {
  // ① 生产首选：本项目的 Edge Runtime 路由（AWS 出口被 YouTube 拦截）
  try {
    const viaEdge = await fetchCuesViaEdgeRoute(videoId, preferredLang);
    if (viaEdge.cues.length > 0) return viaEdge;
  } catch (err) {
    console.warn('[subtitles] edge route failed:', err instanceof Error ? err.message : err);
  }

  // ② 兜底：本地直连 watch 页（dev/离线环境可用）
  try {
    const { YoutubeTranscript } = await import('youtube-transcript');
    const withTimeout = async <T>(fn: (() => Promise<T>), ms: number) =>
      Promise.race([
        fn(),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);

    const fallback = ['en', 'en-US', 'zh-Hans', 'zh', ''];
    const preferred = normalizeSubtitleLang(preferredLang);
    const preferredCodes = preferred ? YT_LANG_CODES[preferred] || [] : [];
    // 目标语言官方字幕优先；没有则英文；再按默认顺序兜底（含自动 ''）。
    const langs = preferred
      ? [...preferredCodes, ...fallback.filter((l) => !preferredCodes.includes(l))]
      : fallback;

    for (const lang of langs) {
      try {
        const transcript = await withTimeout(
          () =>
            lang
              ? YoutubeTranscript.fetchTranscript(videoId, { lang })
              : YoutubeTranscript.fetchTranscript(videoId),
          8000,
        );
        if (!Array.isArray(transcript) || transcript.length === 0) continue;

        const cues: SubtitleCue[] = transcript
          .map((item: { offset?: number; duration?: number; text?: string }) => ({
            start: Number(item.offset ?? 0) / 1000,
            end: (Number(item.offset ?? 0) + Number(item.duration ?? 0)) / 1000,
            text: String(item.text ?? '').trim(),
          }))
          .filter((c: SubtitleCue) => c.text && c.end > c.start);
        if (cues.length > 0) return { cues, lang: lang || 'en' };
      } catch {
        // 该语言失败，尝试下一个
      }
    }
  } catch (err) {
    console.warn('[subtitles] youtube-transcript failed:', err instanceof Error ? err.message : err);
  }
  return { cues: [], lang: null };
}

/**
 * 拉取某个 YouTube 视频的字幕 cues 并过滤到 clip 窗口（带语言信息）。
 *
 * 语言顺序：传入 preferredLang（如 zh-CN）时，先尝试该语言的官方字幕
 * （YT_LANG_CODES 映射的代码列表），没有才依次回退英文/中文/自动；
 * 未传 preferredLang 时保持既有行为（优先英文，缺英文退中文）。
 * 带 8s 超时防挂起。任一语言失败自动尝试下一个。
 *
 * @param videoId  YouTube 视频 ID
 * @param startTime clip 在原视频上的起始时间（秒）
 * @param duration  clip 时长（秒）
 * @param preferredLang 翻译目标语言（白名单代码）；null/undefined = 不指定（原行为）
 * @returns 过滤并重定基后的 cues + 实际使用的语言；无字幕返回空数组
 */
export async function fetchClipCuesWithLang(
  videoId: string,
  startTime: number,
  duration: number,
  preferredLang?: string | null,
): Promise<ClipCuesResult> {
  const absEnd = startTime + duration;
  const raw = await fetchRawYouTubeCues(videoId, preferredLang);
  const cues: SubtitleCue[] = raw.cues
    .filter((c) => c.end > startTime && c.start < absEnd)
    .map((c) => ({
      start: Math.max(0, c.start - startTime),
      end: Math.min(duration, c.end - startTime),
      text: c.text,
    }));
  return { cues, lang: cues.length > 0 ? raw.lang : null };
}

/**
 * 拉取整段视频的**全量**字幕（绝对时间，不做窗口过滤）。
 * Recap Studio 需要全量字幕来做音画对齐（候选窗打分）与解说稿生成。
 *
 * @returns 全量 cues（按时间升序）+ 实际语言；无字幕返回空数组
 */
export async function fetchFullTranscript(
  videoId: string,
  preferredLang?: string | null,
): Promise<ClipCuesResult> {
  const raw = await fetchRawYouTubeCues(videoId, preferredLang);
  const cues = raw.cues
    .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start)
    .sort((a, b) => a.start - b.start);
  return { cues, lang: cues.length > 0 ? raw.lang : null };
}

/**
 * 拉取字幕并过滤到 clip 窗口（无语言信息，向后兼容）。
 * @see fetchClipCuesWithLang
 */
export async function fetchClipCues(
  videoId: string,
  startTime: number,
  duration: number,
  preferredLang?: string | null,
): Promise<SubtitleCue[]> {
  const r = await fetchClipCuesWithLang(videoId, startTime, duration, preferredLang);
  return r.cues;
}

/**
 * 生成 ASS 字幕文件内容（带样式）并返回文件路径。
 *
 * 样式：下三分之一、白字、粗体、黑色描边 + 阴影、半透明圆角背景对齐字幕高度，
 * 字号随输出分辨率自适应（PlayResY=1080，ScaleY 由 ffmpeg subtitles 滤镜处理）。
 * 行内超长文本自动换行（每行 ≤40 字符），多行堆叠显示。
 *
 * @param cues 已重定基到 clip 相对时间的字幕
 * @param forceRawByline 保留原始换行（VTT 风格）——默认收起（丢弃 \n 折叠为空格）
 * @returns ASS 文件绝对路径；cues 为空时返回 null
 */
export async function buildAssFile(
  cues: SubtitleCue[],
  style: SubtitleStyle = DEFAULT_SUBTITLE_STYLE,
): Promise<string | null> {
  if (!cues || cues.length === 0) return null;

  const styleParams = subtitleStyleAssParams(style, false);
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
    `Style: Sub, ${styleParams}`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec.toFixed(2)).padStart(5, '0')}`;
  };

  const escapeAss = (text: string) =>
    text
      .replace(/\r/g, '')
      .replace(/\\n/gi, ' ')
      .replace(/[{}]/g, '')
      .replace(/,\s+/, ',');

  const lines: string[] = [];
  for (const cue of cues) {
    const text = escapeAss(cue.text);
    if (!text) continue;
    // 智能换行：按词累积成 ≤40 字符的短行，最多 2 行，用 \N 换行（避免字幕溢出）。
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    const lines2: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length > 40 && cur) {
        lines2.push(cur);
        cur = w;
      } else {
        cur = next;
      }
    }
    if (cur) lines2.push(cur);
    const finalText = lines2.slice(0, 2).join('\\N');
    // 时间需单调递增；重叠 cue 取其 start 但保证 ≥ 上一条 end（避免字幕倒退）
    const clipStart = Math.min(cue.end, Math.max(0, cue.start));
    const clipEnd = Math.max(clipStart + 0.2, cue.end);
    lines.push(`Dialogue: 0,${fmtTime(clipStart)},${fmtTime(clipEnd)},Sub,,0,0,0,,${finalText}`);
  }

  if (lines.length === 0) return null;

  const path = join(tmpdir(), `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ass`);
  await writeFile(path, header + '\n' + lines.join('\n') + '\n', 'utf-8');
  return path;
}

/**
 * ★ serverless 字体修复：libass 走 fontconfig provider，而 Lambda 无 /etc/fonts 配置，
 * 导致 subtitles 滤镜渲染不出任何文字（stderr: "Failed to load fontconfig fonts!"）。
 * 此函数写一个指向 public/fonts 的最小 fontconfig 配置，并设置 FONTCONFIG_FILE 环境变量，
 * 使 ffmpeg 子进程（execFile/spawn 继承 env）里的 libass 能通过 fontconfig 找到字体。
 * 返回配置文件路径（调用方负责 finally 清理）；失败返回 null（不致命）。
 */
export async function setupFontConfig(): Promise<string | null> {
  try {
    const fontsDir = join(process.cwd(), 'public', 'fonts');
    const cacheDir = join(tmpdir(), 'fc-cache');
    await mkdir(cacheDir, { recursive: true });
    const cfgPath = join(tmpdir(), `fontconfig-${Date.now()}.conf`);
    const cfg = [
      '<?xml version="1.0"?>',
      '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
      '<fontconfig>',
      `  <dir>${fontsDir}</dir>`,
      `  <cachedir>${cacheDir}</cachedir>`,
      '</fontconfig>',
      '',
    ].join('\n');
    await writeFile(cfgPath, cfg, 'utf-8');
    process.env.FONTCONFIG_FILE = cfgPath;
    return cfgPath;
  } catch (err) {
    console.warn('[subtitles] setupFontConfig failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// P0 — 字幕样式选项（Starter+ 权益）。静态字幕与卡拉OK 共用一套样式参数：
// 前端传 style 对象 → 服务端白名单归一化 → 写入 ASS Style 行 + ffmpeg force_style。
// 默认值保持既有渲染（medium/bottom/bold/box/yellow）。
// ─────────────────────────────────────────────────────────────────────────────

export interface SubtitleStyle {
  /** 字号档位：小/中/大（ASS Fontsize，输出分辨率由 libass 按 PlayRes 自动缩放） */
  size: 'small' | 'medium' | 'large';
  /** 位置：底部 / 顶部（Alignment + MarginV） */
  position: 'bottom' | 'top';
  /** 描边强度：无 / 细 / 粗（Outline + Shadow） */
  outline: 'none' | 'light' | 'bold';
  /** 背景：无（全透明）/ 半透明黑框（BackColour） */
  background: 'none' | 'box';
  /** 卡拉OK 高亮色（仅卡拉OK 生效，静态字幕忽略——SecondaryColour） */
  highlight: 'yellow' | 'cyan' | 'pink' | 'green' | 'orange';
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  size: 'medium',
  position: 'bottom',
  outline: 'bold',
  background: 'box',
  highlight: 'yellow',
};

const STYLE_SIZE: Record<SubtitleStyle['size'], number> = { small: 46, medium: 58, large: 70 };
const STYLE_OUTLINE: Record<SubtitleStyle['outline'], { outline: number; shadow: number }> = {
  none: { outline: 0, shadow: 0 },
  light: { outline: 1, shadow: 1 },
  bold: { outline: 3, shadow: 2 },
};
/** ASS 颜色为 &HAABBGGRR（Alpha+BGR）。SecondaryColour = 卡拉OK 逐词高亮填充色。 */
const STYLE_HIGHLIGHT: Record<SubtitleStyle['highlight'], string> = {
  yellow: '&H0000FFFF',
  cyan: '&H00FFFF00',
  pink: '&H00FF00FF',
  green: '&H0000FF00',
  orange: '&H0010A5FF',
};

/** 白名单归一化（前端不可信，非法值一律回落默认）。 */
export function normalizeSubtitleStyle(raw: unknown): SubtitleStyle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, map: Record<string, T>, fallback: T): T =>
    typeof v === 'string' && Object.prototype.hasOwnProperty.call(map, v) ? (v as T) : fallback;
  return {
    size: pick(r.size, STYLE_SIZE, 'medium'),
    position: r.position === 'top' ? 'top' : 'bottom',
    outline: pick(r.outline, STYLE_OUTLINE, 'bold'),
    background: r.background === 'none' ? 'none' : 'box',
    highlight: pick(r.highlight, STYLE_HIGHLIGHT, 'yellow'),
  };
}

/** ASS Style 行 "Sub, " 之后的 22 个字段（按 style 生成）。karaoke=true 时 SecondaryColour 用高亮色。 */
export function subtitleStyleAssParams(style: SubtitleStyle, karaoke: boolean): string {
  const fontsize = STYLE_SIZE[style.size];
  const { outline, shadow } = STYLE_OUTLINE[style.outline];
  const backColour = style.background === 'box' ? '&H96000000' : '&H00000000';
  const secondary = karaoke ? STYLE_HIGHLIGHT[style.highlight] : '&H000000FF';
  const alignment = style.position === 'top' ? 8 : 2;
  const marginV = style.position === 'top' ? 60 : 90;
  return `Noto Sans SC, ${fontsize}, &H00FFFFFF, ${secondary}, &H00101010, ${backColour}, -1, 0, 0, 0, 100, 100, 0, 0, 1, ${outline}, ${shadow}, ${alignment}, 60, 60, ${marginV}, 1`;
}

/** 生成 ffmpeg subtitles 滤镜的 force_style（原始逗号分隔；嵌入 filtergraph 时逗号须 \, 转义）。 */
export function subtitleFilterForceStyle(style: SubtitleStyle, karaoke: boolean): string {
  const fontsize = STYLE_SIZE[style.size];
  const { outline, shadow } = STYLE_OUTLINE[style.outline];
  const alignment = style.position === 'top' ? 8 : 2;
  const marginV = style.position === 'top' ? 60 : 90;
  const parts = [
    `Fontsize=${fontsize}`,
    `Outline=${outline}`,
    `Shadow=${shadow}`,
    'Bold=1',
    `Alignment=${alignment}`,
    `MarginV=${marginV}`,
  ];
  if (karaoke) parts.push(`SecondaryColour=${STYLE_HIGHLIGHT[style.highlight]}`);
  return parts.join(',');
}

/**
 * 拉取 clip 窗口内的字幕 cues，并按需翻译成目标语言（不生成 ASS 文件）。
 *
 * 与 `buildClipSubtitleFile` 的区别：把「取 cues」这一步单独暴露出来，供 AI 粗剪
 * （jump-cut）在生成字幕前先拿到 cues 做时间轴重映射，避免字幕与剪后画面对不上。
 *
 * @param lang 翻译目标语言（白名单代码）。目标语言有官方字幕 → 直接用官方字幕；
 *             否则拉英文 → 机器翻译成目标语言。null/undefined = 不翻译（原行为）。
 * @returns 重定基到 clip 相对时间、已按需翻译的 cues；失败返回空数组（不致命）
 */
export async function fetchClipCuesTranslated(
  videoId: string,
  startTime: number,
  duration: number,
  lang?: string | null,
): Promise<SubtitleCue[]> {
  try {
    const target = normalizeSubtitleLang(lang);
    const { cues, lang: usedLang } = await fetchClipCuesWithLang(videoId, startTime, duration, target ?? undefined);
    if (cues.length === 0) return [];
    // 拉到的是目标语言官方字幕 → 直接用；否则（英文回退）→ 机器翻译。
    if (target && usedLang && !isNativeTranscript(usedLang, target)) {
      return await translateCues(cues, target, usedLang);
    }
    return cues;
  } catch (err) {
    console.warn('[subtitles] fetchClipCuesTranslated failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * 便利函数：拉字幕（可选翻译）→ 生成 ASS → 返回文件路径。任何一步失败均返回 null（不致命）。
 *
 * @param lang 翻译目标语言（白名单代码）。目标语言有官方字幕 → 直接用官方字幕；
 *             否则拉英文 → 机器翻译成目标语言。null/undefined = 不翻译（原行为）。
 */
export async function buildClipSubtitleFile(
  videoId: string,
  startTime: number,
  duration: number,
  style?: SubtitleStyle,
  lang?: string | null,
): Promise<string | null> {
  try {
    const cues = await fetchClipCuesTranslated(videoId, startTime, duration, lang);
    if (cues.length === 0) return null;
    return await buildAssFile(cues, style);
  } catch (err) {
    console.warn('[subtitles] buildClipSubtitleFile failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// P0 — 动态字幕 Karaoke（逐词高亮，对标 Recapo，Starter+ 付费权益）。
//
// 原理：ASS 卡拉OK 标签 `{\k<centiseconds>}`。libass 渲染时用 SecondaryColour
// （高亮色）从行首开始按 `\k` 时长逐词"吃掉"文本，形成歌词跟唱效果。
// ffmpeg 的 subtitles 滤镜基于 libass，`\k` 标签有效。
// 降级：即使 libass 忽略 `\k`，字幕仍静态显示（不致命，样式不变）。
// ─────────────────────────────────────────────────────────────────────────────

/** 卡拉OK分词：拉丁词/数字为一个 token（含撇号连词），CJK 每字一个 token；超长拉丁词按 ≤6 字符拆块（逐块高亮）。sp=与前 token 之间是否有空格。 */
function karaokeTokens(text: string): { tok: string; w: number; sp: boolean }[] {
  const out: { tok: string; w: number; sp: boolean }[] = [];
  const re = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[\u3040-\u30ff\u4e00-\u9fa5]|[^\s]/g;
  let lastEnd = 0;
  for (const m of text.matchAll(re)) {
    const gap = m.index > lastEnd;
    lastEnd = m.index + m[0].length;
    const tok = m[0];
    if (/^[\u3040-\u30ff\u4e00-\u9fa5]$/.test(tok)) {
      out.push({ tok, w: 2, sp: false }); // CJK 单字：字间无空格
    } else if (tok.length > 12) {
      for (let i = 0; i < tok.length; i += 6) {
        const chunk = tok.slice(i, i + 6);
        out.push({ tok: chunk, w: chunk.length, sp: i === 0 ? gap : false });
      }
    } else {
      out.push({ tok, w: tok.length, sp: gap });
    }
  }
  return out;
}

/** 把一行 tokens 按行内宽度占比分配 `{\k}` 时长（末词吃掉取整余量），拼成 ASS 行文本。 */
function karaokeLineText(tokens: { tok: string; w: number; sp: boolean }[], lineMs: number): string {
  const totalW = tokens.reduce((s, t) => s + t.w, 0) || 1;
  const csList: number[] = [];
  let acc = 0;
  for (let i = 0; i < tokens.length; i++) {
    const cs = i === tokens.length - 1
      ? 0
      : Math.max(1, Math.round((tokens[i].w / totalW) * lineMs / 10));
    csList.push(cs);
    acc += cs;
  }
  const lastIdx = tokens.length - 2; // 最后一个有 \k 的词
  if (lastIdx >= 0) {
    const remaining = Math.max(0, Math.round(lineMs / 10) - acc);
    csList[lastIdx] += remaining;
  }
  let s = '{\\k0}';
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0 && tokens[i].sp) s += ' ';
    s += tokens[i].tok;
    if (csList[i] > 0) s += `{\\k${csList[i]}}`;
  }
  return s;
}

/**
 * 生成逐词卡拉OK 的 ASS 行文本（`\k` 标签，按词宽占比把总时长分摊到每个词）。
 *
 * 智能分组为 ≤ maxRows 行（行内宽度 ≤ maxWidth 权重），多行按行宽占比共享总时长；
 * 返回以 `\N` 连接的 ASS 文本，无有效 token 时返回空串。
 *
 * 供 clip 卡拉OK 字幕与 AI 成片（render.ts）共用，避免两套实现漂移。
 *
 * @param text 一行文本（已转义、无换行）
 * @param totalMs 该行/该分镜的总时长（毫秒）
 * @param maxRows 最大行数（默认 2）
 * @param maxWidth 行内宽度上限（拉丁按字符数、CJK 每字记 2；默认 40）
 */
export function buildKaraokeText(
  text: string,
  totalMs: number,
  maxRows = 2,
  maxWidth = 40,
): string {
  const tokens = karaokeTokens(text);
  if (tokens.length === 0) return '';

  const rows: { tokens: typeof tokens; w: number }[] = [];
  let cur: typeof tokens = [];
  let curW = 0;
  for (const t of tokens) {
    if (curW + t.w > maxWidth && cur.length) {
      rows.push({ tokens: cur, w: curW });
      cur = [];
      curW = 0;
      if (rows.length >= maxRows) break;
    }
    cur.push(t);
    curW += t.w;
  }
  if (cur.length && rows.length < maxRows) rows.push({ tokens: cur, w: curW });
  if (rows.length === 0) return '';

  const cueMs = Math.max(300, Math.round(totalMs));
  const totalRowW = rows.reduce((s, r) => s + r.w, 0) || 1;
  let usedMs = 0;
  const rowTexts: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const lineMs = i === rows.length - 1
      ? Math.max(100, cueMs - usedMs)
      : Math.max(100, Math.round((rows[i].w / totalRowW) * cueMs));
    usedMs += lineMs;
    rowTexts.push(karaokeLineText(rows[i].tokens, lineMs));
  }
  return rowTexts.join('\\N');
}

/**
 * 生成卡拉OK 动态字幕 ASS 文件（逐词高亮，SecondaryColour 亮黄）并返回路径。
 * 无 tokens 时返回 null。PlayRes 按 orientation 自适应（横屏 1280x720 / 竖屏 1080x1920），
 * 使字幕字号在输出分辨率下直接合适（不依赖 force_style 缩放）。
 */
export async function buildKaraokeAssFile(
  cues: SubtitleCue[],
  orientation: 'landscape' | 'vertical' = 'vertical',
  style: SubtitleStyle = DEFAULT_SUBTITLE_STYLE,
): Promise<string | null> {
  if (!cues || cues.length === 0) return null;
  const horizontal = orientation === 'landscape';
  const playX = horizontal ? 1280 : 1080;
  const playY = horizontal ? 720 : 1920;

  const styleParams = subtitleStyleAssParams(style, true);
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${playX}`,
    `PlayResY: ${playY}`,
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // SecondaryColour = 卡拉OK 高亮色（ASS 颜色为 &HAABBGGRR，默认亮黄）
    `Style: Sub, ${styleParams}`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec.toFixed(2)).padStart(5, '0')}`;
  };

  const escapeAss = (text: string) =>
    text.replace(/\r/g, '').replace(/\\n/gi, ' ').replace(/[{}]/g, '').replace(/,\s+/, ',');

  const lines: string[] = [];
  for (const cue of cues) {
    const text = escapeAss(cue.text);
    if (!text) continue;
    const cueMs = Math.max(300, Math.round((cue.end - cue.start) * 1000));
    const karaokeText = buildKaraokeText(text, cueMs, 2, 40);
    if (!karaokeText) continue;

    // 时间单调递增（与静态字幕一致）
    const clipStart = Math.min(cue.end, Math.max(0, cue.start));
    const clipEnd = Math.max(clipStart + 0.2, cue.end);
    lines.push(`Dialogue: 0,${fmtTime(clipStart)},${fmtTime(clipEnd)},Sub,,0,0,0,,${karaokeText}`);
  }

  if (lines.length === 0) return null;

  const path = join(tmpdir(), `karaoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ass`);
  await writeFile(path, header + '\n' + lines.join('\n') + '\n', 'utf-8');
  return path;
}