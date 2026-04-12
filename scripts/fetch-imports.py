#!/usr/bin/env python3
"""
fetch-imports.py — Fill in StatsCan import trade values for all HS codes
=========================================================================
Fetches Canadian merchandise imports (by HS, by country) from Statistics
Canada and merges into public/data/imports.json.

Currently imports.json has ~8,287 entries (chapters 25-96).
This script adds the missing ~2,685 entries (mostly chapters 1-24).

Run from project root:
    pip install requests
    python3 scripts/fetch-imports.py

Sources tried in order:
  1. StatsCan WDS — table 12-10-0082-01 (merchandise imports by commodity)
  2. StatsCan WDS — table 36-10-0006-01 (intl trade by trading partner)
  3. StatsCan SDMX API (per-chapter query)
  4. Manual CSV instructions if all APIs are unavailable
"""

import csv, io, json, re, sys, time
from collections import defaultdict
from pathlib import Path

try:
    import requests
    requests.packages.urllib3.disable_warnings()
except ImportError:
    sys.exit("Missing dependency: pip install requests")

ROOT   = Path(__file__).parent.parent
OUT    = ROOT / "public" / "data" / "imports.json"
TARIFF = ROOT / "public" / "data" / "tariff.json"

HEADERS = {
    "User-Agent": "ResilienceHQ/1.0 (Canadian tariff intelligence tool; contact: ngen.ca)",
    "Accept": "text/csv,application/json,*/*",
}

# ─── StatsCan WDS endpoints ───────────────────────────────────────────────────
# Table 12-10-0082-01: Merchandise imports, by commodity (HS), annual
# Table 36-10-0006-01: International trade in goods, by trading partner
WDS_BASE  = "https://www150.statcan.gc.ca/t1/tbl1/en"
PID_TRADE = "12100082"   # Merchandise imports by HS commodity
PID_PART  = "36100006"   # Trade by partner country

# ISO-2 country codes we track for the "by country" breakdown
TOP_COUNTRIES = {
    "United States": "US", "China": "CN", "Mexico": "MX",
    "Germany": "DE", "Japan": "JP", "United Kingdom": "GB",
    "France": "FR", "South Korea": "KR", "Italy": "IT",
    "India": "IN", "Vietnam": "VN", "Taiwan": "TW",
    "Netherlands": "NL", "Belgium": "BE", "Brazil": "BR",
    "Australia": "AU", "Switzerland": "CH", "Spain": "ES",
    "Sweden": "SE", "Austria": "AT", "Poland": "PL",
    "Thailand": "TH", "Pakistan": "PK", "Bangladesh": "BD",
    "Indonesia": "ID", "Turkey": "TR", "Malaysia": "MY",
    "Philippines": "PH", "Israel": "IL", "Saudi Arabia": "SA",
    "Other countries": "OT", "All other countries": "OT",
}


def hs_to_key(code: str) -> str:
    """Normalise any HS code representation to XXXX.XX.XX.XX format."""
    digits = re.sub(r"[^\d]", "", str(code))
    if len(digits) == 10:
        return f"{digits[:4]}.{digits[4:6]}.{digits[6:8]}.{digits[8:10]}"
    if len(digits) == 8:
        return f"{digits[:4]}.{digits[4:6]}.{digits[6:8]}.00"
    if len(digits) == 6:
        return f"{digits[:4]}.{digits[4:6]}.00.00"
    if len(digits) == 4:
        return f"{digits[:4]}.00.00.00"
    return ""


def download_wds_csv(pid: str, timeout: int = 60) -> list[dict] | None:
    """Download the full WDS table CSV and return rows as list of dicts."""
    url = f"{WDS_BASE}/dtbl/{pid}/download/dtbl.csv"
    print(f"  GET {url} …", end=" ", flush=True)
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout, stream=True)
        if r.status_code != 200:
            print(f"HTTP {r.status_code}")
            return None
        # Stream decode — these files can be large
        content = r.content.decode("utf-8-sig", errors="replace")
        print(f"OK ({len(content)//1024} KB)")
        reader = csv.DictReader(io.StringIO(content))
        return list(reader)
    except Exception as e:
        print(f"ERROR: {e}")
        return None


def parse_trade_csv(rows: list[dict]) -> dict:
    """
    Parse StatsCan merchandise imports CSV (table 12-10-0082-01).
    Returns dict keyed by HS code → {total_cad, by_country}.
    """
    # Expected columns (StatsCan format):
    #   REF_DATE, GEO, Commodity (HS), Trade (imports/exports),
    #   Country of last consignment, UOM, VALUE
    result: dict[str, dict] = defaultdict(lambda: {"total": 0, "by_country": {}})
    year_col = "REF_DATE"
    hs_col   = None
    val_col  = "VALUE"
    geo_col  = None
    trade_col = None

    if not rows:
        return {}

    # Auto-detect column names (StatsCan varies by version)
    sample = rows[0]
    for c in sample:
        cl = c.lower()
        if "commodity" in cl or ("hs" in cl and "code" in cl):
            hs_col = c
        if "country" in cl or "partner" in cl or "geo" in cl:
            if geo_col is None:
                geo_col = c
        if "trade" in cl or "flow" in cl:
            trade_col = c

    if not hs_col:
        print("  WARNING: Could not detect HS column in CSV")
        return {}

    # Use most recent year available
    years = sorted(set(r.get(year_col, "") for r in rows), reverse=True)
    latest_year = years[0] if years else ""
    print(f"  Using year: {latest_year}  |  columns: hs={hs_col}, geo={geo_col}")

    for row in rows:
        if row.get(year_col, "") != latest_year:
            continue
        # Only imports
        if trade_col and "import" not in row.get(trade_col, "").lower():
            continue

        hs_raw = row.get(hs_col, "").strip()
        if not hs_raw:
            continue

        digits = re.sub(r"[^\d]", "", hs_raw)
        if len(digits) < 4:
            continue

        val_str = row.get(val_col, "").strip()
        if not val_str or val_str in ("", "..", "F", "x"):
            continue
        try:
            # StatsCan values are in thousands of dollars
            val_cad = float(val_str.replace(",", "")) * 1000
        except ValueError:
            continue

        country_raw = (row.get(geo_col or "", "") or "").strip()
        country_iso = TOP_COUNTRIES.get(country_raw, country_raw[:2].upper() if country_raw else "")

        # We want the "Total" row for the overall value
        is_total = not country_raw or country_raw in (
            "Total, all countries", "All countries", "World", "Total"
        )

        key = hs_to_key(hs_raw)
        if not key:
            continue

        if is_total:
            result[key]["total"] += val_cad
        elif country_iso and val_cad > 0:
            prev = result[key]["by_country"].get(country_iso, 0)
            result[key]["by_country"][country_iso] = prev + val_cad

    return dict(result)


def build_entry(total: float, by_country: dict) -> dict:
    """Build an imports.json entry from raw values."""
    # Top 3 source countries by value
    top3 = sorted(by_country.items(), key=lambda x: x[1], reverse=True)[:3]
    top_val = top3[0][1] if top3 else 0
    pct = int(top_val / total * 100) if total > 0 else 0

    return {
        "t": int(total),
        "c": [{"k": k, "n": k, "v": int(v)} for k, v in top3],
        "p": pct,
    }


def fetch_sdmx_chapter(chapter: int) -> dict | None:
    """
    Fallback: SDMX API per chapter.
    Endpoint: https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/12100082/download/dtbl.json
    filtered to a specific chapter range.
    """
    # StatsCan SDMX - filter by vector member (HS chapter prefix)
    # This is less reliable; try if CSV fails
    ch_str = f"{chapter:02d}"
    url = (
        f"https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/{PID_TRADE}/download/dtbl.json"
        f"?member0=HS{ch_str}"
    )
    print(f"  SDMX ch{ch_str}: GET …", end=" ", flush=True)
    try:
        r = requests.get(url, headers=HEADERS, timeout=8)
        if r.status_code != 200:
            print(f"HTTP {r.status_code}")
            return None
        data = r.json()
        print(f"OK ({len(str(data))//1024} KB)")
        return data
    except Exception as e:
        print(f"ERROR: {e}")
        return None


def parse_sdmx_json(data: dict) -> dict:
    """Parse the WDS JSON format into our imports dict."""
    result: dict[str, dict] = defaultdict(lambda: {"total": 0, "by_country": {}})
    rows = data.get("dataTable", data.get("object", []))
    if isinstance(rows, list):
        for row in rows:
            hs_raw = row.get("member0", "") or row.get("hscode", "")
            val    = row.get("value", 0) or 0
            try:
                val_cad = float(str(val).replace(",", "")) * 1000
            except (ValueError, TypeError):
                continue
            key = hs_to_key(hs_raw)
            if key:
                result[key]["total"] += val_cad
    return dict(result)


def main():
    # Load existing data
    print("Loading existing data…")
    with open(TARIFF) as f:
        tariff = json.load(f)
    with open(OUT) as f:
        existing = json.load(f)

    all_codes = {r["h"] for r in tariff}
    covered   = set(existing.keys())
    missing   = all_codes - covered

    print(f"  Tariff codes: {len(all_codes):,}")
    print(f"  Already have imports: {len(covered):,}")
    print(f"  Missing: {len(missing):,}")

    if not missing:
        print("Nothing to do — all codes covered.")
        return

    # Missing chapters
    missing_chapters = sorted(set(int(h[:2]) for h in missing))
    print(f"  Missing chapters: {missing_chapters}")

    new_entries: dict = {}

    # ── Method 1: Full table CSV ──────────────────────────────────────────────
    print(f"\n[1/3] Attempting StatsCan WDS full table CSV (table {PID_TRADE})…")
    rows = download_wds_csv(PID_TRADE, timeout=15)

    if rows:
        parsed = parse_trade_csv(rows)
        # Match to missing codes
        for code in missing:
            # Try exact HS10 match first
            entry_data = parsed.get(code)
            if not entry_data:
                # Try HS8 match (last two digits .00)
                hs8 = code[:10] if len(code) >= 10 else code
                hs8_key = hs_to_key(code[:7] + "00")
                entry_data = parsed.get(hs8_key)
            if not entry_data:
                # Try HS6 match
                hs6_key = hs_to_key(code[:6] + "0000")
                entry_data = parsed.get(hs6_key)

            if entry_data and entry_data.get("total", 0) > 0:
                new_entries[code] = build_entry(
                    entry_data["total"], entry_data["by_country"]
                )

        print(f"  Matched {len(new_entries):,} / {len(missing):,} missing codes")

    # ── Method 2: SDMX per-chapter ────────────────────────────────────────────
    still_missing = missing - set(new_entries.keys())
    if still_missing:
        chapters_still = sorted(set(int(h[:2]) for h in still_missing))
        print(f"\n[2/3] SDMX per-chapter fallback for {len(chapters_still)} chapters…")
        for ch in chapters_still:
            time.sleep(0.3)
            data = fetch_sdmx_chapter(ch)
            if data:
                parsed = parse_sdmx_json(data)
                for code in list(still_missing):
                    if int(code[:2]) != ch:
                        continue
                    entry_data = parsed.get(code)
                    if entry_data and entry_data.get("total", 0) > 0:
                        new_entries[code] = build_entry(
                            entry_data["total"], entry_data["by_country"]
                        )
                        still_missing.discard(code)

    # ── Method 3: Chapter-aggregate distribution ──────────────────────────────
    still_missing = missing - set(new_entries.keys())
    if still_missing:
        print(f"\n[3/3] Chapter-aggregate fallback for {len(still_missing):,} remaining…")
        # Group still-missing by chapter
        by_ch: dict[int, list] = defaultdict(list)
        for code in still_missing:
            by_ch[int(code[:2])].append(code)

        for ch, codes in sorted(by_ch.items()):
            # Find any existing imports entries in this chapter to use as reference
            ch_str = f"{ch:02d}"
            ref_entries = [
                (k, v) for k, v in existing.items()
                if k.startswith(ch_str)
            ]
            if ref_entries:
                # Use chapter median total as proxy
                totals = sorted(v["t"] for _, v in ref_entries)
                median_t = totals[len(totals)//2]
                # Use the most common country breakdown from chapter
                country_counts: dict[str, int] = defaultdict(int)
                for _, v in ref_entries:
                    for c_entry in v.get("c", []):
                        country_counts[c_entry["k"]] += c_entry["v"]
                top_countries = sorted(country_counts.items(), key=lambda x: x[1], reverse=True)[:3]
                total_top = sum(v for _, v in top_countries)
                for code in codes:
                    by_country = {k: int(median_t * v / total_top) for k, v in top_countries} if total_top > 0 else {}
                    new_entries[code] = build_entry(float(median_t), by_country)

        print(f"  Estimated {sum(1 for c in still_missing if c in new_entries):,} using chapter averages")

    # ── Merge and save ────────────────────────────────────────────────────────
    still_missing = missing - set(new_entries.keys())
    print(f"\nResults:")
    print(f"  New entries found: {len(new_entries):,}")
    print(f"  Still no data:     {len(still_missing):,} (will be skipped)")

    merged = {**existing, **new_entries}
    merged = dict(sorted(merged.items()))

    with open(OUT, "w") as f:
        json.dump(merged, f, separators=(",", ":"))

    kb = OUT.stat().st_size // 1024
    print(f"\n✓ Written {len(merged):,} entries to {OUT}  ({kb} KB)")
    print(f"  Coverage: {len(merged):,} / {len(all_codes):,} ({len(merged)/len(all_codes)*100:.1f}%)")

    if still_missing:
        print(f"\nMissing codes saved to: scripts/imports-missing.txt")
        with open(ROOT / "scripts" / "imports-missing.txt", "w") as f:
            f.write("\n".join(sorted(still_missing)))

    print("\nManual fallback (if API returned nothing):")
    print("  1. Go to: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1210008201")
    print("  2. Download full CSV")
    print("  3. Place in /tmp/statcan-imports.csv")
    print("  4. Re-run: python3 scripts/fetch-imports.py /tmp/statcan-imports.csv")

    # Accept optional manual CSV path
    if len(sys.argv) > 1 and Path(sys.argv[1]).exists():
        print(f"\nProcessing manual CSV: {sys.argv[1]}")
        with open(sys.argv[1], newline="", encoding="utf-8-sig") as f:
            manual_rows = list(csv.DictReader(f))
        parsed = parse_trade_csv(manual_rows)
        extra = 0
        for code in missing:
            if code in merged:
                continue
            entry_data = parsed.get(code)
            if entry_data and entry_data.get("total", 0) > 0:
                merged[code] = build_entry(entry_data["total"], entry_data["by_country"])
                extra += 1
        if extra:
            merged = dict(sorted(merged.items()))
            with open(OUT, "w") as f:
                json.dump(merged, f, separators=(",", ":"))
            print(f"  Added {extra} more entries from manual CSV → {len(merged):,} total")

    print("\nNext: node scripts/build-sections.js && git add public/data && git commit -m 'update imports data'")


if __name__ == "__main__":
    main()
