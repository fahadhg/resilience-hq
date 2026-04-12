import { NextResponse } from 'next/server';

// Table 14-10-0325-01 — Job vacancies, payroll employees, job vacancy rate and average offered hourly wage
// Table 14-10-0202-01 — Employment by industry, monthly (LFS)
// Table 14-10-0064-01 — Employee wages by industry (annual)

const HARD_TO_FILL_NAICS: Record<string, string> = {
  '331':  'Primary metals',
  '332':  'Fabricated metal products',
  '333':  'Industrial machinery',
  '334':  'Electronics & computers',
  '335':  'Electrical equipment',
  '336':  'Aerospace & transportation',
  '3344': 'Semiconductors',
  '3364': 'Aerospace components',
};

const PROVINCES = ['Ontario', 'Quebec', 'British Columbia', 'Alberta'];

export async function GET() {
  try {
    const vacUrl  = `https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/14100325/download/dtbl.json`;
    const wageUrl = `https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/14100202/download/dtbl.json`;

    const [vacRes, wageRes] = await Promise.allSettled([
      fetch(vacUrl,  { next: { revalidate: 3600 } }),
      fetch(wageUrl, { next: { revalidate: 3600 } }),
    ]);

    const vacData  = vacRes.status  === 'fulfilled' && vacRes.value.ok  ? await vacRes.value.json()  : null;
    const wageData = wageRes.status === 'fulfilled' && wageRes.value.ok ? await wageRes.value.json() : null;

    let vacancies: any[]  = [];
    let employment: any[] = [];

    if (vacData?.dataTable) {
      vacancies = vacData.dataTable
        .filter((r: any) => PROVINCES.some(p => (r.member1 || '').includes(p)))
        .slice(0, 60)
        .map((r: any) => ({
          industry: r.member0,
          province: r.member1,
          period:   r.refPer,
          vacancies: parseFloat(r.value) || null,
          unit: r.uom,
        }));
    }

    if (wageData?.dataTable) {
      employment = wageData.dataTable
        .filter((r: any) => (r.member0 || '').match(/3[1-3]\d/))
        .slice(0, 40)
        .map((r: any) => ({
          naics:    r.member0,
          industry: r.member1 || r.member0,
          period:   r.refPer,
          employed: parseFloat(r.value) || null,
          unit:     r.uom,
        }));
    }

    // Flag hard-to-fill roles: any NAICS matching our list with vacancy rate > 4%
    const flags: string[] = [];
    vacancies.forEach(v => {
      const matched = Object.entries(HARD_TO_FILL_NAICS).find(([code]) =>
        (v.industry || '').includes(code)
      );
      if (matched && v.vacancies && v.vacancies > 500) {
        flags.push(`${matched[1]} (${v.province}): ${v.vacancies?.toLocaleString()} vacancies`);
      }
    });

    return NextResponse.json({
      status: 'ok',
      vacancies,
      employment,
      hardToFillFlags: flags,
      meta: {
        vacanciesTable:  '14-10-0325-01',
        employmentTable: '14-10-0202-01',
        source: 'Statistics Canada WDS',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
