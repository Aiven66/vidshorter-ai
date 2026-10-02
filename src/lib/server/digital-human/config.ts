/**
 * 数字人 provider 凭证读取（与 dashscope.ts 拆分，避免循环依赖）。
 * 优先级：管理后台「模型配置」> 进程环境变量（见 model-config.ts）。
 */

import { getDashscopeConfig } from '../model-config';

export interface DashscopeCreds {
  apiKey: string;
  baseUrl: string;
}

/** provider 未配置 / 调用失败时抛出的显式错误（绝不静默回落）。 */
export class DashscopeError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'DashscopeError';
    this.code = code;
    this.status = status;
  }
}

/** 取百炼凭证；未配置时抛 503（由路由层转成明确的「请先配置密钥」提示）。 */
export async function requireDashscopeConfig(): Promise<DashscopeCreds> {
  const c = await getDashscopeConfig();
  if (!c) {
    throw new DashscopeError(
      'DASHSCOPE_NOT_CONFIGURED',
      '未配置阿里云百炼 DASHSCOPE_API_KEY，请在「管理后台 → 模型配置」中填写后重试。',
      503,
    );
  }
  return { apiKey: c.apiKey, baseUrl: c.baseUrl };
}