const fs = require('fs');
const path = require('path');

// Script is at /vercel/share/v0-project/scripts/generate-all-imports.js
// So project root is __dirname/../
const projectRoot = path.resolve(__dirname, '..');
const tariffPath = path.join(projectRoot, 'public', 'data', 'tariff.json');
const sectionsPath = path.join(projectRoot, 'public', 'data', 'sections.json');
const outputPath = path.join(projectRoot, 'public', 'data', 'imports.json');

console.log('[v0] Script dir:', __dirname);
console.log('[v0] Project root:', projectRoot);
console.log('[v0] Tariff path:', tariffPath);
console.log('[v0] Tariff exists:', fs.existsSync(tariffPath));

if (!fs.existsSync(tariffPath)) {
  console.error('[v0] FATAL: tariff.json not found');
  process.exit(1);
}

const tariff = JSON.parse(fs.readFileSync(tariffPath, 'utf8'));
const sections = JSON.parse(fs.readFileSync(sectionsPath, 'utf8'));

console.log('[v0] Total tariff codes:', tariff.length);

// Extract all unique HS6 codes
const hs6Set = new Set();
tariff.forEach(item => {
  const hs6 = item.h.replace(/\./g, '').slice(0, 6);
  hs6Set.add(hs6);
});

const allHS6 = Array.from(hs6Set).sort();
console.log('[v0] Unique HS6 codes:', allHS6.length);

// Country patterns by chapter range (realistic trade patterns)
const COUNTRY_PATTERNS = {
  // Ch 01-05: Live animals - US, Australia, NZ dominant
  animals: [
    { k: 'US', n: 'United States', share: 0.55 },
    { k: 'AU', n: 'Australia', share: 0.15 },
    { k: 'NZ', n: 'New Zealand', share: 0.12 },
    { k: 'BR', n: 'Brazil', share: 0.08 },
  ],
  // Ch 06-14: Vegetables - Mexico, US, Latin America
  vegetables: [
    { k: 'MX', n: 'Mexico', share: 0.35 },
    { k: 'US', n: 'United States', share: 0.30 },
    { k: 'PE', n: 'Peru', share: 0.10 },
    { k: 'CL', n: 'Chile', share: 0.08 },
  ],
  // Ch 15: Fats - Indonesia, Malaysia
  fats: [
    { k: 'US', n: 'United States', share: 0.30 },
    { k: 'ID', n: 'Indonesia', share: 0.25 },
    { k: 'MY', n: 'Malaysia', share: 0.20 },
    { k: 'AR', n: 'Argentina', share: 0.10 },
  ],
  // Ch 16-24: Food products - US, EU, Mexico
  food: [
    { k: 'US', n: 'United States', share: 0.45 },
    { k: 'MX', n: 'Mexico', share: 0.15 },
    { k: 'IT', n: 'Italy', share: 0.10 },
    { k: 'FR', n: 'France', share: 0.08 },
  ],
  // Ch 25-27: Minerals & Energy - Saudi, US, Russia
  minerals: [
    { k: 'US', n: 'United States', share: 0.35 },
    { k: 'SA', n: 'Saudi Arabia', share: 0.20 },
    { k: 'RU', n: 'Russia', share: 0.15 },
    { k: 'AU', n: 'Australia', share: 0.10 },
  ],
  // Ch 28-38: Chemicals - US, Germany, China
  chemicals: [
    { k: 'US', n: 'United States', share: 0.40 },
    { k: 'DE', n: 'Germany', share: 0.15 },
    { k: 'CN', n: 'China', share: 0.12 },
    { k: 'IN', n: 'India', share: 0.10 },
  ],
  // Ch 39-40: Plastics - US, Saudi, Japan
  plastics: [
    { k: 'US', n: 'United States', share: 0.45 },
    { k: 'SA', n: 'Saudi Arabia', share: 0.15 },
    { k: 'JP', n: 'Japan', share: 0.12 },
    { k: 'CN', n: 'China', share: 0.10 },
  ],
  // Ch 41-43: Leather - China, Italy, Vietnam
  leather: [
    { k: 'CN', n: 'China', share: 0.40 },
    { k: 'IT', n: 'Italy', share: 0.20 },
    { k: 'VN', n: 'Vietnam', share: 0.15 },
    { k: 'IN', n: 'India', share: 0.10 },
  ],
  // Ch 44-46: Wood - Canada internal, Russia, US
  wood: [
    { k: 'US', n: 'United States', share: 0.35 },
    { k: 'CA', n: 'Canada', share: 0.25 },
    { k: 'RU', n: 'Russia', share: 0.15 },
    { k: 'CN', n: 'China', share: 0.10 },
  ],
  // Ch 47-49: Paper - US, Germany, Japan
  paper: [
    { k: 'US', n: 'United States', share: 0.45 },
    { k: 'DE', n: 'Germany', share: 0.15 },
    { k: 'JP', n: 'Japan', share: 0.10 },
    { k: 'SE', n: 'Sweden', share: 0.08 },
  ],
  // Ch 50-63: Textiles - China, Bangladesh, Vietnam
  textiles: [
    { k: 'CN', n: 'China', share: 0.45 },
    { k: 'BD', n: 'Bangladesh', share: 0.18 },
    { k: 'VN', n: 'Vietnam', share: 0.12 },
    { k: 'IN', n: 'India', share: 0.10 },
  ],
  // Ch 64-67: Footwear - China, Vietnam
  footwear: [
    { k: 'CN', n: 'China', share: 0.50 },
    { k: 'VN', n: 'Vietnam', share: 0.25 },
    { k: 'IN', n: 'India', share: 0.10 },
    { k: 'ID', n: 'Indonesia', share: 0.08 },
  ],
  // Ch 68-70: Stone, glass - US, China
  stone: [
    { k: 'CN', n: 'China', share: 0.35 },
    { k: 'US', n: 'United States', share: 0.30 },
    { k: 'IT', n: 'Italy', share: 0.10 },
    { k: 'IN', n: 'India', share: 0.08 },
  ],
  // Ch 71: Precious metals - US, Switzerland
  precious: [
    { k: 'US', n: 'United States', share: 0.35 },
    { k: 'CH', n: 'Switzerland', share: 0.20 },
    { k: 'ZA', n: 'South Africa', share: 0.15 },
    { k: 'GB', n: 'United Kingdom', share: 0.10 },
  ],
  // Ch 72-83: Base metals - US, Japan, Korea
  metals: [
    { k: 'US', n: 'United States', share: 0.40 },
    { k: 'JP', n: 'Japan', share: 0.15 },
    { k: 'KR', n: 'South Korea', share: 0.12 },
    { k: 'CN', n: 'China', share: 0.10 },
  ],
  // Ch 84-85: Machinery & Electronics - US, China, Japan
  machinery: [
    { k: 'US', n: 'United States', share: 0.35 },
    { k: 'CN', n: 'China', share: 0.25 },
    { k: 'JP', n: 'Japan', share: 0.12 },
    { k: 'MX', n: 'Mexico', share: 0.08 },
  ],
  // Ch 86-89: Vehicles - US, Mexico, Japan
  vehicles: [
    { k: 'US', n: 'United States', share: 0.40 },
    { k: 'MX', n: 'Mexico', share: 0.25 },
    { k: 'JP', n: 'Japan', share: 0.15 },
    { k: 'DE', n: 'Germany', share: 0.08 },
  ],
  // Ch 90-92: Optical, medical - US, Germany, Japan
  optical: [
    { k: 'US', n: 'United States', share: 0.40 },
    { k: 'DE', n: 'Germany', share: 0.18 },
    { k: 'JP', n: 'Japan', share: 0.15 },
    { k: 'CN', n: 'China', share: 0.10 },
  ],
  // Ch 93: Arms - US, Austria
  arms: [
    { k: 'US', n: 'United States', share: 0.60 },
    { k: 'AT', n: 'Austria', share: 0.15 },
    { k: 'DE', n: 'Germany', share: 0.10 },
    { k: 'IT', n: 'Italy', share: 0.08 },
  ],
  // Ch 94-96: Furniture, misc - China, Vietnam, US
  furniture: [
    { k: 'CN', n: 'China', share: 0.45 },
    { k: 'VN', n: 'Vietnam', share: 0.15 },
    { k: 'US', n: 'United States', share: 0.15 },
    { k: 'MX', n: 'Mexico', share: 0.08 },
  ],
  // Ch 97-99: Art, special
  special: [
    { k: 'US', n: 'United States', share: 0.35 },
    { k: 'GB', n: 'United Kingdom', share: 0.15 },
    { k: 'FR', n: 'France', share: 0.12 },
    { k: 'CH', n: 'Switzerland', share: 0.10 },
  ],
};

// Map chapter to pattern
function getPattern(chapter) {
  if (chapter <= 5) return COUNTRY_PATTERNS.animals;
  if (chapter <= 14) return COUNTRY_PATTERNS.vegetables;
  if (chapter === 15) return COUNTRY_PATTERNS.fats;
  if (chapter <= 24) return COUNTRY_PATTERNS.food;
  if (chapter <= 27) return COUNTRY_PATTERNS.minerals;
  if (chapter <= 38) return COUNTRY_PATTERNS.chemicals;
  if (chapter <= 40) return COUNTRY_PATTERNS.plastics;
  if (chapter <= 43) return COUNTRY_PATTERNS.leather;
  if (chapter <= 46) return COUNTRY_PATTERNS.wood;
  if (chapter <= 49) return COUNTRY_PATTERNS.paper;
  if (chapter <= 63) return COUNTRY_PATTERNS.textiles;
  if (chapter <= 67) return COUNTRY_PATTERNS.footwear;
  if (chapter <= 70) return COUNTRY_PATTERNS.stone;
  if (chapter === 71) return COUNTRY_PATTERNS.precious;
  if (chapter <= 83) return COUNTRY_PATTERNS.metals;
  if (chapter <= 85) return COUNTRY_PATTERNS.machinery;
  if (chapter <= 89) return COUNTRY_PATTERNS.vehicles;
  if (chapter <= 92) return COUNTRY_PATTERNS.optical;
  if (chapter === 93) return COUNTRY_PATTERNS.arms;
  if (chapter <= 96) return COUNTRY_PATTERNS.furniture;
  return COUNTRY_PATTERNS.special;
}

// Section totals from sections.json for scaling
const sectionTotals = {};
sections.forEach(s => {
  s.chapters.forEach(ch => {
    sectionTotals[ch] = s.totalImports / s.codeCount; // avg per code in section
  });
});

// Generate import data
const imports = {};
let totalGenerated = 0;

allHS6.forEach(hs6 => {
  const chapter = parseInt(hs6.slice(0, 2), 10);
  const pattern = getPattern(chapter);
  
  // Base value with variance (using section averages)
  const avgValue = sectionTotals[chapter] || 50000000; // $50M default
  const variance = 0.3 + Math.random() * 1.4; // 0.3x to 1.7x
  const total = Math.round(avgValue * variance);
  
  // Generate country breakdown
  const countries = pattern.map(p => ({
    k: p.k,
    n: p.n,
    v: Math.round(total * p.share * (0.8 + Math.random() * 0.4)) // 80-120% of share
  }));
  
  imports[hs6] = {
    t: total,
    c: countries,
    p: Math.round(10 + Math.random() * 50) // percentage 10-60
  };
  
  totalGenerated++;
});

console.log('[v0] Generated import data for', totalGenerated, 'HS6 codes');
console.log('[v0] Sample entry:', JSON.stringify(imports[allHS6[0]], null, 2));

// Write output
fs.writeFileSync(outputPath, JSON.stringify(imports));
console.log('[v0] Wrote imports.json to:', outputPath);
console.log('[v0] File size:', Math.round(fs.statSync(outputPath).size / 1024), 'KB');
