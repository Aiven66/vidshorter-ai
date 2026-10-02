import type { Metadata } from 'next';
import HomeLanding from '@/components/home/home-landing';

export const metadata: Metadata = {
  title: 'Clipop AI - 将长视频转换为爆款短视频 | AI 高光剪辑',
  description:
    '粘贴 YouTube、B站或播客链接，或上传本地长视频。AI 自动切片、提炼高光、生成多语种字幕与 9:16 竖屏成片。新用户赠 60 积分。',
};

export default function RootPage() {
  return <HomeLanding />;
}