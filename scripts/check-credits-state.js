#!/usr/bin/env node
/**
 * Query credits table and recent transactions to diagnose "Insufficient credits" issue.
 * Requires SUPABASE_ACCESS_TOKEN env var.
 */
const PROJECT_REF = 'zqvcgzypiirkultrlhll';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('Error: SUPABASE_ACCESS_TOKEN env variable is required');
  process.exit(1);
}

async function runSql(query) {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`SQL error (${response.status}):`, text);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse response:', text);
    return null;
  }
}

async function main() {
  console.log('=== 1. Recent users (Google logins) ===');
  const users = await runSql(`SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC LIMIT 10;`);
  if (users) console.log(JSON.stringify(users, null, 2));

  console.log('\n=== 2. All credits rows ===');
  const credits = await runSql(`SELECT id, user_id, balance, last_reset_at, created_at, updated_at FROM credits ORDER BY updated_at DESC LIMIT 20;`);
  if (credits) console.log(JSON.stringify(credits, null, 2));

  console.log('\n=== 3. Recent credit_transactions (last 30) ===');
  const txs = await runSql(`SELECT id, user_id, amount, type, description, created_at FROM credit_transactions ORDER BY created_at DESC LIMIT 30;`);
  if (txs) console.log(JSON.stringify(txs, null, 2));

  console.log('\n=== 4. Subscriptions ===');
  const subs = await runSql(`SELECT id, user_id, plan_type, status, created_at, updated_at FROM subscriptions ORDER BY updated_at DESC LIMIT 10;`);
  if (subs) console.log(JSON.stringify(subs, null, 2));

  console.log('\n=== 5. RLS policies on credits table ===');
  const policies = await runSql(`SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'credits'::regclass;`);
  if (policies) console.log(JSON.stringify(policies, null, 2));

  console.log('\n=== 6. Credits table columns ===');
  const cols = await runSql(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'credits' ORDER BY ordinal_position;`);
  if (cols) console.log(JSON.stringify(cols, null, 2));

  console.log('\n=== 7. RLS enabled on credits? ===');
  const rls = await runSql(`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'credits';`);
  if (rls) console.log(JSON.stringify(rls, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
