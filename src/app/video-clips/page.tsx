import { HomeHero, HomeValueHighlights, HomeFeatures, HomeHowItWorks, HomeEditingShowcase } from '@/components/home/home-sections';
import ClientVideoProcessor from '@/components/home/client-video-processor';
import ClientFAQ from '@/components/home/client-faq';
import { HomeDemoExperience } from '@/components/home/demo-experience';

// 营销区块（Demo 体验 / 价值亮点 / 编辑展示 / 功能特性 / 如何使用 / 常见问题）
// 已按需求隐藏，页面只保留：Hero 标题 + 视频处理卡片 + 结果列表，降低使用门槛。
// 如需恢复：把下面开关改为 true。
const SHOW_MARKETING_SECTIONS = false;

export default async function VideoClipsPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  // 首页「智能解析与生成」会带上 ?url=，此处透传给处理器以预填并自动开始
  const { url } = await searchParams;
  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/30">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <div className="mx-auto max-w-6xl">
            <HomeHero />
            {SHOW_MARKETING_SECTIONS && <HomeDemoExperience />}
            <div id="core-video-processor" className="mx-auto max-w-5xl scroll-mt-24">
              <ClientVideoProcessor initialUrl={url} />
            </div>
            {SHOW_MARKETING_SECTIONS && (
              <>
                <HomeValueHighlights />
                <HomeEditingShowcase />
                <HomeFeatures />
                <HomeHowItWorks />
                <ClientFAQ />
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}