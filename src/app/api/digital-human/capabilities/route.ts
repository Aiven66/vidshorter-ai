import { NextResponse } from 'next/server';
import { detectDigitalHumanCapability } from '@/lib/server/digital-human/provider';
import { MAX_NARRATION_CHARS, PRESET_VOICES, TALKING_VIDEO_MODEL } from '@/lib/server/digital-human/dashscope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 数字人口播带货 —— 服务端能力探测。
 * 前端据此明确提示「需要哪些模型密钥」，绝不静默降级或假装已生成。
 */
export async function GET() {
  const cap = await detectDigitalHumanCapability();
  return NextResponse.json({
    available: cap.available,
    provider: cap.provider,
    missingEnv: cap.missingEnv,
    voiceCloneAvailable: cap.voiceCloneAvailable,
    voiceCloneProvider: cap.voiceCloneProvider,
    reason: cap.reason,
    /** 已打通的真实调用链路参数 */
    model: TALKING_VIDEO_MODEL,
    presetVoices: PRESET_VOICES,
    maxNarrationChars: MAX_NARRATION_CHARS,
    /** 零 Key 的画布数字人（现有能力），未配置 provider 时的替代入口 */
    fallbackHref: '/digital-human',
  });
}