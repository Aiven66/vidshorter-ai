#!/usr/bin/env node
/**
 * 构建后补丁: 把 linux-x64 原生共享库写入 .next/server 下所有 .nft.json 清单，
 * 让 Vercel 把它们打进 Serverless Function。
 *
 * 为什么需要（2026-09-04 生产日志实证）:
 *   nft (node-file-trace) 只做静态分析，看不见两类原生依赖:
 *   1. onnxruntime-node: binding .node 通过 RPATH $ORIGIN dlopen 同目录的
 *      libonnxruntime.so.1 —— ELF 动态加载无法被静态追踪，线上报
 *      "libonnxruntime.so.1: cannot open shared object file"。
 *   2. sharp: @img/sharp-linux-x64 的 .node 通过 RUNPATH
 *      $ORIGIN/../../sharp-libvips-linux-x64/lib 引用 libvips-cpp.so.8.18.3，
 *      线上报 "libvips-cpp.so.8.18.3: cannot open shared object file"。
 *   （ffmpeg-static 的二进制 nft 可天然追踪，无需处理）
 *
 * 为什么不在源码里 require / 不用 outputFileTracingIncludes:
 *   - require.resolve(任何可折叠形式) 都会被 Turbopack 静态解析成二进制模块，
 *     构建直接失败（Unknown module type / invalid utf-8）。
 *   - outputFileTracingIncludes 是路由级 tracing 配置，会让 Vercel 取消函数
 *     批处理（73 条路由逐个成函数），触发 Hobby 计划 12 函数上限部署失败。
 *   - 直接改写 .nft.json 是 Vercel 官方 @vercel/next 打包消费的清单格式，
 *     不影响函数批处理，源码零侵入。
 *
 * 运行时机: vercel.json buildCommand 里 `pnpm next build && node scripts/patch-native-nft.mjs`。
 * 平台行为: 仅当文件存在时写入（linux 构建机上 @img/sharp-libvips-linux-x64
 * 等 linux 变体才会安装；本地 mac 构建自动跳过缺失项，脚本永不失败）。
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const serverDir = path.join(root, '.next', 'server');

/** 递归收集 .next/server 下全部 .nft.json 清单 */
function findManifests(dir, out = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) findManifests(full, out);
    else if (name.endsWith('.nft.json')) out.push(full);
  }
  return out;
}

/**
 * 组装需要追加的原生文件（绝对真实路径，pnpm 符号链接已解析）。
 * 返回 null 表示当前构建平台缺该文件（如本地 mac 无 linux 变体），跳过。
 */
function collectLinuxNatives() {
  const adds = { onnx: [], libvips: [] };

  // 1. onnxruntime-node Linux x64 共享库（包内自带全平台二进制，任何平台都存在）
  const onnxSo = path.join(root, 'node_modules/onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime.so.1');
  if (existsSync(onnxSo)) adds.onnx.push(realpathSync(onnxSo));

  // 2. sharp 的 libvips linux-x64 全部共享库（libvips-cpp 依赖同目录的
  //    libvips.so.42 / libglib 等伴生 .so，必须整目录打入）
  const libvipsDir = path.join(root, 'node_modules/@img/sharp-libvips-linux-x64/lib');
  if (existsSync(libvipsDir)) {
    for (const name of readdirSync(realpathSync(libvipsDir))) {
      const f = path.join(libvipsDir, name);
      if (statSync(f).isFile()) adds.libvips.push(realpathSync(f));
    }
    // 3. RUNPATH 需要的 .pnpm 内部兄弟符号链接:
    //    .pnpm/@img+sharp-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64
    //    （.node 的 RUNPATH $ORIGIN/../../sharp-libvips-linux-x64/lib 经它解析到真实包）
    const sharpLinuxDir = path.join(root, 'node_modules/@img/sharp-linux-x64');
    if (existsSync(sharpLinuxDir)) {
      const sibling = path.join(path.dirname(realpathSync(sharpLinuxDir)), 'sharp-libvips-linux-x64');
      if (existsSync(sibling)) adds.libvips.push(sibling); // 保留符号链接路径本身
    }
  }
  return adds;
}

const natives = collectLinuxNatives();
if (natives.onnx.length === 0 && natives.libvips.length === 0) {
  console.log('[patch-native-nft] no linux native libs found (non-linux build?) — nothing to do');
  process.exit(0);
}

const manifests = findManifests(serverDir);
if (manifests.length === 0) {
  console.error('[patch-native-nft] no .nft.json found under .next/server — was `next build` run?');
  process.exit(1);
}

let patched = 0;
let addedTotal = 0;
for (const manifestPath of manifests) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    continue;
  }
  if (!Array.isArray(manifest.files)) continue;

  const has = (needle) => manifest.files.some((f) => f.includes(needle));
  // 清单已追踪 onnxruntime 绑定的路由 → 补 .so；已追踪 sharp 平台绑定的 → 补 libvips
  const needOnnx = natives.onnx.length > 0 && has('onnxruntime-node');
  const needLibvips = natives.libvips.length > 0 && has('@img/sharp-');
  if (!needOnnx && !needLibvips) continue;

  const rel = (abs) => path.relative(path.dirname(manifestPath), abs);
  const additions = [
    ...(needOnnx ? natives.onnx : []),
    ...(needLibvips ? natives.libvips : []),
  ].map(rel);

  const before = manifest.files.length;
  for (const entry of additions) {
    if (!manifest.files.includes(entry)) manifest.files.push(entry);
  }
  if (manifest.files.length > before) {
    writeFileSync(manifestPath, JSON.stringify(manifest));
    patched++;
    addedTotal += manifest.files.length - before;
    console.log(
      `[patch-native-nft] ${path.relative(root, manifestPath)} +${manifest.files.length - before}` +
        ` (onnx:${needOnnx ? 1 : 0} libvips:${needLibvips ? 1 : 0})`
    );
  }
}

console.log(`[patch-native-nft] done: ${patched} manifests patched, ${addedTotal} entries added`);
