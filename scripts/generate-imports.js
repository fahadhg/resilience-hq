/**
 * Generate realistic import data for each HS code based on section totals
 * Uses power law distribution to simulate real trade patterns
 */

const fs = require('fs');
const path = require('path');

const sectionsPath = path.join(__dirname, '../public/data/sections.json');
const tariffPath = path.join(__dirname, '../public/data/tariff.json');
const outputPath = path.join(__dirname, '../public/data/imports.json');

console.log('[v0] Script directory:', __dirname);
console.log('[v0] Sections path:', sectionsPath);

// Ensure paths exist
if (!fs.existsSync(sectionsPath)) {
  console.error('[v0] sections.json not found at:', sectionsPath);
  process.exit(1);
}
if (!fs.existsSync(tariffPath)) {
  console.error('[v0] tariff.json not found at:', tariffPath);
  process.exit(1);
}

// Country codes with realistic trade shares
const COUNTRY_POOLS = {
  americas: [
    { k: 'US', n: 'United States', weight: 0.55 },
    { k: 'MX', n: 'Mexico', weight: 0.15 },
    { k: 'BR', n: 'Brazil', weight: 0.08 },
    { k: 'CL', n: 'Chile', weight: 0.04 },
    { k: 'PE', n: 'Peru', weight: 0.03 },
    { k: 'CO', n: 'Colombia', weight: 0.02 }
  ],
  asia: [
    { k: 'CN', n: 'China', weight: 0.35 },
    { k: 'JP', n: 'Japan', weight: 0.12 },
    { k: 'KR', n: 'South Korea', weight: 0.10 },
    { k: 'VN', n: 'Vietnam', weight: 0.12 },
    { k: 'IN', n: 'India', weight: 0.08 },
    { k: 'TW', n: 'Taiwan', weight: 0.06 },
    { k: 'TH', n: 'Thailand', weight: 0.04 },
    { k: 'MY', n: 'Malaysia', weight: 0.04 },
    { k: 'ID', n: 'Indonesia', weight: 0.04 },
    { k: 'BD', n: 'Bangladesh', weight: 0.03 },
    { k: 'PH', n: 'Philippines', weight: 0.02 }
  ],
  europe: [
    { k: 'DE', n: 'Germany', weight: 0.25 },
    { k: 'FR', n: 'France', weight: 0.12 },
    { k: 'IT', n: 'Italy', weight: 0.12 },
    { k: 'GB', n: 'United Kingdom', weight: 0.10 },
    { k: 'NL', n: 'Netherlands', weight: 0.08 },
    { k: 'CH', n: 'Switzerland', weight: 0.08 },
    { k: 'ES', n: 'Spain', weight: 0.06 },
    { k: 'IE', n: 'Ireland', weight: 0.05 },
    { k: 'BE', n: 'Belgium', weight: 0.04 },
    { k: 'SE', n: 'Sweden', weight: 0.04 },
    { k: 'AT', n: 'Austria', weight: 0.03 },
    { k: 'PL', n: 'Poland', weight: 0.03 }
  ],
  oceania: [
    { k: 'AU', n: 'Australia', weight: 0.70 },
    { k: 'NZ', n: 'New Zealand', weight: 0.30 }
  ],
  other: [
    { k: 'SA', n: 'Saudi Arabia', weight: 0.25 },
    { k: 'ZA', n: 'South Africa', weight: 0.15 },
    { k: 'TR', n: 'Turkey', weight: 0.12 },
    { k: 'IL', n: 'Israel', weight: 0.10 },
    { k: 'AE', n: 'UAE', weight: 0.10 },
    { k: 'NG', n: 'Nigeria', weight: 0.08 }
  ]
};

// Section-specific country mixes based on real trade patterns
const SECTION_MIXES = {
  1: { americas: 0.60, oceania: 0.25, europe: 0.10, asia: 0.05 },  // Animals
  2: { americas: 0.70, asia: 0.15, europe: 0.10, other: 0.05 },    // Vegetables
  3: { americas: 0.50, asia: 0.35, europe: 0.10, other: 0.05 },    // Fats
  4: { americas: 0.55, europe: 0.25, asia: 0.15, other: 0.05 },    // Food
  5: { americas: 0.80, other: 0.15, europe: 0.05 },                // Minerals
  6: { americas: 0.50, europe: 0.25, asia: 0.20, other: 0.05 },    // Chemicals
  7: { americas: 0.65, asia: 0.25, europe: 0.08, other: 0.02 },    // Plastics
  8: { asia: 0.55, americas: 0.20, europe: 0.20, other: 0.05 },    // Leather
  9: { americas: 0.60, asia: 0.30, europe: 0.08, other: 0.02 },    // Wood
  10: { americas: 0.75, asia: 0.15, europe: 0.08, other: 0.02 },   // Paper
  11: { asia: 0.65, americas: 0.15, europe: 0.15, other: 0.05 },   // Textiles
  12: { asia: 0.75, europe: 0.12, americas: 0.10, other: 0.03 },   // Footwear
  13: { americas: 0.55, asia: 0.30, europe: 0.12, other: 0.03 },   // Stone
  14: { americas: 0.35, europe: 0.30, other: 0.25, asia: 0.10 },   // Jewellery
  15: { americas: 0.55, asia: 0.30, europe: 0.12, other: 0.03 },   // Metals
  16: { americas: 0.45, asia: 0.40, europe: 0.12, other: 0.03 },   // Machinery
  17: { americas: 0.70, asia: 0.18, europe: 0.10, other: 0.02 },   // Vehicles
  18: { americas: 0.50, asia: 0.25, europe: 0.22, other: 0.03 },   // Optical
  19: { americas: 0.65, europe: 0.25, asia: 0.08, other: 0.02 },   // Arms
  20: { asia: 0.55, americas: 0.30, europe: 0.12, other: 0.03 }    // Misc
};

function powerLaw(count, total, alpha = 1.5) {
  // Generate power law distributed values
  const raw = [];
  for (let i = 0; i < count; i++) {
    raw.push(Math.pow(Math.random(), alpha));
  }
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(v => Math.round((v / sum) * total));
}

function pickCountries(sectionId, value) {
  const mix = SECTION_MIXES[sectionId] || SECTION_MIXES[16];
  const countries = [];
  
  for (const [region, share] of Object.entries(mix)) {
    const pool = COUNTRY_POOLS[region] || [];
    const regionValue = value * share;
    
    // Pick 1-3 countries from this region
    const numCountries = Math.min(pool.length, Math.floor(Math.random() * 3) + 1);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < numCountries; i++) {
      const country = shuffled[i];
      const countryValue = Math.round(regionValue * country.weight * (0.8 + Math.random() * 0.4));
      if (countryValue > 0) {
        countries.push({ k: country.k, n: country.n, v: countryValue });
      }
    }
  }
  
  // Sort by value descending and take top 3-5
  return countries.sort((a, b) => b.v - a.v).slice(0, Math.floor(Math.random() * 3) + 3);
}

async function main() {
  console.log('Loading data files...');
  
  const sections = JSON.parse(fs.readFileSync(sectionsPath, 'utf-8'));
  const tariff = JSON.parse(fs.readFileSync(tariffPath, 'utf-8'));
  
  console.log(`Sections: ${sections.length}`);
  console.log(`Tariff codes: ${tariff.length}`);
  
  // Group tariff codes by section (based on chapter)
  const chapterToSection = {};
  for (const sec of sections) {
    for (const ch of sec.chapters) {
      chapterToSection[ch] = sec;
    }
  }
  
  const imports = {};
  
  for (const item of tariff) {
    const hsCode = item.h;
    const chapter = parseInt(hsCode.substring(0, 2), 10);
    const section = chapterToSection[chapter];
    
    if (!section) {
      // Default minimal import value for codes without section
      imports[hsCode] = {
        t: Math.round(Math.random() * 100000),
        c: [{ k: 'US', n: 'United States', v: Math.round(Math.random() * 50000) }],
        p: Math.round(Math.random() * 100)
      };
      continue;
    }
    
    // Calculate per-code import value based on section total
    // Use power law: most codes have small values, few have large values
    const baseValue = section.totalImports / section.codeCount;
    const variance = Math.pow(Math.random(), 1.5);
    const codeValue = Math.round(baseValue * variance * 3);
    
    imports[hsCode] = {
      t: codeValue,
      c: pickCountries(section.id, codeValue),
      p: Math.round(Math.random() * 100)  // Partner diversity percentage
    };
  }
  
  console.log(`Generated import data for ${Object.keys(imports).length} HS codes`);
  
  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(imports, null, 0));
  console.log('Wrote imports.json');
  
  // Verify totals
  let total = 0;
  for (const code in imports) {
    total += imports[code].t;
  }
  console.log(`Total imports: $${(total / 1e9).toFixed(2)}B`);
}

main().catch(console.error);
