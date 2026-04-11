#!/usr/bin/env node
/**
 * Generates public/data/sections.json from tariff.json, imports.json, surtaxes.json
 * Matching at HS8 level (not HS7) to avoid overcounting surtax-affected codes.
 */

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../public/data');
const tariff = JSON.parse(fs.readFileSync(path.join(dataDir, 'tariff.json'), 'utf-8'));
const imports = JSON.parse(fs.readFileSync(path.join(dataDir, 'imports.json'), 'utf-8'));
const surtaxData = JSON.parse(fs.readFileSync(path.join(dataDir, 'surtaxes.json'), 'utf-8'));

const SECTIONS = [
  { id: 1, slug: 'live-animals-animal-products', name: 'Live Animals & Animal Products', chapters: [1,2,3,4,5], description: 'Live animals, meat, fish, dairy, eggs, honey' },
  { id: 2, slug: 'vegetable-products', name: 'Vegetable Products', chapters: [6,7,8,9,10,11,12,13,14], description: 'Plants, vegetables, fruit, nuts, coffee, spices, cereals' },
  { id: 3, slug: 'animal-vegetable-fats', name: 'Animal & Vegetable Fats & Oils', chapters: [15], description: 'Edible fats, oils, and waxes' },
  { id: 4, slug: 'prepared-foodstuffs', name: 'Prepared Foodstuffs & Beverages', chapters: [16,17,18,19,20,21,22,23,24], description: 'Processed foods, beverages, sugar, tobacco' },
  { id: 5, slug: 'mineral-products', name: 'Mineral Products', chapters: [25,26,27], description: 'Salt, sulphur, ores, mineral fuels, oils' },
  { id: 6, slug: 'chemical-products', name: 'Chemical & Allied Products', chapters: [28,29,30,31,32,33,34,35,36,37,38], description: 'Chemicals, pharmaceuticals, fertilizers, dyes, soaps' },
  { id: 7, slug: 'plastics-rubber', name: 'Plastics & Rubber', chapters: [39,40], description: 'Plastics, rubber and articles thereof' },
  { id: 8, slug: 'hides-leather-furskins', name: 'Hides, Leather & Furskins', chapters: [41,42,43], description: 'Raw hides, leather goods, travel goods, furskins' },
  { id: 9, slug: 'wood-articles', name: 'Wood & Articles of Wood', chapters: [44,45,46], description: 'Wood, cork, straw, basketware' },
  { id: 10, slug: 'pulp-paper', name: 'Pulp, Paper & Paperboard', chapters: [47,48,49], description: 'Wood pulp, paper, books, printed products' },
  { id: 11, slug: 'textiles-apparel', name: 'Textiles & Apparel', chapters: [50,51,52,53,54,55,56,57,58,59,60,61,62,63], description: 'Fibres, fabrics, garments, carpets' },
  { id: 12, slug: 'footwear-headgear', name: 'Footwear, Headgear & Accessories', chapters: [64,65,66,67], description: 'Footwear, hats, umbrellas, feathers' },
  { id: 13, slug: 'stone-ceramic-glass', name: 'Stone, Ceramic & Glass', chapters: [68,69,70], description: 'Stone, plaster, cement, ceramics, glass products' },
  { id: 14, slug: 'precious-metals-jewellery', name: 'Precious Metals & Jewellery', chapters: [71], description: 'Natural pearls, precious stones, metals, jewellery' },
  { id: 15, slug: 'base-metals-and-articles', name: 'Base Metals & Articles', chapters: [72,73,74,75,76,78,79,80,81,82,83], description: 'Iron, steel, copper, aluminium, tools, cutlery' },
  { id: 16, slug: 'machinery-mechanical-electrical-equipment', name: 'Machinery & Electrical Equipment', chapters: [84,85], description: 'Mechanical appliances, motors, computers, electronics' },
  { id: 17, slug: 'vehicles-aircraft-vessels', name: 'Vehicles, Aircraft & Vessels', chapters: [86,87,88,89], description: 'Railway, vehicles, aircraft, ships and boats' },
  { id: 18, slug: 'optical-precision-instruments', name: 'Optical & Precision Instruments', chapters: [90,91,92], description: 'Medical, optical, photographic instruments, watches' },
  { id: 19, slug: 'arms-ammunition', name: 'Arms & Ammunition', chapters: [93], description: 'Weapons, ammunition, and accessories' },
  { id: 20, slug: 'miscellaneous-manufactured-articles', name: 'Miscellaneous Manufactured Articles', chapters: [94,95,96], description: 'Furniture, lighting, toys, games, misc. manufactures' },
];

// Build surtax HS8 set (HS8 = first 8 digits, no dots)
// This is the correct matching level — HS8 matches the surtax schedule entry format
const surtaxHs8Set = new Set();
for (const s of surtaxData.surtaxes) {
  const hs8 = s.hs.replace(/\./g, '').slice(0, 8);
  surtaxHs8Set.add(hs8);
}

const result = SECTIONS.map(sec => {
  const chapSet = new Set(sec.chapters);

  // Tariff codes in this section
  const sectionCodes = tariff.filter(t => chapSet.has(t.c));
  const codeCount = sectionCodes.length;
  const dutiableCount = sectionCodes.filter(t => t.m > 0).length;

  // Surtax affected: match at HS8 level (not HS7 - avoids overcounting)
  let surtaxAffected = 0;
  for (const t of sectionCodes) {
    const hs8 = t.h.replace(/\./g, '').slice(0, 8);
    if (surtaxHs8Set.has(hs8)) surtaxAffected++;
  }

  // Import totals and top sources
  let totalImports = 0;
  const countrySums = {};
  const countryNames = {};

  for (const [key, impData] of Object.entries(imports)) {
    // chapter = first 2 digits of HS10 without dots
    const ch = parseInt(key.replace(/\./g, '').slice(0, 2), 10);
    if (!chapSet.has(ch)) continue;
    totalImports += impData.t;
    for (const c of impData.c) {
      countrySums[c.k] = (countrySums[c.k] || 0) + c.v;
      countryNames[c.k] = c.n;
    }
  }

  const topSources = Object.entries(countrySums)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => ({ k, n: countryNames[k], v: Math.round(v) }));

  return {
    id: sec.id,
    slug: sec.slug,
    name: sec.name,
    chapters: sec.chapters,
    description: sec.description,
    codeCount,
    dutiableCount,
    totalImports: Math.round(totalImports),
    surtaxAffected,
    topSources,
  };
});

fs.writeFileSync(path.join(dataDir, 'sections.json'), JSON.stringify(result, null, 2));
console.log('✓ Generated sections.json');
console.log('');
result.forEach(s => {
  const imp = s.totalImports >= 1e9 ? `$${(s.totalImports/1e9).toFixed(1)}B`
            : s.totalImports >= 1e6 ? `$${Math.round(s.totalImports/1e6)}M`
            : `$${Math.round(s.totalImports/1e3)}K`;
  console.log(`  [${String(s.id).padStart(2)}] ${s.slug.padEnd(48)} ${String(s.codeCount).padStart(5)} codes  ${String(s.surtaxAffected).padStart(4)} surtaxed  ${imp.padStart(8)} imports`);
});
console.log('');
console.log(`Total: ${result.reduce((s,r)=>s+r.codeCount,0)} codes, ${result.reduce((s,r)=>s+r.surtaxAffected,0)} surtaxed`);
