// useme：在哪刷哪张卡
// 纯前端：数据在 data/*.json，用户状态存在浏览器 localStorage。

const STORE_KEY = "useme-v1";
const NET_NAME = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover" };
const PERIOD_NAME = { year: "每年", quarter: "每季度", month: "每账单周期" };

let DATA = null; // { cards, issuers, categories, merchants, rotating, catMap, merchantMap, cardMap }
let state = loadState();
let selected = null; // { type: 'merchant'|'category', id }

// ---------- 状态 ----------
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.owned)) return { cards: {}, cpp: {}, ...s };
  } catch (_) {}
  return { owned: [], cards: {}, cpp: {} };
}
function normalizeState(s) {
  const out = { owned: [], cards: {}, cpp: {}, ...(s || {}) };
  out.owned = Array.isArray(out.owned) ? [...new Set(out.owned)] : [];
  if (DATA) out.owned = out.owned.filter((id) => DATA.cardMap[id]);
  out.cards ||= {}; out.cpp ||= {};
  delete out.updatedAt;
  return out;
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
  if (!state.cards[id]) state.cards[id] = { activated: false, quarterCats: {}, picks: {}, spent: {} };
  const c = state.cards[id];
  c.quarterCats ||= {}; c.picks ||= {}; c.spent ||= {};
  return c;
}

// ---------- 工具 ----------
function currentQuarter(d = new Date()) {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}
const fmtPct = (n) => `${+n.toFixed(2)}%`;
const money = (n) => `$${Number(n).toLocaleString()}`;
const catName = (id) => DATA.catMap[id]?.name || id;
const issuerName = (id) => DATA.issuers.find((i) => i.id === id)?.name || id;
const cardLabel = (c) => `${issuerName(c.issuer)} ${c.name}`;
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };

function rotatingCats(card) {
  const q = currentQuarter();
  const local = cardState(card.id).quarterCats[q];
  const remote = DATA.rotating.quarters?.[q]?.[card.id] || {};
  return {
    categories: Array.isArray(local) ? local : remote.categories || [],
    merchants: remote.merchants || [],
    confirmed: Array.isArray(local) ? "本地设置" : remote.confirmed ? "已核实" : null,
  };
}

// 列出一张卡所有带上限的额度，用于「已用额度」输入
function capKeysOf(card) {
  const keys = [];
  for (const [cat, v] of Object.entries(card.rates || {}))
    if (typeof v === "object" && v.cap) keys.push({ key: v.capKey || cat, label: catName(cat), cap: v.cap, period: v.period });
  if (card.rotating?.cap) keys.push({ key: "rotating", label: "季度 5% 类别", cap: card.rotating.cap, period: "quarter" });
  (card.choices || []).forEach((ch, i) => { if (ch.cap) keys.push({ key: `choice${i}`, label: ch.label, cap: ch.cap, period: ch.period }); });
  const seen = new Set();
  return keys.filter((k) => !seen.has(k.key) && seen.add(k.key));
}

// ---------- 核心：计算一张卡在某个商家/类别的返现 ----------
function evaluate(card, merchant, catId) {
  const cs = cardState(card.id);
  const parent = DATA.catMap[catId]?.parent;
  const matchCat = (list) => list.includes(catId) || (parent && list.includes(parent));
  const notes = [];

  if (merchant?.networks && !merchant.networks.includes(card.network)) {
    return { card, excluded: true, reason: `${merchant.name} 不收 ${NET_NAME[card.network]}` };
  }

  const opts = [{ rate: card.base, why: "基础返现" }];
  const add = (entry, capKey, why) => {
    if (entry == null) return;
    const rate = typeof entry === "number" ? entry : entry.r ?? entry.rate;
    const cap = typeof entry === "object" ? entry.cap : null;
    const key = (typeof entry === "object" && entry.capKey) || capKey;
    if (cap) {
      const left = cap - (Number(cs.spent[key]) || 0);
      if (left <= 0) { notes.push(`${why}已达上限（${money(cap)}${PERIOD_NAME[entry.period] ? "，" + PERIOD_NAME[entry.period] : ""}）`); return; }
      opts.push({ rate, why: `${why}，${PERIOD_NAME[entry.period] || ""}额度还剩 ${money(left)}` });
    } else opts.push({ rate, why });
  };

  // 固定类别
  const r = card.rates || {};
  if (r[catId] != null) add(r[catId], catId, `${catName(catId)} ${rateOf(r[catId])}x`);
  else if (parent && r[parent] != null) add(r[parent], parent, `${catName(parent)} ${rateOf(r[parent])}x`);

  // 指定商家加成
  if (merchant && card.merchants?.[merchant.id] != null) add(card.merchants[merchant.id], merchant.id, `${merchant.name} 专属 ${rateOf(card.merchants[merchant.id])}x`);

  // 季度轮换
  if (card.rotating) {
    const rc = rotatingCats(card);
    const hit = matchCat(rc.categories) || (merchant && rc.merchants.includes(merchant.id));
    if (hit) {
      if (card.rotating.needsActivation && !cs.activated) notes.push(`本季 ${card.rotating.rate}% 类别包含这里，但你还没标记"已激活"`);
      else add({ r: card.rotating.rate, cap: card.rotating.cap, period: "quarter" }, "rotating", `${currentQuarter()} 季度 ${card.rotating.rate}%`);
    } else if (!rc.categories.length && !rc.merchants.length) {
      notes.push(`${currentQuarter()} 季度类别还没设置`);
    }
  }

  // 自选类别
  (card.choices || []).forEach((ch, i) => {
    const picks = cs.picks[i] || [];
    if (matchCat(picks)) add({ r: ch.rate, cap: ch.cap, period: ch.period }, `choice${i}`, `${ch.label}：${catName(catId)}`);
    else if (!picks.length && matchCat(ch.options)) notes.push(`可以把「${catName(catId)}」设为${ch.label}（${ch.rate}%）`);
  });

  const best = opts.reduce((a, b) => (b.rate > a.rate ? b : a));
  const cpp = card.currency === "points" ? Number(state.cpp[card.program] ?? 1) : 1;
  return { card, rate: best.rate, eff: best.rate * cpp, why: best.why, cpp, notes };
}
const rateOf = (e) => (typeof e === "number" ? e : e.r ?? e.rate);

function recommend() {
  if (!selected) return null;
  const merchant = selected.type === "merchant" ? DATA.merchantMap[selected.id] : null;
  const catId = merchant ? merchant.category : selected.id;
  const owned = state.owned.map((id) => DATA.cardMap[id]).filter(Boolean);
  const res = owned.map((c) => evaluate(c, merchant, catId));
  const ok = res.filter((r) => !r.excluded).sort((a, b) => b.eff - a.eff || (a.card.annualFee - b.card.annualFee));
  return { merchant, catId, ok, bad: res.filter((r) => r.excluded) };
}

// ---------- 渲染：推荐 ----------
function renderRecommend() {
  const root = document.getElementById("tab-recommend");
  root.innerHTML = "";
  if (!state.owned.length) {
    root.append(el(`<div class="empty">先去「我的卡包」勾选你有的卡，然后回来选商家。<br><button class="btn" data-goto="wallet">去勾选卡片</button></div>`));
    return;
  }
  root.append(el(`
    <section class="picker">
      <input id="mq" type="search" placeholder="搜索商家，比如 Costco、Whole Foods…" autocomplete="off">
      <div id="mlist" class="chips"></div>
      <div class="sub">或者直接选类别</div>
      <div id="clist" class="chips"></div>
    </section>`));
  const mlist = root.querySelector("#mlist");
  const drawMerchants = (q = "") => {
    q = q.trim().toLowerCase();
    mlist.innerHTML = "";
    DATA.merchants.filter((m) => !q || m.name.toLowerCase().includes(q) || catName(m.category).includes(q))
      .forEach((m) => mlist.append(chip(m.name, selected?.type === "merchant" && selected.id === m.id, () => pick("merchant", m.id))));
  };
  drawMerchants();
  root.querySelector("#mq").addEventListener("input", (e) => drawMerchants(e.target.value));
  const clist = root.querySelector("#clist");
  DATA.categories.forEach((c) => clist.append(chip(c.name, selected?.type === "category" && selected.id === c.id, () => pick("category", c.id))));

  const r = recommend();
  if (!r) return;
  const out = el(`<section class="results"></section>`);
  out.append(el(`<h2>${r.merchant ? r.merchant.name : catName(r.catId)} <span class="tag">${catName(r.catId)}</span></h2>`));
  if (r.merchant?.note) out.append(el(`<div class="warn">⚠️ ${r.merchant.note}</div>`));
  if (!r.ok.length) out.append(el(`<div class="empty">你的卡在这里都刷不了。</div>`));
  r.ok.forEach((x, i) => {
    out.append(el(`
      <div class="result ${i === 0 ? "best" : ""}">
        <div class="rank">${i === 0 ? "最佳" : i + 1}</div>
        <div class="body">
          <div class="name">${cardLabel(x.card)} <span class="net">${NET_NAME[x.card.network]}</span></div>
          <div class="why">${x.why}${x.card.currency === "points" ? `（积分按 ${x.cpp}¢/分 折算）` : ""}</div>
          ${x.notes.map((n) => `<div class="note">· ${n}</div>`).join("")}
          ${x.card.note ? `<div class="note">· ${x.card.note}</div>` : ""}
        </div>
        <div class="pct">${fmtPct(x.eff)}</div>
      </div>`));
  });
  r.bad.forEach((x) => out.append(el(`
      <div class="result off"><div class="rank">✕</div>
        <div class="body"><div class="name">${cardLabel(x.card)}</div><div class="why">${x.reason}</div></div>
        <div class="pct">—</div></div>`)));
  root.append(out);
}
function chip(label, on, fn) {
  const b = el(`<button class="chip ${on ? "on" : ""}"></button>`);
  b.textContent = label; b.onclick = fn; return b;
}
function pick(type, id) { selected = { type, id }; renderRecommend(); document.querySelector(".results")?.scrollIntoView({ behavior: "smooth", block: "start" }); }

// ---------- 渲染：卡包 ----------
function renderWallet() {
  const root = document.getElementById("tab-wallet");
  root.innerHTML = "";
  root.append(el(`<input id="wq" type="search" placeholder="搜索卡片…" autocomplete="off">`));
  const list = el(`<div></div>`);
  root.append(list);
  const draw = (q = "") => {
    q = q.trim().toLowerCase();
    list.innerHTML = "";
    DATA.issuers.forEach((iss) => {
      const cards = DATA.cards.filter((c) => c.issuer === iss.id && (!q || cardLabel(c).toLowerCase().includes(q)));
      if (!cards.length) return;
      const g = el(`<section class="group"><h3>${iss.name}</h3></section>`);
      cards.forEach((c) => g.append(cardRow(c)));
      list.append(g);
    });
  };
  draw();
  root.querySelector("#wq").addEventListener("input", (e) => draw(e.target.value));
}

function cardRow(c) {
  const owned = state.owned.includes(c.id);
  const row = el(`
    <div class="card ${owned ? "owned" : ""}">
      <label class="top">
        <input type="checkbox" ${owned ? "checked" : ""}>
        <span class="name">${c.name}</span>
        <span class="net">${NET_NAME[c.network]}</span>
        <span class="fee">${c.annualFee ? "年费 " + money(c.annualFee) : "免年费"}</span>
      </label>
      <div class="summary">${summary(c)}</div>
    </div>`);
  row.querySelector("input").onchange = (e) => {
    if (e.target.checked) state.owned.push(c.id); else state.owned = state.owned.filter((x) => x !== c.id);
    saveState(); row.replaceWith(cardRow(c));
  };
  if (owned && (c.rotating || c.choices || capKeysOf(c).length)) row.append(cardSettings(c));
  return row;
}

function summary(c) {
  const parts = Object.entries(c.rates || {}).map(([k, v]) => `${catName(k)} ${rateOf(v)}x`);
  Object.entries(c.merchants || {}).forEach(([k, v]) => parts.push(`${DATA.merchantMap[k]?.name || k} ${rateOf(v)}x`));
  if (c.rotating) parts.push(`季度轮换 ${c.rotating.rate}%`);
  (c.choices || []).forEach((ch) => parts.push(`${ch.label} ${ch.rate}%`));
  parts.push(`其他 ${c.base}x`);
  return parts.join(" · ");
}

function cardSettings(c) {
  const cs = cardState(c.id);
  const box = el(`<details class="settings"><summary>设置（激活 / 类别 / 已用额度）</summary></details>`);
  const save = () => saveState();

  if (c.rotating) {
    const q = currentQuarter();
    const rc = rotatingCats(c);
    const act = el(`<label class="line"><input type="checkbox" ${cs.activated ? "checked" : ""}> 本季度 ${c.rotating.rate}% 已激活</label>`);
    act.querySelector("input").onchange = (e) => { cs.activated = e.target.checked; save(); };
    box.append(act);
    const sec = el(`<div class="field"><div class="label">${q} 季度 5% 类别 ${rc.confirmed ? `<span class="tag">${rc.confirmed}</span>` : `<span class="tag warn">待设置</span>`}</div><div class="chips"></div></div>`);
    const chips = sec.querySelector(".chips");
    DATA.categories.forEach((cat) => {
      const on = rc.categories.includes(cat.id);
      chips.append(chip(cat.name, on, () => {
        const cur = new Set(rotatingCats(c).categories);
        cur.has(cat.id) ? cur.delete(cat.id) : cur.add(cat.id);
        cs.quarterCats[q] = [...cur]; save(); box.replaceWith(reopen(cardSettings(c)));
      }));
    });
    box.append(sec);
  }

  (c.choices || []).forEach((ch, i) => {
    const picks = cs.picks[i] || [];
    const sec = el(`<div class="field"><div class="label">${ch.label}（选 ${ch.pick} 个）</div><div class="chips"></div></div>`);
    const chips = sec.querySelector(".chips");
    ch.options.forEach((opt) => chips.append(chip(catName(opt), picks.includes(opt), () => {
      let p = [...(cs.picks[i] || [])];
      if (p.includes(opt)) p = p.filter((x) => x !== opt);
      else { p.push(opt); if (p.length > ch.pick) p.shift(); }
      cs.picks[i] = p; save(); box.replaceWith(reopen(cardSettings(c)));
    })));
    box.append(sec);
  });

  capKeysOf(c).forEach((k) => {
    const f = el(`<label class="field line">${k.label} 已用 <input type="number" min="0" step="10" value="${cs.spent[k.key] || ""}" placeholder="0"> / ${money(k.cap)} ${PERIOD_NAME[k.period] || ""}</label>`);
    f.querySelector("input").onchange = (e) => { cs.spent[k.key] = Number(e.target.value) || 0; save(); };
    box.append(f);
  });
  return box;
}
function reopen(d) { d.open = true; return d; }

// ---------- 渲染：设置 ----------
function renderSettings() {
  const root = document.getElementById("tab-settings");
  root.innerHTML = "";
  const programs = [...new Set(DATA.cards.filter((c) => c.currency === "points").map((c) => c.program))];
  const sec = el(`<section class="group"><h3>积分价值（每分值几美分）</h3><p class="sub">积分卡按这个数折算成返现率。保守按 1.0；如果你常转点换机票酒店，可以调到 1.5–2。</p></section>`);
  programs.forEach((p) => {
    const f = el(`<label class="field line">${p} <input type="number" min="0.5" max="3" step="0.05" value="${state.cpp[p] ?? 1}"> ¢</label>`);
    f.querySelector("input").onchange = (e) => { state.cpp[p] = Number(e.target.value) || 1; saveState(); };
    sec.append(f);
  });
  root.append(sec);

  const data = el(`
    <section class="group"><h3>数据</h3>
      <p class="sub">卡片规则更新于 ${DATA.updated}。${DATA.disclaimer}</p>
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
    a.download = "useme-settings.json"; a.click();
  };
  data.querySelector("#imp").onchange = async (e) => {
    try { const s = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(s.owned)) throw 0; state = normalizeState(s); saveState(); alert("已导入"); renderAll(); }
    catch (_) { alert("文件格式不对"); }
  };
  data.querySelector("#rst").onclick = () => { if (confirm("确定清空卡包和所有设置？登录状态下云端的也会一起清空。")) { state = { owned: [], cards: {}, cpp: {} }; saveState(); renderAll(); } };
  root.append(data);
}

// ---------- 页面 ----------
function showTab(name) {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll("main > section").forEach((s) => (s.hidden = s.id !== `tab-${name}`));
  ({ recommend: renderRecommend, wallet: renderWallet, settings: renderSettings })[name]();
  location.hash = name;
}
function renderAll() { showTab(document.querySelector("nav button.on")?.dataset.tab || "recommend"); }

async function init() {
  const [cards, m, rotating] = await Promise.all(
    ["data/cards.json", "data/merchants.json", "data/rotating.json"].map((u) => fetch(u, { cache: "no-cache" }).then((r) => r.json()))
  );
  DATA = { ...cards, ...m, rotating };
  DATA.catMap = Object.fromEntries(DATA.categories.map((c) => [c.id, c]));
  DATA.merchantMap = Object.fromEntries(DATA.merchants.map((x) => [x.id, x]));
  DATA.cardMap = Object.fromEntries(DATA.cards.map((x) => [x.id, x]));
  state.owned = state.owned.filter((id) => DATA.cardMap[id]);

  document.querySelector("nav").onclick = (e) => { const t = e.target.closest("button")?.dataset.tab; if (t) showTab(t); };
  document.body.addEventListener("click", (e) => { const g = e.target.closest("[data-goto]")?.dataset.goto; if (g) showTab(g); });
  document.getElementById("quarter").textContent = currentQuarter();
  const start = location.hash.slice(1);
  showTab(["recommend", "wallet", "settings"].includes(start) ? start : state.owned.length ? "recommend" : "wallet");
}
init().catch((e) => { document.querySelector("main").innerHTML = `<div class="empty">数据加载失败：${e.message}</div>`; });
