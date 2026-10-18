'use strict';

/**
 * YueCut · 粤语 / 带货话术语言工具（纯函数，零依赖）
 *
 * 设计原则：
 *  - 所有判定基于可解释的词库与规则，不输出模型式的「置信概率」；
 *  - 粤语→书面中文是词库替换，结果必须在 UI 标注「本地词库转换，建议复核」；
 *  - 价格解析同时支持阿拉伯数字与中文/粤语口语数字（一百二十九、六十四個半）。
 */

// ── 数字与价格 ──────────────────────────────────────────────────────────────

const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 貳: 2, 贰: 2, 兩: 2, 两: 2, 三: 3, 叁: 3, 四: 4, 五: 5, 伍: 5, 六: 6, 七: 7, 捌: 8, 八: 8, 九: 9, 玖: 9 };
const CN_UNITS = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 萬: 10000, 万: 10000 };

/** 解析中文/粤语口语数字：「一百二十九」→129、「六十四」→64。无法解析返回 null。 */
function parseChineseNumber(input) {
  const s = String(input || '').replace(/[\s,，]/g, '');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);

  let total = 0;
  let section = 0;
  let current = 0;
  let matched = false;
  for (const ch of s) {
    if (ch in CN_DIGITS) {
      current = CN_DIGITS[ch];
      matched = true;
    } else if (ch in CN_UNITS) {
      const unit = CN_UNITS[ch];
      if (unit === 10000) {
        section = (section + (current || 1)) * unit;
        total += section;
        section = 0;
      } else {
        section += (current || 1) * unit;
      }
      current = 0;
      matched = true;
    } else {
      return null;
    }
  }
  const value = total + section + current;
  return matched && value > 0 ? value : null;
}

/**
 * 从文本提取价格。支持：
 *  ¥129 / $129 / 129蚊 / 129 蚊 / 129块 / 129元 / 一百二十九蚊 / 64.5
 *  粤语尾数：「六十四個半」「十個半」= 64.5 / 10.5（half）。
 * @returns {Array<{amount:number, raw:string, source:string}>}
 */
function extractPrices(text) {
  const s = String(text || '');
  const out = [];
  const seen = new Set();

  const push = (amount, raw, source) => {
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return;
    const key = `${amount}|${raw}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ amount: Math.round(amount * 100) / 100, raw, source });
  };

  // 1) 货币符号 + 阿拉伯数字
  const symbolRe = /[¥￥$]\s?(\d{1,3}(?:[,，]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  let m;
  while ((m = symbolRe.exec(s))) {
    const n = Number(m[1].replace(/[,，]/g, ''));
    if (Number.isFinite(n)) push(n, m[0], 'symbol');
  }

  // 2) 阿拉伯数字 + 货币单位（蚊/块/元/蚊雞/港幣/港元/人民币/MB/HKD）
  const unitNumRe = /(\d+(?:\.\d{1,2})?)\s*(?:蚊雞|蚊|块錢|块|元錢|元|港幣|港元|港币|HKD|RMB|CNY)/gi;
  while ((m = unitNumRe.exec(s))) {
    push(Number(m[1]), m[0], 'digit-unit');
  }

  // 3) 中文数字 + （個半 / 个半 / 蚊半）→ x.5
  const halfRe = /([零〇一壹二貳贰兩两三叁四五六七捌八玖九九十拾百佰千萬万]{1,8})\s*(?:個|个)?半(?=\s*(?:蚊|元|块|錢|钱|嚟|来|帶走|带走|瓶|支|盒|組|组|套|片|件|樽|袋|條|条|咋|喇|啦|㗎|呀|啊|嘅|喎|$|[，。！？!?、]))/g;
  while ((m = halfRe.exec(s))) {
    const base = parseChineseNumber(m[1]);
    if (base) push(base + 0.5, m[0], 'chinese-half');
  }

  // 4) 中文数字 + 货币单位
  const cnUnitRe = /([零〇一壹二貳贰兩两三叁四五六七捌八玖九九十拾百佰千萬万]{2,8})\s*(?:蚊雞|蚊|块錢|块|元錢|元|港幣|港元|港币)/g;
  while ((m = cnUnitRe.exec(s))) {
    const n = parseChineseNumber(m[1]);
    if (n) push(n, m[0], 'chinese-unit');
  }

  return out.sort((a, b) => b.amount - a.amount);
}

// ── 粤语 → 书面中文（词库替换）────────────────────────────────────────────────
// 长词优先；替换完成后 UI 必须提示这是本地词库转换。

const YUE_TO_ZH = [
  ['唔好意思', '不好意思'], ['唔記得', '忘记'], ['唔記得咗', '忘记了'],
  ['而家', '现在'], ['依家', '现在'], ['家陣', '现在'],
  ['唔係', '不是'], ['唔系', '不是'], ['係唔係', '是不是'], ['系唔系', '是不是'],
  ['嘅話', '的话'], ['嘅', '的'], ['咁樣', '这样'], ['咁样', '这样'], ['咁', '这么'],
  ['嚟', '来'], ['返去', '回去'], ['返嚟', '回来'], ['返来', '回来'], ['入嚟', '进来'], ['入来', '进来'],
  ['睇吓', '看看'], ['睇下', '看下'], ['睇', '看'], ['望吓', '看看'],
  ['揾', '找'], ['搵', '找'], ['揾到', '找到'],
  ['乜嘢', '什么'], ['咩', '什么'], ['乜', '什么'],
  ['點解', '为什么'], ['点解', '为什么'], ['幾多', '多少'], ['几多', '多少'],
  ['邊度', '哪里'], ['边度', '哪里'], ['邊個', '哪个'], ['边个', '哪个'],
  ['冇', '没有'], ['未', '没'], ['唔使', '不用'], ['唔使怕', '不用担心'],
  ['唔', '不'], ['好唔好', '好不好'],
  ['得唔得', '行不行'], ['掂', '行'],
  ['嘅话', '的话'],
  ['姊妹們', '姐妹们'], ['姊妹们', '姐妹们'], ['姊妹', '姐妹'],
  ['哋', '们'], ['佢哋', '他们'], ['佢', '他/她'], ['我哋', '我们'],
  ['咗', '了'], ['咗啦', '了'], ['喇', '了'], ['啦', '啦'], ['嘞', '了'],
  ['㗎', '的'], ['㗎啦', '的'], ['嘅', '的'],
  ['嗰', '那'], ['个', '个'], ['呢', '这'], ['哩', '这'],
  ['啲', '些'], ['尋晚', '昨晚'], ['琴晚', '昨晚'], ['朝早', '早上'], ['夜晚', '晚上'],
  ['一齊', '一起'], ['一齐', '一起'], ['一陣', '一会'], ['一阵', '一会'],
  ['即刻', '马上'], ['立時', '立刻'],
  ['話', '话'], ['講', '讲'], ['話畀', '告诉'],
  ['知', '知道'], ['知唔知', '知不知道'],
  ['落單', '下单'], ['落咗单', '下了单'], ['單', '单'],
  ['購物車', '购物车'], ['購物', '购物'], ['車', '车'],
  ['連結', '链接'], ['链接', '链接'], ['鏈接', '链接'],
  ['揀', '选'], ['揀兩支裝', '选两支装'], ['拍', '拍'],
  ['帶走', '带走'], ['就帶走', '就带走'],
  ['蚊', '元'], ['個半', '块五'], ['個', '个'],
  ['塊面', '脸上'], ['块面', '脸上'], ['面', '脸'],
  ['搓勻', '搓匀'], ['按上', '按上'], ['搽', '涂'], ['敷', '敷'],
  ['捱夜', '熬夜'], ['貼服', '贴服'], ['服帖', '服帖'],
  ['神經酰胺', '神经酰胺'], ['玻尿酸', '玻尿酸'], ['精華', '精华'], ['面膜', '面膜'], ['面霜', '面霜'],
  ['敏感肌', '敏感肌'], ['成分', '成分'], ['證件', '证件'],
  ['真係', '真的'], ['真系', '真的'], ['超正', '超好'], ['正', '好'],
  ['好掂', '很好'], ['唔錯', '不错'], ['唔错', '不错'],
  ['出事', '出问题'], ['敏感', '过敏/敏感'], ['繃緊', '紧绷'],
  ['泵', '泵'], ['兩泵', '两泵'], ['兩支', '两支'], ['兩支裝', '两支装'],
  ['一支', '一支'], ['兩', '两'],
  ['一百二十九', '一百二十九'], ['六十四', '六十四'],
];

/** 粤语口语 → 书面中文（本地词库，非模型翻译；长词优先避免覆盖）。 */
function yueToWritten(input) {
  let out = String(input || '');
  const pairs = YUE_TO_ZH.slice().sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of pairs) {
    if (from === to) continue;
    out = out.split(from).join(to);
  }
  // 标点/异体收口
  return out.replace(/「/g, '“').replace(/」/g, '”');
}

// ── 话术词类（可解释的剪切规则依据）────────────────────────────────────────────

/** 开场钩子：提问 / 反问 / 命令 / 称呼。 */
const HOOK_TERMS = [
  '點解', '点解', '為什麼', '为什么', '係唔係', '是不是', '好唔好', '得唔得', '知唔知',
  '唔好', '千祈', '記住', '记住', '睇清楚', '看清楚', '注意', '姊妹們', '姐妹们', '兄弟',
  '唔係', '不是', '竟然', '原來', '原来', '絕對', '绝对', '一定要', '千祈唔好',
  '有冇', '有没有', '幾多', '多少', '邊個', '谁',
];

/** 效果演示：现场试用动词。 */
const DEMO_TERMS = [
  '上臉', '上脸', '試吓', '试下', '睇吓', '看下', '敷完', '搽', '搓勻', '搓匀', '推開', '推开',
  '現場', '现场', '即刻', '對比', '对比', '你睇', '你看', '睇真啲', '看清楚', '塊面', '脸上',
  '吸收', '質地', '质地', '水潤', '貼服', '贴服', '水光',
];

/** 顾虑解答：成分 / 适用人群 / 副作用疑虑。 */
const OBJECTION_TERMS = [
  '敏感肌', '敏感', '成分', '孕婦', '孕妇', '副作用', '會唔會', '会不会', '適唔適合', '适不适合',
  '爛面', '烂脸', '爆痘', '泛紅', '泛红', '脫皮', '脱皮', '繃緊', '紧绷', '刺激', '酒精',
  '香精', '防腐劑', '防腐剂', '致痘', '疑問', '担心', '顧慮', '顾虑', '安全',
];

/** 使用教学：步骤 / 用量。 */
const TUTORIAL_TERMS = [
  '第一步', '第二步', '第三步', '首先', '然後', '然后', '跟住', '接着', '每次', '一日', '每天',
  '一泵', '兩泵', '两泵', '兩滴', '用量', '薄塗', '厚敷', '順序', '顺序', '步驟', '步骤',
  '方法', '教你', '正確', '正确', '記得', '记得',
];

/** 价格/权益爆点：反差、正装、赠品。 */
const PRICE_BURST_TERMS = [
  '到手價', '到手价', '優惠', '优惠', '平', '抵', '划算', '便宜', '免費', '免费', '送', '贈',
  '正裝', '正装', '兩支', '两支', '三支', '一套', '半價', '半价', '折扣', '優惠價',
  '唔使', '只用', '先', '最後', '最后', '限時', '限时', '今晚', '直播間', '直播间',
];

/** 下单引导（CTA）。 */
const CTA_TERMS = [
  '連結', '链接', '鏈接', '落單', '下单', '購物車', '购物车', '車', '車車', '拍', '帶走', '带走',
  '揀', '选', '抓緊', '抓緊時間', '手快', '庫存', '库存', '黃色', '黄色', '一號', '一号',
  '1號', '1号', '下面', '左下角', '直接', '即刻', '馬上', '马上',
];

/** 水词/闲聊（无商品指向时降权）。 */
const FILLER_TERMS = [
  '嗯', '呃', '啊', '嗰個', '那个', '咩呢', '飲水', '喝水', '休息', '天氣', '天气',
  '遲啲', '等一下', '唔好意思', '工作人員', '工作人员', '後台', '后台',
];

function includesAny(text, list) {
  const s = String(text || '');
  return list.some((term) => s.includes(term));
}

function countHits(text, list) {
  const s = String(text || '');
  let n = 0;
  for (const term of list) if (s.includes(term)) n += 1;
  return n;
}

/** 判断片段首句是否带钩子（用于开场吸引力）。 */
function hasHookAtStart(text, headChars = 24) {
  const head = String(text || '').slice(0, headChars);
  return includesAny(head, HOOK_TERMS);
}

/** 转写稳定度启发式（SenseVoice/whisper 不输出逐句置信度）：
 *  -100 起评，按可解释规则扣分：特殊事件标记、无文字、过短/过长无停顿、
 *  连续叠词卡顿、符号占位。返回 0..100；这是「稳定度」不是识别概率。
 */
function transcriptionStability(text, durationSec) {
  const s = String(text || '').trim();
  if (!s) return 0;
  let score = 100;
  if (/<\|[^|]+\|>|\[?(?:SIL|BGM|MUSIC|APPLAUSE|NOISE)\]?/i.test(s)) score -= 35;
  const cjk = (s.match(/[㐀-鿿豈-﫿]/g) || []).length;
  if (cjk < 4) score -= 25;
  // 单位时间字数过少（长片段几乎没话）
  if (Number.isFinite(durationSec) && durationSec > 6 && cjk / durationSec < 0.6) score -= 20;
  // 连续重复字卡顿（如「我我我」），笑声除外
  if (/(.)\1{2,}/.test(s) && !/哈{3,}|嘻{3,}/.test(s)) score -= 10;
  // 大段英文/符号占位夹杂
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if (letters > cjk * 1.5 && cjk > 0) score -= 15;
  return Math.max(0, Math.min(100, score));
}

/** ASS/SRT 文本转义（换行与花括号）。 */
function assEscape(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/[{}]/g, ' ').replace(/\r?\n/g, '\\N');
}

module.exports = {
  parseChineseNumber,
  extractPrices,
  yueToWritten,
  includesAny,
  countHits,
  hasHookAtStart,
  transcriptionStability,
  assEscape,
  HOOK_TERMS,
  DEMO_TERMS,
  OBJECTION_TERMS,
  TUTORIAL_TERMS,
  PRICE_BURST_TERMS,
  CTA_TERMS,
  FILLER_TERMS,
};
