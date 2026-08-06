/* Personal care competitive intelligence — view layer.
   Data comes from data.js (window.__CI_DATA__), produced by scripts/build.py.
   Bar length is ALWAYS normalised USD: it is the only axis every brand shares.
   The currency selector changes the figures shown, never the scale. */

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
};

const state = { cat: "", tier: "", role: "", cur: "usd", q: "", tag: "", region: "", table: false, tab: "pricing", sort: { key: "sku_count", dir: -1 } };

/* ---------- formatting ---------- */
const CUR_SYMBOL = { USD: "$", EUR: "€", GBP: "£", AUD: "A$", AED: "AED ", SEK: "SEK ", JPY: "¥", KRW: "₩", INR: "₹", CAD: "C$", ILS: "₪", CHF: "CHF ", BRL: "R$", OMR: "OMR " };
function money(v, cur) {
  if (v == null) return "—";
  const sym = CUR_SYMBOL[cur] ?? cur + " ";
  const dp = v >= 100 || ["JPY", "KRW", "INR"].includes(cur) ? 0 : v >= 10 ? 0 : 2;
  return sym + v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/* Which figure to *display* for a product, per the currency selector. */
function displayPrice(p) {
  if (state.cur === "home") return { v: p.price_home, cur: p.home_currency, norm: null, tagText: "home" };
  if (state.cur === "aed") {
    const observed = p.price_aed_observed != null;
    return {
      v: observed ? p.price_aed_observed : p.price_aed_expected,
      cur: "AED", norm: p.norm_aed_expected,
      tagText: observed ? "observed" : "expected",
    };
  }
  return { v: p.price_usd, cur: "USD", norm: p.norm_usd, tagText: "US" };
}

/* ---------- filtering ---------- */
function matches(p) {
  if (state.cat && p.category !== state.cat) return false;
  if (state.tier && p.brand_tier !== state.tier) return false;
  if (state.role && p.brand_role !== state.role) return false;
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
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
const hideTip = () => { tip.style.opacity = "0"; };
function bindTip(node, html) {
  node.addEventListener("mousemove", (e) => showTip(e, html));
  node.addEventListener("mouseleave", hideTip);
  node.tabIndex = 0;
  node.addEventListener("focus", (e) => {
    const b = node.getBoundingClientRect();
    showTip({ clientX: b.left + 20, clientY: b.top + b.height }, html);
  });
  node.addEventListener("blur", hideTip);
}

/* ---------- header ---------- */
function renderHeader() {
  const gen = new Date(D.generated_at);
  $("#meta-generated").textContent = "Built " + gen.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  $("#meta-fx").textContent = `FX ${D.fx.as_of} · ${D.fx.source}`;
  $("#meta-news").textContent = D.news_generated_at
    ? `Signals collected ${new Date(D.news_generated_at).toLocaleDateString(undefined, { dateStyle: "medium" })}`
    : "Signals not yet collected — run scripts/collect_news.py";

  const s = D.stats;
  const widest = [...D.categories].filter((c) => c.spread_multiple).sort((a, b) => b.spread_multiple - a.spread_multiple)[0];
  const tiles = [
    { label: "Brands tracked", value: s.brands, foot: `${D.brands.filter((b) => b.role === "core_competitor").length} core competitors` },
    { label: "SKUs priced", value: s.skus, foot: `across ${s.categories} categories` },
    { label: "Widest price spread", value: widest ? widest.spread_multiple + "×" : "—", foot: widest ? widest.label.toLowerCase() : "" },
    { label: "Signals collected", value: s.news_items, foot: D.news_generated_at ? "auto-refreshed daily" : "run the collector" },
    { label: "On the radar", value: s.watchlist, foot: "emerging & scaling" },
    { label: "Prices verified", value: s.verified_pct + "%", foot: `${s.verified_prices} of ${s.skus} sourced` },
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
  // Off-basis SKUs (an incense holder priced per unit, beside sticks priced per stick)
  // are excluded: putting them on the same axis would be a comparison, not a chart.
  const all = filtered().filter((p) => p.norm_usd != null);
  const rows = all.filter((p) => !p.off_basis).sort((a, b) => b.norm_usd - a.norm_usd);
  const excluded = all.length - rows.length;
  $("#ladder-title").textContent = cat ? `Price ladder — ${cat.label}` : "Price ladder — all categories";
  $("#ladder-basis").textContent = rows.length ? rows[0].basis_label : "—";

  const box = $("#ladder"); box.innerHTML = "";
  if (!rows.length) { box.append(el("div", "empty", "Nothing matches these filters.")); $("#ladder-foot").textContent = ""; return; }

  const max = rows[0].norm_usd;
  const median = cat ? cat.median_norm_usd : null;
  rows.forEach((p, i) => {
    const dp = displayPrice(p);
    const row = el("div", "bar-row");
    row.append(el("div", "bar-name", `<b>${esc(p.brand_name)}</b> ${esc(p.name)}`));

    const track = el("div", "track");
    if (median && state.cat) {
      const rule = el("div", "median-rule");
      rule.style.left = (median / max * 100) + "%";
      track.append(rule);
    }
    const fill = el("div", "fill");
    fill.style.width = Math.max(0.4, p.norm_usd / max * 100) + "%";
    fill.style.background = `var(${TIER_VAR[p.brand_tier]})`;
    track.append(fill);
    row.append(track);

    // Selective direct labels: the extremes carry the number in bold, the rest read normally.
    const extreme = i === 0 || i === rows.length - 1;
    const label = state.cur === "home"
      ? money(dp.v, dp.cur)
      : money(dp.norm ?? dp.v, dp.cur);
    row.append(el("div", "bar-val", extreme ? `<b>${esc(label)}</b>` : esc(label)));

    bindTip(row, `
      <div class="t-title">${esc(p.brand_name)} — ${esc(p.name)}</div>
      <div class="t-row"><span>Size</span><b>${p.size}${p.unit === "unit" ? "" : " " + p.unit}</b></div>
      <div class="t-row"><span>US price</span><b>${esc(money(p.price_usd, "USD"))}</b></div>
      <div class="t-row"><span>Home (${esc(p.home_currency)})</span><b>${esc(money(p.price_home, p.home_currency))}</b></div>
      <div class="t-row"><span>UAE ${p.price_aed_observed != null ? "observed" : "expected"}</span><b>${esc(money(p.price_aed_observed ?? p.price_aed_expected, "AED"))}</b></div>
      <div class="t-row"><span>Normalised (${esc(p.basis_label)})</span><b>${esc(money(p.norm_usd, "USD"))}</b></div>
      ${p.price_index != null ? `<div class="t-row"><span>Index vs category</span><b>${p.price_index}</b></div>` : ""}
      ${p.us_vs_home_pct != null ? `<div class="t-row"><span>US vs home market</span><b>${p.us_vs_home_pct > 0 ? "+" : ""}${p.us_vs_home_pct}%</b></div>` : ""}
      <div class="t-row"><span>${TIER_LABEL[p.brand_tier]}</span><b>${p.verified ? "verified" : "estimate"}</b></div>
    `);
    box.append(row);
  });

  const exclNote = excluded ? ` ${excluded} SKU${excluded === 1 ? "" : "s"} on a different basis excluded — see the table view.` : "";
  $("#ladder-foot").textContent = (cat && median
    ? `Median ${money(median, "USD")} ${rows[0].basis_label} · spread ${cat.spread_multiple}× from cheapest to dearest · ${rows.length} SKUs shown.`
    : `${rows.length} SKUs across all categories — pick a single category for a like-for-like ladder.`) + exclNote;
}

/* ---------- category spread ---------- */
function renderSpread() {
  const cats = D.categories.filter((c) => c.spread_multiple).sort((a, b) => b.spread_multiple - a.spread_multiple);
  const box = $("#spread"); box.innerHTML = "";
  const max = Math.max(...cats.map((c) => c.spread_multiple));
  cats.forEach((c, i) => {
    const row = el("div", "bar-row");
    row.append(el("div", "bar-name", esc(c.label)));
    const track = el("div", "track");
    const fill = el("div", "fill");
    fill.style.width = (c.spread_multiple / max * 100) + "%";
    fill.style.background = "var(--series-1)";
    track.append(fill); row.append(track);
    const extreme = i === 0 || i === cats.length - 1;
    row.append(el("div", "bar-val", extreme ? `<b>${c.spread_multiple}×</b>` : `${c.spread_multiple}×`));
    bindTip(row, `
      <div class="t-title">${esc(c.label)}</div>
      <div class="t-row"><span>Cheapest</span><b>${esc(money(c.min_norm_usd, "USD"))}</b></div>
      <div class="t-row"><span>Median</span><b>${esc(money(c.median_norm_usd, "USD"))}</b></div>
      <div class="t-row"><span>Dearest</span><b>${esc(money(c.max_norm_usd, "USD"))}</b></div>
      <div class="t-row"><span>Basis</span><b>${esc(c.basis_label || "—")}</b></div>
      <div class="t-row"><span>Comparable SKUs · brands</span><b>${c.comparable_count} · ${c.brand_count}</b></div>
      ${c.off_basis_count ? `<div class="t-row"><span>Excluded (other basis)</span><b>${c.off_basis_count}</b></div>` : ""}
    `);
    box.append(row);
  });
}

/* ---------- UAE gap (diverging) ---------- */
function renderAedGap() {
  const rows = D.products.filter((p) => p.aed_gap_pct != null).sort((a, b) => b.aed_gap_pct - a.aed_gap_pct);
  const box = $("#aedgap"); box.innerHTML = "";
  if (!rows.length) {
    box.append(el("div", "empty",
      `No observed UAE prices recorded yet. Add a real AED shelf price to <code>px.aed</code> on any SKU and this chart fills in — that gap against parity is the most decision-useful number the dashboard produces.`));
    return;
  }
  const max = Math.max(30, ...rows.map((r) => Math.abs(r.aed_gap_pct)));
  rows.forEach((p) => {
    const row = el("div", "div-row");
    row.append(el("div", "bar-name", `<b>${esc(p.brand_name)}</b> ${esc(p.name)}`));
    const track = el("div", "div-track");
    track.append(el("div", "div-axis"));
    const fill = el("div", "div-fill");
    const w = Math.abs(p.aed_gap_pct) / max * 50;
    if (p.aed_gap_pct >= 0) { fill.style.left = "50%"; fill.style.borderRadius = "0 4px 4px 0"; fill.style.background = "var(--div-high)"; }
    else { fill.style.right = "50%"; fill.style.borderRadius = "4px 0 0 4px"; fill.style.background = "var(--div-low)"; }
    fill.style.width = w + "%";
    track.append(fill); row.append(track);
    row.append(el("div", "bar-val", `<b>${p.aed_gap_pct > 0 ? "+" : ""}${p.aed_gap_pct}%</b>`));
    bindTip(row, `
      <div class="t-title">${esc(p.brand_name)} — ${esc(p.name)}</div>
      <div class="t-row"><span>Observed AED</span><b>${esc(money(p.price_aed_observed, "AED"))}</b></div>
      <div class="t-row"><span>Expected AED</span><b>${esc(money(p.price_aed_expected, "AED"))}</b></div>
      <div class="t-row"><span>At pure FX parity</span><b>${esc(money(p.price_aed_parity, "AED"))}</b></div>
    `);
    box.append(row);
  });
  box.append(el("p", "median-caption", `Expectation = US price × ${D.fx.rates.AED} × tier uplift. ${rows.length} of ${D.stats.skus} SKUs have an observed UAE price.`));
}

/* ---------- range coverage matrix ---------- */
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
  const thead = el("thead");
  const hr = el("tr");
  hr.append(el("th", "brand", ""));
  cats.forEach((c) => hr.append(el("th", "rot", esc(c.label))));
  hr.append(el("th", "", "Cats"));
  thead.append(hr); t.append(thead);

  const tb = el("tbody");
  rows.forEach((b) => {
    const tr = el("tr");
    tr.append(el("th", "brand", esc(b.name)));
    cats.forEach((c) => {
      const n = counts[b.id][c.id] || 0;
      const td = el("td", n ? "on" : "");
      if (n) td.dataset.n = n;
      bindTip(td, `<div class="t-title">${esc(b.name)}</div><div class="t-row"><span>${esc(c.label)}</span><b>${n} SKU${n === 1 ? "" : "s"}</b></div>`);
      tr.append(td);
    });
    tr.append(el("td", "", `<span style="color:var(--text-secondary);font-variant-numeric:tabular-nums">${Object.keys(counts[b.id]).length}</span>`));
    tb.append(tr);
  });
  t.append(tb);
  const box = $("#matrix"); box.innerHTML = "";
  box.append(rows.length ? t : el("div", "empty", "Nothing matches these filters."));
}

/* ---------- SKU table (the table-view twin) ---------- */
function renderSkuTable() {
  const rows = filtered().sort((a, b) => (b.norm_usd ?? 0) - (a.norm_usd ?? 0));
  const t = $("#sku-table");
  t.innerHTML = `<thead><tr>
    <th>Brand</th><th>Product</th><th>Category</th><th>Size</th>
    <th class="num">Home</th><th class="num">USD</th><th class="num">AED</th>
    <th class="num">Norm. USD</th><th class="num">Index</th><th>Confidence</th></tr></thead>`;
  const tb = el("tbody");
  rows.forEach((p) => {
    const tr = el("tr");
    tr.innerHTML = `
      <td>${esc(p.brand_name)}</td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.category_label)}</td>
      <td class="num">${p.size}${p.unit === "unit" ? "" : " " + esc(p.unit)}</td>
      <td class="num">${esc(money(p.price_home, p.home_currency))}</td>
      <td class="num">${esc(money(p.price_usd, "USD"))}</td>
      <td class="num">${esc(money(p.price_aed_observed ?? p.price_aed_expected, "AED"))}${p.price_aed_observed == null ? ' <span style="color:var(--text-muted)">exp</span>' : ""}</td>
      <td class="num">${esc(money(p.norm_usd, "USD"))}</td>
      <td class="num">${p.price_index ?? "—"}</td>
      <td><span class="chip ${p.verified ? "ver" : "est"}">${p.verified ? "verified" : "estimate"}</span></td>`;
    tb.append(tr);
  });
  t.append(tb);
}

/* ---------- signals ---------- */
function newsFiltered() {
  return D.news.filter((n) => {
    if (state.tag && !(n.tags || []).includes(state.tag)) return false;
    if (state.region && n.region !== state.region) return false;
    if (state.q) {
      const hay = ((n.brand_name || "") + " " + n.title + " " + (n.source || "")).toLowerCase();
      if (!hay.includes(state.q.toLowerCase())) return false;
    }
    if (state.tier || state.role) {
      if (!n.brand) return false;
      const b = D.brands.find((x) => x.id === n.brand);
      if (!b) return false;
      if (state.tier && b.tier !== state.tier) return false;
      if (state.role && b.role !== state.role) return false;
    }
    return true;
  });
}

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
    fill.style.background = "var(--series-1)";
    track.append(fill); row.append(track);
    const extreme = i === 0 || i === entries.length - 1;
    row.append(el("div", "bar-val", extreme ? `<b>${n}</b>` : String(n)));
    bindTip(row, `<div class="t-title">${esc(label)}</div><div class="t-row"><span>${esc(unitLabel)}</span><b>${n}</b></div>`);
    box.append(row);
  });
}

function renderSignals() {
  const items = newsFiltered();

  const tagCounts = {};
  items.forEach((n) => (n.tags || []).forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
  simpleBars("#tagchart", Object.entries(tagCounts).map(([k, v]) => [TAG_LABEL[k] || k, v]).sort((a, b) => b[1] - a[1]), "headlines");

  const sov = {};
  items.forEach((n) => { if (n.brand_name) sov[n.brand_name] = (sov[n.brand_name] || 0) + 1; });
  simpleBars("#sovchart", Object.entries(sov).sort((a, b) => b[1] - a[1]).slice(0, 14), "headlines");

  const box = $("#timeline"); box.innerHTML = "";
  if (!items.length) {
    box.append(el("div", "empty", "No signals match. If the list is empty everywhere, run <code>python3 scripts/collect_news.py</code> then rebuild."));
    return;
  }
  items.slice(0, 200).forEach((n) => {
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
  if (items.length > 200) box.append(el("p", "median-caption", `Showing the 200 most recent of ${items.length} matching signals — narrow with the filters above.`));
}

/* ---------- radar ---------- */
function renderRadar() {
  const box = $("#radar"); box.innerHTML = "";
  const list = [...D.watchlist].sort((a, b) => b.momentum - a.momentum);
  list.forEach((w) => {
    const c = el("div", "radar-card");
    c.append(el("h3", null, `${esc(w.name)} <span class="chip"><i class="dot" style="background:var(${THREAT_VAR[w.threat] || "--good"})"></i>${esc(w.threat)} threat</span>`));
    c.append(el("div", "place", `${esc(w.country)}${w.founded ? " · founded " + w.founded : ""} · ${esc((w.categories || []).join(", ").replace(/_/g, " "))}${w.needs_review ? " · needs review" : ""}`));
    const meter = el("div", "meter");
    for (let i = 1; i <= 5; i++) {
      const pip = el("i");
      if (i <= w.momentum) pip.style.background = "var(--series-1)";
      meter.append(pip);
    }
    meter.append(el("span", "lbl", `momentum ${w.momentum}/5`));
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

/* ---------- brand directory ---------- */
const BRAND_COLS = [
  { k: "name", t: "Brand" }, { k: "tier", t: "Tier" }, { k: "role", t: "Role" },
  { k: "country", t: "Home" }, { k: "owner", t: "Owner" },
  { k: "uae_status", t: "UAE" }, { k: "sku_count", t: "SKUs", num: true },
  { k: "categories_n", t: "Cats", num: true },
  { k: "avg_price_index", t: "Avg index", num: true },
  { k: "news_count", t: "Signals", num: true },
];
function brandRows() {
  return D.brands
    .filter((b) => (!state.tier || b.tier === state.tier) && (!state.role || b.role === state.role) &&
      (!state.q || (b.name + " " + b.owner + " " + b.positioning).toLowerCase().includes(state.q.toLowerCase())))
    .map((b) => ({ ...b, uae_status: b.uae.status, categories_n: (b.categories_tracked || []).length }));
}
function renderBrands() {
  const rows = brandRows().sort((a, b) => {
    const { key, dir } = state.sort;
    const x = a[key], y = b[key];
    if (x == null) return 1; if (y == null) return -1;
    return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
  });
  const t = $("#brand-table");
  t.innerHTML = "";
  const thead = el("thead"); const tr = el("tr");
  BRAND_COLS.forEach((c) => {
    const th = el("th", c.num ? "num" : "", esc(c.t) + (state.sort.key === c.k ? (state.sort.dir === 1 ? " ↑" : " ↓") : ""));
    th.onclick = () => {
      state.sort = { key: c.k, dir: state.sort.key === c.k ? -state.sort.dir : (c.num ? -1 : 1) };
      renderBrands();
    };
    tr.append(th);
  });
  thead.append(tr); t.append(thead);
  const tb = el("tbody");
  rows.forEach((b) => {
    const row = el("tr");
    row.innerHTML = `
      <td><b>${esc(b.name)}</b>${b.needs_review ? ' <span class="chip est">review</span>' : ""}<div style="color:var(--text-muted);font-size:11.5px">${esc(b.positioning)}</div></td>
      <td><span class="chip"><i class="swatch" style="background:var(${TIER_VAR[b.tier]})"></i>${esc(TIER_LABEL[b.tier])}</span></td>
      <td>${esc(b.role.replace(/_/g, " "))}</td>
      <td>${esc(b.country)}</td>
      <td>${esc(b.owner)}</td>
      <td>${esc(b.uae.status.replace(/_/g, " "))}${(b.uae.channels || []).length ? `<div style="color:var(--text-muted);font-size:11.5px">${esc(b.uae.channels.join(", "))}</div>` : ""}</td>
      <td class="num">${b.sku_count}</td>
      <td class="num">${b.categories_n}</td>
      <td class="num">${b.avg_price_index ?? "—"}</td>
      <td class="num">${b.news_count}</td>`;
    tb.append(row);
  });
  t.append(tb);
}

/* ---------- wiring ---------- */
function renderAll() {
  if (state.tab === "pricing") { renderLadder(); renderSpread(); renderAedGap(); renderMatrix(); renderSkuTable(); }
  if (state.tab === "signals") renderSignals();
  if (state.tab === "radar") renderRadar();
  if (state.tab === "brands") renderBrands();
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  ["pricing", "signals", "radar", "brands"].forEach((t) => $("#panel-" + t).classList.toggle("hidden", t !== tab));
  // Currency + table view only mean something on the pricing tab.
  $("#f-cur").parentElement.style.display = tab === "pricing" ? "" : "none";
  $("#toggle-table").style.display = tab === "pricing" ? "" : "none";
  // Category scopes the ladder only. The directory lists every brand; the signals
  // feed is not category-tagged. Showing an inert control would be worse than hiding it.
  $("#f-cat").parentElement.style.display = tab === "pricing" ? "" : "none";
  renderAll();
}

function init() {
  const catSel = $("#f-cat");
  catSel.innerHTML = `<option value="">All categories</option>` +
    D.categories.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join("");
  state.cat = D.categories.find((c) => c.id === "soap") ? "soap" : D.categories[0]?.id || "";
  catSel.value = state.cat;

  $("#f-tag").innerHTML = `<option value="">All initiative types</option>` +
    Object.keys(TAG_LABEL).map((k) => `<option value="${k}">${esc(TAG_LABEL[k])}</option>`).join("");

  const bind = (sel, key) => $(sel).addEventListener("input", (e) => { state[key] = e.target.value; renderAll(); });
  bind("#f-cat", "cat"); bind("#f-tier", "tier"); bind("#f-role", "role");
  bind("#f-cur", "cur"); bind("#f-q", "q"); bind("#f-tag", "tag"); bind("#f-region", "region");

  $("#toggle-table").addEventListener("click", (e) => {
    state.table = !state.table;
    e.target.setAttribute("aria-pressed", String(state.table));
    $("#card-table").classList.toggle("hidden", !state.table);
  });

  document.querySelectorAll("nav.tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

  renderHeader();
  setTab("pricing");
}

init();
