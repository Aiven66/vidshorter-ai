#!/usr/bin/env node
/**
 * Auto-deploy the YouTube proxy Cloudflare Worker.
 * Usage: node scripts/deploy-cf-worker.js [--cf-token <token>] [--cf-account <id>]
 *
 * Or set env vars:
 *   CF_API_TOKEN - Cloudflare API token (Workers Scripts:Edit permission)
 *   CF_ACCOUNT_ID - Cloudflare account ID
 *
 * After deployment, set CF_WORKER_URL in Vercel:
 *   npx vercel env add CF_WORKER_URL production
 */

const fs = require('fs');
const path = require('path');

async function deploy() {
  const cfToken = process.env.CF_API_TOKEN || getArg('--cf-token');
  const cfAccountId = process.env.CF_ACCOUNT_ID || getArg('--cf-account');

  if (!cfToken || !cfAccountId) {
    console.error(`
╔══════════════════════════════════════════════════════════════╗
║         Cloudflare Worker 部署说明                           ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  本 Worker 让 YouTube 下载从 Cloudflare IP 发起，            ║
║  从而绕过 Vercel AWS IP 被 YouTube 封锁的问题。              ║
║                                                              ║
║  一次性部署步骤（5分钟）：                                   ║
║                                                              ║
║  1. 注册/登录 Cloudflare: https://dash.cloudflare.com       ║
║                                                              ║
║  2. 获取 API Token:                                          ║
║     dash.cloudflare.com/profile/api-tokens                  ║
║     → Create Token → Use template "Edit Cloudflare Workers" ║
║                                                              ║
║  3. 获取 Account ID:                                         ║
║     dash.cloudflare.com → 右侧 "Account ID"                 ║
║                                                              ║
║  4. 运行部署:                                                ║
║     CF_API_TOKEN=xxx CF_ACCOUNT_ID=yyy node scripts/deploy-cf-worker.js
║                                                              ║
║  或者手动部署:                                               ║
║     cd cf-worker && npx wrangler deploy                      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }

  const workerScript = fs.readFileSync(path.join(__dirname, '../cf-worker/worker.js'), 'utf8');
  const workerName = 'youtube-proxy';

  console.log(`🚀 Deploying Cloudflare Worker "${workerName}"...`);

  // Deploy using Cloudflare API directly
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/workers/scripts/${workerName}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${cfToken}`,
      'Content-Type': 'application/javascript',
    },
    body: workerScript,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => response.text());
    console.error('❌ Deployment failed:', JSON.stringify(error, null, 2));
    process.exit(1);
  }

  const result = await response.json();

  if (!result.success) {
    console.error('❌ Deployment failed:', result.errors);
    process.exit(1);
  }

  // Get worker subdomain
  const subdomainRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/workers/subdomain`,
    { headers: { 'Authorization': `Bearer ${cfToken}` } }
  );

  let workerUrl = `https://${workerName}.<your-subdomain>.workers.dev`;
  if (subdomainRes.ok) {
    const subData = await subdomainRes.json();
    if (subData.result?.subdomain) {
      workerUrl = `https://${workerName}.${subData.result.subdomain}.workers.dev`;
    }
  }

  // Enable workers.dev route
  await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/workers/scripts/${workerName}/subdomain`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled: true }),
    }
  );

  console.log(`
✅ Cloudflare Worker deployed successfully!

Worker URL: ${workerUrl}

Now set CF_WORKER_URL in Vercel:
  npx vercel env add CF_WORKER_URL production

Enter value: ${workerUrl}

Test the worker:
  curl "${workerUrl}?videoId=dQw4w9WgXcQ"
`);

  // Also try to set it in Vercel automatically
  if (process.env.VERCEL_TOKEN) {
    console.log('Setting CF_WORKER_URL in Vercel...');
    // Would need vercel project ID - skip auto-set for now
  }
}

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

deploy().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
