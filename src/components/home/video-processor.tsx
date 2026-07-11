'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { useCredits } from '@/lib/credits-context';
import { isAdminUser } from '@/lib/admin-gate';
import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';
import {
  downloadYouTubeClip,
  downloadFullVideoStream,
  downloadPartialMP4,
  resolveYouTubeStream,
  cacheResolvedStream,
  buildStreamProxyUrl,
  extractYouTubeVideoId,
  type ResolvedStream,
} from '@/lib/youtube-clip-download';
import {
  Video, Upload, Link2, Sparkles, Download, Play,
  Film, Scissors, Zap, ArrowRight, CheckCircle,
  AlertCircle, Loader2, Clock, Eye, ExternalLink
} from 'lucide-react';
import Link from 'next/link';

const PreviewDialog = dynamic(
  () => import('@/components/home/preview-dialog'),
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
          // 从 clip.id 提取 videoId 构建 YouTube 链接
          clip.linkOnlyUrl = url;
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

export default function VideoProcessor() {
  const { t } = useLocale();
  const { user, accessToken } = useAuth();
  const { balance, refreshCredits, deductCredits } = useCredits();

  const [useAgent, setUseAgent] = useState(false);
  const [quality, setQuality] = useState<'sd' | 'hd'>('sd');
  const [videoUrl, setVideoUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<SSEData | null>(null);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewClip, setPreviewClip] = useState<VideoClip | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trimmedVideoUrl = videoUrl.trim();
  const canStart = (!!trimmedVideoUrl && isHttpVideoUrl(trimmedVideoUrl)) || !!selectedFile;
  const completedClips = clips.filter(clip =>
    (clip.status === 'completed' && clip.videoUrl && clip.isFallback !== true) ||
    (clip.status === 'link_only' && clip.linkOnlyUrl) ||
    (clip.isFallback === true && clip.linkOnlyUrl)
  );

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

  const handleProcess = useCallback(async () => {
    if (!user) { window.location.href = '/login'; return; }
    if (!trimmedVideoUrl && !selectedFile) { setError('Please enter a video URL or upload a local video file.'); return; }
    if (trimmedVideoUrl && !isHttpVideoUrl(trimmedVideoUrl)) {
      setError('Please enter a valid public http(s) video URL.');
      return;
    }
    const latestBalance = await refreshCredits();
    if (!isAdminUser(user) && latestBalance < 60) { setError('Insufficient credits. You need at least 60 credits.'); return; }

    setIsProcessing(true);
    setProgress({ stage: 'init', progress: 0, message: 'Starting...' });
    setClips([]);
    setError(null);

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

      const runBatch = async (payload: Record<string, unknown>) => {
        console.log('[runBatch] Starting with payload videoUrl:', payload.videoUrl);
        let processUrl = '/api/process-video';
        if (shouldUseLocalProcessing) {
          if (isDesktop) {
            const base = await desktop.getMediaBaseUrl();
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
                setError(d.message);
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
              setError(d.message);
              done = true;
            }
          } catch (e) {
            console.error('SSE parse error (buf):', e, 'buf:', buf);
          }
        }

        if (shouldUseLocalProcessing) return;
      };

      await runBatch({
        videoUrl: inputUrl,
        userId: user.id,
        sourceType: selectedFile ? 'upload' : 'url',
        aiConfig: getAdminAiConfig(),
        quality,
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
          // Continue passing the pre-resolved stream URL for subsequent batches
          // (same video, same streamUrl is still valid for several minutes).
          ...(preResolvedStreamUrl ? { streamUrl: preResolvedStreamUrl } : {}),
          ...(preResolvedMetadata ? { streamMetadata: preResolvedMetadata } : {}),
        });
        if (hasError) break;
      }

      if (done && !hasError) {
        // 重新生成 fallback zoompan 伪视频：当 Vercel 因 YouTube colo-mismatch/IP 限制
        // 无法通过 CF Worker 下载视频时，后端会用静态缩略图 + zoompan 滤镜生成"伪视频"，
        // 并标记 isFallback: true。前端浏览器 IP 不受限，可以通过 CF Worker /stream
        // 下载真实视频片段，上传到 /api/regenerate-clip 用 ffmpeg 生成真实短视频。
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
  }, [accessToken, error, getLocalMediaBaseUrl, refreshCredits, selectedFile, trimmedVideoUrl, uploadToSupabase, useAgent, user]);

  const handleDownload = async (clip: VideoClip) => {
    // link_only clips: record the clip segment via browser captureStream + MediaRecorder.
    //
    // PROBLEM: The old /api/yt-clip-download Edge Runtime route is broken —
    // Vercel Edge IPs are blocked by YouTube (403). CF Worker /stream without
    // streamUrl param also fails (502 — InnerTube rate-limited on SJC colo).
    //
    // SOLUTION:
    //   1. Resolve streamUrl via CF Worker /resolve (cached for 5h)
    //   2. Pass streamUrl to CF Worker /stream (fast path — no InnerTube call)
    //   3. Use captureVideoClip to record [startTime, endTime] segment (real-time)
    //   4. Trigger browser download of the recorded blob
    //
    // If captureVideoClip fails (e.g., browser doesn't support captureStream),
    // fall back to downloading the full video stream as a blob.
    if (clip.status === 'link_only' || (clip.isFallback === true && !clip.videoUrl)) {
      const ytVideoId = extractYouTubeVideoId(clip.linkOnlyUrl);
      if (!ytVideoId) {
        if (clip.linkOnlyUrl) window.open(clip.linkOnlyUrl, '_blank');
        return;
      }
      setDownloadingId(clip.id);
      setDownloadProgress('Preparing download...');
      try {
        await downloadYouTubeClip({
          videoId: ytVideoId,
          startTime: clip.startTime,
          endTime: clip.endTime,
          title: clip.title,
          onProgress: (msg) => setDownloadProgress(msg),
        });
      } catch (captureErr) {
        console.warn('[Download] captureVideoClip failed, trying full video stream:', captureErr instanceof Error ? captureErr.message : captureErr);
        setDownloadProgress('Trying alternative download...');
        try {
          await downloadFullVideoStream({
            videoId: ytVideoId,
            title: clip.title,
            maxBytes: 50 * 1024 * 1024, // 50MB max
            onProgress: (msg) => setDownloadProgress(msg),
          });
        } catch (fullErr) {
          console.warn('[Download] Full video stream failed, trying partial MP4:', fullErr instanceof Error ? fullErr.message : fullErr);
          setDownloadProgress('Downloading partial video...');
          try {
            // Ultimate fallback: download partial MP4 directly (no captureStream)
            await downloadPartialMP4({
              videoId: ytVideoId,
              title: clip.title,
              endTime: clip.endTime,
              onProgress: (msg) => setDownloadProgress(msg),
            });
          } catch (partialErr) {
            console.error('[Download] All download methods failed:', partialErr);
            if (clip.linkOnlyUrl) window.open(clip.linkOnlyUrl, '_blank');
          }
        }
      } finally {
        setDownloadingId(null);
        setDownloadProgress(null);
      }
      return;
    }

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
      <Card className="border-0 shadow-xl">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">{t('video.input.title')}</CardTitle>
          <CardDescription className="text-sm">
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
                placeholder={t('video.pasteUrlPlaceholder')}
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
                <><Sparkles className="h-4 w-4" />{t('video.analyze')}</>
              )}
            </Button>
          </div>

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

          {error && (
            <div className="p-3 bg-destructive/10 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive text-sm">{t('common.error')}</p>
                <p className="text-sm text-muted-foreground">{error}</p>
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

      <section id="process" className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {clips.length > 0 && !isProcessing && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold">{t('video.results')}</h3>
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
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {clips.map(clip => {
                    // isFallback clips have a fake zoompan videoUrl; treat them like link_only for UI
                    const isPlayableEmbed = clip.isFallback === true && !!clip.linkOnlyUrl;
                    const isRealMp4 = clip.status === 'completed' && !!clip.videoUrl && clip.isFallback !== true;
                    return (
                    <Card key={clip.id} className="overflow-hidden group">
                      <div
                        className="relative aspect-video bg-muted cursor-pointer"
                        onClick={() => {
                          if (isRealMp4 || isPlayableEmbed) setPreviewClip(clip);
                          else if (clip.status === 'link_only' && clip.linkOnlyUrl) setPreviewClip(clip);
                        }}
                      >
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
        />
      )}
    </>
  );
}
