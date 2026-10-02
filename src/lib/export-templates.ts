/**
 * 批量导出模板（P0 Starter+ 权益）—— 纯数据模块，无 node 依赖，前后端共用。
 *
 * 模板 = 一组导出参数预设：字幕方式（静态/卡拉OK/无）+ 画幅（横屏/竖屏）。
 * 服务端据此逐段构建 ASS + 拼接滤镜；前端据此渲染模板选择 UI。
 * 每个模板 id 需与 i18n key `video.exportTpl.{id}.{label,hint}` 对应。
 */

export type ExportTemplateId = 'classic' | 'karaoke' | 'vertical' | 'clean';

export interface ExportTemplateOption {
  id: ExportTemplateId;
  /** 是否烧录静态字幕 */
  subtitles: boolean;
  /** 是否烧录卡拉OK逐词高亮字幕（优先于静态字幕） */
  karaoke: boolean;
  /** 是否输出 9:16 竖屏 */
  vertical: boolean;
}

export const EXPORT_TEMPLATES: ExportTemplateOption[] = [
  { id: 'classic', subtitles: true, karaoke: false, vertical: false },
  { id: 'karaoke', subtitles: false, karaoke: true, vertical: false },
  { id: 'vertical', subtitles: true, karaoke: false, vertical: true },
  { id: 'clean', subtitles: false, karaoke: false, vertical: false },
];

export const EXPORT_TEMPLATE_IDS = EXPORT_TEMPLATES.map((t) => t.id) as ExportTemplateId[];

/** 服务端白名单归一化：非法/未知模板 → null（调用方回落默认 classic 或当前行为）。 */
export function normalizeExportTemplate(raw: unknown): ExportTemplateOption | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim() as ExportTemplateId;
  const tpl = EXPORT_TEMPLATES.find((t) => t.id === id);
  return tpl ?? null;
}
