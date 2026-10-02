import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const TOKEN = JSON.parse(readFileSync(path.join(process.env.HOME, '.vercel/auth.json'), 'utf8')).token;
const TEAM = 'team_793fiffXc4NVumMgi46s1NIw';
const PROJECT_ID = 'prj_Fy2AGpMSxLEBrOtnsRZkG8UA63Oz';
const PROJECT_NAME = 'projects';
const ROOT = '/Users/aiven/Desktop/AI/codex/projects';
const DRY_RUN = process.argv.includes('--dry-run');
const H = { Authorization: `Bearer ${TOKEN}` };

async function api(method, url, body, extraHeaders = {}) {
  const res = await fetch(url, { method, headers: { ...H, ...extraHeaders }, body });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json */ }
  if (!res.ok) throw new Error(`${method} ${url.split('?')[0]} -> ${res.status}: ${text.slice(0, 400)}`);
  return json;
}

// 1) 最新生产部署
const deps = await api('GET', `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM}&target=production&limit=5`);
console.log('近期生产部署：');
for (const d of deps.deployments || []) console.log(`  ${d.uid}  ${d.state}  ${new Date(d.created).toISOString()}`);
const baseline = (deps.deployments || []).find((d) => d.state === 'READY') || deps.deployments?.[0];
if (!baseline) throw new Error('找不到生产基线部署');
console.log(`\n基线：${baseline.uid} (${baseline.url})`);

// 2) 基线文件树
const tree = await api('GET', `https://api.vercel.com/v6/deployments/${baseline.uid}/files?teamId=${TEAM}`);
const flat = [];
// 响应形如 [ {name:'src', type:'directory', children:[…仓库根…]}, {name:'out',…} ]
// 仓库根 = children 里含 package.json 的那个节点。目录名本身不是路径的一部分。
const top = Array.isArray(tree) ? tree : [tree];
const rootNode = top.find((n) => (n.children || []).some((c) => c.name === 'package.json')) || top[0];
const baselineDirs = new Set();
(function walk(nodes, prefix) {
  for (const n of nodes || []) {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.children) { baselineDirs.add(p); walk(n.children, p); }
    else if (n.uid) flat.push({ file: p, sha: n.uid });
  }
})(rootNode.children || [], '');
console.log(`基线文件数：${flat.length}，基线目录数：${baselineDirs.size}`);

// 3a) 新增文件：基线里没有、但位于基线已部署目录树内、且属于源码目录（src/）的本地文件。
// 严格限定范围，避免把 .env / .git / .pwtest / 本地虚拟环境等无关文件带上生产。
const sha1 = (buf) => createHash('sha1').update(buf).digest('hex');
const baselineFiles = new Set(flat.map((f) => f.file));
const SKIP_NAMES = new Set(['.DS_Store', 'node_modules', '__pycache__']);
/** 只有源码目录下的新增文件才允许进入部署清单 */
const NEW_FILE_PREFIX = 'src/';
const newFiles = [];
const newSeen = new Set();
function scanNew(absDir, relDir) {
  let entries = [];
  try { entries = readdirSync(absDir); } catch { return; }
  for (const name of entries) {
    if (SKIP_NAMES.has(name) || name.startsWith('.')) continue;
    const rel = relDir ? `${relDir}/${name}` : name;
    if (baselineFiles.has(rel)) continue;
    const abs = path.join(absDir, name);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) {
      scanNew(abs, rel);
    } else if (st.isFile() && rel.startsWith(NEW_FILE_PREFIX) && !newSeen.has(rel)) {
      newSeen.add(rel);
      newFiles.push({ file: rel, sha: sha1(readFileSync(abs)), size: st.size });
    }
  }
}
for (const d of baselineDirs) {
  if (!d.startsWith(NEW_FILE_PREFIX.replace(/\/$/, ''))) continue;
  const abs = path.join(ROOT, d);
  if (existsSync(abs)) scanNew(abs, d);
}
console.log(`\n新增源码文件（基线中不存在，需上传）：${newFiles.length}`);
for (const n of newFiles) console.log(`   + ${n.file}  (${n.size} bytes)`);

// 3) 本地 sha 对比
const changed = [], missing = [], same = [];
for (const f of flat) {
  const abs = path.join(ROOT, f.file);
  if (!existsSync(abs) || !statSync(abs).isFile()) { missing.push(f.file); continue; }
  const buf = readFileSync(abs);
  const s = sha1(buf);
  if (s !== f.sha) changed.push({ file: f.file, sha: s, size: buf.length });
  else same.push(f.file);
}
console.log(`\n本地与基线一致：${same.length}`);
console.log(`本地缺失（保持基线版本）：${missing.length}`);
for (const m of missing.slice(0, 20)) console.log(`   - ${m}`);
console.log(`\n内容有变化（需上传）：${changed.length}`);
for (const c of changed) console.log(`   * ${c.file}  (${c.size} bytes)`);

if (DRY_RUN) { console.log('\n[DRY RUN] 未上传、未部署。'); process.exit(0); }

// 4) 上传内容有变化的文件 + 新增文件
for (const c of [...changed, ...newFiles]) {
  const buf = readFileSync(path.join(ROOT, c.file));
  await api('POST', `https://api.vercel.com/v2/files?teamId=${TEAM}`, buf, {
    'x-vercel-digest': c.sha,
    'Content-Length': String(buf.length),
    'Content-Type': 'application/octet-stream',
  });
  console.log(`uploaded  ${c.file}  (${buf.length} bytes)`);
}

// 5) 全量文件清单：未变化的沿用基线 sha；新增文件追加进清单
const changedMap = new Map(changed.map((c) => [c.file, c.sha]));
// 本地已删除（基线有、本地没有）的文件从清单剔除：否则 statSync 直接 ENOENT 崩掉部署，
// 且会把已删掉的死代码继续带到线上。
const missingSet = new Set(missing);
const files = [
  ...flat.filter((f) => !missingSet.has(f.file)).map((f) => ({
    file: f.file,
    sha: changedMap.get(f.file) || f.sha,
    size: statSync(path.join(ROOT, f.file)).size,
  })),
  ...newFiles.map((n) => ({ file: n.file, sha: n.sha, size: n.size })),
];
console.log(`部署文件清单：${files.length} 个（基线 ${flat.length} - 删除 ${missing.length} + 新增 ${newFiles.length}）`);

// 6) 创建生产部署
const dep = await api(
  'POST',
  `https://api.vercel.com/v13/deployments?teamId=${TEAM}&forceNew=1`,
  JSON.stringify({
    name: PROJECT_NAME,
    project: PROJECT_ID,
    target: 'production',
    files,
    projectSettings: {
      framework: 'nextjs',
      buildCommand: 'pnpm next build',
      installCommand: 'pnpm install',
      nodeVersion: '24.x',
    },
  }),
  { 'Content-Type': 'application/json' },
);
console.log(`\n部署已创建：${dep.id}  ${dep.url || ''}`);

// 7) 轮询直到 READY / ERROR
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 15000));
  const d = await api('GET', `https://api.vercel.com/v13/deployments/${dep.id}?teamId=${TEAM}`);
  const state = d.readyState || d.status;
  if (state === 'READY') {
    console.log(`\nREADY  https://${d.url}`);
    console.log(`别名：${(d.alias || []).join(', ') || '(见 Vercel 面板)'}`);
    process.exit(0);
  }
  if (state === 'ERROR' || state === 'CANCELED') {
    console.error(`\n部署失败：${state}`);
    const ev = await api('GET', `https://api.vercel.com/v3/deployments/${dep.id}/events?teamId=${TEAM}&limit=60`).catch(() => null);
    for (const e of ev || []) console.log(`[${e.type}] ${String(e.text || e.payload?.text || '').slice(0, 300)}`);
    process.exit(1);
  }
  if (i % 4 === 0) console.log(`  ${state} …`);
}
console.error('轮询超时');
process.exit(1);