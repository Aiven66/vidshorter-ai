/**
 * 结果页「发布建议」：把一条高光片段翻译成可直接发布的内容建议。
 *
 * 纯前端确定性推导（同一条片段每次结果一致），不额外调用模型、不参与计费。
 * 目的：让用户感知「这不只是几条片子，而是能直接发的内容」——价值可感知是付费转化的前提。
 */
export type PotentialKey = 'hook' | 'density' | 'emotion';
export type SuggestedPlatform = 'tiktok' | 'youtube-shorts' | 'instagram-reels';

export interface ClipInsight {
  /** 爆款潜力标签（最多 2 个，至少 1 个） */
  potential: PotentialKey[];
  platform: SuggestedPlatform;
  /** 一条可直接复制的建议标题 */
  title: string;
  /** 3 个 hashtag */
  hashtags: string[];
}

const HOOK_PATTERN = /(震惊|没想到|居然|秘密|真相|千万别|后悔|最后一个|shock|secret|never|nobody|why|stop|mistake|wrong)/i;
const EMOTION_PATTERN = /(感动|愤怒|害怕|崩溃|泪|心疼|love|hate|angry|cry|afraid|heart)/i;

function trimTitle(raw: string, max = 48): string {
  const cleaned = raw.replace(/[\s。！？!?.,，、]+$/g, '').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

/**
 * 依据片段本身的信号（标题/摘要/时长/AI 精彩度）推导发布建议。
 * 所有阈值集中在此，组件不硬编码任何数字。
 */
export function buildClipInsight(input: {
  title: string;
  summary?: string;
  duration: number;
  engagementScore?: number;
}): ClipInsight {
  const text = `${input.title} ${input.summary || ''}`;
  const potential: PotentialKey[] = [];
  if ((input.engagementScore ?? 0) >= 8 || HOOK_PATTERN.test(text)) potential.push('hook');
  if ((input.summary || '').length >= 60) potential.push('density');
  if (EMOTION_PATTERN.test(text)) potential.push('emotion');
  if (potential.length === 0) potential.push('density');

  const platform: SuggestedPlatform = input.duration <= 60
    ? 'tiktok'
    : input.duration <= 180
      ? 'youtube-shorts'
      : 'instagram-reels';

  return {
    potential: potential.slice(0, 2),
    platform,
    title: trimTitle(input.title),
    hashtags: platformHashtags(platform),
  };
}

function platformHashtags(platform: SuggestedPlatform): string[] {
  const base = ['#shorts', '#highlights'];
  const tail = platform === 'tiktok' ? '#fyp' : platform === 'youtube-shorts' ? '#youtubeshorts' : '#reels';
  return [...base, tail];
}

/** 潜力标签的展示文案（中/英，其余语言回落英文）。 */
export function potentialLabel(key: PotentialKey, locale: string): string {
  if (locale === 'zh') {
    return key === 'hook' ? '钩子强' : key === 'density' ? '信息密度高' : '情绪峰值';
  }
  return key === 'hook' ? 'Strong hook' : key === 'density' ? 'High info density' : 'Emotional peak';
}

/** 推荐平台的展示文案。 */
export function platformLabel(platform: SuggestedPlatform): string {
  return platform === 'tiktok' ? 'TikTok' : platform === 'youtube-shorts' ? 'YouTube Shorts' : 'Instagram Reels';
}
