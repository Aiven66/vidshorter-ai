/**
 * 极简 OpenAI 兼容 Chat 客户端（零 SDK 依赖）。
 *
 * 已实测可用：
 *  - DeepSeek：POST https://api.deepseek.com/chat/completions
 *  - 阿里云百炼：POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
 * 两家都接受 `{ model, messages, temperature, max_tokens }` 并返回 OpenAI 形状的响应。
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAiChatParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** 超时（毫秒），默认 60s —— 出片链路里不能无限等待 */
  timeoutMs?: number;
}

/** 调用 OpenAI 兼容的 chat/completions，返回首条回复文本。失败抛错（由调用方决定是否回落）。 */
export async function openAiChat(params: OpenAiChatParams): Promise<string> {
  const base = params.baseUrl.replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 60_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 1400,
        stream: false,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`llm http ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}