/** 人工剪一条高光的经验耗时（分钟）：集中在这里，UI 文案引用它而不是写死数字。 */
export const EDITING_MINUTES_PER_CLIP = 8;

/**
 * 价值量化：把「用户手动从长视频里剪出一条高光」折算成可展示的时间成本。
 * 经验系数按行业常见做法取值（定位/回看素材约 8 分钟一条，成片每分钟约 3 分钟精修+字幕），
 * 用于结果页与付费墙的价值前置（P0-3 / P0-4），不参与任何计费逻辑。
 */
export function estimateEditingMinutes(clipCount: number, totalClipSeconds = 0): number {
  if (clipCount <= 0) return 0;
  const trimMinutes = Math.round((Math.max(0, totalClipSeconds) / 60) * 3);
  return clipCount * EDITING_MINUTES_PER_CLIP + trimMinutes;
}

/** 人类可读的「已节省时间」（中/英，其余语言回落英文）。 */
export function formatSavedTime(minutes: number, locale: string): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) {
    return locale === 'zh' ? `${m} 分钟` : `${m} min`;
  }
  const hours = m / 60;
  const rounded = hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10;
  return locale === 'zh' ? `${rounded} 小时` : `${rounded} hr`;
}
