// useme：在哪刷哪张卡
// 纯前端：数据在 data/*.json，用户状态存在浏览器 localStorage。

const STORE_KEY = "useme-v1";
const NET_NAME = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover" };
const PERIOD_NAME = { year: "每年", quarter: "每季度", month: "每账单周期" };

// 内置官方链接兜底（若 data/cards.json 尚未带 officialUrl 时自动使用）
const OFFICIAL_FALLBACK = {
  "chase-freedom-flex": {
    url: "https://www.chase.com/personal/credit-cards/freedom/flex",
    label: "Chase 5% 官方日历与激活",
  },
  "discover-it": {
    url: "https://www.discover.com/credit-cards/cash-back/cashback-calendar.html",
    label: "Discover 5% 官方日历与激活",
  },
  "citi-custom-cash": {
    url: "https://www.citi.com/credit-cards/citi-custom-cash-credit-card",
    label: "Citi 5% 类别官方说明",
  },
  "boa-customized-cash": {
    url: "https://www.bankofamerica.com/credit-cards/products/cash-back-credit-card/",
    label: "BofA 3% 自选类别官方说明",
  },
  "usbank-cash-plus": {
    url: "https://cashplus.usbank.com/",
    label: "U.S. Bank Cash+ 5% 官方类别与激活",
  },
};

let DATA = null; // { cards, issuers, categories, merchants, rotating, catMap, merchantMap, cardMap }
let state = loadState();
let selected = null; // { type: 'merchant'|'category', id }
let manualSelected = null; // 用户点击 chip 明确选择的商家或类别
let recommendQuery = ""; // #mq 搜索框当前输入内容
let previewCardId = null; // 用户在下方卡包舞台点击预览/对比的卡片 ID
let showAllCardsInRecommend = false; // 是否在推荐页强制显示全部收录卡片
let lastHeroAnimKey = ""; // 控制动态弹出动画仅在目标变化时播放
let activeStackIdx = {}; // { [issuerId]: number }
let lastSyncToast = null; // 同步反馈提示信息

// 常见商家中英文/别名搜索映射，支持输入关键字实时匹配
const MERCHANT_ALIASES = {
  costco_gas: ["costco gas", "costco加油", "costco 加油", "好市多加油"],
  costco_online: ["costco.com", "costco online", "costco网购", "costco官网"],
  costco: ["costco", "好市多", "开市客"],
  sams: ["sam's", "sams", "sams club", "山姆"],
  bjs: ["bj's", "bjs"],
  wholefoods: ["whole foods", "wholefoods", "wf", "猴父子", "全食", "全食超市"],
  traderjoes: ["trader joe", "traderjoes", "tj", "缺德舅"],
  safeway: ["safeway", "vons", "albertsons"],
  kroger: ["kroger", "ralphs", "fred meyer"],
  h_mart: ["hmart", "h mart", "99 ranch", "99ranch", "大华", "韩亚龙", "亚超"],
  target: ["target", "塔吉特"],
  walmart: ["walmart", "沃尔玛"],
  amazon: ["amazon", "amzn", "亚马逊", "aws"],
  shell: ["shell", "chevron", "exxon", "mobil", "bp", "arco", "texaco"],
  starbucks: ["starbucks", "sbux", "星巴克", "咖啡"],
  mcdonalds: ["mcdonald", "mcdonalds", "mcd", "麦当劳", "金拱门"],
  restaurant: ["restaurant", "dining", "堂食", "饭店", "下馆子"],
  doordash: ["doordash", "ubereats", "uber eats", "grubhub", "外卖"],
  uber: ["uber", "lyft", "打车", "网约车"],
  netflix: ["netflix", "spotify", "youtube", "disney", "hulu", "apple music", "订阅"],
  cvs: ["cvs", "walgreens", "rite aid", "药房"],
  airline: ["airline", "flight", "机票", "航司", "united", "delta", "aa", "american airlines"],
  hotel: ["hotel", "marriott", "hilton", "hyatt", "ihg", "酒店", "订房"],
  homedepot: ["home depot", "homedepot", "lowes", "lowe's", "ikea", "家得宝", "建材"],
  bestbuy: ["best buy", "bestbuy", "百思买", "apple store", "电器"],
  macys: ["macy", "macys", "nordstrom", "saks", "bloomingdale", "百货"],
  amc: ["amc", "regal", "cinema", "concert", "电影", "演出"],
};

// ---------- 周期工具（季度 / 月度 / 年度） ----------
function currentQuarter(d = new Date()) {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}
function currentMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function currentYear(d = new Date()) {
  return `${d.getFullYear()}`;
}
function periodKey(period = "quarter", d = new Date()) {
  if (period === "month") return currentMonth(d);
  if (period === "year") return currentYear(d);
  return currentQuarter(d);
}
function nextPeriodSchedule(period = "quarter", d = new Date()) {
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let nextDate;
  if (period === "month") {
    nextDate = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  } else if (period === "year") {
    nextDate = new Date(d.getFullYear() + 1, 0, 1);
  } else {
    const qIdx = Math.floor(d.getMonth() / 3);
    nextDate = qIdx === 3
      ? new Date(d.getFullYear() + 1, 0, 1)
      : new Date(d.getFullYear(), (qIdx + 1) * 3, 1);
  }
  const daysLeft = Math.max(1, Math.ceil((nextDate - today) / 86400000));
  const yyyy = nextDate.getFullYear();
  const mm = String(nextDate.getMonth() + 1).padStart(2, "0");
  const dd = String(nextDate.getDate()).padStart(2, "0");
  return {
    period,
    key: periodKey(period, d),
    nextDate: `${yyyy}-${mm}-${dd}`,
    shortDate: `${mm}-${dd}`,
    daysLeft,
  };
}
function periodResetInfo(period = "quarter", d = new Date()) {
  const s = nextPeriodSchedule(period, d);
  if (period === "month") {
    return `${s.key} 本月额度 · 距下月更新还有 ${s.daysLeft} 天 (${s.shortDate})`;
  }
  if (period === "year") {
    return `${s.key} 本年额度 · 距明年更新还有 ${s.daysLeft} 天 (${s.shortDate})`;
  }
  return `${s.key} · 距下季更新还有 ${s.daysLeft} 天 (${s.shortDate})`;
}
function cardPrimaryPeriod(card) {
  if (card.resetPeriod) return card.resetPeriod;
  if (card.rotating) return "quarter";
  if (Array.isArray(card.choices) && card.choices.length) {
    return card.choices[0].period || "quarter";
  }
  const caps = capKeysOf(card);
  if (caps.length) return caps[0].period || "year";
  return null;
}
function cardUpdateSchedule(card, d = new Date()) {
  const period = cardPrimaryPeriod(card);
  if (!period) return null;
  const s = nextPeriodSchedule(period, d);
  const labelMap = {
    quarter: "下次季度更新",
    month: "下次月度更新",
    year: "下次年度额度重置",
  };
  return {
    ...s,
    badgeText: `📅 ${labelMap[period] || "下次更新"}：${s.nextDate}（剩 ${s.daysLeft} 天）`,
    detailText: periodResetInfo(period, d),
  };
}

// ---------- 状态与按周期隔离迁移 ----------
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.owned)) return normalizeState({ cards: {}, cpp: {}, ...s });
  } catch (_) {}
  return { owned: [], cards: {}, cpp: {} };
}
function normalizeState(s) {
  const out = { owned: [], cards: {}, cpp: {}, ...(s || {}) };
  out.owned = Array.isArray(out.owned) ? [...new Set(out.owned)] : [];
  if (DATA) out.owned = out.owned.filter((id) => DATA.cardMap[id]);
  out.cards ||= {};
  out.cpp ||= {};
  delete out.updatedAt;
  Object.keys(out.cards).forEach((id) => ensureCardStateShape(id, out.cards[id]));
  return out;
}
function ensureCardStateShape(id, raw) {
  const c = raw || {};
  c.quarterCats ||= {};
  c.picks ||= {};
  c.picksByPeriod ||= {};
  c.spent ||= {};
  c.spentByPeriod ||= {};
  c.activatedQuarters ||= {};

  const q = currentQuarter();
  // 平滑迁移旧版 boolean activated 到当前季度 activatedQuarters[q]
  if (c.activated === true && c.activatedQuarters[q] === undefined && !c._migratedActivation) {
    c.activatedQuarters[q] = true;
    c._migratedActivation = q;
  }
  c.activated = Boolean(c.activatedQuarters[q]);

  // 平滑迁移旧版 spent[capKey] 到对应周期的 spentByPeriod[periodKey][capKey]
  if (!c._migratedSpent && c.spent && typeof c.spent === "object") {
    const cardDef = DATA?.cardMap?.[id];
    const capDefs = cardDef ? capKeysOf(cardDef) : [];
    for (const [k, val] of Object.entries(c.spent)) {
      const num = Number(val) || 0;
      if (num > 0) {
        const capMeta = capDefs.find((x) => x.key === k);
        const p = capMeta?.period || (k === "rotating" ? "quarter" : "year");
        const pk = periodKey(p);
        c.spentByPeriod[pk] ||= {};
        if (c.spentByPeriod[pk][k] === undefined) {
          c.spentByPeriod[pk][k] = num;
        }
      }
    }
    if (DATA) c._migratedSpent = true;
  }
  return c;
}
function saveState({ silent = false } = {}) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  if (!silent) window.useme._onChange?.(state); // 通知云同步模块（firebase-sync.js）
}

// 给云同步模块用的接口
window.useme = {
  getState: () => JSON.parse(JSON.stringify(state)),
  // 用云端数据替换本地，不再回传云端
  applyRemote(s) {
    state = normalizeState(s);
    saveState({ silent: true });
    if (DATA) renderAll();
  },
  _onChange: null,
};

function cardState(id) {
  if (!state.cards[id]) {
    state.cards[id] = {
      activated: false,
      activatedQuarters: {},
      quarterCats: {},
      picks: {},
      picksByPeriod: {},
      spent: {},
      spentByPeriod: {},
    };
  }
  return ensureCardStateShape(id, state.cards[id]);
}

function isCardActivated(cardId, q = currentQuarter()) {
  const cs = cardState(cardId);
  return Boolean(cs.activatedQuarters?.[q]);
}
function setCardActivated(cardId, active, q = currentQuarter()) {
  const cs = cardState(cardId);
  cs.activatedQuarters[q] = Boolean(active);
  if (q === currentQuarter()) cs.activated = Boolean(active);
}
function getSpent(cardId, capKey, period = "quarter", d = new Date()) {
  const cs = cardState(cardId);
  const pk = periodKey(period, d);
  if (cs.spentByPeriod?.[pk]?.[capKey] !== undefined) {
    return Number(cs.spentByPeriod[pk][capKey]) || 0;
  }
  return 0;
}
function setSpent(cardId, capKey, period = "quarter", val = 0, d = new Date()) {
  const cs = cardState(cardId);
  const pk = periodKey(period, d);
  const num = Math.max(0, Number(val) || 0);
  cs.spentByPeriod[pk] ||= {};
  cs.spentByPeriod[pk][capKey] = num;
  cs.spent[capKey] = num;
}
function getChoicePicks(cardId, choiceIdx, period = "quarter", d = new Date()) {
  const cs = cardState(cardId);
  const pk = period ? periodKey(period, d) : null;
  if (pk && Array.isArray(cs.picksByPeriod?.[pk]?.[choiceIdx])) {
    return cs.picksByPeriod[pk][choiceIdx];
  }
  return Array.isArray(cs.picks?.[choiceIdx]) ? cs.picks[choiceIdx] : [];
}
function setChoicePicks(cardId, choiceIdx, period = "quarter", picks = [], d = new Date()) {
  const cs = cardState(cardId);
  const clean = Array.isArray(picks) ? [...picks] : [];
  cs.picks[choiceIdx] = clean;
  if (period) {
    const pk = periodKey(period, d);
    cs.picksByPeriod[pk] ||= {};
    cs.picksByPeriod[pk][choiceIdx] = clean;
  }
}

// ---------- 通用工具 ----------
const fmtPct = (n) => `${+n.toFixed(2)}%`;
const money = (n) => `$${Number(n).toLocaleString()}`;
const catName = (id) => DATA?.catMap?.[id]?.name || id;
const merchantName = (id) => DATA?.merchantMap?.[id]?.name || id;
const issuerName = (id) => DATA?.issuers?.find((i) => i.id === id)?.name || id;
const cardLabel = (c) => `${issuerName(c.issuer)} ${c.name}`;
const el = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

function officialLinkOf(card) {
  const url = card.officialUrl || OFFICIAL_FALLBACK[card.id]?.url || null;
  if (!url) return null;
  const label = card.officialLabel || OFFICIAL_FALLBACK[card.id]?.label || `${issuerName(card.issuer)} 官方规则与激活`;
  return { url, label };
}

function mountCardArt(card, opts = {}) {
  if (typeof window.renderCardArt === "function") {
    const res = window.renderCardArt(card, opts);
    if (typeof Element !== "undefined" && res instanceof Element) return res;
    if (typeof res === "string" && res.trim()) return el(res);
    if (res && typeof res === "object" && res.tagName) return res;
  }
  // Fallback if card-art.js is still loading
  const cls = ["card-face", opts.mini ? "mini" : "", opts.owned ? "owned is-owned" : "", opts.active ? "active is-active" : ""]
    .filter(Boolean)
    .join(" ");
  return el(`
    <div class="${cls}" data-card-id="${card.id}" data-issuer="${card.issuer}" data-network="${card.network}">
      <div class="card-face-top">
        <div class="card-face-brand">
          <span class="card-face-issuer">${issuerName(card.issuer)}</span>
          <span class="card-face-title">${card.name}</span>
        </div>
        ${opts.owned ? `<span class="card-owned-badge">✓ 已持有</span>` : ""}
      </div>
      <div class="card-face-bottom">
        <span class="card-network-logo">${NET_NAME[card.network] || card.network}</span>
      </div>
    </div>`);
}

function rotatingCats(card, q = currentQuarter()) {
  const cs = cardState(card.id);
  const local = cs.quarterCats?.[q];
  const remote = DATA?.rotating?.quarters?.[q]?.[card.id] || {};
  const hasLocal = Array.isArray(local);
  const officialCategories = Array.isArray(remote.categories) ? remote.categories : [];
  const officialMerchants = Array.isArray(remote.merchants) ? remote.merchants : [];
  return {
    quarter: q,
    categories: hasLocal ? local : officialCategories,
    merchants: officialMerchants,
    officialCategories,
    officialMerchants,
    note: remote.note || "",
    confirmed: hasLocal ? "本地自定义" : remote.confirmed ? "官方已核实" : "待公布",
    isCustom: hasLocal,
    isOfficial: !hasLocal && Boolean(remote.confirmed),
  };
}

function rotatingItemNames(card, q = currentQuarter()) {
  const rc = rotatingCats(card, q);
  const catLabels = rc.categories.map((id) => catName(id));
  const merLabels = rc.merchants.map((id) => merchantName(id));
  return [...catLabels, ...merLabels];
}

// 列出一张卡所有带上限的额度，用于「已用额度」输入
function capKeysOf(card) {
  const keys = [];
  for (const [cat, v] of Object.entries(card.rates || {})) {
    if (typeof v === "object" && v.cap) {
      keys.push({ key: v.capKey || cat, label: catName(cat), cap: v.cap, period: v.period || "year" });
    }
  }
  if (card.rotating?.cap) {
    keys.push({ key: "rotating", label: `${currentQuarter()} 季度 5% 类别`, cap: card.rotating.cap, period: "quarter" });
  }
  (card.choices || []).forEach((ch, i) => {
    if (ch.cap) keys.push({ key: `choice${i}`, label: ch.label, cap: ch.cap, period: ch.period || "quarter" });
  });
  const seen = new Set();
  return keys.filter((k) => !seen.has(k.key) && seen.add(k.key));
}

// ---------- 一键自动更新本季/本月类别与周期额度状态 ----------
async function syncOfficialAndPeriods() {
  const ts = Date.now();
  const [cardsRes, merchantsRes, rotatingRes] = await Promise.all([
    fetch(`data/cards.json?t=${ts}`, { cache: "no-store" }).then((r) => r.json()),
    fetch(`data/merchants.json?t=${ts}`, { cache: "no-store" }).then((r) => r.json()),
    fetch(`data/rotating.json?t=${ts}`, { cache: "no-store" }).then((r) => r.json()),
  ]);

  DATA = { ...cardsRes, ...merchantsRes, rotating: rotatingRes };
  DATA.catMap = Object.fromEntries(DATA.categories.map((c) => [c.id, c]));
  DATA.merchantMap = Object.fromEntries(DATA.merchants.map((x) => [x.id, x]));
  DATA.cardMap = Object.fromEntries(DATA.cards.map((x) => [x.id, x]));

  const q = currentQuarter();
  const m = currentMonth();
  const y = currentYear();
  let updatedCards = 0;

  DATA.cards.forEach((card) => {
    const cs = cardState(card.id);
    let touched = false;

    // 同步当前季度官方 5% 轮换类别
    if (card.rotating) {
      const remoteQ = DATA.rotating?.quarters?.[q]?.[card.id];
      if (remoteQ && remoteQ.confirmed) {
        // 清理过期的非本季自定义，并将本季同步为官方核实类别
        delete cs.quarterCats[q];
        touched = true;
      }
      if (cs.activatedQuarters[q] === undefined) {
        cs.activatedQuarters[q] = false;
      }
      cs.activated = Boolean(cs.activatedQuarters[q]);
    }

    // 确保当前季度/月度/年度额度桶已初始化并隔离旧周期数据
    const caps = capKeysOf(card);
    caps.forEach((cap) => {
      const pk = periodKey(cap.period || "quarter");
      cs.spentByPeriod[pk] ||= {};
      if (cs.spentByPeriod[pk][cap.key] === undefined) {
        cs.spentByPeriod[pk][cap.key] = 0;
      }
      cs.spent[cap.key] = cs.spentByPeriod[pk][cap.key];
      touched = true;
    });

    if (card.choices?.length) {
      card.choices.forEach((ch, idx) => {
        const pk = periodKey(ch.period || "quarter");
        cs.picksByPeriod[pk] ||= {};
        if (!cs.picksByPeriod[pk][idx] && Array.isArray(cs.picks[idx])) {
          cs.picksByPeriod[pk][idx] = [...cs.picks[idx]];
        }
      });
      touched = true;
    }

    if (touched) updatedCards++;
  });

  state.lastSyncedAt = new Date().toISOString();
  saveState();

  const quarterEl = document.getElementById("quarter");
  if (quarterEl) quarterEl.textContent = `${q} · ${m}`;

  const dataDate = DATA.rotating?.updated || DATA.updated || m;
  lastSyncToast = `✅ 已同步最新官方数据（更新于 ${dataDate}）· 当前周期 ${q} / ${m} / ${y}，已刷新 ${updatedCards} 张卡的当期类别与额度状态`;
  renderAll();
}

function renderSyncBar() {
  const q = currentQuarter();
  const m = currentMonth();
  const qInfo = periodResetInfo("quarter");
  const mInfo = periodResetInfo("month");
  const dataDate = DATA?.rotating?.updated || DATA?.updated || "最新";

  const wrap = el(`
    <div class="sync-bar">
      <div class="sync-info">
        <div class="sync-title"><strong>📅 周期状态：${q}（季度） · ${m}（月度）</strong> <span class="tag">官方数据 ${dataDate}</span></div>
        <div class="sync-sub">${qInfo} ｜ ${mInfo}</div>
        ${lastSyncToast ? `<div class="sync-toast">${lastSyncToast}</div>` : ""}
      </div>
      <button type="button" class="btn sync-btn">🔄 一键更新本季/本月类别与额度状态</button>
    </div>`);

  const btn = wrap.querySelector(".sync-btn");
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "⏳ 正在同步官方类别与当期额度…";
    try {
      await syncOfficialAndPeriods();
    } catch (e) {
      lastSyncToast = `⚠️ 同步失败：${e.message || "请检查网络后重试"}`;
      renderAll();
    }
  };
  return wrap;
}

// ---------- 核心：计算一张卡在某个商家/类别的返现 ----------
function evaluate(card, merchant, catId) {
  const q = currentQuarter();
  const parent = DATA.catMap[catId]?.parent;
  const matchCat = (list) => list.includes(catId) || (parent && list.includes(parent));
  const notes = [];

  if (merchant?.networks && !merchant.networks.includes(card.network)) {
    return { card, excluded: true, reason: `${merchant.name} 不收 ${NET_NAME[card.network]}` };
  }

  const opts = [{ rate: card.base, why: "基础返现", kind: "base", kindLabel: "全类别保底返现" }];
  const add = (entry, capKey, why, kind = "fixed", kindLabel = "固定类别高返现") => {
    if (entry == null) return;
    const rate = typeof entry === "number" ? entry : entry.r ?? entry.rate;
    const cap = typeof entry === "object" ? entry.cap : null;
    const period = (typeof entry === "object" && entry.period) || "quarter";
    const key = (typeof entry === "object" && entry.capKey) || capKey;
    if (cap) {
      const spent = getSpent(card.id, key, period);
      const left = cap - spent;
      const pLabel = `${PERIOD_NAME[period] || ""}（${periodKey(period)}）`;
      if (left <= 0) {
        notes.push(`${why}已达${pLabel}上限 ${money(cap)}（${periodResetInfo(period)}）`);
        return;
      }
      opts.push({
        rate,
        why: `${why}，${pLabel}额度还剩 ${money(left)}`,
        kind,
        kindLabel,
        capTotal: cap,
        capLeft: left,
        period,
      });
    } else {
      opts.push({ rate, why, kind, kindLabel });
    }
  };

  // 固定类别
  const r = card.rates || {};
  if (r[catId] != null) add(r[catId], catId, `${catName(catId)} ${rateOf(r[catId])}x`, "fixed", "固定类别高返现");
  else if (parent && r[parent] != null) add(r[parent], parent, `${catName(parent)} ${rateOf(r[parent])}x`, "fixed", "固定类别高返现");

  // 指定商家加成
  if (merchant && card.merchants?.[merchant.id] != null) {
    add(
      card.merchants[merchant.id],
      merchant.id,
      `${merchant.name} 专属 ${rateOf(card.merchants[merchant.id])}x`,
      "merchant",
      "指定商家专属加成"
    );
  }

  // 季度轮换
  if (card.rotating) {
    const rc = rotatingCats(card, q);
    const hitCat = matchCat(rc.categories);
    const hitMer = merchant && rc.merchants.includes(merchant.id);
    const hit = hitCat || hitMer;
    const activated = isCardActivated(card.id, q);
    const isOwned = state.owned.includes(card.id);
    if (hit) {
      const matchLabel = hitMer ? merchant.name : catName(catId);
      if (card.rotating.needsActivation && isOwned && !activated) {
        notes.push(`⚠️ ${q} 本季 ${card.rotating.rate}% 含「${matchLabel}」，但你还没标记"已激活"`);
      } else {
        if (card.rotating.needsActivation && !isOwned) {
          notes.push(`💡 ${q} 本季 ${card.rotating.rate}% 含「${matchLabel}」（持卡需每季激活）`);
        }
        add(
          { r: card.rotating.rate, cap: card.rotating.cap, period: "quarter" },
          "rotating",
          `${q} 季度 ${card.rotating.rate}%（${matchLabel}）`,
          "rotating",
          `${q} 季度 5% 轮换命中`
        );
      }
    } else if (!rc.categories.length && !rc.merchants.length) {
      notes.push(`${q} 季度 5% 类别尚未设置`);
    }
  }

  // 自选类别
  (card.choices || []).forEach((ch, i) => {
    const picks = getChoicePicks(card.id, i, ch.period || "quarter");
    if (matchCat(picks)) {
      add(
        { r: ch.rate, cap: ch.cap, period: ch.period },
        `choice${i}`,
        `${ch.label}：${catName(catId)}`,
        "choice",
        "自选高返现类别命中"
      );
    } else if (!picks.length && matchCat(ch.options)) {
      notes.push(`可以把「${catName(catId)}」设为${ch.label}（${ch.rate}%）`);
    }
  });

  const best = opts.reduce((a, b) => (b.rate > a.rate ? b : a));
  const cpp = card.currency === "points" ? Number(state.cpp[card.program] ?? 1) : 1;
  return {
    card,
    rate: best.rate,
    eff: best.rate * cpp,
    why: best.why,
    kind: best.kind || "base",
    kindLabel: best.kindLabel || "全类别保底返现",
    capTotal: best.capTotal || null,
    capLeft: best.capLeft ?? null,
    capPeriod: best.period || null,
    cpp,
    notes,
  };
}
const rateOf = (e) => (typeof e === "number" ? e : e.r ?? e.rate);

// 获取推荐页当前参与展示与比价的卡片集合
function getRecommendCardPool() {
  if (!DATA?.cards) return [];
  if (showAllCardsInRecommend || !state.owned.length) {
    return DATA.cards;
  }
  return state.owned.map((id) => DATA.cardMap[id]).filter(Boolean);
}

// 计算单张卡在总览模式下的最高亮点返现与核心标签
function cardHeadlineInfo(card) {
  const cpp = card.currency === "points" ? Number(state.cpp[card.program] ?? 1) : 1;
  const candidates = [{ rate: card.base, label: `保底 ${card.base}${card.currency === "points" ? "x" : "%"}` }];

  Object.entries(card.rates || {}).forEach(([k, v]) => {
    const r = rateOf(v);
    candidates.push({ rate: r, label: `${catName(k)} ${r}${card.currency === "points" ? "x" : "%"}` });
  });
  Object.entries(card.merchants || {}).forEach(([k, v]) => {
    const r = rateOf(v);
    candidates.push({ rate: r, label: `${merchantName(k)} ${r}${card.currency === "points" ? "x" : "%"}` });
  });
  if (card.rotating) {
    const q = currentQuarter();
    const names = rotatingItemNames(card, q);
    candidates.push({
      rate: card.rotating.rate,
      label: names.length ? `${q} ${card.rotating.rate}%：${names.slice(0, 2).join("/")}` : `${q} 轮换 ${card.rotating.rate}%`,
    });
  }
  (card.choices || []).forEach((ch) => {
    candidates.push({ rate: ch.rate, label: `${ch.label} ${ch.rate}%` });
  });

  const top = candidates.reduce((a, b) => (b.rate > a.rate ? b : a), candidates[0]);
  const topEff = top.rate * cpp;
  return {
    topRate: top.rate,
    topEff,
    rateBadge: `最高 ${fmtPct(topEff)}`,
    highlightText: window.CARD_ART?.[card.id]?.badge || top.label,
  };
}

// 根据搜索框输入实时匹配最佳商家或类别
function autoMatchQuery(rawQuery) {
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q) return null;

  // 1. 精确匹配类别名称或 ID（如 "超市"、"加油"、"餐厅"、"网购"、"药店"、"流媒体"）
  const exactCat = DATA.categories.find(
    (c) => c.name.toLowerCase() === q || c.id.toLowerCase() === q
  );
  if (exactCat) return { type: "category", id: exactCat.id };

  // 2. 精确匹配商家 ID / 名称，或商家名称前缀匹配（如 "costco"、"whole"、"amazon"、"starbucks"）
  const prefixMer = DATA.merchants.find(
    (m) =>
      m.id.toLowerCase() === q ||
      m.name.toLowerCase() === q ||
      m.name.toLowerCase().startsWith(q) ||
      m.id.toLowerCase().startsWith(q)
  );
  if (prefixMer) return { type: "merchant", id: prefixMer.id };

  // 3. 常见中英文别名匹配（如 "costco gas"、"好市多"、"星巴克"、"缺德舅"、"大华"）
  for (const m of DATA.merchants) {
    const aliases = MERCHANT_ALIASES[m.id] || [];
    if (aliases.some((a) => a === q || a.startsWith(q) || a.includes(q) || (q.length >= 2 && q.includes(a)))) {
      return { type: "merchant", id: m.id };
    }
  }

  // 4. 商家名称包含关键字（如 "walgreens"、"chevron"、"lyft"）
  const subMer = DATA.merchants.find((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  if (subMer) return { type: "merchant", id: subMer.id };

  // 5. 类别名称包含关键字（如 "机票"、"酒店"、"仓储"、"快餐"）
  const subCat = DATA.categories.find((c) => c.name.toLowerCase().includes(q));
  if (subCat) return { type: "category", id: subCat.id };

  // 6. 商家所属类别名称包含关键字
  const catMer = DATA.merchants.find((m) => catName(m.category).toLowerCase().includes(q));
  if (catMer) return { type: "merchant", id: catMer.id };

  return null;
}

function filterMerchantsByQuery(rawQuery) {
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q) return DATA.merchants;
  return DATA.merchants.filter((m) => {
    const aliases = MERCHANT_ALIASES[m.id] || [];
    return (
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      catName(m.category).toLowerCase().includes(q) ||
      aliases.some((a) => a.includes(q) || (q.length >= 2 && q.includes(a)))
    );
  });
}

function recommend() {
  if (!selected) return null;
  const merchant = selected.type === "merchant" ? DATA.merchantMap[selected.id] : null;
  const catId = merchant ? merchant.category : selected.id;
  if (!catId || !DATA.catMap[catId]) return null;
  const pool = getRecommendCardPool();
  const res = pool.map((c) => evaluate(c, merchant, catId));
  const ok = res
    .filter((r) => !r.excluded)
    .sort((a, b) => {
      const aOwned = state.owned.includes(a.card.id) ? 1 : 0;
      const bOwned = state.owned.includes(b.card.id) ? 1 : 0;
      return b.eff - a.eff || bOwned - aOwned || a.card.annualFee - b.card.annualFee;
    });
  return { merchant, catId, ok, bad: res.filter((r) => r.excluded), pool };
}

// ---------- 渲染：推荐（实时输入动态弹出最佳卡 + 为什么选这张卡 + 一站式全卡包舞台） ----------
function renderRecommend() {
  const root = document.getElementById("tab-recommend");
  if (!root) return;

  // 仅在首次挂载时创建 #mq 和骨架容器，绝不在打字或切换时销毁 #mq，确保输入焦点与中文输入法合成永不中断
  if (!root.querySelector("#mq")) {
    root.innerHTML = "";
    const shell = el(`
      <div class="recommend-layout">
        <section class="picker">
          <div class="search-box-wrap">
            <span class="search-icon" aria-hidden="true">🔍</span>
            <input id="mq" type="search" placeholder="输入商家或消费类别（如 Costco、Whole Foods、Amazon、Starbucks、超市、加油）实时弹出最佳卡…" autocomplete="off">
            <button type="button" id="mq-clear" class="search-clear-btn" hidden aria-label="清除搜索">✕</button>
          </div>
          <div id="mlist" class="chips"></div>
          <div class="sub">或者直接选类别</div>
          <div id="clist" class="chips"></div>
        </section>
        <div id="hero-pop-slot"></div>
        <div id="wallet-stage-slot"></div>
        <div id="results-list-slot"></div>
      </div>`);
    root.append(shell);

    const mqInput = root.querySelector("#mq");
    const clearBtn = root.querySelector("#mq-clear");
    let isComposing = false;

    const onQueryChange = (val) => {
      recommendQuery = val;
      clearBtn.hidden = !val.length;
      const trimmed = val.trim();
      if (trimmed) {
        const matched = autoMatchQuery(trimmed);
        if (matched) {
          selected = matched;
          previewCardId = null;
        } else {
          selected = null;
          previewCardId = null;
        }
      } else {
        selected = manualSelected;
        previewCardId = null;
      }
      updateRecommendContent(root);
    };

    mqInput.addEventListener("compositionstart", () => {
      isComposing = true;
    });
    mqInput.addEventListener("compositionend", (e) => {
      isComposing = false;
      onQueryChange(e.target.value);
    });
    mqInput.addEventListener("input", (e) => {
      // 无论是否处于输入法合成阶段，只更新外部兄弟节点，绝不触碰 #mq 自身，保证光标与拼音合成丝滑不丢失
      onQueryChange(e.target.value);
    });

    clearBtn.addEventListener("click", () => {
      mqInput.value = "";
      recommendQuery = "";
      clearBtn.hidden = true;
      selected = manualSelected;
      previewCardId = null;
      updateRecommendContent(root);
      mqInput.focus();
    });
  } else {
    const mqInput = root.querySelector("#mq");
    const clearBtn = root.querySelector("#mq-clear");
    if (document.activeElement !== mqInput && mqInput.value !== recommendQuery) {
      mqInput.value = recommendQuery;
    }
    if (clearBtn) clearBtn.hidden = !mqInput.value.length;
  }

  updateRecommendContent(root);
}

function updateRecommendContent(root = document.getElementById("tab-recommend")) {
  if (!root) return;
  const mlist = root.querySelector("#mlist");
  const clist = root.querySelector("#clist");
  const heroSlot = root.querySelector("#hero-pop-slot");
  const stageSlot = root.querySelector("#wallet-stage-slot");
  const resultsSlot = root.querySelector("#results-list-slot");

  // 1. 刷新商家与类别胶囊（高亮当前自动匹配或手动选中的项）
  if (mlist) {
    mlist.innerHTML = "";
    const filteredMerchants = filterMerchantsByQuery(recommendQuery);
    filteredMerchants.forEach((m) => {
      const isOn = selected?.type === "merchant" && selected.id === m.id;
      mlist.append(chip(m.name, isOn, () => pick("merchant", m.id)));
    });
    if (!filteredMerchants.length && recommendQuery.trim()) {
      mlist.append(el(`<span class="sub">未找到包含「${recommendQuery.trim()}」的特定商家，已为你尝试匹配通用类别或可点击下方类别</span>`));
    }
  }

  if (clist) {
    clist.innerHTML = "";
    DATA.categories.forEach((c) => {
      const isOn = selected?.type === "category" && selected.id === c.id;
      clist.append(chip(c.name, isOn, () => pick("category", c.id)));
    });
  }

  const r = recommend();

  // 2. 动态弹出首选推荐卡聚光灯 + 「为什么选这张卡」深度解析面板
  if (heroSlot) {
    heroSlot.innerHTML = "";
    if (r) {
      heroSlot.append(buildHeroRecommendPop(r));
    }
  }

  // 3. 一站式全卡包展示舞台（始终显示所有包含的卡片，并在选中商家时动态更新排名、返现率与发光状态）
  if (stageSlot) {
    stageSlot.innerHTML = "";
    stageSlot.append(buildAllCardsStage(r));
  }

  // 4. 完整排行榜明细列表
  if (resultsSlot) {
    resultsSlot.innerHTML = "";
    if (r) {
      resultsSlot.append(buildResultsSection(r));
    }
  }
}

function buildHeroRecommendPop(r) {
  const best = r.ok[0] || null;
  const allEntries = [...r.ok, ...r.bad];
  const activeEntry = (previewCardId && allEntries.find((x) => x.card.id === previewCardId)) || best;
  const targetTitle = r.merchant ? r.merchant.name : catName(r.catId);
  const animKey = `${selected?.type}:${selected?.id}:${activeEntry?.card?.id || "none"}`;
  const shouldAnimate = animKey !== lastHeroAnimKey;
  lastHeroAnimKey = animKey;

  if (!activeEntry) {
    return el(`
      <section class="hero-recommend-pop is-empty ${shouldAnimate ? "pop-animate" : ""}">
        <div class="hero-pop-header">
          <div class="hero-target-info">
            <span class="hero-live-dot"></span>
            <span class="hero-target-label">当前场景：<strong>${targetTitle}</strong></span>
            <span class="tag">${catName(r.catId)}</span>
          </div>
        </div>
        <div class="warn">⚠️ ${r.merchant?.note || "当前卡包中没有可在此商家刷卡的卡片（受发卡组织网络限制）。"}</div>
        <div class="empty">你的卡在这里都刷不了，可前往「添加卡包」添加支持对应网络的卡片。</div>
      </section>`);
  }

  const isBest = best && activeEntry.card.id === best.card.id;
  const rankIdx = !activeEntry.excluded ? r.ok.findIndex((x) => x.card.id === activeEntry.card.id) : -1;
  const runnerUp = r.ok[1] || null;
  const isOwned = state.owned.length ? state.owned.includes(activeEntry.card.id) : true;

  // 构建「首选理由」文案
  let primaryReasonHtml = "";
  if (activeEntry.excluded) {
    primaryReasonHtml = `
      <span class="reason-badge bad">网络受限不可刷</span>
      <div>${activeEntry.reason}。${r.merchant?.note ? `（${r.merchant.note}）` : ""}</div>`;
  } else {
    const rateExplain =
      activeEntry.card.currency === "points"
        ? `获得 <strong>${activeEntry.rate}x ${activeEntry.card.program} 积分</strong>，按 <strong>${activeEntry.cpp}¢/分</strong> 折算 = 等效 <strong>${fmtPct(activeEntry.eff)}</strong> 返现（每刷 $100 约合 <strong>$${activeEntry.eff.toFixed(2)}</strong> 价值）`
        : `直接获得 <strong>${fmtPct(activeEntry.eff)}</strong> 现金返还（每刷 $100 立返 <strong>$${activeEntry.eff.toFixed(2)}</strong>）`;
    primaryReasonHtml = `
      <div class="reason-headline">
        <span class="reason-badge ${isBest ? "good" : "neutral"}">${activeEntry.kindLabel || "返现规则命中"}</span>
        <strong>${activeEntry.why}</strong>
      </div>
      <div class="reason-sub">${rateExplain} · ${activeEntry.card.annualFee ? `年费 ${money(activeEntry.card.annualFee)}` : "免年费持有"}</div>`;
  }

  // 构建「优势对比」文案
  let compareReasonHtml = "";
  if (isBest && runnerUp) {
    const diff = +(best.eff - runnerUp.eff).toFixed(2);
    if (diff > 0) {
      compareReasonHtml = `比次选 <strong>${cardLabel(runnerUp.card)}</strong>（${fmtPct(runnerUp.eff)}，${runnerUp.why}）多拿 <strong class="diff-pos">+${fmtPct(diff)}</strong>（每消费 $100 多赚 <strong>$${diff.toFixed(2)}</strong>）。`;
    } else {
      compareReasonHtml = `与次选 <strong>${cardLabel(runnerUp.card)}</strong>（${fmtPct(runnerUp.eff)}）返现率并列最高，此卡凭${best.card.annualFee <= runnerUp.card.annualFee ? `更优年费（${best.card.annualFee ? money(best.card.annualFee) : "免年费"}）` : "综合权益"}优先推荐。`;
    }
  } else if (!isBest && !activeEntry.excluded && best) {
    const gap = +(best.eff - activeEntry.eff).toFixed(2);
    compareReasonHtml = `当前预览卡位列 <strong>#${rankIdx + 1}</strong>（${fmtPct(activeEntry.eff)}），相比 #1 首选 <strong>${cardLabel(best.card)}</strong>（${fmtPct(best.eff)}，${best.why}）少拿 <strong class="diff-neg">-${fmtPct(gap)}</strong>。`;
  } else if (activeEntry.excluded && best) {
    compareReasonHtml = `此卡在此商家不可刷（${activeEntry.reason}），请改刷 #1 首选 <strong>${cardLabel(best.card)}</strong>（立享 ${fmtPct(best.eff)}）。`;
  } else {
    compareReasonHtml = `当前卡包中唯一适配该消费场景的卡片，稳定获得 <strong>${fmtPct(activeEntry.eff)}</strong> 回馈。`;
  }

  // 构建「收卡与额度提示」列表
  const constraintItems = [];
  if (r.merchant?.networks) {
    const allowedNets = r.merchant.networks.map((n) => NET_NAME[n] || n).join(" / ");
    if (!activeEntry.excluded) {
      constraintItems.push(`✓ <strong>收卡网络验证通过</strong>：${r.merchant.name} 仅支持 ${allowedNets}，此卡为 <strong>${NET_NAME[activeEntry.card.network]}</strong> 可正常刷卡`);
    } else {
      constraintItems.push(`✕ <strong>收卡网络受限</strong>：${r.merchant.name} 仅支持 ${allowedNets}，不支持 ${NET_NAME[activeEntry.card.network]}`);
    }
  } else {
    constraintItems.push(`✓ <strong>网络通用</strong>：支持 ${NET_NAME[activeEntry.card.network]} 网络结账`);
  }

  if (r.merchant?.note) {
    constraintItems.push(`🏪 <strong>商家提示</strong>：${r.merchant.note}`);
  }
  if (activeEntry.capLeft != null && activeEntry.capTotal != null) {
    const pName = PERIOD_NAME[activeEntry.capPeriod] || "当期";
    constraintItems.push(`📊 <strong>高返现额度充裕</strong>：${pName}剩余可用额度 <strong>${money(activeEntry.capLeft)}</strong> / 总上限 ${money(activeEntry.capTotal)}`);
  }
  if (activeEntry.card.rotating) {
    const q = currentQuarter();
    const rotNames = rotatingItemNames(activeEntry.card, q);
    const actStatus = isCardActivated(activeEntry.card.id, q) ? "✓ 本季已激活" : "⚠️ 需在卡包勾选已激活";
    constraintItems.push(`📅 <strong>${q} 季度 5% 范围</strong>：${rotNames.join("、") || "待设置"}（${actStatus}）`);
  }
  (activeEntry.notes || []).forEach((n) => constraintItems.push(`⚠️ ${n}`));
  if (activeEntry.card.note) {
    constraintItems.push(`ℹ️ <strong>用卡贴士</strong>：${activeEntry.card.note}`);
  }

  const section = el(`
    <section class="hero-recommend-pop ${shouldAnimate ? "pop-animate" : ""} ${isBest ? "is-best" : "is-preview"}">
      <div class="hero-pop-header">
        <div class="hero-target-info">
          <span class="hero-live-dot"></span>
          <span class="hero-target-label">推荐刷卡方案：<strong>${targetTitle}</strong></span>
          <span class="tag">${catName(r.catId)}</span>
          ${
            r.merchant?.networks
              ? `<span class="tag warn">仅收 ${r.merchant.networks.map((n) => NET_NAME[n]).join("/")}</span>`
              : ""
          }
        </div>
        <div class="hero-pop-actions">
          ${
            !isBest && best
              ? `<button type="button" class="btn small hero-reset-preview">↺ 回到 #1 最佳 (${cardLabel(best.card)})</button>`
              : ""
          }
          <button type="button" class="btn small hero-close-btn">✕ 收起推荐</button>
        </div>
      </div>

      <div class="hero-pop-body">
        <div class="hero-card-stage">
          <div class="hero-rank-pill ${isBest ? "is-best" : activeEntry.excluded ? "is-excluded" : "is-runner"}">
            ${
              isBest
                ? `🏆 #1 首选推荐卡 · 立享 ${fmtPct(activeEntry.eff)}`
                : activeEntry.excluded
                ? `✕ 不可刷预览 · ${activeEntry.reason}`
                : `🔍 备选预览 #${rankIdx + 1} · ${fmtPct(activeEntry.eff)}`
            }
          </div>
          <div class="hero-card-spotlight">
            <div class="hero-card-art-slot"></div>
            <div class="hero-rate-orb ${isBest ? "is-best" : activeEntry.excluded ? "is-excluded" : "is-runner"}">
              <span class="orb-label">${activeEntry.excluded ? "不可用" : "等效返现"}</span>
              <strong class="orb-value">${activeEntry.excluded ? "✕" : fmtPct(activeEntry.eff)}</strong>
              <span class="orb-sub">${
                activeEntry.excluded
                  ? NET_NAME[activeEntry.card.network]
                  : activeEntry.card.currency === "points"
                  ? `${activeEntry.rate}x 积分 (${activeEntry.cpp}¢)`
                  : "直接返现"
              }</span>
            </div>
          </div>
          <div class="hero-card-caption">
            <strong>${cardLabel(activeEntry.card)}</strong>
            <span class="net">${NET_NAME[activeEntry.card.network]}</span>
            <span class="fee">${activeEntry.card.annualFee ? "年费 " + money(activeEntry.card.annualFee) : "免年费"}</span>
          </div>
        </div>

        <div class="hero-why-panel why-choose-box">
          <div class="why-panel-header">
            <h3>💡 为什么选这张卡？</h3>
            <span class="why-card-subtitle">${cardLabel(activeEntry.card)} · ${
    isBest ? "当前场景最优解" : activeEntry.excluded ? "受限原因说明" : `第 #${rankIdx + 1} 顺位对比`
  }</span>
          </div>
          <div class="why-grid">
            <div class="why-item primary-reason">
              <div class="why-item-title">🏅 首选理由</div>
              <div class="why-item-body">${primaryReasonHtml}</div>
            </div>
            <div class="why-item compare-reason">
              <div class="why-item-title">📈 优势对比</div>
              <div class="why-item-body">${compareReasonHtml}</div>
            </div>
            <div class="why-item constraint-reason">
              <div class="why-item-title">🛡️ 收卡与额度提示</div>
              <ul class="why-item-list">
                ${constraintItems.map((item) => `<li>${item}</li>`).join("")}
              </ul>
            </div>
          </div>
          ${
            r.ok.length > 1
              ? `<div class="why-compare-bar">
                  <span class="compare-bar-label">点击切换对比：</span>
                  <div class="compare-pills"></div>
                </div>`
              : ""
          }
        </div>
      </div>
    </section>`);

  const artSlot = section.querySelector(".hero-card-art-slot");
  artSlot.append(
    mountCardArt(activeEntry.card, {
      owned: isOwned,
      active: true,
      badgeText: activeEntry.excluded ? activeEntry.reason : `${fmtPct(activeEntry.eff)} · ${activeEntry.why}`,
    })
  );

  const resetPreviewBtn = section.querySelector(".hero-reset-preview");
  if (resetPreviewBtn) {
    resetPreviewBtn.onclick = () => {
      previewCardId = null;
      updateRecommendContent();
    };
  }

  const closeBtn = section.querySelector(".hero-close-btn");
  if (closeBtn) {
    closeBtn.onclick = () => {
      selected = null;
      manualSelected = null;
      previewCardId = null;
      recommendQuery = "";
      const mqInput = document.getElementById("mq");
      const clearBtn = document.getElementById("mq-clear");
      if (mqInput) mqInput.value = "";
      if (clearBtn) clearBtn.hidden = true;
      updateRecommendContent();
    };
  }

  const comparePills = section.querySelector(".compare-pills");
  if (comparePills) {
    r.ok.slice(0, 5).forEach((x, idx) => {
      const isCurrent = x.card.id === activeEntry.card.id;
      const btn = el(`
        <button type="button" class="compare-pill ${isCurrent ? "active" : ""} ${idx === 0 ? "is-top" : ""}">
          ${idx === 0 ? "🏆 #1" : `#${idx + 1}`} ${x.card.name} <strong>${fmtPct(x.eff)}</strong>
        </button>`);
      btn.onclick = () => {
        previewCardId = idx === 0 ? null : x.card.id;
        updateRecommendContent();
      };
      comparePills.append(btn);
    });
  }

  return section;
}

// 一站式全卡包展示舞台（在推荐页直观陈列所有包含的卡片，并根据所选商家实时更新排名与有效返现率）
function buildAllCardsStage(r) {
  const pool = getRecommendCardPool();
  const hasOwned = state.owned.length > 0;
  const showingAllFallback = !hasOwned;
  const targetTitle = r ? (r.merchant ? r.merchant.name : catName(r.catId)) : null;
  const bestCardId = r?.ok?.[0]?.card?.id || null;
  const activePreviewId = previewCardId || bestCardId;

  const stage = el(`
    <section class="wallet-stage">
      <div class="wallet-stage-header">
        <div class="wallet-stage-title-wrap">
          <h3>
            🗂️ ${showingAllFallback || showAllCardsInRecommend ? "一站式全部卡片总览" : "添加卡包一站式总览"}
            <span class="stage-count">${pool.length} 张卡片</span>
          </h3>
          <div class="wallet-stage-sub">
            ${
              r
                ? `当前按「<strong>${targetTitle}</strong>」实时排序 · 点击下方任意卡面可在上方聚光灯弹出详情与对比`
                : `一处直观浏览所有卡片与本季核心高返现亮点 · 在上方输入商家或点击类别即可动态弹出最佳推荐卡`
            }
          </div>
        </div>
        <div class="wallet-stage-actions">
          ${
            hasOwned && state.owned.length < DATA.cards.length
              ? `<button type="button" class="btn small stage-toggle-all">
                  ${showAllCardsInRecommend ? `仅看添加卡包 (${state.owned.length})` : `显示全部收录卡片 (${DATA.cards.length})`}
                </button>`
              : ""
          }
          <button type="button" class="btn small" data-goto="wallet">
            ${hasOwned ? `管理卡包 (${state.owned.length})` : `去「添加卡包」勾选持卡`}
          </button>
        </div>
      </div>
      <div class="all-cards-grid"></div>
    </section>`);

  const toggleAllBtn = stage.querySelector(".stage-toggle-all");
  if (toggleAllBtn) {
    toggleAllBtn.onclick = () => {
      showAllCardsInRecommend = !showAllCardsInRecommend;
      previewCardId = null;
      updateRecommendContent();
    };
  }

  const grid = stage.querySelector(".all-cards-grid");

  if (r) {
    // 已选商家或类别：按排名顺序显示每张卡的实时名次徽章、有效返现率与卡面状态
    const entries = [...r.ok.map((x, idx) => ({ ...x, rank: idx + 1 })), ...r.bad.map((x) => ({ ...x, rank: null }))];
    entries.forEach((entry) => {
      const c = entry.card;
      const isWinner = entry.rank === 1;
      const isPreviewed = activePreviewId === c.id;
      const isExcluded = Boolean(entry.excluded);
      const isOwned = state.owned.length ? state.owned.includes(c.id) : true;

      const stateCls = [
        "stage-card",
        isWinner ? "is-winner rank-1" : "",
        !isWinner && !isExcluded ? "is-runner-up" : "",
        isExcluded ? "is-excluded off" : "",
        isPreviewed ? "is-previewed" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const rankBadgeHtml = isWinner
        ? `<span class="stage-rank-badge winner">🏆 #1 最佳</span>`
        : isExcluded
        ? `<span class="stage-rank-badge excluded">✕ 不可用</span>`
        : `<span class="stage-rank-badge runner">#${entry.rank} 备选</span>`;

      const rateBadgeHtml = isExcluded
        ? `<span class="stage-rate-badge excluded">不可刷</span>`
        : `<span class="stage-rate-badge ${isWinner ? "winner" : ""}">${fmtPct(entry.eff)}</span>`;

      const cardEl = el(`
        <article class="${stateCls}" data-card-id="${c.id}" data-rank="${entry.rank || "excluded"}" tabindex="0" role="button" aria-label="${cardLabel(c)}">
          <div class="stage-card-top">
            ${rankBadgeHtml}
            ${rateBadgeHtml}
          </div>
          <div class="stage-card-art"></div>
          <div class="stage-card-footer">
            <div class="stage-card-name">${cardLabel(c)} <span class="net">${NET_NAME[c.network]}</span></div>
            <div class="stage-card-why">${
              isExcluded
                ? entry.reason
                : `${entry.why}${c.currency === "points" ? ` (${entry.cpp}¢/分)` : ""}`
            }</div>
          </div>
        </article>`);

      cardEl.querySelector(".stage-card-art").append(
        mountCardArt(c, {
          owned: isOwned,
          active: isWinner || isPreviewed,
          badgeText: isExcluded ? entry.reason : `${fmtPct(entry.eff)} · ${entry.why}`,
        })
      );

      const onSelectStageCard = () => {
        previewCardId = isWinner ? null : c.id;
        updateRecommendContent();
        document.querySelector(".hero-recommend-pop")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
      cardEl.onclick = onSelectStageCard;
      cardEl.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectStageCard();
        }
      };

      grid.append(cardEl);
    });
  } else {
    // 默认全卡包总览：展示每张卡的逼真卡面、最高返现率与当季核心亮点
    pool.forEach((c) => {
      const info = cardHeadlineInfo(c);
      const isOwned = state.owned.length ? state.owned.includes(c.id) : true;
      const cardEl = el(`
        <article class="stage-card is-overview" data-card-id="${c.id}">
          <div class="stage-card-top">
            <span class="stage-rank-badge overview">${issuerName(c.issuer)} · ${NET_NAME[c.network]}</span>
            <span class="stage-rate-badge overview">${info.rateBadge}</span>
          </div>
          <div class="stage-card-art"></div>
          <div class="stage-card-footer">
            <div class="stage-card-name">
              ${cardLabel(c)}
              <span class="fee">${c.annualFee ? "年费 " + money(c.annualFee) : "免年费"}</span>
            </div>
            <div class="stage-card-why">${summary(c)}</div>
          </div>
        </article>`);

      cardEl.querySelector(".stage-card-art").append(
        mountCardArt(c, {
          owned: isOwned,
          active: false,
          badgeText: `${info.highlightText} · ${c.annualFee ? "年费 $" + c.annualFee : "免年费"}`,
        })
      );

      grid.append(cardEl);
    });
  }

  return stage;
}

function buildResultsSection(r) {
  const out = el(`<section class="results"></section>`);
  out.append(el(`<h2>${r.merchant ? r.merchant.name : catName(r.catId)} 全部卡片返现排行 <span class="tag">${catName(r.catId)}</span></h2>`));
  if (r.merchant?.note) out.append(el(`<div class="warn">⚠️ ${r.merchant.note}</div>`));
  if (!r.ok.length) out.append(el(`<div class="empty">你的卡在这里都刷不了。</div>`));

  r.ok.forEach((x, i) => {
    const isOwned = state.owned.includes(x.card.id);
    const row = el(`
      <div class="result ${i === 0 ? "best" : ""}" data-card-id="${x.card.id}">
        <div class="rank">${i === 0 ? "最佳" : i + 1}</div>
        <div class="result-art"></div>
        <div class="body">
          <div class="name">${cardLabel(x.card)} <span class="net">${NET_NAME[x.card.network]}</span></div>
          <div class="why">${x.why}${x.card.currency === "points" ? `（积分按 ${x.cpp}¢/分 折算）` : ""}</div>
          ${x.card.rotating ? `<div class="note">${currentQuarter()} 5%：${rotatingItemNames(x.card).join("、") || "待设置"}</div>` : ""}
          ${x.notes.map((n) => `<div class="note">· ${n}</div>`).join("")}
          ${x.card.note ? `<div class="note">· ${x.card.note}</div>` : ""}
        </div>
        <div class="pct">${fmtPct(x.eff)}</div>
      </div>`);
    row.querySelector(".result-art").replaceWith(mountCardArt(x.card, { mini: true, owned: isOwned }));
    row.onclick = () => {
      previewCardId = i === 0 ? null : x.card.id;
      updateRecommendContent();
      document.querySelector(".hero-recommend-pop")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    out.append(row);
  });

  r.bad.forEach((x) => {
    const isOwned = state.owned.includes(x.card.id);
    const row = el(`
      <div class="result off" data-card-id="${x.card.id}">
        <div class="rank">✕</div>
        <div class="result-art"></div>
        <div class="body"><div class="name">${cardLabel(x.card)}</div><div class="why">${x.reason}</div></div>
        <div class="pct">—</div>
      </div>`);
    row.querySelector(".result-art").replaceWith(mountCardArt(x.card, { mini: true, owned: isOwned }));
    out.append(row);
  });
  return out;
}

function chip(label, on, fn) {
  const b = el(`<button type="button" class="chip ${on ? "on" : ""}"></button>`);
  b.textContent = label;
  b.onclick = fn;
  return b;
}
function pick(type, id) {
  manualSelected = { type, id };
  selected = { type, id };
  previewCardId = null;
  renderRecommend();
}

// ---------- 渲染：卡包（按发卡行堆叠卡组 + 手指左右滑动翻页） ----------
function renderWallet() {
  const root = document.getElementById("tab-wallet");
  root.innerHTML = "";
  root.append(renderSyncBar());
  root.append(el(`<input id="wq" type="search" placeholder="搜索卡片、发卡行或 5% 类别（如 Chase、Amazon、超市）…" autocomplete="off">`));
  const list = el(`<div class="wallet-stacks"></div>`);
  root.append(list);

  const draw = (q = "") => {
    q = q.trim().toLowerCase();
    list.innerHTML = "";
    DATA.issuers.forEach((iss) => {
      const cards = DATA.cards.filter((c) => {
        if (c.issuer !== iss.id) return false;
        if (!q) return true;
        const hay = `${cardLabel(c)} ${summary(c)} ${rotatingItemNames(c).join(" ")}`.toLowerCase();
        return hay.includes(q);
      });
      if (!cards.length) return;
      list.append(renderIssuerStack(iss, cards, q));
    });
    if (!list.children.length) {
      list.append(el(`<div class="empty">没有找到匹配的卡片</div>`));
    }
  };
  draw();
  root.querySelector("#wq").addEventListener("input", (e) => draw(e.target.value));
}

function renderIssuerStack(iss, cards, searchQuery = "") {
  const total = cards.length;
  const ownedCount = cards.filter((c) => state.owned.includes(c.id)).length;

  // 默认优先聚焦到该发卡行下用户已持有的第一张卡
  if (activeStackIdx[iss.id] === undefined || activeStackIdx[iss.id] >= total) {
    const firstOwned = cards.findIndex((c) => state.owned.includes(c.id));
    activeStackIdx[iss.id] = firstOwned >= 0 ? firstOwned : 0;
  }
  if (searchQuery) {
    activeStackIdx[iss.id] = Math.min(activeStackIdx[iss.id], total - 1);
  }

  const section = el(`
    <section class="issuer-stack group" data-issuer="${iss.id}">
      <div class="issuer-header stack-header">
        <h3>${iss.name} <span class="issuer-count stack-count">${ownedCount}/${total} 已持有</span></h3>
        ${
          total > 1
            ? `<div class="stack-nav">
                <button type="button" class="stack-btn stack-prev prev" aria-label="上一张">‹</button>
                <span class="stack-counter">1 / ${total}</span>
                <button type="button" class="stack-btn stack-next next" aria-label="下一张">›</button>
              </div>`
            : `<span class="stack-counter">1 / 1</span>`
        }
      </div>
      <div class="stack-tabs stack-pills"></div>
      <div class="stack-viewport">
        <div class="stack-deck"></div>
      </div>
      ${total > 1 ? `<div class="stack-dots"></div>` : ""}
    </section>`);

  const tabsEl = section.querySelector(".stack-tabs");
  const viewportEl = section.querySelector(".stack-viewport");
  const deckEl = section.querySelector(".stack-deck");
  const dotsEl = section.querySelector(".stack-dots");
  const counterEl = section.querySelector(".stack-counter");

  // 为每张卡构建堆叠节点
  const itemEls = cards.map((c, idx) => {
    const item = buildStackItem(c, idx, () => {
      if (activeStackIdx[iss.id] !== idx) flipTo(idx);
    });
    deckEl.append(item);
    return item;
  });

  // 构建顶部快速切换胶囊与底部指示点
  const tabBtns = cards.map((c, idx) => {
    const owned = state.owned.includes(c.id);
    const needsAct = owned && c.rotating?.needsActivation && !isCardActivated(c.id);
    const b = el(`
      <button type="button" class="stack-tab stack-pill ${owned ? "owned is-owned" : ""}">
        ${owned ? "✓ " : ""}${c.name}${needsAct ? " ⚠️" : ""}
      </button>`);
    b.onclick = () => flipTo(idx);
    tabsEl.append(b);
    return b;
  });

  const dotBtns = dotsEl
    ? cards.map((c, idx) => {
        const owned = state.owned.includes(c.id);
        const d = el(`<button type="button" class="stack-dot ${owned ? "owned" : ""}" aria-label="${c.name}"></button>`);
        d.onclick = () => flipTo(idx);
        dotsEl.append(d);
        return d;
      })
    : [];

  function syncPositions(flipDir = null) {
    const cur = activeStackIdx[iss.id] || 0;
    if (counterEl) counterEl.textContent = `${cur + 1} / ${total}`;

    const ownedNow = cards.filter((c) => state.owned.includes(c.id)).length;
    const countBadge = section.querySelector(".stack-count");
    if (countBadge) countBadge.textContent = `${ownedNow}/${total} 已持有`;

    itemEls.forEach((item, idx) => {
      const c = cards[idx];
      const owned = state.owned.includes(c.id);
      const offset = idx - cur;
      item.dataset.offset = String(offset);
      item.style.setProperty("--offset", String(offset));
      item.style.setProperty("--abs-offset", String(Math.abs(offset)));
      item.style.zIndex = String(30 - Math.abs(offset));

      item.classList.toggle("active", offset === 0);
      item.classList.toggle("is-active", offset === 0);
      item.classList.toggle("prev-1", offset === -1);
      item.classList.toggle("is-prev", offset === -1);
      item.classList.toggle("next-1", offset === 1);
      item.classList.toggle("is-next", offset === 1);
      item.classList.toggle("next-2", offset === 2);
      item.classList.toggle("is-next-2", offset === 2);
      item.classList.toggle("is-hidden", offset < -1 || offset > 2);
      item.classList.toggle("owned", owned);
      item.classList.toggle("is-owned", owned);

      if (offset === 0 && flipDir) {
        const cls = flipDir === "next" ? "flip-left" : "flip-right";
        item.classList.remove("flip-left", "flip-right");
        void item.offsetWidth;
        item.classList.add(cls);
        setTimeout(() => item.classList.remove(cls), 360);
      }
    });

    tabBtns.forEach((b, idx) => {
      const c = cards[idx];
      const owned = state.owned.includes(c.id);
      const needsAct = owned && c.rotating?.needsActivation && !isCardActivated(c.id);
      b.classList.toggle("active", idx === cur);
      b.classList.toggle("is-active", idx === cur);
      b.classList.toggle("owned", owned);
      b.classList.toggle("is-owned", owned);
      b.textContent = `${owned ? "✓ " : ""}${c.name}${needsAct ? " ⚠️" : ""}`;
    });

    dotBtns.forEach((d, idx) => {
      const owned = state.owned.includes(cards[idx].id);
      d.classList.toggle("active", idx === cur);
      d.classList.toggle("owned", owned);
    });
  }

  function flipTo(targetIdx, dir = null) {
    if (total <= 1) return;
    const cur = activeStackIdx[iss.id] || 0;
    const nextIdx = ((targetIdx % total) + total) % total;
    if (nextIdx === cur) return;
    const inferredDir = dir || (nextIdx > cur ? "next" : "prev");
    activeStackIdx[iss.id] = nextIdx;
    syncPositions(inferredDir);
  }

  if (total > 1) {
    section.querySelector(".stack-prev").onclick = () => flipTo((activeStackIdx[iss.id] || 0) - 1, "prev");
    section.querySelector(".stack-next").onclick = () => flipTo((activeStackIdx[iss.id] || 0) + 1, "next");
    bindStackSwipe(viewportEl, deckEl, () => itemEls[activeStackIdx[iss.id] || 0], {
      onNext: () => flipTo((activeStackIdx[iss.id] || 0) + 1, "next"),
      onPrev: () => flipTo((activeStackIdx[iss.id] || 0) - 1, "prev"),
    });
  }

  // 允许子卡片勾选/设置更新时刷新胶囊状态
  section._refreshStackMeta = () => syncPositions();
  syncPositions();
  return section;
}

function bindStackSwipe(viewportEl, deckEl, getActiveItem, { onNext, onPrev }) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dy = 0;
  let tracking = false;
  let swiping = false;

  const isInteractive = (target) =>
    Boolean(target.closest("input, button, a, label, summary, details, .chip"));

  const onStart = (x, y, target) => {
    if (isInteractive(target)) return;
    startX = x;
    startY = y;
    dx = 0;
    dy = 0;
    tracking = true;
    swiping = false;
  };

  const onMove = (x, y, ev) => {
    if (!tracking) return;
    dx = x - startX;
    dy = y - startY;
    if (!swiping) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        swiping = true;
        deckEl.classList.add("is-dragging");
        getActiveItem()?.classList.add("is-dragging");
      } else if (Math.abs(dy) > 16) {
        tracking = false;
        return;
      }
    }
    if (swiping) {
      if (ev?.cancelable) ev.preventDefault();
      const activeItem = getActiveItem();
      if (activeItem) {
        const rotY = Math.max(-18, Math.min(18, dx / 14));
        const rotZ = Math.max(-5, Math.min(5, dx / 45));
        activeItem.style.setProperty("--drag-x", `${dx}px`);
        activeItem.style.transform = `translate3d(${dx}px, 0, 0) rotateY(${rotY.toFixed(1)}deg) rotateZ(${rotZ.toFixed(1)}deg)`;
      }
    }
  };

  const onEnd = () => {
    if (!tracking) return;
    tracking = false;
    const activeItem = getActiveItem();
    deckEl.classList.remove("is-dragging");
    if (activeItem) {
      activeItem.classList.remove("is-dragging");
      activeItem.style.removeProperty("--drag-x");
      activeItem.style.removeProperty("transform");
    }
    if (swiping) {
      if (dx < -42) onNext();
      else if (dx > 42) onPrev();
    }
    swiping = false;
  };

  viewportEl.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
    },
    { passive: true }
  );
  viewportEl.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY, e);
    },
    { passive: false }
  );
  viewportEl.addEventListener("touchend", onEnd);
  viewportEl.addEventListener("touchcancel", onEnd);

  viewportEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    onStart(e.clientX, e.clientY, e.target);
  });
  viewportEl.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    onMove(e.clientX, e.clientY, e);
  });
  viewportEl.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") return;
    onEnd();
  });
  viewportEl.addEventListener("pointercancel", onEnd);
}

function buildStackItem(c, idx, onFocusCard) {
  const owned = state.owned.includes(c.id);
  const item = el(`
    <div class="stack-item ${owned ? "owned is-owned" : ""}" data-card-id="${c.id}" data-index="${idx}">
      <div class="card-visual card-art-slot"></div>
      <div class="card-row-slot"></div>
    </div>`);

  const renderInner = () => {
    const isOwned = state.owned.includes(c.id);
    const isActive = item.classList.contains("active");
    const artEl = mountCardArt(c, { owned: isOwned, active: isActive });
    artEl.addEventListener("click", () => onFocusCard?.());

    const artSlot = item.querySelector(".card-art-slot");
    artSlot.innerHTML = "";
    artSlot.append(artEl);

    const rowSlot = item.querySelector(".card-row-slot");
    rowSlot.innerHTML = "";
    rowSlot.append(
      cardRow(c, () => {
        renderInner();
        item.closest(".issuer-stack")?._refreshStackMeta?.();
      })
    );
  };

  renderInner();
  return item;
}

function cardRow(c, onChangeCard) {
  const owned = state.owned.includes(c.id);
  const q = currentQuarter();
  const sched = cardUpdateSchedule(c);
  const official = officialLinkOf(c);

  // 构建 5% 轮换或自选类别的可视化徽章
  let catBadgesHtml = "";
  if (c.rotating) {
    const rc = rotatingCats(c, q);
    const catPills = rc.categories.map((id) => `<span class="cat-pill ${rc.isCustom ? "custom" : "official"}">${catName(id)}</span>`);
    const merPills = rc.merchants.map((id) => `<span class="cat-pill merchant">🏪 ${merchantName(id)}</span>`);
    const statusTag = `<span class="tag ${rc.isCustom ? "warn" : "official"}">${q} ${rc.confirmed}</span>`;
    catBadgesHtml = `
      <div class="cat-badges">
        ${statusTag}
        ${catPills.concat(merPills).join("") || `<span class="cat-pill warn">本季 5% 类别待设置</span>`}
      </div>`;
  } else if (c.choices?.length) {
    const choicePills = [];
    c.choices.forEach((ch, i) => {
      const picks = getChoicePicks(c.id, i, ch.period || "quarter");
      if (picks.length) {
        picks.forEach((id) => choicePills.push(`<span class="cat-pill custom">${ch.rate}% ${catName(id)}</span>`));
      } else {
        choicePills.push(`<span class="cat-pill">${ch.label}（待选）</span>`);
      }
    });
    catBadgesHtml = `<div class="cat-badges">${choicePills.join("")}</div>`;
  }

  // 构建更新倒计时与待激活提醒
  let activationBadgeHtml = "";
  if (c.rotating?.needsActivation) {
    const act = isCardActivated(c.id, q);
    if (owned && !act) {
      activationBadgeHtml = `<span class="update-due tag warn unactivated">⚠️ 本季 5% 待激活</span>`;
    } else if (owned && act) {
      activationBadgeHtml = `<span class="update-due tag ok">✓ ${q} 5% 已激活</span>`;
    } else {
      activationBadgeHtml = `<span class="update-due tag">需每季激活 5%</span>`;
    }
  }

  const metaRowHtml =
    sched || activationBadgeHtml || official
      ? `<div class="update-schedule">
          ${sched ? `<span>${sched.badgeText}</span>` : ""}
          ${activationBadgeHtml}
          ${
            official
              ? `<a class="official-link" href="${official.url}" target="_blank" rel="noopener">🔗 ${official.label}</a>`
              : ""
          }
        </div>`
      : "";

  const row = el(`
    <div class="card card-panel stack-card-body ${owned ? "owned" : ""}">
      <label class="top own-toggle">
        <input type="checkbox" ${owned ? "checked" : ""}>
        <span class="name">${c.name}</span>
        <span class="net">${NET_NAME[c.network]}</span>
        <span class="fee">${c.annualFee ? "年费 " + money(c.annualFee) : "免年费"}</span>
      </label>
      <div class="summary">${summary(c)}</div>
      ${catBadgesHtml || metaRowHtml ? `<div class="card-meta-block">${catBadgesHtml}${metaRowHtml}</div>` : ""}
    </div>`);

  row.querySelector("input").onchange = (e) => {
    if (e.target.checked) {
      if (!state.owned.includes(c.id)) state.owned.push(c.id);
    } else {
      state.owned = state.owned.filter((x) => x !== c.id);
    }
    saveState();
    if (onChangeCard) onChangeCard();
    else row.replaceWith(cardRow(c));
  };

  if (owned && (c.rotating || c.choices || capKeysOf(c).length)) {
    row.append(cardSettings(c, onChangeCard));
  }
  return row;
}

function summary(c) {
  const parts = Object.entries(c.rates || {}).map(([k, v]) => `${catName(k)} ${rateOf(v)}x`);
  Object.entries(c.merchants || {}).forEach(([k, v]) => parts.push(`${merchantName(k)} ${rateOf(v)}x`));
  if (c.rotating) {
    const q = currentQuarter();
    const names = rotatingItemNames(c, q);
    parts.push(names.length ? `${q} ${c.rotating.rate}%：${names.join("、")}` : `${q} 季度轮换 ${c.rotating.rate}%`);
  }
  (c.choices || []).forEach((ch, i) => {
    const picks = getChoicePicks(c.id, i, ch.period || "quarter");
    if (picks.length) {
      parts.push(`${ch.label} ${ch.rate}%（${picks.map(catName).join("、")}）`);
    } else {
      parts.push(`${ch.label} ${ch.rate}%`);
    }
  });
  parts.push(`其他 ${c.base}x`);
  return parts.join(" · ");
}

function cardSettings(c, onChangeCard) {
  const cs = cardState(c.id);
  const box = el(`<details class="settings"><summary>设置（本季激活 / 5% 类别 / 当期已用额度）</summary></details>`);
  const save = () => saveState();
  const refreshSettings = () => {
    if (onChangeCard) {
      onChangeCard();
      const newDetails = document.querySelector(`.stack-item[data-card-id="${c.id}"] details.settings`);
      if (newDetails) newDetails.open = true;
    } else {
      box.replaceWith(reopen(cardSettings(c)));
    }
  };

  if (c.rotating) {
    const q = currentQuarter();
    const rc = rotatingCats(c, q);
    const activated = isCardActivated(c.id, q);
    const official = officialLinkOf(c);

    const act = el(`
      <label class="line">
        <input type="checkbox" ${activated ? "checked" : ""}>
        <span><strong>${q}</strong> 本季度 ${c.rotating.rate}% 已激活（新季度自动重置）</span>
      </label>`);
    act.querySelector("input").onchange = (e) => {
      setCardActivated(c.id, e.target.checked, q);
      save();
      refreshSettings();
    };
    box.append(act);

    const officialNames = [
      ...rc.officialCategories.map((id) => catName(id)),
      ...rc.officialMerchants.map((id) => merchantName(id)),
    ];
    const sec = el(`
      <div class="field">
        <div class="label">
          ${q} 季度 ${c.rotating.rate}% 类别
          <span class="tag ${rc.isCustom ? "warn" : ""}">${rc.confirmed}</span>
          ${
            official
              ? `<a class="official-link" href="${official.url}" target="_blank" rel="noopener">🔗 ${official.label}</a>`
              : ""
          }
        </div>
        ${rc.note ? `<div class="sub">${rc.note}</div>` : ""}
        ${
          officialNames.length
            ? `<div class="sub">官方本季 5% 范围：${officialNames.join("、")}</div>`
            : ""
        }
        <div class="chips"></div>
        ${
          rc.isCustom
            ? `<button type="button" class="btn small restore-official">恢复官方本季类别</button>`
            : ""
        }
      </div>`);

    const chips = sec.querySelector(".chips");
    DATA.categories.forEach((cat) => {
      const on = rc.categories.includes(cat.id);
      chips.append(
        chip(cat.name, on, () => {
          const cur = new Set(rotatingCats(c, q).categories);
          cur.has(cat.id) ? cur.delete(cat.id) : cur.add(cat.id);
          cs.quarterCats[q] = [...cur];
          save();
          refreshSettings();
        })
      );
    });

    const restoreBtn = sec.querySelector(".restore-official");
    if (restoreBtn) {
      restoreBtn.onclick = () => {
        delete cs.quarterCats[q];
        save();
        refreshSettings();
      };
    }
    box.append(sec);
  }

  (c.choices || []).forEach((ch, i) => {
    const period = ch.period || "quarter";
    const picks = getChoicePicks(c.id, i, period);
    const pInfo = ch.period ? ` · ${periodResetInfo(period)}` : "";
    const sec = el(`
      <div class="field">
        <div class="label">${ch.label}（选 ${ch.pick} 个${pInfo}）</div>
        <div class="chips"></div>
      </div>`);
    const chips = sec.querySelector(".chips");
    ch.options.forEach((opt) =>
      chips.append(
        chip(catName(opt), picks.includes(opt), () => {
          let p = [...getChoicePicks(c.id, i, period)];
          if (p.includes(opt)) p = p.filter((x) => x !== opt);
          else {
            p.push(opt);
            if (p.length > ch.pick) p.shift();
          }
          setChoicePicks(c.id, i, period, p);
          save();
          refreshSettings();
        })
      )
    );
    box.append(sec);
  });

  capKeysOf(c).forEach((k) => {
    const period = k.period || "quarter";
    const pk = periodKey(period);
    const curSpent = getSpent(c.id, k.key, period);
    const f = el(`
      <label class="field line">
        <span>${k.label}（<span class="tag">${pk}</span>）已用</span>
        <input type="number" min="0" step="10" value="${curSpent || ""}" placeholder="0">
        <span>/ ${money(k.cap)} ${PERIOD_NAME[period] || ""} · <small>${periodResetInfo(period)}</small></span>
      </label>`);
    f.querySelector("input").onchange = (e) => {
      setSpent(c.id, k.key, period, Number(e.target.value) || 0);
      save();
    };
    box.append(f);
  });
  return box;
}
function reopen(d) {
  d.open = true;
  return d;
}

// ---------- 渲染：设置 ----------
function renderSettings() {
  const root = document.getElementById("tab-settings");
  root.innerHTML = "";
  root.append(renderSyncBar());

  const programs = [...new Set(DATA.cards.filter((c) => c.currency === "points").map((c) => c.program))];
  const sec = el(
    `<section class="group"><h3>积分价值（每分值几美分）</h3><p class="sub">积分卡按这个数折算成返现率。保守按 1.0；如果你常转点换机票酒店，可以调到 1.5–2。</p></section>`
  );
  programs.forEach((p) => {
    const f = el(
      `<label class="field line">${p} <input type="number" min="0.5" max="3" step="0.05" value="${state.cpp[p] ?? 1}"> ¢</label>`
    );
    f.querySelector("input").onchange = (e) => {
      state.cpp[p] = Number(e.target.value) || 1;
      saveState();
    };
    sec.append(f);
  });
  root.append(sec);

  const data = el(`
    <section class="group"><h3>数据与周期说明</h3>
      <p class="sub">卡片规则更新于 ${DATA.updated}（季度轮换数据更新于 ${DATA.rotating?.updated || DATA.updated}）。${DATA.disclaimer}</p>
      <p class="sub">所有季度激活（${currentQuarter()}）、月度已用额度（${currentMonth()}）、年度已用额度（${currentYear()}）均按周期自动隔离存储，进入新季度/新月份/新年度时会自动切换并重置当期额度。</p>
      <p class="sub">没登录时，卡包只存在这台设备的浏览器里。用 Google 登录后会同步到云端（Firebase），只有你自己能读写，也不包含卡号。</p>
      <div class="row">
        <button class="btn" id="exp">导出我的设置</button>
        <label class="btn">导入设置<input type="file" id="imp" accept="application/json" hidden></label>
        <button class="btn danger" id="rst">清空</button>
      </div>
    </section>`);
  data.querySelector("#exp").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    a.download = "useme-settings.json";
    a.click();
  };
  data.querySelector("#imp").onchange = async (e) => {
    try {
      const s = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(s.owned)) throw 0;
      state = normalizeState(s);
      saveState();
      alert("已导入");
      renderAll();
    } catch (_) {
      alert("文件格式不对");
    }
  };
  data.querySelector("#rst").onclick = () => {
    if (confirm("确定清空卡包和所有设置？登录状态下云端的也会一起清空。")) {
      state = { owned: [], cards: {}, cpp: {} };
      saveState();
      renderAll();
    }
  };
  root.append(data);
}

// ---------- 页面 ----------
function showTab(name) {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll("main > section").forEach((s) => (s.hidden = s.id !== `tab-${name}`));
  ({ recommend: renderRecommend, wallet: renderWallet, settings: renderSettings })[name]();
  location.hash = name;
}
function renderAll() {
  showTab(document.querySelector("nav button.on")?.dataset.tab || "recommend");
}

async function init() {
  const [cards, m, rotating] = await Promise.all(
    ["data/cards.json", "data/merchants.json", "data/rotating.json"].map((u) =>
      fetch(u, { cache: "no-cache" }).then((r) => r.json())
    )
  );
  DATA = { ...cards, ...m, rotating };
  DATA.catMap = Object.fromEntries(DATA.categories.map((c) => [c.id, c]));
  DATA.merchantMap = Object.fromEntries(DATA.merchants.map((x) => [x.id, x]));
  DATA.cardMap = Object.fromEntries(DATA.cards.map((x) => [x.id, x]));
  state = normalizeState(state);
  saveState({ silent: true });

  document.querySelector("nav").onclick = (e) => {
    const t = e.target.closest("button")?.dataset.tab;
    if (t) showTab(t);
  };
  document.body.addEventListener("click", (e) => {
    const g = e.target.closest("[data-goto]")?.dataset.goto;
    if (g) showTab(g);
  });
  document.getElementById("quarter").textContent = `${currentQuarter()} · ${currentMonth()}`;
  const start = location.hash.slice(1);
  showTab(["recommend", "wallet", "settings"].includes(start) ? start : "recommend");
}
init().catch((e) => {
  document.querySelector("main").innerHTML = `<div class="empty">数据加载失败：${e.message}</div>`;
});
