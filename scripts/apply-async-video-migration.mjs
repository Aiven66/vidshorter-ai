// Apply the async-video-pipeline migration to production Supabase directly.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, '..', '.env.production'), 'utf8');
const get = (k) => { const m = env.match(new RegExp(`^${k}=["']?(.*?)["']?\\s*$`, 'm')); return m ? m[1] : null; };
const url = get('NEXT_PUBLIC_SUPABASE_URL') || get('COZE_SUPABASE_URL');
const key = get('SUPABASE_SERVICE_ROLE_KEY') || get('COZE_SUPABASE_SERVICE_ROLE_KEY');
const sql = readFileSync(resolve(__dirname, 'async-video-pipeline.sql'), 'utf8');
const res = await fetch(`${url}/rest/v1/rpc`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
console.log('status', res.status);
console.log((await res.text()).slice(0, 500));