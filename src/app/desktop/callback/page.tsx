'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Monitor } from 'lucide-react';

function DesktopCallbackContent() {
  const sp = useSearchParams();
  const [opened, setOpened] = useState(false);

  const redirectUri = useMemo(() => sp.get('redirect_uri') || '', [sp]);
  const state = useMemo(() => sp.get('state') || '', [sp]);
  const email = useMemo(() => sp.get('email') || '', [sp]);
  const accessToken = useMemo(() => sp.get('access_token') || '', [sp]);

  const handleOpenDesktop = () => {
    if (!redirectUri) return;
    
    // 构建深度链接，包含 token
    const url = new URL(redirectUri);
    url.searchParams.set('state', state);
    if (accessToken) {
      url.searchParams.set('access_token', accessToken);
    }
    
    try {
      window.location.href = url.toString();
      setOpened(true);
    } catch (e) {
      console.error('Failed to open desktop', e);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Monitor className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">VidShorter Agent</CardTitle>
          <CardDescription>
            {opened ? 'Opening desktop app...' : 'Complete the sign-in process'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          {email && (
            <p className="text-sm text-foreground">
              Signed in as: <span className="font-medium">{email}</span>
            </p>
          )}
          
          {!opened ? (
            <div className="space-y-4">
              <Button 
                size="lg" 
                className="w-full" 
                onClick={handleOpenDesktop}
              >
                <Monitor className="w-4 h-4 mr-2" />
                Open VidShorter Agent
              </Button>
              <p className="text-xs text-muted-foreground">
                Click the button to return to the desktop app
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                If the desktop app didn&apos;t open, please open it manually.
              </p>
              <Button 
                size="lg" 
                variant="outline" 
                className="w-full" 
                onClick={handleOpenDesktop}
              >
                Try Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DesktopCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Monitor className="w-8 h-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">VidShorter Agent</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <DesktopCallbackContent />
    </Suspense>
  );
}
