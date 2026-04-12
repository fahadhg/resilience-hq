import Link from 'next/link';
import Nav from '@/components/Nav';
import { loadAllData } from '@/lib/loadData';
import { fmtVal } from '@/lib/data';
import type { HSSection } from '@/lib/data';
import { 
  BarChart3, Bot, SlidersHorizontal, Banknote, 
  Globe2, AlertTriangle, Link2, Newspaper 
} from 'lucide-react';

// ─── Stat tile (server component, no hooks) ───────────────────────────────────
function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-surface-1 border border-border rounded-lg p-4 hover:border-border-hover transition-colors">
      <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`font-mono text-xl font-semibold ${accent ? 'text-ngen' : 'text-ink'}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-ink-faint mt-1.5">{sub}</div>}
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function SectionCard({ sec }: { sec: HSSection }) {
  const hasImports = sec.totalImports > 0;
  return (
    <Link
      href={`/industries/${sec.slug}`}
      className="block p-4 bg-surface-1 border border-border rounded-lg hover:border-ngen/50 hover:bg-surface-2/80 transition-all group"
    >
      <div className="font-medium text-sm mb-1.5 group-hover:text-ngen transition-colors leading-snug">
        {sec.name}
      </div>
      <div className="text-xs text-ink-faint mb-3 leading-relaxed line-clamp-2">
        {sec.description}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-0.5">Imports</div>
          <div className="font-mono text-sm font-medium">
            {hasImports ? fmtVal(sec.totalImports) : '—'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-ink-muted">{sec.codeCount.toLocaleString()} codes</div>
          {sec.surtaxAffected > 0 && (
            <div className="text-[10px] font-medium text-negative">
              {sec.surtaxAffected} surtaxed
            </div>
          )}
        </div>
      </div>
      {sec.topSources.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-border/50 text-[10px] text-ink-faint truncate">
          Top: {sec.topSources.slice(0, 3).map(s => s.n).join(' · ')}
        </div>
      )}
    </Link>
  );
}

// ─── Tool card ────────────────────────────────────────────────────────────────
const TOOLS: { icon: React.ElementType; label: string; desc: string }[] = [
  { icon: BarChart3, label: 'BOM Analyzer', desc: 'Upload CSV, calculate duties & FTA savings' },
  { icon: Bot, label: 'AI Classifier', desc: 'Claude-powered HS code suggestions' },
  { icon: SlidersHorizontal, label: 'What-If Modeler', desc: 'Scenario surtax impact analysis' },
  { icon: Banknote, label: 'Drawback Calc', desc: '3-method duty refund estimates' },
  { icon: Globe2, label: 'FTA Gap', desc: 'Origin-switching opportunities' },
  { icon: AlertTriangle, label: 'Risk Map', desc: 'HHI concentration & risk scoring' },
  { icon: Link2, label: 'Supply Chain', desc: 'Multi-tier surtax exposure model' },
  { icon: Newspaper, label: 'Gazette Alerts', desc: 'Live Canada Gazette SOR tracking' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function Home() {
  const { tariffData, surtaxData, sections } = await loadAllData();

  const totalImports = sections.reduce((s, sec) => s + sec.totalImports, 0);
  const totalCodes = tariffData.length;
  const dutiableCodes = tariffData.filter(t => t.m > 0).length;
  const surtaxCodes = sections.reduce((s, sec) => s + sec.surtaxAffected, 0);

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="live-dot" />
            <span className="text-xs text-ink-muted font-medium tracking-wide uppercase">Canadian Tariff Intelligence</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">ResilienceHQ</h1>
          <p className="text-sm text-ink-muted max-w-2xl leading-relaxed mb-6">
            Live CBSA tariff data, StatsCan import analytics, and surtax monitoring for Canadian manufacturers.
            Browse by industry or open the full toolkit for BOM analysis, FTA optimization, and supply chain risk scoring.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatTile label="Total Imports" value={fmtVal(totalImports)} sub="StatsCan CIMT 2025" accent />
            <StatTile label="HS Codes" value={totalCodes.toLocaleString()} sub="CBSA T2026" />
            <StatTile label="Dutiable Codes" value={dutiableCodes.toLocaleString()} sub="MFN rate > 0%" />
            <StatTile label="Under Surtax" value={surtaxCodes.toLocaleString()} sub={`${surtaxData.surtaxes.length} active entries`} />
          </div>
        </div>

        {/* ── Industry sections grid ─────────────────────────────────────── */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold">Browse by Industry Section</h2>
            <span className="text-[11px] text-ink-faint">20 HS sections · click to explore</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {sections.map(sec => (
              <SectionCard key={sec.slug} sec={sec} />
            ))}
          </div>
        </section>

        {/* ── Full toolkit preview ──────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold">Full Toolkit</h2>
              <p className="text-[11px] text-ink-faint mt-0.5">Advanced analysis tools for trade professionals</p>
            </div>
            <Link
              href="/browse"
              className="text-xs border border-border text-ink-muted hover:text-ink hover:border-[#F15A22]/40 px-4 py-2 rounded transition-colors"
            >
              Open toolkit →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TOOLS.map(t => {
              const Icon = t.icon;
              return (
                <Link
                  key={t.label}
                  href="/browse"
                  className="p-4 bg-surface-1 border border-border rounded-lg hover:border-ngen/40 hover:bg-surface-2 transition-all group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center group-hover:bg-ngen/10 transition-colors">
                      <Icon className="w-4 h-4 text-ink-muted group-hover:text-ngen transition-colors" />
                    </div>
                    <div className="text-sm font-medium group-hover:text-ngen transition-colors">{t.label}</div>
                  </div>
                  <div className="text-xs text-ink-muted leading-relaxed">{t.desc}</div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="mt-12 border-t border-border">
          <div className="py-8">
            {/* Data Sources */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="p-3 bg-surface-1 rounded-lg border border-border">
                <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">Tariff Data</div>
                <div className="text-xs font-medium text-ink">CBSA T2026</div>
                <div className="text-[10px] text-ink-faint">Customs Tariff Schedule</div>
              </div>
              <div className="p-3 bg-surface-1 rounded-lg border border-border">
                <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">Import Data</div>
                <div className="text-xs font-medium text-ink">StatsCan CIMT</div>
                <div className="text-[10px] text-ink-faint">2025 Trade Statistics</div>
              </div>
              <div className="p-3 bg-surface-1 rounded-lg border border-border">
                <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">US Rates</div>
                <div className="text-xs font-medium text-ink">USITC HTS</div>
                <div className="text-[10px] text-ink-faint">Harmonized Tariff Schedule</div>
              </div>
              <div className="p-3 bg-surface-1 rounded-lg border border-border">
                <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">Surtaxes</div>
                <div className="text-xs font-medium text-ink">SOR Orders</div>
                <div className="text-[10px] text-ink-faint">Snapshot {surtaxData.generated}</div>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="p-4 bg-surface-1/50 rounded-lg border border-border mb-6">
              <p className="text-xs text-ink-muted leading-relaxed">
                This tool is for intelligence and planning purposes only. All tariff rates and trade data should be verified with CBSA or a licensed customs broker before making sourcing or import decisions. Data may be subject to periodic revisions.
              </p>
            </div>

            {/* Bottom row */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-faint">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-ngen flex items-center justify-center">
                  <span className="text-white text-[8px] font-bold">RHQ</span>
                </div>
                <span>ResilienceHQ by</span>
                <a href="https://www.ngen.ca" target="_blank" rel="noopener noreferrer" className="text-ngen hover:underline font-medium">
                  NGen Canada
                </a>
              </div>
              <div className="flex items-center gap-4">
                <a href="https://www.ngen.ca/resilience-hq" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">
                  About ResilienceHQ
                </a>
                <a href="https://www.ngen.ca" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">
                  NGen.ca
                </a>
              </div>
            </div>
          </div>
        </footer>

      </main>
    </>
  );
}
