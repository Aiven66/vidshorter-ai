'use client';

import { useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { AiToolTokenProvider } from '@/lib/ai-tools/client-api';

const STORED_TOKEN_KEY = 'clipop_access_token';

/**
 * AI 工具箱统一登录态：对外只暴露一个 `getToken`。
 *
 * 用户反馈「明明已登录，工具却提示请先登录」，根因是本地 token 丢失或已被服务端
 * 判为过期。这里按「React 态 → localStorage → 刷新会话」顺序兜底，并在
 * `forceRefresh` 时强制走一次 Supabase 会话刷新，配合 client-api 的 401 重试。
 */
export function useAiToolAuth() {
  const { user, accessToken, loading, refreshSession } = useAuth();

  const getToken = useCallback<AiToolTokenProvider>(
    async (forceRefresh = false) => {
      if (forceRefresh) {
        const refreshed = await refreshSession();
        if (refreshed) return refreshed;
      }
      if (accessToken) return accessToken;
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem(STORED_TOKEN_KEY);
        if (stored) return stored;
      }
      if (!user) return null;
      return await refreshSession();
    },
    [accessToken, refreshSession, user]
  );

  return { user, getToken, authLoading: loading };
}
