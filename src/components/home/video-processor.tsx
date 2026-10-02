'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { useCredits } from '@/lib/credits-context';
import { isAdminUser } from '@/lib/admin-gate';
import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';
import {
  downloadYouTubeClip,
  downloadClipViaBrowser,
  resolveYouTubeStream,
  cacheResolvedStream,
  parseResolvedStream,
  buildStreamProxyUrl,
  extractYouTubeVideoId,
  compileClips,
  downloadClipWithVoiceover,
  downloadClipWithBgm,
  downloadClipWithKaraoke,
  downloadAllClipsAsZip,
  type ResolvedStream,
} from '@/lib/youtube-clip-download';
import {
  Video, Upload, Link2, Sparkles, Download, Play,
  Film, Scissors, Zap, ArrowRight, CheckCircle,
  AlertCircle, Loader2, Clock, Eye, ExternalLink, RefreshCw, Share2, Copy, Smartphone, Captions, Image as ImageIcon,
  Layers, CheckSquare, Square, AudioLines, Music, Archive, Subtitles, SlidersHorizontal, Target, ChevronDown
} from 'lucide-react';
import type { SubtitleStyle } from '@/lib/server/subtitles';
import { TRANSLATE_LANGS } from '@/lib/subtitle-langs';
import { EXPORT_TEMPLATES } from '@/lib/export-templates';
import { SCENARIOS } from '@/lib/scenarios';
import type { ScenarioPreset } from '@/lib/scenarios';
import Link from 'next/link';
import { trackEvent, setAnalyticsUser, VIDEO_FUNNEL } from '@/lib/analytics';

const PreviewDialog = dynamic(
  () => import('@/components/home/preview-dialog'),
  { ssr: false }
);

const InsufficientCreditsDialog = dynamic(
  () => import('@/components/insufficient-credits-dialog').then(m => ({ default: m.InsufficientCreditsDialog })),
  { ssr: false }
);

function getAdminAiConfig() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('clipop_ai_config');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

interface VideoClip {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  summary: string;
  engagementScore: number;
  thumbnailUrl: string;
  videoUrl: string | null;
  status: 'processing' | 'completed' | 'failed' | 'link_only';
  linkOnlyUrl?: string;
  // 后端 fallback clip 标记（zoompan 伪视频，非真实视频）
  isFallback?: boolean;
}

interface SSEData {
  stage: string;
  progress: number;
  message: string;
  data?: {
    highlights?: Array<{
      title: string;
      start_time: number;
      end_time: number;
      summary: string;
      engagement_score: number;
    }>;
    clips?: VideoClip[];
    clip?: VideoClip;
    clipIndex?: number;
    error?: boolean;
    frameCount?: number;
    estimatedDuration?: number;
    title?: string;
    recommendedClipCount?: number;
    totalHighlights?: number;
    clipOffset?: number;
    clipLimit?: number;
    nextOffset?: number;
    done?: boolean;
    jobId?: string;
    videoId?: string;
  };
}

interface VidShorterDesktopBridge {
  getMediaBaseUrl?: () => Promise<string>;
  openAuth?: () => Promise<{ ok?: boolean }>;
  openWebLogin?: () => Promise<{ ok?: boolean }>;
  openWebRegister?: () => Promise<{ ok?: boolean }>;
  getAuthToken?: () => Promise<string>;
  clearAuthToken?: () => Promise<{ ok?: boolean }>;
}

declare global {
  interface Window {
    clipopDesktop?: VidShorterDesktopBridge;
    vidshorterDesktop?: VidShorterDesktopBridge;
    __clipopDesktopToken?: string;
    __clipopDesktopEmail?: string;
    __clipopDesktopUserId?: string;
    __clipopDesktopName?: string;
    electronAPI?: {
      getAuthToken?: () => Promise<string>;
      clearAuthToken?: () => Promise<{ ok?: boolean }>;
      openAuth?: () => Promise<{ ok?: boolean }>;
    };
    api?: {
      getAuthToken?: () => Promise<string>;
      clearAuthToken?: () => Promise<{ ok?: boolean }>;
      requestAuth?: () => Promise<{ ok?: boolean }>;
    };
    agent?: {
      openWebLogin?: () => Promise<{ ok?: boolean }>;
      openWebRegister?: () => Promise<{ ok?: boolean }>;
    };
    __CF_WORKER_URL__?: string;
  }
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isHttpVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

const STAGE_META: Record<string, { icon: typeof Video; labelKey: string }> = {
  init:              { icon: Loader2,  labelKey: 'video.stage.init' },
  extract_frames:    { icon: Film,     labelKey: 'video.stage.extractFrames' },
  frames_extracted:  { icon: Film,     labelKey: 'video.stage.framesExtracted' },
  frames_unavailable:{ icon: Film,     labelKey: 'video.stage.framesUnavailable' },
  ai_analysis:       { icon: Sparkles, labelKey: 'video.stage.aiAnalysis' },
  analysis_complete:  { icon: Sparkles, labelKey: 'video.stage.analysisComplete' },
  generating_clip:   { icon: Scissors, labelKey: 'video.stage.generatingClip' },
  clip_ready:        { icon: CheckCircle, labelKey: 'video.stage.clipReady' },
  saving:            { icon: Loader2,  labelKey: 'video.stage.saving' },
  complete:          { icon: CheckCircle, labelKey: 'video.stage.complete' },
  error:             { icon: AlertCircle, labelKey: 'video.stage.error' },
};

const DEMO_VIDEOS_KEY = 'clipop_demo_videos';

function getDemoVideosKey(userId?: string): string {
  return userId ? `clipop_demo_videos_${userId}` : DEMO_VIDEOS_KEY;
}

function saveDemoVideoRecord(url: string, title: string | null, clips: VideoClip[], userId?: string) {
  try {
    const videoId = `video-${Date.now()}`;
    const key = getDemoVideosKey(userId);
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    // 保留所有有内容的 clips：completed（真实视频）+ link_only（YouTube 链接）
    // 之前只保留 status === 'completed' && videoUrl，导致 link_only clips 完全丢失，
    // 用户在首页看到的 clips 在历史中消失。
    const savedClips = clips.filter(c =>
      (c.status === 'completed' && c.videoUrl) ||
      (c.status === 'link_only' && c.linkOnlyUrl)
    );
    // 对 data URL 的 clips，不保存巨大的 data URL 到 localStorage（会超容量限制）
    // 只保存 serve-clip URL 或 linkOnlyUrl
    const lightweightClips = savedClips.map(c => {
      const clip: VideoClip = { ...c };
      // data URL 可能几 MB，localStorage 只有 5-10MB，保存会导致 QuotaExceededError
      // 只保留非 data URL 的 videoUrl
      if (clip.videoUrl && clip.videoUrl.startsWith('data:')) {
        // 不保存 data URL 到 localStorage，避免超限
        // 用户在历史中点击时会触发重新生成
        clip.videoUrl = null;
        clip.status = 'link_only';
        if (!clip.linkOnlyUrl) {
          // Build a YouTube link with ?t=<startTime> so the preview embed
          // can seek to the highlight's start position.
          // Previously this was just `url` (no ?t= param), so the preview
          // always played from 0:00 instead of clip.startTime.
          try {
            const ytId = extractYouTubeVideoId(url);
            if (ytId) {
              clip.linkOnlyUrl = `https://youtu.be/${ytId}?t=${Math.floor(clip.startTime)}s`;
            } else {
              clip.linkOnlyUrl = url;
            }
          } catch {
            clip.linkOnlyUrl = url;
          }
        }
      }
      return clip;
    });
    const record = {
      id: videoId,
      original_url: url,
      source_type: url.includes('bilibili') || url.includes('b23.tv') ? 'bilibili' : url.includes('youtube') || url.includes('youtu.be') ? 'youtube' : 'url',
      title: title || null,
      status: lightweightClips.length > 0 ? 'completed' : 'failed',
      clips_count: lightweightClips.length,
      clips: lightweightClips,
      created_at: new Date().toISOString(),
    };
    const updated = [record, ...existing].slice(0, 50);
    try {
      localStorage.setItem(key, JSON.stringify(updated));
    } catch {
      // localStorage 超容量限制，移除旧记录重试
      console.warn('[saveDemoVideoRecord] localStorage quota exceeded, trimming old records');
      const trimmed = [record, ...existing.slice(0, 9)];
      try {
        localStorage.setItem(key, JSON.stringify(trimmed));
      } catch {
        // 仍然失败，只保留当前记录
        try {
          localStorage.setItem(key, JSON.stringify([record]));
        } catch {}
      }
    }
  } catch (e) {
    console.warn('[saveDemoVideoRecord] Failed to save:', e);
  }
}

function mergeClips(prev: VideoClip[], next: VideoClip[]) {
  const map = new Map<string, VideoClip>();
  for (const clip of prev) map.set(clip.id, clip);
  for (const clip of next) map.set(clip.id, clip);
  return Array.from(map.values());
}

/**
 * 重新生成 fallback zoompan 伪视频：当 Vercel 因 YouTube colo-mismatch/IP 限制无法
 * 通过 CF Worker 下载视频时，后端会用静态缩略图 + zoompan 滤镜生成"伪视频"，
 * 并在 ClipResult 中标记 isFallback: true。前端浏览器 IP 不受限，可以通过
 * CF Worker /stream 下载真实视频片段，然后上传到 /api/regenerate-clip，
 * Vercel 用 ffmpeg 生成真实短视频。
 *
 * 方案（唯一，已验证可靠）：download + upload
 *   1. 通过 CF Worker /stream 下载从 startTime 开始的视频片段（begin 参数）
 *   2. 用 multipart/form-data 上传到 /api/regenerate-clip
 *   3. Vercel 用 ffmpeg 生成真实短视频 + 缩略图
 *
 * 注意：不使用 captureStream/MediaRecorder 方案，因为浏览器对跨域视频的
 * captureStream 支持不可靠（CORS tainted stream 导致空视频或失败）。
 * download+upload 方案用 server-side ffmpeg，不依赖浏览器 API，更可靠。
 */
async function regenerateThumbnailClips(params: {
  clips: VideoClip[];
  ytVideoId: string;
  existingStreamUrl?: string;
  existingMetadata?: { userAgent?: string; visitorData?: string; xClientName?: number; clientVersion?: string; client?: string; audioUrl?: string; duration?: number };
  onClipUpdated: (clip: VideoClip) => void;
  onProgress?: (message: string) => void;
}): Promise<void> {
  const { clips, ytVideoId, existingStreamUrl, existingMetadata, onClipUpdated, onProgress } = params;

  // Include both fallback zoompan clips AND link_only clips (no videoUrl yet).
  // link_only clips are produced when Vercel cannot download YouTube video; the
  // browser can still fetch via CF Worker /stream and captureVideoClip to produce
  // a real downloadable mp4.
  const thumbnailClips = clips.filter(c =>
    (c.isFallback === true && c.videoUrl) ||
    (c.status === 'link_only' && c.linkOnlyUrl)
  );
  if (thumbnailClips.length === 0) {
    console.log('[Regenerate] No fallback or link_only clips to regenerate');
    return;
  }

  console.log(`[Regenerate] Found ${thumbnailClips.length} clips to regenerate (fallback + link_only)`);
  onProgress?.(`Regenerating ${thumbnailClips.length} clip(s) from real video...`);

  const cfWorkerUrl = String(window.__CF_WORKER_URL__ || '').trim();
  console.log(`[Regenerate] cfWorkerUrl=${cfWorkerUrl ? '(set)' : '(not set)'}, existingStreamUrl=${existingStreamUrl ? '(set)' : '(not set)'}`);

  if (!cfWorkerUrl) {
    console.error('[Regenerate] No CF_WORKER_URL available, cannot regenerate clips');
    onProgress?.('Cloudflare Worker not configured. Keeping link_only clips.');
    return;
  }

  // Build CF Worker /stream URL with pre-resolved streamUrl (fast path).
  // CRITICAL: Without the streamUrl param, /stream calls InnerTube API which is
  // rate-limited by YouTube (LOGIN_REQUIRED on SJC colo after 1-2 calls).
  // With the streamUrl param, /stream fetches the URL directly from CF Worker IP
  // (matching IP binding) — this works reliably.
  //
  // If we have a pre-resolved streamUrl from handleProcess, use it directly.
  // Otherwise, call /resolve via the shared utility (with caching).
  let resolvedForRegen: ResolvedStream | null = null;
  if (existingStreamUrl) {
    resolvedForRegen = {
      streamUrl: existingStreamUrl,
      userAgent: existingMetadata?.userAgent || '',
      visitorData: existingMetadata?.visitorData || '',
      xClientName: existingMetadata?.xClientName || '1',
      clientVersion: existingMetadata?.clientVersion || '',
      client: existingMetadata?.client || 'direct',
      audioUrl: existingMetadata?.audioUrl,
      duration: existingMetadata?.duration,
    };
    // Pre-populate the shared cache so handleDownload can reuse it
    cacheResolvedStream(ytVideoId, resolvedForRegen);
  } else {
    try {
      onProgress?.('Resolving video stream...');
      resolvedForRegen = await resolveYouTubeStream(ytVideoId, 0);
    } catch (resolveErr) {
      console.warn('[Regenerate] /resolve failed:', resolveErr instanceof Error ? resolveErr.message : resolveErr);
      onProgress?.('Video stream unavailable. Clips will use YouTube links.');
      for (const clip of thumbnailClips) {
        if (clip.linkOnlyUrl) {
          onClipUpdated({ ...clip, videoUrl: null, status: 'link_only', isFallback: false });
        }
      }
      return;
    }
  }

  const videoStreamUrl = buildStreamProxyUrl(ytVideoId, resolvedForRegen);
  console.log(`[Regenerate] videoStreamUrl: ${videoStreamUrl.slice(0, 140)}...`);

  // Health-check the /stream URL (with streamUrl param, this should work).
  try {
    onProgress?.('Checking video stream availability...');
    const healthRes = await fetch(videoStreamUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10_000),
    });
    if (!healthRes.ok) {
      console.warn(`[Regenerate] CF Worker /stream health check failed: HTTP ${healthRes.status}. YouTube may have blocked this colo. Skipping regeneration.`);
      onProgress?.(`Video stream unavailable (HTTP ${healthRes.status}). Clips will use YouTube links.`);
      for (const clip of thumbnailClips) {
        if (clip.linkOnlyUrl) {
          onClipUpdated({ ...clip, videoUrl: null, status: 'link_only', isFallback: false });
        }
      }
      return;
    }
    console.log('[Regenerate] CF Worker /stream is available, proceeding with capture');
  } catch (healthErr) {
    console.warn(`[Regenerate] CF Worker /stream health check error:`, healthErr instanceof Error ? healthErr.message : healthErr, '. Skipping regeneration.');
    onProgress?.('Video stream check failed. Clips will use YouTube links.');
    for (const clip of thumbnailClips) {
      if (clip.linkOnlyUrl) {
        onClipUpdated({ ...clip, videoUrl: null, status: 'link_only', isFallback: false });
      }
    }
    return;
  }

  console.log(`[Regenerate] CF Worker /stream available, processing ${thumbnailClips.length} clips`);

  for (let i = 0; i < thumbnailClips.length; i += 1) {
    try {
      const clip = thumbnailClips[i];
      const clipDuration = clip.endTime - clip.startTime;

      console.log(`[Regenerate] Processing clip ${i + 1}/${thumbnailClips.length}: "${clip.title}" (startTime=${clip.startTime}s, endTime=${clip.endTime}s, duration=${clipDuration}s)`);
      onProgress?.(`Clip ${i + 1}/${thumbnailClips.length}: "${clip.title}" — capturing from ${Math.round(clip.startTime)}s...`);

      let finalVideoUrl: string | null = null;
      let finalThumbUrl: string | null = null;

      // ── 主方案：captureVideoClip（浏览器录制，确保从正确位置截取）──
      // 用 CF Worker /stream（完整视频，不带 begin）作为 video URL。
      // video element 加载视频 metadata 后，seek 到 clip.startTime，
      // 用 captureStream + MediaRecorder 录制 clipDuration 秒。
      // 浏览器 seek 时会自动通过 Range 请求加载目标位置的数据，不需要下载完整视频。
      // CF Worker 设置 Access-Control-Allow-Origin: *，video.crossOrigin='anonymous' 避免 CORS tainted。
      //
      // 注意：录制是实时的（clipDuration 秒），但这是确保每个 clip 从不同位置截取的唯一可靠方案。
      // download+upload 方案因 YouTube begin 参数签名限制无法下载特定位置的视频。
      try {
        const { captureVideoClip, blobToDataUrl } = await import('@/lib/ffmpeg-client');
        console.log(`[Regenerate] Using captureVideoClip for clip "${clip.title}" at ${clip.startTime}s`);

        const { videoBlob, thumbnailBlob } = await captureVideoClip({
          videoUrl: videoStreamUrl,
          // seek 到 clip.startTime（浏览器自动用 Range 请求加载目标位置）
          startTime: clip.startTime,
          endTime: clip.endTime,
          onProgress: (msg) => onProgress?.(`Clip ${i + 1}/${thumbnailClips.length}: ${msg}`),
        });

        if (videoBlob.size < 10_000) {
          throw new Error(`Recording too small: ${videoBlob.size} bytes`);
        }

        finalVideoUrl = await blobToDataUrl(videoBlob);
        if (thumbnailBlob) {
          finalThumbUrl = await blobToDataUrl(thumbnailBlob);
        }

        console.log(`[Regenerate] captureVideoClip succeeded: ${videoBlob.size} bytes for "${clip.title}"`);
      } catch (captureErr) {
        console.warn(`[Regenerate] captureVideoClip failed for "${clip.title}", trying download+upload:`, captureErr);

        // ── 降级方案：download + upload ──
        // 下载视频前 4MB（从 0:00 开始），上传到 /api/regenerate-clip 用 ffmpeg 裁剪。
        // 注意：由于 begin 参数无效，这只适用于 startTime < 30s 的 clip。
        // 对于 startTime 较大的 clip，下载的内容不包含高光部分，ffmpeg 会生成空视频或失败。
        // 在这种情况下，clip 会保持 fallback 状态，前端显示 YouTube embed。
        try {
          const downloadHeaders: Record<string, string> = {
            'Range': `bytes=0-${4 * 1024 * 1024 - 1}`,
          };

          let blob: Blob | null = null;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            if (attempt > 0) {
              console.log(`[Regenerate] Download retry ${attempt + 1}/3 for "${clip.title}" after 2s...`);
              await new Promise<void>((r) => setTimeout(r, 2000));
            }
            try {
              onProgress?.(`Clip ${i + 1}/${thumbnailClips.length}: "${clip.title}" — downloading (attempt ${attempt + 1}/3)...`);
              const downloadResponse = await fetch(videoStreamUrl, {
                headers: downloadHeaders,
                signal: AbortSignal.timeout(120_000),
              });

              if (!downloadResponse.ok && downloadResponse.status !== 206) {
                throw new Error(`Download failed: HTTP ${downloadResponse.status}`);
              }

              const candidateBlob = await downloadResponse.blob();
              if (candidateBlob.size < 50_000) {
                throw new Error(`Downloaded file too small: ${candidateBlob.size} bytes`);
              }

              blob = candidateBlob;
              console.log(`[Regenerate] Downloaded ${blob.size} bytes for clip "${clip.title}" (attempt ${attempt + 1})`);
              break;
            } catch (err) {
              console.warn(`[Regenerate] Download attempt ${attempt + 1} failed for "${clip.title}":`, err);
            }
          }

          if (!blob) {
            throw new Error('All download attempts failed');
          }

          // 上传到 /api/regenerate-clip，用 server-side ffmpeg 裁剪
          onProgress?.(`Clip ${i + 1}/${thumbnailClips.length}: "${clip.title}" — processing...`);
          const formData = new FormData();
          formData.append('file', blob, 'clip.mp4');
          // 使用 clip.startTime 和 clip.endTime（相对于完整视频）
          // ffmpeg 会从上传文件中 seek 到 startTime 截取
          // 注意：如果 startTime 超过下载的数据范围（4MB ~ 30s），会失败
          formData.append('startTime', String(clip.startTime));
          formData.append('endTime', String(clip.endTime));
          formData.append('title', clip.title);
          formData.append('summary', clip.summary);
          // 本端点不参与付费门控：它产出的是「真实画质预览」，免费用户也能用。

          const uploadResponse = await fetch('/api/regenerate-clip', {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(180_000),
          });

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text().catch(() => '');
            throw new Error(`Upload failed: HTTP ${uploadResponse.status} ${errorText.slice(0, 200)}`);
          }

          const result = await uploadResponse.json() as { videoUrl: string; thumbnailUrl: string; duration?: number };

          if (!result.videoUrl || result.videoUrl.startsWith('data:image/jpeg')) {
            throw new Error('Regeneration returned thumbnail or empty videoUrl');
          }

          finalVideoUrl = result.videoUrl;
          finalThumbUrl = result.thumbnailUrl || null;
          console.log(`[Regenerate] download+upload succeeded for "${clip.title}"`);
        } catch (downloadErr) {
          console.error(`[Regenerate] download+upload also failed for "${clip.title}":`, downloadErr);
        }
      }

      if (!finalVideoUrl) {
        console.error(`[Regenerate] All methods failed for clip "${clip.title}", converting to link_only`);
        // 所有方法失败时，将 clip 转为 link_only 状态（而非保持 fallback 伪视频）。
        // 这样用户在 home 页面和 dashboard 都能通过 YouTube IFrame embed 观看高光片段。
        // fallback zoompan 伪视频对用户没有价值（只是静态缩略图缩放）。
        if (clip.linkOnlyUrl) {
          const linkOnlyClip: VideoClip = {
            ...clip,
            videoUrl: null,
            status: 'link_only',
            isFallback: false,
          };
          onClipUpdated(linkOnlyClip);
          console.log(`[Regenerate] Converted clip "${clip.title}" to link_only`);
        }
        continue;
      }

      const updatedClip: VideoClip = {
        ...clip,
        videoUrl: finalVideoUrl,
        thumbnailUrl: finalThumbUrl || clip.thumbnailUrl,
        duration: clip.duration,
        status: 'completed',
        isFallback: false,
      };

      onClipUpdated(updatedClip);
      console.log(`[Regenerate] Updated clip ${i + 1}/${thumbnailClips.length}: "${clip.title}"`);
    } catch (err) {
      console.error(`[Regenerate] Failed to regenerate clip ${i + 1}/${thumbnailClips.length} "${thumbnailClips[i].title}":`, err);
    }
  }

  onProgress?.('Thumbnail regeneration complete');
}

export default function VideoProcessor({
  variant = 'default',
  initialUrl,
}: {
  variant?: 'default' | 'shorts';
  /** 首页带入的视频链接：预填输入框并自动开始一次解析 */
  initialUrl?: string;
}) {
  const { t, locale } = useLocale();
  const { user, accessToken, loading: authLoading, refreshSession, signOut } = useAuth();
  const { balance, plan, loading: creditsLoading, refreshCredits, deductCredits } = useCredits();
  // 「YouTube Shorts 成片」模式：只输入长视频链接 → 输出 9:16 竖屏高光成片（3 条 × ≤60s）。
  const isShorts = variant === 'shorts';
  // 9:16 竖屏 + AI 字幕属 Starter+ 权益，免费用户展示升级引导（管理员除外）。
  const shortsLocked = isShorts && !!user && !creditsLoading && plan === 'free' && !isAdminUser(user);

  const [useAgent, setUseAgent] = useState(false);
  const [quality, setQuality] = useState<'sd' | 'hd'>('sd');
  // 9:16 竖屏导出（Starter+ 权益，AI 人物跟踪居中）；Shorts 成片模式默认开启
  const [exportVertical, setExportVertical] = useState(variant === 'shorts');
  // AI 自动字幕烧录（Starter+ 权益）；Shorts 成片模式默认开启
  const [exportSubtitles, setExportSubtitles] = useState(variant === 'shorts');
  // AI 粗剪清理（Starter+ 权益）：按逐字稿剪掉长停顿与纯语气词
  const [exportJumpCut, setExportJumpCut] = useState(false);
  // AI 配音/旁白（Starter+ 权益）：开关 + 自定义台词 + 声线
  const [exportVoiceover, setExportVoiceover] = useState(false);
  const [voiceoverScript, setVoiceoverScript] = useState('');
  const [voiceoverVoice, setVoiceoverVoice] = useState('');
  const [voiceoverErr, setVoiceoverErr] = useState('');
  // AI 背景音乐（Starter+ 权益）：开关 + 曲风 + 原声音量
  const [exportBgm, setExportBgm] = useState(false);
  const [bgmMood, setBgmMood] = useState<'calm' | 'energetic' | 'warm'>('calm');
  const [bgmOrigVol, setBgmOrigVol] = useState(70);
  const [bgmErr, setBgmErr] = useState('');
  // 卡拉OK 动态字幕（Starter+ 权益）：逐词高亮字幕烧录
  const [exportKaraoke, setExportKaraoke] = useState(false);
  const [karaokeErr, setKaraokeErr] = useState('');
  // 字幕样式（Starter+ 权益）：静态字幕 + 卡拉OK 共用（字号/位置/描边/背景/高亮色）
  const [subStyle, setSubStyle] = useState<SubtitleStyle>({
    size: 'medium',
    position: 'bottom',
    outline: 'bold',
    background: 'box',
    highlight: 'yellow',
  });
  // 字幕翻译（Starter+ 权益）：翻译目标语言（'' = 原语言不翻译）
  const [subLang, setSubLang] = useState('');
  // 批量打包导出（Starter+ 权益）
  const [exportingAll, setExportingAll] = useState(false);
  const [exportAllErr, setExportAllErr] = useState('');
  // 模板化批量导出（Starter+ 权益）：选中的模板 id（'' = 无模板，保持既有行为）
  const [exportTemplate, setExportTemplate] = useState('');
  // 场景化预置（P0）：选中的场景 id（'' = 自定义，不预填参数）
  const [scenario, setScenario] = useState('');
  // #2 时长分级：生成条数（0=系统推荐）+ 目标短片时长秒（0=不限制，保留 AI 自然时长）
  // Shorts 成片模式固定 3 条 × ≤60s
  const [maxClips, setMaxClips] = useState(variant === 'shorts' ? 3 : 0);
  const [targetDuration, setTargetDuration] = useState(variant === 'shorts' ? 60 : 0);
  // 高级设置折叠面板：默认收起，降低使用门槛（不打开则全部按默认值导出）
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState(initialUrl ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<SSEData | null>(null);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewClip, setPreviewClip] = useState<VideoClip | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  // #1 关键帧封面（Starter+ 权益）：生成中状态 + 错误提示（复用 downloadProgress 显示加载中）
  const [coverGeneratingId, setCoverGeneratingId] = useState<string | null>(null);
  // #3/#4 Auto Compile（Starter+ 权益）：已选片段 id + 拼接中状态
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [compiling, setCompiling] = useState(false);
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [exportPaywallOpen, setExportPaywallOpen] = useState(false);
  const [firstSuccessOpen, setFirstSuccessOpen] = useState(false);
  const [suppressSuccessModal, setSuppressSuccessModal] = useState(false);
  // 分享成功后的临时反馈：记录已复制链接的 clip id（桌面端 Web Share 不可用时降级为复制链接）
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const copiedShareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trimmedVideoUrl = videoUrl.trim();
  const canStart = (!!trimmedVideoUrl && isHttpVideoUrl(trimmedVideoUrl)) || !!selectedFile;
  const completedClips = clips.filter(clip =>
    (clip.status === 'completed' && clip.videoUrl && clip.isFallback !== true) ||
    (clip.status === 'link_only' && clip.linkOnlyUrl) ||
    (clip.isFallback === true && clip.linkOnlyUrl)
  );

  // 同步当前用户信息到 analytics SDK
  useEffect(() => {
    setAnalyticsUser(user ? { id: user.id, email: user.email } : null);
  }, [user]);

  // 首次出片成功 → 弹一次性升级引导（仅免费非管理员；localStorage 只弹一次）
  const hadClipsRef = useRef(false);
  useEffect(() => {
    const hasClips = completedClips.length > 0;
    if (!hadClipsRef.current && hasClips) {
      hadClipsRef.current = true;
      const eligible = user && user.role !== 'admin' && plan === 'free';
      const dismissed = typeof window !== 'undefined' && localStorage.getItem('clipop_first_success_upsell_dismissed') === '1';
      const shown = typeof window !== 'undefined' && localStorage.getItem('clipop_first_success_upsell_shown') === '1';
      if (eligible && !dismissed && !shown) {
        setFirstSuccessOpen(true);
        if (typeof window !== 'undefined') localStorage.setItem('clipop_first_success_upsell_shown', '1');
      }
    }
  }, [completedClips.length, user, plan]);

  // 行为埋点：首页访问 (video_generation funnel step 1)
  useEffect(() => {
    trackEvent(VIDEO_FUNNEL.PAGE_VIEW_HOME);
  }, []);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const enabledByQuery = q.get('agent') === '1';
      const enabledByStorage = localStorage.getItem('clipop_use_agent') === '1';
      setUseAgent(enabledByQuery || enabledByStorage);
    } catch {}
  }, []);

  const uploadToSupabase = useCallback(async (file: File) => {
    if (!user) throw new Error('Please sign in to upload a video.');
    if (!accessToken) throw new Error('Authentication required. Please sign in again.');

    const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'uploads';
    const client = getSupabaseClient(accessToken);

    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const objectPath = `users/${user.id}/${Date.now()}-${safeName}`;

    const uploadRes = await client.storage.from(bucket).upload(objectPath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'video/mp4',
    });
    if (uploadRes.error) throw new Error(uploadRes.error.message);

    const signed = await client.storage.from(bucket).createSignedUrl(objectPath, 60 * 60);
    if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || 'Failed to create signed URL.');

    return { signedUrl: signed.data.signedUrl, objectPath, bucket };
  }, [accessToken, user]);

  const getLocalMediaBaseUrl = useCallback(async () => {
    const desktop = window.clipopDesktop || window.vidshorterDesktop;
    if (desktop?.getMediaBaseUrl) {
      const baseUrl = await desktop.getMediaBaseUrl();
      if (typeof baseUrl === 'string' && baseUrl.trim()) return baseUrl.replace(/\/$/, '');
    }

    try {
      const stored = localStorage.getItem('clipop_desktop_media_base') || '';
      if (stored.startsWith('http://127.0.0.1') || stored.startsWith('http://localhost')) {
        return stored.replace(/\/$/, '');
      }
    } catch {}

    return '';
  }, []);

  const proxyUrl = (clip: VideoClip, download = false) => {
    if (!clip || !clip.videoUrl) return '';

    if (clip.videoUrl.includes('bilibili-fallback')) {
      console.log('Bilibili fallback detected, using placeholder video');
      return 'https://samplelib.com/preview/mp4/sample-5s.mp4';
    }

    if (clip.videoUrl.startsWith('data:')) {
      return clip.videoUrl;
    }

    if (clip.videoUrl.startsWith('/')) {
      console.log('Local path detected:', clip.videoUrl);
      return clip.videoUrl;
    }

    if (clip.videoUrl.startsWith('http://127.0.0.1') || clip.videoUrl.startsWith('http://localhost')) {
      return clip.videoUrl;
    }

    console.log('External URL detected:', clip.videoUrl);
    const q = new URLSearchParams({
      url: clip.videoUrl,
      title: clip.title,
      ...(download ? { download: 'true' } : {}),
    });
    return `/api/video-proxy?${q.toString()}`;
  };

  // 场景化预置（P0）：一键预填生成参数（用户仍可手动微调）
  const applyScenario = (preset: ScenarioPreset) => {
    setMaxClips(preset.maxClips);
    setTargetDuration(preset.targetDuration);
    setExportTemplate(preset.template);
    setExportSubtitles(preset.subtitles);
    setExportVertical(preset.vertical);
    setExportVoiceover(preset.voiceover);
    setVoiceoverVoice(preset.voice);
    setExportBgm(preset.bgm);
    setBgmMood(preset.bgmMood);
    setScenario(preset.id);
  };

  const handleProcess = useCallback(async () => {
    if (!user) { window.location.href = '/login'; return; }
    if (!trimmedVideoUrl && !selectedFile) { setError('Please enter a video URL or upload a local video file.'); return; }
    if (trimmedVideoUrl && !isHttpVideoUrl(trimmedVideoUrl)) {
      setError('Please enter a valid public http(s) video URL.');
      return;
    }
    const latestBalance = await refreshCredits();
    if (!isAdminUser(user) && latestBalance < 60) {
      // 友好的付费引导: 不再显示生硬的错误信息,而是弹出引导对话框
      setInsufficientOpen(true);
      return;
    }

    setIsProcessing(true);
    setProgress({ stage: 'init', progress: 0, message: 'Starting...' });
    setClips([]);
    setError(null);

    // 行为埋点：点击 Analyze (video_generation funnel step 2)
    trackEvent(VIDEO_FUNNEL.CLICK_ANALYZE, {
      data: {
        source_type: selectedFile ? 'upload' : 'url',
        url_domain: selectedFile ? null : (() => {
          try { return new URL(trimmedVideoUrl).hostname; } catch { return null; }
        })(),
      },
    });

    try {
      let inputUrl = trimmedVideoUrl;
      let displayUrl = trimmedVideoUrl;

      if (!inputUrl && selectedFile) {
        setIsUploading(true);
        setProgress({ stage: 'init', progress: 1, message: `Uploading "${selectedFile.name}"...` });
        try {
          const baseUrl = await getLocalMediaBaseUrl();
          if (!baseUrl) throw new Error('Local uploader unavailable');

          const res = await fetch(`${baseUrl}/api/upload`, {
            method: 'POST',
            headers: {
              'x-filename': encodeURIComponent(selectedFile.name),
              'content-type': selectedFile.type || 'application/octet-stream',
            },
            body: selectedFile,
          });
          if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
          const uploaded = await res.json() as { url?: string };
          if (!uploaded.url) throw new Error('Upload failed');
          inputUrl = uploaded.url;
          displayUrl = `upload:${selectedFile.name}`;
          setIsUploading(false);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setIsUploading(false);
          const localBase = await getLocalMediaBaseUrl();
          if (localBase) {
            throw new Error(msg || 'Local upload failed. Please restart the Mac client and try again.');
          }
          if (!accessToken) {
            throw new Error('Local upload failed. Please restart the Mac client and try again.');
          }
          const uploaded = await uploadToSupabase(selectedFile);
          inputUrl = uploaded.signedUrl;
          displayUrl = `upload:${selectedFile.name}`;
        }
      }

      let allHighlights: NonNullable<SSEData['data']>['highlights'] = [];
      let analysisDuration = 0;
      let analysisTitle: string | null = null;
      let jobId: string | null = null;
      let videoId: string | null = null;
      let hasError = false;
      // 从输入 URL 提取的 YouTube videoId（用于 regenerateThumbnailClips）。
      // 即使后端 SSE 没有返回 videoId（非 Supabase 模式或 DB 写入失败），
      // 也能用这个 ytVideoId 触发前端重新生成。
      let ytVideoIdFromUrl: string | null = null;
      let nextOffset = 0;
      let done = false;
      let batchLimit = 3;
      const clipMap = new Map<string, VideoClip>();

      const isLocalMediaUrl = (url: string) => {
        try {
          const u = new URL(url);
          return u.hostname === '127.0.0.1' || u.hostname === 'localhost';
        } catch { return false; }
      };

      const desktop = window.clipopDesktop || window.vidshorterDesktop;
      const isDesktop = !!desktop?.getMediaBaseUrl;
      const shouldUseLocalProcessing = isDesktop || isLocalMediaUrl(inputUrl);

      // Pre-resolve YouTube stream URL via CF Worker from the user's browser.
      // The user's browser IP is not rate-limited by YouTube (unlike Vercel's
      // datacenter IPs), so CF Worker /resolve succeeds reliably from here.
      // The resolved streamUrl is passed to process-video API, which uses it
      // with CF Worker /stream fast path (no tryClient, no rate-limiting).
      let preResolvedStreamUrl: string | undefined;
      let preResolvedMetadata: { userAgent?: string; visitorData?: string; xClientName?: number; clientVersion?: string; client?: string; audioUrl?: string; duration?: number } | undefined;
      if (!shouldUseLocalProcessing && inputUrl) {
        try {
          const ytIdMatch = inputUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{7,15})/);
          if (ytIdMatch) {
            const ytVideoId = ytIdMatch[1];
            ytVideoIdFromUrl = ytVideoId;  // 保存到外层，供后续 regenerateThumbnailClips 使用
            const cfWorkerUrl = String(window.__CF_WORKER_URL__ || '').trim();
            if (cfWorkerUrl) {
              const resolveUrl = new URL(cfWorkerUrl);
              resolveUrl.pathname = `${resolveUrl.pathname.replace(/\/$/, '')}/resolve`;
              resolveUrl.searchParams.set('videoId', ytVideoId);
              resolveUrl.searchParams.set('maxHeight', '360');
              // muxed=1: request a combined video+audio stream. Without it, /resolve
              // returns a video-only DASH stream + separate audioUrl — clips cut from
              // it would have no sound.
              resolveUrl.searchParams.set('muxed', '1');
              console.log('[HandleProcess] Pre-resolving YouTube stream via CF Worker...');
              const resolveRes = await fetch(resolveUrl.toString(), { signal: AbortSignal.timeout(30_000) });
              if (resolveRes.ok) {
                const resolveData = await resolveRes.json() as { streamUrl?: string; userAgent?: string; visitorData?: string; xClientName?: number; clientVersion?: string; client?: string; audioUrl?: string; duration?: number };
                if (resolveData.streamUrl) {
                  preResolvedStreamUrl = resolveData.streamUrl;
                  preResolvedMetadata = {
                    userAgent: resolveData.userAgent,
                    visitorData: resolveData.visitorData,
                    xClientName: resolveData.xClientName,
                    clientVersion: resolveData.clientVersion,
                    client: resolveData.client,
                    audioUrl: resolveData.audioUrl,
                    duration: resolveData.duration,
                  };
                  // Pre-populate the shared resolve cache so handleDownload's
                  // downloadClipViaBrowser reuses this muxed stream instead of
                  // making a second /resolve call (which risks YouTube rate-
                  // limiting the CF Worker colo).
                  cacheResolvedStream(ytVideoId, parseResolvedStream(resolveData));
                  console.log('[HandleProcess] Pre-resolved streamUrl:', preResolvedStreamUrl.slice(0, 80) + '...');
                }
              }
            }
          }
        } catch (e) {
          console.warn('[HandleProcess] CF Worker pre-resolve failed (will fall back to server-side):', e);
        }
      }

      if (useAgent && inputUrl && !shouldUseLocalProcessing) {
        const res = await fetch('/api/agent/jobs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ videoUrl: inputUrl, userId: user.id }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const created = await res.json() as { job: { id: string } };
        const createdAt = Date.now();
        const poll = async () => {
          const jobRes = await fetch(`/api/agent/jobs/${encodeURIComponent(created.job.id)}`);
          if (!jobRes.ok) throw new Error(`Job fetch failed: ${jobRes.status}`);
          const { job } = await jobRes.json() as { job: {
            status: string;
            stage: string;
            progress: number;
            message: string;
            result?: { clips?: VideoClip[] };
            error?: string;
          } };
          setProgress({ stage: job.stage, progress: job.progress, message: job.message, data: {} });
          if (job.result?.clips) {
            for (const clip of job.result.clips) clipMap.set(clip.id, clip);
            setClips(prev => mergeClips(prev, job.result!.clips!));
          }
          if (job.status === 'failed') {
            throw new Error(job.error || job.message || 'Agent processing failed');
          }
          if (job.status === 'completed') return;
          if (Date.now() - createdAt > 30_000 && job.status === 'queued') {
            throw new Error('Local Agent is not running. Start VidShorter Agent and keep it running.');
          }
          await new Promise<void>((r) => setTimeout(r, 1000));
          await poll();
        };
        await poll();
        saveDemoVideoRecord(displayUrl, null, Array.from(clipMap.values()), user?.id);
        return;
      } else if (shouldUseLocalProcessing) {
        console.log('[HandleProcess] Using local media server for:', inputUrl);
      }

      // Async video pipeline (new): submit returns immediately, then we poll a
      // durable status endpoint. Each highlight is generated server-side as its
      // own micro-task, so a single function timeout can no longer kill a job.
      // Only used for real, non-local, non-agent processing.
      const useAsyncVideosApi = !shouldUseLocalProcessing && !useAgent;

      const runVideosApiAsync = async () => {
        // 本地 token 可能已过期（用户停留在页面数小时/隔天回来）。
        // 收到 401 时先用 refresh token 无感恢复并重试一次，而不是直接把
        // "session expired" 抛给用户。
        // 若 context 里还没有 accessToken（如刚恢复登录/路由跳转竞态），
        // 先主动 refresh 拿到一个可用 token，避免首请求就以"无鉴权"打过去。
        let authToken = accessToken;
        if (!authToken) {
          const first = await refreshSession();
          if (first) authToken = first;
        }
        const buildHeaders = (token: string | null) => ({
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        });

        const doSubmit = (token: string | null) => fetch('/api/videos/process', {
          method: 'POST',
          headers: buildHeaders(token),
          body: JSON.stringify({
            videoUrl: inputUrl,
            userId: user.id,
            sourceType: selectedFile ? 'upload' : 'url',
            quality,
            locale,
            // Shorts 成片：固定产出 3 条竖屏成片
            ...(isShorts && maxClips > 0 ? { desiredClipCount: maxClips } : {}),
            ...(preResolvedStreamUrl ? { streamUrl: preResolvedStreamUrl } : {}),
            ...(preResolvedMetadata ? { streamMetadata: preResolvedMetadata } : {}),
          }),
        });

        let submitRes = await doSubmit(authToken);
        let attempts = 1;
        while (submitRes.status === 401 && attempts < 3) {
          const refreshed = await refreshSession();
          if (!refreshed || refreshed === authToken) break; // 无法再刷新，终止重试
          authToken = refreshed;
          submitRes = await doSubmit(authToken);
          attempts += 1;
        }
        if (!submitRes.ok) {
          if (submitRes.status === 401) {
            // 会话彻底失效：清掉本地"假登录"状态并引导用户重新登录。
            await signOut();
            if (typeof window !== 'undefined') window.location.href = '/login';
            throw new Error(locale === 'zh'
              ? '登录状态已失效，已为您跳转到登录页，请重新登录后再试'
              : 'Your session has expired. Redirecting you to sign in again.');
          }
          const text = await submitRes.text().catch(() => '');
          throw new Error(`Server error: ${submitRes.status}${text ? ' - ' + text.slice(0, 120) : ''}`);
        }
        const created = await submitRes.json() as { videoId?: string };
        if (!created.videoId) throw new Error('Failed to start processing job.');
        videoId = created.videoId;

        setProgress({ stage: 'init', progress: 5, message: 'Submitting processing job...', data: { videoId } });

        const startedAt = Date.now();
        while (true) {
          const statusRes = await fetch(`/api/videos/process/status?videoId=${encodeURIComponent(videoId)}`, {
            cache: 'no-store',
            headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
          });
          const s = await statusRes.json().catch(() => ({})) as {
            stage?: string; progress?: number; message?: string;
            title?: string; duration?: number; highlights?: NonNullable<SSEData['data']>['highlights'];
            clips?: VideoClip[]; status?: string; error?: string | null; done?: boolean;
          };

          setProgress({
            stage: (s.stage as SSEData['stage']) || 'generating_clip',
            progress: s.progress ?? 0,
            message: s.message || '',
            data: { videoId },
          });
          if (typeof s.title === 'string' && s.title.trim()) analysisTitle = s.title.trim();
          if (typeof s.duration === 'number') analysisDuration = s.duration;
          if (s.highlights && s.highlights.length > 0) allHighlights = s.highlights;
          if (s.clips && s.clips.length > 0) {
            for (const clip of s.clips) clipMap.set(clip.id, clip);
            setClips(prev => mergeClips(prev, s.clips!));
          }

          if (s.status === 'failed' || s.error) {
            hasError = true;
            if (s.error && /insufficient credits/i.test(s.error)) {
              setInsufficientOpen(true);
            } else {
              setError(s.error || s.message || 'Processing failed. Please try again.');
            }
            return;
          }
          if (s.done) { done = true; return; }
          if (Date.now() - startedAt > 8 * 60 * 1000) {
            throw new Error('Processing is taking too long. Please try again.');
          }
          await new Promise<void>((r) => setTimeout(r, 2500));
        }
      };

      const runBatch = async (payload: Record<string, unknown>) => {
        console.log('[runBatch] Starting with payload videoUrl:', payload.videoUrl);
        let processUrl = '/api/process-video';
        if (shouldUseLocalProcessing) {
          if (isDesktop && desktop) {
            const base = await desktop.getMediaBaseUrl?.();
            if (!base) throw new Error('Local processor unavailable');
            processUrl = `${String(base).replace(/\/$/, '')}/api/process-video`;
          } else {
            processUrl = `${new URL(inputUrl).origin}/api/process-video`;
          }
        }

        // 重试机制：第一次调用可能因 Vercel 冷启动或 CF Worker /resolve
        // 速率限制（502）导致网络错误或超时。自动重试最多 2 次。
        let res: Response | null = null;
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (attempt > 0) {
            console.log(`[runBatch] Retry attempt ${attempt + 1}/3 after 2s delay...`);
            await new Promise<void>((r) => setTimeout(r, 2000));
          }
          try {
            res = await fetch(processUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(!shouldUseLocalProcessing && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
              },
              body: JSON.stringify(payload),
            });
            console.log(`[runBatch] Attempt ${attempt + 1}: status=${res.status}, ok=${res.ok}`);
            if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)) {
              // 成功或客户端错误（非超时/限流）→ 不重试
              break;
            }
            // 5xx / 408 / 429 → 重试
            if (!res.ok) {
              const text = await res.text().catch(() => '');
              console.warn(`[runBatch] HTTP ${res.status}, will retry: ${text.slice(0, 100)}`);
              lastErr = new Error(`Server error: ${res.status}${text ? ' - ' + text.slice(0, 100) : ''}`);
              res = null;
            }
          } catch (err) {
            // fetch 抛出（网络错误、连接断开、Vercel 函数超时）
            console.warn(`[runBatch] Attempt ${attempt + 1} fetch error:`, err);
            lastErr = err;
            res = null;
          }
        }
        if (!res || !res.ok) {
          const msg = lastErr instanceof Error ? lastErr.message : 'Network error';
          console.error('[runBatch] All attempts failed:', msg);
          throw new Error(msg === 'Failed to fetch' || msg === 'network error'
            ? 'Network error after retries. The server may be cold-starting or rate-limited. Please try again in a few seconds.'
            : msg);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done: readDone, value } = await reader.read();
          if (readDone) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const d: SSEData = JSON.parse(line.slice(6));
              setProgress(d);

              if (d.data?.jobId && !jobId) jobId = d.data.jobId;
              if (d.data?.videoId) videoId = d.data.videoId;
              if (d.data?.estimatedDuration) analysisDuration = d.data.estimatedDuration;
              if (typeof d.data?.title === 'string' && d.data.title.trim()) analysisTitle = d.data.title.trim();
              if (d.data?.highlights && d.data.highlights.length > 0) allHighlights = d.data.highlights;
              if (typeof d.data?.clipLimit === 'number' && d.data.clipLimit > 0) batchLimit = d.data.clipLimit;
              if (typeof d.data?.nextOffset === 'number') nextOffset = d.data.nextOffset;
              if (typeof d.data?.done === 'boolean') done = d.data.done;

              if (d.data?.clips) {
                for (const clip of d.data.clips) clipMap.set(clip.id, clip);
                setClips(prev => mergeClips(prev, d.data!.clips!));
              }
              if (d.data?.clip) {
                clipMap.set(d.data.clip.id, d.data.clip);
                setClips(prev => mergeClips(prev, [d.data!.clip!]));
              }
              if (d.data?.error) {
                // 服务端返回积分不足错误时,触发付费引导对话框而非显示错误
                if (d.message && /insufficient credits/i.test(d.message)) {
                  setInsufficientOpen(true);
                } else {
                  setError(d.message);
                }
                hasError = true;
                done = true;
              }
            } catch (e) {
              console.error('SSE parse error:', e, 'line:', line);
            }
          }
        }

        if (buf.startsWith('data: ')) {
          try {
            const d: SSEData = JSON.parse(buf.slice(6));
            setProgress(d);
            if (d.data?.jobId && !jobId) jobId = d.data.jobId;
            if (d.data?.videoId) videoId = d.data.videoId;
            if (d.data?.estimatedDuration) analysisDuration = d.data.estimatedDuration;
            if (typeof d.data?.title === 'string' && d.data.title.trim()) analysisTitle = d.data.title.trim();
            if (d.data?.highlights && d.data.highlights.length > 0) allHighlights = d.data.highlights;
            if (typeof d.data?.clipLimit === 'number' && d.data.clipLimit > 0) batchLimit = d.data.clipLimit;
            if (typeof d.data?.nextOffset === 'number') nextOffset = d.data.nextOffset;
            if (typeof d.data?.done === 'boolean') done = d.data.done;
            if (d.data?.clips) {
              for (const clip of d.data.clips) clipMap.set(clip.id, clip);
              setClips(prev => mergeClips(prev, d.data!.clips!));
            }
            if (d.data?.clip) {
              clipMap.set(d.data.clip.id, d.data.clip);
              setClips(prev => mergeClips(prev, [d.data!.clip!]));
            }
            if (d.data?.error) {
              // 服务端返回积分不足错误时,触发付费引导对话框而非显示错误
              if (d.message && /insufficient credits/i.test(d.message)) {
                setInsufficientOpen(true);
              } else {
                setError(d.message);
              }
              done = true;
            }
          } catch (e) {
            console.error('SSE parse error (buf):', e, 'buf:', buf);
          }
        }

        if (shouldUseLocalProcessing) return;
      };

      if (useAsyncVideosApi) {
        await runVideosApiAsync();
      } else {
        await runBatch({
          videoUrl: inputUrl,
          userId: user.id,
          sourceType: selectedFile ? 'upload' : 'url',
          aiConfig: getAdminAiConfig(),
          quality,
          locale,
          maxClips,
          targetDuration,
          ...(preResolvedStreamUrl ? { streamUrl: preResolvedStreamUrl } : {}),
          ...(preResolvedMetadata ? { streamMetadata: preResolvedMetadata } : {}),
        });

        if (hasError) return;

        while (!done && !hasError && allHighlights && allHighlights.length > 0 && nextOffset < allHighlights.length) {
          await runBatch({
            videoUrl: inputUrl,
            userId: user.id,
            sourceType: selectedFile ? 'upload' : 'url',
            aiConfig: getAdminAiConfig(),
            highlights: allHighlights,
            duration: analysisDuration,
            title: analysisTitle,
            clipOffset: nextOffset,
            clipLimit: batchLimit,
            jobId,
            videoId,
            quality,
            locale,
            maxClips,
            targetDuration,
            // Continue passing the pre-resolved stream URL for subsequent batches
            // (same video, same streamUrl is still valid for several minutes).
            ...(preResolvedStreamUrl ? { streamUrl: preResolvedStreamUrl } : {}),
            ...(preResolvedMetadata ? { streamMetadata: preResolvedMetadata } : {}),
          });
          if (hasError) break;
        }
      }

      if (done && !hasError) {
        // P0 —— 让"一次就成功"：link_only 占位成片自动兑现。
        // 当 Vercel 因 YouTube colo-mismatch / IP 限制、或异步管线数度下载失败时，
        // 后端会把高光片段退化为 link_only 时间戳链接（不可直接下载播放），造成
        // 付费价值断裂。前端浏览器 IP 不受限，可通过 CF Worker /stream 重新抓取
        // 真实视频，上传到 /api/regenerate-clip 用 ffmpeg 生成可放映的 mp4。
        //
        // 先后台断言 → 再计成功漏斗：必须真正兑现出可放映成片才算一次"生成成功"，
        // 避免把未兑现的 link_only 占位成片计入成功、虚增 funnel。
        //
        // 关键：使用从输入 URL 提取的 ytVideoIdFromUrl，而不是 SSE 返回的 videoId
        // （后者是数据库 video ID，在非 Supabase 模式或 DB 写入失败时为 null，
        // 会导致 regenerateThumbnailClips 永远不被触发）。
        if (!shouldUseLocalProcessing && ytVideoIdFromUrl) {
          try {
            await regenerateThumbnailClips({
              clips: Array.from(clipMap.values()),
              ytVideoId: ytVideoIdFromUrl,
              existingStreamUrl: preResolvedStreamUrl,
              existingMetadata: preResolvedMetadata,
              onClipUpdated: (updatedClip) => {
                clipMap.set(updatedClip.id, updatedClip);
                setClips(prev => mergeClips(prev, [updatedClip]));
              },
              onProgress: (msg) => {
                setProgress({ stage: 'generating_clip', progress: 90, message: msg, data: {} });
              },
            });
          } catch (regenErr) {
            console.warn('[HandleProcess] Thumbnail regeneration failed:', regenErr);
          }
        }

        // 漏斗如实化 (video_generation funnel step 3)：兑现后再判定，仅当存在真可播
        // 成片才广播生成成功，避免 link_only 占位被误记为成功、抬高漏斗转化。
        const playableClips = Array.from(clipMap.values()).filter(c => c.status === 'completed' && c.videoUrl);
        if (playableClips.length > 0) {
          trackEvent(VIDEO_FUNNEL.ANALYZE_SUCCESS, {
            data: {
              clip_count: playableClips.length,
              video_source: ytVideoIdFromUrl ? 'youtube' : (selectedFile ? 'upload' : 'url'),
            },
          });
        }

        const videoTitle = analysisTitle || null;
        saveDemoVideoRecord(displayUrl, videoTitle, Array.from(clipMap.values()), user?.id);

        if (user && user.role !== 'admin') {
          const isDemoMode = !isSupabaseConfigured() || user.id.startsWith('demo-') || user.id.startsWith('google-demo-');
          if (isDemoMode) {
            await deductCredits(60);
          } else {
            await refreshCredits();
          }
        }
      }
    } catch (err) {
      console.error('Processing error:', err);
      setIsUploading(false);
      setError(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setIsProcessing(false);
    }
  }, [accessToken, error, getLocalMediaBaseUrl, refreshCredits, refreshSession, selectedFile, signOut, trimmedVideoUrl, uploadToSupabase, useAgent, user, locale]);

  // 首页「智能解析与生成」跳转带入链接：预填后自动开始一次解析（仅一次，等鉴权与积分就绪）
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!initialUrl || !isHttpVideoUrl(initialUrl)) return;
    if (authLoading || creditsLoading) return;
    autoStartedRef.current = true;
    void handleProcess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl, authLoading, creditsLoading]);

  // 首页拖拽/选择本地文件：通过全局通道带入，进入本页后自动上传并解析（仅一次）
  const pendingFileRef = useRef(false);
  const pendingFileStartRef = useRef(false);
  useEffect(() => {
    if (pendingFileRef.current) return;
    if (authLoading || creditsLoading) return;
    const pending = typeof window !== 'undefined' ? window.__clipopPendingFile : null;
    if (!pending) return;
    pendingFileRef.current = true;
    window.__clipopPendingFile = null;
    setSelectedFile(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, creditsLoading]);

  // 待处理文件落到 state 后触发一次解析（此时 handleProcess 闭包已持有该文件）
  useEffect(() => {
    if (!pendingFileRef.current || pendingFileStartRef.current) return;
    if (!selectedFile) return;
    pendingFileStartRef.current = true;
    void handleProcess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  const handleShare = async (clip: VideoClip) => {
    // "一键分享"：优先用原生 Web Share API 调起系统分享面板（移动端微信/钉钉/WhatsApp…
    // 桌面端 Chrome/Edge/Safari 也支持）。不可用时降级为复制片段分享链接。
    const shareUrl = clip.videoUrl || (clip.linkOnlyUrl || '');
    const shareTitle = clip.title || 'Clipo AI Highlight';
    const shareText = `${shareTitle} — ${clip.summary || ''}`.trim();

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl && shareUrl.startsWith('http') ? shareUrl : window.location.href,
        });
        return; // 用户成功分享/完成动作，无需降级
      }
      // AbortError = 用户取消，静默忽略
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }

    // 降级：复制分享链接
    const finalUrl = shareUrl && shareUrl.startsWith('http') ? shareUrl : window.location.href;
    try {
      await navigator.clipboard?.writeText(finalUrl);
    } catch {
      // 剪贴板不可用也跳过
    }
    setCopiedShareId(clip.id);
    setPreviewClip(null);
    if (copiedShareTimer.current) clearTimeout(copiedShareTimer.current);
    copiedShareTimer.current = setTimeout(() => setCopiedShareId(null), 2000);
  };

  // ── #3/#4 Auto Compile（Starter+ 权益）：片段多选 + 拼接成片 ──────────────
  const COMPILE_MAX = 5;

  const toggleSelectClip = (id: string) => {
    setSelectedClipIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectedCompilable = clips.filter(c => selectedClipIds.includes(c.id));
  const compileCanStart =
    plan !== 'free' &&
    selectedCompilable.length >= 2 &&
    selectedCompilable.length <= COMPILE_MAX;

  // 可拼接的片段（有 YouTube videoId）
  const eligibleYtClipIds = clips
    .filter(c => !!extractYouTubeVideoId(c.linkOnlyUrl) || !!extractYouTubeVideoId(c.videoUrl || undefined))
    .map(c => c.id);
  const allEligibleSelected = eligibleYtClipIds.length > 0 && eligibleYtClipIds.every(id => selectedClipIds.includes(id));
  const handleSelectAllYTClips = () => setSelectedClipIds(allEligibleSelected ? [] : eligibleYtClipIds);

  // 「导出即付费墙」：免费用户不能导出任何视频文件，只能在线预览。
  // 统一门控：命中即弹付费引导弹窗（订阅优先 + 积分包兜底）并拦截后续下载。
  // 管理员不受 plan 限制（与 shortsLocked 一致）。
  const ensureExportAccess = () => {
    if (plan === 'free' && !isAdminUser(user)) {
      setExportPaywallOpen(true);
      return false;
    }
    return true;
  };

  const handleCompile = async () => {
    if (!ensureExportAccess()) return;
    const ytClips = selectedCompilable
      .map(c => {
        const yt = extractYouTubeVideoId(c.linkOnlyUrl) || extractYouTubeVideoId(c.videoUrl || undefined);
        return yt ? { videoId: yt, startTime: c.startTime, endTime: c.endTime, title: c.title } : null;
      })
      .filter((x): x is { videoId: string; startTime: number; endTime: number; title: string } => !!x);

    if (ytClips.length < 2) {
      setError(t('video.compile.selectFirst'));
      return;
    }
    const totalSec = ytClips.reduce((s, c) => s + (c.endTime - c.startTime), 0);
    if (totalSec > 90) {
      setError(t('video.compile.tooLong'));
      return;
    }

    setCompiling(true);
    setDownloadProgress(t('video.compile.compileBtn'));
    try {
      await compileClips({
        clips: ytClips,
        exportPlan: plan,
        orientation: exportVertical ? 'vertical' : 'landscape',
        onProgress: (msg) => setDownloadProgress(msg),
      });
      setSelectedClipIds([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Compile] failed:', msg);
      setError(msg || t('video.compile.compileBtn'));
    } finally {
      setCompiling(false);
      setDownloadProgress(null);
    }
  };

  /** 配音下载：AI 神经人声合成后合并为片段音轨（仅 YouTube Starter+）。 */
  const handleDownloadVoiceover = async (clip: VideoClip) => {
    if (!ensureExportAccess()) return;
    const ytVideoId = extractYouTubeVideoId(clip.linkOnlyUrl) || extractYouTubeVideoId(clip.videoUrl || undefined);
    if (!ytVideoId) {
      setVoiceoverErr(t('video.voiceover.hint'));
      return;
    }
    const safeScript = voiceoverScript.trim();
    if (safeScript.length > 1800) {
      setVoiceoverErr(t('video.voiceover.scriptPlaceholder'));
      return;
    }
    setVoiceoverErr('');
    setDownloadingId(clip.id);
    setDownloadProgress(t('video.voiceover.hint'));
    try {
      await downloadClipWithVoiceover({
        videoId: ytVideoId,
        startTime: clip.startTime,
        endTime: clip.endTime,
        title: clip.title,
        exportPlan: plan,
        orientation: exportVertical ? 'vertical' : 'landscape',
        script: safeScript || undefined,
        voice: voiceoverVoice || undefined,
        onProgress: (msg) => setDownloadProgress(msg),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Download] Voiceover failed:', msg);
      setVoiceoverErr(msg);
      setDownloadProgress(`Voiceover failed: ${msg}`);
    } finally {
      setDownloadingId(null);
    }
  };

  /** 背景音乐下载：内置免版权 BGM 叠加进片段（仅 YouTube Starter+）。 */
  const handleDownloadBgm = async (clip: VideoClip) => {
    if (!ensureExportAccess()) return;
    const ytVideoId = extractYouTubeVideoId(clip.linkOnlyUrl) || extractYouTubeVideoId(clip.videoUrl || undefined);
    if (!ytVideoId) {
      setBgmErr(t('video.bgm.hint'));
      return;
    }
    setBgmErr('');
    setDownloadingId(clip.id);
    setDownloadProgress(t('video.bgm.hint'));
    try {
      await downloadClipWithBgm({
        videoId: ytVideoId,
        startTime: clip.startTime,
        endTime: clip.endTime,
        title: clip.title,
        exportPlan: plan,
        orientation: exportVertical ? 'vertical' : 'landscape',
        mood: bgmMood,
        originalVolume: bgmOrigVol,
        onProgress: (msg) => setDownloadProgress(msg),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Download] BGM failed:', msg);
      setBgmErr(msg);
      setDownloadProgress(`BGM failed: ${msg}`);
    } finally {
      setDownloadingId(null);
    }
  };

  /** 卡拉OK 动态字幕下载：逐词高亮字幕烧录进片段（仅 YouTube Starter+）。 */
  const handleDownloadKaraoke = async (clip: VideoClip) => {
    if (!ensureExportAccess()) return;
    const ytVideoId = extractYouTubeVideoId(clip.linkOnlyUrl) || extractYouTubeVideoId(clip.videoUrl || undefined);
    if (!ytVideoId) {
      setKaraokeErr(t('video.karaoke.hint'));
      return;
    }
    setKaraokeErr('');
    setDownloadingId(clip.id);
    setDownloadProgress(t('video.karaoke.hint'));
    try {
      await downloadClipWithKaraoke({
        videoId: ytVideoId,
        startTime: clip.startTime,
        endTime: clip.endTime,
        title: clip.title,
        exportPlan: plan,
        orientation: exportVertical ? 'vertical' : 'landscape',
        style: subStyle,
        // 字幕翻译（Starter+）：翻译目标语言
        lang: subLang || undefined,
        onProgress: (msg) => setDownloadProgress(msg),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Download] Karaoke failed:', msg);
      setKaraokeErr(msg === 'no_subtitles' ? t('video.karaoke.noSubs') : msg);
      setDownloadProgress(msg === 'no_subtitles' ? `Karaoke subtitles unavailable: ${msg}` : `Karaoke failed: ${msg}`);
    } finally {
      setDownloadingId(null);
    }
  };

  /** 打包下载全部片段（Starter+ 权益）。 */
  const handleExportAll = async () => {
    if (!ensureExportAccess()) return;
    const ytClips = clips.filter(
      (clip) =>
        (clip.status === 'link_only' || clip.status === 'completed') &&
        (extractYouTubeVideoId(clip.linkOnlyUrl) || extractYouTubeVideoId(clip.videoUrl || undefined)),
    );
    if (ytClips.length === 0) {
      setExportAllErr(t('video.exportAll.hint'));
      return;
    }
    setExportAllErr('');
    setExportingAll(true);
    setDownloadProgress(t('video.exportAll.downloading'));
    try {
      await downloadAllClipsAsZip({
        clips: ytClips.map((clip) => ({
          videoId: (extractYouTubeVideoId(clip.linkOnlyUrl) || extractYouTubeVideoId(clip.videoUrl || undefined)) as string,
          startTime: clip.startTime,
          endTime: clip.endTime,
          title: clip.title,
        })),
        exportPlan: plan,
        template: exportTemplate || undefined,
        onProgress: (msg) => setDownloadProgress(msg),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Download] Export all failed:', msg);
      // 服务端导出门控拒绝（免费用户）→ 弹付费引导而非硬报错
      if (msg.includes('export_requires_paid')) {
        setExportPaywallOpen(true);
        setExportAllErr('');
        setDownloadProgress(null);
        return;
      }
      setExportAllErr(msg);
      setDownloadProgress(`Export all failed: ${msg}`);
    } finally {
      setExportingAll(false);
    }
  };

  const handleDownload = async (clip: VideoClip) => {
    if (!ensureExportAccess()) return;
    // 行为埋点：下载高光短视频 (video_generation funnel step 4)
    trackEvent(VIDEO_FUNNEL.CLIP_DOWNLOAD, {
      data: {
        clip_id: clip.id,
        clip_title: clip.title,
        clip_status: clip.status,
        is_fallback: clip.isFallback === true,
      },
    });

    // === v50 unified download path ===
    //
    // PROBLEM (v49 and earlier):
    //   - link_only / fallback clips → downloadClipViaBrowser (server-side ffmpeg cut)
    //     → standard progressive MP4 ✅ playable
    //   - completed clips with videoUrl → directly download clip.videoUrl
    //     → this videoUrl may be fMP4 (from captureVideoClip/MediaRecorder)
    //       or webm → NOT playable in QuickTime/WMP ❌
    //
    // SOLUTION (v50):
    //   For ALL YouTube-sourced clips (linkOnlyUrl contains youtube.com),
    //   route through downloadClipViaBrowser which uses server-side ffmpeg
    //   to produce a standard progressive MP4. This guarantees playability
    //   regardless of how the clip was originally generated.
    //
    //   For uploaded local videos (no YouTube link), clip.videoUrl points
    //   to a real MP4 file in Supabase storage → direct download is fine.

    // YouTube detection: check linkOnlyUrl first, then videoUrl as fallback.
    // Older records (localStorage history) may only have videoUrl set to a
    // youtu.be page URL without linkOnlyUrl — without this fallback the clip
    // would be misrouted into the direct-download path and the YouTube HTML
    // page would be saved as .mp4 (unplayable file bug).
    const ytVideoId = extractYouTubeVideoId(clip.linkOnlyUrl) || extractYouTubeVideoId(clip.videoUrl || undefined);
    const isYouTubeClip = !!ytVideoId;

    if (isYouTubeClip) {
      // YouTube clip — always use server-side ffmpeg cut for guaranteed playability
      setDownloadingId(clip.id);
      setDownloadProgress('Preparing download (server-side ffmpeg cut)...');
      // 竖屏 / AI 字幕 / AI 粗剪是「精确导出规格」：只有服务端 cut-clip 能产出。
      // 下面的兜底路径（downloadYouTubeClip / 直接 remux / 打开 YouTube）
      // 都只会给出横屏、无字幕、未粗剪的结果，对 Shorts 成片属于静默错误输出，必须禁止。
      const requiresExactExport = exportVertical || exportSubtitles || exportJumpCut;
      let browserSuccess = false;
      try {
        await downloadClipViaBrowser({
          videoId: ytVideoId!,
          startTime: clip.startTime,
          endTime: clip.endTime,
          title: clip.title,
          // P0: 按用户 plan 给服务端导出差异（free=720p+水印，付费=高清无水印）
          exportPlan: plan,
          // 9:16 竖屏导出（Starter+）
          orientation: exportVertical ? 'vertical' : 'landscape',
          // AI 自动字幕烧录（Starter+）
          subtitles: exportSubtitles,
          // 字幕样式（Starter+）：静态字幕烧录样式
          subtitleStyle: subStyle,
          // 字幕翻译（Starter+）：翻译目标语言
          subtitleLang: subLang || undefined,
          // AI 粗剪清理（Starter+）
          jumpCut: exportJumpCut,
          onProgress: (msg) => setDownloadProgress(msg),
        });
        browserSuccess = true;
      } catch (browserErr) {
        const errMsg = browserErr instanceof Error ? browserErr.message : String(browserErr);
        console.warn('[Download] Server-side cut failed:', errMsg);
        // 服务端导出门控拒绝（免费用户/权益失效）→ 弹付费引导，且不再走兜底下载
        if (errMsg.includes('export_requires_paid')) {
          setExportPaywallOpen(true);
          setDownloadingId(null);
          setDownloadProgress(null);
          return;
        }
        setDownloadProgress('Trying server-side fallback...');
      }

      // Fallback 1: downloadYouTubeClip (alternative server path)
      if (!browserSuccess && !requiresExactExport) {
        try {
          await downloadYouTubeClip({
            videoId: ytVideoId!,
            startTime: clip.startTime,
            endTime: clip.endTime,
            title: clip.title,
            // P0 导出即付费墙：服务端据此门控
            exportPlan: plan,
            onProgress: (msg) => setDownloadProgress(msg),
          });
          browserSuccess = true;
        } catch (serverErr) {
          const errMsg = serverErr instanceof Error ? serverErr.message : String(serverErr);
          console.warn('[Download] Server-side fallback failed:', errMsg);
          // 服务端导出门控拒绝（免费用户）→ 弹付费引导，且不再走兜底下载
          if (errMsg.includes('export_requires_paid')) {
            setExportPaywallOpen(true);
            setDownloadingId(null);
            setDownloadProgress(null);
            return;
          }
        }
      }

      // Fallback 2: If clip has a videoUrl, try remuxing it to standard MP4
      if (!browserSuccess && !requiresExactExport && clip.videoUrl) {
        setDownloadProgress('Converting existing clip to standard MP4...');
        try {
          const url = proxyUrl(clip, false);
          const res = await fetch(url);
          if (res.ok) {
            const existingBlob = await res.blob();
            if (existingBlob.size > 5000) {
              const formData = new FormData();
              const ext = existingBlob.type.includes('mp4') ? 'mp4' : 'webm';
              formData.append('file', existingBlob, `clip.${ext}`);
              const remuxRes = await fetch('/api/remux-mp4', {
                method: 'POST',
                body: formData,
                signal: AbortSignal.timeout(55_000),
              });
              if (remuxRes.ok) {
                const remuxedBuf = await remuxRes.arrayBuffer();
                if (remuxedBuf.byteLength > 5000) {
                  const finalBlob = new Blob([remuxedBuf], { type: 'video/mp4' });
                  const safeName = clip.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50) || 'clip';
                  const dlA = document.createElement('a');
                  dlA.href = URL.createObjectURL(finalBlob);
                  dlA.download = `${safeName}.mp4`;
                  document.body.appendChild(dlA);
                  dlA.click();
                  dlA.remove();
                  setTimeout(() => URL.revokeObjectURL(dlA.href), 5000);
                  browserSuccess = true;
                }
              }
            }
          }
        } catch (remuxErr) {
          console.warn('[Download] Remux fallback failed:', remuxErr instanceof Error ? remuxErr.message : remuxErr);
        }
      }

      // Fallback 3: YouTube embed (last resort — watch on YouTube)
      if (!browserSuccess) {
        if (requiresExactExport) {
          // 竖屏/字幕/粗剪导出失败时不能退回横屏、无字幕、未粗剪的结果，也不能只给个 YouTube 链接：
          // 明确告知并要求重试（多为 YouTube 反爬限流，稍后重试通常可成功）。
          setError(locale === 'zh'
            ? '成片导出失败（多为 YouTube 限流导致），请稍后重试。'
            : 'Export failed (usually YouTube rate-limiting). Please retry.');
        } else {
          setDownloadProgress('Opening highlight on YouTube...');
          const embedUrl = `https://www.youtube.com/embed/${ytVideoId}?start=${Math.floor(clip.startTime)}&end=${Math.floor(clip.endTime)}&autoplay=1`;
          window.open(embedUrl, '_blank');
        }
      }
      setDownloadingId(null);
      setDownloadProgress(null);
      return;
    }

    // Non-YouTube clip (uploaded local video) — direct download
    if (!clip.videoUrl) return;
    setDownloadingId(clip.id);
    try {
      if (clip.videoUrl.startsWith('data:')) {
        const res = await fetch(clip.videoUrl);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${clip.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        return;
      }

      const url = proxyUrl(clip, true);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${clip.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error('Download error:', e);
      window.open(clip.videoUrl, '_blank');
    } finally {
      setDownloadingId(null);
    }
  };

  // #1 关键帧封面（Starter+）生成并下载：取关键帧 + 叠标题 → 服务端合成封面图。
  const handleGenerateCover = async (clip: VideoClip) => {
    const ytVideoId = extractYouTubeVideoId(clip.linkOnlyUrl || undefined)
      || extractYouTubeVideoId(clip.videoUrl || undefined);
    if (!ytVideoId) {
      setError(locale === 'zh' ? '封面生成目前仅支持 YouTube 片段。' : 'Cover generation currently supports YouTube clips only.');
      return;
    }
    setCoverGeneratingId(clip.id);
    setDownloadProgress(locale === 'zh' ? '正在生成关键帧封面...' : 'Generating keyframe cover...');
    setError(null);
    try {
      // resolveYouTubeStream 默认命中 5h 缓存（处理时已注入），避免二次 /resolve 限流
      const resolved = await resolveYouTubeStream(ytVideoId, 0);
      const res = await fetch('/api/generate-cover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          videoId: ytVideoId,
          streamUrl: resolved.streamUrl,
          userAgent: resolved.userAgent,
          visitorData: resolved.visitorData,
          xClientName: resolved.xClientName,
          clientVersion: resolved.clientVersion,
          clientName: resolved.client,
          startTime: clip.startTime,
          title: clip.title,
          orientation: exportVertical ? '9:16' : '16:9',
          plan,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: '', detail: '' })) as { error?: string; detail?: string };
        if (res.status === 403) {
          // 封面是 Starter+ 权益 → 引导付费而非硬报错
          const detail = String(j.detail || '');
          setError(locale === 'zh'
            ? `关键帧封面是 Starter/Pro 权益，请升级后使用。${detail}`
            : `Keyframe covers require Starter or Pro. Please upgrade. ${detail}`);
        } else {
          const msg = String(j.detail || j.error || '');
          setError(locale === 'zh' ? `封面生成失败：${msg}` : `Cover generation failed: ${msg}`);
        }
        return;
      }

      const blob = await res.blob();
      const safeName = clip.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').slice(0, 40) || 'cover';
      const dlURL = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlURL;
      a.download = `${safeName}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(dlURL), 5000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[Cover] generation failed:', msg);
      setError(locale === 'zh' ? `封面生成失败：${msg}` : `Cover generation failed: ${msg}`);
    } finally {
      setCoverGeneratingId(null);
      setDownloadProgress(null);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setSelectedFile(f);
      setVideoUrl('');
      setError(null);
    }
  };

  const stageMeta = STAGE_META[progress?.stage || 'init'] || STAGE_META.init;
  const StageIcon = stageMeta.icon;

  return (
    <>
      {shortsLocked ? (
        <Card className="border-0 shadow-xl">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Smartphone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold">{t('shorts.locked.title')}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('shorts.locked.desc')}</p>
            </div>
            <Button asChild size="lg" className="gap-2">
              <Link href="/pricing?source=shorts_locked">
                <Sparkles className="h-4 w-4" />
                {t('shorts.locked.cta')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
      <>
      <Card className="border-0 shadow-xl">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">{isShorts ? t('shorts.input.title') : t('video.input.title')}</CardTitle>
          <CardDescription className="text-sm">
            {isShorts && (
              <span className="mt-1 block">{t('shorts.input.subtitle')}</span>
            )}
            {user ? (
              <span className="flex items-center justify-center gap-2 mt-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                {balance} {t('video.creditsAvailable')}
              </span>
            ) : (
              <span className="mt-1">
                <a
                  href="/login"
                  className="text-primary hover:underline"
                  onClick={(e) => {
                    const d = window.clipopDesktop || window.vidshorterDesktop;
                    if (d && typeof d.openAuth === 'function') {
                      e.preventDefault();
                      d.openAuth();
                    }
                  }}
                >
                  {t('nav.login')}
                </a>{' '}{t('video.signInToStart')}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isShorts ? t('shorts.input.placeholder') : t('video.pasteUrlPlaceholder')}
                value={videoUrl}
                onChange={e => { setVideoUrl(e.target.value); setSelectedFile(null); setError(null); }}
                className="pl-9"
                disabled={isProcessing}
              />
            </div>
            <Button
              onClick={handleProcess}
              disabled={!canStart || isProcessing || isUploading || !user}
              className="gap-2 min-w-[140px]"
            >
              {isProcessing || isUploading ? (
                <><Scissors className="h-4 w-4 animate-spin" />{t('video.processing')}</>
              ) : (
                <><Sparkles className="h-4 w-4" />{isShorts ? t('shorts.generate') : t('video.analyze')}</>
              )}
            </Button>
          </div>

          {!isShorts && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={useAgent}
              onChange={(e) => {
                const v = e.target.checked;
                setUseAgent(v);
                try { localStorage.setItem('clipop_use_agent', v ? '1' : '0'); } catch {}
              }}
              disabled={isProcessing || isUploading}
            />
            {t('video.useLocalAgent')}
          </label>
          )}

          {/* 高级设置：快捷预设 + 画质/竖屏/字幕/配音/BGM/卡拉OK/字幕样式/生成选项。
              默认收起以降低使用门槛；不展开则全部按默认值（无字幕/无配音/无BGM/横屏/SD）导出。
              Shorts 成片模式隐藏全部高级选项：固定 9:16 竖屏 + AI 字幕 + 3 条 × ≤60s。 */}
          {!isShorts && (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-lg border bg-muted/10">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  {t('video.advanced.label')}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 border-t px-3 py-3">
          {/* 场景化预置（P0）：按创作场景一键预填生成参数，仍可手动微调 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              <span>{t('video.scenario.label')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isProcessing || isUploading}
                onClick={() => setScenario('')}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  scenario === ''
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:border-primary/30 text-muted-foreground hover:text-foreground'
                } disabled:opacity-50`}
              >
                {t('video.scenario.none')}
              </button>
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={isProcessing || isUploading}
                  onClick={() => applyScenario(s)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    scenario === s.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-primary/30 text-muted-foreground hover:text-foreground'
                  } disabled:opacity-50`}
                >
                  {t(`video.scenario.${s.id}.label`)}
                </button>
              ))}
            </div>
            {scenario && (
              <p className="text-xs text-muted-foreground">{t(`video.scenario.${scenario}.hint`)}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Zap className="h-3.5 w-3.5" />
              <span>{quality === 'sd' ? t('video.quality.sd') : t('video.quality.hd')} Mode</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setQuality('sd')}
                disabled={isProcessing || isUploading}
                className={`relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                  quality === 'sd'
                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-border bg-background hover:border-primary/30 text-muted-foreground hover:text-foreground'
                } ${isProcessing || isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  <span className="text-sm font-semibold">{t('video.quality.sd')}</span>
                </div>
                <p className="text-xs opacity-80">{t('video.quality.sdDesc')}</p>
              </button>
              <button
                type="button"
                onClick={() => setQuality('hd')}
                disabled={isProcessing || isUploading}
                className={`relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                  quality === 'hd'
                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-border bg-background hover:border-primary/30 text-muted-foreground hover:text-foreground'
                } ${isProcessing || isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm font-semibold">{t('video.quality.hd')}</span>
                </div>
                <p className="text-xs opacity-80">{t('video.quality.hdDesc')}</p>
              </button>
            </div>
            {quality === 'hd' && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{t('video.quality.hdWarning')}</p>
              </div>
            )}
          </div>

          {plan !== 'free' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>{t('video.vertical.label')}</span>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={exportVertical}
                    onChange={(e) => setExportVertical(e.target.checked)}
                    disabled={isProcessing || isUploading}
                  />
                  <span className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-background after:shadow after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-4 peer-disabled:opacity-50" />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{t('video.vertical.hint')}</p>
            </div>
          )}

          {plan !== 'free' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Captions className="h-3.5 w-3.5" />
                  <span>{t('video.subtitle.label')}</span>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={exportSubtitles}
                    onChange={(e) => setExportSubtitles(e.target.checked)}
                    disabled={isProcessing || isUploading}
                  />
                  <span className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-background after:shadow after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-4 peer-disabled:opacity-50" />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{t('video.subtitle.hint')}</p>
            </div>
          )}

          {/* AI 粗剪清理（Starter+ 权益）：按逐字稿剪掉长停顿与纯语气词 */}
          {(plan !== 'free' || isAdminUser(user)) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Scissors className="h-3.5 w-3.5" />
                  <span>{t('video.jumpCut.label')}</span>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={exportJumpCut}
                    onChange={(e) => setExportJumpCut(e.target.checked)}
                    disabled={isProcessing || isUploading}
                  />
                  <span className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-background after:shadow after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-4 peer-disabled:opacity-50" />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{t('video.jumpCut.hint')}</p>
            </div>
          )}

          {/* AI 配音/旁白（Starter+ 权益） */}
          {plan !== 'free' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <AudioLines className="h-3.5 w-3.5" />
                  <span>{t('video.voiceover.label')}</span>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={exportVoiceover}
                    onChange={(e) => setExportVoiceover(e.target.checked)}
                    disabled={isProcessing || isUploading}
                  />
                  <span className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-background after:shadow after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-4 peer-disabled:opacity-50" />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{t('video.voiceover.hint')}</p>
              {exportVoiceover && (
                <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
                  <select
                    value={voiceoverVoice}
                    onChange={(e) => setVoiceoverVoice(e.target.value)}
                    className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">{t('video.voiceover.voiceAuto')}</option>
                    <option value="zh-CN-YunxiNeural">{t('video.voiceover.voices.zh-CN-YunxiNeural')}</option>
                    <option value="zh-CN-XiaoxiaoNeural">{t('video.voiceover.voices.zh-CN-XiaoxiaoNeural')}</option>
                    <option value="en-US-GuyNeural">{t('video.voiceover.voices.en-US-GuyNeural')}</option>
                    <option value="en-US-JennyNeural">{t('video.voiceover.voices.en-US-JennyNeural')}</option>
                  </select>
                  <textarea
                    value={voiceoverScript}
                    onChange={(e) => setVoiceoverScript(e.target.value)}
                    placeholder={t('video.voiceover.scriptPlaceholder')}
                    rows={3}
                    maxLength={1800}
                    className="w-full resize-none rounded border bg-background px-2 py-1.5 text-xs"
                  />
                  {voiceoverErr && (
                    <p className="text-xs text-destructive break-words">{voiceoverErr}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* AI 背景音乐（Starter+ 权益） */}
          {plan !== 'free' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Music className="h-3.5 w-3.5" />
                  <span>{t('video.bgm.label')}</span>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={exportBgm}
                    onChange={(e) => setExportBgm(e.target.checked)}
                    disabled={isProcessing || isUploading}
                  />
                  <span className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-background after:shadow after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-4 peer-disabled:opacity-50" />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{t('video.bgm.hint')}</p>
              {exportBgm && (
                <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">{t('video.bgm.moodLabel')}</span>
                    <select
                      value={bgmMood}
                      onChange={(e) => setBgmMood(e.target.value as 'calm' | 'energetic' | 'warm')}
                      className="flex-1 rounded border bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="calm">{t('video.bgm.moods.calm')}</option>
                      <option value="energetic">{t('video.bgm.moods.energetic')}</option>
                      <option value="warm">{t('video.bgm.moods.warm')}</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t('video.bgm.origVolLabel')}</span>
                      <span className="text-xs text-muted-foreground">
                        {bgmOrigVol >= 85 ? t('video.bgm.origVolHigh') : bgmOrigVol <= 45 ? t('video.bgm.origVolLow') : t('video.bgm.origVolMid')}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      step={5}
                      value={bgmOrigVol}
                      onChange={(e) => setBgmOrigVol(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  {bgmErr && (
                    <p className="text-xs text-destructive break-words">{bgmErr}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 卡拉OK 动态字幕（Starter+ 权益） */}
          {plan !== 'free' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Subtitles className="h-3.5 w-3.5" />
                  <span>{t('video.karaoke.label')}</span>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={exportKaraoke}
                    onChange={(e) => setExportKaraoke(e.target.checked)}
                    disabled={isProcessing || isUploading}
                  />
                  <span className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-background after:shadow after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-4 peer-disabled:opacity-50" />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{t('video.karaoke.hint')}</p>
              {karaokeErr && (
                <p className="text-xs text-destructive break-words">{karaokeErr}</p>
              )}
            </div>
          )}

          {/* 字幕样式（Starter+ 权益）：静态字幕 + 卡拉OK 共用（任一开启时展示） */}
          {plan !== 'free' && (exportKaraoke || exportSubtitles) && (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>{t('video.subtitleStyle.label')}</span>
              </div>
              {/* 字幕翻译（Starter+）：目标语言；原语言 = 不翻译 */}
              <label className="space-y-1 text-[10px] text-muted-foreground">
                {t('video.subtitleLang.label')}
                <select
                  value={subLang}
                  onChange={(e) => setSubLang(e.target.value)}
                  className="w-full rounded border bg-background px-2 py-1.5 text-xs"
                >
                  <option value="">{t('video.subtitleLang.auto')}</option>
                  {TRANSLATE_LANGS.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-[10px] text-muted-foreground">
                  {t('video.subtitleStyle.size')}
                  <select
                    value={subStyle.size}
                    onChange={(e) => setSubStyle({ ...subStyle, size: e.target.value as SubtitleStyle['size'] })}
                    className="w-full rounded border bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="small">{t('video.subtitleStyle.sizeSmall')}</option>
                    <option value="medium">{t('video.subtitleStyle.sizeMedium')}</option>
                    <option value="large">{t('video.subtitleStyle.sizeLarge')}</option>
                  </select>
                </label>
                <label className="space-y-1 text-[10px] text-muted-foreground">
                  {t('video.subtitleStyle.position')}
                  <select
                    value={subStyle.position}
                    onChange={(e) => setSubStyle({ ...subStyle, position: e.target.value as SubtitleStyle['position'] })}
                    className="w-full rounded border bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="bottom">{t('video.subtitleStyle.posBottom')}</option>
                    <option value="top">{t('video.subtitleStyle.posTop')}</option>
                  </select>
                </label>
                <label className="space-y-1 text-[10px] text-muted-foreground">
                  {t('video.subtitleStyle.outline')}
                  <select
                    value={subStyle.outline}
                    onChange={(e) => setSubStyle({ ...subStyle, outline: e.target.value as SubtitleStyle['outline'] })}
                    className="w-full rounded border bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="none">{t('video.subtitleStyle.outlineNone')}</option>
                    <option value="light">{t('video.subtitleStyle.outlineLight')}</option>
                    <option value="bold">{t('video.subtitleStyle.outlineBold')}</option>
                  </select>
                </label>
                <label className="space-y-1 text-[10px] text-muted-foreground">
                  {t('video.subtitleStyle.background')}
                  <select
                    value={subStyle.background}
                    onChange={(e) => setSubStyle({ ...subStyle, background: e.target.value as SubtitleStyle['background'] })}
                    className="w-full rounded border bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="none">{t('video.subtitleStyle.bgNone')}</option>
                    <option value="box">{t('video.subtitleStyle.bgBox')}</option>
                  </select>
                </label>
              </div>
              {exportKaraoke && (
                <label className="space-y-1 text-[10px] text-muted-foreground">
                  {t('video.subtitleStyle.highlight')}
                  <select
                    value={subStyle.highlight}
                    onChange={(e) => setSubStyle({ ...subStyle, highlight: e.target.value as SubtitleStyle['highlight'] })}
                    className="w-full rounded border bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="yellow">{t('video.subtitleStyle.hlYellow')}</option>
                    <option value="cyan">{t('video.subtitleStyle.hlCyan')}</option>
                    <option value="pink">{t('video.subtitleStyle.hlPink')}</option>
                    <option value="green">{t('video.subtitleStyle.hlGreen')}</option>
                    <option value="orange">{t('video.subtitleStyle.hlOrange')}</option>
                  </select>
                </label>
              )}
            </div>
          )}

          {/* #2 时长分级：免费限 1 条 + 仅默认时长；Starter+ 可选批量与更多时长档 */}
          {plan !== 'free' ? (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t('video.generation.label')}</span>
              </div>
              {/* 生成条数 */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{t('video.generation.count')}</p>
                <div className="flex flex-wrap gap-2">
                  {[{ v: 0, l: t('video.generation.auto') }, { v: 3, l: '3' }, { v: 5, l: '5' }, { v: 10, l: '10' }].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      disabled={isProcessing || isUploading}
                      onClick={() => setMaxClips(opt.v)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        maxClips === opt.v
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:border-primary/30 text-muted-foreground hover:text-foreground'
                      } disabled:opacity-50`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
              {/* 目标短片时长 */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{t('video.generation.duration')}</p>
                <div className="flex flex-wrap gap-2">
                  {[{ v: 0, l: t('video.generation.auto') }, { v: 15, l: '15s' }, { v: 30, l: '30s' }, { v: 60, l: '60s' }].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      disabled={isProcessing || isUploading}
                      onClick={() => setTargetDuration(opt.v)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        targetDuration === opt.v
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:border-primary/30 text-muted-foreground hover:text-foreground'
                      } disabled:opacity-50`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <p>{t('video.generation.freeLocked')}</p>
            </div>
          )}

            </CollapsibleContent>
          </Collapsible>
          )}

          {!isShorts && (
          <div
            className="border-2 border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm text-muted-foreground">
              {selectedFile ? `${t('video.selectedFile')}: ${selectedFile.name}` : t('video.uploadLocal')}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={onFileChange}
              disabled={isProcessing}
            />
          </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-destructive text-sm">{t('common.error')}</p>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={isProcessing}
                  onClick={() => handleProcess()}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  {t('video.retry')}
                </Button>
              </div>
            </div>
          )}

          {isProcessing && progress && (
            <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
              <div className="flex items-center gap-3">
                <StageIcon className={`h-5 w-5 text-primary ${progress.stage !== 'complete' && progress.stage !== 'error' ? 'animate-spin' : ''}`} />
                <span className="font-medium text-sm flex-1">{progress.message}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{progress.progress}%</span>
              </div>
              <Progress value={progress.progress} className="h-2" />
              <p className="text-xs text-muted-foreground">{t(stageMeta.labelKey)}</p>

              {clips.length > 0 && (
                <div className="mt-2 pt-2 border-t space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{t('video.clipsBeingGenerated')}</p>
                  {clips.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      {c.status === 'completed' ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : c.status === 'failed' ? (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate">{c.title}</span>
                      <span className="text-muted-foreground">{fmt(c.startTime)} - {fmt(c.endTime)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!isShorts && (
      <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
        <Button variant="outline" size="lg" className="px-6" asChild>
          <Link href="/download">
            <Download className="mr-2 h-4 w-4" />
            {t('video.downloadMacApp')}
          </Link>
        </Button>
        <Button variant="outline" size="lg" className="px-6" asChild>
          <Link href="/pricing">
            <Sparkles className="mr-2 h-4 w-4" />
            {t('video.viewPricing')}
          </Link>
        </Button>
      </div>
      )}
      </>
      )}

      <section id="process" className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {clips.length > 0 && !isProcessing && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold">{isShorts ? t('shorts.results') : t('video.results')}</h3>
                  <Badge variant="secondary">
                    {completedClips.length}/{clips.length} {t('video.clipsReady')}
                  </Badge>
                </div>
                <Card className="mb-6 border-border/60 bg-muted/20">
                  <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('video.aiFinished')}</p>
                      <p className="text-sm text-muted-foreground">{t('video.openToPreview')}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">{completedClips.filter(c => c.status === 'completed' && c.isFallback !== true).length} {t('video.playableClips')}</Badge>
                      {(completedClips.some(c => c.status === 'link_only') || completedClips.some(c => c.isFallback === true)) && (
                        <Badge variant="outline">{completedClips.filter(c => c.status === 'link_only' || c.isFallback === true).length} YouTube</Badge>
                      )}
                      <Badge variant="outline">{clips.filter(clip => clip.status === 'failed').length} {t('video.failedClips')}</Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* #3/#4 Auto Compile（Starter+ 权益）：把勾选的片段拼接成片 */}
                {!isShorts && plan !== 'free' && (
                  <Card className="mb-6 border-border/60 bg-muted/20">
                    <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Layers className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{t('video.compile.label')}</p>
                          <p className="text-xs text-muted-foreground">{t('video.compile.hint')}</p>
                          {selectedCompilable.length >= 1 && (
                            <p className="mt-1 text-xs font-medium text-primary">
                              {t('video.compile.compileBtn')}: {selectedCompilable.length}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSelectAllYTClips}
                          disabled={compiling || eligibleYtClipIds.length === 0}
                        >
                          {allEligibleSelected
                            ? <><Square className="h-4 w-4" />{t('video.compile.clear')}</>
                            : <><CheckSquare className="h-4 w-4" />{t('video.compile.selectAll')}</>}
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={handleCompile}
                          disabled={compiling || !compileCanStart}
                        >
                          {compiling ? (
                            <><Loader2 className="h-4 w-4 animate-spin" />{downloadProgress || t('video.compile.compileBtn')}</>
                          ) : (
                            <><Layers className="h-4 w-4" />{t('video.compile.compileBtn')} ({selectedCompilable.length})</>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* 批量打包导出（Starter+ 权益）：一次性下载全部高光片段为 ZIP */}
                {!isShorts && plan !== 'free' && (
                  <Card className="mb-6 border-border/60 bg-muted/20">
                    <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Archive className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{t('video.exportAll.label')}</p>
                          <p className="text-xs text-muted-foreground">{t('video.exportAll.hint')}</p>
                          {/* 模板化批量导出：预设风格模板下拉（'' = 不套用，保持既有行为） */}
                          <label className="mt-2 flex flex-col gap-1 text-[10px] text-muted-foreground">
                            {t('video.exportTpl.label')}
                            <select
                              value={exportTemplate}
                              onChange={(e) => setExportTemplate(e.target.value)}
                              className="w-full rounded border bg-background px-2 py-1.5 text-xs sm:max-w-[240px]"
                            >
                              <option value="">{t('video.exportTpl.none')}</option>
                              {EXPORT_TEMPLATES.map((tp) => (
                                <option key={tp.id} value={tp.id}>
                                  {t(`video.exportTpl.${tp.id}.label`)}
                                </option>
                              ))}
                            </select>
                          </label>
                          {exportAllErr && (
                            <p className="mt-1 text-xs text-destructive break-words">{exportAllErr}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={handleExportAll}
                        disabled={exportingAll}
                      >
                        {exportingAll ? (
                          <><Loader2 className="h-4 w-4 animate-spin" />{downloadProgress || t('video.exportAll.downloading')}</>
                        ) : (
                          <><Archive className="h-4 w-4" />{t('video.exportAll.btn')}</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* 非付费用户成功页 upsell：引导订阅/购买积分包 */}
                {plan === 'free' && user && user.role !== 'admin' && (
                  <Card className="mb-6 border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
                    <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
                          <Sparkles className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {locale === 'zh' ? '喜欢这些片段？解锁更多' : 'Enjoying these clips? Unlock more'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {locale === 'zh'
                              ? '升级到 Starter 每月 6,000 积分，或购买一次性积分包，立刻继续创作。'
                              : 'Upgrade to Starter for 6,000 credits monthly, or grab a one-time credit pack to keep creating.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={user ? '/pricing?source=success_upsell' : '/register'} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                          <Zap className="h-4 w-4" />
                          {locale === 'zh' ? '升级 / 购买积分' : 'Upgrade / Get Credits'}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {clips.map(clip => {
                    // isFallback clips have a fake zoompan videoUrl; treat them like link_only for UI
                    const isPlayableEmbed = clip.isFallback === true && !!clip.linkOnlyUrl;
                    const isRealMp4 = clip.status === 'completed' && !!clip.videoUrl && clip.isFallback !== true;
                    // 仅 YouTube 片段可参与拼接
                    const clipYtId = extractYouTubeVideoId(clip.linkOnlyUrl) || extractYouTubeVideoId(clip.videoUrl || undefined);
                    const clipSelected = selectedClipIds.includes(clip.id);
                    return (
                    <Card key={clip.id} className="overflow-hidden group">
                      <div
                        className={`relative bg-muted cursor-pointer ${isShorts ? 'aspect-[9/16]' : 'aspect-video'}`}
                        onClick={() => {
                          if (isRealMp4 || isPlayableEmbed) setPreviewClip(clip);
                          else if (clip.status === 'link_only' && clip.linkOnlyUrl) setPreviewClip(clip);
                        }}
                      >
                        {(plan !== 'free' && !isShorts && clipYtId) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleSelectClip(clip.id); }}
                            title={t('video.compile.selectAria')}
                            className={`absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-md shadow-sm transition-colors ${
                              clipSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-background/80 text-muted-foreground hover:text-foreground hover:bg-background'
                            }`}
                          >
                            {clipSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                          </button>
                        )}
                        {clip.thumbnailUrl ? (
                          <img src={clip.thumbnailUrl} alt={clip.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="h-10 w-10 text-muted-foreground/40" />
                          </div>
                        )}
                        {isRealMp4 && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="h-14 w-14 rounded-full bg-white/90 flex items-center justify-center">
                              <Play className="h-7 w-7 text-primary ml-1" />
                            </div>
                          </div>
                        )}
                        {(isPlayableEmbed || clip.status === 'link_only') && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="h-14 w-14 rounded-full bg-red-600/90 flex items-center justify-center">
                              <Play className="h-7 w-7 text-white ml-1" />
                            </div>
                          </div>
                        )}
                        <Badge className="absolute bottom-2 right-2 text-xs">
                          <Clock className="h-3 w-3 mr-1" />{fmt(clip.duration)}
                        </Badge>
                        {isRealMp4 && (
                          <Badge className="absolute top-2 left-2 bg-green-500 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />{t('common.ready')}
                          </Badge>
                        )}
                        {(isPlayableEmbed || clip.status === 'link_only') && (
                          <Badge className="absolute top-2 left-2 bg-red-600 text-xs">
                            <Play className="h-3 w-3 mr-1" />YouTube
                          </Badge>
                        )}
                        {clip.status === 'failed' && (
                          <Badge className="absolute top-2 left-2 bg-destructive text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />{t('common.failed')}
                          </Badge>
                        )}
                      </div>

                      <CardContent className="pt-4 space-y-3">
                        <h4 className="font-semibold leading-tight">{clip.title}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-2">{clip.summary}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{fmt(clip.startTime)}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span>{fmt(clip.endTime)}</span>
                          <Badge variant="outline" className="ml-auto text-xs">
                            {t('common.score')} {clip.engagementScore}/10
                          </Badge>
                        </div>
                        <div className="flex gap-2 pt-1">
                          {isRealMp4 ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 gap-1.5"
                                onClick={() => setPreviewClip(clip)}
                              >
                                <Eye className="h-4 w-4" />{t('video.preview')}
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="shrink-0"
                                onClick={() => handleShare(clip)}
                                title={t('video.share')}
                              >
                                {copiedShareId === clip.id ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Share2 className="h-4 w-4" />}
                              </Button>
                              {!isShorts && plan !== 'free' && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => handleGenerateCover(clip)}
                                  title={t('video.cover')}
                                  disabled={coverGeneratingId === clip.id}
                                >
                                  {coverGeneratingId === clip.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                                </Button>
                              )}
                              {plan !== 'free' && exportVoiceover && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => handleDownloadVoiceover(clip)}
                                  title={t('video.voiceover.label')}
                                  disabled={downloadingId === clip.id}
                                >
                                  {downloadingId === clip.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
                                </Button>
                              )}
                              {plan !== 'free' && exportBgm && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => handleDownloadBgm(clip)}
                                  title={t('video.bgm.label')}
                                  disabled={downloadingId === clip.id}
                                >
                                  {downloadingId === clip.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music className="h-4 w-4" />}
                                </Button>
                              )}
                              {plan !== 'free' && exportKaraoke && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => handleDownloadKaraoke(clip)}
                                  title={t('video.karaoke.label')}
                                  disabled={downloadingId === clip.id}
                                >
                                  {downloadingId === clip.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Subtitles className="h-4 w-4" />}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                className="flex-1 gap-1.5"
                                onClick={() => handleDownload(clip)}
                                disabled={downloadingId === clip.id}
                              >
                                {downloadingId === clip.id ? (
                                  <><Loader2 className="h-4 w-4 animate-pulse" />{downloadingId === clip.id && downloadProgress ? downloadProgress : t('common.saving')}</>
                                ) : (
                                  <><Download className="h-4 w-4" />{t('video.download')}</>
                                )}
                              </Button>
                            </>
                          ) : (isPlayableEmbed || clip.status === 'link_only') ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 gap-1.5"
                                onClick={() => setPreviewClip(clip)}
                              >
                                <Play className="h-4 w-4" />{t('video.preview')}
                              </Button>
                              {!isShorts && plan !== 'free' && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => handleGenerateCover(clip)}
                                  title={t('video.cover')}
                                  disabled={coverGeneratingId === clip.id}
                                >
                                  {coverGeneratingId === clip.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                className="flex-1 gap-1.5"
                                onClick={() => handleDownload(clip)}
                                disabled={downloadingId === clip.id}
                                title="Download clip (records ~15s in real-time)"
                              >
                                {downloadingId === clip.id ? (
                                  <><Loader2 className="h-4 w-4 animate-pulse" />{downloadingId === clip.id && downloadProgress ? downloadProgress : t('common.saving')}</>
                                ) : (
                                  <><Download className="h-4 w-4" />{t('video.download')}</>
                                )}
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              className="flex-1 gap-1.5"
                              disabled
                            >
                              <AlertCircle className="h-4 w-4" />{t('common.failed')}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {previewClip && (
        <PreviewDialog
          clip={previewClip}
          open={!!previewClip}
          onOpenChange={() => setPreviewClip(null)}
          proxyUrl={proxyUrl}
          onDownload={handleDownload}
          onClipUpdated={(updatedClip) => {
            setClips(prev => prev.map(c => c.id === updatedClip.id ? updatedClip : c));
            setPreviewClip(updatedClip);
          }}
          downloadingId={downloadingId}
          fmt={fmt}
          vertical={isShorts || exportVertical}
        />
      )}

      <InsufficientCreditsDialog
        open={insufficientOpen}
        onOpenChange={setInsufficientOpen}
        currentBalance={balance}
        requiredCredits={60}
      />

      {/* 导出即付费墙：免费用户导出/下载视频被拦截时的付费引导（订阅优先 + 积分包兜底） */}
      <InsufficientCreditsDialog
        open={exportPaywallOpen}
        onOpenChange={setExportPaywallOpen}
        reason="export"
        currentBalance={balance}
        requiredCredits={60}
      />

      {/* 首次出片成功 → 一次性升级引导 */}
      <Dialog open={firstSuccessOpen} onOpenChange={(v) => { if (!v) setSuppressSuccessModal(true); setFirstSuccessOpen(v); }}>
        <DialogContent className="sm:max-w-[440px] overflow-hidden p-0 gap-0">
          <div className="relative bg-gradient-to-br from-primary/15 via-primary/10 to-transparent px-6 pt-7 pb-5">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-12 translate-x-12 blur-2xl pointer-events-none" />
            <DialogHeader className="relative space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 ring-4 ring-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold leading-tight">
                    {locale === 'zh' ? '精彩片段已就绪' : 'Your highlights are ready'}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {locale === 'zh' ? '继续用免费额度，或解锁无水印与更高清导出' : 'Keep going free, or unlock no-watermark & HD export'}
                  </p>
                </div>
              </div>
              <DialogDescription className="text-sm text-muted-foreground">
                {locale === 'zh'
                  ? '免费版每天 1 次生成。升级 Starter 每月 6,000 积分（约 100 条）、无水印、1080p 导出。'
                  : 'Free = 1 generation/day. Starter gives 6,000 credits monthly (about 100 clips), no watermark, and 1080p export.'}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 pb-6 pt-2 space-y-2.5">
            <Button asChild className="w-full h-11 text-sm font-semibold">
              <Link href="/pricing?source=first_success">
                <Zap className="h-4 w-4 mr-1.5" />
                {locale === 'zh' ? '解锁更多创作' : 'Unlock More'}
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
            <Button
              onClick={() => { setSuppressSuccessModal(true); setFirstSuccessOpen(false); if (typeof window !== 'undefined') localStorage.setItem('clipop_first_success_upsell_dismissed', '1'); }}
              variant="ghost"
              className="w-full h-9 text-xs text-muted-foreground hover:text-foreground"
            >
              {locale === 'zh' ? '暂不，先看看片段' : 'Not now, let me preview'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
