import { NextRequest, NextResponse } from 'next/server';
import { resolveBearerUserId } from '@/lib/server/plan-gate';
import { createInputSignedUrl } from '@/lib/server/ai-tools/storage';
import { detectDigitalHumanCapability } from '@/lib/server/digital-human/provider';
import {
  createClonedVoice,
  requireDashscopeConfig,
  synthesizeNarrationUrl,
  DashscopeError,
} from '@/lib/server/digital-human/dashscope';
import { addVoice, listVoices } from '@/lib/server/digital-human/task-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 声音克隆 —— 列表 / 创建 / 试听。
 * GET  /api/digital-human/voice               → { voices: ClonedVoice[] }
 * POST /api/digital-human/voice { referenceObjectPath, name } → { voice }
 * POST /api/digital-human/voice { action:'preview', voice, text } → { audioUrl }
 *
 * 参考音频需先经 /api/ai-tools/upload 的 ticket 直传到 Supabase（users/{uid}/ai-tools/），
 * 服务端再签发 1h 公网 URL 交给百炼 voice-enrollment。
 *
 * 试听返回的是**合成后的音频 URL**（复刻音色走 CosyVoice、预设音色走 qwen-tts），
 * 因此听到的是克隆后的声音，而不是原始参考音频。
 */
export async function GET(request: NextRequest) {
  const userId = await resolveBearerUserId(request);
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  return NextResponse.json({ voices: await listVoices(userId) });
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveBearerUserId(request);
    if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED', message: '请先登录' }, { status: 401 });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    }

    // 试听：用指定音色合成一小段示例音频（复刻音色 / 预设音色均可）
    if (body.action === 'preview') {
      const voice = typeof body.voice === 'string' ? body.voice.trim() : '';
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!voice || !text) return NextResponse.json({ error: 'MISSING_PARAMS', message: '缺少音色或示例文本' }, { status: 400 });
      const creds = await requireDashscopeConfig();
      const audioUrl = await synthesizeNarrationUrl(creds, { text, voice });
      return NextResponse.json({ audioUrl });
    }

    const referenceObjectPath = typeof body.referenceObjectPath === 'string' ? body.referenceObjectPath : '';
    if (!referenceObjectPath) {
      return NextResponse.json({ error: 'MISSING_AUDIO', message: '请上传参考音频（10~20 秒清晰人声）' }, { status: 400 });
    }

    const cap = await detectDigitalHumanCapability();
    if (!cap.voiceCloneAvailable) {
      return NextResponse.json({ error: 'VOICE_CLONE_UNAVAILABLE', message: cap.reason }, { status: 503 });
    }

    const creds = await requireDashscopeConfig();
    // 参考音频须为公网可达 URL（1h 签名）
    const referenceUrl = await createInputSignedUrl(userId, referenceObjectPath);
    // prefix 必须 ≤10 字符（百炼硬限制）
    const prefix = `dv${Date.now().toString(36).slice(-6)}`;

    const voiceId = await createClonedVoice(creds, { referenceUrl, prefix });
    const name =
      typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : `音色 ${new Date().toLocaleDateString('zh-CN')}`;

    const voice = { id: prefix, name, voiceId, createdAt: new Date().toISOString() };
    await addVoice(userId, voice);
    return NextResponse.json({ voice });
  } catch (e) {
    if (e instanceof DashscopeError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error('[digital-human/voice]', message);
    return NextResponse.json({ error: 'INTERNAL', message }, { status: 500 });
  }
}