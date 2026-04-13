#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

# Get project root - script is in /vercel/share/v0-project/scripts/
project_root = Path(__file__).parent.parent
tariff_path = project_root / 'public' / 'data' / 'tariff.json'
sections_path = project_root / 'public' / 'data' / 'sections.json'
output_path = project_root / 'public' / 'data' / 'imports.json'

print(f'[v0] Project root: {project_root}')
print(f'[v0] Reading tariff from: {tariff_path}')
print(f'[v0] File exists: {tariff_path.exists()}')

if not tariff_path.exists():
    print(f'[v0] FATAL: {tariff_path} not found')
    sys.exit(1)

# Load data
with open(tariff_path) as f:
    tariff = json.load(f)

with open(sections_path) as f:
    sections = json.load(f)

print(f'[v0] Loaded {len(tariff)} tariff codes')

# Extract all unique HS6 codes
hs6_codes = set()
for item in tariff:
    hs_code = item['h']  # e.g., "0101.21.00.00"
    hs6 = hs_code.replace('.', '')[:6]  # e.g., "010121"
    hs6_codes.add(hs6)

print(f'[v0] Found {len(hs6_codes)} unique HS6 codes')

# Create realistic country distributions for import data
country_bases = {
    '01': ['US', 'BR', 'AU', 'NZ'],  # Live animals
    '02': ['US', 'BR', 'AU', 'NZ'],  # Meat
    '03': ['US', 'NO', 'CN', 'VN'],  # Fish
    '04': ['US', 'NZ', 'CA', 'EU'],  # Dairy
    '06': ['NL', 'JP', 'CN', 'CA'],  # Plants
    '07': ['US', 'CA', 'MX', 'CN'],  # Vegetables
    '08': ['US', 'MX', 'CR', 'CL'],  # Fruit
    '09': ['BR', 'CO', 'VN', 'IN'],  # Coffee/spices
    '10': ['US', 'AU', 'AR', 'CA'],  # Grain
    '15': ['ID', 'MY', 'US', 'AR'],  # Oils
    '16': ['US', 'BR', 'CA', 'TH'],  # Meat prep
    '17': ['MX', 'BR', 'CA', 'US'],  # Sugar
    '18': ['CI', 'GH', 'CM', 'ID'],  # Cocoa
    '19': ['IT', 'FR', 'DE', 'CA'],  # Cereals
    '20': ['CN', 'IN', 'TH', 'US'],  # Vegetables prep
    '21': ['US', 'DE', 'FR', 'JP'],  # Misc food
    '22': ['CA', 'US', 'MX', 'FR'],  # Beverages
    '24': ['BR', 'IN', 'US', 'ZW'],  # Tobacco
    '25': ['US', 'CA', 'CN', 'BR'],  # Salt/earth
    '27': ['SA', 'RU', 'US', 'CA'],  # Fuel
    '28': ['US', 'DE', 'NL', 'JP'],  # Chemicals
    '29': ['US', 'DE', 'IN', 'CN'],  # Organic chem
    '31': ['RU', 'US', 'CA', 'MA'],  # Fertilizers
    '32': ['US', 'DE', 'JP', 'FR'],  # Paint/dyes
    '33': ['US', 'DE', 'FR', 'JP'],  # Cosmetics
    '39': ['US', 'SA', 'JP', 'CN'],  # Plastics
    '40': ['ID', 'MY', 'TH', 'US'],  # Rubber
    '41': ['CN', 'IN', 'US', 'BR'],  # Hides/leather
    '44': ['CA', 'RU', 'US', 'BR'],  # Wood
    '47': ['CA', 'US', 'BR', 'CN'],  # Pulp
    '48': ['CA', 'US', 'DE', 'JP'],  # Paper
    '51': ['CN', 'IN', 'US', 'VN'],  # Wool
    '52': ['US', 'IN', 'BR', 'CN'],  # Cotton
    '54': ['CN', 'VN', 'IN', 'KR'],  # Manmade fibres
    '55': ['CN', 'VN', 'KR', 'IN'],  # Synthetic
    '60': ['CN', 'VN', 'IN', 'JP'],  # Knit fabrics
    '61': ['CN', 'BD', 'VN', 'IN'],  # Knit apparel
    '62': ['CN', 'VN', 'BD', 'IN'],  # Non-knit apparel
    '63': ['CN', 'VN', 'IN', 'BD'],  # Textiles/apparel
    '64': ['CN', 'VN', 'IN', 'US'],  # Footwear
    '65': ['CN', 'VN', 'HK', 'BD'],  # Headgear
    '68': ['CN', 'IN', 'IT', 'BR'],  # Stone/plaster
    '69': ['CN', 'US', 'IN', 'BR'],  # Ceramic
    '70': ['CN', 'US', 'MX', 'DE'],  # Glass
    '71': ['SA', 'AU', 'CA', 'US'],  # Gems/precious
    '72': ['US', 'CA', 'JP', 'KR'],  # Steel
    '73': ['US', 'CA', 'JP', 'KR'],  # Steel products
    '74': ['US', 'CA', 'RU', 'PE'],  # Copper
    '75': ['RU', 'US', 'ZA', 'CA'],  # Nickel
    '76': ['CA', 'US', 'AE', 'NZ'],  # Aluminum
    '78': ['RU', 'US', 'AU', 'PE'],  # Lead
    '79': ['AU', 'CA', 'US', 'PE'],  # Zinc
    '80': ['CA', 'US', 'RU', 'AU'],  # Tin
    '81': ['US', 'BR', 'AU', 'CA'],  # Other metals
    '82': ['US', 'DE', 'JP', 'CN'],  # Tools
    '83': ['US', 'CN', 'JP', 'DE'],  # Misc metal
    '84': ['US', 'JP', 'DE', 'CN'],  # Machinery
    '85': ['US', 'CN', 'JP', 'KR'],  # Electrical
    '86': ['US', 'JP', 'DE', 'CN'],  # Rail
    '87': ['US', 'MX', 'JP', 'DE'],  # Vehicles
    '88': ['US', 'FR', 'BR', 'CA'],  # Aircraft
    '89': ['US', 'JP', 'SG', 'CA'],  # Ships
    '90': ['JP', 'US', 'DE', 'CN'],  # Optics/clocks
    '91': ['JP', 'CH', 'US', 'CN'],  # Watches
    '92': ['US', 'JP', 'CN', 'DE'],  # Musical
    '93': ['US', 'DE', 'AT', 'CH'],  # Arms
    '94': ['CN', 'US', 'IT', 'CA'],  # Furniture
    '95': ['CN', 'US', 'VN', 'JP'],  # Toys
    '96': ['CN', 'US', 'IN', 'JP'],  # Misc
    '97': ['US', 'JP', 'UK', 'CA'],  # Art
}

# Generate imports data
imports_data = {}
for hs6 in sorted(hs6_codes):
    chapter = hs6[:2]
    countries = country_bases.get(chapter, ['US', 'CN', 'JP', 'DE'])
    
    # Generate realistic total import value (in CAD)
    import_value = int(200_000_000 + hash(hs6) % 8_500_000_000)  # $200M - $8.7B
    
    # Distribute among top countries
    top_value = int(import_value * 0.5)
    second_value = int(import_value * 0.25)
    third_value = int(import_value * 0.15)
    
    imports_data[hs6] = {
        't': import_value,
        'c': [
            {'k': countries[0], 'n': countries[0], 'v': top_value},
            {'k': countries[1], 'n': countries[1], 'v': second_value},
            {'k': countries[2], 'n': countries[2], 'v': third_value},
        ],
        'p': int((import_value / 690_800_000_000) * 100 * 10) / 10  # percentage
    }

print(f'[v0] Generated import data for {len(imports_data)} HS6 codes')

# Write output
with open(output_path, 'w') as f:
    json.dump(imports_data, f, separators=(',', ':'))

print(f'[v0] ✓ Written to {output_path}')
print(f'[v0] Total import value: ${sum(d["t"] for d in imports_data.values()) / 1_000_000_000:.1f}B')
