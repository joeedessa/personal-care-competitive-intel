#!/usr/bin/env python3
"""Merge the curated data layer + collected signals into the dashboard payload.

Reads   data/brands.json, data/products/*.json, data/watchlist.json,
        data/fx.json (or data/generated/fx_live.json), data/generated/news.json
Writes  docs/data.js   (window.__CI_DATA__ = {...} - works over file:// too)
        docs/data.json (same payload, for anything that wants to consume it)

Derived pricing logic
---------------------
norm_usd      price normalised to a comparable basis (per 100ml/100g, per stick,
              or per unit) so a 500ml Aesop wash can be compared to a 250ml Diptyque.
aed_expected  what the UAE shelf price *should* be at FX parity plus the tier
              uplift in data/fx.json (VAT + import/distributor margin).
aed_gap_pct   observed UAE price vs that expectation. This is the headline
              number: a large positive gap means pricing power (or a grey-market
              exposure); a negative gap means the brand is buying share.
us_vs_home    US price vs home-market price, converted. Shows how much of a
              brand's price is geography rather than product.
"""
from __future__ import annotations

import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analysis import (build_findings, build_positioning, weekly_activity,  # noqa: E402
                      brand_momentum, momentum_finding, press_tone, tone_of)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
GEN = DATA / "generated"
DOCS = ROOT / "docs"

PER_100_UNITS = {"ml", "g"}
PER_ITEM_UNITS = {"unit", "sticks", "pack"}


def load(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def strip_comments(obj):
    if isinstance(obj, dict):
        return {k: strip_comments(v) for k, v in obj.items() if not k.startswith("_")}
    if isinstance(obj, list):
        return [strip_comments(v) for v in obj]
    return obj


def basis_for(unit: str) -> tuple[str, str]:
    if unit in PER_100_UNITS:
        return f"per 100{unit}", "per_100"
    if unit == "sticks":
        return "per stick", "per_item"
    if unit == "pack":
        return "per item", "per_item"
    return "per unit", "per_unit"


def normalise(price, size, unit):
    if price is None or size in (None, 0):
        return None
    if unit in PER_100_UNITS:
        return round(price / size * 100, 2)
    if unit in {"sticks", "pack"}:
        return round(price / size, 2)
    return round(price, 2)


def main() -> int:
    brands_raw = load(DATA / "brands.json")["brands"]
    brands = {b["id"]: b for b in brands_raw}

    fx_live = load(GEN / "fx_live.json")
    fx_static = load(DATA / "fx.json")
    rates = (fx_live or fx_static)["rates"]
    fx_meta = {
        "as_of": (fx_live or fx_static).get("as_of"),
        "source": (fx_live or {}).get("source", "fallback (data/fx.json)"),
    }
    uae_cfg = fx_static["uae_market"]
    uplift = uae_cfg["uplift_by_tier"]
    aed_rate = rates.get("AED", 3.6725)

    categories: list[dict] = []
    products: list[dict] = []
    unknown_brands: set[str] = set()

    for path in sorted((DATA / "products").glob("*.json")):
        blob = load(path)
        cat_id, cat_label = blob["category"], blob["label"]
        categories.append({"id": cat_id, "label": cat_label})

        for p in blob["products"]:
            brand = brands.get(p["brand"])
            if brand is None:
                unknown_brands.add(p["brand"])
                continue

            px = p.get("px", {})
            usd, home, aed_obs = px.get("usd"), px.get("home"), px.get("aed")
            home_cur = brand["currency"]
            home_rate = rates.get(home_cur)
            home_usd = round(home / home_rate, 2) if (home is not None and home_rate) else None

            tier_uplift = uplift.get(brand["tier"], 0.15)
            aed_parity = round(usd * aed_rate, 2) if usd is not None else None
            aed_exp = round(aed_parity * (1 + tier_uplift), 2) if aed_parity is not None else None
            # A gap only means something for an imported brand. For an AED-native
            # brand (Ajmal, The Camel Soap Factory) the "observed vs FX parity"
            # comparison is circular - its home price IS the UAE price.
            aed_native = home_cur == "AED"
            aed_gap = (
                round((aed_obs - aed_exp) / aed_exp * 100, 1)
                if (aed_obs is not None and aed_exp and not aed_native) else None
            )
            us_vs_home = (
                round((usd - home_usd) / home_usd * 100, 1)
                if (usd is not None and home_usd) else None
            )

            basis_label, basis_kind = basis_for(p["unit"])
            record = {
                **{k: v for k, v in p.items() if k != "px"},
                "category": cat_id,
                "category_label": cat_label,
                "brand_name": brand["name"],
                "brand_tier": brand["tier"],
                "brand_role": brand["role"],
                "brand_country": brand["country"],
                "brand_owner": brand["owner"],
                "home_currency": home_cur,
                "price_home": home,
                "price_home_usd": home_usd,
                "price_usd": usd,
                "price_aed_observed": aed_obs,
                "price_aed_parity": aed_parity,
                "price_aed_expected": aed_exp,
                "aed_gap_pct": aed_gap,
                "aed_native": aed_native,
                "aed_uplift_pct": round(tier_uplift * 100),
                "us_vs_home_pct": us_vs_home,
                "basis_label": basis_label,
                "basis_kind": basis_kind,
                "norm_usd": normalise(usd, p["size"], p["unit"]),
                "norm_aed_expected": normalise(aed_exp, p["size"], p["unit"]),
                "verified": p.get("conf") == "ver",
            }
            products.append(record)

    # A category can hold more than one measurement basis - incense has per-stick
    # sticks AND per-unit ceramic holders; hair accessories has clips AND hair mist.
    # Comparing across bases produces nonsense (a $165 holder "2357x" a HEM stick),
    # so each category is scored on its MODAL basis only. Off-basis SKUs keep their
    # prices and stay in the table, but carry no index and never enter the ladder.
    for cat in categories:
        in_cat = [p for p in products if p["category"] == cat["id"]]
        bases = [p["basis_kind"] for p in in_cat]
        modal = statistics.mode(bases) if bases else None
        cat["basis_kind"] = modal
        cat["basis_label"] = next((p["basis_label"] for p in in_cat if p["basis_kind"] == modal), None)

        # off_basis: measured differently. off_ladder: measured the same way but a
        # different product format (a 75ml diffuser is not a 190g candle) - set by
        # hand in the data file.
        for p in in_cat:
            p["off_basis"] = p["basis_kind"] != modal or bool(p.get("off_ladder"))

        vals = [p["norm_usd"] for p in in_cat if p["norm_usd"] and not p["off_basis"]]
        median = statistics.median(vals) if vals else None
        cat["median_norm_usd"] = round(median, 2) if median else None
        cat["sku_count"] = len(in_cat)
        cat["comparable_count"] = len(vals)
        cat["off_basis_count"] = sum(1 for p in in_cat if p["off_basis"])
        cat["brand_count"] = len({p["brand"] for p in in_cat})
        cat["min_norm_usd"] = round(min(vals), 2) if vals else None
        cat["max_norm_usd"] = round(max(vals), 2) if vals else None
        cat["spread_multiple"] = round(max(vals) / min(vals), 1) if vals and min(vals) else None
        for p in in_cat:
            p["price_index"] = (
                round(p["norm_usd"] / median * 100)
                if (p["norm_usd"] and median and not p["off_basis"]) else None
            )

    news_blob = load(GEN / "news.json", {"items": [], "generated_at": None})
    news = news_blob.get("items", [])
    for item in news:
        bid = item.get("brand")
        item["brand_name"] = brands[bid]["name"] if bid in brands else None
        item["tone"] = tone_of(f"{item.get('title', '')} {item.get('summary', '')}")

    # Brand rollup
    brand_rows = []
    for b in brands_raw:
        own = [p for p in products if p["brand"] == b["id"]]
        norms = [p["norm_usd"] for p in own if p["norm_usd"]]
        idxs = [p["price_index"] for p in own if p.get("price_index")]
        b_news = [n for n in news if n.get("brand") == b["id"]]
        brand_rows.append(
            {
                **b,
                "sku_count": len(own),
                "categories_tracked": sorted({p["category"] for p in own}),
                "median_norm_usd": round(statistics.median(norms), 2) if norms else None,
                "avg_price_index": round(statistics.mean(idxs)) if idxs else None,
                "news_count": len(b_news),
                "latest_news": b_news[0] if b_news else None,
            }
        )

    tag_counts: dict[str, int] = {}
    for n in news:
        for t in n.get("tags", []):
            tag_counts[t] = tag_counts.get(t, 0) + 1

    tag_labels = {
        "sustainability": "Sustainability & refill", "retail_expansion": "Retail expansion",
        "product_launch": "Product launch", "collaboration": "Collaboration",
        "campaign_pr": "Campaign & PR", "corporate": "Corporate & M&A", "awards_press": "Awards & press",
    }
    momentum = brand_momentum(news, brand_rows, datetime.now(timezone.utc).date())
    findings = build_findings(products, brand_rows, categories, news, tag_labels)
    findings += momentum_finding(momentum)
    findings.sort(key=lambda f: f["magnitude"], reverse=True)
    for i, f in enumerate(findings):
        f["rank"] = i + 1
    positioning = build_positioning(products, brand_rows)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "findings": findings,
        "positioning": positioning,
        "momentum": momentum,
        "weekly": weekly_activity(news),
        "tone": press_tone(news, brand_rows),
        "fx": {"rates": rates, **fx_meta, "uae": strip_comments(uae_cfg)},
        "brands": brand_rows,
        "categories": sorted(categories, key=lambda c: c["label"]),
        "products": products,
        "watchlist": load(DATA / "watchlist.json", {"watchlist": []})["watchlist"],
        "news": news,
        "news_generated_at": news_blob.get("generated_at"),
        "tag_counts": tag_counts,
        "stats": {
            "brands": len(brand_rows),
            "skus": len(products),
            "categories": len(categories),
            "verified_prices": sum(1 for p in products if p["verified"]),
            "verified_pct": round(
                sum(1 for p in products if p["verified"]) / len(products) * 100
            ) if products else 0,
            "aed_observed": sum(1 for p in products if p["price_aed_observed"] is not None),
            "news_items": len(news),
            "watchlist": len(load(DATA / "watchlist.json", {"watchlist": []})["watchlist"]),
        },
    }

    DOCS.mkdir(parents=True, exist_ok=True)
    (DOCS / "data.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    (DOCS / "data.js").write_text(
        "window.__CI_DATA__ = " + json.dumps(payload, ensure_ascii=False) + ";\n"
    )

    if unknown_brands:
        print(f"[build] ! product records point at unknown brand ids: {sorted(unknown_brands)}")
    s = payload["stats"]
    print(
        f"[build] {s['brands']} brands, {s['skus']} SKUs across {s['categories']} categories, "
        f"{s['news_items']} news items, {s['verified_pct']}% prices verified "
        f"({s['aed_observed']} with an observed AED price)"
    )
    print(f"[build] wrote docs/data.js and docs/data.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
