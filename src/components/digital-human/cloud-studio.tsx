'use client';

/**
 * 云端真人数字人 —— 百炼 wan2.2-s2v 数字人口播 + CosyVoice 声音克隆（Web 端真实调用链路）。
 *
 * 生成链路：
 *   参考人像 → /api/ai-tools/upload 票据直传 Supabase（users/{uid}/ai-tools/）→ objectPath
 *   POST /api/digital-human/generate { imageObjectPath, text, voice, resolution }
 *     → 服务端：合成旁白（预设 qwen-tts / 复刻 cosyvoice-v2）+ 图片托管 oss:// + 提交 wan2.2-s2v
 *   GET /api/digital-human/status?taskId= 轮询 → 转存后返回 24h 签名视频 URL
 *
 * 声音克隆：
 *   参考音频 → 直传 Supabase → POST /api/digital-human/voice { referenceObjectPath, name } → voice_id
 *   试听：POST /api/digital-human/voice { action:'preview', voice, text } → 合成后的音频 URL
 *
 * wan2.2-s2v 单次音频须 <20 秒，故口播文案上限由 /capabilities 返回（maxNarrationChars）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { uploadAiInput } from '@/lib/ai-tools/client-api';
import { useAiToolCredit, AI_TOOL_COST } from '@/lib/ai-tools/use-ai-tool-credit';
import { InsufficientCreditsDialog } from '@/components/insufficient-credits-dialog';
import { PHOTO_AVATARS } from '@/components/video-templates/talking-avatar';
import {
  Bot,
  Loader2,
  Mic,
  Download,
  Sparkles,
  Play,
  Square,
  AudioLines,
  ImagePlus,
  AlertCircle,
  Link as LinkIcon,
} from 'lucide-react';

interface Capability {
  available: boolean;
  reason: string;
  voiceCloneAvailable: boolean;
  presetVoices: string[];
  maxNarrationChars: number;
  model: string;
}

interface ClonedVoice {
  id: string;
  name: string;
  voiceId: string;
  createdAt: string;
}

type GenStatus = 'idle' | 'submitting' | 'polling' | 'succeeded' | 'failed';

const POLL_INTERVAL_MS = 8000;
const POLL_MAX_ATTEMPTS = 45; // ≈6 分钟；wan2.2-s2v 480P 实测约 2 分钟

const SAMPLE_TEXT: Record<string, string> = {
  zh: '你好，很高兴认识你，这是我的声音预览。',
  en: 'Hello! Nice to meet you — this is my voice preview.',
  ja: 'こんにちは、はじめまして。これが私の声のプレビューです。',
  ko: '안녕하세요, 만나서 반갑습니다. 제 목소리 미리듣기입니다.',
};

function sampleTextFor(locale: string | undefined): string {
  const base = (locale || 'en').slice(0, 2).toLowerCase();
  return SAMPLE_TEXT[base] || SAMPLE_TEXT.en;
}

export function CloudDigitalHumanStudio() {
  const { t, locale } = useLocale();
  const { user, accessToken } = useAuth();
  const { requestSpend, insufficientOpen, setInsufficientOpen, balance } = useAiToolCredit();

  const [cap, setCap] = useState<Capability | null>(null);
  const [avatarId, setAvatarId] = useState(PHOTO_AVATARS[0]?.id ?? '');
  const [uploaded, setUploaded] = useState<{ file: File; previewUrl: string } | null>(null);
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('Cherry');
  const [voices, setVoices] = useState<ClonedVoice[]>([]);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);
  const [resolution, setResolution] = useState<'480P' | '720P'>('480P');
  const [status, setStatus] = useState<GenStatus>('idle');
  const [progressNote, setProgressNote] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');
  const [previewing, setPreviewing] = useState('');
  const [notice, setNotice] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const tr = useCallback(
    (key: string, fallback: string) => {
      const val = t(key);
      return val === key ? fallback : val;
    },
    [t],
  );

  const maxChars = cap?.maxNarrationChars ?? 72;
  const pickedAvatar = useMemo(() => PHOTO_AVATARS.find((a) => a.id === avatarId) ?? PHOTO_AVATARS[0], [avatarId]);
  const busy = status === 'submitting' || status === 'polling';

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  /* ---------------- 能力探测 + 已复刻音色 ---------------- */

  useEffect(() => {
    let alive = true;
    fetch('/api/digital-human/capabilities', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: Capability) => {
        if (!alive) return;
        setCap(d);
        if (d.presetVoices?.length) setVoice((cur) => (cur && d.presetVoices.includes(cur) ? cur : d.presetVoices[0]));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const loadVoices = useCallback(async () => {
    if (!accessToken) return;
    try {
      const r = await fetch('/api/digital-human/voice', {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!r.ok) return;
      const d = (await r.json()) as { voices?: ClonedVoice[] };
      setVoices(Array.isArray(d.voices) ? d.voices : []);
    } catch {
      /* 音色列表拉取失败不阻断主流程 */
    }
  }, [accessToken]);

  useEffect(() => {
    void loadVoices();
  }, [loadVoices]);

  useEffect(
    () => () => {
      stopPolling();
      audioRef.current?.pause();
    },
    [stopPolling],
  );

  /* ---------------- 参考人像 ---------------- */

  const handlePickImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploaded({ file, previewUrl: URL.createObjectURL(file) });
    setAvatarId('');
    setError('');
    e.target.value = '';
  }, []);

  /** 生成时用到的图片 Blob（内置形象照 → 先取回再上传；用户上传 → 直接复用）。 */
  const resolveImageBlob = useCallback(async (): Promise<{ blob: Blob; filename: string }> => {
    if (uploaded) return { blob: uploaded.file, filename: uploaded.file.name || 'avatar.jpg' };
    const photo = pickedAvatar?.photo;
    if (!photo) throw new Error(tr('digitalHumanCloud.noAvatar', '请先选择或上传一张参考人像'));
    const r = await fetch(photo, { cache: 'force-cache' });
    if (!r.ok) throw new Error(`参考人像读取失败 ${r.status}`);
    const blob = await r.blob();
    return { blob, filename: `${pickedAvatar.id}.jpg` };
  }, [uploaded, pickedAvatar, tr]);

  /* ---------------- 声音克隆 ---------------- */

  const handleCloneFile = useCallback(async (file: File) => {
    if (!user || !accessToken) {
      setError(tr('digitalHumanCloud.needLogin', '请先登录后再克隆音色'));
      return;
    }
    if (!(await requestSpend())) return;
    setCloning(true);
    setError('');
    setNotice('');
    try {
      const up = await uploadAiInput(accessToken, user.id, file, file.name || 'voice-ref.wav', file.type || 'audio/wav');
      const r = await fetch('/api/digital-human/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ referenceObjectPath: up.objectPath, name: cloneName.trim() || undefined }),
      });
      const d = (await r.json().catch(() => ({}))) as { voice?: ClonedVoice; message?: string; error?: string };
      if (!r.ok || !d.voice) throw new Error(d.message || d.error || `HTTP ${r.status}`);
      setVoices((cur) => [d.voice as ClonedVoice, ...cur]);
      setVoice(d.voice.voiceId);
      setCloneName('');
      setNotice(tr('digitalHumanCloud.cloneOk', '音色克隆成功，已自动选中'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCloning(false);
    }
  }, [user, accessToken, requestSpend, cloneName, tr]);

  const handlePreview = useCallback(
    async (voiceId: string) => {
      if (!accessToken) {
        setError(tr('digitalHumanCloud.needLogin', '请先登录后再克隆音色'));
        return;
      }
      if (previewing === voiceId) {
        audioRef.current?.pause();
        setPreviewing('');
        return;
      }
      setPreviewing(voiceId);
      setError('');
      try {
        const r = await fetch('/api/digital-human/voice', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'preview', voice: voiceId, text: sampleTextFor(locale) }),
        });
        const d = (await r.json().catch(() => ({}))) as { audioUrl?: string; message?: string; error?: string };
        if (!r.ok || !d.audioUrl) throw new Error(d.message || d.error || `HTTP ${r.status}`);
        const el = audioRef.current;
        if (el) {
          el.src = d.audioUrl;
          await el.play().catch(() => {});
          el.onended = () => setPreviewing('');
        }
      } catch (e) {
        setPreviewing('');
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [accessToken, previewing, locale, tr],
  );

  /* ---------------- 生成 + 轮询 ---------------- */

  const poll = useCallback(
    async (taskId: string, attempt = 0) => {
      if (attempt >= POLL_MAX_ATTEMPTS) {
        setStatus('failed');
        setError(tr('digitalHumanCloud.timeout', '生成超时，请稍后在浏览器中重试'));
        return;
      }
      try {
        const r = await fetch(`/api/digital-human/status?taskId=${encodeURIComponent(taskId)}`, {
          headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
          cache: 'no-store',
        });
        const d = (await r.json().catch(() => ({}))) as { status?: string; videoUrl?: string; error?: string; message?: string };
        if (!r.ok) throw new Error(d.message || d.error || `HTTP ${r.status}`);
        if (d.status === 'succeeded' && d.videoUrl) {
          setVideoUrl(d.videoUrl);
          setStatus('succeeded');
          setProgressNote('');
          return;
        }
        if (d.status === 'failed') {
          setStatus('failed');
          setError(d.error || tr('digitalHumanCloud.genFailed', '生成失败，请重试'));
          return;
        }
        pollRef.current = window.setTimeout(() => void poll(taskId, attempt + 1), POLL_INTERVAL_MS);
      } catch (e) {
        setStatus('failed');
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [accessToken, tr],
  );

  const handleGenerate = useCallback(async () => {
    if (!user || !accessToken) {
      setError(tr('digitalHumanCloud.needLogin', '请先登录后再克隆音色'));
      return;
    }
    const narration = text.trim();
    if (!narration) {
      setError(tr('digitalHumanCloud.needText', '请填写口播文案'));
      return;
    }
    if (narration.length > maxChars) {
      setError(tr('digitalHumanCloud.textTooLong', '口播文案过长，请精简'));
      return;
    }
    if (!(await requestSpend())) return;

    stopPolling();
    setStatus('submitting');
    setError('');
    setNotice('');
    setVideoUrl('');
    setProgressNote(tr('digitalHumanCloud.uploading', '上传参考人像…'));

    try {
      const { blob, filename } = await resolveImageBlob();
      const up = await uploadAiInput(accessToken, user.id, blob, filename, blob.type || 'image/jpeg');
      setProgressNote(tr('digitalHumanCloud.submitting', '提交生成任务…'));
      const r = await fetch('/api/digital-human/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ imageObjectPath: up.objectPath, text: narration, voice, resolution }),
      });
      const d = (await r.json().catch(() => ({}))) as { taskId?: string; message?: string; error?: string };
      if (!r.ok || !d.taskId) throw new Error(d.message || d.error || `HTTP ${r.status}`);
      setStatus('polling');
      setProgressNote(tr('digitalHumanCloud.rendering', '真人数字人合成中（约 1–3 分钟）…'));
      void poll(d.taskId);
    } catch (e) {
      setStatus('failed');
      setProgressNote('');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [user, accessToken, text, maxChars, requestSpend, stopPolling, resolveImageBlob, voice, resolution, poll, tr]);

  /* ---------------- 渲染 ---------------- */

  return (
    <Card className="mb-6 p-4 md:p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Bot className="h-4 w-4 text-primary" />
          {tr('digitalHumanCloud.title', '云端真人数字人')}
          {cap?.model && (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{cap.model}</code>
          )}
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
          {tr('digitalHumanCloud.badge', '真实口型 · 云端合成')}
        </span>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        {tr(
          'digitalHumanCloud.subtitle',
          '上传一张正面人像 + 一段口播文案 → 真人级口型同步视频（无需显卡、无需安装客户端）。',
        )}
      </p>

      {cap && !cap.available && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="space-y-1">
            <p>{cap.reason || tr('digitalHumanCloud.unavailable', '云端模型密钥未配置')}</p>
            <Link href="/digital-human" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <LinkIcon className="h-3 w-3" />
              {tr('digitalHumanCloud.gotoCanvas', '改用零门槛画布数字人')}
            </Link>
          </div>
        </div>
      )}

      {!user && (
        <p className="mb-4 text-xs text-muted-foreground">{tr('digitalHumanCloud.loginHint', '登录后即可使用。')}</p>
      )}

      {/* ① 参考人像 */}
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
          <ImagePlus className="h-3.5 w-3.5 text-primary" />
          {tr('digitalHumanCloud.avatarSection', '参考人像')}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PHOTO_AVATARS.slice(0, 12).map((a) => {
            const selected = !uploaded && avatarId === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setAvatarId(a.id);
                  setUploaded(null);
                }}
                title={a.name}
                className={`size-12 overflow-hidden rounded-full border-2 transition-all ${
                  selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.photo} alt={a.name} className="size-full object-cover" loading="lazy" />
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`flex size-12 items-center justify-center overflow-hidden rounded-full border-2 border-dashed transition-all ${
              uploaded ? 'border-primary' : 'border-border hover:border-primary/50'
            }`}
            title={tr('digitalHumanCloud.uploadImage', '上传人像')}
          >
            {uploaded ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={uploaded.previewUrl} alt="uploaded" className="size-full object-cover" />
            ) : (
              <ImagePlus className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePickImage} />
        </div>
      </div>

      {/* ② 口播文案 */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Mic className="h-3.5 w-3.5 text-primary" />
            {tr('digitalHumanCloud.textSection', '口播文案')}
          </div>
          <span className={`text-[11px] ${text.length > maxChars ? 'text-red-500' : 'text-muted-foreground'}`}>
            {text.length}/{maxChars}
          </span>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={tr('digitalHumanCloud.textPlaceholder', '输入口播文案（单次 ≤ 72 字，对应音频 <20 秒）')}
          className="resize-none"
        />
      </div>

      {/* ③ 音色 */}
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
          <AudioLines className="h-3.5 w-3.5 text-primary" />
          {tr('digitalHumanCloud.voiceSection', '音色')}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(cap?.presetVoices ?? ['Cherry', 'Serena', 'Ethan', 'Chelsie']).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVoice(v)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                voice === v ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent'
              }`}
            >
              {v}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  void handlePreview(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    void handlePreview(v);
                  }
                }}
                className="ml-0.5 text-primary"
                title={tr('digitalHumanCloud.preview', '试听')}
              >
                {previewing === v ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              </span>
            </button>
          ))}
        </div>

        {voices.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{tr('digitalHumanCloud.myVoices', '我的克隆音色')}:</span>
            {voices.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVoice(v.voiceId)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                  voice === v.voiceId ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent'
                }`}
              >
                {v.name}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handlePreview(v.voiceId);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      void handlePreview(v.voiceId);
                    }
                  }}
                  className="ml-0.5 text-primary"
                  title={tr('digitalHumanCloud.preview', '试听')}
                >
                  {previewing === v.voiceId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                </span>
              </button>
            ))}
          </div>
        )}

        {cap?.voiceCloneAvailable && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-2">
            <Input
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              placeholder={tr('digitalHumanCloud.cloneName', '音色名称（可选）')}
              className="h-8 w-40 text-xs"
            />
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/wav,audio/mpeg,audio/mp3"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCloneFile(f);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={cloning}
              onClick={() => audioInputRef.current?.click()}
              className="h-8 text-xs"
            >
              {cloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
              {tr('digitalHumanCloud.cloneVoice', '克隆音色')}
            </Button>
            <span className="text-[10px] text-muted-foreground">{tr('digitalHumanCloud.cloneHint', '10–20 秒清晰人声')}</span>
          </div>
        )}
      </div>

      {notice && <p className="mb-3 text-xs text-emerald-600 dark:text-emerald-400">{notice}</p>}
      {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

      {/* ④ 生成 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5">
          {(['480P', '720P'] as const).map((r) => (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => setResolution(r)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
                resolution === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <Button type="button" disabled={busy || !text.trim() || (cap ? !cap.available : false)} onClick={() => void handleGenerate()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {status === 'submitting'
            ? tr('digitalHumanCloud.uploading', '上传参考人像…')
            : status === 'polling'
              ? tr('digitalHumanCloud.rendering', '真人数字人合成中（约 1–3 分钟）…')
              : tr('digitalHumanCloud.generate', '生成真人数字人视频')}
        </Button>
        {previewing !== '' && (
          <button
            type="button"
            onClick={() => {
              audioRef.current?.pause();
              setPreviewing('');
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Square className="h-3 w-3" />
            {tr('digitalHumanCloud.stopPreview', '停止试听')}
          </button>
        )}
      </div>

      {busy && progressNote && <p className="mt-3 text-[11px] text-muted-foreground">{progressNote}</p>}

      {status === 'succeeded' && videoUrl && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Bot className="h-4 w-4 text-primary" />
              {tr('digitalHumanCloud.result', '真人数字人视频已成片')}
            </span>
            <a
              href={videoUrl}
              download="digital-human.mp4"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5" />
              {tr('digitalHumanCloud.download', '下载 MP4')}
            </a>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={videoUrl} controls playsInline className="mx-auto w-full max-w-[320px] rounded-lg border border-border" />
        </div>
      )}

      <audio ref={audioRef} className="hidden" />
      <InsufficientCreditsDialog
        open={insufficientOpen}
        onOpenChange={setInsufficientOpen}
        currentBalance={balance}
        requiredCredits={AI_TOOL_COST}
      />
    </Card>
  );
}