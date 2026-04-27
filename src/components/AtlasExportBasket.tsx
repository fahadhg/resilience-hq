'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import {
  Treemap, ResponsiveContainer, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { TrendingUp, TrendingDown, Globe2, BarChart2, Search, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Sector colours (matching Atlas palette) ──────────────────────────────────
const SECTOR_COLORS: Record<string, string> = {
  '0': '#f1c11b', // Textiles
  '1': '#73af48', // Agriculture
  '2': '#b0b0b0', // Stone
  '3': '#f47d20', // Minerals
  '4': '#3f7abf', // Metals
  '5': '#e53535', // Chemicals
  '6': '#5ab4dc', // Vehicles
  '7': '#e93a6a', // Machinery
  '8': '#fcd05d', // Electronics
  '9': '#9b9b9b', // Other
};

const SECTOR_NAMES: Record<string, string> = {
  '0': 'Textiles', '1': 'Agriculture', '2': 'Stone', '3': 'Minerals',
  '4': 'Metals', '5': 'Chemicals', '6': 'Vehicles', '7': 'Machinery',
  '8': 'Electronics', '9': 'Other',
};

function sectorColor(code: string) {
  return SECTOR_COLORS[code] ?? '#9b9b9b';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtB = (v: number | null | undefined) => {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};

const fmtPct = (v: number | null | undefined) =>
  v == null ? '—' : `${(v * 100).toFixed(2)}%`;

function pciColor(pci: number | null): string {
  if (pci == null) return '#5a6272';
  if (pci >= 1.5)  return '#10b981';
  if (pci >= 0.5)  return '#3b82f6';
  if (pci >= -0.5) return '#f59e0b';
  return '#ef4444';
}

function pciLabel(pci: number | null): string {
  if (pci == null) return '—';
  if (pci >= 1.5)  return 'Very High';
  if (pci >= 0.5)  return 'High';
  if (pci >= -0.5) return 'Medium';
  return 'Low';
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, trend }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: 'up' | 'down' | null;
}) {
  return (
    <div className="p-4 bg-surface-2 rounded-xl border border-border flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-ink-faint font-medium">{label}</span>
        <Icon className="w-3.5 h-3.5 text-ink-faint" />
      </div>
      <div className="font-mono text-2xl font-bold">{value}</div>
      {sub && (
        <div className="flex items-center gap-1 text-xs text-ink-muted">
          {trend === 'up' && <TrendingUp className="w-3 h-3 text-positive" />}
          {trend === 'down' && <TrendingDown className="w-3 h-3 text-negative" />}
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Custom Treemap cell ──────────────────────────────────────────────────────
function TreemapCell(props: any) {
  const { x, y, width, height, name, exportValue, sectorCode, pci, colorBy } = props;
  if (width < 2 || height < 2) return null;
  const fill = colorBy === 'complexity'
    ? pciColor(pci)
    : sectorColor(sectorCode ?? '9');
  const showLabel = width > 60 && height > 28;
  const showValue = width > 80 && height > 48;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#0a0c0f" strokeWidth={1} rx={2} />
      {showLabel && (
        <text x={x + 6} y={y + 16} fontSize={10} fill="rgba(255,255,255,0.9)" fontWeight={600}>
          {name?.length > 18 ? name.slice(0, 16) + '…' : name}
        </text>
      )}
      {showValue && exportValue && (
        <text x={x + 6} y={y + 30} fontSize={9} fill="rgba(255,255,255,0.6)">
          {fmtB(exportValue)}
        </text>
      )}
    </g>
  );
}

// ─── Treemap tooltip ──────────────────────────────────────────────────────────
function TreemapTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload?.root ?? payload[0]?.payload;
  if (!d?.name || d.children) return null;
  return (
    <div className="bg-surface-2 border border-border rounded-lg px-3 py-2.5 shadow-lg text-xs max-w-[220px]">
      <div className="font-semibold text-sm mb-1.5">{d.name}</div>
      <div className="space-y-1 text-ink-muted">
        <div className="flex justify-between gap-4">
          <span>HS Code</span>
          <span className="font-mono text-ink">{d.code}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Sector</span>
          <span className="text-ink">{d.sector}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Export Value</span>
          <span className="font-mono text-ink">{fmtB(d.exportValue)}</span>
        </div>
        {d.pci != null && (
          <div className="flex justify-between gap-4">
            <span>PCI</span>
            <span className="font-mono" style={{ color: pciColor(d.pci) }}>
              {d.pci > 0 ? '+' : ''}{d.pci.toFixed(3)} ({pciLabel(d.pci)})
            </span>
          </div>
        )}
        {d.exportRca != null && (
          <div className="flex justify-between gap-4">
            <span>RCA</span>
            <span className={clsx('font-mono', d.exportRca >= 1 ? 'text-positive' : 'text-ink')}>
              {d.exportRca.toFixed(2)}{d.exportRca >= 1 ? ' ✓' : ''}
            </span>
          </div>
        )}
        {d.globalMarketShare != null && (
          <div className="flex justify-between gap-4">
            <span>World share</span>
            <span className="font-mono text-ink">{fmtPct(d.globalMarketShare)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
type SortKey = 'exportValue' | 'pci' | 'exportRca' | 'globalMarketShare';

export default function AtlasExportBasket() {
  const [year, setYear] = useState(2022);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [colorBy, setColorBy] = useState<'sector' | 'complexity'>('sector');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('exportValue');
  const [sortAsc, setSortAsc] = useState(false);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/atlas/canada?year=${y}`);
      setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(year); }, [load, year]);

  // Build treemap data grouped by sector (only products > $50M for performance)
  const treemapData = useMemo(() => {
    if (!data?.products) return [];
    const threshold = 50_000_000;
    const sectors = new Map<string, any>();

    for (const p of data.products) {
      if ((p.exportValue ?? 0) < threshold) continue;
      const key = p.sectorCode ?? '9';
      if (!sectors.has(key)) {
        sectors.set(key, {
          name: p.sector ?? SECTOR_NAMES[key] ?? 'Other',
          sectorCode: key,
          children: [],
          exportValue: 0,
        });
      }
      const s = sectors.get(key)!;
      s.children.push({ ...p, size: p.exportValue });
      s.exportValue += p.exportValue;
    }
    return Array.from(sectors.values()).sort((a, b) => b.exportValue - a.exportValue);
  }, [data]);

  // Filtered + sorted product table
  const tableProducts = useMemo(() => {
    if (!data?.products) return [];
    let rows = data.products as any[];
    if (sectorFilter) rows = rows.filter((p: any) => p.sectorCode === sectorFilter);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((p: any) =>
        p.name?.toLowerCase().includes(q) || p.code?.includes(q)
      );
    }
    return [...rows].sort((a: any, b: any) => {
      const av = a[sortKey] ?? (sortAsc ? Infinity : -Infinity);
      const bv = b[sortKey] ?? (sortAsc ? Infinity : -Infinity);
      return sortAsc ? av - bv : bv - av;
    });
  }, [data, search, sortKey, sortAsc, sectorFilter]);

  // Active sectors for legend
  const activeSectors = useMemo(() => {
    if (!data?.products) return [];
    const seen = new Map<string, string>();
    for (const p of data.products) {
      if (p.sectorCode && !seen.has(p.sectorCode)) seen.set(p.sectorCode, p.sector);
    }
    return Array.from(seen.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  // ECI trend
  const eciTrend = useMemo(() => {
    if (!data?.eciHistory) return [];
    return data.eciHistory
      .filter((r: any) => r.year >= 2000)
      .map((r: any) => ({ year: r.year, eci: r.eci ? +r.eci.toFixed(3) : null }));
  }, [data]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />
      : <ChevronDown className="w-3 h-3 inline opacity-30" />;

  const years = Array.from({ length: 2022 - 1995 + 1 }, (_, i) => 2022 - i);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <div className="text-xs text-ink-faint">Loading Harvard Atlas data for {year}…</div>
      </div>
    );
  }

  if (!data || data.status === 'error') {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center text-sm text-negative">
        Failed to load data from Harvard Atlas.
      </div>
    );
  }

  const latestEci = data.eciHistory?.find((r: any) => r.year === year);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">🇨🇦</span>
            <h1 className="text-2xl font-bold tracking-tight">Canada — Export Basket</h1>
          </div>
          <p className="text-sm text-ink-muted max-w-xl">
            Export structure, product complexity (PCI), and revealed comparative advantage (RCA)
            — powered by the{' '}
            <a
              href="https://atlas.hks.harvard.edu/countries/124/export-basket"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Harvard Atlas of Economic Complexity
            </a>.
          </p>
        </div>

        {/* Year selector */}
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs text-ink-faint font-medium">Year</label>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value, 10))}
            className="bg-surface-2 border border-border text-sm rounded-lg px-3 py-1.5 text-ink focus:outline-none focus:border-accent"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* ── Summary stat cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Total Exports" value={fmtB(data.totalExports)} sub={`${year} merchandise`} icon={Globe2} />
        <StatCard
          label="ECI Score"
          value={latestEci?.eci != null ? latestEci.eci.toFixed(3) : '—'}
          sub="Economic Complexity Index"
          icon={BarChart2}
        />
        <StatCard
          label="GDP"
          value={latestEci?.gdp != null ? fmtB(latestEci.gdp) : '—'}
          sub={`GDP per capita: ${latestEci?.gdppc ? '$' + latestEci.gdppc.toLocaleString() : '—'}`}
          icon={TrendingUp}
        />
        <StatCard
          label="Products Exported"
          value={data.products?.length?.toLocaleString() ?? '—'}
          sub={`with RCA ≥ 1: ${data.products?.filter((p: any) => (p.exportRca ?? 0) >= 1).length}`}
          icon={BarChart2}
        />
      </div>

      {/* ── Treemap ─────────────────────────────────────────────────────────── */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 mb-6">
        {/* Treemap header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold">Export Basket Treemap</h2>
            <p className="text-xs text-ink-faint mt-0.5">Cell size = export value · Hover for details</p>
          </div>
          <div className="flex items-center gap-1 p-0.5 bg-surface-2 rounded-lg border border-border">
            {(['sector', 'complexity'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setColorBy(opt)}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize',
                  colorBy === opt ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
                )}
              >
                {opt === 'complexity' ? 'Complexity (PCI)' : 'Sector'}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[460px]">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={treemapData}
              dataKey="exportValue"
              aspectRatio={4 / 3}
              content={<TreemapCell colorBy={colorBy} />}
            >
              <RTooltip content={<TreemapTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>

        {/* Sector legend / filter */}
        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border">
          <button
            onClick={() => setSectorFilter(null)}
            className={clsx(
              'px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors',
              sectorFilter === null
                ? 'bg-accent/20 border-accent/40 text-accent'
                : 'border-border text-ink-faint hover:text-ink'
            )}
          >
            All sectors
          </button>
          {activeSectors.map(([code, name]) => (
            <button
              key={code}
              onClick={() => setSectorFilter(sectorFilter === code ? null : code)}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors',
                sectorFilter === code
                  ? 'border-white/20 text-white'
                  : 'border-border text-ink-faint hover:text-ink'
              )}
              style={sectorFilter === code ? { background: sectorColor(code) + '33', borderColor: sectorColor(code) + '66' } : {}}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sectorColor(code) }} />
              {name}
            </button>
          ))}
        </div>

        {/* Complexity legend */}
        {colorBy === 'complexity' && (
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-border text-[10px] text-ink-muted">
            <span className="font-medium text-ink-faint">PCI:</span>
            {[
              { label: 'Very High (≥1.5)', color: '#10b981' },
              { label: 'High (0.5–1.5)', color: '#3b82f6' },
              { label: 'Medium (−0.5–0.5)', color: '#f59e0b' },
              { label: 'Low (<−0.5)', color: '#ef4444' },
            ].map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Products table ──────────────────────────────────────────────────── */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold">
            Products
            {sectorFilter && (
              <span className="ml-2 text-xs font-normal text-ink-faint">
                — filtered: {SECTOR_NAMES[sectorFilter]}
              </span>
            )}
          </h2>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              type="text"
              placeholder="Search products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent w-52"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 px-3 text-left text-[10px] font-medium text-ink-faint uppercase tracking-wider w-12">HS92</th>
                <th className="py-2 px-3 text-left text-[10px] font-medium text-ink-faint uppercase tracking-wider">Product</th>
                <th className="py-2 px-3 text-left text-[10px] font-medium text-ink-faint uppercase tracking-wider hidden sm:table-cell">Sector</th>
                <th
                  className="py-2 px-3 text-right text-[10px] font-medium text-ink-faint uppercase tracking-wider cursor-pointer hover:text-ink select-none"
                  onClick={() => handleSort('exportValue')}
                >
                  Export Value <SortIcon k="exportValue" />
                </th>
                <th
                  className="py-2 px-3 text-right text-[10px] font-medium text-ink-faint uppercase tracking-wider cursor-pointer hover:text-ink select-none hidden md:table-cell"
                  onClick={() => handleSort('globalMarketShare')}
                >
                  World Share <SortIcon k="globalMarketShare" />
                </th>
                <th
                  className="py-2 px-3 text-right text-[10px] font-medium text-ink-faint uppercase tracking-wider cursor-pointer hover:text-ink select-none"
                  onClick={() => handleSort('exportRca')}
                >
                  RCA <SortIcon k="exportRca" />
                </th>
                <th
                  className="py-2 px-3 text-right text-[10px] font-medium text-ink-faint uppercase tracking-wider cursor-pointer hover:text-ink select-none hidden lg:table-cell"
                  onClick={() => handleSort('pci')}
                >
                  PCI <SortIcon k="pci" />
                </th>
              </tr>
            </thead>
            <tbody>
              {tableProducts.slice(0, 100).map((p: any) => (
                <tr key={p.productId} className="border-b border-border hover:bg-surface-2 transition-colors">
                  <td className="py-2 px-3 font-mono text-ink-faint text-[10px]">{p.code}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sectorColor(p.sectorCode) }} />
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-ink-muted hidden sm:table-cell">{p.sector}</td>
                  <td className="py-2 px-3 text-right font-mono">{fmtB(p.exportValue)}</td>
                  <td className="py-2 px-3 text-right font-mono text-ink-muted hidden md:table-cell">
                    {p.globalMarketShare != null ? fmtPct(p.globalMarketShare) : '—'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {p.exportRca != null ? (
                      <span className={clsx('font-mono', p.exportRca >= 1 ? 'text-positive' : 'text-ink-muted')}>
                        {p.exportRca.toFixed(2)}
                      </span>
                    ) : <span className="text-ink-faint">—</span>}
                  </td>
                  <td className="py-2 px-3 text-right hidden lg:table-cell">
                    {p.pci != null ? (
                      <span className="font-mono text-[10px]" style={{ color: pciColor(p.pci) }}>
                        {p.pci > 0 ? '+' : ''}{p.pci.toFixed(2)}
                      </span>
                    ) : <span className="text-ink-faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tableProducts.length > 100 && (
            <div className="text-center text-xs text-ink-faint mt-3">
              Showing top 100 of {tableProducts.length} products.
            </div>
          )}
        </div>
      </div>

      {/* ── ECI Trend ───────────────────────────────────────────────────────── */}
      <div className="bg-surface-1 border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-1">Economic Complexity Index (ECI) — Canada</h2>
        <p className="text-xs text-ink-faint mb-4">2000–2022 · Higher = more complex export basket</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={eciTrend} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#5a6272' }} axisLine={false} tickLine={false} interval={4} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#5a6272' }} axisLine={false} tickLine={false} />
              <Tooltip
                content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-surface-2 border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
                      <div className="text-ink-muted mb-1">{label}</div>
                      <div className="font-mono text-ink">ECI: {payload[0]?.value?.toFixed(3)}</div>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone" dataKey="eci" stroke="#F15A22"
                strokeWidth={2} dot={false} activeDot={{ r: 5, fill: '#F15A22' }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Attribution */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border text-[10px] text-ink-faint">
          <span className="live-dot" />
          <span>Data: Harvard Growth Lab — Atlas of Economic Complexity · atlas.hks.harvard.edu</span>
        </div>
      </div>
    </div>
  );
}
