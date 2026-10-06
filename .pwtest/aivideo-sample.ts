/**
 * 本地样片探针：直接调用真实的 renderAiVideo 管线，验证动感字幕/标题入场/进度条/运镜
 * 在新代码下的实际观感（不依赖 Next 路由、不依赖登录）。产出 .pwtest/aivideo-sample.mp4。
 *
 * 运行：node --import tsx .pwtest/aivideo-sample.ts
 */
import { unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { renderAiVideo } from '../src/lib/server/ai-video/render';
import { probeDuration } from '../src/lib/server/recap/render';

async function main() {
  const tempPaths: string[] = [];
  const outPath = join(process.cwd(), '.pwtest', 'aivideo-sample.mp4');
  const scenes = [
    { headline: '大多数人想错了', narration: '关于「学生怎么攒钱」，我们习惯的第一反应，往往是最省力、也最不准确的那一个。' },
    { headline: '换一个问法', narration: '真正有价值的不是答案是什么，而是我们到底在解决什么问题。换个问法，问题常常自己消失一半。' },
    { headline: '它有三个层次', narration: '表层是现象，中层是机制，底层是动机。多数争论卡在表层，因为没人愿意往下走。' },
    { headline: '怎么练习', narration: '每天挑一件小事，先写下你的第一直觉，再强迫自己给出两个反对自己的理由。' },
    { headline: '一句话收尾', narration: '深度思考不是想得更久，而是问得更狠。想清楚这件事，比急着回答它更重要。' },
  ];

  const dur = await renderAiVideo({
    scenes,
    voice: 'zh-CN-XiaoxiaoNeural',
    target: { width: 720, height: 1280, watermark: false },
    outPath,
    runId: 'sample',
    tempPaths,
    bgmMood: 'calm',
    templateId: 'deep-thinking',
  });

  const st = await stat(outPath);
  const probed = await probeDuration(process.env.FFMPEG_BIN || (await import('ffmpeg-static')).default as unknown as string, outPath);
  console.log(`SAMPLE_OK duration=${dur.toFixed(2)}s size=${(st.size / 1024).toFixed(0)}KB probe=${probed.toFixed(2)}s`);
  for (const p of tempPaths) await unlink(p).catch(() => {});
}

main().catch((e) => {
  console.error('SAMPLE_FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
});