'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/lib/locale-context';
import { useCredits } from '@/lib/credits-context';
import { useAuth } from '@/lib/auth-context';
import { isAdminUser } from '@/lib/admin-gate';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { InsufficientCreditsDialog } from '@/components/insufficient-credits-dialog';
import { AI_VIDEO_COST, AI_VIDEO_MAX_TOPIC_CHARS } from '@/lib/ai-video';
import {
  AI_VIDEO_TEMPLATES,
  DEFAULT_AI_VIDEO_TEMPLATE,
  type AiVideoTemplateId,
} from '@/lib/ai-video-templates';
import { Sparkles, Wand2, Download, RefreshCw, PlayCircle, Loader2, Bot, KeyRound, Music, User, Mic } from 'lucide-react';
import { PHOTO_AVATARS } from '@/components/video-templates/talking-avatar';

/**
 * AI 成片 —— 「一句话生成竖屏视频」。
 * 界面结构参考开源框架 Pixelle-Video 的 WebUI（resources/webui.png）三栏工作台：
 *   左栏 = 视频脚本（主题输入 + 示例 + BGM）
 *   中栏 = 分镜模板（7 类竖屏模版）+ 配图风格
 *   右栏 = 生成视频（生成按钮 + 进度 + 9:16 预览 + 下载）
 *
 * 画面管线同样对齐 Pixelle image_full 版式：AI 实拍图全幅铺满 + 顶部标题 + 底部字幕。
 * 免费档视频带水印（720p），导出/下载走「导出即付费墙」（Starter+ 无水印 1080p）。
 */

const EXAMPLE_TOPICS_ZH = [
  '改变一天状态的 3 个晨间习惯',
  '为什么你的短视频没人看完',
  '新手做副业最容易踩的 3 个坑',
];
const EXAMPLE_TOPICS_EN = [
  '3 morning habits that change your entire day',
  'Why nobody watches your short videos to the end',
  'The 3 biggest mistakes new side hustlers make',
];

const STEP_KEYS = ['aiVideo.step1', 'aiVideo.step2', 'aiVideo.step3', 'aiVideo.step4', 'aiVideo.step5'] as const;

/** BGM 心绪选项（服务端白名单 calm/energetic/warm；auto = 跟随模版默认）。 */
const BGM_OPTIONS = [
  { id: 'auto', zh: '跟随模版', en: 'Auto (template)' },
  { id: 'calm', zh: '轻缓舒缓', en: 'Calm' },
  { id: 'energetic', zh: '活力节奏', en: 'Energetic' },
  { id: 'warm', zh: '温暖治愈', en: 'Warm' },
  { id: 'none', zh: '不加音乐', en: 'None' },
] as const;
type BgmChoice = (typeof BGM_OPTIONS)[number]['id'];

/** 模版名 / 说明的兜底（i18n 缺失时中文/英文自洽，避免显示 key 本体）。 */
const TPL_LABEL_FALLBACK: Record<AiVideoTemplateId, string> = {
  growth: '个人成长',
  'deep-thinking': '深度思考',
  emotion: '情感共鸣',
  novel: '小说解说',
  science: '知识科普',
  'side-hustle': '副业赚钱',
  history: '历史解说',
  'digital-human': '数字人带货',
};
const TPL_DESC_FALLBACK: Record<AiVideoTemplateId, string> = {
  growth: '成长干货口吻，给一个不可能失败的最小行动',
  'deep-thinking': '冷静分析口吻，把问题问到更深一层',
  emotion: '温柔叙事口吻，说破那些没说出口的话',
  novel: '悬念解说口吻，每段结尾都留钩子',
  science: '科普解释口吻，讲清机制并纠正误区',
  'side-hustle': '务实搞钱口吻，先卖后做、算清成本',
  history: '沉稳历史口吻，从一天讲到几百年',
  'digital-human': '真人级口播带货（wan2.2-s2v），需配置模型密钥',
};

/** 数字人口播单次文案上限（对应音频 <20s，与服务端 MAX_NARRATION_CHARS 一致）。 */
const DH_MAX_CHARS = 72;
/** 数字人生成轮询间隔（毫秒）。 */
const DH_POLL_INTERVAL_MS = 4_000;
const DH_POLL_TIMEOUT_MS = 10 * 60_000;

interface DigitalHumanCapability {
  available: boolean;
  provider: string | null;
  missingEnv: string[];
  voiceCloneAvailable: boolean;
  reason: string;
  fallbackHref: string;
}

export default function AiVideoPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { balance, plan, refreshCredits } = useCredits();

  const [topic, setTopic] = useState('');
  const [templateId, setTemplateId] = useState<AiVideoTemplateId>(DEFAULT_AI_VIDEO_TEMPLATE);
  const [bgmChoice, setBgmChoice] = useState<BgmChoice>('auto');
  const [generating, setGenerating] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ engine: string; watermark: boolean; duration: number; template: string } | null>(null);
  const [error, setError] = useState('');
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [exportPaywallOpen, setExportPaywallOpen] = useState(false);
  const [dhCap, setDhCap] = useState<DigitalHumanCapability | null>(null);

  // ── 数字人带货模式（/api/digital-human/* 真人级口播管线）─────────────────
  const [dhScript, setDhScript] = useState('');
  const [dhScriptEngine, setDhScriptEngine] = useState<'llm' | 'local' | null>(null);
  const [dhWriting, setDhWriting] = useState(false);
  const [dhAvatarId, setDhAvatarId] = useState<string>(PHOTO_AVATARS[0]?.id ?? '');
  const [dhVoice, setDhVoice] = useState('Cherry');
  const [dhVoices, setDhVoices] = useState<Array<{ id: string; name: string }>>([]);
  const [dhResolution, setDhResolution] = useState<'480P' | '720P'>('480P');
  const [dhStatus, setDhStatus] = useState<'idle' | 'submitting' | 'polling' | 'done' | 'failed'>('idle');
  const [dhVideoUrl, setDhVideoUrl] = useState<string | null>(null);
  const dhPollRef = useRef<number | null>(null);

  const stopDhPolling = useCallback(() => {
    if (dhPollRef.current !== null) {
      window.clearTimeout(dhPollRef.current);
      dhPollRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      stopDhPolling();
    },
    [stopDhPolling],
  );

  // 数字人可用时拉取音色列表（预设 + 已复刻音色）
  useEffect(() => {
    if (!dhCap?.available) return;
    let alive = true;
    fetch('/api/digital-human/voice')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const raw = Array.isArray(d.voices)
          ? (d.voices as Array<{ id?: string; name?: string; voiceId?: string }>)
          : [];
        const list: Array<{ id: string; name: string }> = raw
          .map((v) => ({
            id: String(v.voiceId || v.id || ''),
            name: String(v.name || v.id || ''),
          }))
          .filter((v) => v.id);
        if (list.length) setDhVoices(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [dhCap?.available]);

  const videoUrlRef = useRef<string | null>(null);

  const tr = useCallback(
    (key: string, fallback: string) => {
      const v = t(key);
      return v === key ? fallback : v;
    },
    [t],
  );

  const releaseVideo = useCallback(() => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    setVideoUrl(null);
    setMeta(null);
  }, []);

  useEffect(() => () => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
  }, []);

  // 数字人口播带货的能力探测：未配置 provider 密钥时明确告知（不静默失败）
  useEffect(() => {
    let alive = true;
    fetch('/api/digital-human/capabilities')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setDhCap(d as DigitalHumanCapability);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 生成期间的分段提示（纯前端节拍，让等待过程可感知；失败不影响真实进度）
  useEffect(() => {
    if (!generating) return;
    setElapsed(0);
    setStepIdx(0);
    const started = Date.now();
    const timer = setInterval(() => {
      const sec = Math.floor((Date.now() - started) / 1000);
      setElapsed(sec);
      setStepIdx(Math.min(STEP_KEYS.length - 1, Math.floor(sec / 7)));
    }, 1000);
    return () => clearInterval(timer);
  }, [generating]);

  const examples = locale.startsWith('zh') ? EXAMPLE_TOPICS_ZH : EXAMPLE_TOPICS_EN;
  const isZh = locale.startsWith('zh');
  /** 预览里展示的模版名（优先用服务端回带的结果模版） */
  const shownTemplateId = ((meta?.template as AiVideoTemplateId) || templateId);
  const shownTemplateLabel = tr(`aiVideo.tpl.${shownTemplateId}`, TPL_LABEL_FALLBACK[shownTemplateId] || TPL_LABEL_FALLBACK[templateId]);
  const activeTemplate = AI_VIDEO_TEMPLATES.find((tpl) => tpl.id === templateId) || AI_VIDEO_TEMPLATES[0];

  const handleGenerate = useCallback(async () => {
    const clean = topic.trim();
    if (!clean) {
      setError(tr('aiVideo.errorTopic', 'Please describe your video topic first.'));
      return;
    }
    setError('');
    releaseVideo();
    setGenerating(true);

    try {
      const resp = await fetch('/api/ai-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: clean,
          locale,
          template: templateId,
          bgmMood: bgmChoice === 'auto' ? undefined : bgmChoice,
        }),
      });

      if (resp.status === 401) {
        setError(tr('aiVideo.errorLogin', 'Please sign in to generate a video.'));
        return;
      }
      if (resp.status === 402) {
        setCreditsOpen(true);
        return;
      }
      if (!resp.ok) {
        let detail = '';
        try {
          const data = await resp.json();
          detail = String(data?.detail || data?.error || '');
        } catch { /* ignore */ }
        setError(detail ? `${tr('aiVideo.errorGeneric', 'Generation failed. Please try again.')} (${detail})` : tr('aiVideo.errorGeneric', 'Generation failed. Please try again.'));
        return;
      }

      const nextMeta = {
        engine: resp.headers.get('X-Ai-Video-Engine') || 'local',
        watermark: resp.headers.get('X-Ai-Video-Watermark') === '1',
        duration: Number(resp.headers.get('X-Ai-Video-Duration') || 0),
        template: resp.headers.get('X-Ai-Video-Template') || templateId,
      };
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setVideoUrl(url);
      setMeta(nextMeta);
      refreshCredits().catch(() => {});
    } catch {
      setError(tr('aiVideo.errorGeneric', 'Generation failed. Please try again.'));
    } finally {
      setGenerating(false);
    }
  }, [topic, locale, templateId, bgmChoice, releaseVideo, refreshCredits, tr]);

  /** 导出即付费墙：免费用户（管理员除外）不允许下载任何视频文件。 */
  const handleDownload = useCallback(() => {
    if (!videoUrl) return;
    if (plan === 'free' && !isAdminUser(user)) {
      setExportPaywallOpen(true);
      return;
    }
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `ai-video-${meta?.template || templateId}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [videoUrl, plan, user, meta, templateId]);

  // ── 数字人带货：AI 写口播稿（把一句话主题压成 ≤72 字带货口播）────────────
  const handleDhWriteScript = useCallback(async () => {
    const clean = topic.trim();
    if (!clean) {
      setError(tr('aiVideo.errorTopic', 'Please describe your video topic first.'));
      return;
    }
    setError('');
    setDhWriting(true);
    try {
      const resp = await fetch('/api/ai-video/dh-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: clean, locale }),
      });
      if (!resp.ok) throw new Error(`script ${resp.status}`);
      const data = await resp.json();
      setDhScript(String(data.script || ''));
      setDhScriptEngine(data.engine === 'llm' ? 'llm' : 'local');
    } catch {
      setError(tr('aiVideo.errorGeneric', 'Generation failed. Please try again.'));
    } finally {
      setDhWriting(false);
    }
  }, [topic, locale, tr]);

  // ── 数字人带货：提交生成 + 轮询（wan2.2-s2v 真人级口播）──────────────────
  const handleDhGenerate = useCallback(async () => {
    const clean = dhScript.trim();
    if (!clean) {
      setError(tr('aiVideo.dhScriptRequired', 'Write the talking-head script first (AI can draft it from your topic).'));
      return;
    }
    if (clean.length > DH_MAX_CHARS) {
      setError(tr('aiVideo.dhScriptTooLong', 'Script is too long — max 72 characters (audio under 20 seconds).'));
      return;
    }
    const avatar = PHOTO_AVATARS.find((a) => a.id === dhAvatarId) || PHOTO_AVATARS[0];
    if (!avatar) {
      setError('No presenter avatar available.');
      return;
    }
    setError('');
    setDhVideoUrl(null);
    stopDhPolling();
    setDhStatus('submitting');
    try {
      // 预设头像走本站静态资源（https 公网 URL，服务端可直接抓取托管到百炼 oss://）
      const imageUrl = `${window.location.origin}${avatar.photo}`;
      const resp = await fetch('/api/digital-human/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, text: clean, voice: dhVoice, resolution: dhResolution }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(String(data?.message || data?.error || `generate ${resp.status}`));
      }
      const taskId = String(data.taskId || '');
      if (!taskId) throw new Error('missing taskId');

      setDhStatus('polling');
      const startedAt = Date.now();
      const poll = async () => {
        try {
          const r = await fetch(`/api/digital-human/status?taskId=${encodeURIComponent(taskId)}`);
          const s = await r.json().catch(() => ({}));
          if (s.status === 'succeeded' && s.videoUrl) {
            setDhVideoUrl(String(s.videoUrl));
            setDhStatus('done');
            return;
          }
          if (s.status === 'failed') {
            throw new Error(String(s.error || 'generation failed'));
          }
          if (Date.now() - startedAt > DH_POLL_TIMEOUT_MS) {
            throw new Error('poll timeout');
          }
          dhPollRef.current = window.setTimeout(poll, DH_POLL_INTERVAL_MS);
        } catch (e) {
          setError(`${tr('aiVideo.errorGeneric', 'Generation failed. Please try again.')} (${e instanceof Error ? e.message.slice(0, 120) : 'error'})`);
          setDhStatus('failed');
        }
      };
      dhPollRef.current = window.setTimeout(poll, DH_POLL_INTERVAL_MS);
    } catch (e) {
      setError(`${tr('aiVideo.errorGeneric', 'Generation failed. Please try again.')} (${e instanceof Error ? e.message.slice(0, 120) : 'error'})`);
      setDhStatus('failed');
    }
  }, [dhScript, dhAvatarId, dhVoice, dhResolution, stopDhPolling, tr]);

  /** 数字人成片下载：远程 MP4 先 fetch 为 blob 再存（跨域 a.download 无效）。 */
  const handleDhDownload = useCallback(async () => {
    if (!dhVideoUrl) return;
    if (plan === 'free' && !isAdminUser(user)) {
      setExportPaywallOpen(true);
      return;
    }
    try {
      const r = await fetch(dhVideoUrl);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `digital-human-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(dhVideoUrl, '_blank');
    }
  }, [dhVideoUrl, plan, user]);

  return (
    <div className="container mx-auto px-4 py-8 md:py-10">
      {/* Hero（保持简短——工作台三栏才是主体） */}
      <div className="mb-6 text-center md:mb-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Wand2 className="h-3.5 w-3.5" />
          {tr('aiVideo.badge', 'AI Video Maker')}
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground md:text-3xl">
          {tr('aiVideo.title', 'Turn One Sentence Into a Video')}
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground md:text-base">
          {tr('aiVideo.subtitle', 'Zero skill, zero editing. Type your idea and AI writes the script, records the voiceover and renders a ready-to-post vertical video.')}
        </p>
      </div>

      {/* 三栏工作台（参考 Pixelle-Video WebUI：左=脚本，中=模版，右=生成） */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        {/* ── 左栏：视频脚本 ─────────────────────────────────────────── */}
        <Card className="p-4 shadow-sm md:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Wand2 className="h-4 w-4 text-primary" />
            {tr('aiVideo.panelScript', 'Video Script')}
          </h2>

          <label className="mb-2 block text-xs font-medium text-muted-foreground">
            {tr('aiVideo.inputLabel', 'What is your video about?')}
          </label>
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value.slice(0, AI_VIDEO_MAX_TOPIC_CHARS))}
            placeholder={tr('aiVideo.inputPlaceholder', 'e.g. 3 morning habits that change your day')}
            className="min-h-[88px] resize-y"
            disabled={generating}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{tr('aiVideo.examples', 'Try one')}:</span>
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={generating}
                onClick={() => setTopic(ex)}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {ex}
              </button>
            ))}
          </div>

          {/* BGM（Pixelle WebUI 左栏底部的背景音乐选择；数字人口播管线不含 BGM，隐藏） */}
          {templateId !== 'digital-human' && (
            <div className="mt-5">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Music className="h-3.5 w-3.5" />
                {tr('aiVideo.bgmLabel', 'Background Music')}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {BGM_OPTIONS.map((opt) => {
                  const selected = bgmChoice === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={generating}
                      onClick={() => setBgmChoice(opt.id)}
                      className={`rounded-md border px-3 py-2 text-xs transition-all disabled:opacity-50 ${
                        selected
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {isZh ? opt.zh : opt.en}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {/* ── 中栏：分镜模板 + 配图风格 ─────────────────────────────── */}
        <Card className="p-4 shadow-sm md:p-5">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            {tr('aiVideo.templateLabel', 'Storyboard Template')}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {tr('aiVideo.templateHint', 'Pick a style — the script, visuals, voice pace and BGM all follow it.')}
          </p>

          <div className="flex flex-col gap-2">
            {AI_VIDEO_TEMPLATES.map((tpl) => {
              const selected = tpl.id === templateId;
              const name = tr(`aiVideo.tpl.${tpl.id}`, TPL_LABEL_FALLBACK[tpl.id]);
              const desc = tr(`aiVideo.tplDesc.${tpl.id}`, TPL_DESC_FALLBACK[tpl.id]);
              // 数字人带货：依赖服务端模型密钥（wan2.2-s2v），未配置时禁用选择
              const isDh = tpl.id === 'digital-human';
              const dhLocked = isDh && dhCap && !dhCap.available;
              const disabled = generating || (dhStatus === 'submitting' || dhStatus === 'polling') || !!dhLocked;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setTemplateId(tpl.id)}
                  className={`flex items-center gap-3 rounded-lg border p-2.5 text-left transition-all disabled:opacity-50 ${
                    selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border bg-card hover:bg-accent'
                  }`}
                >
                  {isDh ? (
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-primary/15">
                      <Bot className="h-5 w-5 text-primary" />
                    </span>
                  ) : (
                    <span
                      className="flex h-9 w-9 flex-shrink-0 items-end justify-start rounded-md p-1"
                      style={{ background: `linear-gradient(135deg, ${tpl.visual.from}, ${tpl.visual.to})` }}
                    >
                      <span className="block h-1 w-4 rounded-full" style={{ background: tpl.accent }} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-xs font-semibold ${selected ? 'text-primary' : 'text-foreground'}`}>
                      {name}
                      {isDh && (
                        <span className={`ml-1.5 rounded px-1 py-0.5 text-[10px] font-bold ${dhLocked ? 'bg-gold text-black' : 'bg-primary/15 text-primary'}`}>
                          {dhLocked
                            ? tr('aiVideo.dhNeedsKey', 'NEEDS API KEY')
                            : tr('aiVideo.dhLiveTag', 'LIVE-HUMAN')}
                        </span>
                      )}
                      {tpl.prefersClonedVoice && !isDh && (
                        <span className="ml-1.5 font-normal text-muted-foreground/80">
                          · {tr('aiVideo.voiceCloneTag', 'clone voice recommended')}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* 配图风格（数字人口播为真人实拍，无 AI 配图环节，隐藏） */}
          {templateId !== 'digital-human' && (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
              <h3 className="mb-1 text-xs font-medium text-foreground">
                {tr('aiVideo.imageStyleLabel', 'Illustration Style')}
              </h3>
              <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                {activeTemplate.imageStyle}
              </p>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {tr(
                  'aiVideo.imageStyleHint',
                  'Each scene gets a cinematic AI photo that fills the frame (Pixelle image_full layout). Falls back to vector art without an image model key.',
                )}
              </p>
            </div>
          )}

          {/* 数字人口播带货：能力状态（未配置 provider 密钥时明确告知） */}
          {dhCap && (
            <div className="mt-4 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                {dhCap.available ? <Bot className="h-3.5 w-3.5 text-primary" /> : <KeyRound className="h-3.5 w-3.5 text-primary" />}
                <span className="text-xs font-semibold text-foreground">
                  {tr('aiVideo.dhTitle', 'Digital human talking-head video')}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    dhCap.available ? 'bg-primary/15 text-primary' : 'bg-gold text-black'
                  }`}
                >
                  {dhCap.available
                    ? tr('aiVideo.dhAvailable', 'READY')
                    : tr('aiVideo.dhNeedsKey', 'NEEDS API KEY')}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {dhCap.available
                  ? tr('aiVideo.dhAvailableHint', 'Realistic digital-human narrator is enabled for this environment.')
                  : tr(
                      'aiVideo.dhMissingHint',
                      'Server-side realistic digital human requires model credentials. Missing:',
                    )}
                {!dhCap.available && (
                  <span className="ml-1 font-mono text-[10px] text-foreground">{dhCap.missingEnv.join(' , ')}</span>
                )}
              </p>
              {!dhCap.available && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {tr(
                    'aiVideo.dhFallbackHint',
                    'No key yet? Use the built-in zero-key canvas digital human — a neural-voice host with lip sync driven by the audio envelope.',
                  )}{' '}
                  <Link href={dhCap.fallbackHref} className="font-medium text-primary underline-offset-2 hover:underline">
                    {tr('aiVideo.dhFallbackLink', 'Open digital human')}
                  </Link>
                </p>
              )}
            </div>
          )}
        </Card>

        {/* ── 右栏：生成视频（数字人模式 = 口播工作台；普通模式 = 一键渲染） ── */}
        <Card className="p-4 shadow-sm md:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <PlayCircle className="h-4 w-4 text-primary" />
            {templateId === 'digital-human'
              ? tr('aiVideo.dhPanelTitle', 'Digital Human Studio')
              : tr('aiVideo.panelGenerate', 'Generate Video')}
          </h2>

          {templateId === 'digital-human' ? (
            /* ══ 数字人带货工作台（wan2.2-s2v 真人级口播）═════════════════ */
            <div>
              {/* 口播稿：AI 按主题生成 ≤72 字带货口播，可手动编辑 */}
              <label className="mb-2 block text-xs font-medium text-muted-foreground">
                {tr('aiVideo.dhScriptLabel', 'Talking-head script (max 72 chars, ~20s audio)')}
              </label>
              <Textarea
                value={dhScript}
                onChange={(e) => setDhScript(e.target.value.slice(0, DH_MAX_CHARS))}
                placeholder={tr(
                  'aiVideo.dhScriptPlaceholder',
                  'AI writes it from your topic, or type your own sales pitch here.',
                )}
                className="min-h-[88px] resize-y"
                disabled={dhStatus === 'submitting' || dhStatus === 'polling'}
              />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] ${dhScript.length >= DH_MAX_CHARS ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {dhScript.length}/{DH_MAX_CHARS}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDhWriteScript}
                  disabled={dhWriting || !topic.trim() || dhStatus === 'submitting' || dhStatus === 'polling'}
                  className="h-7 text-xs"
                >
                  {dhWriting ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {tr('aiVideo.dhWriting', 'Writing...')}
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3 w-3" />
                      {tr('aiVideo.dhWriteBtn', 'AI write script')}
                    </>
                  )}
                </Button>
              </div>
              {dhScriptEngine && dhScript && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {dhScriptEngine === 'llm'
                    ? tr('aiVideo.engineLlm', 'AI script')
                    : tr('aiVideo.engineLocal', 'Template script')}
                </p>
              )}

              {/* 主播头像：预设实拍头像（photo 为本站 https 静态资源） */}
              <h3 className="mb-2 mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                {tr('aiVideo.dhAvatarLabel', 'Presenter')}
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {PHOTO_AVATARS.slice(0, 8).map((a) => {
                  const selected = a.id === dhAvatarId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      title={a.name}
                      disabled={dhStatus === 'submitting' || dhStatus === 'polling'}
                      onClick={() => setDhAvatarId(a.id)}
                      className={`relative overflow-hidden rounded-lg border-2 transition-all disabled:opacity-50 ${
                        selected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.photo}
                        alt={a.name}
                        className="aspect-[3/4] w-full object-cover"
                      />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-center text-[9px] text-white">
                        {a.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 音色 + 分辨率 */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Mic className="h-3.5 w-3.5" />
                    {tr('aiVideo.dhVoiceLabel', 'Voice')}
                  </h3>
                  <select
                    value={dhVoice}
                    onChange={(e) => setDhVoice(e.target.value)}
                    disabled={dhStatus === 'submitting' || dhStatus === 'polling'}
                    className="h-9 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  >
                    {(dhVoices.length
                      ? dhVoices
                      : [{ id: 'Cherry', name: 'Cherry' }]
                    ).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    {tr('aiVideo.dhResolutionLabel', 'Resolution')}
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['480P', '720P'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        disabled={dhStatus === 'submitting' || dhStatus === 'polling'}
                        onClick={() => setDhResolution(r)}
                        className={`rounded-md border px-2 py-2 text-xs transition-all disabled:opacity-50 ${
                          dhResolution === r
                            ? 'border-primary bg-primary/10 font-medium text-primary'
                            : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 未配置密钥：明确引导（不静默失败） */}
              {dhCap && !dhCap.available && (
                <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <KeyRound className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    {tr('aiVideo.dhNeedsKeyTitle', 'Model key required')}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {tr(
                      'aiVideo.dhFallbackHint',
                      'No key yet? Use the built-in zero-key canvas digital human — a neural-voice host with lip sync driven by the audio envelope.',
                    )}{' '}
                    <Link href={dhCap.fallbackHref} className="font-medium text-primary underline-offset-2 hover:underline">
                      {tr('aiVideo.dhFallbackLink', 'Open digital human')}
                    </Link>
                  </p>
                </div>
              )}

              {/* 生成按钮 */}
              <Button
                onClick={handleDhGenerate}
                disabled={
                  !dhScript.trim() ||
                  dhScript.trim().length > DH_MAX_CHARS ||
                  dhStatus === 'submitting' ||
                  dhStatus === 'polling' ||
                  (!!dhCap && !dhCap.available)
                }
                className="mt-4 h-11 w-full text-sm font-semibold"
                size="lg"
              >
                {dhStatus === 'submitting' || dhStatus === 'polling' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tr('aiVideo.dhSynthesizing', 'Synthesizing talking-head...')}
                  </>
                ) : (
                  <>
                    <Bot className="h-4 w-4" />
                    {tr('aiVideo.dhGenerate', 'Generate Talking Video')}
                  </>
                )}
              </Button>

              {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

              {/* 轮询中提示（真人级口播为异步任务，通常 1~3 分钟） */}
              {(dhStatus === 'submitting' || dhStatus === 'polling') && (
                <div className="mt-4 flex items-center gap-3">
                  <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {tr(
                        'aiVideo.dhPolling',
                        'Realistic talking-head render in progress — this usually takes 1-3 minutes.',
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* 预览 + 下载（9:16 竖屏） */}
              {dhVideoUrl && dhStatus === 'done' && (
                <div className="mt-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{tr('aiVideo.tpl.digital-human', TPL_LABEL_FALLBACK['digital-human'])}</span>
                    <span>
                      {tr('aiVideo.dhEngineTag', 'wan2.2-s2v live-human')} · {dhResolution}
                    </span>
                  </div>

                  <div className="mx-auto w-full max-w-[280px]">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={dhVideoUrl}
                      controls
                      playsInline
                      className="aspect-[9/16] w-full rounded-xl border border-border bg-black object-cover"
                    />
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <Button onClick={handleDhDownload} className="w-full">
                      <Download className="h-4 w-4" />
                      {tr('aiVideo.download', 'Download MP4')}
                    </Button>
                    <Button variant="outline" onClick={handleDhGenerate} className="w-full">
                      <RefreshCw className="h-4 w-4" />
                      {tr('aiVideo.regenerate', 'Regenerate')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ══ 普通模版：一键渲染工作流 ════════════════════════════════ */
            <div>
              <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {tr('aiVideo.creditsCost', 'Costs {n} credits').replace('{n}', String(AI_VIDEO_COST))}
                </span>
                {user && <span>{balance}</span>}
              </div>

              <Button
                onClick={handleGenerate}
                disabled={generating || !topic.trim()}
                className="h-11 w-full text-sm font-semibold"
                size="lg"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tr('aiVideo.generating', 'Generating...')}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {tr('aiVideo.generate', 'Generate Video')}
                  </>
                )}
              </Button>

              {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

              {/* 生成中（Pixelle WebUI 右栏的进度条 + 成功信息） */}
              {generating && (
                <div className="mt-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{t(STEP_KEYS[stepIdx])}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{elapsed}s</p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min(96, (stepIdx + 1) * 20)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 预览（9:16 竖屏播放器 + 元数据 + 下载） */}
              {videoUrl && !generating && (
                <div className="mt-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{shownTemplateLabel}</span>
                    <span>
                      {meta?.engine === 'llm' ? tr('aiVideo.engineLlm', 'AI script') : tr('aiVideo.engineLocal', 'Template script')}
                      {meta?.duration ? ` · ${meta.duration.toFixed(1)}s · 1080×1920` : ' · 1080×1920'}
                    </span>
                  </div>

                  <div className="mx-auto w-full max-w-[280px]">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={videoUrl}
                      controls
                      playsInline
                      className="aspect-[9/16] w-full rounded-xl border border-border bg-black object-cover"
                    />
                  </div>

                  {meta?.watermark && (
                    <p className="mt-3 text-center text-[11px] text-muted-foreground">
                      {tr('aiVideo.watermarkHint', 'Free plan videos include a watermark. Upgrade for watermark-free 1080p export.')}
                    </p>
                  )}

                  <div className="mt-4 flex flex-col gap-2">
                    <Button onClick={handleDownload} className="w-full">
                      <Download className="h-4 w-4" />
                      {tr('aiVideo.download', 'Download MP4')}
                    </Button>
                    <Button variant="outline" onClick={handleGenerate} className="w-full">
                      <RefreshCw className="h-4 w-4" />
                      {tr('aiVideo.regenerate', 'Regenerate')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* 积分不足 */}
      <InsufficientCreditsDialog
        open={creditsOpen}
        onOpenChange={setCreditsOpen}
        currentBalance={balance}
        requiredCredits={AI_VIDEO_COST}
      />

      {/* 导出即付费墙：免费用户下载拦截 */}
      <InsufficientCreditsDialog
        open={exportPaywallOpen}
        onOpenChange={setExportPaywallOpen}
        reason="export"
        currentBalance={balance}
        requiredCredits={AI_VIDEO_COST}
      />
    </div>
  );
}
