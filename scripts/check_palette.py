#!/usr/bin/env python3
"""Validate the dashboard palette. Run this before changing any colour.

Checks, per mode:
  1. Ordinal ramps are monotonic in OKLCH lightness (so magnitude reads without hue).
  2. The ramp step nearest the chart surface clears 2:1 contrast.
  3. Every mark colour clears 3:1 against its own surface (or is reported as
     relief-rule: needs a visible label / table view).
  4. The diverging pair's two poles are far apart in OKLCH hue (they must read as
     opposite, not as two shades of the same thing).
  5. Adjacent ordinal steps are separated by at least 8 (OKLab dE x100).

A single-hue ordinal ramp is inherently safe for colour-vision deficiency —
lightness carries the order — which is why this is a lightness/contrast check
rather than the CVD pair sweep a categorical palette would need.
"""
from __future__ import annotations

import math
import sys

# --- colour maths -----------------------------------------------------------

def hex_to_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(h: str) -> float:
    r, g, b = (srgb_to_linear(c) for c in hex_to_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def oklab(h: str) -> tuple[float, float, float]:
    r, g, b = (srgb_to_linear(c) for c in hex_to_rgb(h))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (v ** (1 / 3) if v > 0 else -((-v) ** (1 / 3)) for v in (l, m, s))
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


def oklch(h: str) -> tuple[float, float, float]:
    L, a, b = oklab(h)
    return L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360


def delta_e(x: str, y: str) -> float:
    a, b = oklab(x), oklab(y)
    return math.dist(a, b) * 100


# --- the palette under test -------------------------------------------------

PALETTE = {
    "light": {
        "surface": "#FBF9F6",
        "page": "#F3F0EA",
        "ink": "#1A1815",
        "ink_secondary": "#5C564D",
        "ink_muted": "#8C857A",
        "tier_ramp": ["#C9AE85", "#AC8B55", "#846130", "#4F3818"],  # mass -> luxury
        "accent": "#96703F",
        "div_low": "#2F6F6A",
        "div_high": "#A63D2F",
        "status": {"good": "#4E7A46", "warning": "#B8862B", "serious": "#B3653A", "critical": "#A63D2F"},
    },
    "dark": {
        "surface": "#191714",
        "page": "#0F0E0C",
        "ink": "#F5F1EA",
        "ink_secondary": "#B8B0A3",
        "ink_muted": "#8C857A",
        "tier_ramp": ["#6B5230", "#8F6F44", "#BB9457", "#E3C89A"],  # mass -> luxury
        "accent": "#BB9457",
        "div_low": "#4C9A93",
        "div_high": "#C9614F",
        "status": {"good": "#6FA463", "warning": "#D6A03C", "serious": "#CE7A4E", "critical": "#C9614F"},
    },
}

TIER_NAMES = ["mass", "masstige", "premium", "luxury"]


def check(mode: str) -> list[str]:
    p = PALETTE[mode]
    surf = p["surface"]
    fails: list[str] = []
    print(f"\n=== {mode.upper()} (surface {surf}) ===")

    # 1 + 5. ordinal ramp: monotonic lightness, adequate step separation
    ls = [oklch(c)[0] for c in p["tier_ramp"]]
    ordered = all(x > y for x, y in zip(ls, ls[1:])) or all(x < y for x, y in zip(ls, ls[1:]))
    print(f"{'PASS' if ordered else 'FAIL'}  ordinal monotonic  L = " + ", ".join(f"{v:.3f}" for v in ls))
    if not ordered:
        fails.append(f"{mode}: tier ramp is not monotonic in lightness")

    for i, (a, b) in enumerate(zip(p["tier_ramp"], p["tier_ramp"][1:])):
        de = delta_e(a, b)
        ok = de >= 8
        print(f"{'PASS' if ok else 'FAIL'}  step dE {TIER_NAMES[i]}->{TIER_NAMES[i+1]:9} {de:5.1f}  (>=8)")
        if not ok:
            fails.append(f"{mode}: {TIER_NAMES[i]}->{TIER_NAMES[i+1]} dE {de:.1f} < 8")

    # 2. step nearest the surface must clear 2:1
    nearest = min(p["tier_ramp"], key=lambda c: abs(luminance(c) - luminance(surf)))
    cr = contrast(nearest, surf)
    ok = cr >= 2.0
    print(f"{'PASS' if ok else 'FAIL'}  nearest-surface step {nearest} contrast {cr:.2f} (>=2.0)")
    if not ok:
        fails.append(f"{mode}: {nearest} only {cr:.2f}:1 on surface")

    # 3. mark colours vs surface
    marks = {"accent": p["accent"], "div_low": p["div_low"], "div_high": p["div_high"], **p["status"]}
    for name, hexv in marks.items():
        cr = contrast(hexv, surf)
        tag = "PASS" if cr >= 3.0 else "RELIEF"
        print(f"{tag:6} {name:9} {hexv} contrast {cr:.2f}" + ("" if cr >= 3.0 else "  -> needs icon+label or table view"))

    # 4. diverging poles must read as opposite
    hl, hh = oklch(p["div_low"])[2], oklch(p["div_high"])[2]
    sep = min(abs(hl - hh), 360 - abs(hl - hh))
    ok = sep >= 90
    print(f"{'PASS' if ok else 'FAIL'}  diverging hue separation {sep:.0f} deg (>=90)  {p['div_low']} vs {p['div_high']}")
    if not ok:
        fails.append(f"{mode}: diverging poles only {sep:.0f} deg apart")

    # text legibility
    for name in ("ink", "ink_secondary", "ink_muted"):
        cr = contrast(p[name], surf)
        need = 4.5 if name == "ink" else 4.5 if name == "ink_secondary" else 3.0
        ok = cr >= need
        print(f"{'PASS' if ok else 'FAIL'}  text {name:14} {cr:.2f} (>={need})")
        if not ok:
            fails.append(f"{mode}: {name} {cr:.2f}:1 < {need}")

    return fails


if __name__ == "__main__":
    problems = check("light") + check("dark")
    print()
    if problems:
        print("FAILURES:")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("All checks passed.")
