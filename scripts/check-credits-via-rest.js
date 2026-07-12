#!/usr/bin/env node
/**
 * 用 service role key 查询数据库状态，诊断 credits 表问题。
 * 用法: node scripts/check-credits-via-rest.js
 */
const fs = require('fs');
const path = require('path');

// 从 .env.vercel-prod 读取配置
const envPath = path.join(__dirname, '..', '.env.vercel-prod');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m) env[m[1]] = m[2];
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing Supabase config');
  process.exit(1);
}

console.log('Supabase URL:', SUPABASE_URL);
console.log('Service key (first 30):', SERVICE_KEY.substring(0, 30) + '...');

async function fetchTable(table, queryParams = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${queryParams}`;
  const response = await fetch(url, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`Error fetching ${table}:`, response.status, text);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
}

async function main() {
  console.log('\n=== 1. Recent users (Google logins) ===');
  const users = await fetchTable('users', 'order=created_at.desc&limit=10&select=id,email,name,role,created_at');
  if (users) console.log(JSON.stringify(users, null, 2));

  console.log('\n=== 2. All credits rows ===');
  const credits = await fetchTable('credits', 'order=updated_at.desc&limit=20&select=id,user_id,balance,last_reset_at,created_at,updated_at');
  if (credits) console.log(JSON.stringify(credits, null, 2));

  console.log('\n=== 3. Recent credit_transactions (last 30) ===');
  const txs = await fetchTable('credit_transactions', 'order=created_at.desc&limit=30&select=id,user_id,amount,type,description,created_at');
  if (txs) console.log(JSON.stringify(txs, null, 2));

  console.log('\n=== 4. Subscriptions ===');
  const subs = await fetchTable('subscriptions', 'order=updated_at.desc&limit=10&select=id,user_id,plan_type,status,created_at,updated_at');
  if (subs) console.log(JSON.stringify(subs, null, 2));

  // 比对：哪些用户在 users 表中但没有对应的 credits 行
  if (users && credits) {
    const userIds = new Set(users.map(u => u.id));
    const creditsUserIds = new Set(credits.map(c => c.user_id));
    const missingCredits = users.filter(u => !creditsUserIds.has(u.id));
    console.log('\n=== 5. Users WITHOUT credits row (the bug!) ===');
    console.log(JSON.stringify(missingCredits, null, 2));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
