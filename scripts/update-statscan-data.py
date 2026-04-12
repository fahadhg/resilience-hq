#!/usr/bin/env python3
"""
StatsCan Data Update Script
Fetches latest data from Statistics Canada and updates JSON files
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
import urllib.request
import urllib.error

# Project structure
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / 'public' / 'data'
INTEL_DIR = DATA_DIR / 'intel'

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
INTEL_DIR.mkdir(parents=True, exist_ok=True)

STATSCAN_WDS = 'https://www150.statcan.gc.ca/t1/wds/rest'

# StatsCan Vector IDs (from Table 16-10-0014-01, 16-10-0117-01, etc.)
MFG_SALES_VECTORS = {
    'Total manufacturing': 111380109,
    'Food manufacturing': 111380110,
    'Beverage and tobacco': 111380111,
    'Paper manufacturing': 111380116,
    'Petroleum and coal': 111380118,
    'Chemical manufacturing': 111380119,
    'Plastics and rubber': 111380120,
    'Primary metal': 111380122,
    'Fabricated metal': 111380123,
    'Machinery': 111380124,
    'Computer and electronic': 111380125,
    'Electrical equipment': 111380126,
    'Transportation equipment': 111380127,
    'Furniture': 111380129,
}

CAPACITY_VECTORS = {
    'Total manufacturing': 41707442,
    'Food, beverage, tobacco': 41707444,
    'Paper manufacturing': 41707448,
    'Petroleum and coal': 41707450,
    'Chemical manufacturing': 41707451,
    'Plastics and rubber': 41707452,
    'Primary metal': 41707454,
    'Fabricated metal': 41707455,
    'Machinery': 41707456,
    'Computer and electronic': 41707457,
    'Electrical equipment': 41707458,
    'Transportation equipment': 41707459,
}

IPPI_VECTORS = {
    'Iron and steel products': 41691072,
    'Non-ferrous metal products': 41691073,
    'Machinery and equipment': 41691074,
    'Chemicals and plastics': 41691075,
    'Wood, pulp, and paper': 41691076,
}

RMPI_VECTORS = {
    'Iron and steel': 41691143,
    'Non-ferrous metals': 41691144,
    'Machinery': 41691145,
    'Motor vehicle parts': 41691146,
}

# Import section vectors (Table 12-10-0099-01 - HS sections)
IMPORT_SECTION_VECTORS = {
    '1': {'name': 'Live Animals', 'vectorId': 10597841},
    '2': {'name': 'Vegetable Products', 'vectorId': 10597842},
    '3': {'name': 'Animal or Veg Fats', 'vectorId': 10597843},
    '4': {'name': 'Prepared Foods', 'vectorId': 10597844},
    '5': {'name': 'Mineral Products', 'vectorId': 10597845},
    '6': {'name': 'Chemicals', 'vectorId': 10597846},
    '7': {'name': 'Plastics & Rubber', 'vectorId': 10597847},
    '8': {'name': 'Hides & Skins', 'vectorId': 10597848},
    '9': {'name': 'Wood Products', 'vectorId': 10597849},
    '10': {'name': 'Pulp & Paper', 'vectorId': 10597850},
    '11': {'name': 'Textiles', 'vectorId': 10597851},
}

def fetch_vector(vector_id, limit=13):
    """Fetch data from StatsCan for a specific vector."""
    try:
        url = f'{STATSCAN_WDS}/getDataFromVectorAndLatestNPeriods/{vector_id}/{limit}'
        with urllib.request.urlopen(url, timeout=10) as response:
            return json.loads(response.read().decode())
    except (urllib.error.URLError, json.JSONDecodeError, Exception) as e:
        print(f'  Error fetching vector {vector_id}: {e}')
        return None

def get_latest(data):
    """Extract latest value from StatsCan response."""
    if not data or 'seriesArray' not in data:
        return {'period': 'N/A', 'value': 0}
    series = data.get('seriesArray', [{}])[0]
    objs = series.get('vectorObserv', [])
    if not objs:
        return {'period': 'N/A', 'value': 0}
    latest = objs[0]
    return {
        'period': latest.get('refPer', 'N/A'),
        'value': float(latest.get('value', 0)) if latest.get('value') else 0
    }

def calc_yoy(data):
    """Calculate year-over-year change."""
    if not data or 'seriesArray' not in data:
        return 'N/A'
    objs = data.get('seriesArray', [{}])[0].get('vectorObserv', [])
    if len(objs) < 13:
        return 'N/A'
    current = float(objs[0].get('value', 0)) if objs[0].get('value') else None
    year_ago = float(objs[12].get('value', 0)) if objs[12].get('value') else None
    if current is None or year_ago is None or year_ago == 0:
        return 'N/A'
    return f'{((current - year_ago) / year_ago * 100):.1f}'

def update_data():
    """Main function to fetch and update all data files."""
    print('Fetching data from Statistics Canada Web Data Service...\n')
    timestamp = datetime.now().isoformat().split('T')[0]

    # 1. Manufacturing Sales
    print('1. Fetching manufacturing sales (Table 16-10-0117-01)...')
    mfg_data = {}
    for industry, vector_id in MFG_SALES_VECTORS.items():
        result = fetch_vector(vector_id)
        if result:
            mfg_data[industry] = result
    print(f'   Found data for {len(mfg_data)} industries')

    # 2. Capacity Utilization
    print('2. Fetching capacity utilization (Table 16-10-0014-01)...')
    capacity_data = {}
    for industry, vector_id in CAPACITY_VECTORS.items():
        result = fetch_vector(vector_id, 5)
        if result:
            capacity_data[industry] = result
    print(f'   Found data for {len(capacity_data)} industries')

    # 3. IPPI
    print('3. Fetching IPPI data (Table 18-10-0034-01)...')
    ippi_data = {}
    for product, vector_id in IPPI_VECTORS.items():
        result = fetch_vector(vector_id)
        if result:
            ippi_data[product] = result
    print(f'   Found data for {len(ippi_data)} products')

    # 4. RMPI
    print('4. Fetching RMPI data (Table 18-10-0267-01)...')
    rmpi_data = {}
    for commodity, vector_id in RMPI_VECTORS.items():
        result = fetch_vector(commodity)
        if result:
            rmpi_data[commodity] = result
    print(f'   Found data for {len(rmpi_data)} commodities')

    # 5. Import sections
    print('5. Fetching import data by HS section (Table 12-10-0099-01)...')
    import_data = {}
    for section_id, info in IMPORT_SECTION_VECTORS.items():
        result = fetch_vector(info['vectorId'])
        if result:
            import_data[section_id] = result
    print(f'   Found data for {len(import_data)} HS sections')

    # Build mfg-health.json
    print('\nBuilding mfg-health.json...')
    mfg_health = {
        'source': 'Statistics Canada, Table 16-10-0117-01 (Sales) / 16-10-0014-01 (Capacity)',
        'generated': timestamp,
        'note': 'Monthly Survey of Manufacturing — seasonally adjusted, millions $',
        'sales': [
            {
                'naics': '31-33' if industry == 'Total manufacturing' else '',
                'industry': industry,
                'period': get_latest(mfg_data.get(industry))['period'],
                'value': get_latest(mfg_data.get(industry))['value'],
                'unit': 'millions $',
                'yoy': calc_yoy(mfg_data.get(industry)),
            }
            for industry in MFG_SALES_VECTORS.keys()
        ],
        'capacity': [
            {
                'industry': industry,
                'period': get_latest(capacity_data.get(industry))['period'],
                'rate': get_latest(capacity_data.get(industry))['value'],
            }
            for industry in CAPACITY_VECTORS.keys()
        ],
    }

    # Build input-costs.json
    print('Building input-costs.json...')
    input_costs = {
        'source': 'Statistics Canada, Table 18-10-0034-01 (IPPI) / 18-10-0267-01 (RMPI)',
        'generated': timestamp,
        'note': 'Price indices, 2012=100 base. YoY = year-over-year % change.',
        'alerts': [
            {
                'product': product,
                'yoy': float(calc_yoy(ippi_data.get(product))) if calc_yoy(ippi_data.get(product)) != 'N/A' else 0,
                'latest': get_latest(ippi_data.get(product))['value'],
                'severity': 'high' if abs(float(calc_yoy(ippi_data.get(product)) if calc_yoy(ippi_data.get(product)) != 'N/A' else 0)) > 10 else 'medium' if abs(float(calc_yoy(ippi_data.get(product)) if calc_yoy(ippi_data.get(product)) != 'N/A' else 0)) > 5 else 'low',
            }
            for product in IPPI_VECTORS.keys()
        ],
        'ippi': [
            {
                'product': f'{product} (HS linked)',
                'yoy': calc_yoy(ippi_data.get(product)),
                'latest': [
                    {'period': obs.get('refPer'), 'index': float(obs.get('value', 0))}
                    for obs in ippi_data.get(product, {}).get('seriesArray', [{}])[0].get('vectorObserv', [])[:13]
                ],
            }
            for product in IPPI_VECTORS.keys()
        ],
        'rmpi': [
            {
                'commodity': f'{commodity} (HS linked)',
                'yoy': calc_yoy(rmpi_data.get(commodity)),
                'latest': [
                    {'period': obs.get('refPer'), 'index': float(obs.get('value', 0))}
                    for obs in rmpi_data.get(commodity, {}).get('seriesArray', [{}])[0].get('vectorObserv', [])[:13]
                ],
            }
            for commodity in RMPI_VECTORS.keys()
        ],
    }

    # Write files
    print('\nWriting updated data files...')
    
    mfg_health_path = INTEL_DIR / 'mfg-health.json'
    with open(mfg_health_path, 'w') as f:
        json.dump(mfg_health, f, indent=2)
    print(f'   ✓ {mfg_health_path.relative_to(PROJECT_ROOT)}')

    input_costs_path = INTEL_DIR / 'input-costs.json'
    with open(input_costs_path, 'w') as f:
        json.dump(input_costs, f, indent=2)
    print(f'   ✓ {input_costs_path.relative_to(PROJECT_ROOT)}')

    # Update sections.json if it exists
    sections_path = DATA_DIR / 'sections.json'
    if sections_path.exists():
        print('Updating sections.json with import data...')
        with open(sections_path, 'r') as f:
            sections = json.load(f)
        
        for section_id, info in IMPORT_SECTION_VECTORS.items():
            section_idx = int(section_id) - 1
            if section_idx < len(sections):
                latest = get_latest(import_data.get(section_id))
                sections[section_idx]['totalImports'] = latest['value'] * 1000  # Convert from thousands
                sections[section_idx]['dataSource'] = 'StatsCan Table 12-10-0099-01'
                sections[section_idx]['dataPeriod'] = latest['period']
        
        with open(sections_path, 'w') as f:
            json.dump(sections, f, indent=2)
        print(f'   ✓ {sections_path.relative_to(PROJECT_ROOT)}')

    print(f'\n✓ Data update complete! Generated: {timestamp}')

if __name__ == '__main__':
    try:
        update_data()
    except Exception as e:
        print(f'Error: {e}', file=sys.stderr)
        sys.exit(1)
