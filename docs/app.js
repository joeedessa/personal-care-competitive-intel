/* Personal care competitive intelligence — view layer.
   Data comes from data.js (window.__CI_DATA__), produced by scripts/build.py.

   Two price views:
     "norm"  like-for-like — everything rebased to per 100ml/g, per stick, per unit.
             Answers "who is expensive?" Bar length is normalised USD.
     "asis"  as sold — the actual shelf price of the actual pack.
             Answers "what does the customer hand over?" Bar length is the
             selected single currency; mixed home currencies never share an axis. */

const D = window.__CI_DATA__;
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const TIER_VAR = { luxury: "--tier-luxury", premium: "--tier-premium", masstige: "--tier-masstige", mass: "--tier-mass" };
const TIER_LABEL = { luxury: "Luxury", premium: "Premium", masstige: "Masstige", mass: "Mass" };
const THREAT_VAR = { high: "--critical", medium: "--serious", low: "--good" };
const TAG_LABEL = {
  sustainability: "Sustainability & refill", retail_expansion: "Retail expansion",
  product_launch: "Product launch", collaboration: "Collaboration", campaign_pr: "Campaign & PR",
  corporate: "Corporate & M&A", awards_press: "Awards & press",
  experiential: "Experiential & activations",
};
const TAG_KEYS = Object.keys(TAG_LABEL);
const KIND_LABEL = {
  same_tier_gap: "Same-tier gap", pack_illusion: "Pack-size illusion", geography: "Geography premium",
  white_space: "White space", uae_gap: "UAE exposure", price_leader: "Price leadership",
  momentum: "Coverage momentum", initiative: "Comms focus", entry_price: "Entry price",
};
const OWN_LABEL = { independent: "Independent", corporate: "Group-owned" };

const state = {
  cat: "", tier: "", role: "", own: "", cur: "usd", q: "", tag: "", region: "", brand: "",
  view: "norm", tab: "overview", cmp: [null, null, null],
  sort: { key: "sku_count", dir: -1 },
};

/* ---------- theme ---------- */
function applyTheme(mode) {
  if (mode === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", mode);
  try { localStorage.setItem("ci-theme", mode); } catch (e) { /* private mode */ }
  document.querySelectorAll("[data-theme-set]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.themeSet === mode)));
}

/* ---------- money ---------- */
const CUR_SYMBOL = { USD: "$", EUR: "€", GBP: "£", AUD: "A$", AED: "AED ", SEK: "SEK ", JPY: "¥", KRW: "₩", INR: "₹", CAD: "C$", ILS: "₪", CHF: "CHF ", BRL: "R$", OMR: "OMR " };
function money(v, cur) {
  if (v == null) return "—";
  const sym = CUR_SYMBOL[cur] ?? cur + " ";
  const dp = v >= 10 || ["JPY", "KRW", "INR"].includes(cur) ? 0 : 2;
  return sym + v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
const sizeLabel = (p) => (p.unit === "unit" ? "each" : `${p.size} ${p.unit}`);

/* Figure to display, and the value the bar is drawn from. */
function priceOf(p, cur) {
  if (cur === "aed") return { v: p.price_aed_observed ?? p.price_aed_expected, cur: "AED", derived: p.price_aed_observed == null };
  if (cur === "home") return { v: p.price_home, cur: p.home_currency, derived: false };
  return { v: p.price_usd, cur: "USD", derived: false };
}
function normOf(p, cur) {
  if (cur === "aed") return p.norm_aed_expected;
  return p.norm_usd;
}

/* ---------- filtering ---------- */
function matches(p) {
  if (state.cat && p.category !== state.cat) return false;
  if (state.tier && p.brand_tier !== state.tier) return false;
  if (state.role && p.brand_role !== state.role) return false;
  if (state.own && p.brand_ownership !== state.own) return false;
  if (state.q) {
    const hay = (p.brand_name + " " + p.name + " " + (p.notes || "")).toLowerCase();
    if (!hay.includes(state.q.toLowerCase())) return false;
  }
  return true;
}
const filtered = () => D.products.filter(matches);

/* ---------- tooltip ---------- */
const tip = $("#tip");
function showTip(e, html) {
  tip.innerHTML = html;
  tip.style.opacity = "1";
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 16, y = e.clientY + 16;
  if (x + r.width > innerWidth - 10) x = e.clientX - r.width - 16;
  if (y + r.height > innerHeight - 10) y = e.clientY - r.height - 16;
  tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
}
const hideTip = () => { tip.style.opacity = "0"; };
/* Tooltips enhance; they never gate a value.
   `focusable` is opt-in and reserved for marks whose information is carried ONLY
   by colour or position — matrix cells, map dots. Bar rows already print their
   number as a direct label, so making 250 of them tab stops would add a vast
   keyboard trap and no information. Those stay mouse-only, with the table view
   as the keyboard/screen-reader path. */
function bindTip(node, html, focusable) {
  node.addEventListener("mousemove", (e) => showTip(e, html));
  node.addEventListener("mouseleave", hideTip);
  if (!focusable) return;
  node.tabIndex = 0;
  node.setAttribute("aria-label", html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  node.addEventListener("focus", () => {
    const b = node.getBoundingClientRect();
    showTip({ clientX: b.left + 24, clientY: b.top + b.height }, html);
  });
  node.addEventListener("blur", hideTip);
}

function productTip(p) {
  return `
    <div class="t-title">${esc(p.brand_name)} — ${esc(p.name)}</div>
    <div class="t-row"><span>Pack size</span><b>${esc(sizeLabel(p))}</b></div>
    <div class="t-row"><span>US price</span><b>${esc(money(p.price_usd, "USD"))}</b></div>
    <div class="t-row"><span>Home (${esc(p.home_currency)})</span><b>${esc(money(p.price_home, p.home_currency))}</b></div>
    <div class="t-row"><span>UAE ${p.price_aed_observed != null ? "observed" : "expected"}</span><b>${esc(money(p.price_aed_observed ?? p.price_aed_expected, "AED"))}</b></div>
    <div class="t-row"><span>${esc(p.basis_label)}</span><b>${esc(money(p.norm_usd, "USD"))}</b></div>
    ${p.price_index != null ? `<div class="t-row"><span>Index vs category</span><b>${p.price_index}</b></div>` : ""}
    ${p.us_vs_home_pct != null ? `<div class="t-row"><span>US vs home market</span><b>${p.us_vs_home_pct > 0 ? "+" : ""}${p.us_vs_home_pct}%</b></div>` : ""}
    <div class="t-row"><span>${TIER_LABEL[p.brand_tier]}</span><b>${p.verified ? "verified" : "estimate"}</b></div>`;
}

/* ---------- header ---------- */
function renderHeader() {
  $("#meta-generated").textContent = "Built " + new Date(D.generated_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  $("#meta-fx").textContent = `FX ${D.fx.as_of}`;
  $("#meta-news").textContent = D.news_generated_at
    ? `Signals ${new Date(D.news_generated_at).toLocaleDateString(undefined, { dateStyle: "medium" })}`
    : "Signals not yet collected";

  const s = D.stats;
  const widest = [...D.categories].filter((c) => c.spread_multiple).sort((a, b) => b.spread_multiple - a.spread_multiple)[0];
  const find = (kind) => (D.findings || []).find((f) => f.kind === kind);

  // Coverage is credibility, not insight — it belongs in the meta line.
  const cov = $("#meta-coverage");
  if (cov) cov.textContent = `${s.brands} brands · ${s.skus} SKUs · ${s.categories} categories`;

  // The band answers "what should I know before I look at anything else?"
  const ceiling = [...D.brands].filter((b) => b.avg_price_index && b.sku_count >= 3)
    .sort((a, b) => b.avg_price_index - a.avg_price_index)[0];
  const gap = find("same_tier_gap");
  const uae = find("uae_gap");
  const crowded = [...D.categories].sort((a, b) => b.brand_count - a.brand_count)[0];

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const recent = D.news.filter((n) => (n.published || "") >= weekAgo).length;

  const tiles = [
    { label: "Price ceiling", value: ceiling ? ceiling.avg_price_index : "—",
      foot: ceiling ? `${ceiling.name} vs category median` : "" },
    { label: "Widest spread", value: widest ? widest.spread_multiple + "×" : "—",
      foot: widest ? widest.label.toLowerCase() : "" },
    { label: "Steepest tier gap", value: gap ? gap.metric : "—",
      foot: gap ? "two brands, one claim" : "" },
    { label: "Most contested", value: crowded ? crowded.brand_count : "—",
      foot: crowded ? `brands in ${crowded.label.toLowerCase()}` : "" },
    { label: "No UAE route", value: uae ? uae.metric : "—", foot: "premium brands, no Gulf channel" },
    { label: "Signals this week", value: recent, foot: `${s.news_items} collected in all` },
  ];
  const box = $("#tiles"); box.innerHTML = "";
  tiles.forEach((t) => {
    const n = el("div", "tile");
    n.append(el("div", "label", esc(t.label)), el("div", "value", esc(String(t.value))), el("div", "foot", esc(t.foot)));
    box.append(n);
  });
  $("#foot-counts").textContent =
    `${s.brands} brands · ${s.skus} SKUs · ${s.watchlist} on the radar · ${s.news_items} signals · ${s.aed_observed} observed UAE prices recorded.`;
}

/* ---------- price ladder ---------- */
function renderLadder() {
  const cat = D.categories.find((c) => c.id === state.cat);
  const all = filtered();
  const asis = state.view === "asis";
  const curKey = asis && state.cur === "home" ? "home" : state.cur;

  // Like-for-like drops SKUs measured on a different basis. As-sold keeps
  // everything: an incense holder next to a stick pack is a real shelf fact.
  let rows, excluded = 0;
  if (asis) {
    rows = all.filter((p) => priceOf(p, curKey).v != null);
  } else {
    const withNorm = all.filter((p) => normOf(p, curKey) != null);
    rows = withNorm.filter((p) => !p.off_basis);
    excluded = withNorm.length - rows.length;
  }

  // Home currency cannot share an axis with itself across brands — a value in
  // KRW and one in EUR are not comparable lengths. Bars fall back to USD.
  const mixedHome = asis && state.cur === "home";
  const barVal = (p) => (asis ? (mixedHome ? p.price_usd : priceOf(p, curKey).v) : normOf(p, curKey));
  rows = rows.filter((p) => barVal(p) != null).sort((a, b) => barVal(b) - barVal(a));

  $("#ladder-title").textContent =
    (asis ? "Shelf price — " : "Price ladder — ") + (cat ? cat.label : "all categories");
  $("#ladder-basis").textContent = asis ? "as sold" : (rows.length ? rows[0].basis_label : "—");
  $("#ladder-note").innerHTML = asis
    ? `<b>As sold.</b> The actual price of the actual pack, at the size the brand chose to sell it in — no rebasing. This is what the customer hands over, and it is the number a shopper compares. A 500 ml Aesop hand wash and a 250 ml Diptyque sit side by side here at their real prices; switch to <b>like for like</b> to see which is genuinely dearer per millilitre.`
    : `<b>Like for like.</b> Everything rebased to a common basis — per 100 ml or 100 g, per stick, or per unit — so pack size cannot flatter anyone. The vertical rule is the category median. Switch to <b>as sold</b> for real shelf prices.`;

  const box = $("#ladder"); box.innerHTML = "";
  if (!rows.length) { box.append(el("div", "empty", "Nothing matches these filters.")); $("#ladder-foot").textContent = ""; return; }

  const max = barVal(rows[0]);
  const median = !asis && cat ? (curKey === "aed" ? null : cat.median_norm_usd) : null;

  rows.forEach((p, i) => {
    const row = el("div", "bar-row");
    const nameCell = el("div", "bar-name",
      `<b class="brand-link" data-brand="${esc(p.brand)}">${esc(p.brand_name)}</b> ${esc(p.name)}${asis ? ` <span class="sz">· ${esc(sizeLabel(p))}</span>` : ""}`);
    row.append(nameCell);

    const track = el("div", "track");
    if (median) {
      const rule = el("div", "median-rule");
      rule.style.left = (median / max * 100) + "%";
      track.append(rule);
    }
    const fill = el("div", "fill");
    fill.style.width = Math.max(0.4, barVal(p) / max * 100) + "%";
    fill.style.background = `var(${TIER_VAR[p.brand_tier]})`;
    track.append(fill);
    row.append(track);

    const dp = priceOf(p, curKey);
    const label = asis ? money(dp.v, dp.cur) : money(normOf(p, curKey), curKey === "aed" ? "AED" : "USD");
    const extreme = i === 0 || i === rows.length - 1;
    row.append(el("div", "bar-val", extreme ? `<b>${esc(label)}</b>` : esc(label)));

    bindTip(row, productTip(p));
    box.append(row);
  });

  const parts = [];
  if (asis) {
    parts.push(`${rows.length} SKUs at their real pack size.`);
    if (mixedHome) parts.push("Figures are in each brand's home currency; bar length uses USD, because different currencies cannot share one axis.");
    if (curKey === "aed") parts.push("AED figures are the FX-parity expectation unless an observed price has been recorded.");
  } else if (cat && median) {
    parts.push(`Median ${money(median, "USD")} ${rows[0].basis_label} · spread ${cat.spread_multiple}× cheapest to dearest · ${rows.length} SKUs.`);
  } else if (cat && curKey === "aed") {
    parts.push(`${rows.length} SKUs, rebased ${rows[0].basis_label} in AED.`);
  } else {
    parts.push(`${rows.length} SKUs across all categories — pick one category for a true like-for-like ladder.`);
  }
  if (excluded) parts.push(`${excluded} SKU${excluded === 1 ? "" : "s"} measured on a different basis excluded; the "as sold" view shows them.`);
  $("#ladder-foot").textContent = parts.join(" ");
}

/* ---------- category spread ---------- */
function renderSpread() {
  const cats = D.categories.filter((c) => c.spread_multiple).sort((a, b) => b.spread_multiple - a.spread_multiple);
  const box = $("#spread"); box.innerHTML = "";
  const max = Math.max(...cats.map((c) => c.spread_multiple));

  cats.forEach((c) => {
    const inCat = D.products.filter((p) => p.category === c.id && p.norm_usd != null && !p.off_basis);
    const lo = inCat.reduce((a, b) => (a.norm_usd < b.norm_usd ? a : b));
    const hi = inCat.reduce((a, b) => (a.norm_usd > b.norm_usd ? a : b));

    const row = el("div", "spread-row");
    const head = el("div", "spread-head");
    head.append(el("span", "cat", esc(c.label)));
    head.append(el("span", "chip plain", esc(c.basis_label || "")));
    head.append(el("span", "mult", `${c.spread_multiple}×`));
    row.append(head);

    const bar = el("div", "spread-bar");
    const inner = el("i");
    inner.style.left = "0%";
    inner.style.width = (c.spread_multiple / max * 100) + "%";
    bar.append(inner);
    row.append(bar);

    const ends = el("div", "spread-ends");
    ends.append(el("span", null, `Cheapest · ${esc(lo.brand_name)} ${esc(money(lo.norm_usd, "USD"))}`));
    ends.append(el("span", null, `Dearest · ${esc(hi.brand_name)} ${esc(money(hi.norm_usd, "USD"))}`));
    row.append(ends);

    bindTip(row, `
      <div class="t-title">${esc(c.label)}</div>
      <div class="t-row"><span>Basis</span><b>${esc(c.basis_label || "—")}</b></div>
      <div class="t-row"><span>Cheapest</span><b>${esc(money(c.min_norm_usd, "USD"))}</b></div>
      <div class="t-row"><span>Median</span><b>${esc(money(c.median_norm_usd, "USD"))}</b></div>
      <div class="t-row"><span>Dearest</span><b>${esc(money(c.max_norm_usd, "USD"))}</b></div>
      <div class="t-row"><span>Spread</span><b>${c.spread_multiple}×</b></div>
      <div class="t-row"><span>Comparable SKUs · brands</span><b>${c.comparable_count} · ${c.brand_count}</b></div>
      ${c.off_basis_count ? `<div class="t-row"><span>Excluded (other basis)</span><b>${c.off_basis_count}</b></div>` : ""}`);
    box.append(row);
  });
}

/* ---------- UAE pricing ---------- */
function renderAed() {
  const gaps = D.products.filter((p) => p.aed_gap_pct != null).sort((a, b) => b.aed_gap_pct - a.aed_gap_pct);
  const box = $("#aedgap"); box.innerHTML = "";
  const uplift = D.fx.uae.uplift_by_tier;

  $("#aed-note").innerHTML = `
    <b>The model.</b> Expected UAE shelf price = US price × ${D.fx.rates.AED} × a tier uplift covering
    5% VAT plus importer and distributor margin
    (luxury +${Math.round(uplift.luxury * 100)}%, premium +${Math.round(uplift.premium * 100)}%,
    masstige +${Math.round(uplift.masstige * 100)}%, mass +${Math.round(uplift.mass * 100)}%).<br><br>
    <b>Why it matters.</b> Once you record a real observed AED price, the gap against this
    expectation is the single most decision-useful number here: a large positive gap is pricing
    power or grey-market exposure, a negative one means the brand is buying share.
    Brands that price in AED natively are excluded — for them the comparison is circular.`;

  if (gaps.length) {
    const max = Math.max(30, ...gaps.map((r) => Math.abs(r.aed_gap_pct)));
    const chart = el("div");
    gaps.forEach((p) => {
      const row = el("div", "div-row");
      row.append(el("div", "bar-name", `<b>${esc(p.brand_name)}</b> ${esc(p.name)}`));
      const track = el("div", "div-track");
      track.append(el("div", "div-axis"));
      const fill = el("div", "div-fill");
      const w = Math.abs(p.aed_gap_pct) / max * 50;
      if (p.aed_gap_pct >= 0) { fill.style.left = "50%"; fill.style.background = "var(--div-high)"; }
      else { fill.style.right = "50%"; fill.style.background = "var(--div-low)"; }
      fill.style.width = w + "%";
      track.append(fill); row.append(track);
      row.append(el("div", "bar-val", `<b>${p.aed_gap_pct > 0 ? "+" : ""}${p.aed_gap_pct}%</b>`));
      bindTip(row, `
        <div class="t-title">${esc(p.brand_name)} — ${esc(p.name)}</div>
        <div class="t-row"><span>Observed AED</span><b>${esc(money(p.price_aed_observed, "AED"))}</b></div>
        <div class="t-row"><span>Expected AED</span><b>${esc(money(p.price_aed_expected, "AED"))}</b></div>
        <div class="t-row"><span>At pure FX parity</span><b>${esc(money(p.price_aed_parity, "AED"))}</b></div>`);
      chart.append(row);
    });
    box.append(el("h3", null, "Observed vs expected"), chart);
  }

  // Verification queue — the hero SKUs to price-check, expectation pre-computed.
  const queue = D.products
    .filter((p) => p.hero && !p.aed_native && p.price_aed_expected != null && p.price_aed_observed == null)
    .filter(matches)
    .sort((a, b) => b.price_aed_expected - a.price_aed_expected);

  box.append(el("h3", null, gaps.length ? "Verification queue" : "Expected shelf price — verification queue"));
  if (!queue.length) { box.append(el("div", "empty", "No hero SKUs left to verify in this filter.")); return; }

  box.append(el("p", "note",
    `No observed UAE prices are recorded for these yet, so the figures below are the model's
     expectation, not a shelf fact. Check one on Ounass, Sephora ME or Bloomingdale's Dubai,
     put the real number in <code>px.aed</code> and set <code>conf: "ver"</code> — the gap chart
     above turns on as soon as you do. ${queue.length} hero SKUs outstanding.`));

  const max = Math.max(...queue.map((p) => p.price_aed_expected));
  const chart = el("div", "bars");
  queue.slice(0, 24).forEach((p, i) => {
    const row = el("div", "bar-row");
    row.append(el("div", "bar-name", `<b>${esc(p.brand_name)}</b> ${esc(p.name)} <span class="sz">· ${esc(sizeLabel(p))}</span>`));
    const track = el("div", "track");
    const fill = el("div", "fill");
    fill.style.width = (p.price_aed_expected / max * 100) + "%";
    fill.style.background = `var(${TIER_VAR[p.brand_tier]})`;
    track.append(fill); row.append(track);
    const extreme = i === 0 || i === Math.min(queue.length, 24) - 1;
    const lbl = money(p.price_aed_expected, "AED");
    row.append(el("div", "bar-val", extreme ? `<b>${esc(lbl)}</b>` : esc(lbl)));
    bindTip(row, `
      <div class="t-title">${esc(p.brand_name)} — ${esc(p.name)}</div>
      <div class="t-row"><span>US price</span><b>${esc(money(p.price_usd, "USD"))}</b></div>
      <div class="t-row"><span>At FX parity</span><b>${esc(money(p.price_aed_parity, "AED"))}</b></div>
      <div class="t-row"><span>+ ${p.aed_uplift_pct}% ${TIER_LABEL[p.brand_tier].toLowerCase()} uplift</span><b>${esc(money(p.price_aed_expected, "AED"))}</b></div>
      <div class="t-row"><span>Observed</span><b>not yet recorded</b></div>`);
    chart.append(row);
  });
  box.append(chart);
  if (queue.length > 24) box.append(el("p", "chart-foot", `Showing the 24 highest-value of ${queue.length} outstanding hero SKUs.`));
}

/* ---------- range coverage ---------- */
function renderMatrix() {
  const cats = D.categories;
  const counts = {};
  filtered().forEach((p) => {
    counts[p.brand] = counts[p.brand] || {};
    counts[p.brand][p.category] = (counts[p.brand][p.category] || 0) + 1;
  });
  const rows = D.brands
    .filter((b) => counts[b.id])
    .sort((a, b) => Object.keys(counts[b.id]).length - Object.keys(counts[a.id]).length || a.name.localeCompare(b.name));

  const t = el("table", "matrix");
  const hr = el("tr");
  hr.append(el("th", "brand", ""));
  cats.forEach((c) => hr.append(el("th", "rot", esc(c.label))));
  hr.append(el("th", "", "Cats"));
  const thead = el("thead"); thead.append(hr); t.append(thead);

  const tb = el("tbody");
  rows.forEach((b) => {
    const tr = el("tr");
    tr.append(el("th", "brand", esc(b.name)));
    cats.forEach((c) => {
      const n = counts[b.id][c.id] || 0;
      const td = el("td", n ? "on" : "");
      if (n) td.dataset.n = n;
      bindTip(td, `<div class="t-title">${esc(b.name)}</div><div class="t-row"><span>${esc(c.label)}</span><b>${n} SKU${n === 1 ? "" : "s"}</b></div>`, true);
      tr.append(td);
    });
    tr.append(el("td", "", `<span style="color:var(--ink-2);font-variant-numeric:tabular-nums">${Object.keys(counts[b.id]).length}</span>`));
    tb.append(tr);
  });
  t.append(tb);
  const box = $("#matrix"); box.innerHTML = "";
  box.append(rows.length ? t : el("div", "empty", "Nothing matches these filters."));
}

/* ---------- SKU table ---------- */
function renderSkuTable() {
  const rows = filtered().sort((a, b) => (b.norm_usd ?? 0) - (a.norm_usd ?? 0));
  const t = $("#sku-table");
  t.innerHTML = `<thead><tr>
    <th>Brand</th><th>Product</th><th>Category</th><th>Size</th>
    <th class="num">Home</th><th class="num">USD</th><th class="num">AED</th>
    <th class="num">Like for like</th><th class="num">Index</th><th>Confidence</th></tr></thead>`;
  const tb = el("tbody");
  rows.forEach((p) => {
    const tr = el("tr");
    tr.innerHTML = `
      <td data-l="Brand">${esc(p.brand_name)}</td>
      <td data-l="Product">${esc(p.name)}${p.off_basis ? '<div class="sub">other basis — excluded from the ladder</div>' : ""}</td>
      <td data-l="Category">${esc(p.category_label)}</td>
      <td class="num" data-l="Size">${esc(sizeLabel(p))}</td>
      <td class="num" data-l="Home">${esc(money(p.price_home, p.home_currency))}</td>
      <td class="num" data-l="USD">${esc(money(p.price_usd, "USD"))}</td>
      <td class="num" data-l="AED">${esc(money(p.price_aed_observed ?? p.price_aed_expected, "AED"))}${p.price_aed_observed == null ? ' <span style="color:var(--ink-3)">exp</span>' : ""}</td>
      <td class="num" data-l="Like for like">${esc(money(p.norm_usd, "USD"))}<div class="sub">${esc(p.basis_label)}</div></td>
      <td class="num" data-l="Index">${p.price_index ?? "—"}</td>
      <td data-l="Confidence"><span class="chip ${p.verified ? "ver" : "est"}">${p.verified ? "verified" : "estimate"}</span></td>`;
    tb.append(tr);
  });
  t.append(tb);
}

/* ---------- news ---------- */
function newsFiltered() {
  return D.news.filter((n) => {
    if (state.tag && !(n.tags || []).includes(state.tag)) return false;
    if (state.region && n.region !== state.region) return false;
    if (state.brand && n.brand !== state.brand) return false;
    if (state.q) {
      const hay = ((n.brand_name || "") + " " + n.title + " " + (n.source || "")).toLowerCase();
      if (!hay.includes(state.q.toLowerCase())) return false;
    }
    if (state.tier || state.role || state.own) {
      const b = D.brands.find((x) => x.id === n.brand);
      // Watchlist-only brands are independents by definition; they survive the
      // independent cut and fail the corporate one.
      if (!b) return state.own !== "corporate" && !state.tier && !state.role && !!n.brand;
      if (state.tier && b.tier !== state.tier) return false;
      if (state.role && b.role !== state.role) return false;
      if (state.own && b.ownership !== state.own) return false;
    }
    return true;
  });
}

function renderNews() {
  const items = newsFiltered();
  const box = $("#news-list"); box.innerHTML = "";
  if (!items.length) {
    box.append(el("div", "empty", "No headlines match. If it is empty everywhere, run <code>python3 scripts/collect_news.py</code> then rebuild."));
    return;
  }
  // Group by ISO week so the feed has a spine — "this week" is the question
  // people actually arrive with.
  let lastWeek = null;
  items.slice(0, 250).forEach((n) => {
    const wk = isoWeekOf(n.published);
    if (wk !== lastWeek) {
      lastWeek = wk;
      const count = items.filter((i) => isoWeekOf(i.published) === wk).length;
      const h = el("div", "week-head");
      h.innerHTML = `<span>${esc(weekLabel(wk))}</span><span class="wk-n">${count} headline${count === 1 ? "" : "s"}</span>`;
      box.append(h);
    }
    const s = el("div", "signal");
    s.append(el("time", null, esc(n.published || "undated")));
    const body = el("div");
    body.append(el("div", null, `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>`));
    body.append(el("div", "src", `${esc(n.source || "—")}${n.brand_name ? " · " + esc(n.brand_name) : ""}${n.region === "uae" ? " · UAE/GCC" : ""}`));
    if ((n.tags || []).length) {
      const chips = el("div", "chips");
      n.tags.forEach((t) => chips.append(el("span", "chip tag", esc(TAG_LABEL[t] || t))));
      body.append(chips);
    }
    s.append(body); box.append(s);
  });
  if (items.length > 250) box.append(el("p", "chart-foot", `Showing the 250 most recent of ${items.length} matching headlines — narrow with the filters above.`));
}

/* ---------- PR & initiatives ---------- */
function simpleBars(target, entries, unitLabel) {
  const box = $(target); box.innerHTML = "";
  if (!entries.length) {
    box.append(el("div", "empty", "No signals collected yet. Run <code>python3 scripts/collect_news.py</code> then <code>python3 scripts/build.py</code>."));
    return;
  }
  const max = entries[0][1];
  entries.forEach(([label, n], i) => {
    const row = el("div", "bar-row");
    row.append(el("div", "bar-name", esc(label)));
    const track = el("div", "track");
    const fill = el("div", "fill");
    fill.style.width = (n / max * 100) + "%";
    fill.style.background = "var(--accent)";
    track.append(fill); row.append(track);
    const extreme = i === 0 || i === entries.length - 1;
    row.append(el("div", "bar-val", extreme ? `<b>${n}</b>` : String(n)));
    bindTip(row, `<div class="t-title">${esc(label)}</div><div class="t-row"><span>${esc(unitLabel)}</span><b>${n}</b></div>`);
    box.append(row);
  });
}

function renderPr() {
  const items = newsFiltered();
  $("#pr-count").textContent = `${items.length} headlines`;

  const tagCounts = {};
  items.forEach((n) => (n.tags || []).forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
  simpleBars("#tagchart", Object.entries(tagCounts).map(([k, v]) => [TAG_LABEL[k] || k, v]).sort((a, b) => b[1] - a[1]), "headlines");

  const sov = {};
  items.forEach((n) => { if (n.brand_name) sov[n.brand_name] = (sov[n.brand_name] || 0) + 1; });
  simpleBars("#sovchart", Object.entries(sov).sort((a, b) => b[1] - a[1]).slice(0, 14), "headlines");

  // brand x initiative matrix
  const grid = {};
  items.forEach((n) => {
    if (!n.brand) return;
    grid[n.brand] = grid[n.brand] || {};
    (n.tags || []).forEach((t) => (grid[n.brand][t] = (grid[n.brand][t] || 0) + 1));
  });
  const brands = Object.keys(grid)
    .map((id) => D.brands.find((b) => b.id === id))
    .filter(Boolean)
    .sort((a, b) => Object.keys(grid[b.id]).length - Object.keys(grid[a.id]).length || a.name.localeCompare(b.name));

  const box = $("#pr-matrix"); box.innerHTML = "";
  if (!brands.length) { box.append(el("div", "empty", "No tagged headlines in this filter.")); return; }

  const t = el("table", "matrix");
  const hr = el("tr");
  hr.append(el("th", "brand", ""));
  TAG_KEYS.forEach((k) => hr.append(el("th", "rot", esc(TAG_LABEL[k]))));
  const thead = el("thead"); thead.append(hr); t.append(thead);
  const tb = el("tbody");
  brands.forEach((b) => {
    const tr = el("tr");
    tr.append(el("th", "brand", esc(b.name)));
    TAG_KEYS.forEach((k) => {
      const n = grid[b.id][k] || 0;
      const td = el("td", n ? "on" : "");
      if (n) {
        td.dataset.n = n;
        td.style.cursor = "pointer";
        td.setAttribute("role", "button");
        const openEvidence = () => {
          state.brand = b.id; state.tag = k;
          $("#f-brand").value = b.id; $("#f-tag").value = k;
          setTab("news"); scrollTo({ top: 0, behavior: "smooth" });
        };
        td.addEventListener("click", openEvidence);
        td.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEvidence(); }
        });
      }
      bindTip(td, `<div class="t-title">${esc(b.name)}</div><div class="t-row"><span>${esc(TAG_LABEL[k])}</span><b>${n} headline${n === 1 ? "" : "s"}</b></div>${n ? '<div class="t-row"><span></span><b>click to read them</b></div>' : ""}`, true);
      tr.append(td);
    });
    tb.append(tr);
  });
  t.append(tb);
  box.append(t);
}


/* ---------- week helpers ---------- */
function isoWeekOf(dstr) {
  if (!dstr) return "undated";
  const d = new Date(dstr + "T00:00:00Z");
  if (isNaN(d)) return "undated";
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - yStart) / 864e5 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}
function weekLabel(wk) {
  if (wk === "undated") return "Undated";
  const thisWeek = isoWeekOf(new Date().toISOString().slice(0, 10));
  if (wk === thisWeek) return "This week";
  const [y, w] = wk.split("-W");
  const jan4 = new Date(Date.UTC(+y, 0, 4));
  const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (+w - 1) * 7);
  return `Week of ${mon.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

/* ---------- coverage over time + share momentum ---------- */
function renderWeekly() {
  const wk = D.weekly || [];
  const box = $("#weekly"); box.innerHTML = "";
  if (!wk.length) { box.append(el("div", "empty", "No dated headlines yet.")); return; }
  $("#weekly-span").textContent = `${wk.length} weeks`;
  const max = Math.max(...wk.map((w) => w.count));
  wk.forEach((w, i) => {
    const row = el("div", "bar-row");
    row.append(el("div", "bar-name", esc(weekLabel(w.week))));
    const track = el("div", "track");
    const fill = el("div", "fill");
    fill.style.width = (w.count / max * 100) + "%";
    fill.style.background = "var(--accent)";
    track.append(fill); row.append(track);
    const extreme = i === wk.length - 1 || w.count === max;
    row.append(el("div", "bar-val", extreme ? `<b>${w.count}</b>` : String(w.count)));
    bindTip(row, `<div class="t-title">${esc(weekLabel(w.week))}</div><div class="t-row"><span>Headlines</span><b>${w.count}</b></div>`);
    box.append(row);
  });
}

function renderMomentum() {
  const rows = D.momentum || [];
  const box = $("#momentum"); box.innerHTML = "";
  const gaining = rows.filter((m) => m.basis === "gaining_share");
  const fresh = rows.filter((m) => m.basis === "newly_covered");

  if (!gaining.length && !fresh.length) {
    box.append(el("div", "empty", "Not enough archive yet. Momentum needs two comparable 30-day windows — it fills in as the daily collector runs."));
    return;
  }

  if (gaining.length) {
    box.append(el("h3", null, "Gaining or losing share — brands with a real prior baseline"));
    const max = Math.max(...gaining.map((m) => Math.max(m.share_recent, m.share_prior)));
    gaining.slice(0, 14).forEach((m) => {
      const row = el("div", "bar-row");
      row.append(el("div", "bar-name", `<b class="brand-link" data-brand="${esc(m.id)}">${esc(m.name)}</b>`));
      const track = el("div", "track");
      track.style.flexDirection = "column";
      track.style.gap = "3px";
      const b1 = el("div", "fill"); b1.style.height = "6px";
      b1.style.width = (m.share_prior / max * 100) + "%"; b1.style.background = "var(--rule-strong)";
      const b2 = el("div", "fill"); b2.style.height = "6px";
      b2.style.width = (m.share_recent / max * 100) + "%";
      b2.style.background = m.ratio >= 1 ? "var(--accent)" : "var(--div-low)";
      track.append(b1, b2); row.append(track);
      row.append(el("div", "bar-val", `<b>${m.ratio}×</b>`));
      bindTip(row, `
        <div class="t-title">${esc(m.name)}</div>
        <div class="t-row"><span>Share, prior 30 days</span><b>${m.share_prior}%</b></div>
        <div class="t-row"><span>Share, last 30 days</span><b>${m.share_recent}%</b></div>
        <div class="t-row"><span>Articles</span><b>${m.prior} → ${m.recent}</b></div>`);
      box.append(row);
    });
    box.append(el("p", "chart-foot", "Upper bar is the prior 30 days, lower bar the last 30. A ratio above 1 means the brand took a larger slice of a fixed pie."));
  }

  if (fresh.length) {
    const names = fresh.slice(0, 12).map((m) => `${esc(m.name)} (${m.recent})`).join(", ");
    const s = el("div");
    s.style.marginTop = "28px";
    s.append(el("h3", null, `Newly appearing — ${fresh.length} brands`));
    s.append(el("p", "only-in",
      `${names}${fresh.length > 12 ? ", and others" : ""}. These had no meaningful coverage in the prior window. ` +
      `With a young archive that may mean genuinely new activity, or simply that the earlier search did not surface them — ` +
      `treat as a prompt to look, not as a finding.`));
    box.append(s);
  }
}


/* ---------- press tone (NOT consumer sentiment — see the card copy) ---------- */
function renderTone() {
  const rows = (D.tone || []).filter((t) => {
    const b = D.brands.find((x) => x.id === t.id) || {};
    return (!state.q || t.name.toLowerCase().includes(state.q.toLowerCase())) &&
      (!state.tier || b.tier === state.tier) &&
      (!state.role || b.role === state.role) &&
      (!state.own || b.ownership === state.own);
  });
  const box = $("#tone"); box.innerHTML = "";
  if (!rows.length) { box.append(el("div", "empty", "No brand has enough headlines to read a tone yet.")); return; }

  const reliable = rows.filter((r) => r.reliable);
  const thin = rows.filter((r) => !r.reliable);

  const draw = (list, heading, muted) => {
    if (!list.length) return;
    box.append(el("h3", null, heading));
    list.forEach((t) => {
      const row = el("div", "bar-row");
      if (muted) row.style.opacity = ".55";
      row.append(el("div", "bar-name", `<b class="brand-link" data-brand="${esc(t.id)}">${esc(t.name)}</b>`));
      // A stacked share bar — the mix is the story, not the single score.
      const track = el("div", "track");
      const stack = el("div");
      stack.style.cssText = "display:flex;width:100%;gap:2px;height:9px";
      [["positive", "var(--good)"], ["neutral", "var(--rule-strong)"], ["negative", "var(--critical)"]]
        .forEach(([k, col]) => {
          if (!t[k]) return;
          const seg = el("div");
          seg.style.cssText = `width:${t[k] / t.total * 100}%;background:${col}`;
          stack.append(seg);
        });
      track.append(stack); row.append(track);
      row.append(el("div", "bar-val",
        `<b>${t.score > 0 ? "+" : ""}${t.score}</b> <span style="color:var(--ink-3);font-size:11px">${t.positive}/${t.neutral}/${t.negative}</span>`));
      bindTip(row, `
        <div class="t-title">${esc(t.name)} — press tone</div>
        <div class="t-row"><span>Positive</span><b>${t.positive}</b></div>
        <div class="t-row"><span>Neutral</span><b>${t.neutral}</b></div>
        <div class="t-row"><span>Negative</span><b>${t.negative}</b></div>
        <div class="t-row"><span>Headlines read</span><b>${t.total}</b></div>
        ${t.reliable ? "" : '<div class="t-row"><span>Sample</span><b>too thin to trust</b></div>'}`);
      box.append(row);
    });
  };

  draw(reliable, `Readable — 8 or more headlines (${reliable.length} brands)`, false);
  draw(thin, `Too thin to read — under 8 headlines (${thin.length} brands)`, true);
  box.append(el("p", "chart-foot",
    "Green positive, grey neutral, red negative. Most coverage is neutral, which is what you would expect from trade press — a brand with visible red is the one to open."));
}

/* ---------- radar ---------- */
function renderRadar() {
  const box = $("#radar"); box.innerHTML = "";
  const list = [...D.watchlist]
    .filter((w) => !state.q ||
      (w.name + " " + (w.why || "") + " " + (w.categories || []).join(" ")).toLowerCase().includes(state.q.toLowerCase()))
    .sort((a, b) => b.momentum - a.momentum);
  if (!list.length) { box.append(el("div", "empty", "Nothing on the radar matches that search.")); return; }
  list.forEach((w) => {
    const c = el("div", "radar-card");
    c.append(el("h3", null, `${esc(w.name)} <span class="chip"><i class="dot" style="background:var(${THREAT_VAR[w.threat] || "--good"})"></i>${esc(w.threat)} threat</span>`));
    c.append(el("div", "place", `${esc(w.country)}${w.founded ? " · founded " + w.founded : ""} · ${esc((w.categories || []).join(", ").replace(/_/g, " "))}${w.needs_review ? " · needs review" : ""}`));
    const meter = el("div", "meter");
    for (let i = 1; i <= 5; i++) {
      const pip = el("i");
      if (i <= w.momentum) pip.style.background = "var(--accent)";
      meter.append(pip);
    }
    meter.append(el("span", "lbl", `momentum ${w.momentum} of 5`));
    c.append(meter);
    c.append(el("p", null, esc(w.why)));
    if ((w.signals || []).length) {
      const ul = el("ul");
      w.signals.forEach((s) => ul.append(el("li", null, esc(s))));
      c.append(ul);
    }
    if (w.watch) c.append(el("div", "watch-line", esc(w.watch)));
    box.append(c);
  });
}


/* ---------- challenger comms — the emerging set's PR/campaign/activation feed ---------- */
function renderChallengerFeed() {
  const box = $("#challenger-feed"); box.innerHTML = "";
  const challengerIds = new Set(D.brands.filter((b) => b.challenger).map((b) => b.id));
  D.watchlist.forEach((w) => challengerIds.add(w.id));
  const nameOf = (id) =>
    (D.brands.find((b) => b.id === id) || D.watchlist.find((w) => w.id === id) || {}).name || id;

  const items = D.news.filter((n) => n.brand && challengerIds.has(n.brand) &&
    (!state.q || (n.title + " " + (n.brand_name || "")).toLowerCase().includes(state.q.toLowerCase())));
  $("#challenger-count").textContent = `${items.length} headlines`;
  if (!items.length) {
    box.append(el("div", "empty", "No challenger coverage collected yet — it accrues as the daily collector runs."));
    return;
  }

  // Group by brand, order groups by their freshest headline.
  const byBrand = {};
  items.forEach((n) => (byBrand[n.brand] = byBrand[n.brand] || []).push(n));
  const groups = Object.entries(byBrand)
    .sort((a, b) => (b[1][0].published || "").localeCompare(a[1][0].published || ""));

  groups.forEach(([bid, list]) => {
    const isTracked = D.brands.some((b) => b.id === bid);
    const head = el("div", "week-head");
    head.innerHTML = `<span>${isTracked
        ? `<span class="brand-link" data-brand="${esc(bid)}" style="letter-spacing:inherit">${esc(nameOf(bid))}</span>`
        : esc(nameOf(bid)) + ' <span style="color:var(--ink-3);letter-spacing:.08em">· watchlist</span>'}</span>
      <span class="wk-n">${list.length} headline${list.length === 1 ? "" : "s"}</span>`;
    box.append(head);
    list.slice(0, 5).forEach((n) => {
      const sg = el("div", "signal");
      sg.append(el("time", null, esc(n.published || "undated")));
      const body = el("div");
      body.append(el("div", null, `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>`));
      body.append(el("div", "src", `${esc(n.source || "—")}${n.region === "uae" ? " · UAE/GCC" : ""}`));
      if ((n.tags || []).length) {
        const chips = el("div", "chips");
        n.tags.forEach((t) => chips.append(el("span", "chip tag", esc(TAG_LABEL[t] || t))));
        body.append(chips);
      }
      sg.append(body); box.append(sg);
    });
  });
}

/* ---------- brand directory ---------- */
const BRAND_COLS = [
  { k: "name", t: "Brand" }, { k: "tier", t: "Tier" }, { k: "role", t: "Role" },
  { k: "country", t: "Home" }, { k: "owner", t: "Owner" },
  { k: "uae_status", t: "UAE" }, { k: "sku_count", t: "SKUs", num: true },
  { k: "categories_n", t: "Cats", num: true },
  { k: "avg_price_index", t: "Avg index", num: true },
  { k: "news_count", t: "Signals", num: true },
];
function renderBrands() {
  const rows = D.brands
    .filter((b) => (!state.tier || b.tier === state.tier) && (!state.role || b.role === state.role) &&
      (!state.own || b.ownership === state.own) &&
      (!state.q || (b.name + " " + b.owner + " " + b.positioning).toLowerCase().includes(state.q.toLowerCase())))
    .map((b) => ({ ...b, uae_status: b.uae.status, categories_n: (b.categories_tracked || []).length }))
    .sort((a, b) => {
      const { key, dir } = state.sort;
      const x = a[key], y = b[key];
      if (x == null) return 1; if (y == null) return -1;
      return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });

  const t = $("#brand-table"); t.innerHTML = "";
  const tr = el("tr");
  BRAND_COLS.forEach((c) => {
    const th = el("th", c.num ? "num" : "", esc(c.t) + (state.sort.key === c.k ? (state.sort.dir === 1 ? " ↑" : " ↓") : ""));
    th.onclick = () => {
      state.sort = { key: c.k, dir: state.sort.key === c.k ? -state.sort.dir : (c.num ? -1 : 1) };
      renderBrands();
    };
    tr.append(th);
  });
  const thead = el("thead"); thead.append(tr); t.append(thead);

  const tb = el("tbody");
  rows.forEach((b) => {
    const row = el("tr");
    row.innerHTML = `
      <td data-l="Brand"><b class="brand-link" data-brand="${esc(b.id)}">${esc(b.name)}</b>${b.needs_review ? ' <span class="chip est">review</span>' : ""}<div class="sub">${esc(b.positioning)}</div></td>
      <td><span class="chip"><i class="swatch" style="width:12px;height:3px;background:var(${TIER_VAR[b.tier]})"></i>${esc(TIER_LABEL[b.tier])}</span></td>
      <td data-l="Role">${esc(b.role.replace(/_/g, " "))}</td>
      <td data-l="Home">${esc(b.country)}</td>
      <td data-l="Owner">${esc(b.owner)}</td>
      <td>${esc(b.uae.status.replace(/_/g, " "))}${(b.uae.channels || []).length ? `<div class="sub">${esc(b.uae.channels.join(", "))}</div>` : ""}</td>
      <td class="num" data-l="SKUs">${b.sku_count}</td>
      <td class="num" data-l="Cats">${b.categories_n}</td>
      <td class="num" data-l="Avg index">${b.avg_price_index ?? "—"}</td>
      <td class="num" data-l="Signals">${b.news_count}</td>`;
    tb.append(row);
  });
  t.append(tb);
}

/* ===========================================================================
   Overview — computed findings
   =========================================================================== */
function applyFocus(f) {
  const focus = f.focus || {};
  if (focus.cat != null) { state.cat = focus.cat; $("#f-cat").value = focus.cat; }
  if (focus.tier != null) { state.tier = focus.tier; $("#f-tier").value = focus.tier; }
  if (focus.tag != null) { state.tag = focus.tag; $("#f-tag").value = focus.tag; }
  if (focus.brand != null) { state.brand = focus.brand; $("#f-brand").value = focus.brand; }
  if (focus.view != null) {
    state.view = focus.view;
    document.querySelectorAll("[data-view]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.view === state.view)));
  }
  setTab(f.tab || "pricing");
  scrollTo({ top: 0, behavior: "smooth" });
}

function renderOverview() {
  const all = D.findings || [];
  const hero = all[0];
  const box = $("#hero-finding"); box.innerHTML = "";
  if (hero) {
    const h = el("div", "hero-finding");
    h.innerHTML = `
      <div class="kicker"><span>Headline finding</span><span style="color:var(--ink-3)">${esc(KIND_LABEL[hero.kind] || hero.kind)}</span></div>
      <div class="metric">${esc(hero.metric)}</div>
      <h2>${esc(hero.headline)}</h2>
      <p>${esc(hero.detail)}</p>`;
    box.append(h);
  }

  const grid = $("#findings"); grid.innerHTML = "";
  all.slice(1).forEach((f) => {
    const card = el("button", "finding");
    card.type = "button";
    card.innerHTML = `
      <div class="f-top">
        <span class="f-rank">${String(f.rank).padStart(2, "0")}</span>
        <span class="f-rank">${esc(KIND_LABEL[f.kind] || f.kind)}</span>
        <span class="f-metric">${esc(f.metric)}</span>
      </div>
      <p class="f-head">${esc(f.headline)}</p>
      <p class="f-detail">${esc(f.detail)}</p>
      <span class="f-cta">See the evidence →</span>`;
    card.addEventListener("click", () => applyFocus(f));
    grid.append(card);
  });
  if (!all.length) grid.append(el("div", "empty", "No findings — the analysis layer needs priced SKUs. Run <code>python3 scripts/build.py</code>."));
}

/* ===========================================================================
   Positioning map
   =========================================================================== */
function renderMap() {
  const rows = (D.positioning || []).filter((r) =>
    (!state.tier || r.tier === state.tier) &&
    (!state.role || r.role === state.role) &&
    (!state.own || r.ownership === state.own) &&
    (!state.q || r.name.toLowerCase().includes(state.q.toLowerCase())));
  $("#map-count").textContent = `${rows.length} brands`;

  const box = $("#map"); box.innerHTML = "";
  if (!rows.length) { box.append(el("div", "empty", "Nothing matches these filters.")); return; }

  const W = 980, H = 560, M = { t: 26, r: 30, b: 62, l: 70 };
  const maxB = Math.max(...rows.map((r) => r.breadth), 4);
  const maxI = Math.max(...rows.map((r) => r.index));
  const maxSk = Math.max(...rows.map((r) => r.skus));
  // Index is heavily right-skewed (La Mer at 464 vs most brands near 100), so the
  // vertical scale is sqrt — it keeps the crowded middle readable without a log's
  // false precision at the bottom.
  const x = (b) => M.l + (b - 1) / Math.max(1, maxB - 1) * (W - M.l - M.r);
  const y = (i) => H - M.b - (Math.sqrt(i) / Math.sqrt(maxI)) * (H - M.t - M.b);
  const r = (s) => 5 + Math.sqrt(s / maxSk) * 12;

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Brand positioning: range breadth against average price index");
  const add = (tag, attrs, cls) => {
    const n = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    if (cls) n.setAttribute("class", cls);
    svg.append(n);
    return n;
  };

  // gridlines + ticks
  [100, 150, 200, 300, 450].filter((v) => v <= maxI * 1.05).forEach((v) => {
    add("line", { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v) }, v === 100 ? "map-median" : "map-grid-line");
    const t = add("text", { x: M.l - 12, y: y(v) + 4, "text-anchor": "end" }, "map-tick");
    t.textContent = v === 100 ? "100 median" : v;
  });
  for (let b = 1; b <= maxB; b++) {
    const t = add("text", { x: x(b), y: H - M.b + 22, "text-anchor": "middle" }, "map-tick");
    t.textContent = b;
  }
  add("line", { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b }, "map-axis-line");
  add("line", { x1: M.l, x2: M.l, y1: M.t, y2: H - M.b }, "map-axis-line");

  let lab = add("text", { x: (M.l + W - M.r) / 2, y: H - 14, "text-anchor": "middle" }, "map-axis-label");
  lab.textContent = "Categories sold into  →";
  lab = add("text", { x: 18, y: (M.t + H - M.b) / 2, "text-anchor": "middle",
                      transform: `rotate(-90 18 ${(M.t + H - M.b) / 2})` }, "map-axis-label");
  lab.textContent = "Price index  →";

  const q1 = add("text", { x: W - M.r - 6, y: M.t + 12, "text-anchor": "end" }, "map-quad");
  q1.textContent = "Full-range, premium-priced";
  const q2 = add("text", { x: M.l + 6, y: H - M.b - 8 }, "map-quad");
  q2.textContent = "Single-category, value-priced";

  // draw large dots first so small ones stay clickable on top
  [...rows].sort((a, b) => b.skus - a.skus).forEach((d) => {
    const dot = add("circle", { cx: x(d.breadth), cy: y(d.index), r: r(d.skus),
      fill: `var(${TIER_VAR[d.tier]})`, "fill-opacity": .82 }, "map-dot");
    dot.style.cursor = "pointer";
    bindTip(dot, `
      <div class="t-title">${esc(d.name)}</div>
      <div class="t-row"><span>Price index</span><b>${d.index}</b></div>
      <div class="t-row"><span>Categories</span><b>${d.breadth}</b></div>
      <div class="t-row"><span>SKUs tracked</span><b>${d.skus}</b></div>
      <div class="t-row"><span>UAE</span><b>${esc(d.uae.replace(/_/g, " "))}</b></div>
      <div class="t-row"><span>Signals</span><b>${d.news}</b></div>`, true);
    dot.setAttribute("role", "button");
    dot.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBrand(d.id); } });
    dot.addEventListener("click", () => openBrand(d.id));
  });

  // Label only the brands worth naming, and only where the label fits. Candidates
  // are tried in order of how notable they are; anything that would collide with
  // an already-placed label is dropped rather than allowed to overlap.
  const placed = [];
  const fits = (box) => !placed.some((p) =>
    box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y);

  [...rows]
    .sort((a, b) => (b.breadth * 30 + b.index) - (a.breadth * 30 + a.index))
    .slice(0, 26)
    .forEach((d) => {
      const label = d.name.length > 20 ? d.name.slice(0, 19) + "…" : d.name;
      const w = label.length * 5.6, h = 13;
      const cx = x(d.breadth), cy = y(d.index), rad = r(d.skus);
      // try right of the dot, then left, then above
      const spots = [
        { x: cx + rad + 6, y: cy - h / 2, anchor: "start", ty: cy + 4 },
        { x: cx - rad - 6 - w, y: cy - h / 2, anchor: "end", ty: cy + 4 },
        { x: cx - w / 2, y: cy - rad - 6 - h, anchor: "middle", ty: cy - rad - 8 },
      ];
      const spot = spots.find((s) =>
        s.x > M.l - 40 && s.x + w < W + 30 && s.y > 0 && fits({ ...s, w, h }));
      if (!spot) return;
      placed.push({ x: spot.x, y: spot.y, w, h });
      const t = add("text", { x: spot.anchor === "start" ? spot.x : spot.anchor === "end" ? spot.x + w : cx,
                              y: spot.ty, "text-anchor": spot.anchor }, "map-label");
      t.textContent = label;
    });

  box.append(svg);
}

/* ===========================================================================
   Brand profile drawer
   =========================================================================== */
let lastFocused = null;

function openBrand(id) {
  const b = D.brands.find((x) => x.id === id);
  if (!b) return;
  lastFocused = document.activeElement;
  const own = D.products.filter((p) => p.brand === id);
  const news = D.news.filter((n) => n.brand === id);
  const pos = (D.positioning || []).find((p) => p.id === id);

  $("#drawer-eyebrow").textContent =
    `${TIER_LABEL[b.tier]} · ${b.role.replace(/_/g, " ")} · ${OWN_LABEL[b.ownership] || b.ownership} · ${b.country}`;
  $("#drawer-title").textContent = b.name;

  const body = $("#drawer-body");
  body.innerHTML = "";

  const s1 = el("section");
  s1.innerHTML = `
    <div class="stat-row">
      <div><div class="v">${pos ? pos.index : "—"}</div><div class="k">Price index</div></div>
      <div><div class="v">${own.length}</div><div class="k">SKUs</div></div>
      <div><div class="v">${new Set(own.map((p) => p.category)).size}</div><div class="k">Categories</div></div>
      <div><div class="v">${news.length}</div><div class="k">Signals</div></div>
    </div>
    <p style="color:var(--ink-2);font-size:13.5px;line-height:1.65;margin:16px 0 0">${esc(b.positioning)}</p>`;
  body.append(s1);

  const s2 = el("section");
  s2.append(el("h3", null, "Identity"));
  s2.insertAdjacentHTML("beforeend", `
    <dl class="kv">
      <dt>Owner</dt><dd>${esc(b.owner)}</dd>
      <dt>Founded</dt><dd>${b.founded || "—"}</dd>
      <dt>Home market</dt><dd>${esc(b.country)} · prices in ${esc(b.currency)}</dd>
      <dt>UAE</dt><dd>${esc(b.uae.status.replace(/_/g, " "))}${(b.uae.channels || []).length ? "<br><span style='color:var(--ink-3)'>" + esc(b.uae.channels.join(", ")) + "</span>" : ""}</dd>
      <dt>Sells</dt><dd>${esc((b.categories || []).join(", ").replace(/_/g, " "))}</dd>
      ${b.site ? `<dt>Site</dt><dd><a href="${esc(b.site)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(b.site.replace(/^https?:\/\//, ""))}</a></dd>` : ""}
      ${b.needs_review ? `<dt>Caveat</dt><dd style="color:var(--ink-3)">Metadata seeded from model knowledge — confirm before citing.</dd>` : ""}
    </dl>`);
  body.append(s2);

  if (own.length) {
    const byCat = {};
    own.forEach((p) => { (byCat[p.category_label] = byCat[p.category_label] || []).push(p); });
    const s3 = el("section");
    s3.append(el("h3", null, `Range & pricing — ${own.length} SKUs`));
    Object.entries(byCat).forEach(([label, items]) => {
      s3.append(el("div", null, `<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin:16px 0 4px">${esc(label)}</div>`));
      items.sort((a, b2) => (b2.norm_usd ?? 0) - (a.norm_usd ?? 0)).forEach((p) => {
        const line = el("div", "sku-line");
        line.innerHTML = `
          <span class="nm">${esc(p.name)}</span>
          <span class="sz">${esc(sizeLabel(p))}</span>
          <span class="px">${esc(money(p.price_usd, "USD"))}</span>
          <span class="ix">${p.price_index != null ? p.price_index : "—"}</span>`;
        bindTip(line, productTip(p));
        s3.append(line);
      });
    });
    s3.insertAdjacentHTML("beforeend",
      `<p style="font-size:11.5px;color:var(--ink-3);margin-top:14px">Right-hand figure is the price index against that category's median (100 = median).</p>`);
    body.append(s3);
  }

  if (news.length) {
    // What the brand is actually DOING, grouped by initiative, each one a link.
    const byTag = {};
    news.forEach((n) => (n.tags || []).forEach((t) => (byTag[t] = byTag[t] || []).push(n)));
    const tagKeys = Object.keys(byTag).sort((a, b) => byTag[b].length - byTag[a].length);
    if (tagKeys.length) {
      const sp = el("section");
      sp.append(el("h3", null, "PR moments & initiatives"));
      tagKeys.forEach((t) => {
        sp.append(el("div", null,
          `<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin:16px 0 4px">${esc(TAG_LABEL[t] || t)} · ${byTag[t].length}</div>`));
        byTag[t].slice(0, 4).forEach((n) => {
          const line = el("div", "sku-line");
          line.innerHTML =
            `<span class="nm"><a href="${esc(n.url)}" target="_blank" rel="noopener" style="color:var(--ink);text-decoration:none">${esc(n.title)}</a></span>` +
            `<span class="sz">${esc(n.source || "")}</span>`;
          sp.append(line);
        });
      });
      body.append(sp);
    }

    const tone = (D.tone || []).find((t) => t.id === id);
    if (tone) {
      const st = el("section");
      st.append(el("h3", null, "Press tone"));
      st.insertAdjacentHTML("beforeend",
        `<p style="font-size:12.5px;color:var(--ink-2);line-height:1.6;margin:0">` +
        `${tone.positive} positive, ${tone.neutral} neutral, ${tone.negative} negative across ${tone.total} headlines ` +
        `(score ${tone.score > 0 ? "+" : ""}${tone.score}).` +
        `${tone.reliable ? "" : " <b>Sample too thin to rely on.</b>"}` +
        ` Headline wording only — not what customers think.</p>`);
      body.append(st);
    }

    const s4 = el("section");
    s4.append(el("h3", null, `All coverage — ${news.length}`));
    news.slice(0, 10).forEach((n) => {
      const line = el("div", "sku-line");
      line.innerHTML = `<span class="nm"><a href="${esc(n.url)}" target="_blank" rel="noopener" style="color:var(--ink);text-decoration:none">${esc(n.title)}</a></span><span class="sz">${esc(n.published || "")}</span>`;
      s4.append(line);
    });
    if (news.length > 10) {
      const more = el("button", "f-cta");
      more.type = "button";
      more.style.cssText = "background:none;border:0;padding:12px 0 0;cursor:pointer;font:inherit;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)";
      more.textContent = `All ${news.length} headlines →`;
      more.addEventListener("click", () => {
        closeDrawer();
        state.brand = id; $("#f-brand").value = id;
        setTab("news"); scrollTo({ top: 0, behavior: "smooth" });
      });
      s4.append(more);
    }
    body.append(s4);
  }

  const act = el("section");
  act.style.marginTop = "8px";
  const cmpBtn = el("button", "btn-ghost");
  cmpBtn.type = "button";
  cmpBtn.textContent = "Compare this brand →";
  cmpBtn.addEventListener("click", () => {
    if (!state.cmp.includes(id)) {
      const slot = state.cmp.findIndex((x) => !x);
      state.cmp[slot === -1 ? 1 : slot] = id;
    }
    closeDrawer();
    setTab("compare");
    scrollTo({ top: 0, behavior: "smooth" });
  });
  act.append(cmpBtn);
  body.append(act);

  $("#drawer").classList.add("open");
  $("#scrim").classList.add("open");
  document.body.style.overflow = "hidden";
  $("#drawer").focus();
}

function closeDrawer() {
  $("#drawer").classList.remove("open");
  $("#scrim").classList.remove("open");
  document.body.style.overflow = "";
  hideTip();
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

/* ===========================================================================
   Head to head
   =========================================================================== */
function renderCompare() {
  const picks = $("#cmp-pickers");
  const options = [...D.brands].filter((b) => b.sku_count > 0).sort((a, b) => a.name.localeCompare(b.name));
  picks.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const sel = el("select");
    sel.setAttribute("aria-label", `Brand ${i + 1}`);
    sel.innerHTML = `<option value="">${i < 2 ? "Choose a brand…" : "Add a third (optional)…"}</option>` +
      options.map((b) => {
        const taken = state.cmp.includes(b.id) && state.cmp[i] !== b.id;
        return `<option value="${b.id}"${state.cmp[i] === b.id ? " selected" : ""}${taken ? " disabled" : ""}>${esc(b.name)}</option>`;
      }).join("");
    sel.addEventListener("change", (e) => {
      state.cmp[i] = e.target.value || null;
      syncUrl(); renderCompare();
    });
    picks.append(sel);
  }

  const chosen = [...new Set(state.cmp.filter(Boolean))].map((id) => D.brands.find((b) => b.id === id)).filter(Boolean);
  const out = $("#cmp-out"); out.innerHTML = "";
  if (chosen.length < 2) {
    out.append(el("div", "empty", "Choose at least two brands. <b>Aesop vs Grown Alchemist</b> and <b>Diptyque vs Trudon</b> are the two sharpest fights in this dataset."));
    return;
  }

  const cols = chosen.length;
  const head = el("div", "cmp-head");
  head.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  chosen.forEach((b) => {
    const pos = (D.positioning || []).find((p) => p.id === b.id);
    const c = el("div", "cmp-card");
    c.innerHTML = `
      <h3 class="brand-link" data-brand="${esc(b.id)}">${esc(b.name)}</h3>
      <div class="meta">${TIER_LABEL[b.tier]} · ${esc(b.country)} · ${esc(b.owner)}</div>
      <div class="figs">
        <div><div class="v">${pos ? pos.index : "—"}</div><div class="k">Index</div></div>
        <div><div class="v">${b.sku_count}</div><div class="k">SKUs</div></div>
        <div><div class="v">${(b.categories_tracked || []).length}</div><div class="k">Cats</div></div>
        <div><div class="v">${b.news_count}</div><div class="k">Signals</div></div>
      </div>`;
    head.append(c);
  });
  out.append(head);

  // Where they actually clash: categories more than one of them competes in.
  const catsOf = (b) => new Set(D.products.filter((p) => p.brand === b.id && !p.off_basis).map((p) => p.category));
  const sets = chosen.map(catsOf);
  const shared = D.categories.filter((c) => sets.filter((s) => s.has(c.id)).length >= 2);

  if (shared.length) {
    const sec = el("div");
    sec.append(el("h3", null, `Where they compete — ${shared.length} categories`));
    shared.forEach((cat) => {
      // cheapest SKU per brand: compares each on its best foot forward
      const entries = chosen.map((b) => {
        const own = D.products.filter((p) => p.brand === b.id && p.category === cat.id && p.norm_usd && !p.off_basis);
        if (!own.length) return null;
        // Hero SKU if flagged, else cheapest — a bulk refill must not stand in
        // for the product the brand actually leads with.
        const best = [...own].sort((a, x) => (x.hero ? 1 : 0) - (a.hero ? 1 : 0) || a.norm_usd - x.norm_usd)[0];
        return { brand: b, p: best };
      }).filter(Boolean);
      if (entries.length < 2) return;

      const block = el("div", "clash");
      block.append(el("div", "clash-cat", `${esc(cat.label)} · ${esc(cat.basis_label)}`));
      const max = Math.max(...entries.map((e) => e.p.norm_usd));
      entries.sort((a, b) => b.p.norm_usd - a.p.norm_usd).forEach((e) => {
        const row = el("div", "clash-row");
        row.style.gridTemplateColumns = "minmax(96px,168px) 1fr auto";
        row.append(el("div", "clash-name", esc(e.brand.name)));
        const track = el("div");
        const bar = el("div", "clash-bar");
        bar.style.width = (e.p.norm_usd / max * 100) + "%";
        bar.style.background = `var(${TIER_VAR[e.brand.tier]})`;
        track.append(bar);
        row.append(track);
        row.append(el("div", "clash-val", `${money(e.p.norm_usd, "USD")}`));
        bindTip(row, productTip(e.p));
        block.append(row);
      });

      const hi = entries[0], lo = entries[entries.length - 1];
      const mult = hi.p.norm_usd / lo.p.norm_usd;
      block.append(el("div", "clash-verdict",
        `<b>${esc(hi.brand.name)}</b> is <b>${mult.toFixed(1)}×</b> ${esc(lo.brand.name)} here — ` +
        `${esc(hi.p.name)} at ${esc(sizeLabel(hi.p))} against ${esc(lo.p.name)} at ${esc(sizeLabel(lo.p))}.`));
      sec.append(block);
    });
    out.append(sec);
  }

  // Range each one is missing relative to the others.
  const gaps = el("div");
  gaps.style.marginTop = "34px";
  gaps.append(el("h3", null, "Range one has and the other does not"));
  let any = false;
  chosen.forEach((b, i) => {
    const mine = sets[i];
    const others = sets.filter((_, j) => j !== i).reduce((acc, s) => { s.forEach((v) => acc.add(v)); return acc; }, new Set());
    const only = D.categories.filter((c) => mine.has(c.id) && !others.has(c.id));
    const missing = D.categories.filter((c) => !mine.has(c.id) && others.has(c.id));
    if (!only.length && !missing.length) return;
    any = true;
    const p = el("p", "only-in");
    const clauses = [];
    if (only.length) clauses.push(`competes alone in ${only.map((c) => esc(c.label.toLowerCase())).join(", ")}`);
    if (missing.length) clauses.push(`is absent from ${missing.map((c) => esc(c.label.toLowerCase())).join(", ")}, where the other${chosen.length > 2 ? "s do" : " does"}`);
    p.innerHTML = `<b>${esc(b.name)}</b> ${clauses.join("; and ")}.`;
    gaps.append(p);
  });
  if (!any) gaps.append(el("p", "only-in", "These brands cover exactly the same categories — the fight is entirely on price and story."));
  out.append(gaps);
}

/* ===========================================================================
   URL state — every view is shareable
   =========================================================================== */
const URL_KEYS = ["tab", "cat", "tier", "role", "own", "cur", "q", "tag", "region", "brand", "view"];
let urlLock = false;

function syncUrl() {
  if (urlLock) return;
  const p = new URLSearchParams();
  URL_KEYS.forEach((k) => { if (state[k]) p.set(k, state[k]); });
  const cmp = state.cmp.filter(Boolean);
  if (cmp.length) p.set("cmp", cmp.join(","));
  const q = p.toString();
  history.replaceState(null, "", q ? "#" + q : location.pathname);
}

function readUrl() {
  const raw = location.hash.replace(/^#/, "");
  if (!raw) return false;
  const p = new URLSearchParams(raw);
  URL_KEYS.forEach((k) => { if (p.has(k)) state[k] = p.get(k); });
  if (p.has("cmp")) {
    const ids = p.get("cmp").split(",").filter(Boolean);
    state.cmp = [ids[0] || null, ids[1] || null, ids[2] || null];
  }
  return true;
}

function reflectStateToControls() {
  const setv = (sel, v) => { const n = $(sel); if (n) n.value = v || ""; };
  setv("#f-cat", state.cat); setv("#f-tier", state.tier); setv("#f-role", state.role); setv("#f-own", state.own);
  setv("#f-cur", state.cur); setv("#f-q", state.q); setv("#f-tag", state.tag);
  setv("#f-region", state.region); setv("#f-brand", state.brand);
  document.querySelectorAll("[data-view]").forEach((x) =>
    x.setAttribute("aria-pressed", String(x.dataset.view === state.view)));
}

/* ---------- wiring ---------- */
function upgradeBrandLinks() {
  document.querySelectorAll("[data-brand]:not([role])").forEach((n) => {
    n.setAttribute("role", "button");
    n.tabIndex = 0;
    n.setAttribute("aria-label", `Open ${n.textContent.trim()} profile`);
  });
}

function renderAll() {
  if (state.tab === "overview") renderOverview();
  if (state.tab === "map") renderMap();
  if (state.tab === "compare") renderCompare();
  if (state.tab === "pricing") { renderLadder(); renderSpread(); renderAed(); renderMatrix(); renderSkuTable(); }
  if (state.tab === "news") renderNews();
  if (state.tab === "pr") { renderPr(); renderWeekly(); renderMomentum(); renderTone(); }
  if (state.tab === "radar") { renderRadar(); renderChallengerFeed(); }
  if (state.tab === "brands") renderBrands();
  upgradeBrandLinks();
}

function updateFilterSummary() {
  const cat = D.categories.find((c) => c.id === state.cat);
  const bits = [];
  if (state.tab === "pricing" && cat) bits.push(cat.label);
  if (state.tier) bits.push(TIER_LABEL[state.tier]);
  if (state.role) bits.push(state.role.replace(/_/g, " "));
  if (state.own) bits.push(OWN_LABEL[state.own] || state.own);
  if (state.q) bits.push(`"${state.q}"`);
  const s = $("#filter-summary");
  if (s) s.textContent = bits.length ? bits.join(" · ") : "All";
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll("nav.tabs button").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;   // roving tabindex: one stop for the whole tablist
  });
  ["overview", "map", "compare", "pricing", "news", "pr", "radar", "brands"].forEach((t) =>
    $("#panel-" + t).classList.toggle("hidden", t !== tab));
  // Only show a control where it actually scopes something.
  const pricing = tab === "pricing";
  $("#w-cat").classList.toggle("hidden", !pricing);
  $("#w-view").classList.toggle("hidden", !pricing);
  $("#w-cur").classList.toggle("hidden", !pricing);
  const noFilters = tab === "overview" || tab === "compare";
  $("#filters").classList.toggle("hidden", noFilters);
  $("#filter-toggle").classList.toggle("hidden", noFilters);
  // Tier and role describe the tracked set; the watchlist has neither. Showing
  // controls that silently do nothing erodes trust in the ones that work.
  const hasTierRole = tab !== "radar";
  $("#f-tier").parentElement.style.display = hasTierRole ? "" : "none";
  $("#f-role").parentElement.style.display = hasTierRole ? "" : "none";
  $("#f-own").parentElement.style.display = hasTierRole ? "" : "none";
  renderAll();
  updateFilterSummary();
  syncUrl();
}

function init() {
  let saved = "auto";
  try { saved = localStorage.getItem("ci-theme") || "auto"; } catch (e) { /* private mode */ }
  applyTheme(saved);
  document.querySelectorAll("[data-theme-set]").forEach((b) =>
    b.addEventListener("click", () => applyTheme(b.dataset.themeSet)));

  $("#f-cat").innerHTML = `<option value="">All categories</option>` +
    D.categories.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join("");


  $("#f-tag").innerHTML = `<option value="">All initiative types</option>` +
    TAG_KEYS.map((k) => `<option value="${k}">${esc(TAG_LABEL[k])}</option>`).join("");

  const withNews = D.brands.filter((b) => b.news_count > 0).sort((a, b) => a.name.localeCompare(b.name));
  $("#f-brand").innerHTML = `<option value="">All brands</option>` +
    withNews.map((b) => `<option value="${b.id}">${esc(b.name)} (${b.news_count})</option>`).join("");

  let searchTimer = null;
  const bind = (sel, key) => $(sel).addEventListener("input", (e) => {
    state[key] = e.target.value;
    const go = () => { renderAll(); updateFilterSummary(); syncUrl(); };
    // Re-rendering 250 SKUs on every keystroke is wasted work; everything else
    // is a discrete choice and should feel instant.
    if (key === "q") { clearTimeout(searchTimer); searchTimer = setTimeout(go, 160); } else go();
  });
  ["#f-cat:cat", "#f-tier:tier", "#f-role:role", "#f-own:own", "#f-cur:cur", "#f-q:q",
   "#f-tag:tag", "#f-region:region", "#f-brand:brand"].forEach((pair) => {
    const [sel, key] = pair.split(":");
    bind(sel, key);
  });

  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    state.view = b.dataset.view;
    document.querySelectorAll("[data-view]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.view === state.view)));
    renderLadder(); syncUrl();
  }));

  const tabBtns = [...document.querySelectorAll("nav.tabs button")];
  tabBtns.forEach((b, i) => {
    b.addEventListener("click", () => setTab(b.dataset.tab));
    b.addEventListener("keydown", (e) => {
      const map = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity };
      if (!(e.key in map)) return;
      e.preventDefault();
      const d = map[e.key];
      const next = d === -Infinity ? 0 : d === Infinity ? tabBtns.length - 1
        : (i + d + tabBtns.length) % tabBtns.length;
      tabBtns[next].focus();
      setTab(tabBtns[next].dataset.tab);
    });
  });

  // Brand names are clickable wherever they appear — and operable by keyboard,
  // which means they must actually be controls, not just styled text.
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-brand]");
    if (t) { e.preventDefault(); openBrand(t.dataset.brand); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = e.target.closest && e.target.closest("[data-brand]");
    if (t) { e.preventDefault(); openBrand(t.dataset.brand); }
  });

  $("#drawer-close").addEventListener("click", closeDrawer);
  $("#scrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    const drawer = $("#drawer");
    if (!drawer.classList.contains("open")) {
      // "/" focuses search from anywhere, unless already typing
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        $("#filters").classList.add("open");
        $("#f-q").focus();
      }
      return;
    }
    if (e.key === "Escape") { closeDrawer(); return; }
    if (e.key !== "Tab") return;
    // A modal must not leak focus to the page behind it.
    const f = [...drawer.querySelectorAll('a[href], button, input, select, [tabindex]:not([tabindex="-1"])')]
      .filter((n) => n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  $("#filter-toggle").addEventListener("click", () => {
    const open = $("#filters").classList.toggle("open");
    $("#filter-toggle").setAttribute("aria-expanded", String(open));
  });

  $("#cmp-clear").addEventListener("click", () => {
    state.cmp = [null, null, null];
    syncUrl(); renderCompare();
  });

  const fromUrl = readUrl();
  if (!fromUrl || !state.cat) state.cat = state.cat || (D.categories.some((c) => c.id === "soap") ? "soap" : (D.categories[0]?.id || ""));
  reflectStateToControls();

  addEventListener("hashchange", () => {
    urlLock = true;
    readUrl(); reflectStateToControls(); setTab(state.tab || "overview");
    urlLock = false;
  });

  const lede = document.querySelector(".lede");
  if (lede) lede.addEventListener("click", () => lede.classList.toggle("expanded"));

  renderHeader();
  setTab(state.tab || "overview");
}

init();
