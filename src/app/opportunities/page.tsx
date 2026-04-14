'use client';

import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import { Search, ExternalLink, Clock, Building2, Tag, ChevronDown } from 'lucide-react';

interface Tender {
  id: string;
  title: string;
  department: string;
  category: string;
  closingDate: string;
  refNumber: string;
  solicitationNumber: string;
  status: string;
  url: string;
}

const CATEGORIES: Record<string, string> = {
  GD: 'Goods',
  SRV: 'Services',
  CNST: 'Construction',
  SVRTGD: 'Services & Goods',
};

const CAT_COLORS: Record<string, string> = {
  GD: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  SRV: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  CNST: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  SVRTGD: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
};

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function closingColor(days: number): string {
  if (days < 0) return 'text-ink-faint';
  if (days <= 3) return 'text-red-400';
  if (days <= 7) return 'text-amber-400';
  return 'text-green-400';
}

export default function OpportunitiesPage() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [page, setPage] = useState(0);
  const PER_PAGE = 50;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const offset = page * PER_PAGE;
        const q = search ? `&q=${encodeURIComponent(search)}` : '';
        const catQ = catFilter !== 'all' ? `&filters={"procurementCategory-categorieApprovisionnement":"${catFilter}"}` : '';
        const res = await fetch(
          `https://open.canada.ca/data/api/action/datastore_search?resource_id=4e5b7613-e7e6-491d-b9f5-13e820f74b2e&limit=${PER_PAGE}&offset=${offset}${q}${catQ}`
        );
        const json = await res.json();
        const records = json?.result?.records ?? [];
        const mapped: Tender[] = records.map((r: Record<string, string>) => ({
          id: r._id?.toString() ?? '',
          title: r['title-titre-eng'] ?? r['title-titre-fra'] ?? '—',
          department: r['org-org-eng'] ?? r['org-org-fra'] ?? '—',
          category: r['procurementCategory-categorieApprovisionnement'] ?? '',
          closingDate: r['tenderClosingDate-appelOffresdateCloture'] ?? '',
          refNumber: r['referenceNumber-numeroReference'] ?? '',
          solicitationNumber: r['solicitationNumber-numeroSollicitation'] ?? '',
          status: r['tenderStatus-appelOffresStatut-eng'] ?? '',
          url: r['url-eng'] ?? r['url-fra'] ?? '',
        }));
        setTenders(mapped);
      } catch {
        setTenders([]);
      }
      setLoading(false);
    }
    load();
  }, [search, catFilter, page]);

  const open = tenders.filter(t => daysUntil(t.closingDate) >= 0);
  const closing3 = open.filter(t => daysUntil(t.closingDate) <= 3).length;
  const closing7 = open.filter(t => daysUntil(t.closingDate) <= 7).length;

  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--ink)]">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-1">Opportunities</h1>
          <p className="text-sm text-[var(--ink-muted)]">Active federal procurement tenders from CanadaBuys — updated every 2 hours</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Loaded', value: tenders.length.toLocaleString() },
            { label: 'Open', value: open.length.toLocaleString(), accent: true },
            { label: 'Closing ≤3 Days', value: closing3.toString(), warn: true },
            { label: 'Closing ≤7 Days', value: closing7.toString() },
          ].map(s => (
            <div key={s.label} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-4">
              <div className="text-[10px] text-[var(--ink-faint)] uppercase tracking-wider mb-1">{s.label}</div>
              <div className={`font-mono text-xl font-semibold ${s.accent ? 'text-[var(--ngen-orange)]' : s.warn ? 'text-red-400' : 'text-[var(--ink)]'}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-faint)]" />
            <input
              type="text"
              placeholder="Search tenders…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="w-full pl-9 pr-4 py-2.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:border-[var(--border-hover)]"
            />
          </div>
          <div className="relative">
            <select
              value={catFilter}
              onChange={e => { setCatFilter(e.target.value); setPage(0); }}
              className="appearance-none pl-4 pr-8 py-2.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--border-hover)]"
            >
              <option value="all">All Categories</option>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-faint)] pointer-events-none" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-[var(--ink-faint)] text-sm">Loading tenders…</div>
          ) : tenders.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-[var(--ink-faint)] text-sm">No tenders found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Tender</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium hidden md:table-cell">Department</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Category</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] font-medium">Closing</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {tenders.map(t => {
                    const days = daysUntil(t.closingDate);
                    const catKey = t.category.toUpperCase();
                    return (
                      <tr key={t.id} className="hover:bg-[var(--surface-2)] transition-colors">
                        <td className="px-4 py-3 max-w-xs">
                          <div className="font-medium text-[var(--ink)] leading-snug line-clamp-2">{t.title}</div>
                          <div className="text-[11px] text-[var(--ink-faint)] mt-0.5 font-mono">{t.solicitationNumber || t.refNumber}</div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-[var(--ink-muted)] text-xs">
                            <Building2 className="w-3 h-3 shrink-0" />
                            <span className="line-clamp-2">{t.department}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {catKey && CATEGORIES[catKey] ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${CAT_COLORS[catKey] ?? 'bg-[var(--surface-2)] text-[var(--ink-muted)] border-[var(--border)]'}`}>
                              <Tag className="w-2.5 h-2.5" />
                              {CATEGORIES[catKey]}
                            </span>
                          ) : (
                            <span className="text-[var(--ink-faint)] text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className={`flex items-center gap-1.5 text-xs font-medium ${closingColor(days)}`}>
                            <Clock className="w-3 h-3" />
                            {days < 0 ? 'Closed' : days === 0 ? 'Today' : `${days}d`}
                          </div>
                          <div className="text-[10px] text-[var(--ink-faint)] mt-0.5">
                            {t.closingDate ? new Date(t.closingDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {t.url && (
                            <a href={t.url} target="_blank" rel="noopener noreferrer"
                              className="text-[var(--ink-faint)] hover:text-[var(--ngen-orange)] transition-colors">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
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
            Showing {page * PER_PAGE + 1}–{page * PER_PAGE + tenders.length}
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
              disabled={tenders.length < PER_PAGE}
              className="px-3 py-1.5 text-xs bg-[var(--surface-1)] border border-[var(--border)] rounded-md disabled:opacity-40 hover:border-[var(--border-hover)] transition-colors"
            >
              Next
            </button>
          </div>
        </div>

        <p className="text-[10px] text-[var(--ink-faint)] mt-6">
          Source: CanadaBuys / open.canada.ca · Tender notices dataset 6abd20d4
        </p>
      </div>
    </div>
  );
}
