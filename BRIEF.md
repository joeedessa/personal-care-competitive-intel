# Brief — competitive intelligence, high-end personal care

This file is the rewritten version of the original request, plus what I changed and why.
Treat it as the spec the repo is built against. If the brief changes, change this file first.

---

## 1. The brief, rewritten

**Objective.** Maintain a continuously refreshed competitive picture of premium and luxury
personal care, soap and home scent, sharp enough to answer three questions:

1. **Where does a new product sit on the price ladder,** and what does the ladder look like
   in the brand's home market, in the US, and on a UAE shelf in AED?
2. **What are these brands actually doing** — launches, collaborations, retail expansion,
   campaigns, sustainability initiatives — and how does that cluster by brand and by theme?
3. **Who is coming up behind them** — brands under five years old that are setting price,
   winning doors, or inventing a mechanic worth copying.

**Categories in scope.** Bar and liquid soap (incl. hand wash and body wash), hand cream,
body lotion, shampoo, conditioner, lip balm and lip care, incense, candles and home
fragrance, premium hair brushes and tools, hair accessories.

**Brand set.** Roughly 85 brands, each tagged with a role so the set stays honest:

| Role | Meaning | Example |
|---|---|---|
| `core_competitor` | Directly competes on the same shelf and the same customer | Diptyque, Aesop, Le Labo |
| `adjacent` | Same customer, different category emphasis | D.S. & Durga, Corpus |
| `benchmark` | Deliberately not premium — included to anchor the bottom of the ladder | Dove, Nivea, Zara Home |
| `regional_incumbent` | Owns the behaviour in the GCC that a newcomer has to displace | Ajmal, Amouage |

**Markets and currency.** Every SKU carries three prices: the brand's **home-market price in
its own currency**, the **US price in USD**, and the **UAE price in AED**. AED is the decision
currency; USD is the comparison currency; home currency shows how much of a brand's price is
geography rather than product.

**Deliverable.** A dashboard, versioned in git, refreshed daily, with three views: price and
range, signals/PR, and an emerging-brand radar. Pricing is curated by hand and versioned;
news is collected automatically.

**Explicitly out of scope for now.** Colour cosmetics, fine fragrance (except where a house
extends into body or home), skincare beyond lip and hand, and any sales or share estimates —
this dashboard describes positioning, not market size.

---

## 2. What I changed from the original request, and why

| Issue in the original | What I did |
|---|---|
| The whole prompt was pasted twice, and several brand lists repeated inside themselves (Oribe ×2, Aesop ×2, Diptyque ×2 in body lotion) | Deduped. "Hand creme" appeared twice with two different lists — merged into one. |
| `Body Soap:` appeared once with no brands under it | Filled: Diptyque, Le Labo, Byredo, Aesop, L'Occitane, Dove, Rituals, plus the Marseille and heritage soap houses. |
| Typos that would break any lookup | incence→**incense**, Diptique→**Diptyque**, "Acqua di palma"→**Acqua di Parma**, creme→**cream**, Loccitane→**L'Occitane** |
| "High end" was never defined, and mass brands sat unlabelled in the same list | Added an explicit `tier` (luxury / premium / masstige / mass) and a `role`. The mass brands stay — they are the floor of the ladder — but they are now labelled as benchmarks rather than competitors. |
| No market or currency stated | Now tri-currency: home, USD, AED. Your answer (UAE vs USD vs home currency) became the core of the pricing model. |
| No refresh cadence, no output format, no success criteria | Daily GitHub Actions refresh; static dashboard on GitHub Pages; each price carries a confidence flag and a source URL slot. |
| Categories implied by the brand list but never named | Added body wash, diffusers, hair styling, lip oil/mask, incense accessories. |
| No structure for "news, initiatives, comms and PR" | Headlines are auto-tagged into seven initiative buckets: sustainability & refill, retail expansion, product launch, collaboration, campaign & PR, corporate & M&A, awards. |
| "Find missing brands" had no criteria | Added an explicit watchlist with a momentum score (1–5) and a threat rating, so the radar forces a ranking instead of accumulating names. |

---

## 3. Brands added that the original list was missing

**Soap & apothecary heritage** — the single biggest gap. The original list had no bar-soap
specialists at all, which is a problem if soap is a core product.
Santa Maria Novella, Officine Universelle Buly 1803, Claus Porto, Compagnie de Provence,
Marius Fabre, Fer à Cheval, Nesti Dante, Dr. Bronner's, Malin+Goetz, Acca Kappa.

**Flamingo Estate** — the most consequential omission. Founded 2020, now pricing candles and
soap at Diptyque parity on pure provenance storytelling. If you are building a premium soap
proposition, this is the brand to study.

**Korean premium** — TAMBURINS and NONFICTION. Both are doing to hand cream what Aesop did to
hand wash: turning a commodity format into an object. TAMBURINS sits in the Gentle Monster
group and applies the same retail-theatre playbook.

**Regional GCC incumbents** — Ajmal, Amouage, The Camel Soap Factory, Sabon. If AED is the
decision currency, the relevant incense comparison is bakhoor and oud, not Astier de Villatte.
Leaving these out would have made the incense ladder read wrong.

**Candle challengers** — Trudon (top of the ladder, absent from the original list), LOEWE Home
Scents, NEST New York, D.S. & Durga, Boy Smells, Otherland, Maison Balzac.

**Body skinification** — Nécessaire, Corpus, Hanni. This is where premium body lotion is losing
share: ingredient-percentage marketing at half the price of scent-led luxury.

**Hair tools and accessories** — the original had La Bonne Brosse and nothing to compare it to.
Added Mason Pearson, Acca Kappa, Kent, Crown Affair, Tangle Teezer (floor), and for accessories
Alexandre de Paris, Emi Jay, Machete, Chunks.

**Haircare gaps** — Christophe Robin, Sachajuan, Act+Acre, K18, Gisou, Crown Affair.

**Lip** — LANEIGE. Its Lip Sleeping Mask created the format and out-sells most of the luxury
set combined; a lip ladder without it is misleading.

**Also added:** Jo Malone London, Acqua di Parma, Molton Brown, Kiehl's, Haeckels, Bamford,
Susanne Kaufmann, Tom Ford Beauty.

---

## 4. Additions I recommend, in priority order

1. **Gift sets and bundles as their own tracked object.** In this category the set, not the
   SKU, is the commercial event — and in the UAE the Ramadan/Eid and Q4 calendars drive a
   disproportionate share of the year. Right now the dashboard prices singles only.
2. **Effective price, not list price.** Bath & Body Works and Rituals essentially never sell at
   list. A `promo_price` field alongside `px` would stop the ladder flattering them.
3. **Refill economics.** Track refill price-per-ml against the primary pack. It is both a
   sustainability claim and a margin decision, and only L'Occitane, Aesop, Susanne Kaufmann and
   Kiehl's are really doing it well.
4. **Retail door tracking.** Which brands are in Ounass, Sephora ME, Bloomingdale's Dubai,
   Level Shoes, THAT Concept Store, Harvey Nichols. Door wins and losses are the earliest
   reliable signal of momentum in this market — earlier than press.
5. **Scent-family mapping.** Oud, amber and rose over-index heavily in the GCC. A scent-family
   field per SKU would let you see which houses have a credible regional proposition.
6. **The hotel and amenity channel.** Molton Brown, Bamford, Acca Kappa and Aesop all build real
   volume here, and it is invisible in retail pricing. Worth a separate view if it matters to you.
7. **Price-change history.** Every refresh is a commit, so a price series is already accumulating
   for free — a "who moved price this quarter" view is a small addition to `build.py`.
8. **Sustainability claim register.** Which brands claim what (refillable, B-Corp, recycled
   content, carbon), and which have been challenged on it. The Body Shop is a live cautionary case.
9. **Founder and creative-director moves.** In this category personnel changes lead strategy
   changes by six to twelve months.

---

## 5. Open questions worth answering next

- **What are you actually building?** The dataset would be sharpened considerably by knowing
  whether this is a new brand, a range extension, or a retail/distribution decision.
- **Which category leads?** Soap and candles are named first everywhere in the original brief.
  If soap is the wedge, the Marseille and apothecary houses matter more than the fashion houses.
- **Which UAE channel are you targeting** — own boutique, Ounass, Sephora ME, department store,
  or hospitality? Price architecture differs by 20–40% between them.
- **Is Saudi Arabia in scope?** It is the larger GCC market and behaves differently on price.
- **Do you need European or UK pricing** as a fourth column, or is home-market enough?

---

## 6. Honest limits of what is here

The **structure** is complete and the **news collection is real** — 379 signals across 63 brands
on first run, refreshed daily.

The **prices are seeded estimates**, and they are labelled as such throughout: every record
carries `conf: "est"` and the dashboard reports a verified percentage on the front page. They
are close enough to reason about the shape of a ladder and wrong enough that you must not put
them in a deck. Verifying them is manual work — brand storefront, note the price, set
`conf: "ver"` and record the `src` URL. Start with the ~30 hero SKUs and the ladder becomes
quotable.

Likewise, brand metadata flagged `needs_review: true` was seeded from model knowledge rather
than a source. Ownership in this sector changes hands often; confirm before citing.
