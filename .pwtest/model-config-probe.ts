/**
 * 模型配置链路探针：
 *  1) 服务端能否从私有桶读到后台配置（读的是「管理后台」通道，不是 env）
 *  2) AI 成片脚本生成是否真的调用模型（engine 应为 'llm'，而非本地兜底 'local'）
 *  3) 7 类模版是否都能拿到合规分镜
 * 运行：node --import tsx .pwtest/model-config-probe.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });

async function main() {
  const { readModelConfig, getLlmConfig, maskSecret } = await import('../src/lib/server/model-config');
  const { generateAiVideoScript } = await import('../src/lib/server/ai-video/script');
  const { AI_VIDEO_TEMPLATES } = await import('../src/lib/ai-video-templates');

  // 1) 后台配置读取
  const cfg = await readModelConfig();
  const keys = Object.keys(cfg.values);
  console.log(`[cfg] activeLlm=${cfg.activeLlm} keys=${keys.join(',')} updatedBy=${cfg.updatedBy}`);
  for (const k of keys) console.log(`[cfg]   ${k} = ${maskSecret(cfg.values[k])}`);
  if (keys.length === 0) throw new Error('后台配置为空：私有桶读取失败');

  // 2) LLM 基座解析
  const llm = await getLlmConfig();
  if (!llm) throw new Error('getLlmConfig 返回 null：未解析到可用基座');
  console.log(`[cfg] llm provider=${llm.provider} model=${llm.model} baseUrl=${llm.baseUrl} key=${maskSecret(llm.apiKey)}`);

  // 3) 真实调用模型生成脚本（逐个模版）
  for (const tpl of AI_VIDEO_TEMPLATES) {
    const script = await generateAiVideoScript({ topic: '晨间习惯', locale: 'zh', templateId: tpl.id });
    const first = script.scenes[0];
    console.log(
      `[llm] ${tpl.id}: engine=${script.engine} scenes=${script.scenes.length} head="${first?.headline ?? ''}" nar="${(first?.narration ?? '').slice(0, 30)}"`,
    );
    if (script.engine !== 'llm') throw new Error(`${tpl.id}: engine=${script.engine}，未走真实模型`);
    if (script.scenes.length < 4) throw new Error(`${tpl.id}: 分镜数不足 (${script.scenes.length})`);
  }

  console.log('[probe] PASS');
}

main().catch((e) => {
  console.error('[probe] FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
});