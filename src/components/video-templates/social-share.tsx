'use client';

import { useState } from 'react';
import { Twitter, Instagram, Youtube, Facebook, Link2, Check, Share2, Download } from 'lucide-react';

interface SocialShareProps {
  videoUrl: string | null;
  videoTitle?: string;
  format?: 'mp4' | 'webm';
}

/**
 * Social media share component for exported videos.
 * Supports Twitter, Instagram, TikTok (via Facebook), YouTube, and copy link.
 */
export function SocialShare({ videoUrl, videoTitle = 'My AI Video', format = 'mp4' }: SocialShareProps) {
  const [copied, setCopied] = useState(false);

  if (!videoUrl) return null;

  const shareText = `${videoTitle} — Made with Clipop AI`;
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent('https://clipop.ai');

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(videoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = videoUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTwitterShare = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      '_blank',
      'noopener,noreferrer,width=600,height=480',
    );
  };

  const handleFacebookShare = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
      '_blank',
      'noopener,noreferrer,width=600,height=480',
    );
  };

  const handleInstagramShare = () => {
    // Instagram doesn't support web URL sharing directly — download the video
    // and redirect to Instagram with instructions
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `clipop-instagram.${format}`;
    a.click();
    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
  };

  const handleTiktokShare = () => {
    // TikTok doesn't have a web share API — download the video for manual upload
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `clipop-tiktok.${format}`;
    a.click();
    window.open('https://www.tiktok.com/upload', '_blank', 'noopener,noreferrer');
  };

  const handleYoutubeShare = () => {
    // YouTube Studio upload
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `clipop-youtube.${format}`;
    a.click();
    window.open('https://studio.youtube.com/channel/UC/videos/upload', '_blank', 'noopener,noreferrer');
  };

  const shareButtons = [
    {
      name: 'Twitter / X',
      icon: Twitter,
      onClick: handleTwitterShare,
      color: '#000000',
      bg: 'hover:bg-black/10 dark:hover:bg-white/10',
    },
    {
      name: 'Instagram',
      icon: Instagram,
      onClick: handleInstagramShare,
      color: '#E1306C',
      bg: 'hover:bg-pink-500/10',
    },
    {
      name: 'TikTok',
      icon: Share2,
      onClick: handleTiktokShare,
      color: '#000000',
      bg: 'hover:bg-black/10 dark:hover:bg-white/10',
    },
    {
      name: 'YouTube',
      icon: Youtube,
      color: '#FF0000',
      bg: 'hover:bg-red-500/10',
      onClick: handleYoutubeShare,
    },
    {
      name: 'Facebook',
      icon: Facebook,
      onClick: handleFacebookShare,
      color: '#1877F2',
      bg: 'hover:bg-blue-500/10',
    },
  ];

  return (
    <div className="mt-4 rounded-xl border border-border bg-card/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Share2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Share to Social Media</h3>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {shareButtons.map((btn) => {
          const Icon = btn.icon;
          return (
            <button
              key={btn.name}
              onClick={btn.onClick}
              title={`Share to ${btn.name}`}
              className={`group flex flex-col items-center gap-1.5 rounded-lg p-2 transition-all ${btn.bg}`}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full transition-transform group-hover:scale-110"
                style={{ color: btn.color }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground">
                {btn.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Copy link */}
      <button
        onClick={handleCopyLink}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-green-500" />
            <span className="text-green-500">Link Copied!</span>
          </>
        ) : (
          <>
            <Link2 className="h-3.5 w-3.5" />
            <span>Copy Video Link</span>
          </>
        )}
      </button>

      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Instagram / TikTok / YouTube: video downloads for manual upload
      </p>
    </div>
  );
}

export default SocialShare;
