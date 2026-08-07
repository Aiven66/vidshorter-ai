'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle, Copy, Gift, Loader2, RefreshCw, Share2, Users, X, MessageCircle, Send,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { posthog } from '@/lib/posthog';

interface ReferralDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface ReferralData {
  referralLink: string;
  referralCode: string;
  referralCount: number;
  maxReferrals: number;
  limitReached: boolean;
  rewardPerReferral: number;
}

export function ReferralDialog({ open, onOpenChange }: ReferralDialogProps) {
  const { user, accessToken } = useAuth();
  const { t } = useLocale();

  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const fetchReferralLink = useCallback(async () => {
    if (!accessToken) {
      setError(t('referral.loadFailed'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/referral/link', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const json = await res.json();
      setData({
        referralLink: json.referralLink,
        referralCode: json.referralCode,
        referralCount: json.referralCount ?? 0,
        maxReferrals: json.maxReferrals ?? 5,
        limitReached: !!json.limitReached,
        rewardPerReferral: json.rewardPerReferral ?? 100,
      });
    } catch (err) {
      console.error('[ReferralDialog] fetch link failed:', err);
      setError(t('referral.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => {
    if (open && user) {
      fetchReferralLink();
      setCopied(false);
      setCopyFailed(false);
    } else if (!open) {
      // Reset state when dialog closes
      setTimeout(() => {
        setData(null);
        setError('');
        setCopied(false);
        setCopyFailed(false);
      }, 200);
    }
  }, [open, user, fetchReferralLink]);

  const handleCopy = useCallback(async () => {
    if (!data?.referralLink) return;

    // Track share intent
    if (posthog) {
      posthog.capture('referral_link_copied', {
        referral_code: data.referralCode,
      });
    }

    try {
      // Modern clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(data.referralLink);
        setCopied(true);
        setCopyFailed(false);
        setTimeout(() => setCopied(false), 2500);
        return;
      }

      // Fallback: legacy execCommand for non-secure contexts (e.g. http desktop flow)
      const textarea = document.createElement('textarea');
      textarea.value = data.referralLink;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (ok) {
        setCopied(true);
        setCopyFailed(false);
        setTimeout(() => setCopied(false), 2500);
      } else {
        setCopyFailed(true);
        setCopied(false);
      }
    } catch (err) {
      console.error('[ReferralDialog] copy failed:', err);
      setCopyFailed(true);
      setCopied(false);
    }
  }, [data, posthog]);

  const handleShare = useCallback(async (channel: 'native' | 'twitter' | 'whatsapp' | 'telegram') => {
    if (!data?.referralLink) return;

    if (posthog) {
      posthog.capture('referral_link_shared', {
        channel,
        referral_code: data.referralCode,
      });
    }

    const shareText = t('referral.title');
    const fullText = `${shareText} ${data.referralLink}`;

    if (channel === 'native' && typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: t('referral.title'),
          text: shareText,
          url: data.referralLink,
        });
      } catch (err) {
        // User cancelled — no action needed
      }
      return;
    }

    let url = '';
    if (channel === 'twitter') {
      url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(data.referralLink)}`;
    } else if (channel === 'whatsapp') {
      url = `https://wa.me/?text=${encodeURIComponent(fullText)}`;
    } else if (channel === 'telegram') {
      url = `https://t.me/share/url?url=${encodeURIComponent(data.referralLink)}&text=${encodeURIComponent(shareText)}`;
    }

    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer,width=600,height=480');
    }
  }, [data, t, posthog]);

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="mx-auto mb-2 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Gift className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">{t('referral.title')}</DialogTitle>
          <DialogDescription className="text-center text-sm leading-relaxed">
            {t('referral.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
              <Users className="h-3.5 w-3.5" />
              {t('referral.statsLabel')}
            </div>
            <div className="text-2xl font-bold">
              {loading ? '…' : (
                <span className="tabular-nums">
                  {data?.referralCount ?? 0}
                  <span className="text-base text-muted-foreground">
                    /{data?.maxReferrals ?? 5}
                  </span>
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {t('referral.friendsUnit')}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
              <Gift className="h-3.5 w-3.5" />
              {t('referral.rewardPerInvite')}
            </div>
            <div className="text-2xl font-bold text-primary">
              {loading ? '…' : (data?.rewardPerReferral ?? 100)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {t('referral.creditsUnit')}
            </div>
          </div>
        </div>

        {/* Progress bar toward 5-friend cap */}
        {!loading && !error && data && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>{t('referral.progressLabel')}</span>
              <span className="tabular-nums">
                {data.referralCount}/{data.maxReferrals}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  data.limitReached ? 'bg-emerald-500' : 'bg-primary'
                }`}
                style={{
                  width: `${Math.min(100, (data.referralCount / Math.max(1, data.maxReferrals)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Limit-reached banner */}
        {!loading && !error && data?.limitReached && (
          <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
              {t('referral.limitReachedDesc')}
            </p>
          </div>
        )}

        {/* Invite link */}
        <div className="space-y-2 mt-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t('referral.inviteLinkLabel')}
          </label>

          {loading ? (
            <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/30 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('referral.loadingLink')}
            </div>
          ) : error ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">
                <X className="h-4 w-4" />
                <span className="truncate">{error}</span>
              </div>
              <Button variant="outline" size="sm" onClick={fetchReferralLink} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('referral.refresh')}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={data?.referralLink || ''}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 font-mono text-xs"
                aria-label={t('referral.inviteLinkLabel')}
              />
              <Button
                onClick={handleCopy}
                size="sm"
                disabled={data?.limitReached}
                className={copied ? 'bg-green-600 hover:bg-green-600' : ''}
              >
                {copied ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1.5" />
                    {t('referral.copied')}
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1.5" />
                    {t('referral.copyLink')}
                  </>
                )}
              </Button>
            </div>
          )}

          {copyFailed && (
            <p className="text-xs text-destructive">{t('referral.copyFailed')}</p>
          )}
        </div>

        {/* Share buttons */}
        {!loading && !error && data && (
          <div className="mt-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">{t('referral.shareLabel')}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {hasNativeShare && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShare('native')}
                  disabled={data.limitReached}
                  className="flex flex-col items-center gap-1 h-auto py-2"
                  title="Share"
                >
                  <Share2 className="h-4 w-4" />
                  <span className="text-[10px]">Share</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleShare('twitter')}
                disabled={data.limitReached}
                className="flex flex-col items-center gap-1 h-auto py-2"
                title="X (Twitter)"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="text-[10px]">X</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleShare('whatsapp')}
                disabled={data.limitReached}
                className="flex flex-col items-center gap-1 h-auto py-2"
                title="WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="text-[10px]">WhatsApp</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleShare('telegram')}
                disabled={data.limitReached}
                className="flex flex-col items-center gap-1 h-auto py-2"
                title="Telegram"
              >
                <Send className="h-4 w-4" />
                <span className="text-[10px]">Telegram</span>
              </Button>
            </div>
          </div>
        )}

        {/* Footnote: friend's reward */}
        {!loading && !error && data && (
          <div className="mt-2 rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-start gap-2">
            <Gift className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <Badge variant="secondary" className="mr-1 text-[10px] py-0 px-1.5">+{data.rewardPerReferral}</Badge>
              {t('referral.subtitle')}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
