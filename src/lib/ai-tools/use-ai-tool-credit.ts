'use client';

import { useState } from 'react';
import { useCredits } from '@/lib/credits-context';
import { useAuth } from '@/lib/auth-context';
import { isAdminUser } from '@/lib/admin-gate';

/**
 * P0 — AI 工具积分化：每次云推理前先扣除积分（admin 免费，积分不足弹充值引导）。
 * 与 video 处理扣 60、news/article 扣 30 保持一致，AI 工具单次扣 30。
 * Starter/Pro 每月 6,000/20,000 积分 → 对订阅用户几乎无感，但强制将免费用户导向付费。
 *
 * 用法（在工具组件内）:
 *   const { requestSpend, insufficientOpen, setInsufficientOpen } = useAiToolCredit();
 *   async function onSubmit() {
 *     if (!(await requestSpend())) return;   // 不足/未登录则中断
 *     ... callAiTool(...)
 *   }
 *   <InsufficientCreditsDialog open={insufficientOpen} onOpenChange={setInsufficientOpen}
 *        currentBalance={balance} requiredCredits={AI_TOOL_COST} />
 */
export const AI_TOOL_COST = 30;

export function useAiToolCredit() {
  const { balance, deductCredits } = useCredits();
  const { user } = useAuth();
  const [insufficientOpen, setInsufficientOpen] = useState(false);

  async function requestSpend(): Promise<boolean> {
    // 未登录：引导登录（组件层另有登录提示），这里不放行操作
    if (!user) return false;
    // 管理员不消耗积分
    if (isAdminUser(user)) return true;
    const ok = await deductCredits(AI_TOOL_COST);
    if (!ok) {
      setInsufficientOpen(true);
      return false;
    }
    return true;
  }

  return { requestSpend, insufficientOpen, setInsufficientOpen, balance };
}