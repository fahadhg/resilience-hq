'use client';

import { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';

// ─── tiny helpers ────────────────────────────────────────────────────────────
const fmtM = (v: number | null | undefined) =>
  v == null ? '—' : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v.toLocaleString()}`;

const fmtPct = (v: string | number | null | undefined) =>
  v == null ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`;

const yoyColor = (v: string | number | null | undefined) => {
  const n = Number(v);
  if (isNaN(n)) return 'text-ink-muted';
  return n > 5 ? 'text-negative' : n < -5 ? 'text-positive' : 'text-warn';
};

function Pill({ label, color }: { label: string; color: 'green' | 'red' | 'yellow' | 'blue' }) {
  const cls = {
    green:  'bg-positive/10 text-positive',
    red:    'bg-negative/10 text-negative',
    yellow: 'bg-warn/10 text-warn',
    blue:   'bg-accent/10 text-accent',
  }[color];
  return <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full', cls)}>{label}</span>;
}

function ModuleHeader({ title, sub, refreshing, onRefresh, lastUpdated }: {
  title: string; sub: string; refreshing: boolean;
  onRefresh: () => void; lastUpdated?: string;
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <p className="text-xs text-ink-muted mt-0.5">{sub}</p>
      </div>
      <div className="flex items-center gap-2">
        {lastUpdated && <span className="text-[10px] text-ink-faint">{lastUpdated}</span>}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="text-[10px] bg-surface-2 border border-border hover:border-border-hover px-2 py-1 rounded transition-colors text-ink-muted hover:text-ink disabled:opacity-50"
        >
          {refreshing ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-2xl mb-2">📡</div>
      <p className="text-xs text-ink-faint max-w-xs">{message}</p>
    </div>
  );
}

// ─── Module 1: Manufacturing Health Dashboard ─────────────────────────────────
function MfgHealthModule() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/statcan/mfg-health');
      const json = await res.json();
      if (json.status === 'error') throw new Error(json.message);
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sales: any[] = data?.sales || [];
  const cap: any[]   = data?.capacity || [];

  // Group by period for sparkline effect
  const byIndustry: Record<string, any[]> = {};
  sales.forEach(r => {
    if (!byIndustry[r.industry]) byIndustry[r.industry] = [];
    byIndustry[r.industry].push(r);
  });

  return (
    <div className="p-5 bg-surface-1 border border-border rounded-xl">
      <ModuleHeader
        title="Manufacturing Health Dashboard"
        sub="Monthly mfg sales by NAICS · Capacity utilization · Tariff exposure overlay"
        refreshing={loading}
        onRefresh={load}
        lastUpdated={data?.lastUpdated ? `Updated ${data.lastUpdated}` : undefined}
      />

      {error && (
        <div className="mb-4 p-3 bg-negative/5 border border-negative/20 rounded text-xs text-negative">
          <strong>StatsCan API error:</strong> {error}
          <br /><span className="text-ink-faint">Tables 16-10-0117-01 (mfg sales) · 16-10-0014-01 (capacity utilization) refresh daily at 08:30 ET.</span>
        </div>
      )}

      {!error && sales.length === 0 && !loading && (
        <EmptyState message="Statistics Canada data loads from live API at runtime. Data refreshes daily at 08:30 ET. Tables: 16-10-0117-01 (mfg sales) and 16-10-0014-01 (capacity utilization)." />
      )}

      {sales.length > 0 && (
        <div className="overflow-x-auto mb-5">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Industry', 'Period', 'Sales', 'Unit', 'YoY'].map(h => (
                  <th key={h} className="py-2 px-2 text-[10px] font-medium text-ink-faint uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(byIndustry).slice(0, 15).map(([ind, rows]) => {
                const latest = rows.sort((a, b) => b.period > a.period ? 1 : -1)[0];
                const prev   = rows[rows.length - 1];
                const yoy    = latest?.value && prev?.value
                  ? ((latest.value - prev.value) / prev.value * 100).toFixed(1)
                  : null;
                return (
                  <tr key={ind} className="border-b border-border hover:bg-surface-2 transition-colors">
                    <td className="py-1.5 px-2 text-ink">{ind}</td>
                    <td className="py-1.5 px-2 text-ink-muted font-mono">{latest?.period}</td>
                    <td className="py-1.5 px-2 font-mono">{latest?.value?.toLocaleString()}</td>
                    <td className="py-1.5 px-2 text-ink-faint">{latest?.unit}</td>
                    <td className={clsx('py-1.5 px-2 font-mono font-medium', yoyColor(yoy))}>{fmtPct(yoy)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cap.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">Capacity Utilization</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {cap.slice(0, 9).map((c, i) => (
              <div key={i} className="p-2.5 bg-surface-2 rounded border border-border">
                <div className="text-[10px] text-ink-faint mb-1 truncate">{c.industry}</div>
                <div className="font-mono text-sm font-semibold">
                  {c.rate != null ? `${c.rate}%` : '—'}
                </div>
                <div className="text-[10px] text-ink-faint">{c.period}</div>
                {c.rate != null && (
                  <div className="mt-1.5 h-1 bg-surface-1 rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full', c.rate > 85 ? 'bg-negative' : c.rate > 75 ? 'bg-warn' : 'bg-positive')}
                      style={{ width: `${Math.min(c.rate, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 pt-3 border-t border-border flex gap-3 text-[10px] text-ink-faint">
        <span>Source: Statistics Canada</span>
        <span>·</span>
        <span>Table 16-10-0117-01 · 16-10-0014-01</span>
        <span>·</span>
        <span>Refreshes daily 08:30 ET</span>
      </div>
    </div>
  );
}

// ─── Module 2: Labour Market Signal Monitor ───────────────────────────────────
function LabourModule() {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [province, setProvince] = useState('All');

  const PROVINCES = ['All', 'Ontario', 'Quebec', 'British Columbia', 'Alberta'];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/statcan/labour');
      const json = await res.json();
      if (json.status === 'error') throw new Error(json.message);
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const vacancies: any[]  = (data?.vacancies || []).filter((v: any) =>
    province === 'All' || (v.province || '').includes(province)
  );
  const flags: string[] = data?.hardToFillFlags || [];

  return (
    <div className="p-5 bg-surface-1 border border-border rounded-xl">
      <ModuleHeader
        title="Labour Market Signal Monitor"
        sub="Job vacancies · Employment trends · Hard-to-fill roles in advanced manufacturing"
        refreshing={loading}
        onRefresh={load}
      />

      {flags.length > 0 && (
        <div className="mb-4 p-3 bg-warn/5 border border-warn/20 rounded">
          <div className="text-[10px] font-semibold text-warn uppercase tracking-wider mb-1.5">Hard-to-fill alerts</div>
          <div className="space-y-1">
            {flags.map((f, i) => (
              <div key={i} className="text-xs text-ink flex items-center gap-2">
                <span className="text-warn">⚠</span>{f}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-negative/5 border border-negative/20 rounded text-xs text-negative">
          <strong>StatsCan API error:</strong> {error}
        </div>
      )}

      {/* Province filter */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {PROVINCES.map(p => (
          <button key={p} onClick={() => setProvince(p)}
            className={clsx('text-[10px] px-2.5 py-1 rounded-full border transition-colors',
              province === p
                ? 'bg-accent/10 border-accent/30 text-accent'
                : 'border-border text-ink-muted hover:border-border-hover hover:text-ink'
            )}>
            {p}
          </button>
        ))}
      </div>

      {!error && vacancies.length === 0 && !loading && (
        <EmptyState message="Job vacancy data from StatsCan table 14-10-0325-01. Refreshed quarterly. Select a province above once data loads." />
      )}

      {vacancies.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Industry', 'Province', 'Period', 'Vacancies', 'Unit'].map(h => (
                  <th key={h} className="py-2 px-2 text-[10px] font-medium text-ink-faint uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vacancies.slice(0, 20).map((v: any, i: number) => (
                <tr key={i} className="border-b border-border hover:bg-surface-2 transition-colors">
                  <td className="py-1.5 px-2 text-ink">{v.industry}</td>
                  <td className="py-1.5 px-2 text-ink-muted">{v.province}</td>
                  <td className="py-1.5 px-2 font-mono text-ink-muted">{v.period}</td>
                  <td className="py-1.5 px-2 font-mono font-medium">
                    {v.vacancies?.toLocaleString() ?? '—'}
                  </td>
                  <td className="py-1.5 px-2 text-ink-faint">{v.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border flex gap-3 text-[10px] text-ink-faint">
        <span>Source: Statistics Canada</span>
        <span>·</span>
        <span>Table 14-10-0325-01 · 14-10-0202-01</span>
      </div>
    </div>
  );
}

// ─── Module 3: Input Cost Tracker ────────────────────────────────────────────
function InputCostModule() {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [naics, setNaics]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/statcan/input-costs${naics ? `?naics=${naics}` : ''}`;
      const res  = await fetch(url);
      const json = await res.json();
      if (json.status === 'error') throw new Error(json.message);
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [naics]);

  useEffect(() => { load(); }, [load]);

  const alerts: any[] = data?.alerts || [];
  const ippi: any[]   = data?.ippi   || [];
  const rmpi: any[]   = data?.rmpi   || [];

  return (
    <div className="p-5 bg-surface-1 border border-border rounded-xl">
      <ModuleHeader
        title="Input Cost Tracker"
        sub="Industrial Product Price Index (IPPI) · Raw Materials Price Index (RMPI) · YoY alerts"
        refreshing={loading}
        onRefresh={load}
      />

      {/* NAICS filter */}
      <div className="flex gap-2 mb-4">
        <input
          value={naics}
          onChange={e => setNaics(e.target.value)}
          placeholder="NAICS code filter (e.g. 332, 336)…"
          className="flex-1 bg-surface-2 border border-border rounded px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/40"
        />
        <button onClick={load} className="text-xs bg-accent/10 border border-accent/20 text-accent px-3 py-1.5 rounded hover:bg-accent/20">
          Filter
        </button>
      </div>

      {/* Price spike alerts */}
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">Price spike alerts (|YoY| &gt; 5%)</div>
          {alerts.map((a, i) => (
            <div key={i} className={clsx(
              'flex items-center justify-between px-3 py-2 rounded border text-xs',
              a.severity === 'high' ? 'bg-negative/5 border-negative/20' : 'bg-warn/5 border-warn/20'
            )}>
              <span className="font-medium">{a.product}</span>
              <div className="flex items-center gap-3">
                <span className="text-ink-faint">Index: {a.latest?.toFixed(1)}</span>
                <span className={clsx('font-mono font-semibold', a.yoy > 0 ? 'text-negative' : 'text-positive')}>
                  {fmtPct(a.yoy)}
                </span>
                <Pill label={a.severity === 'high' ? 'HIGH' : 'MEDIUM'} color={a.severity === 'high' ? 'red' : 'yellow'} />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-negative/5 border border-negative/20 rounded text-xs text-negative">
          <strong>StatsCan API error:</strong> {error}
        </div>
      )}

      {!error && ippi.length === 0 && !loading && (
        <EmptyState message="IPPI and RMPI data from Statistics Canada. Tables: 18-10-0034-01 (IPPI) and 18-10-0267-01 (RMPI). Updated monthly." />
      )}

      {ippi.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">Industrial Product Prices (IPPI)</h3>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {['Product', 'Latest period', 'Index', 'YoY change'].map(h => (
                    <th key={h} className="py-2 px-2 text-[10px] font-medium text-ink-faint uppercase tracking-wider text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ippi.map((p, i) => (
                  <tr key={i} className="border-b border-border hover:bg-surface-2 transition-colors">
                    <td className="py-1.5 px-2 text-ink">{p.product}</td>
                    <td className="py-1.5 px-2 font-mono text-ink-muted">{p.latest?.[0]?.period}</td>
                    <td className="py-1.5 px-2 font-mono">{p.latest?.[0]?.index?.toFixed(1) ?? '—'}</td>
                    <td className={clsx('py-1.5 px-2 font-mono font-medium', yoyColor(p.yoy))}>{fmtPct(p.yoy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rmpi.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">Raw Materials Prices (RMPI)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {rmpi.slice(0, 9).map((c, i) => (
              <div key={i} className="p-2.5 bg-surface-2 rounded border border-border">
                <div className="text-[10px] text-ink-faint mb-1 truncate">{c.commodity}</div>
                <div className="font-mono text-sm font-semibold">{c.latest?.[0]?.index?.toFixed(1) ?? '—'}</div>
                <div className={clsx('text-xs font-mono font-medium', yoyColor(c.yoy))}>{fmtPct(c.yoy)} YoY</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 pt-3 border-t border-border flex gap-3 text-[10px] text-ink-faint">
        <span>Source: Statistics Canada</span>
        <span>·</span>
        <span>Table 18-10-0034-01 (IPPI) · 18-10-0267-01 (RMPI)</span>
      </div>
    </div>
  );
}

// ─── Module 4: Export Market Intelligence Briefer ─────────────────────────────
function ExportIntelModule() {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [hsInput, setHsInput] = useState('');
  const [submitted, setSubmitted] = useState('');

  const load = useCallback(async (hs: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/statcan/exports${hs ? `?hs=${hs.replace(/\./g, '').slice(0, 6)}` : ''}`;
      const res  = await fetch(url);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  const handleSearch = () => {
    setSubmitted(hsInput);
    load(hsInput);
  };

  const tops: any[]  = data?.topDestinations || [];
  const rates: any   = data?.partnerRates || {};
  const note: string = data?.meta?.note || '';

  // Key partners with FTA status
  const PARTNERS = [
    { code: 'US', name: 'United States', fta: 'CUSMA' },
    { code: 'EU', name: 'European Union', fta: 'CETA' },
    { code: 'UK', name: 'United Kingdom', fta: 'CUKTCA' },
    { code: 'JP', name: 'Japan', fta: 'CPTPP' },
    { code: 'MX', name: 'Mexico', fta: 'CUSMA' },
    { code: 'KR', name: 'South Korea', fta: 'CKFTA' },
    { code: 'CN', name: 'China', fta: null },
    { code: 'IN', name: 'India', fta: null },
  ];

  const chapterPrefix = submitted ? submitted.replace(/\./g, '').slice(0, 2) : '';

  return (
    <div className="p-5 bg-surface-1 border border-border rounded-xl">
      <ModuleHeader
        title="Export Market Intelligence Briefer"
        sub="Top export destinations · Partner tariff rates · FTA provisions · Trade flow trends"
        refreshing={loading}
        onRefresh={() => load(submitted)}
      />

      {/* HS search */}
      <div className="flex gap-2 mb-5">
        <input
          value={hsInput}
          onChange={e => setHsInput(e.target.value)}
          placeholder="Enter HS code prefix (e.g. 7308, 8471, 8703)…"
          className="flex-1 bg-surface-2 border border-border rounded px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/40"
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
        />
        <button onClick={handleSearch} className="text-xs bg-accent/10 border border-accent/20 text-accent px-3 py-1.5 rounded hover:bg-accent/20">
          Analyze
        </button>
      </div>

      {note && (
        <div className="mb-4 p-2.5 bg-surface-2 border border-border rounded text-[10px] text-ink-muted">
          ℹ {note}
        </div>
      )}

      {/* Partner tariff matrix */}
      {chapterPrefix && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
            Tariff rates for chapter {chapterPrefix} by partner
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PARTNERS.map(p => {
              const rate = rates[p.code]?.[chapterPrefix];
              return (
                <div key={p.code} className="p-2.5 bg-surface-2 rounded border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold">{p.code}</span>
                    {p.fta
                      ? <Pill label={p.fta} color="green" />
                      : <Pill label="No FTA" color="red" />
                    }
                  </div>
                  <div className="text-[10px] text-ink-faint mb-1.5">{p.name}</div>
                  <div className={clsx('font-mono text-base font-bold', rate === 0 ? 'text-positive' : rate != null && rate > 5 ? 'text-negative' : 'text-warn')}>
                    {rate == null ? '—' : rate === 0 ? 'Free' : `${rate}%`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tops.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
            Top export destinations {submitted && `(HS ${submitted})`}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {['Country', 'Export value', 'FTA status', `Rate (Ch ${chapterPrefix || '—'})`].map(h => (
                    <th key={h} className="py-2 px-2 text-[10px] font-medium text-ink-faint uppercase tracking-wider text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tops.map((d, i) => (
                  <tr key={i} className="border-b border-border hover:bg-surface-2 transition-colors">
                    <td className="py-1.5 px-2 font-medium">{d.country}</td>
                    <td className="py-1.5 px-2 font-mono">{fmtM(d.value)}</td>
                    <td className="py-1.5 px-2">
                      {d.hasFTA ? <Pill label="FTA" color="green" /> : <Pill label="MFN only" color="red" />}
                    </td>
                    <td className="py-1.5 px-2 font-mono">
                      {d.tariffRate == null ? '—' : d.tariffRate === 0 ? <span className="text-positive">Free</span> : `${d.tariffRate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!submitted && tops.length === 0 && !loading && (
        <EmptyState message="Enter an HS code prefix above to see top export destinations, partner tariff rates, and FTA provisions. Trade data from StatsCan table 12-10-0011-01." />
      )}

      {error && (
        <div className="mb-4 p-3 bg-negative/5 border border-negative/20 rounded text-xs text-negative">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border flex gap-3 text-[10px] text-ink-faint">
        <span>Source: Statistics Canada · Global Affairs Canada</span>
        <span>·</span>
        <span>Table 12-10-0011-01</span>
      </div>
    </div>
  );
}

// ─── Top-level Intel Dashboard ────────────────────────────────────────────────
const MODULES = [
  { id: 'mfg',    label: 'Mfg Health',    emoji: '🏭' },
  { id: 'labour', label: 'Labour',         emoji: '👷' },
  { id: 'costs',  label: 'Input Costs',   emoji: '📦' },
  { id: 'export', label: 'Export Intel',  emoji: '🌐' },
] as const;

export default function IntelDashboard() {
  const [active, setActive] = useState<string>('mfg');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold tracking-tight mb-1">Intel Modules</h1>
        <p className="text-xs text-ink-muted">
          Live Statistics Canada data · Refreshes at 08:30 ET daily · Tariff exposure overlay
        </p>
      </div>

      {/* Module tabs */}
      <div className="flex gap-0 border-b border-border mb-6 overflow-x-auto">
        {MODULES.map(m => (
          <button
            key={m.id}
            onClick={() => setActive(m.id)}
            className={clsx(
              'px-4 py-2 text-xs whitespace-nowrap transition-colors shrink-0',
              active === m.id ? 'text-ink font-medium tab-active' : 'text-ink-muted hover:text-ink'
            )}
          >
            {m.emoji} {m.label}
          </button>
        ))}
      </div>

      {/* Module content */}
      <div className="animate-fade-in">
        {active === 'mfg'    && <MfgHealthModule />}
        {active === 'labour' && <LabourModule />}
        {active === 'costs'  && <InputCostModule />}
        {active === 'export' && <ExportIntelModule />}
      </div>

      {/* Footer note */}
      <div className="mt-8 p-4 bg-surface-1 border border-border rounded-lg">
        <div className="text-[10px] text-ink-faint space-y-1">
          <div className="font-semibold text-ink-muted mb-1">About Intel Modules</div>
          <div>All data is fetched live from the Statistics Canada Web Data Service (WDS) at runtime. Results are cached for 1 hour server-side.</div>
          <div>If the API is unavailable, modules will show informational placeholders with direct links to the source tables.</div>
          <div className="mt-2 flex flex-wrap gap-3">
            <span>Mfg sales: 16-10-0117-01</span>
            <span>·</span>
            <span>Capacity: 16-10-0014-01</span>
            <span>·</span>
            <span>Job vacancies: 14-10-0325-01</span>
            <span>·</span>
            <span>IPPI: 18-10-0034-01</span>
            <span>·</span>
            <span>RMPI: 18-10-0267-01</span>
            <span>·</span>
            <span>Trade: 12-10-0011-01</span>
          </div>
        </div>
      </div>
    </div>
  );
}
