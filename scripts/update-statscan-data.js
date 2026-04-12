/**
 * StatsCan Data Update Script
 * 
 * Fetches latest data from Statistics Canada Web Data Service
 * and updates the local JSON data files.
 * 
 * Run with: node scripts/update-statscan-data.js
 */

const fs = require('fs');
const path = require('path');

const STATSCAN_WDS = 'https://www150.statcan.gc.ca/t1/wds/rest';

// ─── Vector IDs ────────────────────────────────────────────────────────────────

const MFG_SALES_VECTORS = {
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
};

const CAPACITY_VECTORS = {
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
};

const IPPI_VECTORS = {
  'Iron and steel products': 41691072,
  'Aluminum products': 41691108,
  'Motor vehicle parts': 41691283,
  'Chemical products': 41691156,
  'Plastic products': 41691189,
};

const RMPI_VECTORS = {
  'Crude oil': 41691362,
  'Natural gas': 41691365,
  'Ferrous materials': 41691370,
  'Wood products': 41691387,
};

const IMPORT_SECTION_VECTORS = {
  1: { name: 'Live animals', vectorId: 52367369 },
  2: { name: 'Vegetable products', vectorId: 52367370 },
  3: { name: 'Fats and oils', vectorId: 52367371 },
  4: { name: 'Prepared foodstuffs', vectorId: 52367372 },
  5: { name: 'Mineral products', vectorId: 52367373 },
  6: { name: 'Chemical products', vectorId: 52367374 },
  7: { name: 'Plastics', vectorId: 52367375 },
  8: { name: 'Hides and leather', vectorId: 52367376 },
  9: { name: 'Wood', vectorId: 52367377 },
  10: { name: 'Pulp and paper', vectorId: 52367378 },
  11: { name: 'Textiles', vectorId: 52367379 },
  12: { name: 'Footwear', vectorId: 52367380 },
  13: { name: 'Stone and glass', vectorId: 52367381 },
  14: { name: 'Precious metals', vectorId: 52367382 },
  15: { name: 'Base metals', vectorId: 52367383 },
  16: { name: 'Machinery', vectorId: 52367384 },
  17: { name: 'Vehicles', vectorId: 52367385 },
  18: { name: 'Optical instruments', vectorId: 52367386 },
  19: { name: 'Arms', vectorId: 52367387 },
  20: { name: 'Miscellaneous', vectorId: 52367388 },
};

// ─── API Functions ─────────────────────────────────────────────────────────────

async function fetchVectors(vectorIds, latestN = 13) {
  const requests = vectorIds.map(vectorId => ({ vectorId, latestN }));
  
  try {
    const response = await fetch(`${STATSCAN_WDS}/getDataFromVectorsAndLatestNPeriods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requests),
    });

    if (!response.ok) {
      throw new Error(`StatsCan API error: ${response.status}`);
    }

    const data = await response.json();
    const result = {};
    
    for (const item of data) {
      if (item.status === 'SUCCESS' && item.object) {
        result[item.object.vectorId] = item.object.vectorDataPoint.map(dp => ({
          refPer: dp.refPer,
          value: dp.value,
        }));
      }
    }
    
    return result;
  } catch (error) {
    console.error('StatsCan fetch failed:', error.message);
    return {};
  }
}

function calcYoY(data) {
  if (!data || data.length < 13) return 'N/A';
  const current = data[0]?.value;
  const yearAgo = data[12]?.value;
  if (current == null || yearAgo == null || yearAgo === 0) return 'N/A';
  return ((current - yearAgo) / yearAgo * 100).toFixed(1);
}

function getLatest(data) {
  return { period: data[0]?.refPer || 'N/A', value: data[0]?.value || 0 };
}

// ─── Main Update Function ──────────────────────────────────────────────────────

async function updateData() {
  console.log('Fetching data from Statistics Canada...\n');
  const timestamp = new Date().toISOString().split('T')[0];

  // 1. Manufacturing Sales
  console.log('1. Fetching manufacturing sales...');
  const mfgData = await fetchVectors(Object.values(MFG_SALES_VECTORS));
  console.log(`   Found ${Object.keys(mfgData).length} vectors`);

  // 2. Capacity Utilization
  console.log('2. Fetching capacity utilization...');
  const capacityData = await fetchVectors(Object.values(CAPACITY_VECTORS), 5);
  console.log(`   Found ${Object.keys(capacityData).length} vectors`);

  // 3. IPPI
  console.log('3. Fetching IPPI data...');
  const ippiData = await fetchVectors(Object.values(IPPI_VECTORS));
  console.log(`   Found ${Object.keys(ippiData).length} vectors`);

  // 4. RMPI
  console.log('4. Fetching RMPI data...');
  const rmpiData = await fetchVectors(Object.values(RMPI_VECTORS));
  console.log(`   Found ${Object.keys(rmpiData).length} vectors`);

  // 5. Import sections
  console.log('5. Fetching import data by HS section...');
  const importVectorIds = Object.values(IMPORT_SECTION_VECTORS).map(v => v.vectorId);
  const importData = await fetchVectors(importVectorIds);
  console.log(`   Found ${Object.keys(importData).length} vectors`);

  // ─── Build mfg-health.json ───────────────────────────────────────────────────
  const mfgHealth = {
    source: 'Statistics Canada, Table 16-10-0117-01 / 16-10-0014-01',
    generated: timestamp,
    note: 'Monthly Survey of Manufacturing — seasonally adjusted values',
    sales: Object.entries(MFG_SALES_VECTORS).map(([industry, vectorId]) => {
      const data = mfgData[vectorId] || [];
      const latest = getLatest(data);
      return {
        naics: industry === 'Total manufacturing' ? '31-33' : '',
        industry,
        period: latest.period,
        value: latest.value,
        unit: 'millions $',
        yoy: calcYoY(data),
      };
    }),
    capacity: Object.entries(CAPACITY_VECTORS).map(([industry, vectorId]) => {
      const data = capacityData[vectorId] || [];
      const latest = getLatest(data);
      return {
        industry,
        period: latest.period,
        rate: latest.value,
      };
    }),
  };

  // ─── Build input-costs.json ──────────────────────────────────────────────────
  const inputCosts = {
    source: 'Statistics Canada, Table 18-10-0034-01 (IPPI) / 18-10-0267-01 (RMPI)',
    generated: timestamp,
    note: 'Price indices, 2012=100 base. YoY = year-over-year % change.',
    alerts: [
      ...Object.entries(IPPI_VECTORS).map(([product, vectorId]) => {
        const data = ippiData[vectorId] || [];
        const yoy = parseFloat(calcYoY(data));
        const latest = getLatest(data);
        return {
          product,
          yoy: isNaN(yoy) ? 0 : yoy,
          latest: latest.value,
          severity: Math.abs(yoy) > 10 ? 'high' : Math.abs(yoy) > 5 ? 'medium' : 'low',
        };
      }),
    ],
    ippi: Object.entries(IPPI_VECTORS).map(([product, vectorId]) => {
      const data = ippiData[vectorId] || [];
      return {
        product: `${product} (HS linked)`,
        yoy: calcYoY(data),
        latest: data.slice(0, 13).map(dp => ({
          period: dp.refPer,
          index: dp.value || 0,
        })),
      };
    }),
    rmpi: Object.entries(RMPI_VECTORS).map(([commodity, vectorId]) => {
      const data = rmpiData[vectorId] || [];
      return {
        commodity: `${commodity} (HS linked)`,
        yoy: calcYoY(data),
        latest: data.slice(0, 13).map(dp => ({
          period: dp.refPer,
          index: dp.value || 0,
        })),
      };
    }),
  };

  // ─── Update sections.json with real import values ────────────────────────────
  const sectionsPath = path.join(__dirname, '../public/data/sections.json');
  let sections = [];
  
  try {
    sections = JSON.parse(fs.readFileSync(sectionsPath, 'utf8'));
  } catch (e) {
    console.error('Could not read sections.json:', e.message);
  }

  // Update section import totals with real StatsCan data
  for (const [sectionId, info] of Object.entries(IMPORT_SECTION_VECTORS)) {
    const sectionIndex = parseInt(sectionId) - 1;
    if (sections[sectionIndex]) {
      const data = importData[info.vectorId] || [];
      const latest = getLatest(data);
      // StatsCan reports in thousands, convert to actual value
      sections[sectionIndex].totalImports = latest.value * 1000;
      sections[sectionIndex].dataSource = 'StatsCan Table 12-10-0099-01';
      sections[sectionIndex].dataPeriod = latest.period;
    }
  }

  // ─── Write updated files ─────────────────────────────────────────────────────
  console.log('\nWriting updated data files...');

  const dataDir = path.join(__dirname, '../public/data/intel');
  
  fs.writeFileSync(
    path.join(dataDir, 'mfg-health.json'),
    JSON.stringify(mfgHealth, null, 2)
  );
  console.log('   ✓ mfg-health.json');

  fs.writeFileSync(
    path.join(dataDir, 'input-costs.json'),
    JSON.stringify(inputCosts, null, 2)
  );
  console.log('   ✓ input-costs.json');

  fs.writeFileSync(sectionsPath, JSON.stringify(sections, null, 2));
  console.log('   ✓ sections.json');

  console.log(`\nData update complete! Generated: ${timestamp}`);
}

// Run the update
updateData().catch(console.error);
