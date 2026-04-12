import { NextResponse } from 'next/server';

// Table 12-10-0011-01 — Merchandise imports and exports, by HS code
// Table 36-10-0592-01 — International trade in goods, monthly

// Top export partner tariff rates we track (approximate MFN rates for Canada's exports)
const PARTNER_RATES: Record<string, Record<string, number>> = {
  'US':  { '73': 0, '84': 0, '87': 0 }, // CUSMA: mostly 0
  'EU':  { '73': 3.7, '84': 1.7, '87': 6.5 }, // CETA: various
  'UK':  { '73': 4.0, '84': 2.0, '87': 6.5 }, // CUKTCA
  'JP':  { '73': 3.9, '84': 0, '87': 0 },       // CPTPP
  'MX':  { '73': 0, '84': 0, '87': 0 },         // CUSMA
  'KR':  { '73': 5.5, '84': 5.0, '87': 8.0 },  // CKFTA
  'CN':  { '73': 10.0, '84': 6.0, '87': 10.0 }, // MFN only (no FTA)
  'IN':  { '73': 17.5, '84': 7.5, '87': 12.5 }, // MFN
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hs = searchParams.get('hs') || '';  // Optional: specific HS6 prefix
  const chapter = searchParams.get('ch') || '';

  try {
    const tradeUrl = `https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/12100011/download/dtbl.json`;

    const tradeRes = await fetch(tradeUrl, { next: { revalidate: 3600 } });
    const tradeData = tradeRes.ok ? await tradeRes.json() : null;

    let exports: any[] = [];
    let topDestinations: any[] = [];

    if (tradeData?.dataTable) {
      const rows = tradeData.dataTable.filter((r: any) => {
        if (hs && !(r.member0 || '').startsWith(hs)) return false;
        if (chapter && !(r.member0 || '').startsWith(chapter)) return false;
        return true;
      });

      const byDest: Record<string, { country: string; value: number; trend: number[] }> = {};
      rows.forEach((r: any) => {
        const country = r.member1 || r.member2 || 'Unknown';
        const val = parseFloat(r.value) || 0;
        if (!byDest[country]) byDest[country] = { country, value: 0, trend: [] };
        byDest[country].value += val;
        byDest[country].trend.push(val);
      });

      topDestinations = Object.values(byDest)
        .sort((a, b) => b.value - a.value)
        .slice(0, 15)
        .map(d => ({
          ...d,
          tariffRate: hs
            ? (PARTNER_RATES[d.country]?.[hs.slice(0, 2)] ?? null)
            : null,
          hasFTA: ['US', 'EU', 'UK', 'JP', 'MX', 'KR', 'CL', 'PE', 'CO', 'VN', 'SG', 'AU', 'NZ'].includes(d.country),
        }));

      exports = rows.slice(0, 100).map((r: any) => ({
        hs: r.member0,
        partner: r.member1,
        period: r.refPer,
        value: parseFloat(r.value) || null,
        unit: r.uom,
      }));
    }

    // Always return partner rate table even if API fails
    return NextResponse.json({
      status: tradeData ? 'ok' : 'partial',
      exports,
      topDestinations,
      partnerRates: PARTNER_RATES,
      meta: {
        tradeTable: '12-10-0011-01',
        source: 'Statistics Canada WDS + Global Affairs Canada',
        note: tradeData ? undefined : 'StatsCan API unavailable; showing partner rate reference only',
      },
    });
  } catch (e: any) {
    return NextResponse.json({
      status: 'partial',
      exports: [],
      topDestinations: [],
      partnerRates: PARTNER_RATES,
      meta: {
        tradeTable: '12-10-0011-01',
        source: 'Statistics Canada WDS',
        note: e.message,
      },
    });
  }
}
