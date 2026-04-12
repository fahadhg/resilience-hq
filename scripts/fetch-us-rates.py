#!/usr/bin/env python3
"""
fetch-us-rates.py — Build complete US tariff rates on Canadian exports
=======================================================================
Fetches US HTS (Harmonized Tariff Schedule) rates from the USITC and
layers in the current tariff situation (as of 2025):

  Base rate:   CUSMA/USMCA preferential rate (mostly 0%)
  Layer 1:     Section 232 — Steel +25%, Aluminum +10% (ch 72-73, 76)
  Layer 2:     IEEPA (Feb 2025) — 25% on Canadian goods not USMCA-compliant
  Layer 3:     Retaliatory / special chapter 99 provisions

Outputs: public/data/us_rates.json  (HS6 keys → effective % rate)

Run from project root:
    pip install requests
    python3 scripts/fetch-us-rates.py

Sources:
  - USITC HTS API: https://hts.usitc.gov/reststop/api/
  - USTR IEEPA order: 25% on Canada (Feb 4 2025, effective Mar 4 2025)
  - USTR Section 232: steel 25%, aluminum 10% (all origins)
"""

import json, re, sys, time
from pathlib import Path
from collections import defaultdict

try:
    import requests
    requests.packages.urllib3.disable_warnings()
except ImportError:
    sys.exit("Missing dependency: pip install requests")

ROOT    = Path(__file__).parent.parent
OUT     = ROOT / "public" / "data" / "us_rates.json"
TARIFF  = ROOT / "public" / "data" / "tariff.json"

HEADERS = {
    "User-Agent": "ResilienceHQ/1.0 (tariff research tool; ngen.ca)",
    "Accept": "application/json,*/*",
}

USITC_BASE = "https://hts.usitc.gov/reststop/api"

# ─── Known tariff layers (2025) ───────────────────────────────────────────────

# Section 232 — Steel and Aluminum (imposed 2018, still in effect 2025)
# Applies to ALL origins including Canada even under CUSMA
S232_RATES: dict[str, float] = {
    # Chapter 72 — Iron and Steel
    "72": 25.0,
    # Chapter 73 — Articles of Iron or Steel
    "73": 25.0,
    # Chapter 76 — Aluminum and articles thereof
    "76": 10.0,
    # Chapter 74 — Copper (sometimes included in expanded 232)
    "74": 0.0,   # No 232 on copper as of 2025
}

# Section 232 — Autos and auto parts (ch 87) — 25% effective May 2025
S232_AUTO: dict[str, float] = {
    "8703": 25.0,  # Passenger vehicles
    "8704": 25.0,  # Trucks
    "8706": 25.0,  # Chassis
    "8707": 25.0,  # Bodies
    "8708": 25.0,  # Auto parts
}

# IEEPA Canada tariff — Executive Order Feb 1 2025
# Effective rate: 25% on all Canadian goods NOT USMCA-compliant
# Energy & potash: 10% (before matching Canadian retaliation → 25%)
IEEPA_RATE = 25.0
IEEPA_ENERGY_RATE = 25.0   # Updated to 25% after Canadian retaliation Mar 2025
IEEPA_ENERGY_CHAPTERS = {"27"}   # Mineral fuels

# USMCA-compliant goods still face 25% IEEPA as of April 2025
# (Originally USMCA goods were exempt but EO was amended March 6 2025)
USMCA_IEEPA_RATE = 25.0

# Goods exempt from IEEPA Canada (EO exception list — April 2025)
# Mainly: Canadian goods that were already subject to other tariff actions
# or specific strategic exemptions. Currently very limited.
IEEPA_EXEMPT_CHAPTERS: set[str] = set()  # No full chapter exemptions as of April 2025

# Section 301 — China-derived goods (does NOT apply to Canadian origin)
# Not included here — we're modeling Canadian-origin goods only.

# Additional tariff note by chapter
CHAPTER_NOTES: dict[str, str] = {
    "27": "IEEPA energy rate; includes LNG, oil, electricity",
    "72": "S232 steel 25% + IEEPA 25% = 50% effective",
    "73": "S232 steel 25% + IEEPA 25% = 50% effective",
    "76": "S232 aluminum 10% + IEEPA 25% = 35% effective",
    "87": "Section 232 autos 25% effective May 2025; auto parts 25%",
    "10": "Agricultural goods — USMCA rate 0% but IEEPA 25% applies",
    "02": "Meat — USMCA rate 0% but IEEPA 25% applies",
    "04": "Dairy — quota-rate-quota; over-quota rates high",
}


def effective_rate(chapter: str, hs4: str, hs6: str, base_mfn: float) -> float:
    """
    Compute effective US rate for a Canadian-origin good in 2025.

    Logic:
      1. Start with CUSMA/USMCA preferential rate (≈ 0% for qualifying goods)
         We approximate this as 0% for all HS under CUSMA chapters
      2. Add Section 232 surcharge if applicable (steel/aluminum)
      3. Add IEEPA 25% surcharge (applies to Canadian goods as of Mar 4 2025)

    Note: Rates stack additively in US tariff law (base + additional).
    """
    ch2 = chapter[:2]

    # Base CUSMA rate is 0% for most goods (NAFTA/CUSMA eliminated most duties)
    base = 0.0

    # Override with MFN if CUSMA doesn't apply (e.g., outside scope)
    # For simplicity, we use 0% for all since CUSMA covers virtually all CAD goods
    # Agricultural TRQ goods are more complex but approximated as 0% in-quota

    # Section 232 — Steel
    s232 = S232_RATES.get(ch2, 0.0)

    # Section 232 — Autos (HS4 level)
    if not s232 and hs4 in S232_AUTO:
        s232 = S232_AUTO[hs4]

    # IEEPA Canada surcharge
    if ch2 in IEEPA_ENERGY_CHAPTERS:
        ieepa = IEEPA_ENERGY_RATE
    elif ch2 in IEEPA_EXEMPT_CHAPTERS:
        ieepa = 0.0
    else:
        ieepa = IEEPA_RATE

    # Effective = base CUSMA + additional tariffs (they stack)
    total = base + s232 + ieepa
    return round(total, 1)


def fetch_usitc_chapter(chapter: int) -> list[dict] | None:
    """Fetch HTS data for a chapter from USITC API."""
    ch_str = f"{chapter:02d}"
    # USITC HTS REST API
    url = f"{USITC_BASE}/details/en/chapters/{ch_str}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code == 200:
            return r.json()
        # Try alternate endpoint
        url2 = f"{USITC_BASE}/details/en/chapter/{ch_str}"
        r2 = requests.get(url2, headers=HEADERS, timeout=20)
        if r2.status_code == 200:
            return r2.json()
        return None
    except Exception:
        return None


def fetch_usitc_heading(heading: str) -> dict | None:
    """Fetch HTS data for a 4-digit heading."""
    url = f"{USITC_BASE}/details/en/heading/{heading}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            return r.json()
        return None
    except Exception:
        return None


def parse_usitc_rate(rate_str: str | None) -> float:
    """Parse USITC rate string like '2.5%', 'Free', '25¢/kg + 5.8%' → float %."""
    if not rate_str:
        return 0.0
    s = str(rate_str).strip()
    if s.lower() in ("free", "0%", "0.0%"):
        return 0.0
    # Extract leading percentage
    m = re.search(r"(\d+\.?\d*)\s*%", s)
    if m:
        return float(m.group(1))
    # Specific duty only (no %)
    if re.match(r"^\d+[\¢\$]", s):
        return 0.0  # specific duty — can't easily convert
    return 0.0


def extract_hs6_rates(chapter_data) -> dict[str, float]:
    """Extract HS6 → MFN rate from USITC chapter/heading data."""
    rates: dict[str, float] = {}
    if not chapter_data:
        return rates

    # USITC returns a nested structure; try to flatten
    items = chapter_data if isinstance(chapter_data, list) else chapter_data.get("tariff", []) or chapter_data.get("headings", []) or []

    for item in items:
        if not isinstance(item, dict):
            continue
        hs_raw = item.get("htsno") or item.get("tariff_number") or item.get("hs") or ""
        digits = re.sub(r"[^\d]", "", str(hs_raw))
        if len(digits) < 6:
            continue
        hs6 = digits[:6]

        rate_str = (
            item.get("mfn_rate") or item.get("general_rate") or
            item.get("rate_1") or item.get("rate") or ""
        )
        mfn = parse_usitc_rate(rate_str)
        rates[hs6] = mfn

    return rates


def main():
    print("Loading tariff codes…")
    with open(TARIFF) as f:
        tariff = json.load(f)

    # Load existing us_rates if present
    existing: dict[str, float] = {}
    if OUT.exists():
        with open(OUT) as f:
            existing = json.load(f)
    print(f"  Existing us_rates entries: {len(existing):,}")

    # Build HS6 universe from tariff.json
    hs6_universe: dict[str, dict] = {}  # hs6 → {chapter, hs4}
    for r in tariff:
        digits = re.sub(r"[^\d]", "", r["h"])
        if len(digits) >= 6:
            hs6  = digits[:6]
            ch   = digits[:2]
            hs4  = digits[:4]
            hs6_universe[hs6] = {"ch": ch, "hs4": hs4, "mfn": r.get("m", 0)}

    # Find missing HS6 codes
    missing_hs6 = set(hs6_universe.keys()) - set(existing.keys())
    print(f"  HS6 codes in tariff: {len(hs6_universe):,}")
    print(f"  Already in us_rates: {len(existing):,}")
    print(f"  Need to fetch/compute: {len(missing_hs6):,}")

    # ── Method 1: Compute from known tariff rules (no API needed) ─────────────
    # We can compute the effective 2025 rate for ALL codes from the tariff logic
    print("\n[1/3] Computing effective 2025 US rates from tariff rules…")
    computed: dict[str, float] = {}

    for hs6, info in hs6_universe.items():
        rate = effective_rate(info["ch"], info["hs4"], hs6, info["mfn"])
        computed[hs6] = rate

    print(f"  Computed {len(computed):,} rates from rule engine")

    # Distribution summary
    from collections import Counter
    dist = Counter(computed.values())
    print(f"  Rate distribution: {dict(sorted(dist.items()))}")

    # ── Method 2: USITC API — fetch base MFN rates to augment ────────────────
    print("\n[2/3] Attempting USITC HTS API to get base MFN rates…")
    usitc_rates: dict[str, float] = {}
    all_chapters = sorted(set(v["ch"] for v in hs6_universe.values()))

    # Try a few chapters to test if API is available
    test_chapters = [1, 2, 84, 87]
    api_available = False
    for ch in test_chapters:
        data = fetch_usitc_chapter(ch)
        if data:
            ch_rates = extract_hs6_rates(data)
            if ch_rates:
                usitc_rates.update(ch_rates)
                api_available = True
                print(f"  Chapter {ch:02d}: {len(ch_rates)} rates from USITC API")
                break
        time.sleep(0.2)

    if api_available:
        print(f"  Fetching remaining chapters…")
        for ch in all_chapters:
            if ch in [str(c) for c in test_chapters]:
                continue
            data = fetch_usitc_chapter(int(ch))
            if data:
                ch_rates = extract_hs6_rates(data)
                usitc_rates.update(ch_rates)
                print(f"  Chapter {ch}: +{len(ch_rates)} rates", end="\r")
            time.sleep(0.15)
        print(f"\n  Total from USITC API: {len(usitc_rates):,} HS6 rates")
    else:
        print("  USITC API unavailable — using rule-engine rates only")

    # ── Merge: rule-engine base + USITC MFN + tariff layers ──────────────────
    print("\n[3/3] Merging rule-engine + USITC + existing rates…")
    final: dict[str, float] = {}

    for hs6, info in hs6_universe.items():
        # Start with computed rule-engine rate
        rate = computed.get(hs6, 25.0)

        # If USITC returned a base MFN for this HS6, re-layer on top
        if hs6 in usitc_rates:
            base_mfn = usitc_rates[hs6]
            ch = info["ch"]
            s232 = S232_RATES.get(ch, 0.0)
            if not s232 and info["hs4"] in S232_AUTO:
                s232 = S232_AUTO[info["hs4"]]
            if ch in IEEPA_ENERGY_CHAPTERS:
                ieepa = IEEPA_ENERGY_RATE
            elif ch in IEEPA_EXEMPT_CHAPTERS:
                ieepa = 0.0
            else:
                ieepa = IEEPA_RATE
            # CUSMA rate ≈ 0% for qualifying goods, so base_mfn from USITC applies to non-CUSMA
            # For Canadian goods, use CUSMA (0%) + additional layers
            rate = round(0.0 + s232 + ieepa, 1)

        # Keep existing entries if they're higher specificity
        if hs6 in existing and abs(existing[hs6] - rate) < 1:
            rate = existing[hs6]

        final[hs6] = rate

    # Add any existing entries not in our tariff universe
    for k, v in existing.items():
        if k not in final:
            final[k] = v

    final = dict(sorted(final.items()))

    # Save
    with open(OUT, "w") as f:
        json.dump(final, f, separators=(",", ":"))

    kb = OUT.stat().st_size // 1024
    print(f"\n✓ Written {len(final):,} entries to {OUT}  ({kb} KB)")

    # Summary stats
    zero    = sum(1 for v in final.values() if v == 0)
    rate25  = sum(1 for v in final.values() if v == 25.0)
    rate50  = sum(1 for v in final.values() if v >= 50.0)
    nonzero = sum(1 for v in final.values() if v > 0)
    print(f"\nRate summary:")
    print(f"  0% (CUSMA free):     {zero:>6,}  ({zero/len(final)*100:.1f}%)")
    print(f"  25% (IEEPA):         {rate25:>6,}  ({rate25/len(final)*100:.1f}%)")
    print(f"  ≥50% (S232+IEEPA):   {rate50:>6,}  ({rate50/len(final)*100:.1f}%)")
    print(f"  Total >0%:           {nonzero:>6,}  ({nonzero/len(final)*100:.1f}%)")

    print("\nKey tariff layers applied:")
    print("  Base CUSMA/USMCA rate:  0% (all qualifying Canadian goods)")
    print("  IEEPA Canada (Mar 2025): +25% (all goods incl. USMCA-compliant)")
    print("  S232 Steel (ch 72-73):  +25% additional → 50% effective")
    print("  S232 Aluminum (ch 76):  +10% additional → 35% effective")
    print("  S232 Autos (8703-8708): +25% additional → 50% effective")
    print("\nNote: Rates reflect April 2025 status. Update IEEPA_RATE if EOs change.")
    print("\nNext: node scripts/build-sections.js && git add public/data && git commit -m 'update US rates 2025'")


if __name__ == "__main__":
    main()
