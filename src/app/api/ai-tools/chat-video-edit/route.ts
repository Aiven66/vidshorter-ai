/**
 * AI 对话视频剪辑 — 服务端 LLM + ffmpeg（支持多视频混剪）
 *
 * POST { videoUrls: string[], messages: [{role, content}], locale }
 * 1. 探测每个视频的元数据
 * 2. LLM 分析用户需求 → 生成 ffmpeg 命令（支持多路输入）
 * 3. 执行 ffmpeg 命令
 * 4. 返回结果 URL
 */

import { NextRequest } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

import {
  ApiError,
  assertUserStorageUrl,
  jsonError,
  requireUserId,
  uploadResult,
} from '@/lib/server/ai-tools/storage';

const execFileAsync = promisify(execFile);

export const maxDuration = 300;
export const runtime = 'nodejs';

const MAX_VIDEO_BYTES = 48 * 1024 * 1024;
const MAX_VIDEO_DURATION_S = 900;
const MAX_VIDEO_COUNT = 6;

interface VideoMeta {
  index: number;
  durationS: number;
  width: number;
  height: number;
  hasAudio: boolean;
  sizeBytes: number;
}

/** ffmpeg 二进制查找 */
let ffmpegBinaryCache: string | null = null;
function findFfmpegBinary(): string {
  if (ffmpegBinaryCache) return ffmpegBinaryCache;

  const candidates: string[] = [];
  try {
    const staticPath = require('ffmpeg-static');
    if (typeof staticPath === 'string' && existsSync(staticPath)) candidates.push(staticPath);
  } catch {}
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer?.path && existsSync(installer.path)) candidates.push(installer.path);
  } catch {}
  candidates.push('ffmpeg');

  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  for (const candidate of candidates) {
    try {
      const probe = spawnSync(candidate, ['-version'], { timeout: 10_000 });
      if (probe.status === 0) {
        ffmpegBinaryCache = candidate;
        return candidate;
      }
    } catch {}
  }
  ffmpegBinaryCache = 'ffmpeg';
  return 'ffmpeg';
}

/** 从 ffmpeg -i 的 stderr 解析时长与分辨率 */
function probeFromStderr(stderr: string): { durationS: number; width: number; height: number; hasAudio: boolean } {
  const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationS = durMatch
    ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3])
    : 0;
  const dimMatch = stderr.match(/,\s(\d{2,5})x(\d{2,5})[\s,]/);
  const width = dimMatch ? parseInt(dimMatch[1]) : 0;
  const height = dimMatch ? parseInt(dimMatch[2]) : 0;
  const hasAudio = /Audio:\s/.test(stderr);
  return { durationS, width, height, hasAudio };
}

/** 探测单个视频元数据 */
async function probeVideo(ffmpeg: string, url: string, index: number, sizeBytes: number): Promise<VideoMeta> {
  let probe: ReturnType<typeof probeFromStderr>;
  try {
    await execFileAsync(ffmpeg, ['-hide_banner', '-i', url], { timeout: 30_000 });
    probe = probeFromStderr('');
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr || '';
    probe = probeFromStderr(stderr);
  }
  if (!probe.width || !probe.height) throw new ApiError(400, `VIDEO_DECODE_FAILED:${index}`);
  if (probe.durationS > MAX_VIDEO_DURATION_S) throw new ApiError(400, `VIDEO_TOO_LONG:${index}`);
  return { ...probe, index, sizeBytes };
}

/** 构建 LLM 系统提示词（多视频版） */
function buildSystemPrompt(videos: VideoMeta[], locale: string): string {
  const localeNames: Record<string, string> = {
    en: 'English', zh: '简体中文', 'zh-Hant': '繁體中文',
    ja: '日本語', ko: '한국어', de: 'Deutsch', fr: 'Français',
    it: 'Italiano', es: 'Español', pt: 'Português',
    hi: 'हिन्दी', ar: 'العربية', id: 'Bahasa Indonesia',
    ms: 'Bahasa Melayu', th: 'ไทย', ru: 'Русский',
    vi: 'Tiếng Việt', tr: 'Türkçe',
  };
  const lang = localeNames[locale] || 'English';

  // 构建视频元数据列表
  const videoList = videos.map(v =>
    `Video ${v.index + 1} (index ${v.index}): ${v.width}x${v.height}, ${Math.round(v.durationS)}s, ${v.hasAudio ? 'has audio' : 'no audio'}, ${(v.sizeBytes / 1024 / 1024).toFixed(1)}MB`
  ).join('\n');

  return `You are an expert ffmpeg video editor. The user has uploaded ${videos.length} video(s):

${videoList}

Each video URL is passed as a separate -i argument to ffmpeg in order of their index. 
- Video 1 (index 0) = first -i argument
- Video 2 (index 1) = second -i argument
- etc.

Your task is to generate ffmpeg commands for the user's editing requests.

SINGLE-VIDEO OPERATIONS (use when only one video is involved or per-video edits):
1. Trim: -ss START -to END -c copy
2. Speed change: setpts=0.5*PTS (slow×2), atempo=2.0 (fast×2)
3. Resize: -vf scale=1280:720
4. Crop: -vf crop=W:H:X:Y
5. Add text overlay: -vf drawtext=text='Hello':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=50
6. Volume: -af volume=2.0
7. Remove audio: -an
8. Color filters: eq=brightness=0.0:saturation=1.5:contrast=1.2
9. Rotate: transpose=1 (90° CW), transpose=2 (90° CCW)
10. Fade in/out: fade=in:0:d=1, fade=out:st=10:d=2
11. Reverse: -vf reverse (slow; use for short clips)
12. Extract audio: -vn -c:a copy output.mp3
13. Mute segment: -af volume=enable='between(t,5,10)':volume=0
14. GIF: -vf fps=10,scale=480:-1:flags=lanczos output.gif

MULTI-VIDEO MIXING OPERATIONS:
15. Concatenate (merge in sequence):
    -i URL0 -i URL1 -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1" -c:v libx264 -c:a aac
    For n videos: concat=n=${videos.length}:v=1:a=1

16. Side-by-side (horizontal stack):
    -i URL0 -i URL1 -filter_complex "[0:v]scale=iw/2:ih[v0];[1:v]scale=iw/2:ih[v1];[v0][v1]hstack=inputs=2" -c:v libx264

17. Vertical stack (top-bottom):
    -i URL0 -i URL1 -filter_complex "[0:v]scale=iw:ih/2[v0];[1:v]scale=iw:ih/2[v1];[v0][v1]vstack=inputs=2" -c:v libx264

18. Picture-in-picture (overlay):
    -i URL0 -i URL1 -filter_complex "[1:v]scale=iw/3:ih/3[pip];[0:v][pip]overlay=W-w-10:H-h-10" -c:v libx264

19. Cross-fade transition between two clips:
    -i URL0 -i URL1 -filter_complex "[0:v]trim=d=DURATION[v0];[0:a]atrim=d=DURATION[a0];[1:v]trim=d=DURATION[v1];[1:a]atrim=d=DURATION[a1];[v0][v1]xfade=transition=fade:duration=1:offset=OFFSET,format=yuv420p[vout];[a0][a1]acrossfade=d=1[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -c:a aac
    (DURATION = shorter clip duration, OFFSET = DURATION - 1)

20. Grid layout (2x2 for 4 videos):
    -i URL0 -i URL1 -i URL2 -i URL3 -filter_complex "[0:v]scale=iw/2:ih/2[v0];[1:v]scale=iw/2:ih/2[v1];[2:v]scale=iw/2:ih/2[v2];[3:v]scale=iw/2:ih/2[v3];[v0][v1]hstack[v01];[v2][v3]hstack[v23];[v01][v23]vstack" -c:v libx264

21. Audio mixing (overlay audio from one video onto another):
    -i URL0 -i URL1 -filter_complex "[1:a]volume=0.5[a1];[0:a][a1]amix=inputs=2:duration=first" -c:v copy -c:a aac

CRITICAL RULES:
1. Always use -y (overwrite output)
2. Output path: /tmp/ai-chat-edit/output.mp4 (or .gif / .mp3 as appropriate)
3. Use -ss BEFORE -i for fast seeking when trimming
4. Video codec: -c:v libx264 -preset veryfast -crf 23
5. Audio codec: -c:a aac -b:a 128k
6. Web optimization: -movflags +faststart (for MP4 output)
7. For complex filters, use -filter_complex instead of -vf
8. Input URLs: use the video URLs provided in the user's message context
9. If the request is impossible or unsafe, explain why
10. Do NOT use protocols that access local filesystem (file://, concat: with local files)
11. When referencing videos in the command, use -i for each URL in order
12. For concat, each video must have the same codec parameters or use re-encoding

Output ONLY valid JSON with this exact structure:
{
  "reasoning": "Brief technical explanation of the edit (in ${lang})",
  "userReply": "Friendly response to the user explaining what was done (in ${lang})",
  "commands": [
    {
      "description": "Human-readable step description (in ${lang})",
      "command": "the full ffmpeg command line"
    }
  ]
}

If multiple commands are needed, they will be executed in sequence. Keep it to 1-2 commands max.`;
}

/** 从 LLM 响应中提取 JSON */
function extractJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const workDir = await mkdtemp(path.join(tmpdir(), 'ai-chat-edit-'));
  try {
    const userId = await requireUserId(req);
    const body = (await req.json()) as {
      videoUrls?: string[];
      messages?: Array<{ role: string; content: string }>;
      locale?: string;
      aiConfig?: {
        enabled?: boolean;
        apiKey?: string;
        baseUrl?: string;
        modelBaseUrl?: string;
        model?: string;
      };
    };

    if (!Array.isArray(body.videoUrls) || body.videoUrls.length === 0) {
      throw new ApiError(400, 'MISSING_VIDEOS');
    }
    if (body.videoUrls.length > MAX_VIDEO_COUNT) {
      throw new ApiError(400, 'TOO_MANY_VIDEOS', `Maximum ${MAX_VIDEO_COUNT} videos allowed.`);
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new ApiError(400, 'MISSING_PARAMS');
    }

    const videoUrls = body.videoUrls.map((url, i) => {
      const validated = assertUserStorageUrl(url, userId, 'ai-tools');
      return { index: i, url: validated };
    });

    const lastUserMsg = body.messages.filter(m => m.role === 'user').pop()?.content || '';
    if (!lastUserMsg) throw new ApiError(400, 'MISSING_USER_MESSAGE');

    // 1. 大小检查 + 探测视频元数据
    const ffmpeg = findFfmpegBinary();
    const probes: VideoMeta[] = [];

    for (const v of videoUrls) {
      const head = await fetch(v.url, { method: 'HEAD' });
      const contentLength = Number(head.headers.get('content-length') || 0);
      if (contentLength > MAX_VIDEO_BYTES) throw new ApiError(400, `VIDEO_TOO_LARGE:${v.index}`);
      const meta = await probeVideo(ffmpeg, v.url, v.index, contentLength);
      probes.push(meta);
    }

    // 2. 调用 LLM 生成 ffmpeg 命令
    const locale = body.locale || 'en';
    const systemPrompt = buildSystemPrompt(probes, locale);

    // 构建 Config：管理员后台配置的密钥优先，其次再使用环境变量（与视频处理流程一致）
    const aiConfig = body.aiConfig;
    const config = new Config(
      (aiConfig?.enabled && aiConfig?.apiKey)
        ? {
            apiKey: aiConfig.apiKey,
            baseUrl: aiConfig.baseUrl || process.env.COZE_INTEGRATION_BASE_URL,
            modelBaseUrl: aiConfig.modelBaseUrl || process.env.COZE_INTEGRATION_MODEL_BASE_URL,
          }
        : {
            apiKey: process.env.COZE_WORKLOAD_IDENTITY_API_KEY,
            baseUrl: process.env.COZE_INTEGRATION_BASE_URL,
            modelBaseUrl: process.env.COZE_INTEGRATION_MODEL_BASE_URL,
          }
    );
    const llmModel = (aiConfig?.enabled && aiConfig?.model)
      ? aiConfig.model
      : 'doubao-seed-1-8-251228';
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers);
    const llmClient = new LLMClient(config, customHeaders);

    // 构建聊天上下文
    const llmMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // 构建视频URL引用字符串
    const videoUrlRefs = videoUrls.map((v, i) => `Video ${i + 1} URL: ${v.url}`).join('\n');

    for (const msg of body.messages) {
      if (msg.role === 'system') continue;
      if (msg.role === 'user' && msg.content === lastUserMsg) {
        llmMessages.push({
          role: 'user',
          content: `${videoUrlRefs}\n\nUser request: ${lastUserMsg}`,
        });
      } else {
        llmMessages.push(msg);
      }
    }

    if (!llmMessages.some(m => m.role === 'user')) {
      llmMessages.push({
        role: 'user',
        content: `${videoUrlRefs}\n\nUser request: ${lastUserMsg}`,
      });
    }

    let llmResponse;
    try {
      llmResponse = await llmClient.invoke(llmMessages, {
        model: llmModel,
        temperature: 0.3,
        maxTokens: 4096,
      });
    } catch (llmError) {
      console.error('[chat-video-edit] LLM error:', llmError);
      throw new ApiError(500, 'LLM_FAILED', 'AI analysis failed. Please try again.');
    }

    const parsed = extractJson(llmResponse.content);
    if (!parsed || !parsed.commands || !Array.isArray(parsed.commands) || parsed.commands.length === 0) {
      console.error('[chat-video-edit] Invalid LLM response:', llmResponse.content);
      throw new ApiError(500, 'LLM_INVALID_RESPONSE', 'AI returned an invalid response. Please try rephrasing your request.');
    }

    const userReply = String(parsed.userReply || '');
    const commands = parsed.commands as Array<{ description: string; command: string }>;

    // 3. 执行 ffmpeg 命令
    await mkdir(path.join(workDir, 'output'), { recursive: true });

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      const cmdLine = cmd.command;
      const allowedBinaries = ['ffmpeg', ffmpeg];
      const usesFfmpeg = allowedBinaries.some(b => cmdLine.startsWith(b) || cmdLine.startsWith(`"${b}"`) || cmdLine.startsWith(`'${b}'`));
      if (!usesFfmpeg) {
        throw new ApiError(400, 'UNSAFE_COMMAND', 'Generated command uses disallowed binary.');
      }

      if (/\/etc\/|\/proc\/|\/dev\/|\/sys\//.test(cmdLine) || /file:\/\//.test(cmdLine)) {
        throw new ApiError(400, 'UNSAFE_COMMAND', 'Generated command accesses restricted paths.');
      }

      // 替换输出路径
      const safeCmd = cmdLine.replace(/output\.\w+$/i, path.join(workDir, 'output', 'output.mp4'));

      try {
        const args = safeCmd.split(/\s+/).slice(1); // 去掉 ffmpeg 本身
        await execFileAsync(ffmpeg, args, {
          timeout: 240_000,
          maxBuffer: 32 * 1024 * 1024,
          env: { ...process.env, LANG: 'C' },
        });
      } catch (cmdError) {
        const stderr = (cmdError as { stderr?: string }).stderr || '';
        console.error(`[chat-video-edit] ffmpeg command ${i} failed:`, stderr.slice(0, 500));
        throw new ApiError(500, 'FFMPEG_FAILED', `ffmpeg execution failed: ${stderr.slice(0, 200)}`);
      }
    }

    // 4. 查找输出文件并上传
    const outputDir = path.join(workDir, 'output');
    const files = await readdirSafe(outputDir);
    const outputFile = files.find(f => f.startsWith('output'));

    if (!outputFile) {
      throw new ApiError(500, 'OUTPUT_NOT_FOUND', 'No output file was generated.');
    }

    const outputPath = path.join(outputDir, outputFile);
    const output = await readFile(outputPath);
    if (output.byteLength === 0) throw new ApiError(500, 'OUTPUT_EMPTY');

    const ext = outputFile.endsWith('.mp4') ? 'mp4' :
                outputFile.endsWith('.gif') ? 'mp4' :
                outputFile.endsWith('.mp3') ? 'mp4' : 'mp4';

    const contentType = ext === 'mp4' ? 'video/mp4' : 'application/octet-stream';
    const { signedUrl, sizeBytes } = await uploadResult(userId, 'mp4', output, contentType);

    return Response.json({
      reply: userReply,
      ffmpegCommand: commands.map(c => c.command).join('\n'),
      resultUrl: signedUrl,
      sizeBytes,
    });
  } catch (error) {
    return jsonError(error);
  } finally {
    rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** 安全读取目录 */
async function readdirSafe(dir: string): Promise<string[]> {
  try {
    const { readdir } = await import('node:fs/promises');
    return await readdir(dir);
  } catch {
    return [];
  }
}