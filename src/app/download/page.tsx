'use client';

import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { Download, Monitor, Apple, Smartphone, Check, Shield, Zap, Globe } from 'lucide-react';
import Link from 'next/link';
import { DOWNLOAD_ARTIFACTS, type DownloadPlatform } from '@/lib/download-manifest';

export default function DownloadPage() {
  const { t, locale } = useLocale();

  const tr = (key: string) => {
    const s = t(key);
    return s === key ? '' : s;
  };

  const platforms: Array<{
    key: DownloadPlatform;
    icon: typeof Monitor;
    name: string;
    desc: string;
    features: string[];
  }> = [
    {
      key: 'windows',
      icon: Monitor,
      name: 'Windows',
      desc: tr('download.windowsDesc') || 'Windows 10/11 (64-bit)',
      features: ['GPU 加速视频处理', '本地字幕解析', '批量短视频导出'],
    },
    {
      key: 'macos',
      icon: Apple,
      name: 'macOS',
      desc: tr('download.macDesc') || 'macOS 11.0+',
      features: ['Apple Silicon 原生支持', 'M 系列芯片优化', '快捷键全局启动'],
    },
    {
      key: 'android',
      icon: Smartphone,
      name: 'Android',
      desc: tr('download.androidDesc') || 'Android 8.0+',
      features: ['移动端快速剪辑', '一键分享社交', '离线 AI 分析'],
    },
  ];

  const advantages = [
    {
      icon: Zap,
      title: tr('download.advantageFastTitle') || '极速处理',
      desc: tr('download.advantageFastDesc') || '本地 GPU 加速，比云端快 3 倍',
    },
    {
      icon: Shield,
      title: tr('download.advantagePrivacyTitle') || '隐私保护',
      desc: tr('download.advantagePrivacyDesc') || '视频不上传服务器，全程本地处理',
    },
    {
      icon: Globe,
      title: tr('download.advantageOfflineTitle') || '离线可用',
      desc: tr('download.advantageOfflineDesc') || '无需网络，随时随地创作',
    },
  ];

  // 功能分层：明确哪些功能网页端即可、哪些仅桌面端、哪些桌面端体验更好
  const layers = [
    {
      icon: Globe,
      title: tr('download.layerWebTitle') || '网页端即可',
      desc: tr('download.layerWebDesc') || '无需安装，打开即用。',
      items: [
        tr('download.layerWebItem1') || '云端高光剪辑',
        tr('download.layerWebItem2') || '云端数字人 / AI 成片',
        tr('download.layerWebItem3') || '账号、博客、定价、管理后台',
      ],
    },
    {
      icon: Monitor,
      title: tr('download.layerDesktopTitle') || '仅桌面端',
      desc: tr('download.layerDesktopDesc') || '依赖原生桥的本地算力功能。',
      items: [
        tr('download.layerDesktopItem1') || '本地 AI 引擎（离线转写）',
        tr('download.layerDesktopItem2') || '高光规则与本地切片',
        tr('download.layerDesktopItem3') || '真人级数字人引擎',
      ],
    },
    {
      icon: Zap,
      title: tr('download.layerBothTitle') || '两端都有，桌面更强',
      desc: tr('download.layerBothDesc') || '同一功能本机处理，更快也更私密。',
      items: [
        tr('download.layerBothItem1') || '高光剪辑走本地管线',
        tr('download.layerBothItem2') || '无需上传，无需云端排队',
        tr('download.layerBothItem3') || '本地下载绕过防盗链限制',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="relative container mx-auto px-4 py-12 md:py-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <Download className="h-3.5 w-3.5" />
            {tr('download.badge') || 'Desktop & Mobile'}
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mb-4">
            {tr('download.title') || '下载 Clipop AI 客户端'}
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
            {tr('download.subtitle') ||
              '在桌面端和移动端享受更强大的 AI 视频剪辑体验，本地加速、隐私保护、离线可用。'}
          </p>
        </div>
      </section>

      {/* 下载卡片 */}
      <section className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {platforms.map((p) => {
            const Icon = p.icon;
            const artifact = DOWNLOAD_ARTIFACTS[p.key];
            return (
              <div
                key={p.name}
                className="group bg-background border border-border rounded-2xl p-6 hover:shadow-lg hover:border-primary/30 transition-all flex flex-col"
              >
                {/* 平台图标 */}
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4 group-hover:bg-primary/15 transition-colors">
                  <Icon className="h-8 w-8 text-primary" />
                </div>

                <h3 className="text-xl font-bold mb-1">{p.name}</h3>
                <p className="text-sm text-muted-foreground mb-1">{p.desc}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                  <span>{artifact.version}</span>
                  <span>·</span>
                  <span>{artifact.sizeMb} MB</span>
                </div>

                {/* 特性列表 */}
                <ul className="space-y-1.5 mb-6 flex-1">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* 下载按钮：安装包托管在 GitHub Releases，直连下载 */}
                <Button asChild size="lg" className="w-full">
                  <a href={artifact.fallbackUrl} download={artifact.fileName}>
                    <Download className="h-4 w-4 mr-2" />
                    {tr('download.btn') || '立即下载'}
                  </a>
                </Button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  {artifact.requirement}
                </p>
                <div className="mt-2 flex items-center justify-center gap-3 text-[11px]">
                  <a
                    href={`/api/download/${p.key}`}
                    className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    {locale === 'zh' ? '站内加速下载' : 'Mirror download'}
                  </a>
                  <span className="text-muted-foreground/40">·</span>
                  <a
                    href={artifact.releaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    {locale === 'zh' ? 'GitHub 发布页' : 'Release notes'}
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* iOS 提示 */}
        <div className="max-w-5xl mx-auto mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            {tr('download.iosHint') ||
              'iOS 版本正在开发中，敬请期待。'}
          </p>
        </div>

        {/* 下载说明：安装包托管在 GitHub Releases，本站镜像仅作加速/兜底 */}
        <div className="max-w-5xl mx-auto mt-8 rounded-lg border border-border bg-muted/20 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            {locale === 'zh'
              ? '安装包托管在 GitHub Releases（永久免费、可断点续传）。若 GitHub 被当前网络拦截或速度很慢，请点卡片下方的「站内加速下载」。'
              : 'Installers are hosted on GitHub Releases. If GitHub is blocked or slow on your network, use "Mirror download" under each card.'}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {locale === 'zh'
              ? 'macOS 目前仅提供 Apple Silicon (arm64) 安装包，Intel 机型暂不支持。'
              : 'macOS builds are Apple Silicon (arm64) only; Intel Macs are not supported yet.'}
          </p>
        </div>
      </section>

      {/* 优势 */}
      <section className="container mx-auto px-4 py-12 md:py-16 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">
            {tr('download.whyDesktop') || '为什么选择桌面端？'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {advantages.map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.title} className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 mb-4">
                    <Icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{a.title}</h3>
                  <p className="text-sm text-muted-foreground">{a.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 功能分层 */}
      <section className="container mx-auto px-4 py-12 md:py-16 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              {tr('download.layersTitle') || '哪些功能需要下载桌面端？'}
            </h2>
            <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
              {tr('download.layersSubtitle') ||
                '桌面客户端在本地运行同一套 Web 应用，并叠加一层原生桥，解锁本地 AI 引擎。'}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {layers.map((l) => {
              const Icon = l.icon;
              return (
                <div
                  key={l.title}
                  className="rounded-2xl border border-border p-6 flex flex-col"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 flex-shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg">{l.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">{l.desc}</p>
                  <ul className="space-y-1.5">
                    {l.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 系统要求 */}
      <section className="container mx-auto px-4 py-12 border-t border-border">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6 text-center">
            {tr('download.sysReq') || '系统要求'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-muted/30 rounded-lg p-4 text-center">
              <Monitor className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium text-sm">Windows 10/11</p>
              <p className="text-xs text-muted-foreground mt-1">64-bit · 4GB RAM</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4 text-center">
              <Apple className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium text-sm">macOS 11.0+</p>
              <p className="text-xs text-muted-foreground mt-1">Universal · 4GB RAM</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4 text-center">
              <Smartphone className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium text-sm">Android 8.0+</p>
              <p className="text-xs text-muted-foreground mt-1">ARM64 · 3GB RAM</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-12 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-3">
            {tr('download.ctaTitle') || '准备好开始了吗？'}
          </h2>
          <p className="text-muted-foreground mb-6">
            {tr('download.ctaDesc') || '下载客户端，或在网页端直接体验 AI 视频剪辑。'}
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button asChild size="lg">
              <Link href="/video-clips">
                <Zap className="h-4 w-4 mr-2" />
                {tr('download.tryWeb') || '网页端体验'}
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">
                {tr('download.viewPricing') || '查看定价'}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
