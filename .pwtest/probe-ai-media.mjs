/**
 * 探针：确认平台生产环境可用的「文生图 / 图生视频」模型链路。
 * 从 Vercel REST 读取生产环境变量（不落盘、不打印密钥），分别试探
 *  - 图片：POST {base}/api/v3/images/generations（Seedream 系列）
 *  - 视频：POST {base}/api/v3/contents/generations/tasks（Seedance，9:16 / 16:9 合法性）
 * 只打印状态码与响应结构（键名 + 少量字段），用于确定 endpoint / model id / 参数。
 *
 * 运行：node .pwtest/probe-ai-media.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const TOKEN = JSON.parse(readFileSync(path.join(process.env.HOME, '.vercel/auth.json'), 'utf8')).token;
const TEAM = 'team_793fiffXc4NVumMgi46s1NIw';
const PROJECT_ID = 'prj_Fy2AGpMSxLEBrOtnsRZkG8UA63Oz';
const H = { Authorization: `Bearer ${TOKEN}` };

const res = await fetch(`https://api.vercel.com/v9/projects/${PROJECT_ID}/env?decrypt=true&teamId=${TEAM}`, { headers: H });
if (!res.ok) throw new Error(`env fetch ${res.status}: ${(await res.text()).slice(0, 300)}`);
const data = await res.json();
const envs = (data.envs || []).filter((e) => e.target?.includes('production'));
console.log('生产环境变量名：');
console.log(envs.map((e) => e.key).sort().join(', '));

const get = (k) => envs.find((e) => e.key === k)?.value || '';
const base = get('COZE_INTEGRATION_BASE_URL').replace(/\/$/, '');
const modelBase = get('COZE_INTEGRATION_MODEL_BASE_URL').replace(/\/$/, '');
const apiKey = get('COZE_WORKLOAD_IDENTITY_API_KEY');
console.log(`\nCOZE_INTEGRATION_BASE_URL = ${base || '(missing)'}`);
console.log(`COZE_INTEGRATION_MODEL_BASE_URL = ${modelBase || '(missing)'}`);
console.log(`COZE_WORKLOAD_IDENTITY_API_KEY = ${apiKey ? '(set, len=' + apiKey.length + ')' : '(missing)'}`);

if (!base || !apiKey) {
  console.log('\n缺少凭证，无法探针。');
  process.exit(1);
}

const authHeaders = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

function summarize(label, status, json, rawText) {
  console.log(`\n--- ${label} -> HTTP ${status}`);
  if (json && typeof json === 'object') {
    console.log('keys:', Object.keys(json).join(', '));
    if (json.error) console.log('error:', JSON.stringify(json.error).slice(0, 400));
    if (json.message) console.log('message:', String(json.message).slice(0, 400));
    const d = json.data?.[0];
    if (d) console.log('data[0] keys:', Object.keys(d).join(', '), '| url?', typeof d.url, '| b64?', typeof d.b64_json);
    if (json.code) console.log('code:', json.code);
  } else {
    console.log('raw:', String(rawText).slice(0, 400));
  }
}

const IMAGE_CANDIDATES = [
  { path: '/api/v3/images/generations', model: 'doubao-seedream-4-0-250828' },
  { path: '/api/v3/images/generations', model: 'doubao-seedream-3-0-t2i-250415' },
  { path: '/api/v3/images/generations', model: 'doubao-seedream-4-0-250828', size: '1024x1024' },
];

for (const c of IMAGE_CANDIDATES) {
  const body = {
    model: c.model,
    prompt: 'cinematic photo of a red apple on a wooden table, soft window light, shallow depth of field',
    size: c.size || '1024x1024',
    response_format: 'url',
    watermark: false,
  };
  try {
    const r = await fetch(`${base}${c.path}`, { method: 'POST', headers: authHeaders, body: JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-json */ }
    summarize(`IMAGE ${c.model} size=${body.size}`, r.status, json, text);
    if (r.ok && json?.data?.[0]?.url) {
      console.log('URL sample:', String(json.data[0].url).slice(0, 120));
      console.log('\n✅ 图片链路可用：', c.model);
      break;
    }
  } catch (e) {
    console.log(`\n--- IMAGE ${c.model} -> 网络异常: ${e.message}`);
  }
}

// 视频：只验证 9:16 合法性（提交后不轮询，避免等待）
const VIDEO_RATIOS = ['9:16', '16:9'];
for (const ratio of VIDEO_RATIOS) {
  const body = {
    model: 'doubao-seedance-1-5-pro-251215',
    content: [{ type: 'text', text: 'a paper plane flying over a calm ocean at sunrise, cinematic' }],
    resolution: '720p',
    ratio,
    duration: 5,
    camerafixed: false,
    watermark: false,
    generate_audio: false,
  };
  try {
    const r = await fetch(`${base}/api/v3/contents/generations/tasks`, { method: 'POST', headers: authHeaders, body: JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-json */ }
    console.log(`\n--- VIDEO ratio=${ratio} -> HTTP ${r.status}`);
    console.log('keys:', json && typeof json === 'object' ? Object.keys(json).join(', ') : '(none)');
    if (json?.id) console.log('taskId:', json.id, 'status:', json.status);
    if (json?.error) console.log('error:', JSON.stringify(json.error).slice(0, 400));
    if (json?.message) console.log('message:', String(json.message).slice(0, 400));
  } catch (e) {
    console.log(`\n--- VIDEO ratio=${ratio} -> 网络异常: ${e.message}`);
  }
}