'use client';

import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import { Search, ExternalLink, TrendingUp, Globe, ChevronDown } from 'lucide-react';

interface Supplier {
  vendor: string;
  department: string;
  value: number;
  country: string;
  date: string;
  description: string;
  agreement: string;
}

interface SupplierRollup {
  vendor: string;
  totalValue: number;
  contractCount: number;
  topDept: string;
  country: string;
  latestDate: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  Canada: '🇨🇦', 'United States': '🇺🇸', USA: '🇺🇸', UK: '🇬🇧',
  Germany: '🇩🇪', France: '🇫🇷', Japan: '🇯🇵', China: '🇨🇳',
  Australia: '🇦🇺', Netherlands: '🇳🇱', Sweden: '🇸🇪', Italy: '🇮🇹',
};

function fmtCAD(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function SuppliersPage() {
  const [raw, setRaw] = useState<Supplier[]>([]);
  const [rollups, setRollups] = useState<SupplierRollup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'value' | 'count'>('value');
  const [page, setPage] = useState(0);
  const PER_PAGE = 100;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `https://open.canada.ca/data/api/action/datastore_search?resource_id=fac950c0-00d5-4ec1-a4d3-9cbebf98a305&limit=${PER_PAGE}&offset=${page * PER_PAGE}&sort=contract_value%20desc`
        );
        const json = await res.json();
        const records = json?.result?.records ?? [];
        const mapped: Supplier[] = records.map((r: Record<string, string>) => ({
          vendor: r.vendor_name ?? '—',
          department: r.owner_org_title ?? r.buyer_name ?? '—',
          value: parseFloat(r.contract_value ?? '0') || 0,
          country: r.country_of_vendor ?? 'Canada',
          date: r.contract_date ?? '',
          description: r.description_en ?? '',
          agreement: r.agreement_type_code ?? '',
        }));
        setRaw(mapped);

        // Roll up by vendor
        const map = new Map<string, SupplierRollup>();
        for (const r of mapped) {
          const key = r.vendor.trim().toUpperCase();
          if (!key || key === '—') continue;
          const ex = map.get(key);
          if (ex) {
            ex.totalValue += r.value;
            ex.contractCount += 1;
            if (r.date > ex.latestDate) ex.latestDate = r.date;
          } else {
            map.set(key, {
              vendor: r.vendor,
              totalValue: r.value,
              contractCount: 1,
              topDept: r.department,
              country: r.country,
              latestDate: r.date,
            });
          }
        }
        const arr = Array.from(map.values());
        arr.sort((a, b) => sort === 'value' ? b.totalValue - a.totalValue : b.contractCount - a.contractCount);
        setRollups(arr);
      } catch {
        setRaw([]); setRollups([]);
      }
      setLoading(false);
    }
    load();
  }, [page, sort]);

  const filtered = rollups.filter(r =>
    !search || r.vendor.toLowerCase().includes(search.toLowerCase()) ||
    r.topDept.toLowerCase().includes(search.toLowerCase())
  );

  const totalValue = filtered.reduce((s, r) => s + r.totalValue, 0);
  const domestic = filtered.filter(r => r.country === 'Canada' || !r.country).length;
  const foreign = filtered.length - domestic;

  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--ink)]">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-1">Suppliers</h1>
          <p className="text-sm text-[var(--ink-muted)]">Federal contract vendors from proactive disclosure — contracts over $10,000 CAD</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Spend (page)', value: fmtCAD(totalValue), accent: true },
            { label: 'Vendors', value: filtered.length.toLocaleString() },
            { label: 'Domestic', value: domestic.toLocaleString() },
            { label: 'Foreign', value: foreign.toLocaleString() },
          ].map(s => (
            <div key={s.label} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-4">
              <div className="text-[10px] text-[var(--ink-faint)] uppercase tracking-wider mb-1">{s.label}</div>
              <div className={`font-mono text-xl font-semibold ${s.accent ? 'text-[var(--ngen-orange)]' : 'text-[var(--ink)]'}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-faint)]" />
            <input
              type="text"
              placeholder="Search vendors or departments…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:border-[var(--border-hover)]"
            />
          </div>
          <div className="relative">
            <select
              value={sort}
              onChange={e => setSort(e.target.value as 'value' | 'count')}
              className="appearance-none pl-4 pr-8 py-2.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--border-hover)]"
            >
              <option value="value">Sort: By Value</option>
              <option value="count">Sort: By # Contracts</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-faint)] pointer-events-none" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-[var(--ink-faint)] text-sm">Loading suppliers…</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-[var(--ink-faint)] text-sm">No suppliers found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium w-6">#</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Vendor</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden lg:table-cell">Top Department</th>
                    <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Value</th>
                    <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden sm:table-cell">Contracts</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden md:table-cell">Country</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filtered.map((s, i) => {
                    const flag = COUNTRY_FLAGS[s.country] ?? '🌐';
                    const isDomestic = s.country === 'Canada' || !s.country;
                    return (
                      <tr key={s.vendor + i} className="hover:bg-[var(--surface-2)] transition-colors">
                        <td className="px-4 py-3 text-[var(--ink-faint)] text-xs font-mono">{page * PER_PAGE + i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--ink)]">{s.vendor}</div>
                          {s.latestDate && (
                            <div className="text-[11px] text-[var(--ink-faint)] mt-0.5">
                              Latest: {new Date(s.latestDate).toLocaleDateString('en-CA', { year: 'numeric', month: 'short' })}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs text-[var(--ink-muted)] line-clamp-1">{s.topDept}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-mono text-sm font-semibold text-[var(--ink)]">{fmtCAD(s.totalValue)}</div>
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <span className="text-xs text-[var(--ink-muted)]">{s.contractCount}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span>{flag}</span>
                            <span className={isDomestic ? 'text-green-400' : 'text-amber-400'}>
                              {s.country || 'Canada'}
                            </span>
                          </div>
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
            Showing page {page + 1} · {raw.length} records loaded
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
              disabled={raw.length < PER_PAGE}
              className="px-3 py-1.5 text-xs bg-[var(--surface-1)] border border-[var(--border)] rounded-md disabled:opacity-40 hover:border-[var(--border-hover)] transition-colors"
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
