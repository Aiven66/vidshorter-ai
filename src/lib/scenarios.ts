/**
 * 场景化预置（P0）—— 纯数据模块，无 node 依赖，前后端共用。
 *
 * 对标 Recapo/OpusClip 的"场景化入口"：用户在首页按创作场景
 * （口播 / 解说 / Vlog / 纯享）一键预填生成参数，仍可手动微调。
 *
 * 每个场景 id 需与 i18n key `video.scenario.{id}.{label,hint}` 对应；
 * template 与 `video.exportTpl.{id}.label` 的导出模板 id 对应。
 */

export type ScenarioId = 'talk' | 'explainer' | 'vlog' | 'clean';

export interface ScenarioPreset {
  id: ScenarioId;
  /** 目标短片时长（秒），0 = 系统推荐 */
  targetDuration: number;
  /** 生成条数，0 = 系统推荐 */
  maxClips: number;
  /** 批量导出模板 id（'' = 无模板） */
  template: string;
  /** 是否开启 AI 配音 */
  voiceover: boolean;
  /** 配音声线（'' = 自动匹配语言） */
  voice: string;
  /** 是否开启背景音乐 */
  bgm: boolean;
  /** 背景音乐曲风 */
  bgmMood: 'calm' | 'energetic' | 'warm';
  /** 是否烧录静态字幕 */
  subtitles: boolean;
  /** 是否输出 9:16 竖屏 */
  vertical: boolean;
}

export const SCENARIOS: ScenarioPreset[] = [
  {
    id: 'talk',
    targetDuration: 30,
    maxClips: 5,
    template: 'vertical',
    voiceover: true,
    voice: '',
    bgm: true,
    bgmMood: 'energetic',
    subtitles: true,
    vertical: true,
  },
  {
    id: 'explainer',
    targetDuration: 60,
    maxClips: 10,
    template: 'classic',
    voiceover: false,
    voice: '',
    bgm: true,
    bgmMood: 'calm',
    subtitles: true,
    vertical: false,
  },
  {
    id: 'vlog',
    targetDuration: 15,
    maxClips: 3,
    template: 'clean',
    voiceover: false,
    voice: '',
    bgm: true,
    bgmMood: 'warm',
    subtitles: false,
    vertical: true,
  },
  {
    id: 'clean',
    targetDuration: 30,
    maxClips: 5,
    template: 'clean',
    voiceover: false,
    voice: '',
    bgm: false,
    bgmMood: 'calm',
    subtitles: false,
    vertical: false,
  },
];

export const SCENARIO_IDS = SCENARIOS.map((s) => s.id) as ScenarioId[];

/** 白名单归一化：非法/未知场景 → null（调用方回落"无预设"）。 */
export function normalizeScenario(raw: unknown): ScenarioPreset | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim() as ScenarioId;
  return SCENARIOS.find((s) => s.id === id) ?? null;
}
