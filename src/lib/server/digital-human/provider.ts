/**
 * 数字人口播带货 —— 服务端能力探测（对齐开源框架 Pixelle-Video 的 provider 结构）。
 *
 * Pixelle-Video 的「数字人」有两条链路：
 *   1) RunningHub 云端工作流（workflows/runninghub/digital_*.json）
 *   2) 直连 DashScope `wan2.7-r2v`（ability_type=reference_to_video，digital_human / voice_reference 能力）
 * 它**没有** Wav2Lip / SadTalker / LivePortrait 这类零 Key 本地方案，因此服务端级真人数字人
 * 必须有 provider 密钥（或本地 ComfyUI + GPU）。
 *
 * 本模块只做「能力探测」，不做静默回落：
 *   - 探测到密钥 → available=true，可走服务端真人数字人；
 *   - 未探测到   → available=false 且列出缺失的 env，由 API / UI 明确告知用户，
 *                  并引导到平台已有的**零 Key 画布数字人**（/digital-human，口型由音频包络驱动）。
 *
 * 音色克隆同理：IndexTTS2 需本地 GPU，Edge-TTS 不支持克隆 → 未配置时回落 Edge 神经声线，
 * 由 UI 明确提示「当前使用神经声线，未使用克隆音色」。
 */

import {
  getDashscopeConfig,
  getMinimaxConfig,
  getRunningHubConfig,
} from '../model-config';

export type DigitalHumanProviderId = 'dashscope' | 'runninghub';

export interface DigitalHumanCapability {
  /** 服务端真人数字人是否可用（需 provider 密钥） */
  available: boolean;
  provider: DigitalHumanProviderId | null;
  /** 缺失的环境变量名（available=false 时非空） */
  missingEnv: string[];
  /** 是否具备音色克隆（百炼 voice clone / MiniMax 声音克隆 / IndexTTS2 本地 GPU） */
  voiceCloneAvailable: boolean;
  /** 音色克隆来源 provider（voiceCloneAvailable=true 时有效） */
  voiceCloneProvider: 'dashscope' | 'minimax' | 'indextts2' | null;
  /** 缺失时对外可直接展示的一句话说明（中文，供服务端错误体与 UI 复用） */
  reason: string;
}

/** Debug 开关：本地自测时可用 DH_FORCE_AVAILABLE=1 绕过密钥探测（不会用于生产）。 */
function debugForceAvailable(): boolean {
  return process.env.DH_FORCE_AVAILABLE === '1';
}

const DASHSCOPE_ENV = 'DASHSCOPE_API_KEY';
const RUNNINGHUB_ENV = ['RUNNINGHUB_API_KEY', 'RUNNINGHUB_WORKFLOW_ID'] as const;

/**
 * 服务端真人数字人能力探测（不做副作用，可在 GET 路由安全调用）。
 * 密钥来源：管理后台「模型配置」（优先）→ 进程环境变量。
 */
export async function detectDigitalHumanCapability(): Promise<DigitalHumanCapability> {
  const [dashscope, runninghub, minimax] = await Promise.all([
    getDashscopeConfig(),
    getRunningHubConfig(),
    getMinimaxConfig(),
  ]);

  const voiceCloneProvider: DigitalHumanCapability['voiceCloneProvider'] = dashscope
    ? 'dashscope'
    : minimax
      ? 'minimax'
      : process.env.INDEXTTS2_ENDPOINT?.trim()
        ? 'indextts2'
        : null;

  if (debugForceAvailable() || dashscope || runninghub) {
    return {
      available: true,
      provider: runninghub ? 'runninghub' : 'dashscope',
      missingEnv: [],
      voiceCloneAvailable: voiceCloneProvider !== null,
      voiceCloneProvider,
      reason: '',
    };
  }

  return {
    available: false,
    provider: null,
    missingEnv: [DASHSCOPE_ENV, ...RUNNINGHUB_ENV],
    voiceCloneAvailable: voiceCloneProvider !== null,
    voiceCloneProvider,
    reason:
      '服务端真人数字人需要模型密钥：请在「管理后台 → 模型配置」里填写 阿里云百炼 DASHSCOPE_API_KEY（wan2.7-r2v），或 RUNNINGHUB_API_KEY + RUNNINGHUB_WORKFLOW_ID。未配置时可使用零门槛的画布数字人（/digital-human）。',
  };
}

/** 音色克隆是否可用（百炼 / MiniMax 声音克隆，或 IndexTTS2 本地 GPU）。 */
export async function isVoiceCloneAvailable(): Promise<boolean> {
  return (await detectDigitalHumanCapability()).voiceCloneAvailable;
}

/** provider 未配置时抛出的显式错误（绝不静默回落成别的实现）。 */
export class DigitalHumanUnavailableError extends Error {
  readonly missingEnv: string[];
  constructor(cap: DigitalHumanCapability) {
    super(cap.reason || 'digital human provider unavailable');
    this.name = 'DigitalHumanUnavailableError';
    this.missingEnv = cap.missingEnv;
  }
}