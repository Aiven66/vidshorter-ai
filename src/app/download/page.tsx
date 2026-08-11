'use client';

import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { Download, Monitor, Apple, Smartphone, Check, Shield, Zap, Globe } from 'lucide-react';
import Link from 'next/link';

export default function DownloadPage() {
  const { t } = useLocale();

  const tr = (key: string) => {
    const s = t(key);
    return s === key ? '' : s;
  };

  const platforms = [
    {
      icon: Monitor,
      name: 'Windows',
      version: 'v2.1.0',
      size: '85 MB',
      desc: tr('download.windowsDesc') || 'Windows 10/11 (64-bit)',
      href: 'https://download.clipopai.com/ClipopAI-Setup-2.1.0.exe',
      features: [
        'GPU 加速视频处理',
        '本地字幕解析',
        '批量短视频导出',
      ],
    },
    {
      icon: Apple,
      name: 'macOS',
      version: 'v2.1.0',
      size: '92 MB',
      desc: tr('download.macDesc') || 'macOS 11.0+ (Universal)',
      href: 'https://download.clipopai.com/ClipopAI-2.1.0.dmg',
      features: [
        'Apple Silicon 原生支持',
        'M 系列芯片优化',
        '快捷键全局启动',
      ],
    },
    {
      icon: Smartphone,
      name: 'Android',
      version: 'v2.0.5',
      size: '38 MB',
      desc: tr('download.androidDesc') || 'Android 8.0+',
      href: 'https://download.clipopai.com/ClipopAI-2.0.5.apk',
      features: [
        '移动端快速剪辑',
        '一键分享社交',
        '离线 AI 分析',
      ],
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
                  <span>{p.version}</span>
                  <span>·</span>
                  <span>{p.size}</span>
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

                {/* 下载按钮 */}
                <Button asChild size="lg" className="w-full">
                  <a href={p.href} download>
                    <Download className="h-4 w-4 mr-2" />
                    {tr('download.btn') || '立即下载'}
                  </a>
                </Button>
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
