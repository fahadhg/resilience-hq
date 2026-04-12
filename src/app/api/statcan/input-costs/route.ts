import { NextResponse } from 'next/server';

// Table 18-10-0034-01 — Industrial Product Price Index (IPPI) by product
// Table 18-10-0267-01 — Raw Materials Price Index (RMPI) by commodity

// Key IPPI product groups tied to manufacturing inputs
const IPPI_PRODUCTS: Record<string, string> = {
  'Steel':          'steel',
  'Aluminum':       'aluminum',
  'Copper':         'copper',
  'Plastics':       'plastics',
  'Paper':          'paper',
  'Chemical':       'chemicals',
  'Motor vehicle':  'auto parts',
  'Machinery':      'machinery',
};

// Key RMPI commodities
const RMPI_COMMODITIES: Record<string, string> = {
  'Crude oil':      'energy',
  'Natural gas':    'energy',
  'Iron ore':       'metals',
  'Copper ore':     'metals',
  'Wheat':          'agriculture',
  'Lumber':         'forestry',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const naics = searchParams.get('naics') || '';

  try {
    const ippiUrl = `https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/18100034/download/dtbl.json`;
    const rmpiUrl = `https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/18100267/download/dtbl.json`;

    const [ippiRes, rmpiRes] = await Promise.allSettled([
      fetch(ippiUrl, { next: { revalidate: 3600 } }),
      fetch(rmpiUrl, { next: { revalidate: 3600 } }),
    ]);

    const ippiData = ippiRes.status === 'fulfilled' && ippiRes.value.ok ? await ippiRes.value.json() : null;
    const rmpiData = rmpiRes.status === 'fulfilled' && rmpiRes.value.ok ? await rmpiRes.value.json() : null;

    let ippi: any[] = [];
    let rmpi: any[] = [];
    const alerts: any[] = [];

    if (ippiData?.dataTable) {
      // Build 13-month series per product
      const byProduct: Record<string, any[]> = {};
      ippiData.dataTable.forEach((r: any) => {
        const key = r.member0;
        if (!byProduct[key]) byProduct[key] = [];
        byProduct[key].push({ period: r.refPer, index: parseFloat(r.value) || null });
      });

      ippi = Object.entries(byProduct)
        .filter(([k]) => Object.keys(IPPI_PRODUCTS).some(p => k.includes(p)))
        .map(([product, series]) => {
          const sorted = series.sort((a, b) => a.period > b.period ? -1 : 1);
          const latest = sorted[0];
          const prev12 = sorted[12];
          const yoy = latest && prev12 && prev12.index
            ? ((latest.index - prev12.index) / prev12.index * 100).toFixed(1)
            : null;
          if (yoy && Math.abs(parseFloat(yoy)) > 5) {
            alerts.push({
              product,
              yoy: parseFloat(yoy),
              latest: latest.index,
              severity: Math.abs(parseFloat(yoy)) > 15 ? 'high' : 'medium',
            });
          }
          return { product, latest: sorted.slice(0, 13), yoy };
        });
    }

    if (rmpiData?.dataTable) {
      const byComm: Record<string, any[]> = {};
      rmpiData.dataTable.forEach((r: any) => {
        const key = r.member0;
        if (!byComm[key]) byComm[key] = [];
        byComm[key].push({ period: r.refPer, index: parseFloat(r.value) || null });
      });

      rmpi = Object.entries(byComm)
        .filter(([k]) => Object.keys(RMPI_COMMODITIES).some(c => k.includes(c)))
        .map(([commodity, series]) => {
          const sorted = series.sort((a, b) => a.period > b.period ? -1 : 1);
          const latest = sorted[0];
          const prev12 = sorted[12];
          const yoy = latest && prev12 && prev12.index
            ? ((latest.index - prev12.index) / prev12.index * 100).toFixed(1)
            : null;
          return { commodity, latest: sorted.slice(0, 13), yoy };
        });
    }

    return NextResponse.json({
      status: 'ok',
      ippi,
      rmpi,
      alerts: alerts.sort((a, b) => Math.abs(b.yoy) - Math.abs(a.yoy)),
      meta: {
        ippiTable: '18-10-0034-01',
        rmpiTable: '18-10-0267-01',
        source: 'Statistics Canada WDS',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
