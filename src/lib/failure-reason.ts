/**
 * 失败原因 → 可读文案（v5 P0-5）。
 *
 * 后端把失败原因写进 `error_message`（可能是一整段英文报错），直接展示给用户
 * 既看不懂也不知道下一步做什么。这里做一次确定性映射：命中关键词就归到稳定
 * 的类别，每个类别给出「发生了什么 + 建议动作」。
 *
 * 纯前端、零依赖、不涉及计费，可与 SSR 共用。
 */

export type FailureKind =
  | 'insufficient_credits'
  | 'timeout'
  | 'source_blocked'
  | 'no_highlights'
  | 'network'
  | 'unsupported_input'
  | 'unknown';

export interface FailureCopy {
  kind: FailureKind;
  /** 一句话说明发生了什么（用户视角，不暴露堆栈） */
  title: string;
  /** 建议动作 */
  hint: string;
}

const RULES: Array<{ kind: FailureKind; pattern: RegExp }> = [
  { kind: 'insufficient_credits', pattern: /insufficient|not enough|quota|credit/i },
  { kind: 'timeout', pattern: /timeout|timed out|time out|deadline|超时/i },
  { kind: 'source_blocked', pattern: /private|sign in|login|cookie|bot|403|forbidden|unavailable|限制/i },
  { kind: 'no_highlights', pattern: /no highlight|no clip|empty|nothing found|未找到|没有找到/i },
  { kind: 'network', pattern: /network|fetch|connection|econn|socket|网络/i },
  { kind: 'unsupported_input', pattern: /unsupported|format|codec|invalid url|bad url|格式/i },
];

const COPY: Record<FailureKind, { title: { zh: string; en: string }; hint: { zh: string; en: string } }> = {
  insufficient_credits: {
    title: { zh: '积分不足，没能开始处理', en: 'Not enough credits to start' },
    hint: { zh: '积分已退回，获取更多积分后可直接重试', en: 'Credits were refunded — top up, then retry' },
  },
  timeout: {
    title: { zh: '视频太长或源站响应慢，处理超时', en: 'Processing timed out' },
    hint: { zh: '可直接重试；若反复超时，建议先截取较短的片段或换本地上传', en: 'Retry, or upload a shorter local file' },
  },
  source_blocked: {
    title: { zh: '无法访问该视频源（可能是私密、地区限制或反爬）', en: 'This video source could not be accessed' },
    hint: { zh: '换成公开视频链接，或直接上传本地文件', en: 'Use a public link, or upload the file directly' },
  },
  no_highlights: {
    title: { zh: '没能在视频里识别出高光片段', en: 'No highlight-worthy segments found' },
    hint: { zh: '可放宽高光规则后重试，或换一个内容更集中的视频', en: 'Loosen highlight rules, or try a more focused video' },
  },
  network: {
    title: { zh: '网络中断，处理没有完成', en: 'Network interrupted before finishing' },
    hint: { zh: '检查网络后重试即可，积分已退回', en: 'Check your connection and retry — credits refunded' },
  },
  unsupported_input: {
    title: { zh: '该链接或文件格式暂不支持', en: 'This link or file format is not supported' },
    hint: { zh: '换用 YouTube / Bilibili 链接或常见视频格式（mp4/mov）', en: 'Use a YouTube / Bilibili link or mp4/mov file' },
  },
  unknown: {
    title: { zh: '这次处理没有完成', en: 'Processing did not finish' },
    hint: { zh: '可直接重试；积分已自动退回', en: 'Retry directly — credits were refunded automatically' },
  },
};

export function describeFailure(message: string | null | undefined, locale: string): FailureCopy {
  const raw = typeof message === 'string' ? message : '';
  const matched = RULES.find(rule => rule.pattern.test(raw));
  const kind: FailureKind = matched ? matched.kind : 'unknown';
  const copy = COPY[kind];
  const lang = locale === 'zh' ? 'zh' : 'en';
  return { kind, title: copy.title[lang], hint: copy.hint[lang] };
}
