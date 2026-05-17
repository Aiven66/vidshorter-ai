'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/locale-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Video, ExternalLink, ArrowLeft } from 'lucide-react';

export default function DesktopRegisterPage() {
  const { t } = useLocale();
  const router = useRouter();

  const handleOpenWebRegister = () => {
    window.location.href = 'https://clipopai.vercel.app/register?from=desktop';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 font-bold text-xl mb-4">
            <Video className="h-6 w-6 text-primary" />
            <span>Clipop AI</span>
          </div>
          <CardTitle>{t('auth.register.title')}</CardTitle>
          <CardDescription>{t('auth.register.subtitle')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Button
            variant="default"
            className="w-full"
            onClick={handleOpenWebRegister}
            size="lg"
          >
            <ExternalLink className="h-5 w-5 mr-2" />
            Continue with Web Account
          </Button>

          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm text-muted-foreground text-center">
              For security reasons, please register through our web platform. 
              Your account will be automatically synced to this desktop app after registration.
            </p>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/desktop/login" className="text-primary hover:underline">
              {t('auth.register.login')}
            </Link>
          </p>

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
