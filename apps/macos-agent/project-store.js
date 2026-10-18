'use strict';

/**
 * P0-2 本地工程文件 Project as File · 本地工程库（零依赖，JSON + 原子写）
 *
 * 工作区：`userData/projects/`，一个工程 = 一个 `<id>.clipop` 文件（单文件 JSON 工程包）。
 * 素材以**路径引用**，不复制内容 → 工程文件极小、可随时拷走、可导入导出。
 *
 * 工程结构（version 1）：
 * {
 *   format: 'clipop-project', version: 1,
 *   id, name, createdAt, updatedAt,
 *   brandId,                                   // 关联 P0-1 品牌套件（仅引用 id，不复制资产）
 *   settings: { aspect, quality, locale },     // 导出设置（断点续作时复用）
 *   materials: [ { id, fileName, filePath, sizeBytes, duration, addedAt } ],
 *   clips:     [ { id, materialId, start, end, title, summary, status, score } ],
 * }
 *
 * 设计取舍：只落本机、零上传；逐字段容错（外部改坏也不抛，回落默认）；
 *          格式版本化（读到更高版本 → 结构化报错，避免误降级覆盖）。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 1;
const FORMAT = 'clipop-project';
const EXT = '.clipop';

const ASPECT_KEYS = ['9:16', '1:1', '16:9'];
const QUALITY_KEYS = ['free', 'starter', 'pro'];
const CLIP_STATUS = ['pending', 'confirmed', 'rejected', 'deferred'];

function toStr(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function nonNeg(v, fallback = 0) {
  const n = toNum(v, fallback);
  return n < 0 ? 0 : n;
}

function nowIso() {
  return new Date().toISOString();
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

function sanitizeId(v) {
  return String(v == null ? '' : v).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function normalizeMaterial(input) {
  const r = input && typeof input === 'object' ? input : {};
  return {
    id: toStr(r.id, 60) || genId('mat'),
    fileName: toStr(r.fileName, 200),
    filePath: toStr(r.filePath, 1024),
    sizeBytes: nonNeg(r.sizeBytes, 0),
    duration: nonNeg(r.duration, 0),
    addedAt: toStr(r.addedAt, 40) || nowIso(),
  };
}

function normalizeClip(input) {
  const r = input && typeof input === 'object' ? input : {};
  const start = nonNeg(r.start, 0);
  const end = Math.max(start, nonNeg(r.end, 0));
  return {
    id: toStr(r.id, 60) || genId('clip'),
    materialId: toStr(r.materialId, 60),
    start,
    end,
    title: toStr(r.title, 120),
    summary: toStr(r.summary, 400),
    status: CLIP_STATUS.includes(r.status) ? r.status : 'pending',
    score: toNum(r.score, 0),
  };
}

function normalizeSettings(input) {
  const r = input && typeof input === 'object' ? input : {};
  return {
    aspect: ASPECT_KEYS.includes(r.aspect) ? r.aspect : '9:16',
    quality: QUALITY_KEYS.includes(r.quality) ? r.quality : 'starter',
    locale: toStr(r.locale, 20),
  };
}

/** 逐字段容错归一化一个工程。 */
function normalizeProject(input, fallbackId) {
  const r = input && typeof input === 'object' ? input : {};
  const id = sanitizeId(r.id) || sanitizeId(fallbackId) || genId('proj');
  const materials = (Array.isArray(r.materials) ? r.materials : []).map(normalizeMaterial);
  const materialIds = new Set(materials.map((m) => m.id));
  const clips = (Array.isArray(r.clips) ? r.clips : [])
    .map(normalizeClip)
    // 丢弃指向不存在素材的孤儿片段（外部改坏时保持工程自洽）；未指派素材（materialId 为空）保留
    .filter((c) => !c.materialId || materialIds.has(c.materialId));
  const createdAt = toStr(r.createdAt, 40) || nowIso();
  return {
    format: FORMAT,
    version: VERSION,
    id,
    name: toStr(r.name, 80) || '未命名工程',
    createdAt,
    updatedAt: toStr(r.updatedAt, 40) || createdAt,
    brandId: toStr(r.brandId, 60),
    settings: normalizeSettings(r.settings),
    materials,
    clips,
  };
}

function defaultProject(name) {
  return normalizeProject({ name: name || '未命名工程' });
}

/** 素材路径缺失清单：素材被移动/删除后用于「重新定位」。 */
function missingMaterials(project) {
  const missing = [];
  for (const m of project.materials || []) {
    if (!m.filePath || !fs.existsSync(m.filePath)) {
      missing.push({ id: m.id, fileName: m.fileName, filePath: m.filePath });
    }
  }
  return missing;
}

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * 工程文件 store。
 * @param {{rootDir:string}} opts rootDir = 工作区目录（userData/projects）
 */
function createProjectStore({ rootDir }) {
  if (!rootDir) throw new Error('project-store: rootDir is required');

  const projectFile = (id) => path.join(rootDir, `${sanitizeId(id)}${EXT}`);

  async function ensureDirs() {
    await fsp.mkdir(rootDir, { recursive: true });
  }

  async function writeJson(file, data) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(2).toString('hex')}`;
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tmp, file);
  }

  /** 解析并校验一个 `.clipop` 文件；格式/版本不合法时抛结构化错误。 */
  function readProjectFile(file) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      throw fail('PROJECT_PARSE_FAILED', '工程文件无法解析（JSON 损坏）');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw fail('PROJECT_INVALID', '工程文件结构不正确');
    }
    if (parsed.format && parsed.format !== FORMAT) {
      throw fail('PROJECT_BAD_FORMAT', '这不是一个 Clipop 工程文件');
    }
    if (Number(parsed.version) > VERSION) {
      throw fail('PROJECT_VERSION_TOO_NEW', '该工程由更新版本的客户端创建，请升级后再打开');
    }
    return normalizeProject(parsed, path.basename(file, EXT));
  }

  /** 工作区工程列表（含素材缺失计数），按更新时间倒序。 */
  async function list() {
    await ensureDirs();
    const names = await fsp.readdir(rootDir).catch(() => []);
    const projects = [];
    for (const name of names) {
      if (!name.endsWith(EXT)) continue;
      let p;
      try {
        p = readProjectFile(path.join(rootDir, name));
      } catch {
        continue; // 坏文件跳过，不阻塞列表
      }
      projects.push({
        id: p.id,
        name: p.name,
        brandId: p.brandId,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        materialCount: p.materials.length,
        clipCount: p.clips.length,
        missingCount: missingMaterials(p).length,
      });
    }
    return {
      projects: projects.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
      dir: rootDir,
    };
  }

  /** 读取工程：{id} 走工作区，{path} 读任意位置的工程文件。返回工程 + 缺失素材清单。 */
  async function read(input) {
    const p = toStr(input && input.path, 1024);
    const id = sanitizeId(input && input.id);
    if (!p && !id) throw fail('PROJECT_NO_TARGET', '缺少工程 id 或路径');
    const file = p ? path.resolve(p) : projectFile(id);
    if (!fs.existsSync(file)) throw fail('PROJECT_NOT_FOUND', '工程文件不存在');
    const project = readProjectFile(file);
    return { ok: true, project, path: file, workspace: !p, missing: missingMaterials(project) };
  }

  /** 新建工程并落工作区。 */
  async function create(input) {
    await ensureDirs();
    const project = normalizeProject({
      name: input && input.name,
      brandId: input && input.brandId,
      settings: input && input.settings,
    });
    await writeJson(projectFile(project.id), project);
    return { ok: true, project, path: projectFile(project.id) };
  }

  /**
   * 保存工程。input: { project } 或工程对象本身；可选 { path } 指定外部目标，
   * 缺省写回工作区 `<id>.clipop`。
   */
  async function save(input) {
    const src = (input && input.project) || input || {};
    const project = normalizeProject(src, src && src.id);
    project.updatedAt = nowIso();
    const p = toStr(input && input.path, 1024);
    const file = p ? path.resolve(p) : projectFile(project.id);
    await writeJson(file, project);
    return { ok: true, project, path: file };
  }

  async function remove(id) {
    const sid = sanitizeId(id);
    if (!sid) return { ok: false };
    const file = projectFile(sid);
    if (!fs.existsSync(file)) return { ok: false };
    await fsp.unlink(file);
    return { ok: true, id: sid };
  }

  /** 把外部 `.clipop` 导入工作区（复制一份进来，不移动原文件）。 */
  async function importFromPath(srcPath) {
    const src = toStr(srcPath, 1024);
    if (!src || !fs.existsSync(src)) throw fail('PROJECT_IMPORT_MISSING', '要导入的工程文件不存在');
    if (path.extname(src).toLowerCase() !== EXT) throw fail('PROJECT_IMPORT_BAD_TYPE', '仅支持 .clipop 工程文件');
    await ensureDirs();
    const project = readProjectFile(src);
    // 工作区已有同 id 时换新 id，避免覆盖用户现有工程
    if (fs.existsSync(projectFile(project.id))) project.id = genId('proj');
    project.updatedAt = nowIso();
    await writeJson(projectFile(project.id), project);
    return { ok: true, project, path: projectFile(project.id), missing: missingMaterials(project) };
  }

  /** 把工作区工程导出（另存为 `.clipop`，用于换机器带走 / 归档）。 */
  async function exportTo(input) {
    const id = sanitizeId(input && input.id);
    const dest = toStr(input && input.destPath, 1024);
    if (!id || !dest) throw fail('PROJECT_EXPORT_ARGS', '缺少工程 id 或导出路径');
    const file = projectFile(id);
    if (!fs.existsSync(file)) throw fail('PROJECT_NOT_FOUND', '工程文件不存在');
    const project = readProjectFile(file);
    let target = path.resolve(dest);
    if (path.extname(target).toLowerCase() !== EXT) target += EXT;
    await writeJson(target, project);
    return { ok: true, path: target };
  }

  /** 素材失效后重新定位：替换某个素材的文件路径（并刷新文件名/体积）。 */
  async function relink(input) {
    const id = sanitizeId(input && input.id);
    const materialId = toStr(input && input.materialId, 60);
    const newPath = toStr(input && input.newPath, 1024);
    if (!id || !materialId || !newPath) throw fail('PROJECT_RELINK_ARGS', '缺少工程 id / 素材 id / 新路径');
    const file = projectFile(id);
    if (!fs.existsSync(file)) throw fail('PROJECT_NOT_FOUND', '工程文件不存在');
    const project = readProjectFile(file);
    const mat = project.materials.find((m) => m.id === materialId);
    if (!mat) throw fail('PROJECT_MATERIAL_NOT_FOUND', '该素材不在工程中');
    mat.filePath = path.resolve(newPath);
    mat.fileName = path.basename(newPath);
    const st = await fsp.stat(newPath).catch(() => null);
    if (st && st.size) mat.sizeBytes = st.size;
    project.updatedAt = nowIso();
    await writeJson(file, project);
    return { ok: true, project, missing: missingMaterials(project) };
  }

  return {
    rootDir,
    ext: EXT,
    list,
    read,
    create,
    save,
    remove,
    importFromPath,
    exportTo,
    relink,
  };
}

module.exports = {
  createProjectStore,
  normalizeProject,
  normalizeMaterial,
  normalizeClip,
  missingMaterials,
  defaultProject,
  VERSION,
  FORMAT,
  EXT,
};
