import { redirect } from 'next/navigation';

export default function RootPage() {
  // 根路径重定向到 /video-clips（高光剪辑）
  redirect('/video-clips');
}
