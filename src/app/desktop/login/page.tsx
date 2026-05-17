'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/locale-context';
import { useRouter } from 'next/navigation';
import { Video, ExternalLink, ArrowLeft, RefreshCw, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function DesktopLoginPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const desktopToken = await window.clipopDesktop?.getAuthToken?.();
        if (desktopToken) {
          window.dispatchEvent(new Event('clipop-auth-change'));
          window.location.href = '/';
          return;
        }

        const response = await fetch('https://clipopai.vercel.app/api/check-login', {
          credentials: 'include',
          mode: 'cors'
        });
        const data = await response.json();
        if (data.loggedIn) {
          window.location.href = '/';
          return;
        }
      } catch (e) {
        console.log('Check login failed:', e);
      } finally {
        setChecking(false);
      }
    };
    checkLoginStatus();
  }, []);

  const handleOpenWebLogin = async () => {
    setRedirecting(true);
    if (typeof window.clipopDesktop !== 'undefined' && window.clipopDesktop.openWebLogin) {
      await window.clipopDesktop.openWebLogin();
    } else if (typeof window.agent !== 'undefined' && window.agent.openWebLogin) {
      await window.agent.openWebLogin();
    } else {
      window.open('https://clipopai.vercel.app/login?from=desktop', '_blank');
    }
    setTimeout(() => {
      window.location.href = '/';
    }, 5000);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 font-bold text-xl mb-4">
              <Video className="h-6 w-6 text-primary" />
              <span>Clipop AI</span>
            </div>
            <CardTitle>Checking login status...</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 font-bold text-xl mb-4">
              <Video className="h-6 w-6 text-primary" />
              <span>Clipop AI</span>
            </div>
            <CardTitle>Opening web login...</CardTitle>
            <CardDescription>Please complete login in your browser</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              After logging in, click &quot;Return to Clipop Agent&quot; in your browser
            </p>
            <Button 
              variant="outline" 
              onClick={() => { setRedirecting(false); window.location.reload(); }}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 font-bold text-xl mb-4">
            <Video className="h-6 w-6 text-primary" />
            <span>Clipop AI</span>
          </div>
          <CardTitle>{t('auth.login.title')}</CardTitle>
          <CardDescription>{t('auth.login.subtitle')}</CardDescription>
        </CardHeader>

        <CardContent>
          <Button
            variant="default"
            className="w-full mb-6"
            onClick={handleOpenWebLogin}
            size="lg"
          >
            <ExternalLink className="h-5 w-5 mr-2" />
            Continue with Web Account
          </Button>

          <div className="bg-muted rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground text-center">
              For security reasons, please log in through our web platform. 
              After login, click &quot;Return to Clipop Agent&quot; to sync your account.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-6">
            <RefreshCw 
              className="h-4 w-4 cursor-pointer hover:text-primary transition-colors" 
              onClick={() => window.location.reload()}
            />
            <span className="cursor-pointer hover:text-primary transition-colors" onClick={() => window.location.reload()}>
              Refresh login status
            </span>
          </div>

          <Button 
            variant="ghost" 
            className="w-full" 
            onClick={() => router.push('/')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
