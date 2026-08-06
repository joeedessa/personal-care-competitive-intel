# Data schema

Everything under `data/` except `data/generated/` is hand-maintained. Keys beginning with `_`
are comments and are stripped by the builder. Run `make check` before committing.

## `brands.json`

| Field | Type | Notes |
|---|---|---|
| `id` | string | kebab-case, stable — product records reference it |
| `name` | string | as the brand writes it |
| `country` / `currency` | ISO-2 / ISO-4217 | `currency` is the **home** currency; `px.home` is denominated in it |
| `founded` | int / null | |
| `owner` | string | parent group or "Independent" |
| `tier` | `luxury` \| `premium` \| `masstige` \| `mass` | ordinal — drives the ladder colour ramp and the UAE uplift |
| `role` | `core_competitor` \| `adjacent` \| `benchmark` \| `regional_incumbent` | keeps the set honest; benchmarks are deliberately not premium |
| `categories` | string[] | what the brand *sells* (may exceed what is priced here) |
| `positioning` | string | one line, the competitive read — not marketing copy |
| `uae.status` | `boutique` \| `retail` \| `distributor` \| `ecom_only` \| `none` \| `unknown` | |
| `uae.channels` | string[] | named doors |
| `site` / `press` / `instagram` | string / null | |
| `needs_review` | bool | true = seeded from model knowledge, unconfirmed |

## `products/*.json`

One file per category. `category` and `label` at the top; `products[]` below.

| Field | Type | Notes |
|---|---|---|
| `id` | string | unique across all files |
| `brand` | string | must match a `brands.json` id — the builder warns on orphans |
| `name` | string | |
| `subtype` | string | free text, e.g. `bar`, `liquid_hand_wash`, `refill`, `lip_oil` |
| `size` / `unit` | number / `ml`\|`g`\|`sticks`\|`unit`\|`pack` | drives normalisation |
| `hero` | bool | the SKU that defines the brand in this category |
| `px.home` | number / null | in the brand's home currency |
| `px.usd` | number / null | US market price |
| `px.aed` | number / null | **observed** UAE shelf price. Leave null and the builder derives an expectation instead |
| `off_ladder` | bool (optional) | Same measurement basis but a different product format — a 75 ml diffuser is not a 190 g candle. Keeps it out of the like-for-like ladder and out of the category median; it still appears in the "as sold" view and the table |
| `conf` | `est` \| `ver` | `ver` requires `src` |
| `src` | url / null | where the price was read |
| `notes` | string / null | the competitive point, not a description |

### Normalisation basis

| `unit` | Basis | Example |
|---|---|---|
| `ml`, `g` | per 100 | 500 ml at $45 → $9.00 / 100 ml |
| `sticks`, `pack` | per item | 125 sticks at €55 → per stick |
| `unit` | as-is | a hairbrush is a hairbrush |

## `watchlist.json`

`momentum` 1–5 (5 = scaling hardest right now) and `threat` high/medium/low are deliberate
judgement calls, not measurements. They exist to force a ranking. Revise them when the signals
change; a watchlist nobody re-scores is just a list.

## `fx.json`

`rates` are units per 1 USD and act as the fallback when `scripts/fetch_fx.py` cannot reach
frankfurter.app. AED (3.6725) and OMR are pegged and never come from the live feed.

`uae_market.uplift_by_tier` is the model for what a UAE shelf price *should* be:

```
expected AED = USD price × 3.6725 × (1 + uplift[tier])
```

Uplift covers 5% VAT plus importer and distributor margin. Tune it once you have verified real
Ounass / Sephora ME / Bloomingdale's prices — the gap between derived and observed is the most
decision-useful number this repo produces.

## `feeds.json`

Per-brand coverage is generated automatically from `brands.json` via Google News RSS, so there
is no per-brand feed to maintain. `trade_feeds` are polled directly; `trade_feeds_broken` is a
parking lot for feeds that have died, kept so nobody re-adds them.

`initiative_keywords` maps keywords to the seven initiative buckets shown on the Signals tab.
Tags are recomputed for the entire history on every run, so editing these rules retroactively
re-tags everything.

## `generated/`

Machine-written; safe to delete and regenerate.

| File | Written by |
|---|---|
| `fx_live.json` | `scripts/fetch_fx.py` |
| `news.json` | `scripts/collect_news.py` (accumulates — history builds across runs) |
| `../docs/data.js`, `../docs/data.json` | `scripts/build.py` |
