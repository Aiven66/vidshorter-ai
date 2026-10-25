'use strict';

/**
 * AI 多语转换（本地管线）
 *
 * 目标：把一条视频的**原声音色**迁移到目标语言，并同步替换字幕。
 *
 * 全流程离线可用（除机器翻译走免费公共端点，无需 Key）：
 *   1. 输入：YouTube/B站链接（yt-dlp）或本地文件
 *   2. 抽音频 → 本地 ASR（whisper.cpp / SenseVoice，复用 local-asr）
 *   3. 字幕翻译：Google gtx → MyMemory 双端点降级（与 web 端 subtitle-translate 同源策略）
 *   4. 音色克隆：sherpa-onnx ZipVoice（零样本，用原声 3–10s 片段做 reference-audio）
 *   5. 时长对齐：逐句 atempo 拉伸到原时间轴，句间补静音
 *   6. 合成：替换原音轨（可选保留原声底噪）+ 烧录翻译字幕
 *
 * 为什么只支持中文/英文：内置的 ZipVoice 权重是 zh-en 蒸馏版，这是目前
 * **唯一**能在本地做到「音色与原声一致」的引擎；Piper 等其它本地 TTS 无法克隆音色，
 * 因此不做「听起来差不多」的伪降级——不支持的语言直接报 DUB_LANG_UNSUPPORTED。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');

const SAMPLE_RATE = 24000;
const MAX_CUE_CHARS = 220;
const CMD_TIMEOUT_MS = 10 * 60 * 1000;

/** ZipVoice 支持的目标语言（音色克隆）。 */
const CLONE_LANGS = ['zh', 'en'];

const LANG_LABELS = {
  zh: '中文',
  en: 'English',
};

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: CMD_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        err.message = `${path.basename(cmd)} failed: ${String(stderr || err.message).slice(-800)}`;
        reject(err);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function fmtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rest = ms % 1000;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rest, 3)}`;
}

function toSrt(cues) {
  return cues
    .map((c, i) => `${i + 1}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}\n`)
    .join('\n');
}

/** subtitles 滤镜的路径转义：\ ' : 三个字符会被 filtergraph 解析器吃掉。 */
function escapeFilterPath(p) {
  return p.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
}

/**
 * 免费机器翻译（无 Key）。与 web 端保持同一套降级：
 * Google gtx 优先生效；失败整体切 MyMemory（匿名限速，按字符分块）。
 */
async function translateBatch(lines, sourceLang, targetLang) {
  const to = targetLang === 'zh' ? 'zh-CN' : targetLang;
  const from = sourceLang ? (sourceLang.startsWith('zh') ? 'zh-CN' : sourceLang.split('-')[0]) : 'auto';
  const text = lines.join('\n');

  try {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}` +
      `&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const data = await res.json();
      const out = (data?.[0] || []).map((seg) => seg?.[0] || '').join('');
      const rows = out.split('\n').map((s) => s.trim());
      if (rows.length === lines.length) return rows;
    }
  } catch {}

  // MyMemory 兜底：逐行翻译 + 节流
  const out = [];
  for (const line of lines) {
    if (!line.trim()) {
      out.push(line);
      continue;
    }
    try {
      const url =
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(line.slice(0, 480))}` +
        `&langpair=${encodeURIComponent(from === 'auto' ? 'en' : from)}|${encodeURIComponent(to)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const data = res.ok ? await res.json() : null;
      out.push(String(data?.responseData?.translatedText || line));
    } catch {
      out.push(line);
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  return out;
}

/** 把 ASR cues 合并成适合配音/字幕的短句（长句按标点切，避免 TTS 一次念太久）。 */
function normalizeCues(cues) {
  const result = [];
  for (const cue of cues) {
    const text = String(cue.text || '').trim();
    if (!text) continue;
    if (text.length <= MAX_CUE_CHARS) {
      result.push({ start: Number(cue.start) || 0, end: Number(cue.end) || 0, text });
      continue;
    }
    const parts = text.match(/[^。！？.!?]+[。！？.!?]?/g) || [text];
    const span = Math.max(0.1, (Number(cue.end) - Number(cue.start)) || 0);
    const total = parts.reduce((n, p) => n + p.length, 0) || 1;
    let cursor = Number(cue.start) || 0;
    for (const part of parts) {
      const ratio = part.length / total;
      const dur = span * ratio;
      result.push({ start: cursor, end: cursor + dur, text: part.trim() });
      cursor += dur;
    }
  }
  return result;
}

function createDubber({
  ffmpegPath,
  ytdlpPath,
  workDir,
  transcribe,
  zipvoice,
  onProgress,
}) {
  function report(stage, progress, message, extra = {}) {
    try {
      onProgress?.({ stage, progress: Math.max(0, Math.min(1, progress)), message, ...extra });
    } catch {}
  }

  function capabilities() {
    const ffmpegOk = Boolean(ffmpegPath && fs.existsSync(ffmpegPath));
    const ytdlpOk = Boolean(ytdlpPath && fs.existsSync(ytdlpPath));
    const zv = zipvoice || {};
    const required = ['ttsBin', 'encoder', 'decoder', 'vocoder', 'tokens', 'lexicon', 'dataDir'];
    const missing = required.filter((k) => !zv[k] || !fs.existsSync(zv[k]));
    return {
      ffmpeg: ffmpegOk,
      ytdlp: ytdlpOk,
      cloneEngine: missing.length === 0 ? 'zipvoice' : null,
      missingModelFiles: missing,
      languages: CLONE_LANGS.map((code) => ({ code, label: LANG_LABELS[code] })),
    };
  }

  async function downloadSource(url, dir) {
    const outTemplate = path.join(dir, 'source.%(ext)s');
    await run(ytdlpPath, [
      '--no-playlist',
      '--no-warnings',
      '-f', 'bv*[height<=720]+ba/b[height<=720]/b',
      '--merge-output-format', 'mp4',
      '-o', outTemplate,
      url,
    ]);
    const entries = await fsp.readdir(dir);
    const hit = entries.find((f) => f.startsWith('source.') && !f.endsWith('.part'));
    if (!hit) throw Object.assign(new Error('视频下载失败：未找到输出文件'), { code: 'DUB_DOWNLOAD_FAILED' });
    return path.join(dir, hit);
  }

  async function extractAudio(videoPath, wavPath, rate = SAMPLE_RATE) {
    await run(ffmpegPath, ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', String(rate), '-c:a', 'pcm_s16le', wavPath]);
  }

  /** 从原声里挑一段 3–10s 的清晰人声做音色参考（优先最长句）。 */
  async function pickReference(wavPath, cues, outPath) {
    const usable = (cues || []).filter((c) => c.end - c.start >= 2.5 && String(c.text || '').trim().length >= 6);
    const pick = usable.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
    const start = Math.max(0, (pick ? pick.start : 0));
    const dur = Math.min(10, Math.max(3, pick ? pick.end - pick.start : 6));
    await run(ffmpegPath, ['-y', '-ss', String(start), '-t', String(dur), '-i', wavPath, '-ar', String(SAMPLE_RATE), '-ac', '1', outPath]);
    return { start, dur };
  }

  async function synthesize(text, outPath) {
    const zv = zipvoice;
    await run(zv.ttsBin || process.env.SHERPA_TTS_BIN, [
      `--zipvoice-encoder=${zv.encoder}`,
      `--zipvoice-decoder=${zv.decoder}`,
      `--zipvoice-vocoder=${zv.vocoder}`,
      `--zipvoice-tokens=${zv.tokens}`,
      `--zipvoice-lexicon=${zv.lexicon}`,
      `--zipvoice-data-dir=${zv.dataDir}`,
      `--reference-audio=${zv.referenceAudio}`,
      `--num-threads=2`,
      `--output-filename=${outPath}`,
      text,
    ]);
    if (!fs.existsSync(outPath)) throw Object.assign(new Error('TTS 未生成音频'), { code: 'DUB_TTS_FAILED' });
  }

  /** 把单句配音拉伸到原时间轴长度（atempo 0.75–1.6），再补齐/裁剪到精确时长。 */
  async function fitSegment(srcWav, targetSeconds, outPath) {
    const probe = await run(ffmpegPath, ['-i', srcWav, '-f', 'null', '-']);
    const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(probe.stderr);
    const actual = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : targetSeconds;
    const tempo = Math.max(0.75, Math.min(1.6, actual > 0 ? actual / Math.max(0.2, targetSeconds) : 1));
    await run(ffmpegPath, [
      '-y', '-i', srcWav,
      '-filter:a', `atempo=${tempo.toFixed(3)},apad,atrim=0:${Math.max(0.2, targetSeconds).toFixed(3)}`,
      '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'pcm_s16le', outPath,
    ]);
  }

  async function runDub({ source, targetLang, keepOriginalAudio = true, burnSubtitles = true }, shouldCancel) {
    const caps = capabilities();
    if (!caps.ffmpeg) throw Object.assign(new Error('未找到 ffmpeg'), { code: 'DUB_NO_FFMPEG' });
    if (!CAPS_HAS_CLONE(caps)) {
      throw Object.assign(
        new Error('音色克隆模型未就绪，请先在「本地模型」下载 ZipVoice（约 160MB）'),
        { code: 'DUB_MODEL_MISSING', missing: caps.missingModelFiles },
      );
    }
    if (!CLONE_LANGS.includes(targetLang)) {
      throw Object.assign(
        new Error(`暂不支持目标语言 ${targetLang}：音色克隆当前仅支持中文/英文`),
        { code: 'DUB_LANG_UNSUPPORTED', supported: CLONE_LANGS },
      );
    }

    const dir = await fsp.mkdtemp(path.join(workDir || os.tmpdir(), 'dub-'));
    const cancelled = () => Boolean(shouldCancel && shouldCancel());
    const guard = () => {
      if (cancelled()) throw Object.assign(new Error('已取消'), { code: 'DUB_CANCELLED' });
    };

    try {
      report('prepare', 0.02, '准备中…');
      let videoPath = String(source || '').trim();
      if (/^https?:\/\//i.test(videoPath)) {
        report('download', 0.05, '下载视频…');
        videoPath = await downloadSource(videoPath, dir);
      } else if (videoPath.startsWith('file://')) {
        videoPath = decodeURIComponent(videoPath.replace('file://', ''));
      }
      if (!fs.existsSync(videoPath)) throw Object.assign(new Error('找不到输入视频'), { code: 'DUB_INPUT_MISSING' });
      guard();

      const wavPath = path.join(dir, 'source.wav');
      report('audio', 0.12, '抽取音轨…');
      await extractAudio(videoPath, wavPath);
      guard();

      report('asr', 0.18, '识别原声…');
      const asr = await transcribe({ inputPath: wavPath, wantWords: false });
      const cues = normalizeCues(asr?.cues || []);
      if (!cues.length) throw Object.assign(new Error('没有识别到可用语音'), { code: 'DUB_NO_SPEECH' });
      guard();

      report('translate', 0.42, `翻译字幕（${cues.length} 句）…`);
      const sourceLang = String(asr?.lang || '').replace(/[<>|]/g, '').slice(0, 2);
      const translated = [];
      const BATCH = 20;
      for (let i = 0; i < cues.length; i += BATCH) {
        guard();
        const slice = cues.slice(i, i + BATCH);
        const lines = await translateBatch(slice.map((c) => c.text), sourceLang, targetLang);
        slice.forEach((c, idx) => translated.push({ ...c, text: lines[idx] || c.text }));
        report('translate', 0.42 + 0.13 * Math.min(1, (i + BATCH) / cues.length), `翻译字幕 ${Math.min(i + BATCH, cues.length)}/${cues.length}`);
      }
      guard();

      const referenceAudio = path.join(dir, 'reference.wav');
      report('reference', 0.56, '提取原声音色…');
      await pickReference(wavPath, cues, referenceAudio);
      zipvoice.referenceAudio = referenceAudio;
      guard();

      const segWavs = [];
      for (let i = 0; i < translated.length; i += 1) {
        guard();
        const seg = translated[i];
        const raw = path.join(dir, `seg-${i}.wav`);
        const fitted = path.join(dir, `fit-${i}.wav`);
        report('tts', 0.58 + 0.3 * (i / translated.length), `合成第 ${i + 1}/${translated.length} 句`);
        await synthesize(seg.text, raw);
        await fitSegment(raw, Math.max(0.3, seg.end - seg.start), fitted);
        segWavs.push(fitted);
      }
      guard();

      report('timeline', 0.9, '对齐时间轴…');
      const listPath = path.join(dir, 'concat.txt');
      const lines = [];
      let cursor = 0;
      for (let i = 0; i < translated.length; i += 1) {
        const gap = Math.max(0, translated[i].start - cursor);
        if (gap > 0.05) {
          const silence = path.join(dir, `gap-${i}.wav`);
          await run(ffmpegPath, ['-y', '-f', 'lavfi', '-i', `anullsrc=r=${SAMPLE_RATE}:cl=mono`, '-t', gap.toFixed(3), '-c:a', 'pcm_s16le', silence]);
          lines.push(`file '${silence.replace(/'/g, "'\\''")}'`);
        }
        lines.push(`file '${segWavs[i].replace(/'/g, "'\\''")}'`);
        cursor = translated[i].end;
      }
      await fsp.writeFile(listPath, lines.join('\n') + '\n');
      const dubWav = path.join(dir, 'dub.wav');
      await run(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'pcm_s16le', dubWav]);

      report('mux', 0.94, '合成视频…');
      const srtPath = path.join(dir, 'subtitles.srt');
      await fsp.writeFile(srtPath, toSrt(translated), 'utf8');
      const outName = `dub-${targetLang}-${Date.now()}.mp4`;
      const outPath = path.join(dir, outName);

      const args = ['-y', '-i', videoPath, '-i', dubWav];
      let filter = '';
      if (keepOriginalAudio) {
        filter += `[1:a]volume=1.0[dub];[0:a]volume=0.12[orig];[dub][orig]amix=inputs=2:duration=longest:normalize=0[a]`;
      } else {
        filter += `[1:a]anull[a]`;
      }
      if (burnSubtitles) {
        const sub = `subtitles='${escapeFilterPath(srtPath)}':force_style='FontSize=16,Outline=1,Shadow=1'`;
        filter = `[0:v]${sub}[v];${filter}`;
      } else {
        filter = `[0:v]null[v];${filter}`;
      }
      args.push('-filter_complex', filter, '-map', '[v]', '-map', '[a]');
      if (!burnSubtitles) args.push('-c:v', 'copy');
      else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20');
      args.push('-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outPath);
      await run(ffmpegPath, args);

      report('done', 1, '完成');
      return {
        outputPath: outPath,
        outputName: outName,
        cues: translated,
        sourceLang,
        targetLang,
        engine: 'zipvoice',
      };
    } finally {
      // 中间文件随临时目录清理；成品由调用方先复制出去
    }
  }

  return { capabilities, run: runDub };
}

function CAPS_HAS_CLONE(caps) {
  return caps.cloneEngine === 'zipvoice';
}

module.exports = {
  createDubber,
  CLONE_LANGS,
  LANG_LABELS,
  toSrt,
  normalizeCues,
  translateBatch,
};
