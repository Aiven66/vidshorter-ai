'use client';

import { useState, useEffect } from 'react';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Download, Apple, Cpu, Shield, Zap, CheckCircle2, Loader2,
  ExternalLink, Monitor, Terminal, Package,
} from 'lucide-react';

interface DownloadInfo {
  available: boolean;
  version: string;
  name: string;
  publishedAt: string;
  dmgUrl: string;
  dmgSize: number;
  releaseUrl: string;
  releaseNotes: string;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function formatDate(dateString: string, locale: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US';
  return date.toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function DownloadPage() {
  const { t, locale } = useLocale();
  const [info, setInfo] = useState<DownloadInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/download/latest');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as DownloadInfo;
        if (!cancelled) {
          setInfo(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to fetch download info');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isZh = locale === 'zh';

  const features = [
    { icon: Zap, title: isZh ? '本地加速处理' : 'Native Fast Processing', desc: isZh ? '利用 Mac 本地 CPU/GPU 加速视频处理，无需上传到云端' : 'Leverage your Mac\'s CPU/GPU for faster video processing without cloud uploads' },
    { icon: Shield, title: isZh ? '隐私优先' : 'Privacy First', desc: isZh ? '视频文件在本地处理，不会上传到服务器' : 'Video files are processed locally and never uploaded to servers' },
    { icon: Monitor, title: isZh ? '稳定 YouTube 下载' : 'Stable YouTube Download', desc: isZh ? '绕过云端 IP 限制，直接从浏览器下载 YouTube 视频' : 'Bypass cloud IP restrictions and download YouTube videos directly from your browser' },
    { icon: Cpu, title: isZh ? '离线可用' : 'Offline Capable', desc: isZh ? '本地 Agent 运行时无需依赖网络连接' : 'Local Agent runs without requiring constant network connectivity' },
  ];

  const steps = [
    { icon: Download, title: isZh ? '1. 下载安装包' : '1. Download the installer', desc: isZh ? '点击下载按钮保存 .dmg 文件到本地' : 'Click the download button to save the .dmg file' },
    { icon: Package, title: isZh ? '2. 打开安装包' : '2. Open the installer', desc: isZh ? '双击下载的 .dmg 文件，将 Clipop Agent 拖到 Applications 文件夹' : 'Double-click the downloaded .dmg file, drag Clipop Agent to Applications' },
    { icon: Terminal, title: isZh ? '3. 启动应用' : '3. Launch the app', desc: isZh ? '从启动台或 Applications 文件夹打开 Clipop Agent' : 'Open Clipop Agent from Launchpad or Applications folder' },
    { icon: CheckCircle2, title: isZh ? '4. 开始使用' : '4. Start using', desc: isZh ? '在网页端选择"使用本地 Agent"即可开始处理视频' : 'Select "Use local Mac Agent" on the web app to start processing videos' },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Hero section */}
      <section className="border-b border-border bg-background">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="secondary" className="mb-4">
              <Apple className="h-3.5 w-3.5 mr-1.5" />
              macOS Desktop App
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {isZh ? '下载 Clipop AI 桌面客户端' : 'Download Clipop AI Desktop App'}
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              {isZh
                ? '安装本地桌面客户端，享受更快的视频处理速度、稳定的 YouTube 下载和隐私优先的本地处理体验。'
                : 'Install the native desktop client for faster video processing, stable YouTube downloads, and privacy-first local processing.'}
            </p>

            {/* Download card */}
            <Card className="max-w-md mx-auto">
              <CardContent className="p-6">
                {loading ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{isZh ? '获取最新版本...' : 'Fetching latest release...'}</p>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                      {isZh ? '重试' : 'Retry'}
                    </Button>
                  </div>
                ) : info ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Apple className="h-8 w-8" />
                      <div className="text-left">
                        <div className="font-semibold text-lg">Clipop Agent</div>
                        <div className="text-xs text-muted-foreground">v{info.version}</div>
                      </div>
                    </div>

                    {info.publishedAt && (
                      <p className="text-xs text-muted-foreground">
                        {isZh ? '发布于 ' : 'Released '}{formatDate(info.publishedAt, locale)}
                        {info.dmgSize > 0 && ` · ${formatFileSize(info.dmgSize)}`}
                      </p>
                    )}

                    {info.available && info.dmgUrl ? (
                      <Button size="lg" className="w-full gap-2" asChild>
                        <a href={info.dmgUrl}>
                          <Download className="h-5 w-5" />
                          {isZh ? '下载 for macOS' : 'Download for macOS'}
                        </a>
                      </Button>
                    ) : (
                      <Button size="lg" className="w-full gap-2" variant="outline" asChild>
                        <a href={info.releaseUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-5 w-5" />
                          {isZh ? '查看发布页面' : 'View Release Page'}
                        </a>
                      </Button>
                    )}

                    <a
                      href={info.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isZh ? '查看发布说明' : 'View release notes'}
                    </a>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features section */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            {isZh ? '为什么使用桌面客户端？' : 'Why use the desktop app?'}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardContent className="p-6 flex gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Installation steps */}
      <section className="border-t border-border bg-background">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
              {isZh ? '安装步骤' : 'Installation Guide'}
            </h2>
            <div className="space-y-6">
              {steps.map((step) => (
                <div key={step.title} className="flex gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="pt-1.5">
                    <h3 className="font-semibold mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isZh ? '系统要求' : 'System Requirements'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>{isZh ? 'macOS 12.0 (Monterey) 或更高版本' : 'macOS 12.0 (Monterey) or later'}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>{isZh ? 'Apple Silicon (M1/M2/M3) 或 Intel 处理器' : 'Apple Silicon (M1/M2/M3) or Intel processor'}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>{isZh ? '至少 4GB 可用内存' : 'At least 4GB available RAM'}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>{isZh ? '200MB 可用磁盘空间' : '200MB available disk space'}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
