'use client';

import { useState } from 'react';
import { useCredits } from '@/lib/credits-context';
import { useAuth } from '@/lib/auth-context';

/**
 * AI 工具箱积分门控（现已改为免费）。
 *
 * 现状：AI 工具箱全部工具免费开放——已登录用户不再扣除任何积分
 * （此前每次云推理扣 30 积分的逻辑已移除，管理员与普通用户一视同仁）。
 * `AI_TOOL_COST` 常量与 `insufficientOpen` 状态仅为兼容既有调用点/展示而保留，
 * 扣费逻辑下线后 `InsufficientCreditsDialog` 不会再被触发。
 *
 * 仍保留登录引导：未登录时返回 false，组件层会提示登录。
 *
 * 用法（在工具组件内）:
 *   const { requestSpend, insufficientOpen, setInsufficientOpen } = useAiToolCredit();
 *   async function onSubmit() {
 *     if (!(await requestSpend())) return;   // 未登录则中断（已登录一律放行）
 *     ... callAiTool(...)
 *   }
 */
export const AI_TOOL_COST = 30;

export function useAiToolCredit() {
  const { balance } = useCredits();
  const { user } = useAuth();
  const [insufficientOpen, setInsufficientOpen] = useState(false);

  async function requestSpend(): Promise<boolean> {
    // 未登录：保留登录引导（组件层另有登录提示），这里不放行操作
    if (!user) return false;
    // 已登录（含管理员）一律放行，不再消耗积分
    return true;
  }

  return { requestSpend, insufficientOpen, setInsufficientOpen, balance };
}
