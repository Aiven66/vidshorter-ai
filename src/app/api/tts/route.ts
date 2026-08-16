import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 服务端语音合成 API（真实神经网络人声）。
 *
 * 使用 GitHub 开源库 msedge-tts（微软 Edge Read Aloud 服务的 Node.js 实现），
 * 免费、无需 API Key，支持 140+ 语言的神经网络真人声线（男/女）。
 *
 * POST { text, voice }  → audio/mpeg (24kHz mono MP3)
 */
/**
 * XML 转义：msedge-tts 将文本直接嵌入 SSML，
 * 含 & < > 等字符的文案（如 Amazon 商品描述）会产生非法 XML 导致服务端断流。
 */
function escapeSSML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 单次合成：流提前关闭（微软服务端偶发不发送 turn.end）时，
 * 若已收到足够音频则直接接受（MP3 缺尾部可正常解码）。
 */
async function synthesizeOnce(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(escapeSSML(text));

  const chunks: Buffer[] = [];
  try {
    for await (const chunk of audioStream) {
      chunks.push(chunk as Buffer);
    }
  } catch (streamErr) {
    const partial = Buffer.concat(chunks);
    if (partial.length < 8192) throw streamErr; // 音频不足，视为真失败
    tts.close();
    return partial;
  }
  tts.close();
  return Buffer.concat(chunks);
}

/** 模块级串行队列：同一实例内同时只保留一个 TTS WebSocket（并发会触发服务端断流） */
let chain: Promise<unknown> = Promise.resolve();
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const voice =
      typeof body?.voice === 'string' && /^[a-z]{2}(-[A-Za-z]{2,8})?-\w+Neural$/.test(body.voice)
        ? body.voice
        : 'en-US-JennyNeural';

    if (!text || text.length > 600) {
      return NextResponse.json({ error: 'text required (max 600 chars)' }, { status: 400 });
    }

    // 最多重试 3 次（服务端偶发流中断）
    let audio: Buffer | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3 && !audio; attempt++) {
      try {
        audio = await queued(() => synthesizeOnce(text, voice));
      } catch (err) {
        lastErr = err;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    if (!audio) throw lastErr ?? new Error('tts failed');

    // MP3 帧头 0xFFEx；有效音频至少几 KB
    if (audio.length < 512 || (audio[0] & 0xff) !== 0xff) {
      return NextResponse.json({ error: 'tts produced no audio' }, { status: 502 });
    }

    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/tts] error:', err);
    return NextResponse.json({ error: 'TTS synthesis failed' }, { status: 500 });
  }
}
