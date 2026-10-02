const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const SQL = fs.readFileSync(path.join(__dirname, 'async-video-pipeline.sql'), 'utf8');

// Try the documented pg connection first; fall back to the Supabase Management
// API with the SB token if direct connection fails.
async function viaPg() {
  const c = new Client({
    host: 'db.zqvcgzypiirkultrlhll.supabase.co',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query(SQL);
  await c.end();
}

async function main() {
  try {
    await viaPg();
    console.log('OK via pg');
  } catch (e) {
    console.log('pg failed:', e.message);
    const token = process.env.SUPABASE_MGMT_TOKEN;
    if (!token) { console.log('NO MGMT TOKEN'); process.exit(1); }
    const res = await fetch('https://api.supabase.com/v1/projects/zqvcgzypiirkultrlhll/database/query', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: SQL }),
    });
    console.log('mgmt status', res.status, (await res.text()).slice(0, 400));
  }
}
main();