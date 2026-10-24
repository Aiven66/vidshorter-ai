/**
 * 客户端下载「唯一事实源」。
 *
 * 背景：旧下载页指向 `download.clipopai.com`，该子域**从未配置 DNS**（NXDOMAIN），
 * 三个平台的按钮全部打不开，且页面标注的 2.1.0 / 2.0.5 安装包在任何发布渠道都不存在。
 *
 * 现在的口径：
 *   1. 安装包只以 GitHub Release 资产为准（当前实际可用版本见 `RELEASE_TAG`）；
 *   2. 页面按钮统一走本站 `/api/download/<platform>`，由服务端解析最新资产并回源，
 *      这样外网/受限网络下仍能通过 www.clipopai.com 下载，也便于以后换 CDN；
 *   3. 每个平台保留 `fallbackUrl`（GitHub 原始地址），用于排查问题时直接核对。
 */

export type DownloadPlatform = 'windows' | 'macos' | 'android';

export interface DownloadArtifact {
  platform: DownloadPlatform;
  label: string;
  /** 实际可下载到的版本 */
  version: string;
  /** 安装包体积（MB，取最近一次发布实测值） */
  sizeMb: number;
  /** 资产文件名（GitHub Release asset name） */
  fileName: string;
  /** 所在 release tag */
  releaseTag: string;
  /** 运行环境描述 */
  requirement: string;
  /** 直连 GitHub 的原始地址（主下载源，资源托管在 GitHub Releases） */
  fallbackUrl: string;
  /** 该平台的 GitHub Release 页面（可查看更新日志） */
  releaseUrl: string;
}

export const GITHUB_REPO = 'Aiven66/vidshorter-ai';

function assetUrl(tag: string, file: string): string {
  return `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${file}`;
}

function releaseUrl(tag: string): string {
  return `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`;
}

const MAC_FILE = 'Clipop.Agent-0.9.30-arm64.dmg';
const WIN_FILE = 'Clipop.Agent.Setup.0.9.30.exe';
const ANDROID_FILE = 'clipop-agent-0.9.30-android.apk';

export const DOWNLOAD_ARTIFACTS: Record<DownloadPlatform, DownloadArtifact> = {
  windows: {
    platform: 'windows',
    label: 'Windows',
    version: 'v0.9.30',
    sizeMb: 93.7,
    fileName: WIN_FILE,
    releaseTag: 'win-0.9.30',
    requirement: 'Windows 10/11 · 64-bit',
    fallbackUrl: assetUrl('win-0.9.30', WIN_FILE),
    releaseUrl: releaseUrl('win-0.9.30'),
  },
  macos: {
    platform: 'macos',
    label: 'macOS',
    version: 'v0.9.30',
    sizeMb: 198.7,
    fileName: MAC_FILE,
    releaseTag: '0.9.30',
    // 目前只发布了 arm64 包；Intel 机器请走 Rosetta 或等待 x64 构建
    requirement: 'macOS 11.0+ · Apple Silicon (arm64)',
    fallbackUrl: assetUrl('0.9.30', MAC_FILE),
    releaseUrl: releaseUrl('0.9.30'),
  },
  android: {
    platform: 'android',
    label: 'Android',
    version: 'v0.9.30',
    sizeMb: 4.5,
    fileName: ANDROID_FILE,
    releaseTag: 'android-0.9.30',
    requirement: 'Android 8.0+ · arm64',
    fallbackUrl: assetUrl('android-0.9.30', ANDROID_FILE),
    releaseUrl: releaseUrl('android-0.9.30'),
  },
};

export const DOWNLOAD_PLATFORMS: DownloadPlatform[] = ['windows', 'macos', 'android'];

export function isDownloadPlatform(value: string): value is DownloadPlatform {
  return (DOWNLOAD_PLATFORMS as string[]).includes(value);
}

/** 每个平台对应的资产名匹配规则（用于解析「最新」release）。 */
export const PLATFORM_ASSET_PATTERN: Record<DownloadPlatform, RegExp> = {
  windows: /Setup.*\.exe$/i,
  macos: /\.dmg$/i,
  android: /\.apk$/i,
};
