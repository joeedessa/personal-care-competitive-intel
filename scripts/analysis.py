#!/usr/bin/env python3
"""Derive findings from the merged dataset.

A dashboard that only draws bars makes the reader do the analysis. These
functions do it instead: each returns zero or more findings, each with a
headline you could put in a deck, the evidence behind it, and a magnitude so
the set can be ranked. Everything here is computed — nothing is hand-written,
so findings update when prices do.

Finding shape:
  kind      machine key for grouping / icons
  headline  the claim, in plain language
  detail    why it matters / what to do with it
  magnitude number used to rank findings against each other (higher = louder)
  metric    the number to display large
  refs      product or brand ids backing the claim
  tab/focus where to send the reader who clicks it
"""
from __future__ import annotations

import statistics
from collections import defaultdict

MIN_TIER_PEERS = 3
MAX_SIZE_RATIO = 4      # beyond this the two packs are different product classes
MAX_PER_KIND = 3        # keep the finding set varied rather than one idea repeated


def _fmt_usd(v):
    return f"${v:,.2f}" if v < 10 else f"${v:,.0f}"


def _comparable(a, b):
    """Two SKUs are comparable if they are the same format at a similar size."""
    if a["unit"] != b["unit"]:
        return False
    if a.get("subtype") != b.get("subtype"):
        return False
    hi, lo = max(a["size"], b["size"]), min(a["size"], b["size"])
    return lo > 0 and hi / lo <= MAX_SIZE_RATIO


def _damp(x):
    """Compress magnitudes so one 30x outlier cannot own the whole board."""
    return 10 * (1 + (x - 1) ** 0.5) if x > 1 else x


def same_tier_undercuts(products, categories):
    """Within one category and tier, who is cheapest and who is dearest per unit.

    This is the sharpest competitive fact in the dataset: two brands claiming the
    same position, with a large per-unit gap between them.
    """
    out = []
    groups = defaultdict(list)
    for p in products:
        if p["norm_usd"] and not p["off_basis"] and p["brand_tier"] in ("luxury", "premium"):
            groups[(p["category"], p["brand_tier"])].append(p)

    for (cat_id, tier), items in groups.items():
        # one SKU per brand — the cheapest, so we compare best-foot-forward
        by_brand = {}
        for p in items:
            if p["brand"] not in by_brand or p["norm_usd"] < by_brand[p["brand"]]["norm_usd"]:
                by_brand[p["brand"]] = p
        if len(by_brand) < MIN_TIER_PEERS:
            continue
        ranked = sorted(by_brand.values(), key=lambda p: p["norm_usd"])
        lo, hi = ranked[0], ranked[-1]

        # Comparability guard. A 30-stick gift box and a 450-stick bulk pack are
        # both "incense sticks" and both "luxury", but they are not competing
        # products — comparing them produces a true number and a false claim.
        if not _comparable(hi, lo):
            for cand in reversed(ranked[:-1]):
                if _comparable(cand, lo):
                    hi = cand
                    break
            else:
                continue

        mult = hi["norm_usd"] / lo["norm_usd"]
        if mult < 1.6:
            continue
        cat = next(c for c in categories if c["id"] == cat_id)
        out.append({
            "kind": "same_tier_gap",
            "headline": f"{hi['brand_name']} charges {mult:.1f}× {lo['brand_name']} for the same {tier} claim in {cat['label'].lower()}",
            "detail": f"{hi['brand_name']} {hi['name']} is {_fmt_usd(hi['norm_usd'])} {cat['basis_label']}; "
                      f"{lo['brand_name']} {lo['name']} is {_fmt_usd(lo['norm_usd'])}. Same tier, same category — "
                      f"the difference is brand equity, not positioning.",
            "metric": f"{mult:.1f}×",
            "magnitude": _damp(mult) * 1.4,
            "refs": [hi["id"], lo["id"]],
            "tab": "pricing", "focus": {"cat": cat_id, "tier": tier},
        })
    return out


def pack_size_illusion(products, categories):
    """Pairs that look the same price on shelf but are not remotely the same value.

    This is the single most useful thing a shopper-facing price ladder hides, and
    the reason the dashboard carries both an as-sold and a like-for-like view.
    """
    out = []
    by_cat = defaultdict(list)
    for p in products:
        if p["price_usd"] and p["norm_usd"] and not p["off_basis"]:
            by_cat[p["category"]].append(p)

    for cat_id, items in by_cat.items():
        best = None
        for a in items:
            for b in items:
                if a["brand"] >= b["brand"]:
                    continue
                if not a["price_usd"] or not b["price_usd"]:
                    continue
                shelf_gap = abs(a["price_usd"] - b["price_usd"]) / max(a["price_usd"], b["price_usd"])
                if shelf_gap > 0.08:
                    continue
                if a["unit"] != b["unit"]:
                    continue
                hi, lo = (a, b) if a["norm_usd"] > b["norm_usd"] else (b, a)
                mult = hi["norm_usd"] / lo["norm_usd"]
                if mult < 1.5:
                    continue
                if best is None or mult > best[0]:
                    best = (mult, hi, lo)
        if best:
            mult, hi, lo = best
            cat = next(c for c in categories if c["id"] == cat_id)
            out.append({
                "kind": "pack_illusion",
                "headline": f"{hi['brand_name']} and {lo['brand_name']} cost the same on shelf — {hi['brand_name']} is {mult:.1f}× the price by volume",
                "detail": f"{hi['brand_name']} {hi['name']} at {hi['size']}{hi['unit']} and {lo['brand_name']} {lo['name']} at "
                          f"{lo['size']}{lo['unit']} both sit near {_fmt_usd(hi['price_usd'])}. Pack size is doing the work "
                          f"that price appears to be doing. This is the lever to pull if you want to look competitive without discounting.",
                "metric": f"{mult:.1f}×",
                "magnitude": _damp(mult) * 1.25,
                "refs": [hi["id"], lo["id"]],
                "tab": "pricing", "focus": {"cat": cat_id, "view": "asis"},
            })
    return out


def geography_premium(products):
    """Where a brand's price is mostly geography rather than product."""
    ranked = sorted(
        [p for p in products if p.get("us_vs_home_pct") is not None and p["price_usd"] and p["price_usd"] > 15],
        key=lambda p: p["us_vs_home_pct"], reverse=True)
    if not ranked:
        return []
    top = ranked[0]
    big = [p for p in ranked if p["us_vs_home_pct"] > 25]
    return [{
        "kind": "geography",
        "headline": f"{top['brand_name']} costs {top['us_vs_home_pct']:.0f}% more in the US than at home",
        "detail": f"{top['name']} is {_fmt_usd(top['price_usd'])} in the US against "
                  f"{top['price_home']:,.0f} {top['home_currency']} at home. "
                  f"{len(big)} tracked SKUs carry a US premium above 25% — that gap is distribution margin, not product, "
                  f"and it is the same gap you would be paying to import into the UAE.",
        "metric": f"+{top['us_vs_home_pct']:.0f}%",
        "magnitude": top["us_vs_home_pct"] * 1.2,
        "refs": [top["id"]],
        "tab": "pricing", "focus": {"cat": top["category"]},
    }]


def range_white_space(products, brands, categories):
    """Categories that the premium set has crowded, and ones it has left alone."""
    out = []
    core = [b for b in brands if b["role"] in ("core_competitor", "adjacent")]
    core_ids = {b["id"] for b in core}
    per_cat = {}
    for c in categories:
        present = {p["brand"] for p in products if p["category"] == c["id"] and p["brand"] in core_ids}
        per_cat[c["id"]] = len(present)

    if not per_cat:
        return out
    thinnest = min(per_cat, key=per_cat.get)
    thickest = max(per_cat, key=per_cat.get)
    tc = next(c for c in categories if c["id"] == thinnest)
    kc = next(c for c in categories if c["id"] == thickest)
    out.append({
        "kind": "white_space",
        "headline": f"Only {per_cat[thinnest]} premium brands compete in {tc['label'].lower()} — against {per_cat[thickest]} in {kc['label'].lower()}",
        "detail": f"{tc['label']} is the least crowded category tracked. Thin competition can mean an opening or a category "
                  f"that does not support a premium — check the spread before reading it as opportunity.",
        "metric": str(per_cat[thinnest]),
        "magnitude": (per_cat[thickest] - per_cat[thinnest]) * 4,
        "refs": [],
        "tab": "pricing", "focus": {"cat": thinnest},
    })
    return out


def uae_exposure(brands):
    """Premium brands with no UAE route to market."""
    absent = [b for b in brands
              if b["role"] in ("core_competitor", "adjacent")
              and b["uae"]["status"] in ("none", "ecom_only", "unknown")
              and b["tier"] in ("luxury", "premium")]
    if len(absent) < 3:
        return []
    names = ", ".join(b["name"] for b in absent[:4])
    return [{
        "kind": "uae_gap",
        "headline": f"{len(absent)} premium brands still have no proper UAE route to market",
        "detail": f"{names}{' and others' if len(absent) > 4 else ''} reach the Gulf through e-commerce or not at all. "
                  f"Every one of them is a shelf that is not yet taken — and a distribution conversation somebody will have first.",
        "metric": str(len(absent)),
        "magnitude": len(absent) * 3,
        "refs": [b["id"] for b in absent[:8]],
        "tab": "brands", "focus": {},
    }]


def price_leadership(brands):
    """Who prices highest and lowest against their own categories' medians."""
    scored = [b for b in brands if b.get("avg_price_index") and b["sku_count"] >= 3
              and b["role"] in ("core_competitor", "adjacent")]
    if len(scored) < 4:
        return []
    top = max(scored, key=lambda b: b["avg_price_index"])
    low = min(scored, key=lambda b: b["avg_price_index"])
    return [{
        "kind": "price_leader",
        "headline": f"{top['name']} prices at {top['avg_price_index']}% of the category median across every category it plays in",
        "detail": f"Across {top['sku_count']} tracked SKUs, {top['name']} averages an index of {top['avg_price_index']} "
                  f"where 100 is the median of each category it competes in. The most restrained brand in the set is "
                  f"{low['name']} at {low['avg_price_index']}. Those two numbers bracket the practical premium ceiling.",
        "metric": str(top["avg_price_index"]),
        "magnitude": top["avg_price_index"] / 2,
        "refs": [top["id"], low["id"]],
        "tab": "brands", "focus": {},
    }]


def news_momentum(news, brands):
    """Who is generating disproportionate coverage relative to their size."""
    if not news:
        return []
    counts = defaultdict(int)
    for n in news:
        if n.get("brand"):
            counts[n["brand"]] += 1
    if not counts:
        return []
    by_id = {b["id"]: b for b in brands}
    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    top_id, top_n = ranked[0]
    median = statistics.median(counts.values())
    if not median or top_n < median * 1.5:
        return []
    b = by_id.get(top_id)
    if not b:
        return []
    return [{
        "kind": "momentum",
        "headline": f"{b['name']} is generating {top_n / median:.1f}× the median brand's coverage",
        "detail": f"{top_n} headlines against a median of {median:.0f} across the {len(counts)} brands with any coverage. "
                  f"Volume is not sentiment — but a brand this loud is either launching, being acquired, or in trouble.",
        "metric": str(top_n),
        "magnitude": (top_n / median) * 8,
        "refs": [top_id],
        "tab": "news", "focus": {"brand": top_id},
    }]


def initiative_concentration(news, tag_labels):
    """What the category as a whole is spending its comms on."""
    if not news:
        return []
    counts = defaultdict(int)
    for n in news:
        for t in n.get("tags", []):
            counts[t] += 1
    if len(counts) < 3:
        return []
    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    top, top_n = ranked[0]
    bottom, bottom_n = ranked[-1]
    total = sum(counts.values())
    return [{
        "kind": "initiative",
        "headline": f"{tag_labels.get(top, top)} accounts for {top_n / total * 100:.0f}% of everything the category is talking about",
        "detail": f"{top_n} of {total} tagged headlines. The quietest front is {tag_labels.get(bottom, bottom).lower()} "
                  f"at {bottom_n} — a theme nobody has claimed is either irrelevant or unoccupied.",
        "metric": f"{top_n / total * 100:.0f}%",
        "magnitude": (top_n / total) * 60,
        "refs": [],
        "tab": "pr", "focus": {"tag": top},
    }]


def entry_price_floor(products, categories):
    """The cheapest credible way into each premium category — the trial price point."""
    out = []
    for c in categories:
        prem = [p for p in products
                if p["category"] == c["id"] and p["brand_tier"] in ("luxury", "premium")
                and p["price_usd"] and not p["off_basis"]]
        if len(prem) < 4:
            continue
        cheapest = min(prem, key=lambda p: p["price_usd"])
        out.append({
            "kind": "entry_price",
            "headline": f"The cheapest way into premium {c['label'].lower()} is {_fmt_usd(cheapest['price_usd'])}",
            "detail": f"{cheapest['brand_name']} {cheapest['name']} at {cheapest['size']}{cheapest['unit']}. "
                      f"That is the trial price a new entrant has to beat or justify — the number that decides whether "
                      f"someone tries you on impulse.",
            "metric": _fmt_usd(cheapest["price_usd"]),
            "magnitude": 20,
            "refs": [cheapest["id"]],
            "tab": "pricing", "focus": {"cat": c["id"], "view": "asis"},
        })
    return out


def build_findings(products, brands, categories, news, tag_labels):
    findings = []
    findings += same_tier_undercuts(products, categories)
    findings += pack_size_illusion(products, categories)
    findings += geography_premium(products)
    findings += range_white_space(products, brands, categories)
    findings += uae_exposure(brands)
    findings += price_leadership(brands)
    findings += news_momentum(news, brands)
    findings += initiative_concentration(news, tag_labels)
    findings += entry_price_floor(products, categories)
    findings.sort(key=lambda f: f["magnitude"], reverse=True)
    kept, seen = [], {}
    for f in findings:
        seen[f["kind"]] = seen.get(f["kind"], 0) + 1
        if seen[f["kind"]] <= MAX_PER_KIND:
            kept.append(f)
    findings = kept
    for i, f in enumerate(findings):
        f["rank"] = i + 1
    return findings


def build_positioning(products, brands):
    """One row per brand for the positioning map: breadth vs price index."""
    rows = []
    for b in brands:
        own = [p for p in products if p["brand"] == b["id"]]
        idxs = [p["price_index"] for p in own if p.get("price_index")]
        if not own:
            continue
        rows.append({
            "id": b["id"], "name": b["name"], "tier": b["tier"], "role": b["role"],
            "breadth": len({p["category"] for p in own}),
            "index": round(statistics.mean(idxs)) if idxs else None,
            "skus": len(own),
            "uae": b["uae"]["status"],
            "news": b.get("news_count", 0),
        })
    return [r for r in rows if r["index"] is not None]
