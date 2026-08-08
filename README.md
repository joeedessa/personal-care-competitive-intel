# Personal care competitive intelligence

A versioned, self-refreshing dashboard tracking premium and luxury personal care, soap and
home scent across price, range, comms and emerging competition — priced in the brand's home
currency, in USD, and in AED for the UAE market.

See [BRIEF.md](BRIEF.md) for the spec this is built against, what changed from the original
request, and the recommended next additions.

## What it shows

| Tab | Answers |
|---|---|
| **Overview** | The findings, computed not written. Same-tier price gaps, pack-size illusions, geography premiums, white space, UAE exposure, entry price floors — ranked, each clickable through to its evidence |
| **Price & range** | Where every SKU sits on the ladder — in two views (below); how much premium each category tolerates; what a UAE shelf price should be and which SKUs still need verifying; which brands play in which categories |
| **Positioning** | The competitive map: range breadth against price index, dot size by SKU count, coloured by tier. Click any brand to open its profile |
| **Head to head** | Two or three brands side by side — the like-for-like price gap in every category they both compete in, and the range each one is missing |
| **News** | Every headline collected, grouped by week with sticky headers, filterable by brand, region and initiative type |
| **PR & initiatives** | What brands are *doing*, auto-tagged into seven buckets; share of voice; coverage over time; share-of-voice momentum; a brand × initiative matrix |
| **Emerging radar** | Brands under ~5 years old that are setting price or winning doors, ranked by momentum and threat — plus **What the challengers are doing**: the comms feed restricted to independent and founder-led brands, grouped by brand |
| **Brand directory** | All ~85 brands with tier, owner, UAE channel presence, SKU coverage and average price index |

Brand names are clickable anywhere they appear and open a **profile drawer** — identity,
ownership, UAE channels, full range with per-category price index, and recent coverage.

Every view is a URL. Tab, filters, price view and the current comparison are encoded in the
hash, so a specific finding can be sent to someone:
`…/#tab=compare&cmp=aesop,grown-alchemist`

### Two price views

- **Like for like** — everything rebased to a common basis (per 100 ml/g, per stick, per unit) so
  pack size cannot flatter anyone. Answers *who is expensive?*
- **As sold** — the actual price of the actual pack at the size the brand chose to sell it in.
  Answers *what does the customer hand over?*

They disagree, and the disagreement is the point: Aesop's 500 ml hand wash and Diptyque's 250 ml
both sit at $45 as sold — like-for-like shows Diptyque is twice the price per millilitre.

The header carries an **Auto / Light / Dark** theme switch; the choice persists.

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
against FX parity plus the tier uplift in `data/fx.json`. Until then the UAE card shows a
**verification queue**: the hero SKUs with no observed price, ranked by expected AED value, so
you always know which one to check next. Brands that price in AED natively (Ajmal, The Camel
Soap Factory) are excluded from the gap — for them the comparison is circular.

## Design system

Warm ivory / ink surfaces, a Didot-class display serif for headings and figures, and a
single-hue **bronze ordinal ramp** for brand tier (mass → luxury). Lightness carries the order,
which is what makes the ramp safe for colour-vision deficiency without relying on hue.

Colours are not chosen by eye. `scripts/check_palette.py` validates, per mode: monotonic
lightness across the ramp, ≥8 OKLab ΔE between adjacent steps, ≥2:1 contrast for the step
nearest the surface, ≥3:1 for every mark, ≥90° hue separation between the diverging poles, and
WCAG contrast on all three text roles. **Run it before changing any colour** — `make check`
does, and it exits non-zero on failure.

## The analysis layer

`scripts/analysis.py` turns the merged dataset into ranked findings. Nothing is hand-written —
edit a price and the findings change. Three things are deliberate:

- **Comparability guards.** A same-tier gap is only claimed between SKUs of the same format
  within 4× on size. Without that, a 30-stick gift box "competed with" a 450-stick bulk pack
  and produced a true number attached to a false claim.
- **Editorial magnitude.** Ranking uses a base priority per finding type plus a bounded
  extremity bonus, so a raw index of 464 cannot swamp the board and push a static stat above an
  actionable competitive fact.
- **Share-based momentum.** News search returns much denser coverage for recent weeks, so raw
  30-day counts make everything look like it is accelerating. Momentum is each brand's *share*
  of its period's coverage. Brands with no prior baseline are reported as "newly appearing"
  rather than as risers, because a young archive cannot tell new activity from a previously
  missed brand.

## Sentiment — what is and is not here

The dashboard reports **press tone**: how trade and consumer press write about a brand, read
from headline wording with a keyword lexicon (`TONE_POS` / `TONE_NEG` in `scripts/analysis.py`).
Brands under eight headlines are marked unreliable and greyed out, because at that sample size
the score is noise.

**It is not consumer sentiment, and it is labelled that way everywhere it appears.** It cannot
read sarcasm, it weights a Vogue headline the same as an SEO listicle, and it scores "brand cuts
prices" as negative when that may be deliberate strategy.

Real user sentiment is a separate pipeline, not a field derivable from a news feed. It would
need retailer review corpora (Sephora, Ulta, Boots, Ounass), Trustpilot, Reddit and app-store
reviews — each with its own access terms — plus a model doing aspect-level classification
(scent, longevity, packaging, value) rather than a bag of words. That is a real build and it is
deliberately not faked here.

## Following a PR moment to the source

Every headline links out. Three routes into the evidence:

- **News tab** — the full feed, grouped by week, filterable by brand, region and initiative type.
- **Initiative matrix** (PR tab) — click any filled cell to jump to the headlines behind that
  brand-and-initiative combination.
- **Brand profile** — open any brand name; the drawer lists its PR moments grouped by initiative
  with links, its press tone, and its full coverage.

## The challenger lens

Every brand is classified `independent` or `corporate` (derived in `build.py` from the owner
against a list of strategic groups — PE-backed founder brands count as independent, because the
question the lens answers is *who moves without a group board*). An **Ownership** filter in the
filter row applies the cut everywhere: news, PR charts, initiative matrix, tone, pricing,
positioning and the directory. A `challenger` flag (independent + premium/luxury + competing +
founded ≥ 2000 or on the watchlist) drives the radar tab's comms feed.

Watchlist-only brands (Cyklar, Ffern, Vyrao, Hanni, Xinu, Fugazzi and others) are now harvested
by the news collector via per-entry `news_query` overrides in `watchlist.json` — previously only
brands with priced SKUs got coverage, which meant the emerging set was invisible in comms.

An `experiential` initiative bucket (pop-ups, activations, installations, residencies,
takeovers) separates activation activity from plain retail expansion.

Sources include **BeautyMatter** (no RSS of its own — harvested via a Google News `site:` query)
and **RetailBoss** (native RSS; covers all retail, so it is screened with the allowlist to keep
sneaker drops out).

## Keeping the feed clean

News search matches loosely, so a query for "Machete" returned machete attacks and one for "HEM"
returned Indian politics. Three defences, in order:

1. **Query overrides** — brands whose names are ordinary English words carry a `news_query` in
   `brands.json` (Method, Dove, Chunks, Machete, HEM, Aesop and others).
2. **Scope-appropriate screening** — trade feeds are edited by beauty publications and are not
   screened; brand queries use a blocklist (an allowlist there discarded real stories); topic
   queries use the keyword allowlist.
3. **History is re-screened every run**, so tightening a rule purges what earlier runs let in.

The grocery/FMCG feed that produced a Coca-Cola headline has been retired and is parked in
`trade_feeds_broken` with the reason.

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
