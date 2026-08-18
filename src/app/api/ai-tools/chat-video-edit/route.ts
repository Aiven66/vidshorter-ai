/**
 * AI 对话视频剪辑 — 服务端 LLM + ffmpeg
 *
 * POST { videoUrl, messages: [{role, content}], locale }
 * 1. LLM 分析用户需求 → 生成 ffmpeg 命令
 * 2. 执行 ffmpeg 命令
 * 3. 返回结果 URL
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

/** ffmpeg 二进制查找（与 video-dewatermark 一致） */
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

/** 构建 LLM 系统提示词 */
function buildSystemPrompt(probe: { durationS: number; width: number; height: number; hasAudio: boolean }, locale: string): string {
  const localeNames: Record<string, string> = {
    en: 'English', zh: '简体中文', 'zh-Hant': '繁體中文',
    ja: '日本語', ko: '한국어', de: 'Deutsch', fr: 'Français',
    it: 'Italiano', es: 'Español', pt: 'Português',
    hi: 'हिन्दी', ar: 'العربية', id: 'Bahasa Indonesia',
    ms: 'Bahasa Melayu', th: 'ไทย', ru: 'Русский',
    vi: 'Tiếng Việt', tr: 'Türkçe',
  };
  const lang = localeNames[locale] || 'English';

  return `You are an expert ffmpeg video editor. The user's video has these properties:
- Duration: ${Math.round(probe.durationS)} seconds
- Resolution: ${probe.width}x${probe.height}
- Has audio: ${probe.hasAudio ? 'yes' : 'no'}

The video is accessible at a URL. Your task is to generate ffmpeg commands for the user's editing requests.

SUPPORTED OPERATIONS (with examples):
1. Trim/cut: -ss START -to END -c copy
2. Speed change: setpts=0.5*PTS (slow×2), atempo=2.0 (fast×2), or setpts=2.0*PTS (half speed), atempo=0.5
3. Resize: -vf scale=1280:720
4. Crop: -vf crop=W:H:X:Y
5. Add text overlay: -vf drawtext=text='Hello':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=50
6. Volume: -af volume=2.0 (2x louder), or volume=0.5 (half)
7. Remove audio: -an
8. Replace audio: -i audio.mp3 -c:v copy -c:a aac -shortest
9. Color filters: eq=brightness=0.0:saturation=1.5:contrast=1.2
10. Rotate: transpose=1 (90° CW), transpose=2 (90° CCW)
11. Fade in/out: fade=in:0:d=1, fade=out:st=10:d=2
12. Reverse: -vf reverse (slow; use for short clips)
13. Loop: -loop 1 -t 5 (still image to video)
14. Extract audio: -vn -c:a copy output.mp3
15. Concatenate: concat file list
16. GIF: -vf fps=10,scale=480:-1:flags=lanczos output.gif
17. Mute segment: -af volume=enable='between(t,5,10)':volume=0
18. PIP overlay: -i overlay.png -filter_complex overlay=W-w-10:10
19. Vignette/curves: -vf curves=vintage
20. Hue shift: -vf hue=h=90:s=1

CRITICAL RULES:
1. Always use -y (overwrite output)
2. Output path: /tmp/ai-chat-edit/output.mp4 (or .gif / .mp3 / .png as appropriate)
3. Use -ss BEFORE -i for fast seeking when trimming
4. Video codec: -c:v libx264 -preset veryfast -crf 23
5. Audio codec: -c:a aac -b:a 128k
6. Web optimization: -movflags +faststart (for MP4 output)
7. For complex filters, use -filter_complex instead of -vf
8. Input URL: the videoUrl provided in the user's message
9. If the request is impossible or unsafe, explain why
10. Do NOT use protocols that access local filesystem (file://, concat: with local files)

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
      videoUrl?: string;
      messages?: Array<{ role: string; content: string }>;
      locale?: string;
    };

    if (!body.videoUrl || !Array.isArray(body.messages) || body.messages.length === 0) {
      throw new ApiError(400, 'MISSING_PARAMS');
    }

    const videoUrl = assertUserStorageUrl(body.videoUrl, userId, 'ai-tools');
    const lastUserMsg = body.messages.filter(m => m.role === 'user').pop()?.content || '';
    if (!lastUserMsg) throw new ApiError(400, 'MISSING_USER_MESSAGE');

    // 1. 大小检查
    const head = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = Number(head.headers.get('content-length') || 0);
    if (contentLength > MAX_VIDEO_BYTES) throw new ApiError(400, 'VIDEO_TOO_LARGE');

    // 2. 探测视频参数
    const ffmpeg = findFfmpegBinary();
    let probe: ReturnType<typeof probeFromStderr>;
    try {
      await execFileAsync(ffmpeg, ['-hide_banner', '-i', videoUrl], { timeout: 30_000 });
      probe = probeFromStderr('');
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr || '';
      probe = probeFromStderr(stderr);
    }
    if (!probe.width || !probe.height) throw new ApiError(400, 'VIDEO_DECODE_FAILED');
    if (probe.durationS > MAX_VIDEO_DURATION_S) throw new ApiError(400, 'VIDEO_TOO_LONG');

    // 3. 调用 LLM 生成 ffmpeg 命令
    const locale = body.locale || 'en';
    const systemPrompt = buildSystemPrompt(probe, locale);

    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers);
    const config = new Config({
      apiKey: process.env.COZE_WORKLOAD_IDENTITY_API_KEY,
      baseUrl: process.env.COZE_INTEGRATION_BASE_URL,
      modelBaseUrl: process.env.COZE_INTEGRATION_MODEL_BASE_URL,
    });
    const llmModel = 'doubao-seed-1-8-251228';
    const llmClient = new LLMClient(config, customHeaders);

    // 构建聊天上下文：system + 历史消息（最后一条替换为带 videoUrl 的完整请求）
    const llmMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // 添加历史消息（跳过 system 角色）
    for (const msg of body.messages) {
      if (msg.role === 'system') continue;
      // 将最后一条用户消息替换为完整请求（含 videoUrl）
      if (msg.role === 'user' && msg.content === lastUserMsg) {
        llmMessages.push({
          role: 'user',
          content: `Video URL: ${videoUrl}\n\nUser request: ${lastUserMsg}`,
        });
      } else {
        llmMessages.push(msg);
      }
    }

    // 确保用户消息存在
    if (!llmMessages.some(m => m.role === 'user')) {
      llmMessages.push({
        role: 'user',
        content: `Video URL: ${videoUrl}\n\nUser request: ${lastUserMsg}`,
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

    const reasoning = String(parsed.reasoning || '');
    const userReply = String(parsed.userReply || '');
    const commands = parsed.commands as Array<{ description: string; command: string }>;

    // 4. 执行 ffmpeg 命令
    await mkdir(path.join(workDir, 'output'), { recursive: true });

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      // 验证命令只使用允许的二进制
      const cmdLine = cmd.command;
      const allowedBinaries = ['ffmpeg', ffmpeg];
      const usesFfmpeg = allowedBinaries.some(b => cmdLine.startsWith(b) || cmdLine.startsWith(`"${b}"`) || cmdLine.startsWith(`'${b}'`));
      if (!usesFfmpeg) {
        throw new ApiError(400, 'UNSAFE_COMMAND', 'Generated command uses disallowed binary.');
      }

      // 禁止访问危险路径
      if (/\/etc\/|\/proc\/|\/dev\/|\/sys\//.test(cmdLine) || /file:\/\//.test(cmdLine)) {
        throw new ApiError(400, 'UNSAFE_COMMAND', 'Generated command accesses restricted paths.');
      }

      // 替换输出路径
      const safeCmd = cmdLine.replace(/output\.\w+$/i, path.join(workDir, 'output', 'output.mp4'));

      try {
        const args = safeCmd.split(/\s+/).slice(1); // 去掉 ffmpeg 本身
        await execFileAsync(ffmpeg, args, {
          timeout: 240_000,
          maxBuffer: 16 * 1024 * 1024,
          env: { ...process.env, LANG: 'C' },
        });
      } catch (cmdError) {
        const stderr = (cmdError as { stderr?: string }).stderr || '';
        console.error(`[chat-video-edit] ffmpeg command ${i} failed:`, stderr.slice(0, 500));
        throw new ApiError(500, 'FFMPEG_FAILED', `ffmpeg execution failed: ${stderr.slice(0, 200)}`);
      }
    }

    // 5. 查找输出文件并上传
    const outputDir = path.join(workDir, 'output');
    const files = await readdirSafe(outputDir);
    const outputFile = files.find(f => f.startsWith('output'));

    if (!outputFile) {
      throw new ApiError(500, 'OUTPUT_NOT_FOUND', 'No output file was generated.');
    }

    const outputPath = path.join(outputDir, outputFile);
    const output = await readFile(outputPath);
    if (output.byteLength === 0) throw new ApiError(500, 'OUTPUT_EMPTY');

    // 确定扩展名
    const ext = outputFile.endsWith('.mp4') ? 'mp4' :
                outputFile.endsWith('.gif') ? 'mp4' :
                outputFile.endsWith('.mp3') ? 'mp4' : 'mp4';

    const contentType = ext === 'mp4' ? 'video/mp4' : 'application/octet-stream';
    const { signedUrl, sizeBytes } = await uploadResult(userId, 'mp4', output, contentType);

    return Response.json({
      reply: userReply || reasoning,
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

/** 安全读取目录（不抛异常） */
async function readdirSafe(dir: string): Promise<string[]> {
  try {
    const { readdir } = await import('node:fs/promises');
    return await readdir(dir);
  } catch {
    return [];
  }
}