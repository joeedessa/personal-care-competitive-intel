#!/usr/bin/env python3
"""Fetch live FX rates into data/generated/fx_live.json.

Uses frankfurter.app (ECB data, no API key). AED is pegged to USD and is not
published by the ECB feed, so it is always taken from the static peg.
Failure is non-fatal: build.py falls back to data/fx.json.
"""
import json
import sys
from datetime import date, timezone, datetime
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "generated" / "fx_live.json"
FALLBACK = json.loads((ROOT / "data" / "fx.json").read_text())

AED_PEG = 3.6725
WANTED = ["EUR", "GBP", "AUD", "SEK", "JPY", "KRW", "INR", "CHF", "CAD", "ILS", "BRL"]


def main() -> int:
    rates = {"USD": 1.0, "AED": AED_PEG}
    try:
        r = requests.get(
            "https://api.frankfurter.app/latest",
            params={"from": "USD", "to": ",".join(WANTED)},
            timeout=20,
        )
        r.raise_for_status()
        payload = r.json()
        rates.update({k: float(v) for k, v in payload.get("rates", {}).items()})
        as_of = payload.get("date", str(date.today()))
        source = "frankfurter.app (ECB)"
    except Exception as exc:  # noqa: BLE001 - non-fatal by design
        print(f"[fx] live fetch failed ({exc}); keeping fallback table", file=sys.stderr)
        rates = dict(FALLBACK["rates"])
        as_of = FALLBACK["as_of"]
        source = "fallback (data/fx.json)"

    # OMR is pegged and not in the ECB feed either.
    rates.setdefault("OMR", FALLBACK["rates"].get("OMR", 0.385))
    for cur, val in FALLBACK["rates"].items():
        rates.setdefault(cur, val)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "base": "USD",
                "as_of": as_of,
                "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "source": source,
                "rates": rates,
            },
            indent=2,
        )
    )
    print(f"[fx] wrote {OUT.relative_to(ROOT)} ({source}, as_of={as_of})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
