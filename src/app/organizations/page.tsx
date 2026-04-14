'use client';

import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import { Search, Building2, TrendingUp, ChevronDown } from 'lucide-react';

interface OrgRollup {
  name: string;
  totalValue: number;
  contractCount: number;
  topVendor: string;
  foreignCount: number;
  latestDate: string;
}

function fmtCAD(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgRollup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'value' | 'count' | 'foreign'>('value');
  const [page, setPage] = useState(0);
  const PER_PAGE = 200;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `https://open.canada.ca/data/api/action/datastore_search?resource_id=fac950c0-00d5-4ec1-a4d3-9cbebf98a305&limit=${PER_PAGE}&offset=${page * PER_PAGE}&sort=contract_value%20desc`
        );
        const json = await res.json();
        const records = json?.result?.records ?? [];

        const map = new Map<string, OrgRollup>();
        for (const r of records as Record<string, string>[]) {
          const name = (r.owner_org_title ?? r.buyer_name ?? '').trim();
          if (!name) continue;
          const val = parseFloat(r.contract_value ?? '0') || 0;
          const vendor = r.vendor_name ?? '';
          const country = r.country_of_vendor ?? 'Canada';
          const isForeign = country !== 'Canada' && country !== '';
          const date = r.contract_date ?? '';

          const ex = map.get(name);
          if (ex) {
            ex.totalValue += val;
            ex.contractCount += 1;
            if (isForeign) ex.foreignCount += 1;
            if (date > ex.latestDate) { ex.latestDate = date; ex.topVendor = vendor; }
          } else {
            map.set(name, {
              name,
              totalValue: val,
              contractCount: 1,
              topVendor: vendor,
              foreignCount: isForeign ? 1 : 0,
              latestDate: date,
            });
          }
        }

        let arr = Array.from(map.values());
        arr.sort((a, b) =>
          sort === 'value' ? b.totalValue - a.totalValue :
          sort === 'count' ? b.contractCount - a.contractCount :
          b.foreignCount - a.foreignCount
        );
        setOrgs(arr);
      } catch {
        setOrgs([]);
      }
      setLoading(false);
    }
    load();
  }, [page, sort]);

  const filtered = orgs.filter(o =>
    !search || o.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalSpend = filtered.reduce((s, o) => s + o.totalValue, 0);
  const totalContracts = filtered.reduce((s, o) => s + o.contractCount, 0);
  const topOrg = filtered[0];

  // Bar chart: top 8 by value
  const top8 = filtered.slice(0, 8);
  const maxVal = top8[0]?.totalValue ?? 1;

  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--ink)]">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-1">Organizations</h1>
          <p className="text-sm text-[var(--ink-muted)]">Federal departments and agencies ranked by procurement spend</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Spend (page)', value: fmtCAD(totalSpend), accent: true },
            { label: 'Departments', value: filtered.length.toLocaleString() },
            { label: 'Contracts', value: totalContracts.toLocaleString() },
            { label: 'Top Spender', value: topOrg?.name.split(' ').slice(0,3).join(' ') ?? '—' },
          ].map(s => (
            <div key={s.label} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-4">
              <div className="text-[10px] text-[var(--ink-faint)] uppercase tracking-wider mb-1">{s.label}</div>
              <div className={`font-mono text-xl font-semibold truncate ${s.accent ? 'text-[var(--ngen-orange)]' : 'text-[var(--ink)]'}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Top 8 bar chart */}
        {top8.length > 0 && (
          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl p-5 mb-6">
            <h2 className="text-xs font-medium text-[var(--ink-faint)] uppercase tracking-wider mb-4">Top Departments by Spend</h2>
            <div className="space-y-3">
              {top8.map(o => (
                <div key={o.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--ink)] truncate max-w-xs">{o.name}</span>
                    <span className="text-xs font-mono font-medium text-[var(--ink)] ml-4 shrink-0">{fmtCAD(o.totalValue)}</span>
                  </div>
                  <div className="h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--ngen-orange)] rounded-full transition-all"
                      style={{ width: `${(o.totalValue / maxVal) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-faint)]" />
            <input
              type="text"
              placeholder="Search departments…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:border-[var(--border-hover)]"
            />
          </div>
          <div className="relative">
            <select
              value={sort}
              onChange={e => setSort(e.target.value as typeof sort)}
              className="appearance-none pl-4 pr-8 py-2.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--border-hover)]"
            >
              <option value="value">Sort: By Spend</option>
              <option value="count">Sort: By Contracts</option>
              <option value="foreign">Sort: By Foreign Vendors</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-faint)] pointer-events-none" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-[var(--ink-faint)] text-sm">Loading organizations…</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-[var(--ink-faint)] text-sm">No organizations found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium w-6">#</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Department / Agency</th>
                    <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Spend</th>
                    <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden sm:table-cell">Contracts</th>
                    <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden md:table-cell">Foreign</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden lg:table-cell">Top Vendor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filtered.map((o, i) => {
                    const foreignPct = o.contractCount > 0 ? Math.round((o.foreignCount / o.contractCount) * 100) : 0;
                    return (
                      <tr key={o.name} className="hover:bg-[var(--surface-2)] transition-colors">
                        <td className="px-4 py-3 text-[var(--ink-faint)] text-xs font-mono">{page * PER_PAGE + i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-[var(--ink-faint)] shrink-0" />
                            <span className="font-medium text-[var(--ink)]">{o.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-sm font-semibold text-[var(--ink)]">{fmtCAD(o.totalValue)}</span>
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <span className="text-xs text-[var(--ink-muted)]">{o.contractCount}</span>
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          {o.foreignCount > 0 ? (
                            <span className="text-xs text-amber-400">{o.foreignCount} ({foreignPct}%)</span>
                          ) : (
                            <span className="text-xs text-[var(--ink-faint)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs text-[var(--ink-muted)] line-clamp-1">{o.topVendor || '—'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-[var(--ink-faint)]">
            Page {page + 1} · {filtered.length} departments loaded
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs bg-[var(--surface-1)] border border-[var(--border)] rounded-md disabled:opacity-40 hover:border-[var(--border-hover)] transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-xs bg-[var(--surface-1)] border border-[var(--border)] rounded-md hover:border-[var(--border-hover)] transition-colors"
            >
              Next
            </button>
          </div>
        </div>

        <p className="text-[10px] text-[var(--ink-faint)] mt-6">
          Source: Treasury Board of Canada · Proactive disclosure contracts dataset fac950c0
        </p>
      </div>
    </div>
  );
}
