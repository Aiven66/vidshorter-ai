import type { Metadata } from 'next';
import ClientShortsProcessor from '@/components/home/client-shorts-processor';

export const metadata: Metadata = {
  title: 'YouTube Shorts 成片 — 长视频一键生成竖屏高光短视频 | Clipop AI',
  description:
    '输入长视频链接，AI 自动提取最具传播力的高光片段，输出 9:16 竖屏 YouTube Shorts 成片，含 AI 字幕，可直接发布。',
};

export default function ShortsPage() {
  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/30">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <div className="mx-auto max-w-5xl">
            <ClientShortsProcessor />
          </div>
        </div>
      </section>
    </div>
  );
}