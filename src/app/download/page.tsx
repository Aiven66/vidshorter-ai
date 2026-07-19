'use client';

import { useState, useEffect } from 'react';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Download, Apple, Cpu, Shield, Zap, CheckCircle2, Loader2,
  Monitor, Terminal, Package, Smartphone,
} from 'lucide-react';

interface PlatformAsset {
  name: string;
  url: string;
  size: number;
  downloadCount: number;
}

interface DownloadInfo {
  version: string;
  mac: PlatformAsset | null;
  windows: PlatformAsset | null;
  android: PlatformAsset | null;
  publishedAt: string;
  releaseUrl: string;
  releaseNotes: string;
}

function formatSize(bytes: number): string {
  if (!bytes) return 'Unknown';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatDate(dateString: string, locale: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US';
  return date.toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' });
}

type Platform = 'mac' | 'windows' | 'android';

export default function DownloadPage() {
  const { locale } = useLocale();
  const [info, setInfo] = useState<DownloadInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<Platform>('mac');

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
    { icon: Zap, title: isZh ? '本地加速处理' : 'Native Fast Processing', desc: isZh ? '利用本地 CPU/GPU 加速视频处理，无需上传到云端' : 'Leverage your CPU/GPU for faster video processing without cloud uploads' },
    { icon: Shield, title: isZh ? '隐私优先' : 'Privacy First', desc: isZh ? '视频文件在本地处理，不会上传到服务器' : 'Video files are processed locally and never uploaded to servers' },
    { icon: Monitor, title: isZh ? '稳定 YouTube 下载' : 'Stable YouTube Download', desc: isZh ? '绕过云端 IP 限制，直接从浏览器下载 YouTube 视频' : 'Bypass cloud IP restrictions and download YouTube videos directly from your browser' },
    { icon: Cpu, title: isZh ? '离线可用' : 'Offline Capable', desc: isZh ? '本地 Agent 运行时无需依赖网络连接' : 'Local Agent runs without requiring constant network connectivity' },
  ];

  const macSteps = [
    { icon: Download, title: isZh ? '1. 下载安装包' : '1. Download the installer', desc: isZh ? '点击下载按钮保存 .dmg 文件到本地' : 'Click the download button to save the .dmg file' },
    { icon: Package, title: isZh ? '2. 打开安装包' : '2. Open the installer', desc: isZh ? '双击下载的 .dmg 文件，将 Clipop Agent 拖到 Applications 文件夹' : 'Double-click the downloaded .dmg file, drag Clipop Agent to Applications' },
    { icon: Terminal, title: isZh ? '3. 启动应用' : '3. Launch the app', desc: isZh ? '从启动台或 Applications 文件夹打开 Clipop Agent' : 'Open Clipop Agent from Launchpad or Applications folder' },
    { icon: CheckCircle2, title: isZh ? '4. 开始使用' : '4. Start using', desc: isZh ? '在网页端选择"使用本地 Agent"即可开始处理视频' : 'Select "Use local Agent" on the web app to start processing videos' },
  ];

  const windowsSteps = [
    { icon: Download, title: isZh ? '1. 下载安装包' : '1. Download the installer', desc: isZh ? '点击下载按钮保存 .exe 文件到本地' : 'Click the download button to save the .exe file' },
    { icon: Package, title: isZh ? '2. 运行安装程序' : '2. Run the installer', desc: isZh ? '双击下载的 .exe 文件启动安装向导' : 'Double-click the downloaded .exe file to launch the setup wizard' },
    { icon: Terminal, title: isZh ? '3. 按提示安装' : '3. Follow the wizard', desc: isZh ? '按照安装向导提示完成安装过程' : 'Follow the installation wizard to complete the setup' },
    { icon: CheckCircle2, title: isZh ? '4. 启动使用' : '4. Launch and use', desc: isZh ? '从开始菜单打开 Clipop Agent，在网页端选择"使用本地 Agent"' : 'Open Clipop Agent from the Start menu, then select "Use local Agent" on the web app' },
  ];

  const androidSteps = [
    { icon: Download, title: isZh ? '1. 下载 APK' : '1. Download the APK', desc: isZh ? '点击下载按钮保存 .apk 文件到手机' : 'Tap the download button to save the .apk file on your phone' },
    { icon: Package, title: isZh ? '2. 允许安装未知来源' : '2. Allow unknown apps', desc: isZh ? '在系统设置中允许浏览器"安装未知应用"' : 'In Settings, allow your browser to "Install unknown apps"' },
    { icon: Terminal, title: isZh ? '3. 安装 APK' : '3. Install the APK', desc: isZh ? '点击通知栏的下载完成提示，按提示完成安装' : 'Tap the download-complete notification and follow the prompts to install' },
    { icon: CheckCircle2, title: isZh ? '4. 登录使用' : '4. Sign in and use', desc: isZh ? '打开 Clipop Agent，使用 Web 端账号登录即可' : 'Open Clipop Agent and sign in with your existing web account' },
  ];

  const steps = activePlatform === 'mac' ? macSteps : activePlatform === 'windows' ? windowsSteps : androidSteps;

  const macRequirements = [
    isZh ? 'macOS 12.0 (Monterey) 或更高版本' : 'macOS 12.0 (Monterey) or later',
    isZh ? 'Apple Silicon (M1/M2/M3) 或 Intel 处理器' : 'Apple Silicon (M1/M2/M3) or Intel processor',
    isZh ? '至少 4GB 可用内存' : 'At least 4GB available RAM',
    isZh ? '200MB 可用磁盘空间' : '200MB available disk space',
  ];

  const windowsRequirements = [
    isZh ? 'Windows 10/11 64-bit' : 'Windows 10/11 64-bit',
    isZh ? 'x64 架构处理器' : 'x64 architecture processor',
    isZh ? '至少 4GB 可用内存' : 'At least 4GB available RAM',
    isZh ? '200MB 可用磁盘空间' : '200MB available disk space',
  ];

  const androidRequirements = [
    isZh ? 'Android 7.0 (API 24) 或更高版本' : 'Android 7.0 (API 24) or later',
    isZh ? 'ARM64 / ARMv7 / x86_64 架构' : 'ARM64 / ARMv7 / x86_64 architecture',
    isZh ? '至少 2GB 可用内存' : 'At least 2GB available RAM',
    isZh ? '100MB 可用存储空间' : '100MB available storage space',
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Hero section */}
      <section className="border-b border-border bg-background">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="secondary" className="mb-4">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              {isZh ? '桌面客户端' : 'Desktop App'}
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {isZh ? '下载 Clipop Agent' : 'Download Clipop Agent'}
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              {isZh
                ? '支持 macOS、Windows 和 Android。安装本地客户端，享受更快的视频处理速度、稳定的 YouTube 下载和跨平台一致的体验。'
                : 'Available for macOS, Windows, and Android. Install the native client for faster video processing, stable YouTube downloads, and a consistent cross-platform experience.'}
            </p>

            {/* Download cards */}
            {loading ? (
              <Card className="max-w-2xl mx-auto">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center gap-3 py-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{isZh ? '获取最新版本...' : 'Fetching latest release...'}</p>
                  </div>
                </CardContent>
              </Card>
            ) : error ? (
              <Card className="max-w-2xl mx-auto">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center gap-3 py-4">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                      {isZh ? '重试' : 'Retry'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : info ? (
              <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
                {/* macOS card */}
                <Card>
                  <CardContent className="p-6 flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Apple className="h-8 w-8" />
                      <div className="text-left">
                        <div className="font-semibold text-lg">macOS</div>
                        <div className="text-xs text-muted-foreground">v{info.version}</div>
                      </div>
                    </div>

                    {info.publishedAt && (
                      <p className="text-xs text-muted-foreground">
                        {isZh ? '发布于 ' : 'Released '}{formatDate(info.publishedAt, locale)}
                        {info.mac && info.mac.size > 0 && ` · ${formatSize(info.mac.size)}`}
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {isZh ? '.dmg 安装包 · Apple Silicon / Intel' : '.dmg installer · Apple Silicon / Intel'}
                    </p>

                    {info.mac && info.mac.url ? (
                      <Button size="lg" className="w-full gap-2" asChild>
                        <a href={info.mac.url}>
                          <Download className="h-5 w-5" />
                          {isZh ? '下载 for macOS' : 'Download for macOS'}
                        </a>
                      </Button>
                    ) : (
                      <Button size="lg" className="w-full gap-2" variant="outline" disabled>
                        <Download className="h-5 w-5" />
                        {isZh ? '即将上线' : 'Coming soon'}
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
                  </CardContent>
                </Card>

                {/* Windows card */}
                <Card>
                  <CardContent className="p-6 flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-8 w-8" />
                      <div className="text-left">
                        <div className="font-semibold text-lg">Windows</div>
                        <div className="text-xs text-muted-foreground">v{info.version}</div>
                      </div>
                    </div>

                    {info.publishedAt && (
                      <p className="text-xs text-muted-foreground">
                        {isZh ? '发布于 ' : 'Released '}{formatDate(info.publishedAt, locale)}
                        {info.windows && info.windows.size > 0 && ` · ${formatSize(info.windows.size)}`}
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {isZh ? '.exe 安装包 · Windows 10/11 x64' : '.exe installer · Windows 10/11 x64'}
                    </p>

                    {info.windows && info.windows.url ? (
                      <Button size="lg" className="w-full gap-2" asChild>
                        <a href={info.windows.url}>
                          <Download className="h-5 w-5" />
                          {isZh ? '下载 for Windows' : 'Download for Windows'}
                        </a>
                      </Button>
                    ) : (
                      <Button size="lg" className="w-full gap-2" variant="outline" disabled>
                        <Download className="h-5 w-5" />
                        {isZh ? '即将上线' : 'Coming soon'}
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
                  </CardContent>
                </Card>

                {/* Android card */}
                <Card>
                  <CardContent className="p-6 flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-8 w-8" />
                      <div className="text-left">
                        <div className="font-semibold text-lg">Android</div>
                        <div className="text-xs text-muted-foreground">v{info.version}</div>
                      </div>
                    </div>

                    {info.publishedAt && (
                      <p className="text-xs text-muted-foreground">
                        {isZh ? '发布于 ' : 'Released '}{formatDate(info.publishedAt, locale)}
                        {info.android && info.android.size > 0 && ` · ${formatSize(info.android.size)}`}
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {isZh ? '.apk 安装包 · Android 7.0+ (API 24+)' : '.apk installer · Android 7.0+ (API 24+)'}
                    </p>

                    {info.android && info.android.url ? (
                      <Button size="lg" className="w-full gap-2" asChild>
                        <a href={info.android.url}>
                          <Download className="h-5 w-5" />
                          {isZh ? '下载 for Android' : 'Download for Android'}
                        </a>
                      </Button>
                    ) : (
                      <Button size="lg" className="w-full gap-2" variant="outline" disabled>
                        <Download className="h-5 w-5" />
                        {isZh ? '即将上线' : 'Coming soon'}
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
                  </CardContent>
                </Card>
              </div>
            ) : null}
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

      {/* Installation steps with platform tabs */}
      <section className="border-t border-border bg-background">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
              {isZh ? '安装步骤' : 'Installation Guide'}
            </h2>

            {/* Platform tab switcher */}
            <div className="flex justify-center mb-10">
              <div className="inline-flex rounded-lg border border-border bg-muted/50 p-1">
                <button
                  type="button"
                  onClick={() => setActivePlatform('mac')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activePlatform === 'mac'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Apple className="h-4 w-4" />
                  macOS
                </button>
                <button
                  type="button"
                  onClick={() => setActivePlatform('windows')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activePlatform === 'windows'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Monitor className="h-4 w-4" />
                  Windows
                </button>
                <button
                  type="button"
                  onClick={() => setActivePlatform('android')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activePlatform === 'android'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Smartphone className="h-4 w-4" />
                  Android
                </button>
              </div>
            </div>

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

      {/* Requirements - dual column */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
            {isZh ? '系统要求' : 'System Requirements'}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Apple className="h-5 w-5" />
                  macOS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {macRequirements.map((req) => (
                  <div key={req} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span>{req}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  Windows
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {windowsRequirements.map((req) => (
                  <div key={req} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span>{req}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Android
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {androidRequirements.map((req) => (
                  <div key={req} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span>{req}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
