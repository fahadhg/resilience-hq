import { NextResponse } from 'next/server';

const GQL = 'https://atlas.hks.harvard.edu/api/graphql';

async function gql(query: string) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`GraphQL fetch failed: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') ?? '2023', 10);

  try {
    const [partnerTrade, countryMeta] = await Promise.all([
      gql(`{
        countryPartnerYear(countryId: 124, yearMin: ${year}, yearMax: ${year}) {
          partnerId
          exportValue
          importValue
        }
      }`),
      gql(`{
        country {
          countryId
          nameShortEn
          iso3
          location { longitude latitude }
        }
      }`),
    ]);

    const metaMap = new Map<string, any>();
    for (const c of countryMeta.country) metaMap.set(c.countryId, c);

    // Canada coordinates
    const canada = metaMap.get('124') ?? { location: { latitude: 56, longitude: -96 } };

    const partners = partnerTrade.countryPartnerYear
      .filter((r: any) => {
        const meta = metaMap.get(r.partnerId);
        return meta?.location?.latitude != null && meta?.location?.longitude != null;
      })
      .map((r: any) => {
        const meta = metaMap.get(r.partnerId);
        return {
          partnerId: r.partnerId,
          name: meta?.nameShortEn ?? 'Unknown',
          iso3: meta?.iso3 ?? '',
          lat: meta.location.latitude,
          lng: meta.location.longitude,
          exportValue: r.exportValue ?? 0,
          importValue: r.importValue ?? 0,
          totalTrade: (r.exportValue ?? 0) + (r.importValue ?? 0),
        };
      })
      .filter((r: any) => r.totalTrade > 0)
      .sort((a: any, b: any) => b.totalTrade - a.totalTrade)
      .slice(0, 50);

    return NextResponse.json({
      status: 'ok',
      year,
      canada: {
        lat: canada.location?.latitude ?? 56,
        lng: canada.location?.longitude ?? -96,
      },
      partners,
    });
  } catch (e: any) {
    console.error('[trade-partners]', e.message);
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
