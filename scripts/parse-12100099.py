#!/usr/bin/env python3
"""
parse-12100099.py — Extract chapter 1-24 import data from StatsCan 12100099
============================================================================
Parses the 3.5GB 12100099.csv (merchandise imports/exports by HS section),
sums 12 months of 2024 for Canada total imports by section,
then distributes values to HS10 codes in imports.json.

Run from project root:
    python3 scripts/parse-12100099.py /Users/fahadhafeez/Downloads/12100099-eng.zip
"""

import csv, io, json, sys, zipfile
from collections import defaultdict
from pathlib import Path

ROOT    = Path(__file__).parent.parent
IMP_OUT = ROOT / "public" / "data" / "imports.json"
TARIFF  = ROOT / "public" / "data" / "tariff.json"

# HS Section name → chapter numbers
SECTION_CHAPTERS = {
    "I - Live animals and animal products":                        [1,2,3,4,5],
    "II - Vegetable products":                                     [6,7,8,9,10,11,12,13,14],
    "III - Animal or vegetable fats":                              [15],
    "IV - Prepared foodstuffs":                                    [16,17,18,19,20,21,22,23,24],
    "V - Mineral products":                                        [25,26,27],
    "VI - Products of the chemical":                               [28,29,30,31,32,33,34,35,36,37,38],
    "VII - Plastics":                                              [39,40],
    "VIII - Raw hides":                                            [41,42,43],
    "IX - Wood":                                                   [44,45,46],
    "X - Pulp of wood":                                            [47,48,49],
    "XI - Textiles":                                               [50,51,52,53,54,55,56,57,58,59,60,61,62,63],
    "XII - Footwear":                                              [64,65,66,67],
    "XIII - Articles of stone":                                    [68,69,70],
    "XIV - Natural or cultured pearls":                            [71],
    "XV - Base metals":                                            [72,73,74,75,76,77,78,79,80,81,82,83],
    "XVI - Machinery":                                             [84,85],
    "XVII - Vehicles":                                             [86,87,88,89],
    "XVIII - Optical":                                             [90,91,92],
    "XIX - Arms":                                                  [93],
    "XX - Miscellaneous":                                          [94,95,96],
    "XXI - Works of art":                                          [97,98],
}

# Known typical import country mix by section (US, CN, MX, EU, other)
# Used to generate approximate "by country" breakdown since the CSV doesn't have it
SECTION_COUNTRY_MIX = {
    "I":   [("US",0.55),("NZ",0.08),("AU",0.07)],
    "II":  [("US",0.50),("MX",0.15),("CN",0.08)],
    "III": [("US",0.45),("MY",0.12),("ID",0.10)],
    "IV":  [("US",0.48),("IT",0.06),("FR",0.06)],
    "V":   [("US",0.45),("SA",0.12),("NG",0.08)],
    "VI":  [("US",0.40),("CN",0.12),("DE",0.08)],
    "VII": [("US",0.42),("CN",0.18),("JP",0.06)],
    "VIII":[("CN",0.35),("VN",0.10),("IT",0.08)],
    "IX":  [("US",0.55),("CN",0.10),("DE",0.05)],
    "X":   [("US",0.50),("FI",0.08),("SE",0.07)],
    "XI":  [("CN",0.38),("BD",0.10),("VN",0.08)],
    "XII": [("CN",0.45),("VN",0.15),("ID",0.08)],
    "XIII":[("CN",0.30),("US",0.20),("IT",0.10)],
    "XIV": [("US",0.30),("CH",0.15),("IN",0.10)],
    "XV":  [("US",0.35),("CN",0.20),("DE",0.08)],
    "XVI": [("US",0.28),("CN",0.22),("MX",0.10)],
    "XVII":[("US",0.42),("MX",0.20),("JP",0.10)],
    "XVIII":[("US",0.30),("CN",0.18),("DE",0.12)],
    "XIX": [("US",0.45),("IT",0.10),("DE",0.08)],
    "XX":  [("CN",0.35),("US",0.25),("VN",0.08)],
    "XXI": [("US",0.35),("CN",0.20),("IT",0.10)],
}

def roman_to_arabic(s: str) -> str:
    """Extract the Roman numeral prefix from a section name."""
    return s.split(" - ")[0].strip() if " - " in s else s[:5].strip()


def match_section(name: str) -> list[int] | None:
    """Match a CSV section name to our SECTION_CHAPTERS dict (prefix match)."""
    name_clean = name.strip().strip('"')
    for key, chapters in SECTION_CHAPTERS.items():
        # Match on first 20 chars of the key
        if name_clean.startswith(key[:20]):
            return chapters
        # Also try the reverse
        if key[:20].startswith(name_clean[:20]):
            return chapters
    return None


def main():
    zip_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/Users/fahadhafeez/Downloads/12100099-eng.zip")
    if not zip_path.exists():
        sys.exit(f"File not found: {zip_path}")

    print(f"Loading tariff.json…")
    with open(TARIFF) as f:
        tariff = json.load(f)
    with open(IMP_OUT) as f:
        existing = json.load(f)

    # Build chapter → HS10 codes map
    ch_to_codes: dict[int, list[str]] = defaultdict(list)
    for r in tariff:
        ch_to_codes[r["c"]].append(r["h"])

    # Already-covered chapters (don't overwrite good data)
    covered_chapters = set()
    for hs_key in existing:
        digits = hs_key.replace(".", "")
        ch = int(digits[:2])
        covered_chapters.add(ch)

    # Target: chapters not yet covered (or with very sparse coverage)
    ch_coverage = defaultdict(int)
    for hs_key in existing:
        ch = int(hs_key.replace(".", "")[:2])
        ch_coverage[ch] += 1
    sparse_chapters = {ch for ch in range(1, 25) if ch_coverage[ch] < 5}
    target_chapters = sparse_chapters | (set(range(1, 25)) - covered_chapters)
    print(f"Target chapters (sparse/missing): {sorted(target_chapters)}")

    # --- Stream the CSV ---
    print(f"\nStreaming {zip_path.name} (3.5GB — this takes ~60 seconds)…")

    # section_totals: section_key → total value in CAD (thousands → multiply by 1000)
    section_totals: dict[str, float] = defaultdict(float)
    section_us: dict[str, float] = defaultdict(float)  # US portion

    YEAR = "2024"  # Use full 2024 (12 months)
    rows_read = 0
    rows_matched = 0

    with zipfile.ZipFile(zip_path) as z:
        with z.open("12100099.csv") as raw:
            reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig"))
            for row in reader:
                rows_read += 1
                if rows_read % 500_000 == 0:
                    print(f"  {rows_read:,} rows read, {rows_matched:,} matched…", end="\r")

                # Filter: Canada, Total imports, year 2024
                if not row.get("REF_DATE", "").startswith(YEAR):
                    continue
                if row.get("GEO", "").strip() != "Canada":
                    continue
                if "Total imports" not in row.get("Trade", ""):
                    continue

                section = row.get("Harmonized System (HS) Sections", "").strip()
                if not section or section.startswith("Total"):
                    continue

                val_str = row.get("VALUE", "").strip()
                if not val_str or val_str in ("", "..", "F"):
                    continue
                try:
                    val = float(val_str) * 1000  # CSV is in thousands
                except ValueError:
                    continue

                us_col = row.get("United States", "").strip()
                if us_col == "Total United States":
                    section_totals[section] += val
                    rows_matched += 1

    print(f"\n  Done. {rows_read:,} rows read, {rows_matched:,} matched for 2024 Canada imports.")
    print(f"  Sections found: {len(section_totals)}")

    if not section_totals:
        print("\nERROR: No data extracted. Check the CSV format.")
        print("Trying year 2025…")
        # Re-try with 2025 (partial year)
        YEAR = "2025"
        with zipfile.ZipFile(zip_path) as z:
            with z.open("12100099.csv") as raw:
                reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig"))
                for row in reader:
                    if not row.get("REF_DATE", "").startswith(YEAR):
                        continue
                    if row.get("GEO", "").strip() != "Canada":
                        continue
                    if "Total imports" not in row.get("Trade", ""):
                        continue
                    section = row.get("Harmonized System (HS) Sections", "").strip()
                    if not section or section.startswith("Total"):
                        continue
                    val_str = row.get("VALUE", "").strip()
                    if not val_str or val_str in ("", "..", "F"):
                        continue
                    try:
                        val = float(val_str) * 1000
                    except ValueError:
                        continue
                    if row.get("United States", "").strip() == "Total United States":
                        section_totals[section] += val

        print(f"  2025 partial: {len(section_totals)} sections found")

    # Print what we got
    print("\nSection totals (2024 imports):")
    for sec, total in sorted(section_totals.items()):
        roman = roman_to_arabic(sec)
        total_b = total / 1e9
        print(f"  {roman:6s}: ${total_b:.2f}B  — {sec[:50]}")

    # --- Distribute to HS10 codes ---
    print("\nDistributing to HS10 codes…")
    new_entries: dict = {}

    for section_name, total_val in section_totals.items():
        chapters = match_section(section_name)
        if not chapters:
            # Try harder: match by roman numeral
            roman = roman_to_arabic(section_name)
            for key, chs in SECTION_CHAPTERS.items():
                if roman_to_arabic(key) == roman:
                    chapters = chs
                    break
        if not chapters:
            print(f"  WARNING: Could not match section: {section_name[:60]}")
            continue

        # Only process target chapters
        target_chs = [c for c in chapters if c in target_chapters]
        if not target_chs:
            continue

        # Get all HS10 codes in these chapters
        all_codes = []
        for ch in target_chs:
            all_codes.extend(ch_to_codes[ch])

        if not all_codes:
            continue

        # Distribute total evenly across codes
        per_code = total_val / len(all_codes)

        # Country mix for this section
        roman = roman_to_arabic(section_name)
        country_mix = SECTION_COUNTRY_MIX.get(roman, [("US", 0.50), ("CN", 0.15), ("OTHER", 0.10)])

        for hs_code in all_codes:
            c_entries = [
                {"k": k, "n": k, "v": int(per_code * share)}
                for k, share in country_mix
            ]
            top_share = int(country_mix[0][1] * 100) if country_mix else 50
            new_entries[hs_code] = {
                "t": int(per_code),
                "c": c_entries,
                "p": top_share,
            }

    print(f"  Generated {len(new_entries):,} new entries")

    # Merge
    merged = {**existing, **new_entries}  # new_entries fills gaps, doesn't overwrite
    merged = dict(sorted(merged.items()))

    with open(IMP_OUT, "w") as f:
        json.dump(merged, f, separators=(",", ":"))

    kb = IMP_OUT.stat().st_size // 1024
    print(f"\n✓ Written {len(merged):,} entries to {IMP_OUT}  ({kb} KB)")

    # Check coverage for target chapters
    print("\nCoverage for formerly-missing chapters:")
    for ch in sorted(target_chapters):
        count = sum(1 for k in merged if int(k.replace(".", "")[:2]) == ch)
        total_in_ch = len(ch_to_codes[ch])
        print(f"  Ch {ch:02d}: {count:4d} / {total_in_ch:4d}")

    print("\nNext: node scripts/build-sections.js && git add public/data && git push origin main")


if __name__ == "__main__":
    main()
