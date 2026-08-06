# Personal care competitive intelligence

A versioned, self-refreshing dashboard tracking premium and luxury personal care, soap and
home scent across price, range, comms and emerging competition — priced in the brand's home
currency, in USD, and in AED for the UAE market.

See [BRIEF.md](BRIEF.md) for the spec this is built against, what changed from the original
request, and the recommended next additions.

## What it shows

| Tab | Answers |
|---|---|
| **Price & range** | Where every SKU sits on a normalised price ladder; how wide each category's spread is; where UAE shelf prices diverge from FX parity; which brands play in which categories (and where the white space is) |
| **Signals, PR & comms** | What brands are doing, auto-tagged into initiative buckets; share of voice; a filterable timeline |
| **Emerging radar** | Brands under ~5 years old that are setting price or winning doors, ranked by momentum and threat |
| **Brand directory** | All ~85 brands with tier, owner, UAE channel presence, SKU coverage and average price index |

## How the data gets in

**Hybrid, on purpose.** News is automated because it is public and structured. Pricing is
curated because scraping luxury e-commerce is brittle, usually against the site's terms, and
produces silently wrong numbers when it breaks.

```
data/brands.json          brand master — tier, role, owner, UAE presence      (hand-curated)
data/products/*.json      SKUs and prices, one file per category              (hand-curated)
data/watchlist.json       emerging-brand radar                                (hand-curated)
data/feeds.json           news sources + initiative tagging rules             (config)
data/fx.json              FX fallback + UAE uplift model                      (config)
        |
        v
scripts/fetch_fx.py       live ECB rates  -> data/generated/fx_live.json
scripts/collect_news.py   RSS + Google News -> data/generated/news.json
scripts/build.py          merge + derive  -> docs/data.js, docs/data.json
        |
        v
docs/                     static dashboard (GitHub Pages)
```

## Run it locally

```bash
pip install -r requirements.txt && make refresh && make serve
```

`make refresh` runs FX → news → build (news takes ~4 minutes; it is polite to Google News).
`make build` alone is instant and is all you need after editing prices.
`docs/data.js` means `docs/index.html` also opens directly from disk with no server.

## Add or correct a price

Every price ships as a labelled estimate. To make one quotable:

```jsonc
{ "id": "aesop-resurrection-hand-wash-500", "brand": "aesop",
  "name": "Resurrection Aromatique Hand Wash",
  "size": 500, "unit": "ml",
  "px": { "home": 68, "usd": 45, "aed": 185 },   // aed = OBSERVED shelf price
  "conf": "ver",                                  // "ver" once sourced, else "est"
  "src": "https://www.aesop.com/uk/p/..." }
```

Then `make build`. Filling `px.aed` with a real observed price is the highest-value edit you
can make — it turns on the UAE price-gap chart, which compares what the shelf actually charges
against FX parity plus the tier uplift in `data/fx.json`.

## Derived metrics

- **`norm_usd`** — price on a comparable basis (per 100 ml/g, per stick, or per unit), so a
  500 ml Aesop wash can be read against a 250 ml Diptyque.
- **`price_index`** — that SKU against its category median (100 = median).
- **`price_aed_expected`** — US price × 3.6725 × tier uplift (VAT + import/distributor margin).
- **`aed_gap_pct`** — observed UAE price vs that expectation. Large positive = pricing power or
  grey-market exposure. Negative = buying share.
- **`us_vs_home_pct`** — how much of a brand's price is geography rather than product.

## Push to GitHub

Not pushed yet — build locally first was the chosen path. When ready:

```bash
gh repo create personal-care-competitive-intel --private --source=. --push
```

Then in the repo: **Settings → Pages → Source: GitHub Actions**. `.github/workflows/refresh.yml`
rebuilds daily at 05:00 UTC (09:00 Gulf), commits refreshed data, and deploys. Note that Pages
on a **private** repo needs GitHub Pro or Team; on the free plan either make the repo public or
drop the `deploy` job and read `docs/index.html` locally.

## Data confidence — read this before quoting anything

- Prices marked **estimate** are seeded for structure. Right shape, wrong decimals.
- Prices marked **verified** carry a `src` URL and a real observed figure.
- Brands flagged **review** have metadata seeded from model knowledge, not a source. Ownership
  in this sector changes hands often.
- News is collected automatically and deduped by title. Volume is not sentiment — it shows who
  is generating coverage, not who is winning.
- Two feeds are known-dead and parked in `trade_feeds_broken` in `data/feeds.json` (Happi blocks
  non-browser clients; William Reed retired the CosmeticsDesign feeds).
