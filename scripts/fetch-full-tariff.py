#!/usr/bin/env python3
"""
fetch-full-tariff.py — ResilienceHQ full Canadian tariff downloader
====================================================================
Downloads all ~10,900 HS10 codes from the CBSA T2026 Customs Tariff
and writes public/data/tariff.json.

Run from project root:
    pip install requests beautifulsoup4 openpyxl lxml
    python3 scripts/fetch-full-tariff.py

Strategy (tries in order until enough codes found):
  1. CBSA bulk chapter ZIP files (01-02, 01-99, etc.)
  2. CBSA HTML chapter pages (scrape tariff tables)
  3. CBSA chapter Excel files
  4. CARM OData API (paginated)
"""

import json, re, sys, os, io, time, zipfile, shutil
from pathlib import Path

try:
    import requests
    requests.packages.urllib3.disable_warnings()
except ImportError:
    sys.exit("Missing: pip install requests")

HAS_BS4 = False
try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    print("WARNING: beautifulsoup4 not installed — HTML scraping disabled. pip install beautifulsoup4 lxml")

HAS_XLSX = False
try:
    import openpyxl
    HAS_XLSX = True
except ImportError:
    print("WARNING: openpyxl not installed — Excel parsing disabled. pip install openpyxl")

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
OUT  = ROOT / "public" / "data" / "tariff.json"
BKP  = ROOT / "public" / "data" / "tariff-backup.json"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; ResilienceHQ-Scraper/1.0; +https://ngen.ca)',
    'Accept-Language': 'en-CA,en;q=0.9',
}

# ── Helpers ────────────────────────────────────────────────────────────────────
def parse_rate(val):
    if val is None: return None
    s = str(val).strip()
    if not s or s in ('—', '-', 'N/A'): return None
    if s.lower() in ('free', 'franc', '0%', '0'): return 0.0
    m = re.search(r'(\d+(?:\.\d+)?)\s*%', s)
    if m: return float(m.group(1))
    m = re.match(r'^(\d+(?:\.\d+)?)$', s)
    if m: return float(m.group(1))
    return None

def fmt_hs(digits):
    d = re.sub(r'\D', '', str(digits))
    if len(d) < 8: return None
    d = (d + '0' * 10)[:10]
    return f"{d[0:4]}.{d[4:6]}.{d[6:8]}.{d[8:10]}"

def chapter_of(hs): return int(re.sub(r'\D','',hs)[:2])

def get(url, **kw):
    kw.setdefault('timeout', 30)
    kw.setdefault('verify', False)
    kw.setdefault('headers', HEADERS)
    try:
        r = requests.get(url, **kw)
        r.raise_for_status()
        return r
    except Exception as e:
        return None

# ── Method 1: CBSA bulk ZIP ────────────────────────────────────────────────────
BULK_URLS = [
    "https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/01-99/01-99-2026-0-eng.zip",
    "https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/01-97/01-97-2026-0-eng.zip",
]

def parse_xlsx_bytes(data, label=""):
    if not HAS_XLSX: return []
    items = []
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        for ws in wb.worksheets:
            rows = list(ws.iter_rows(values_only=True))
            hdr_row = next((i for i,r in enumerate(rows[:15])
                           if r and any(str(c).lower().strip() in
                               ('tariff item','tariff number','hs','hs code','number')
                               for c in r if c)), None)
            if hdr_row is None: continue
            hdrs = [str(c).lower().strip() if c else '' for c in rows[hdr_row]]

            def col(keywords):
                for k in keywords:
                    for i,h in enumerate(hdrs):
                        if k in h: return i
                return None

            c_hs   = col(['tariff item','tariff number','hs code','number'])
            c_desc = col(['description','goods'])
            c_unit = col(['unit','uom'])
            c_mfn  = col(['mfn','most favour','mfnt'])
            c_us   = col(['ust','cusma us','united states tariff','usmca'])
            c_mx   = col(['mxt','mexico tariff','cusma mex'])
            c_eu   = col(['ceut','ceta','european'])
            c_cp   = col(['cptpp','cptpt','trans-pacific'])
            c_uk   = col(['ukt','united kingdom','uk tariff'])
            c_jp   = col(['jt','japan tariff',' japan'])
            c_kr   = col(['krt','korea tariff',' korea'])
            c_g    = col(['general tariff','column 2','gt'])

            if c_hs is None: continue
            for row in rows[hdr_row+1:]:
                if not row or row[c_hs] is None: continue
                hs = fmt_hs(row[c_hs])
                if not hs: continue
                def rv(ci): return parse_rate(row[ci]) if ci is not None and ci < len(row) else None
                item = {'h':hs,'c':chapter_of(hs),
                        'd':str(row[c_desc] or '').strip() if c_desc else '',
                        'u':str(row[c_unit] or '').strip() if c_unit else '',
                        'm':rv(c_mfn) or 0.0}
                for k,ci in [('us',c_us),('mx',c_mx),('eu',c_eu),('cp',c_cp),
                             ('uk',c_uk),('jp',c_jp),('kr',c_kr),('g',c_g)]:
                    v = rv(ci)
                    if v is not None: item[k] = v
                items.append(item)
    except Exception as e:
        print(f"  xlsx parse error in {label}: {e}")
    return items

def try_bulk_zip():
    for url in BULK_URLS:
        print(f"  Trying: {url}")
        r = get(url, stream=True, timeout=120)
        if not r:
            print("    → failed")
            continue
        buf = io.BytesIO()
        for chunk in r.iter_content(65536):
            buf.write(chunk)
        buf.seek(0)
        print(f"    → {buf.tell()/1024:.0f} KB downloaded")
        try:
            z = zipfile.ZipFile(buf)
            items = []
            for name in z.namelist():
                if name.lower().endswith('.xlsx'):
                    items.extend(parse_xlsx_bytes(z.read(name), name))
            if items:
                print(f"    → {len(items)} codes from {len(z.namelist())} files")
                return items
        except Exception as e:
            print(f"    → zip error: {e}")
    return []

# ── Method 2: HTML chapter scraping ───────────────────────────────────────────
# CBSA publishes each chapter as HTML; URL patterns vary by year
CHAPTER_HTML_PATTERNS = [
    "https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/{ch:02d}/{ch:02d}-2026-0-eng.html",
    "https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/{ch:02d}-{ch2:02d}/{ch:02d}-2026-0-eng.html",
]
CHAPTER_XLSX_PATTERNS = [
    "https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/{ch:02d}/{ch:02d}-2026-0-eng.xlsx",
]

# FTA column headers in CBSA HTML tables
HTML_FTA_COLS = {
    'UST': 'us', 'MXT': 'mx', 'CEUT': 'eu', 'CPTPT': 'cp',
    'UKT': 'uk', 'JT': 'jp', 'KRT': 'kr', 'GPT': None, 'LDCT': None,
    'MFN': 'm', 'General Tariff': 'g',
}

def scrape_chapter_html(ch):
    if not HAS_BS4: return []
    for pat in CHAPTER_HTML_PATTERNS:
        url = pat.format(ch=ch, ch2=ch)
        r = get(url)
        if not r: continue
        items = parse_html_table(r.text, ch)
        if items:
            return items
    return []

def parse_html_table(html, ch):
    soup = BeautifulSoup(html, 'lxml')
    items = []
    for table in soup.find_all('table'):
        headers = []
        hdr_row = table.find('tr')
        if not hdr_row: continue
        headers = [th.get_text(strip=True) for th in hdr_row.find_all(['th','td'])]
        if not any('tariff' in h.lower() or 'hs' in h.lower() for h in headers):
            continue

        col_map = {}
        for i, h in enumerate(headers):
            hn = h.upper().replace('.','').strip()
            if hn in HTML_FTA_COLS and HTML_FTA_COLS[hn]:
                col_map[HTML_FTA_COLS[hn]] = i
            elif 'MFN' in hn or 'MOST FAVOUR' in hn:
                col_map['m'] = i
            elif 'DESCRIPTION' in hn:
                col_map['d'] = i
            elif 'UNIT' in hn:
                col_map['u'] = i
            elif 'TARIFF ITEM' in hn or 'HS' == hn or 'NUMBER' in hn:
                col_map['h'] = i

        if 'h' not in col_map: continue

        for row in table.find_all('tr')[1:]:
            cells = [td.get_text(strip=True) for td in row.find_all(['td','th'])]
            if not cells: continue
            hs = fmt_hs(cells[col_map['h']])
            if not hs: continue
            item = {
                'h': hs, 'c': ch,
                'd': cells[col_map['d']] if 'd' in col_map and col_map['d'] < len(cells) else '',
                'u': cells[col_map['u']] if 'u' in col_map and col_map['u'] < len(cells) else '',
                'm': parse_rate(cells[col_map['m']]) if 'm' in col_map and col_map['m'] < len(cells) else 0.0,
            }
            item['m'] = item['m'] or 0.0
            for k in ['us','mx','eu','cp','uk','jp','kr','g']:
                if k in col_map and col_map[k] < len(cells):
                    v = parse_rate(cells[col_map[k]])
                    if v is not None: item[k] = v
            items.append(item)
        if items: break
    return items

def try_html_chapters():
    items = []
    for ch in range(1, 98):
        ch_items = scrape_chapter_html(ch)
        if ch_items:
            items.extend(ch_items)
            print(f"  Ch {ch:02d}: {len(ch_items)} codes", end='\r')
        else:
            # Try XLSX per chapter
            for pat in CHAPTER_XLSX_PATTERNS:
                url = pat.format(ch=ch)
                r = get(url)
                if r:
                    xl = parse_xlsx_bytes(r.content, f"ch{ch:02d}")
                    if xl:
                        items.extend(xl)
                        print(f"  Ch {ch:02d}: {len(xl)} codes (xlsx)", end='\r')
                        break
        time.sleep(0.15)
    print()
    return items

# ── Method 3: CARM OData API ───────────────────────────────────────────────────
ODATA_PATHS = [
    "/opendata/tariff/v1/tariffClassifications",
    "/api/tariff/v1/tariffClassifications",
    "/tariff/v1/tariffClassifications",
    "/opendata/tariffClassifications",
]
CARM_BASE = "https://ccp-pcc.cbsa-asfc.cloud-nuage.canada.ca"

CARM_FIELD_MAP = {
    'TariffNumber':'h', 'Description':'d', 'UnitOfMeasure':'u',
    'MostFavouredNationTariffRate':'m', 'MFNRate':'m',
    'UnitedStatesTariffRate':'us', 'CUSMAUSTariffRate':'us',
    'MexicoTariffRate':'mx', 'CUSMAMexicoTariffRate':'mx',
    'EuropeanUnionTariffRate':'eu', 'CETATariffRate':'eu',
    'CPTPPTariffRate':'cp', 'UKTariffRate':'uk',
    'JapanTariffRate':'jp', 'KoreaTariffRate':'kr',
    'GeneralTariffRate':'g',
}

def try_odata():
    # Discover correct path
    path = None
    for p in ODATA_PATHS:
        r = get(f"{CARM_BASE}{p}?$top=1&$format=json")
        if r and r.status_code == 200:
            try:
                data = r.json()
                if 'value' in data or isinstance(data, list):
                    path = p
                    print(f"  Found working OData path: {p}")
                    break
            except: pass
    if not path:
        print("  OData API not reachable — no valid endpoint found")
        return []

    items = []
    skip = 0
    while True:
        r = get(f"{CARM_BASE}{path}?$top=500&$skip={skip}&$format=json")
        if not r: break
        try:
            data = r.json()
            records = data.get('value', data if isinstance(data, list) else [])
            if not records: break
            for rec in records:
                hs = fmt_hs(rec.get('TariffNumber','') or rec.get('tariffNumber',''))
                if not hs: continue
                item = {'h':hs,'c':chapter_of(hs),'d':'','u':'','m':0.0}
                for src,dst in CARM_FIELD_MAP.items():
                    v = rec.get(src)
                    if v is None: continue
                    if dst in ('h','d','u'): item[dst] = str(v).strip()
                    else:
                        r2 = parse_rate(v)
                        if r2 is not None: item[dst] = r2
                items.append(item)
            skip += len(records)
            print(f"  {skip} codes...", end='\r')
            if len(records) < 500: break
            time.sleep(0.1)
        except: break
    print()
    return items

# ── Merge with existing data ───────────────────────────────────────────────────
def merge(new_items, existing_path):
    if not existing_path.exists():
        return new_items
    with open(existing_path) as f:
        existing = {r['h']:r for r in json.load(f)}
    new_map = {r['h']:r for r in new_items}
    # New items take precedence; fill missing FTA rates from existing
    for hs,item in new_map.items():
        if hs in existing:
            for k in ['us','mx','eu','cp','uk','jp','kr','g']:
                if k not in item and k in existing[hs]:
                    item[k] = existing[hs][k]
    # Keep existing items not found in new
    merged = list(new_map.values())
    for hs,item in existing.items():
        if hs not in new_map:
            merged.append(item)
    return sorted(merged, key=lambda r: r['h'])

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("ResilienceHQ — Full Canadian Tariff (CBSA T2026)")
    print("=" * 60)

    items = []

    print("\n[1/3] CBSA bulk ZIP download...")
    items = try_bulk_zip()
    print(f"      → {len(items)} codes")

    if len(items) < 3000:
        print("\n[2/3] CBSA chapter-by-chapter HTML/Excel scraping...")
        ch_items = try_html_chapters()
        print(f"      → {len(ch_items)} codes")
        if len(ch_items) > len(items):
            items = ch_items

    if len(items) < 3000:
        print("\n[3/3] CARM OData API...")
        api_items = try_odata()
        print(f"      → {len(api_items)} codes")
        if len(api_items) > len(items):
            items = api_items

    if not items:
        print("\nERROR: No data fetched. Check network/VPN and retry.")
        print("Manual download: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/menu-eng.html")
        sys.exit(1)

    # Deduplicate
    by_hs = {r['h']:r for r in items}
    items = sorted(by_hs.values(), key=lambda r: r['h'])
    print(f"\n{len(items)} unique HS codes")

    # Merge with existing file (preserves FTA rates)
    items = merge(items, OUT)
    print(f"{len(items)} after merge with existing data")

    # Stats
    chs = sorted(set(r['c'] for r in items))
    dutiable = sum(1 for r in items if r.get('m',0) > 0)
    print(f"Chapters: {chs[0]}–{chs[-1]} ({len(chs)} chapters)")
    print(f"Dutiable: {dutiable:,} / {len(items):,}")

    # Backup + write
    if OUT.exists():
        shutil.copy(OUT, BKP)
        print(f"Backed up → tariff-backup.json")

    with open(OUT, 'w') as f:
        json.dump(items, f, separators=(',',':'))
    print(f"\n✓ {len(items):,} codes → {OUT}  ({OUT.stat().st_size//1024} KB)")
    print("\nNext steps:")
    print("  node scripts/build-sections.js")
    print("  npx vercel --prod")

if __name__ == '__main__':
    main()
