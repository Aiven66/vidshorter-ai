'use strict';

/**
 * 高光规则本地持久化（P0-2 T2.3）
 *
 * 存储：`userData/highlight-rules.json`，结构为
 *   { version: 1, profiles: { [profileId]: { keep, drop, prefs } } }
 *
 * 按 profileId（频道/创作者档案）索引，可保存多套规则；读取时统一走 scorer 的
 * normalizeRules 做容错，保证落盘内容被外部改坏也不会让调用方拿到非法结构。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { normalizeRules, DEFAULT_PREFS } = require('./local-highlight-scorer');

const DEFAULT_PROFILE_ID = 'default';
const VERSION = 1;

function createRuleStore({ filePath }) {
  if (!filePath) throw new Error('local-highlight-rules: filePath is required');

  function readStore() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && parsed.profiles && typeof parsed.profiles === 'object') {
        return { version: VERSION, profiles: parsed.profiles };
      }
    } catch {}
    return { version: VERSION, profiles: {} };
  }

  /** 读取某套规则；不存在时返回该 profileId 的空规则模板。 */
  function load(profileId) {
    const id = String(profileId || DEFAULT_PROFILE_ID);
    const store = readStore();
    const raw = store.profiles[id];
    return normalizeRules(raw ? { profileId: id, ...raw } : { profileId: id }, id);
  }

  function listProfiles() {
    return Object.keys(readStore().profiles);
  }

  /** 保存一套规则（幂等覆盖同 profileId）。 */
  async function save(rules) {
    const normalized = normalizeRules(rules, rules && rules.profileId);
    const store = readStore();
    store.profiles[normalized.profileId] = {
      keep: normalized.keep,
      drop: normalized.drop,
      prefs: normalized.prefs,
    };
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, JSON.stringify({ version: VERSION, profiles: store.profiles }, null, 2), 'utf8');
    return { ok: true, rules: normalized };
  }

  return { filePath, defaultProfileId: DEFAULT_PROFILE_ID, load, save, listProfiles };
}

module.exports = { createRuleStore, DEFAULT_PROFILE_ID, DEFAULT_PREFS };
