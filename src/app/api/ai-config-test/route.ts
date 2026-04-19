/**
 * AI Config Test API Route
 * Tests whether the provided Coze API key is valid by sending a minimal LLM request.
 */

import { NextRequest } from 'next/server';
import { LLMClient, Config } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { apiKey, baseUrl, modelBaseUrl, model } = body as {
    apiKey?: string;
    baseUrl?: string;
    modelBaseUrl?: string;
    model?: string;
  };

  if (!apiKey) {
    return Response.json({ success: false, error: 'API Key 不能为空' }, { status: 400 });
  }

  try {
    const config = new Config({
      apiKey,
      baseUrl: baseUrl || 'https://api.coze.com',
      modelBaseUrl: modelBaseUrl || 'https://model.coze.com',
    });

    const llmClient = new LLMClient(config, {});
    const testModel = model || 'doubao-seed-1-8-251228';

    const response = await llmClient.invoke([
      { role: 'user', content: 'Reply with the word "ok" only.' },
    ], {
      model: testModel,
      temperature: 0.1,
    });

    const content = response?.content || '';
    return Response.json({
      success: true,
      model: testModel,
      response: content.slice(0, 100),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[AI Config Test] Error:', message);
    return Response.json({
      success: false,
      error: message.includes('401') || message.includes('auth') || message.includes('Unauthorized')
        ? '认证失败：API Key 无效或已过期'
        : message.includes('model') || message.includes('404')
        ? '模型不存在：请检查模型名称是否正确'
        : message.includes('network') || message.includes('ENOTFOUND') || message.includes('fetch')
        ? '网络错误：无法连接到 Coze API，请检查 Base URL'
        : message.slice(0, 200),
    });
  }
}
