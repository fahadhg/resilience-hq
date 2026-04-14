'use client';

import { useEffect, useState, useCallback } from 'react';
import Nav from '@/components/Nav';
import {
  Search, ExternalLink, Clock, Building2, Tag, ChevronDown,
  Sparkles, Users, Landmark, ChevronRight
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AwardRecord {
  title: string;
  department: string;
  supplier: string;
  supplierCity: string;
  supplierCountry: string;
  value: number;
  category: string;
  method: string;
  status: string;
  gsin: string;
  awardDate: string;
  endDate: string;
  refNumber: string;
}

interface ContractRecord {
  vendor_name: string;
  owner_org_title: string;
  buyer_name: string;
  contract_value: string;
  contract_date: string;
  country_of_vendor: string;
  description_en: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCAD(v: number): string {
  if (!v) return '—';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const CAT_COLORS: Record<string, string> = {
  GD: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  SRV: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  CNST: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};
const CAT_LABELS: Record<string, string> = { GD: 'Goods', SRV: 'Services', CNST: 'Construction' };

const COUNTRY_FLAGS: Record<string, string> = {
  Canada: '🇨🇦', CA: '🇨🇦', 'United States': '🇺🇸', US: '🇺🇸', USA: '🇺🇸',
  UK: '🇬🇧', GB: '🇬🇧', Germany: '🇩🇪', France: '🇫🇷', Japan: '🇯🇵',
  China: '🇨🇳', Australia: '🇦🇺', Netherlands: '🇳🇱', Sweden: '🇸🇪',
  Italy: '🇮🇹', India: '🇮🇳', Ireland: '🇮🇪',
};

function countryFlag(c: string): string {
  if (!c) return '🇨🇦';
  return COUNTRY_FLAGS[c] ?? COUNTRY_FLAGS[c.toUpperCase()] ?? '🌐';
}

// ─── Tab: Opportunities ───────────────────────────────────────────────────────

function OpportunitiesTab() {
  const [records, setRecords] = useState<AwardRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [page, setPage] = useState(0);
  const PER_PAGE = 100;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ tab: 'opportunities', page: String(page) });
    if (search) params.set('q', search);
    const res = await fetch(`/api/procurement?${params}`);
    const json = await res.json();
    setRecords(json.records ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  const filtered = catFilter === 'all'
    ? records
    : records.filter(r => r.category.toUpperCase().includes(catFilter));

  const active = records.filter(r => r.status === 'Active').length;
  const totalVal = records.reduce((s, r) => s + r.value, 0);

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Awards', value: total.toLocaleString() },
          { label: 'Active', value: active.toLocaleString(), accent: true },
          { label: 'Page Value', value: fmtCAD(totalVal) },
          { label: 'This Page', value: records.length.toLocaleString() },
        ].map(s => (
          <div key={s.label} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-[10px] text-[var(--ink-faint)] uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`font-mono text-xl font-semibold ${s.accent ? 'text-[var(--ngen-orange)]' : 'text-[var(--ink)]'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-faint)]" />
          <input type="text" placeholder="Search by title, department, or supplier…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:border-[var(--border-hover)]" />
        </div>
        <div className="relative">
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="appearance-none pl-4 pr-8 py-2.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--border-hover)]">
            <option value="all">All Categories</option>
            <option value="GD">Goods</option>
            <option value="SRV">Services</option>
            <option value="CNST">Construction</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-faint)] pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-56 text-[var(--ink-faint)] text-sm">Loading award notices…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-56 text-[var(--ink-faint)] text-sm">No records found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Award / Contract</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden lg:table-cell">Supplier</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden md:table-cell">Department</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Value</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden sm:table-cell">Cat.</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden md:table-cell">Awarded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((r, i) => {
                  const catKey = (r.category.match(/\bGD\b|\bSRV\b|\bCNST\b/) ?? [])[0] ?? '';
                  const isActive = r.status === 'Active';
                  return (
                    <tr key={i} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="px-4 py-3 max-w-[280px]">
                        <div className="font-medium text-[var(--ink)] leading-snug line-clamp-2 text-xs">{r.title}</div>
                        {r.gsin && <div className="text-[10px] text-[var(--ink-faint)] mt-0.5 line-clamp-1">{r.gsin}</div>}
                        <div className="text-[10px] font-mono text-[var(--ink-faint)] mt-0.5">{r.refNumber}</div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="text-xs text-[var(--ink)]">{r.supplier}</div>
                        <div className="text-[10px] text-[var(--ink-faint)] mt-0.5 flex items-center gap-1">
                          <span>{countryFlag(r.supplierCountry)}</span>
                          <span>{r.supplierCity || r.supplierCountry}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell max-w-[180px]">
                        <div className="text-xs text-[var(--ink-muted)] line-clamp-2">{r.department}</div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="font-mono text-sm font-semibold text-[var(--ink)]">{fmtCAD(r.value)}</div>
                        <div className={`text-[10px] mt-0.5 ${isActive ? 'text-green-400' : 'text-[var(--ink-faint)]'}`}>{r.status}</div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {catKey ? (
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium border ${CAT_COLORS[catKey] ?? 'bg-[var(--surface-2)] text-[var(--ink-muted)] border-[var(--border)]'}`}>
                            {CAT_LABELS[catKey] ?? catKey}
                          </span>
                        ) : <span className="text-[var(--ink-faint)] text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">
                        <div className="text-xs text-[var(--ink-muted)]">
                          {r.awardDate ? new Date(r.awardDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                        </div>
                        {r.endDate && <div className="text-[10px] text-[var(--ink-faint)]">ends {new Date(r.endDate).toLocaleDateString('en-CA', { month: 'short', year: '2-digit' })}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={page} setPage={setPage} count={records.length} perPage={PER_PAGE} total={total} />
      <Source text="CanadaBuys Award Notices 2025-2026 · canadabuys.canada.ca" />
    </div>
  );
}

// ─── Tab: Suppliers ───────────────────────────────────────────────────────────

function SuppliersTab() {
  const [records, setRecords] = useState<ContractRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PER_PAGE = 100;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ tab: 'suppliers', page: String(page) });
    if (search) params.set('q', search);
    const res = await fetch(`/api/procurement?${params}`);
    const json = await res.json();
    setRecords(json.records ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  // Roll up by vendor
  const rollup = new Map<string, { vendor: string; total: number; count: number; dept: string; country: string }>();
  for (const r of records) {
    const key = (r.vendor_name ?? '').trim();
    if (!key) continue;
    const val = parseFloat(r.contract_value ?? '0') || 0;
    const ex = rollup.get(key);
    if (ex) { ex.total += val; ex.count += 1; }
    else rollup.set(key, { vendor: key, total: val, count: 1, dept: r.owner_org_title ?? r.buyer_name ?? '', country: r.country_of_vendor ?? 'Canada' });
  }
  const suppliers = Array.from(rollup.values()).sort((a, b) => b.total - a.total);
  const totalSpend = suppliers.reduce((s, r) => s + r.total, 0);
  const foreign = suppliers.filter(s => s.country && s.country !== 'Canada' && s.country !== 'CA').length;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Contracts', value: total.toLocaleString() },
          { label: 'Unique Vendors', value: suppliers.length.toLocaleString(), accent: true },
          { label: 'Page Spend', value: fmtCAD(totalSpend) },
          { label: 'Foreign Vendors', value: foreign.toLocaleString() },
        ].map(s => (
          <div key={s.label} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-[10px] text-[var(--ink-faint)] uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`font-mono text-xl font-semibold ${s.accent ? 'text-[var(--ngen-orange)]' : 'text-[var(--ink)]'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-faint)]" />
          <input type="text" placeholder="Search vendors or departments…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:border-[var(--border-hover)]" />
        </div>
      </div>

      <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-56 text-[var(--ink-faint)] text-sm">Loading suppliers…</div>
        ) : suppliers.length === 0 ? (
          <div className="flex items-center justify-center h-56 text-[var(--ink-faint)] text-sm">No suppliers found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Vendor</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden lg:table-cell">Top Department</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Value</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden sm:table-cell">Contracts</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden md:table-cell">Origin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {suppliers.map((s, i) => {
                  const isDomestic = !s.country || s.country === 'Canada' || s.country === 'CA';
                  return (
                    <tr key={s.vendor} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="px-4 py-3 text-[var(--ink-faint)] text-xs font-mono">{page * PER_PAGE + i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--ink)] text-sm">{s.vendor}</div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-[var(--ink-muted)] line-clamp-1">{s.dept}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-sm font-semibold">{fmtCAD(s.total)}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <span className="text-xs text-[var(--ink-muted)]">{s.count}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span>{countryFlag(s.country)}</span>
                          <span className={isDomestic ? 'text-green-400' : 'text-amber-400'}>{s.country || 'Canada'}</span>
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

      <Pagination page={page} setPage={setPage} count={records.length} perPage={PER_PAGE} total={total} />
      <Source text="Treasury Board · Proactive Disclosure Contracts over $10,000" />
    </div>
  );
}

// ─── Tab: Organizations ───────────────────────────────────────────────────────

function OrganizationsTab() {
  const [records, setRecords] = useState<ContractRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PER_PAGE = 100;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ tab: 'organizations', page: String(page) });
    if (search) params.set('q', search);
    const res = await fetch(`/api/procurement?${params}`);
    const json = await res.json();
    setRecords(json.records ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  // Roll up by department
  const rollup = new Map<string, { name: string; total: number; count: number; topVendor: string; foreign: number }>();
  for (const r of records) {
    const name = (r.owner_org_title ?? r.buyer_name ?? '').trim();
    if (!name) continue;
    const val = parseFloat(r.contract_value ?? '0') || 0;
    const isForeign = r.country_of_vendor && r.country_of_vendor !== 'Canada' && r.country_of_vendor !== 'CA';
    const ex = rollup.get(name);
    if (ex) { ex.total += val; ex.count += 1; if (isForeign) ex.foreign += 1; }
    else rollup.set(name, { name, total: val, count: 1, topVendor: r.vendor_name ?? '', foreign: isForeign ? 1 : 0 });
  }
  const orgs = Array.from(rollup.values()).sort((a, b) => b.total - a.total);
  const top8 = orgs.slice(0, 8);
  const maxVal = top8[0]?.total ?? 1;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total Contracts', value: total.toLocaleString() },
          { label: 'Departments', value: orgs.length.toLocaleString(), accent: true },
          { label: 'Top Spender', value: orgs[0]?.name.split(' ').slice(0, 3).join(' ') ?? '—' },
        ].map(s => (
          <div key={s.label} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-[10px] text-[var(--ink-faint)] uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`font-mono text-xl font-semibold truncate ${s.accent ? 'text-[var(--ngen-orange)]' : 'text-[var(--ink)]'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      {top8.length > 0 && (
        <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl p-5 mb-6">
          <h3 className="text-xs font-medium text-[var(--ink-faint)] uppercase tracking-wider mb-4">Top Departments by Spend (this page)</h3>
          <div className="space-y-3">
            {top8.map(o => (
              <div key={o.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[var(--ink)] truncate max-w-xs">{o.name}</span>
                  <span className="text-xs font-mono font-medium ml-4 shrink-0">{fmtCAD(o.total)}</span>
                </div>
                <div className="h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--ngen-orange)] rounded-full" style={{ width: `${(o.total / maxVal) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-faint)]" />
          <input type="text" placeholder="Search departments…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:border-[var(--border-hover)]" />
        </div>
      </div>

      <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-56 text-[var(--ink-faint)] text-sm">Loading organizations…</div>
        ) : orgs.length === 0 ? (
          <div className="flex items-center justify-center h-56 text-[var(--ink-faint)] text-sm">No organizations found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Department / Agency</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Spend</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden sm:table-cell">Contracts</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden md:table-cell">Foreign</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden lg:table-cell">Top Vendor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {orgs.filter(o => !search || o.name.toLowerCase().includes(search.toLowerCase())).map((o, i) => {
                  const foreignPct = o.count > 0 ? Math.round((o.foreign / o.count) * 100) : 0;
                  return (
                    <tr key={o.name} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="px-4 py-3 text-[var(--ink-faint)] text-xs font-mono">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-[var(--ink-faint)] shrink-0" />
                          <span className="font-medium text-[var(--ink)] text-sm">{o.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-sm font-semibold">{fmtCAD(o.total)}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <span className="text-xs text-[var(--ink-muted)]">{o.count}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        {o.foreign > 0
                          ? <span className="text-xs text-amber-400">{o.foreign} ({foreignPct}%)</span>
                          : <span className="text-xs text-[var(--ink-faint)]">—</span>}
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

      <Pagination page={page} setPage={setPage} count={records.length} perPage={PER_PAGE} total={total} />
      <Source text="Treasury Board · Proactive Disclosure Contracts over $10,000" />
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function Pagination({ page, setPage, count, perPage, total }: {
  page: number; setPage: (fn: (p: number) => number) => void; count: number; perPage: number; total: number;
}) {
  return (
    <div className="flex items-center justify-between mt-4">
      <span className="text-xs text-[var(--ink-faint)]">
        {total > 0 ? `${(page * perPage + 1).toLocaleString()}–${(page * perPage + count).toLocaleString()} of ${total.toLocaleString()}` : `${count} records`}
      </span>
      <div className="flex gap-2">
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
          className="px-3 py-1.5 text-xs bg-[var(--surface-1)] border border-[var(--border)] rounded-md disabled:opacity-40 hover:border-[var(--border-hover)] transition-colors">
          Previous
        </button>
        <button onClick={() => setPage(p => p + 1)} disabled={count < perPage}
          className="px-3 py-1.5 text-xs bg-[var(--surface-1)] border border-[var(--border)] rounded-md disabled:opacity-40 hover:border-[var(--border-hover)] transition-colors">
          Next
        </button>
      </div>
    </div>
  );
}

function Source({ text }: { text: string }) {
  return <p className="text-[10px] text-[var(--ink-faint)] mt-5">Source: {text}</p>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'opportunities', label: 'Opportunities', icon: Sparkles, desc: 'Recent award notices' },
  { id: 'suppliers', label: 'Suppliers', icon: Users, desc: 'Federal vendors ranked by value' },
  { id: 'organizations', label: 'Organizations', icon: Landmark, desc: 'Departments by spend' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function ProcurementPage() {
  const [activeTab, setActiveTab] = useState<TabId>('opportunities');

  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--ink)]">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-1">Procurement Intelligence</h1>
          <p className="text-sm text-[var(--ink-muted)]">Canadian federal procurement data — contracts, suppliers, and organizations from open.canada.ca</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl mb-8 w-fit">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active ? 'bg-[var(--surface-3)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]'
                }`}>
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'opportunities' && <OpportunitiesTab />}
        {activeTab === 'suppliers' && <SuppliersTab />}
        {activeTab === 'organizations' && <OrganizationsTab />}
      </div>
    </div>
  );
}
