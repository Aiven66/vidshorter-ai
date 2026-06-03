'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home, Zap, Sparkles, Play } from 'lucide-react';

export default function NotFound() {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; size: number; duration: number; delay: number }[]>([]);

  useEffect(() => {
    const newParticles = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 8 + 4,
      duration: Math.random() * 3 + 2,
      delay: Math.random() * 2,
    }));
    setParticles(newParticles);
  }, []);

  return (
    <section className="relative isolate flex min-h-[calc(100vh-8rem)] items-center justify-center overflow-hidden bg-gradient-to-br from-primary/5 via-background to-chart-1/10 px-4 py-12 text-foreground sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute rounded-full bg-primary/20 animate-bounce"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animationDuration: `${particle.duration}s`,
              animationDelay: `${particle.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="absolute left-[10%] top-20 w-32 h-32 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute right-[15%] bottom-20 w-48 h-48 rounded-full bg-chart-4/10 blur-3xl" />

      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <div className="relative mb-8 h-72 w-full max-w-lg">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse">
                <div className="h-40 w-40 rounded-full bg-primary/20 blur-2xl" />
              </div>
              
              <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-2 shadow-2xl">
                <div className="flex flex-col items-center">
                  <span className="text-6xl font-black text-white">4</span>
                  <Sparkles className="absolute -top-4 -right-4 h-8 w-8 text-yellow-300 animate-spin" />
                </div>
              </div>
              
              <div className="absolute -right-4 top-1/2 -translate-y-1/2">
                <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-chart-4 to-chart-5 shadow-2xl">
                  <div className="flex flex-col items-center">
                    <span className="text-6xl font-black text-white">0</span>
                    <Play className="absolute bottom-2 h-6 w-6 text-white/80" />
                  </div>
                </div>
              </div>
              
              <div className="absolute -left-4 top-1/2 -translate-y-1/2">
                <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-chart-3 to-chart-1 shadow-2xl">
                  <div className="flex flex-col items-center">
                    <span className="text-6xl font-black text-white">4</span>
                    <Zap className="absolute bottom-2 h-6 w-6 text-white/80" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute left-[20%] bottom-4 flex h-16 w-16 rotate-12 items-center justify-center rounded-2xl bg-card/80 shadow-xl ring-1 ring-border">
            <Play className="h-8 w-8 text-primary" />
          </div>
          <div className="absolute right-[22%] top-8 flex h-12 w-12 -rotate-12 items-center justify-center rounded-full bg-card/80 shadow-xl ring-1 ring-border">
            <Sparkles className="h-6 w-6 text-chart-3" />
          </div>
        </div>

        <h1 className="mt-4 text-5xl font-black tracking-tight text-foreground sm:text-6xl">
          Oops! Clip Lost
        </h1>
        <p className="mt-4 max-w-xl text-lg font-medium text-muted-foreground">
          This clip seems to have wandered off the timeline. Let&apos;s find your way back to the good stuff!
        </p>

        <Button
          size="lg"
          className="mt-8 min-h-14 min-w-56 rounded-full text-base font-semibold"
          asChild
        >
          <Link href="/">
            <Home className="mr-2 h-5 w-5" />
            GO HOME
          </Link>
        </Button>

        <p className="mt-4 text-sm text-muted-foreground">
          Back to creating amazing highlight clips
        </p>
      </div>
    </section>
  );
}