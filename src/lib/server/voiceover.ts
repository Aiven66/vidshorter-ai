import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

/**
 * AI 配音/旁白 (Voiceover) — TTS 合成。
 * 复用 msedge-tts（微软 Edge 神经网络真人声线，免费无 Key，生产已由 /api/tts + talking-avatar 验证）。
 * 单次 SSML 请求有 600 字符上限，长旁白按句/空格切块逐段合成后拼接成整段 MP3。
 */

/** 单次合成文本上限（与 /api/tts 一致，缺省的微软服务端对超长 SSML 偶发断流） */
const MAX_PART_CHARS = 580;
/** 一次旁白请求允许的最大字符数 */
export const VOICEOVER_MAX_CHARS = 1800;

/** XML 转义：msedge-tts 把文本直接嵌入 SSML，特殊字符会产生非法 XML 导致断流。 */
function escapeSSML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 语速/音调微调（msedge-tts prosody，如 rate:'+6%' / pitch:'+2Hz'）。 */
export interface VoiceProsody {
  rate?: string;
  pitch?: string;
}

/** 单次合成：流提前关闭时若已收到足够音频则接受（MP3 缺尾可正常解码）。 */
async function synthesizeOnce(text: string, voice: string, prosody?: VoiceProsody): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const opts = prosody && (prosody.rate || prosody.pitch) ? { rate: prosody.rate, pitch: prosody.pitch } : undefined;
  const { audioStream } = tts.toStream(escapeSSML(text), opts);

  const chunks: Buffer[] = [];
  try {
    for await (const chunk of audioStream) {
      chunks.push(chunk as Buffer);
    }
  } catch (streamErr) {
    const partial = Buffer.concat(chunks);
    if (partial.length < 8192) throw streamErr;
    tts.close();
    return partial;
  }
  tts.close();
  return Buffer.concat(chunks);
}

/** 模块级串行队列：同一实例内同时只保留一个 TTS WebSocket（并发会触发服务端断流）。 */
let chain: Promise<unknown> = Promise.resolve();
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

/** 用声线 ID 正则校验，避免把任意字符串当 voice 传入 msedge-tts。 */
export function isVoiceId(v: string): boolean {
  return /^[a-z]{2}(-[A-Za-z]{2,8})?-\w+Neural$/.test(v);
}

/**
 * 长文本切块：优先在句子/停顿边界断句（≤ MAX_PART_CHARS），避免在单词中间硬切。
 */
export function splitScript(text: string, maxChars = MAX_PART_CHARS): string[] {
  const cleaned = text.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!cleaned) return [];
  const parts: string[] = [];
  let rest = cleaned;
  while (rest.length > maxChars) {
    // 在近上限处找最后的句子/逗号/空格作为断点
    const window = rest.slice(0, maxChars);
    const cut =
      Math.max(
        window.lastIndexOf('。'),
        window.lastIndexOf('！'),
        window.lastIndexOf('？'),
        window.lastIndexOf('. '),
        window.lastIndexOf(', '),
        window.lastIndexOf('，'),
        window.lastIndexOf(' '),
      );
    const idx = cut >= Math.floor(maxChars * 0.5) ? cut + 1 : maxChars;
    parts.push(rest.slice(0, idx).trim());
    rest = rest.slice(idx).trim();
    if (!rest) break;
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * 合成整段旁白 MP3。逐段合成（走模块队列，最多重试 3 次）后拼接。
 * @throws 任一关键段最终失败时抛错。
 */
export async function synthesizeVoiceover(text: string, voice: string, prosody?: VoiceProsody): Promise<Buffer> {
  const parts = splitScript(text);
  if (parts.length === 0) throw new Error('No narration text to synthesize.');
  const bufs: Buffer[] = [];
  for (const part of parts) {
    let audio: Buffer | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3 && !audio; attempt++) {
      try {
        audio = await queued(() => synthesizeOnce(part, voice, prosody));
      } catch (err) {
        lastErr = err;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    if (!audio) throw lastErr ?? new Error('voiceover tts failed');
    bufs.push(audio);
  }
  const merged = Buffer.concat(bufs);
  if (merged.length < 512 || (merged[0] & 0xff) !== 0xff) {
    throw new Error('voiceover tts produced no valid audio');
  }
  return merged;
}