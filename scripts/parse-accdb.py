#!/usr/bin/env python3
"""
parse-accdb.py — Convert CBSA T2026 Access DB export to tariff.json
Run: python3 scripts/parse-accdb.py /tmp/t2026-export.csv
Or:  mdb-export /tmp/t2026.accdb TPHS | python3 scripts/parse-accdb.py -
"""

import csv, json, re, sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT  = ROOT / "public" / "data" / "tariff.json"

def parse_rate(val):
    if not val or str(val).strip() in ('', '-', '—', 'N/A', 'n/a'):
        return None
    s = str(val).strip()
    if s.lower() == 'free': return 0.0
    m = re.search(r'(\d+(?:\.\d+)?)\s*%', s)
    if m: return float(m.group(1))
    m = re.match(r'^(\d+(?:\.\d+)?)$', s.replace(',',''))
    if m: return float(m.group(1))
    return None

# Column → our key mapping
COL_MAP = {
    'MFN': 'm',
    'UST': 'us',   # CUSMA US
    'MXT': 'mx',   # CUSMA Mexico
    'CEUT': 'eu',  # CETA
    'CPTPT': 'cp', # CPTPP
    'UKT': 'uk',   # UK
    'JT': 'jp',    # Japan
    'KRT': 'kr',   # Korea
    'General Tariff': 'g',
}

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else '-'
    f = sys.stdin if src == '-' else open(src, newline='', encoding='utf-8-sig')

    reader = csv.DictReader(f)
    items = []
    skipped = 0

    for row in reader:
        hs_raw = (row.get('TARIFF') or '').strip().strip('"')

        # Only keep HS10 codes: exactly XX.XX.XX.XX (10 digits with dots = 13 chars)
        digits = re.sub(r'[^\d]', '', hs_raw)
        if len(digits) != 10:
            skipped += 1
            continue

        hs = f"{digits[0:4]}.{digits[4:6]}.{digits[6:8]}.{digits[8:10]}"
        chapter = int(digits[:2])

        # Description: prefer DESC1, fallback DESC2/DESC3
        desc = (row.get('DESC1') or row.get('DESC2') or row.get('DESC3') or '').strip().strip('"')

        unit = (row.get('UOM') or '').strip().strip('"')

        item = {
            'h': hs,
            'c': chapter,
            'd': desc,
            'u': unit,
            'm': parse_rate(row.get('MFN')) or 0.0,
        }

        for col, key in COL_MAP.items():
            if col == 'm': continue
            v = parse_rate(row.get(col))
            if v is not None:
                item[key] = v

        items.append(item)

    if src != '-':
        f.close()

    # Sort by HS code
    items.sort(key=lambda r: r['h'])

    print(f"Parsed {len(items):,} HS10 codes ({skipped:,} skipped non-HS10 rows)")

    chapters = sorted(set(r['c'] for r in items))
    dutiable = sum(1 for r in items if r.get('m', 0) > 0)
    print(f"Chapters: {chapters[0]}–{chapters[-1]} ({len(chapters)} chapters)")
    print(f"Dutiable: {dutiable:,} / {len(items):,}")

    with open(OUT, 'w') as f:
        json.dump(items, f, separators=(',', ':'))
    print(f"\n✓ Written to {OUT}  ({OUT.stat().st_size // 1024} KB)")
    print("\nNext: node scripts/build-sections.js && npx vercel --prod")

if __name__ == '__main__':
    main()
