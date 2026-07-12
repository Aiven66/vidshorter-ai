#!/usr/bin/env node
/**
 * 清理 credits 表中的重复行，保留每个 user_id 最新的一条。
 * 同时为缺少 credits 行的用户插入新行（100 积分）。
 * 用法: node scripts/cleanup-credits-duplicates.js
 */
const fs = require('fs');
const path = require('path');

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

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function fetchAllCredits() {
  // 获取所有 credits 行
  const url = `${SUPABASE_URL}/rest/v1/credits?order=created_at.desc&select=id,user_id,balance,last_reset_at,created_at`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    console.error('Fetch credits error:', res.status, text);
    return null;
  }
  return JSON.parse(text);
}

async function fetchAllUsers() {
  const url = `${SUPABASE_URL}/rest/v1/users?select=id,email,name,role,created_at`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    console.error('Fetch users error:', res.status, text);
    return null;
  }
  return JSON.parse(text);
}

async function deleteCreditRow(id) {
  const url = `${SUPABASE_URL}/rest/v1/credits?id=eq.${id}`;
  const res = await fetch(url, { method: 'DELETE', headers });
  return res.ok;
}

async function insertCreditRow(userId, balance = 100) {
  const url = `${SUPABASE_URL}/rest/v1/credits`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: userId,
      balance,
      last_reset_at: new Date().toISOString(),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Insert credit for ${userId} failed:`, res.status, text);
    return false;
  }
  return true;
}

async function main() {
  console.log('=== Step 1: Fetch all credits and users ===');
  const [credits, users] = await Promise.all([fetchAllCredits(), fetchAllUsers()]);
  if (!credits || !users) {
    console.error('Failed to fetch data');
    process.exit(1);
  }

  console.log(`Found ${credits.length} credits rows for ${users.length} users`);

  // 按 user_id 分组
  const grouped = {};
  credits.forEach(c => {
    if (!grouped[c.user_id]) grouped[c.user_id] = [];
    grouped[c.user_id].push(c);
  });

  // 找出重复行（每个 user_id 超过 1 条）
  const duplicates = Object.entries(grouped).filter(([_, rows]) => rows.length > 1);
  console.log(`\n=== Step 2: Found ${duplicates.length} users with duplicate credits rows ===`);
  duplicates.forEach(([userId, rows]) => {
    console.log(`  User ${userId}: ${rows.length} rows (will keep latest: ${rows[0].id})`);
  });

  // 删除重复行（保留最新的，即 created_at 最大的，由于已按 desc 排序所以是第一个）
  let deletedCount = 0;
  for (const [userId, rows] of duplicates) {
    // rows[0] 是最新的，删除 rows[1:]
    for (let i = 1; i < rows.length; i++) {
      const ok = await deleteCreditRow(rows[i].id);
      if (ok) {
        deletedCount++;
        console.log(`  Deleted duplicate ${rows[i].id} for user ${userId}`);
      } else {
        console.error(`  Failed to delete ${rows[i].id}`);
      }
    }
  }
  console.log(`\nDeleted ${deletedCount} duplicate rows`);

  // 找出没有 credits 行的用户
  const creditsUserIds = new Set(credits.map(c => c.user_id));
  const missingUsers = users.filter(u => !creditsUserIds.has(u.id) && u.role !== 'admin');
  console.log(`\n=== Step 3: Found ${missingUsers.length} non-admin users without credits row ===`);
  for (const u of missingUsers) {
    console.log(`  ${u.email} (${u.id})`);
    const ok = await insertCreditRow(u.id, 100);
    if (ok) console.log(`    ✓ Inserted 100 credits`);
  }

  console.log('\n=== Step 4: Verify final state ===');
  const finalCredits = await fetchAllCredits();
  if (finalCredits) {
    const finalGrouped = {};
    finalCredits.forEach(c => {
      if (!finalGrouped[c.user_id]) finalGrouped[c.user_id] = [];
      finalGrouped[c.user_id].push(c);
    });
    const stillDuplicated = Object.entries(finalGrouped).filter(([_, rows]) => rows.length > 1);
    console.log(`Final credits rows: ${finalCredits.length}`);
    console.log(`Users with duplicates remaining: ${stillDuplicated.length}`);
    if (stillDuplicated.length > 0) {
      stillDuplicated.forEach(([userId, rows]) => {
        console.log(`  WARNING: User ${userId} still has ${rows.length} rows`);
      });
    } else {
      console.log('✓ All users now have at most 1 credits row');
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
