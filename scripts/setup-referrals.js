#!/usr/bin/env node
/**
 * Setup referrals table via Supabase Management API.
 * Uses a Personal Access Token (PAT) to execute DDL SQL.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/setup-referrals.js
 *
 * Idempotent — safe to run multiple times (uses CREATE TABLE IF NOT EXISTS,
 * CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS).
 */
const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'zqvcgzypiirkultrlhll';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SQL_FILE = path.join(__dirname, 'create-referrals-table.sql');

if (!ACCESS_TOKEN) {
  console.error('Error: SUPABASE_ACCESS_TOKEN env variable is required');
  console.error('Generate one at: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const sql = fs.readFileSync(SQL_FILE, 'utf8');

async function main() {
  console.log('Executing SQL on project:', PROJECT_REF);
  console.log('SQL preview (first 200 chars):', sql.slice(0, 200));
  console.log('---');

  // Try the /database/query endpoint (Supabase Management API)
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await response.text();
  console.log('HTTP Status:', response.status);

  // Try to parse JSON response
  try {
    const json = JSON.parse(text);
    console.log('Response:', JSON.stringify(json, null, 2).slice(0, 2000));
  } catch {
    console.log('Response text:', text.slice(0, 2000));
  }

  if (response.ok) {
    console.log('\n✅ referrals table created successfully');
  } else {
    console.log('\n❌ SQL execution failed');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
