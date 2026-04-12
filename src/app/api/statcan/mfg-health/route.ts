import { NextResponse } from 'next/server';

// StatsCan WDS API: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action
// Table 16-10-0117-01 — Manufacturing sales of goods manufactured, by industry (monthly, NAICS)
// Table 16-10-0014-01 — Capacity utilization rates (quarterly)

const WDS = 'https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/';

async function fetchWDS(productId: string, latestN: number) {
  const url = `${WDS}${productId}/download/dtbl.json`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`WDS ${productId} → ${res.status}`);
  const data = await res.json();
  return data;
}

// Fallback: use the getSeriesInfoFromCubePidCoord endpoint
async function fetchSeries(pid: string, coords: string[]) {
  const results = await Promise.allSettled(
    coords.map(async (coord) => {
      const url = `https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/${pid}/download/dtbl.json`;
      const r = await fetch(url, { next: { revalidate: 3600 } });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    })
  );
  return results;
}

// Core manufacturing NAICS codes we care about
const MFG_NAICS: Record<string, string> = {
  '31-33': 'Total manufacturing',
  '331':   'Primary metals',
  '332':   'Fabricated metal products',
  '333':   'Machinery',
  '334':   'Computer & electronics',
  '335':   'Electrical equipment',
  '336':   'Transportation equipment',
  '337':   'Furniture',
  '325':   'Chemical manufacturing',
  '326':   'Plastics & rubber',
};

export async function GET() {
  try {
    // Mfg sales: table 16-10-0117-01
    const salesUrl = `https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/16100117/download/dtbl.json`;
    // Capacity utilization: table 16-10-0014-01
    const capUrl = `https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/16100014/download/dtbl.json`;

    const [salesRes, capRes] = await Promise.allSettled([
      fetch(salesUrl, { next: { revalidate: 3600 } }),
      fetch(capUrl, { next: { revalidate: 3600 } }),
    ]);

    const salesData = salesRes.status === 'fulfilled' && salesRes.value.ok
      ? await salesRes.value.json()
      : null;
    const capData = capRes.status === 'fulfilled' && capRes.value.ok
      ? await capRes.value.json()
      : null;

    // Parse sales data if available
    let salesSeries: any[] = [];
    let capSeries: any[] = [];
    let lastUpdated = '';

    if (salesData?.dataTable) {
      const rows = salesData.dataTable;
      lastUpdated = salesData.releaseTime || '';
      salesSeries = rows
        .filter((r: any) => MFG_NAICS[r.member0] || r.member0?.includes('31'))
        .slice(0, 40)
        .map((r: any) => ({
          naics: r.member0,
          industry: r.member1 || MFG_NAICS[r.member0] || r.member0,
          period: r.refPer,
          value: parseFloat(r.value) || null,
          unit: r.uom || 'millions $',
        }));
    }

    if (capData?.dataTable) {
      capSeries = capData.dataTable.slice(0, 20).map((r: any) => ({
        industry: r.member0 || r.member1,
        period: r.refPer,
        rate: parseFloat(r.value) || null,
      }));
    }

    return NextResponse.json({
      status: 'ok',
      lastUpdated,
      sales: salesSeries,
      capacity: capSeries,
      meta: {
        salesTable: '16-10-0117-01',
        capTable: '16-10-0014-01',
        source: 'Statistics Canada WDS',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
