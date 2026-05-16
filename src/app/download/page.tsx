import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DownloadPage() {
  const macUrl = process.env.NEXT_PUBLIC_MAC_AGENT_DOWNLOAD_URL || process.env.MAC_AGENT_DMG_URL || '';

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-center">
          <CardTitle>Download VidShorter Agent</CardTitle>
          <CardDescription>Desktop app for stable YouTube/Bilibili processing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {macUrl ? (
            <Button asChild className="w-full">
              <a href={macUrl}>Download for macOS (Apple Silicon)</a>
            </Button>
          ) : (
            <div className="text-sm text-muted-foreground text-center">
              Download link not configured
            </div>
          )}

          <div className="text-xs text-muted-foreground text-center">
            If you already have the app installed, open it from Applications.
          </div>

          <div className="text-sm text-center">
            <Link className="text-primary hover:underline" href="/">
              Back to Home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

