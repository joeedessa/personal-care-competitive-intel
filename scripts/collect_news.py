#!/usr/bin/env python3
"""Collect brand news, PR and initiative signals into data/generated/news.json.

Sources, in order of value:
  1. Per-brand Google News RSS (generated from brands.json - no per-brand config)
  2. Regional (UAE) Google News RSS for core competitors and regional incumbents
  3. Trade press RSS feeds (data/feeds.json)
  4. Topic queries (category-level themes)

Every item is auto-tagged into initiative buckets using keyword rules in
data/feeds.json, and deduped by normalised title. Results accumulate: existing
items are kept so the timeline builds history across runs.
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote_plus

import feedparser
import requests

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "data" / "generated"
OUT = GEN / "news.json"

BRANDS = json.loads((ROOT / "data" / "brands.json").read_text())["brands"]
FEEDS = json.loads((ROOT / "data" / "feeds.json").read_text())

UA = {"User-Agent": "personal-care-competitive-intel/1.0 (+https://github.com/joeedessa)"}
MAX_PER_SOURCE = 12
REQUEST_PAUSE = 0.7  # be polite to Google News


def norm_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def parse_feed(url: str):
    try:
        resp = requests.get(url, headers=UA, timeout=25)
        resp.raise_for_status()
        return feedparser.parse(resp.content)
    except Exception as exc:  # noqa: BLE001
        print(f"[news]   ! {url[:90]} -> {exc}", file=sys.stderr)
        return None


def entry_date(entry) -> str | None:
    for key in ("published_parsed", "updated_parsed"):
        st = getattr(entry, key, None)
        if st:
            return datetime(*st[:6], tzinfo=timezone.utc).date().isoformat()
    return None


def tag_initiatives(text: str) -> list[str]:
    low = text.lower()
    tags = []
    for bucket, words in FEEDS["initiative_keywords"].items():
        if bucket.startswith("_"):
            continue
        if any(w.lower() in low for w in words):
            tags.append(bucket)
    return tags


def clean_source(entry, fallback: str) -> str:
    src = getattr(entry, "source", None)
    if src is not None and getattr(src, "title", None):
        return src.title
    return fallback


def collect() -> list[dict]:
    gn = FEEDS["google_news"]
    cutoff = (datetime.now(timezone.utc) - timedelta(days=gn.get("lookback_days", 90))).date().isoformat()
    items: list[dict] = []

    def harvest(url, brand_id, source_label, region, scope):
        feed = parse_feed(url)
        if not feed:
            return
        for entry in feed.entries[:MAX_PER_SOURCE]:
            title = getattr(entry, "title", "").strip()
            if not title:
                continue
            published = entry_date(entry)
            if published and published < cutoff:
                continue
            summary = re.sub(r"<[^>]+>", " ", getattr(entry, "summary", "") or "")[:400]
            items.append(
                {
                    "title": title,
                    "url": getattr(entry, "link", ""),
                    "published": published,
                    "brand": brand_id,
                    "source": clean_source(entry, source_label),
                    "region": region,
                    "scope": scope,
                    "summary": summary.strip(),
                    "tags": tag_initiatives(f"{title} {summary}"),
                }
            )

    if gn.get("enabled"):
        regional_roles = set(gn.get("poll_regional_for_roles", []))
        for b in BRANDS:
            query = f'"{b["name"]}" {gn.get("query_suffix", "")}'.strip()
            print(f"[news] brand: {b['name']}")
            harvest(gn["template"].format(query=quote_plus(query)), b["id"], "Google News", "global", "brand")
            time.sleep(REQUEST_PAUSE)
            if b.get("role") in regional_roles:
                harvest(
                    gn["regional_template"].format(query=quote_plus(f'"{b["name"]}" (UAE OR Dubai OR GCC)')),
                    b["id"],
                    "Google News AE",
                    "uae",
                    "brand",
                )
                time.sleep(REQUEST_PAUSE)

    for f in FEEDS["trade_feeds"]:
        print(f"[news] trade: {f['name']}")
        harvest(f["url"], None, f["name"], "global", "trade")

    for t in FEEDS["topic_feeds"]:
        print(f"[news] topic: {t['name']}")
        harvest(
            gn["template"].format(query=quote_plus(t["query"])),
            None,
            "Google News",
            "uae" if "uae" in t["id"] else "global",
            "topic",
        )
        time.sleep(REQUEST_PAUSE)

    return items


def main() -> int:
    GEN.mkdir(parents=True, exist_ok=True)
    existing = []
    if OUT.exists():
        try:
            existing = json.loads(OUT.read_text()).get("items", [])
        except Exception:  # noqa: BLE001
            existing = []

    fresh = collect()
    merged: dict[str, dict] = {}
    for item in existing + fresh:
        key = f"{item.get('brand') or '~'}|{norm_title(item.get('title', ''))}"
        # Later (fresher) entries win, but keep the earliest known publish date.
        if key in merged and merged[key].get("published") and item.get("published"):
            item["published"] = min(merged[key]["published"], item["published"])
        merged[key] = item

    # Re-tag everything each run so edits to initiative_keywords apply to history too.
    for item in merged.values():
        item["tags"] = tag_initiatives(f"{item.get('title', '')} {item.get('summary', '')}")

    items = sorted(
        merged.values(),
        key=lambda i: (i.get("published") or "0000-00-00"),
        reverse=True,
    )

    OUT.write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "count": len(items),
                "items": items,
            },
            indent=2,
        )
    )
    print(f"[news] {len(fresh)} fetched, {len(items)} total -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
