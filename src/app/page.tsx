import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Film, Zap, Video, Scissors, Download } from 'lucide-react';
import VideoProcessor from '@/components/home/video-processor';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/30">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-32 h-96 w-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-32 h-96 w-96 bg-primary/5 rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-4 py-12 md:py-20">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <Badge variant="outline" className="mb-4 px-4 py-1.5 text-sm">
                <Sparkles className="h-4 w-4 mr-2 text-primary" />
                AI-Powered Video Processing
              </Badge>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                Transform Long Videos into Viral Shorts
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                AI-powered video clipping that extracts the best moments from your long-form content automatically
              </p>
            </div>

            <VideoProcessor />
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">Powerful AI Video Clipping</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { Icon: Sparkles, title: 'Auto Highlight Detection', desc: 'AI analyzes your video and identifies the most engaging moments automatically' },
              { Icon: Film, title: 'Multi-Platform Support', desc: 'Import from YouTube, Bilibili, or upload your own video files' },
              { Icon: Zap, title: 'Quick Export', desc: 'Download your clips in multiple formats, ready for any social platform' },
            ].map(({ Icon, title, desc }) => (
              <Card key={title} className="border-0 shadow-lg">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent><CardDescription className="text-base">{desc}</CardDescription></CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { step: '1', title: 'Input Video', desc: 'Paste URL or upload your video', icon: Video },
              { step: '2', title: 'AI Analysis', desc: 'AI detects highlights automatically', icon: Sparkles },
              { step: '3', title: 'Generate Clips', desc: 'Short videos are created', icon: Scissors },
              { step: '4', title: 'Download', desc: 'Export and share anywhere', icon: Download },
            ].map(item => (
              <div key={item.step} className="text-center">
                <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
