import { normalizeNavConfig, DEFAULT_NAV_CONFIG } from '../src/lib/nav-config.ts';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};
const ALL = DEFAULT_NAV_CONFIG.order.length;

// 1) 生产真实保存过的配置（缺 tokpure）
const prodSaved = {
  order: ['home','clips','inviteFriends','shorts','tiktokRemix','notes','marketing','digitalHuman','digitalHumanLive','podcast','aiTools','blog','pricing','download','about','localEngine','aiVideo','news','article'],
  hidden: ['aiVideo','digitalHumanLive','tiktokRemix'],
};
const r1 = normalizeNavConfig(prodSaved);
console.log('  1) merged:', r1.order.join(','));
ok('tokpure 紧跟高光笔记', r1.order.indexOf('tokpure') === r1.order.indexOf('notes') + 1);
ok('已有 key 位置零扰动（localEngine 保持原位）', r1.order.indexOf('localEngine') === 16);
ok('news/article/aiVideo 尾部顺序保持', r1.order.slice(-3).join(',') === 'aiVideo,news,article');
ok('hidden 保持', r1.hidden.join(',') === 'aiVideo,digitalHumanLive,tiktokRemix');
ok('无重复', new Set(r1.order).size === r1.order.length);

// 2) 全新用户（无保存配置）→ 完全等于默认
const r2 = normalizeNavConfig(null);
ok('默认顺序完整', r2.order.join(',') === DEFAULT_NAV_CONFIG.order.join(','));
ok('默认顺序下 tokpure 在高光笔记下方', r2.order.indexOf('tokpure') === r2.order.indexOf('notes') + 1);

// 3) 管理员把 tokpure 手动移到最前 → 尊重；其余缺失 key 不得被拽到顶部
const r3 = normalizeNavConfig({ order: ['tokpure','home','clips','notes'], hidden: [] });
console.log('  3) merged:', r3.order.join(','));
const rel = (a: string, b: string) => r3.order.indexOf(a) < r3.order.indexOf(b);
ok('管理员把 tokpure 置顶被尊重', r3.order[0] === 'tokpure');
ok('管理员既有 4 个 key 相对顺序保持', rel('tokpure','home') && rel('home','clips') && rel('clips','notes'));
ok('缺失 key 未被拽到顶部', r3.order.indexOf('marketing') > r3.order.indexOf('notes'));
ok('补齐后长度正确且无重复', r3.order.length === ALL && new Set(r3.order).size === ALL);

// 4) 显式隐藏 tokpure → 保持隐藏
const r4 = normalizeNavConfig({ order: ['home','clips','notes'], hidden: ['tokpure'] });
ok('显式隐藏被尊重', r4.hidden.includes('tokpure'));

// 5) 空 / 非法 / 脏数据
ok('{} → 默认', normalizeNavConfig({}).order.join(',') === DEFAULT_NAV_CONFIG.order.join(','));
ok('字符串 → 默认', normalizeNavConfig('x').order.join(',') === DEFAULT_NAV_CONFIG.order.join(','));
ok('脏 key 被过滤', !normalizeNavConfig({ order: ['home','__hack__','clips'], hidden: ['evil'] }).order.includes('__hack__' as never));
ok('重复 key 去重', normalizeNavConfig({ order: ['home','home','clips'], hidden: ['home','home'] }).order.filter((k) => k === 'home').length === 1);
ok('空 order → 补齐为完整默认顺序', normalizeNavConfig({ order: [], hidden: [] }).order.length === ALL);

// 6) 补齐必须幂等（二次 normalise 不再变化）
const again = normalizeNavConfig(r1);
ok('幂等：二次归一化结果一致', again.order.join(',') === r1.order.join(','));

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
