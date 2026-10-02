/**
 * 验证 DashScope 官方「临时文件上传」链路（本地文件 → 阿里云 OSS → 公网 URL）。
 * 这是官方为 s2v/视频生成类接口托管输入媒体的标准路径，不依赖第三方存储可达性。
 *
 * 流程：GET /api/v1/uploads?action=getPolicy&model=wan2.2-s2v → OSS policy
 *      → multipart POST 到 host（key/policy/OSSAccessKeyId/signature/file）→ 文件 URL
 *
 * 用法： node --import tsx .pwtest/dashscope-upload-probe.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });

const SAMPLE_IMG =
  'https://img.alicdn.com/imgextra/i3/O1CN011FObkp1T7Ttowoq4F_!!6000000002335-0-tps-1440-1797.jpg';

async function main() {
  const dk = await (await import('../src/lib/server/model-config')).getDashscopeConfig();
  if (!dk) {
    console.log('NO_DASHSCOPE_CONFIG');
    return;
  }

  // 1) 取上传策略
  const polRes = await fetch(
    `${dk.baseUrl}/api/v1/uploads?action=getPolicy&model=wan2.2-s2v`,
    { headers: { Authorization: `Bearer ${dk.apiKey}` } },
  );
  const polText = await polRes.text();
  console.log(`[getPolicy] http=${polRes.status}`);
  console.log(polText.slice(0, 700));
  let p: Record<string, string> = {};
  try {
    p = JSON.parse(polText)?.data || {};
  } catch {
    /* ignore */
  }
  console.log('\npolicy keys =', Object.keys(p).join(', '));
  if (!p.policy) {
    console.log('\nNO_POLICY -> 停止');
    return;
  }

  // 2) 上传一张图
  const host = p.upload_host || p.host;
  const dir = p.upload_dir || p.dir;
  const accessKeyId = p.oss_access_key_id || p.access_key_id || p.accessid || '';
  console.log('host =', host);
  console.log('dir  =', dir);
  console.log('accessKeyId =', accessKeyId ? accessKeyId.slice(0, 8) + '...' : '(empty)');

  const imgBuf = Buffer.from(await (await fetch(SAMPLE_IMG)).arrayBuffer());
  const fileName = `clipop-probe-${Date.now()}.jpg`;
  const key = `${dir}/${fileName}`;
  const form = new FormData();
  if (accessKeyId) form.append('OSSAccessKeyId', accessKeyId);
  form.append('policy', p.policy);
  form.append('Signature', p.signature);
  form.append('key', key);
  form.append('success_action_status', '200');
  // 策略条件强制要求带上 acl / forbid-overwrite（否则 OSS 返回 Policy Condition failed）
  form.append('x-oss-object-acl', p.x_oss_object_acl || 'private');
  if (p.x_oss_forbid_overwrite) form.append('x-oss-forbid-overwrite', p.x_oss_forbid_overwrite);
  form.append('file', new Blob([new Uint8Array(imgBuf)], { type: 'image/jpeg' }), fileName);

  const upRes = await fetch(host, { method: 'POST', body: form });
  const upText = await upRes.text();
  console.log(`\n[oss upload] http=${upRes.status}`);
  console.log(upText.slice(0, 400));

  // OSS 直传成功后，公网 URL = host/key
  const fileUrl = `${host}/${key}`;
  console.log('\nfileUrl =', fileUrl);

  // 3) 自检：该 URL 是否可 GET
  const back = await fetch(fileUrl);
  console.log(`self GET: http=${back.status} bytes=${(await back.arrayBuffer()).byteLength}`);
}

main().catch((e) => {
  console.error('PROBE_ERROR', e?.message || e);
  process.exit(1);
});