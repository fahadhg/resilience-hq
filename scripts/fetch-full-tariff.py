#!/usr/bin/env python3
"""
fetch-full-tariff.py
====================
Downloads the complete CBSA T2026 Canadian Customs Tariff (all chapters 1-97)
and writes public/data/tariff.json in the format expected by ResilienceHQ.

Run from the tariff-monitor project root:
    pip install requests openpyxl
    python scripts/fetch-full-tariff.py

Sources tried in order:
  1. CBSA T2026 bulk ZIP (chapters 1-99 combined Excel/Access)
  2. CBSA CARM OData API (paginated)
  3. Individual chapter ZIPs (01-99 per chapter)

Output format (per code):
  { h, c, d, u, m, us, mx, eu, cp, uk, jp, kr, g }
  h  = HS10 code with dots  e.g. "0101.21.00.00"
  c  = chapter number        e.g. 1
  d  = description
  u  = unit of measure
  m  = MFN rate %
  us = CUSMA US (UST) rate %
  mx = CUSMA Mexico (MXT) rate %
  eu = CETA (CEUT) rate %
  cp = CPTPP rate %
  uk = UKT rate %
  jp = Japan (JT) rate %
  kr = Korea (KRT) rate %
  g  = General tariff (Column 2) rate %
"""

import json, re, sys, os, time, zipfile, io
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Install requests: pip install requests")

try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False
    print("WARNING: openpyxl not installed. Excel parsing disabled. pip install openpyxl")

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUT_PATH = PROJECT_ROOT / "public" / "data" / "tariff.json"
BACKUP_PATH = PROJECT_ROOT / "public" / "data" / "tariff-backup.json"

# ── Rate parsing helpers ───────────────────────────────────────────────────────
def parse_rate(val):
    """Extract numeric % from a rate cell. Returns float or None."""
    if val is None:
        return None
    s = str(val).strip()
    if s in ('', 'Free', 'free', 'FREE', 'N/A', 'n/a', '-', '—'):
        return 0.0 if s.lower() in ('free', '') else None
    # Extract first number e.g. "6.5%" or "6.5% + 1.2¢/kg" → 6.5
    m = re.search(r'(\d+(?:\.\d+)?)\s*%', s)
    if m:
        return float(m.group(1))
    # Plain number
    m = re.search(r'^(\d+(?:\.\d+)?)$', s)
    if m:
        return float(m.group(1))
    return None

def parse_hs(val):
    """Normalize HS code to XX.XX.XX.XX format."""
    s = str(val).strip().replace(' ', '')
    digits = re.sub(r'[^\d]', '', s)
    if len(digits) < 8:
        return None
    digits = digits[:10].ljust(10, '0')
    return f"{digits[0:4]}.{digits[4:6]}.{digits[6:8]}.{digits[8:10]}"

# ── Method 1: CBSA CARM OData API ─────────────────────────────────────────────
ODATA_BASE = "https://ccp-pcc.cbsa-asfc.cloud-nuage.canada.ca/opendata/tariff/v1/tariffClassifications"

# Map CARM column names → our keys
CARM_COL_MAP = {
    # MFN
    'MostFavouredNationTariffRate': 'm',
    'MFNRate': 'm',
    # CUSMA US
    'UnitedStatesTariffRate': 'us',
    'USTariffRate': 'us',
    'CUSMAUSTariffRate': 'us',
    # CUSMA Mexico
    'MexicoTariffRate': 'mx',
    'CUSMAMexicoTariffRate': 'mx',
    # CETA EU
    'EuropeanUnionTariffRate': 'eu',
    'CETATariffRate': 'eu',
    # CPTPP
    'CPTPPTariffRate': 'cp',
    'ComprehensiveProgressiveAgreementForTransPacificPartnershipTariffRate': 'cp',
    # UK
    'UKTariffRate': 'uk',
    'UnitedKingdomTariffRate': 'uk',
    # Japan
    'JapanTariffRate': 'jp',
    # Korea
    'KoreaTariffRate': 'kr',
    # General
    'GeneralTariffRate': 'g',
}

def fetch_odata():
    """Paginate through the CARM OData API and return list of TariffItem dicts."""
    items = []
    skip = 0
    top = 100
    print("Fetching from CBSA CARM OData API...")
    while True:
        url = f"{ODATA_BASE}?$top={top}&$skip={skip}&$format=json"
        try:
            r = requests.get(url, timeout=30)
            r.raise_for_status()
        except Exception as e:
            print(f"  CARM API error at skip={skip}: {e}")
            break
        data = r.json()
        records = data.get('value', data if isinstance(data, list) else [])
        if not records:
            break
        for rec in records:
            hs_raw = rec.get('TariffNumber') or rec.get('tariffNumber') or rec.get('HSTariffNumber', '')
            hs = parse_hs(hs_raw)
            if not hs:
                continue
            chapter = int(hs[:2])
            desc = (rec.get('Description') or rec.get('EnglishDescription') or rec.get('description', '')).strip()
            unit = (rec.get('UnitOfMeasure') or rec.get('unitOfMeasure') or '').strip()

            item = {'h': hs, 'c': chapter, 'd': desc, 'u': unit}

            for carm_key, our_key in CARM_COL_MAP.items():
                val = rec.get(carm_key)
                if val is not None:
                    rate = parse_rate(val)
                    if rate is not None:
                        item[our_key] = rate

            # Ensure MFN exists
            if 'm' not in item:
                item['m'] = 0.0

            items.append(item)

        skip += len(records)
        print(f"  {skip} records fetched...", end='\r')
        if len(records) < top:
            break
        time.sleep(0.1)  # be polite
    print(f"\nCARMAP API: {len(items)} records")
    return items

# ── Method 2: CBSA bulk ZIP download ──────────────────────────────────────────
BULK_ZIP_URL = "https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/01-99/01-99-2026-0-eng.zip"

def fetch_bulk_zip():
    """Download the CBSA bulk ZIP and parse Excel files within it."""
    if not HAS_OPENPYXL:
        print("Skipping bulk ZIP (openpyxl not installed)")
        return []
    print(f"Downloading CBSA T2026 bulk ZIP...")
    try:
        r = requests.get(BULK_ZIP_URL, timeout=120, stream=True)
        r.raise_for_status()
    except Exception as e:
        print(f"  Bulk ZIP download failed: {e}")
        return []

    total = 0
    buf = io.BytesIO()
    for chunk in r.iter_content(32768):
        buf.write(chunk)
        total += len(chunk)
    print(f"  Downloaded {total/1024:.0f} KB")
    buf.seek(0)

    items = []
    try:
        z = zipfile.ZipFile(buf)
        xlsx_files = [n for n in z.namelist() if n.lower().endswith('.xlsx')]
        print(f"  Found {len(xlsx_files)} Excel files in ZIP")
        for fname in xlsx_files:
            with z.open(fname) as f:
                items.extend(parse_excel(io.BytesIO(f.read()), fname))
    except Exception as e:
        print(f"  ZIP parse error: {e}")
    return items

# Column header variants in CBSA Excel files
EXCEL_COL_VARIANTS = {
    'hs': ['tariff item', 'tariff number', 'hs', 'hs code', 'classification', 'number'],
    'desc': ['description', 'description of goods', 'goods'],
    'unit': ['unit', 'units', 'uom', 'unit of measure'],
    'm': ['mfn', 'most favoured nation', 'general preferential tariff', 'mfn rate'],
    'us': ['ust', 'cusma us', 'united states tariff', 'usmca us'],
    'mx': ['mxt', 'cusma mexico', 'mexico tariff'],
    'eu': ['ceut', 'ceta', 'european union tariff', 'eu tariff'],
    'cp': ['cptpp', 'cptpt', 'trans-pacific partnership'],
    'uk': ['ukt', 'united kingdom tariff', 'uk tariff'],
    'jp': ['jt', 'japan tariff', 'japan'],
    'kr': ['krt', 'korea tariff', 'korea'],
    'g': ['general tariff', 'column 2', 'gt'],
}

def find_col(headers, variants):
    lh = [str(h).lower().strip() for h in headers]
    for v in variants:
        for i, h in enumerate(lh):
            if v in h:
                return i
    return None

def parse_excel(f, fname):
    """Parse a CBSA chapter Excel file."""
    items = []
    try:
        wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows = list(ws.iter_rows(values_only=True))
            if not rows:
                continue
            # Find header row (first row with 'tariff' or 'hs' in it)
            header_row = None
            for i, row in enumerate(rows[:10]):
                cells = [str(c).lower() if c else '' for c in row]
                if any('tariff' in c or 'hs' in c or 'description' in c for c in cells):
                    header_row = i
                    break
            if header_row is None:
                continue
            headers = rows[header_row]
            col_hs = find_col(headers, EXCEL_COL_VARIANTS['hs'])
            col_desc = find_col(headers, EXCEL_COL_VARIANTS['desc'])
            col_unit = find_col(headers, EXCEL_COL_VARIANTS['unit'])
            col_m = find_col(headers, EXCEL_COL_VARIANTS['m'])
            if col_hs is None:
                continue
            col_map = {k: find_col(headers, EXCEL_COL_VARIANTS[k])
                       for k in ['m','us','mx','eu','cp','uk','jp','kr','g']}
            for row in rows[header_row+1:]:
                if not row or row[col_hs] is None:
                    continue
                hs = parse_hs(str(row[col_hs]))
                if not hs:
                    continue
                chapter = int(hs[:2])
                desc = str(row[col_desc]).strip() if col_desc is not None and row[col_desc] else ''
                unit = str(row[col_unit]).strip() if col_unit is not None and row[col_unit] else ''
                item = {'h': hs, 'c': chapter, 'd': desc, 'u': unit}
                for key, col_idx in col_map.items():
                    if col_idx is not None and len(row) > col_idx and row[col_idx] is not None:
                        rate = parse_rate(row[col_idx])
                        if rate is not None:
                            item[key] = rate
                if 'm' not in item:
                    item['m'] = 0.0
                items.append(item)
    except Exception as e:
        print(f"  Excel parse error in {fname}: {e}")
    return items

# ── Method 3: Individual chapter ZIPs ─────────────────────────────────────────
CHAPTER_URL = "https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/{ch:02d}/{ch:02d}-2026-0-eng.zip"

def fetch_by_chapter(chapters=range(1, 98)):
    """Download individual chapter ZIPs as fallback."""
    if not HAS_OPENPYXL:
        print("Skipping chapter ZIPs (openpyxl not installed)")
        return []
    items = []
    for ch in chapters:
        url = CHAPTER_URL.format(ch=ch)
        try:
            r = requests.get(url, timeout=30)
            if r.status_code == 404:
                continue
            r.raise_for_status()
            buf = io.BytesIO(r.content)
            z = zipfile.ZipFile(buf)
            for fname in z.namelist():
                if fname.lower().endswith('.xlsx'):
                    with z.open(fname) as f:
                        ch_items = parse_excel(io.BytesIO(f.read()), fname)
                        items.extend(ch_items)
                        print(f"  Ch {ch:02d}: {len(ch_items)} codes")
        except Exception as e:
            print(f"  Ch {ch:02d}: {e}")
    return items

# ── Merge with existing data ───────────────────────────────────────────────────
def merge_with_existing(new_items, existing_path):
    """Keep existing items for any HS codes not in new_items (FTA rates may be richer)."""
    if not existing_path.exists():
        return new_items
    with open(existing_path) as f:
        existing = json.load(f)
    existing_map = {r['h']: r for r in existing}
    new_map = {r['h']: r for r in new_items}
    # For items in both: prefer new but fill in FTA rates from existing if missing
    merged = []
    for hs, item in new_map.items():
        if hs in existing_map:
            ex = existing_map[hs]
            for k in ['us','mx','eu','cp','uk','jp','kr','g']:
                if k not in item and k in ex:
                    item[k] = ex[k]
        merged.append(item)
    # Add existing items not in new set
    for hs, item in existing_map.items():
        if hs not in new_map:
            merged.append(item)
    merged.sort(key=lambda r: r['h'])
    return merged

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("ResilienceHQ — Full Canadian Tariff Downloader")
    print("CBSA T2026 · All chapters 1-97")
    print("=" * 60)

    items = []

    # Try CARM OData API first (most structured)
    print("\n[1/3] Trying CBSA CARM OData API...")
    items = fetch_odata()

    # If API failed or returned too few, try bulk ZIP
    if len(items) < 5000:
        print(f"\n[2/3] CARM API returned {len(items)} items. Trying bulk ZIP download...")
        zip_items = fetch_bulk_zip()
        if len(zip_items) > len(items):
            items = zip_items

    # If still insufficient, try chapter-by-chapter
    if len(items) < 5000:
        print(f"\n[3/3] Bulk ZIP returned {len(items)} items. Trying chapter-by-chapter...")
        ch_items = fetch_by_chapter()
        if len(ch_items) > len(items):
            items = ch_items

    if not items:
        print("\nERROR: Could not fetch tariff data from any source.")
        print("Manual fallback: Download from https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/menu-eng.html")
        sys.exit(1)

    print(f"\n{len(items)} raw records fetched")

    # Deduplicate by HS code (keep last occurrence)
    by_hs = {}
    for item in items:
        by_hs[item['h']] = item
    items = sorted(by_hs.values(), key=lambda r: r['h'])
    print(f"{len(items)} unique HS codes after dedup")

    # Merge with existing (preserves FTA rates from existing file)
    print("Merging with existing tariff.json...")
    items = merge_with_existing(items, OUT_PATH)
    print(f"{len(items)} codes after merge")

    # Stats
    chapters_found = sorted(set(r['c'] for r in items))
    print(f"Chapters: {chapters_found[0]}-{chapters_found[-1]} ({len(chapters_found)} chapters)")
    dutiable = sum(1 for r in items if r.get('m', 0) > 0)
    print(f"Dutiable: {dutiable} / {len(items)}")

    # Backup existing
    if OUT_PATH.exists():
        import shutil
        shutil.copy(OUT_PATH, BACKUP_PATH)
        print(f"Backed up existing tariff.json → tariff-backup.json")

    # Write
    with open(OUT_PATH, 'w') as f:
        json.dump(items, f, separators=(',', ':'))
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"\n✓ Written {len(items)} codes to {OUT_PATH} ({size_kb:.0f} KB)")
    print("\nNext step: run 'node scripts/build-sections.js' to rebuild sections.json")

if __name__ == '__main__':
    main()
