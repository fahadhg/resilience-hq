import Link from 'next/link';
import Nav from '@/components/Nav';
import { loadAllData } from '@/lib/loadData';
import { fmtVal } from '@/lib/data';
import type { HSSection } from '@/lib/data';

// ─── Stat tile (server component, no hooks) ───────────────────────────────────
function StatTile({ label, value, sub, orange }: { label: string; value: string; sub?: string; orange?: boolean }) {
  return (
    <div className="bg-surface-1 border border-border rounded-lg p-4">
      <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">{label}</div>
      <div className="font-mono text-xl font-semibold" style={{ color: orange ? '#F15A22' : undefined }}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-ink-faint mt-1">{sub}</div>}
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function SectionCard({ sec }: { sec: HSSection }) {
  const hasImports = sec.totalImports > 0;
  return (
    <Link
      href={`/industries/${sec.slug}`}
      className="block p-4 bg-surface-1 border border-border rounded-lg hover:border-[#F15A22]/50 hover:bg-surface-2/80 transition-all group"
    >
      <div className="font-medium text-sm mb-1 group-hover:text-[#F15A22] transition-colors leading-snug">
        {sec.name}
      </div>
      <div className="text-[11px] text-ink-faint mb-3 leading-relaxed line-clamp-2">
        {sec.description}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] text-ink-faint uppercase tracking-wider">Imports</div>
          <div className="font-mono text-sm font-medium">
            {hasImports ? fmtVal(sec.totalImports) : '—'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-ink-muted">{sec.codeCount.toLocaleString()} codes</div>
          {sec.surtaxAffected > 0 && (
            <div className="text-[10px] font-medium" style={{ color: '#ef4444' }}>
              {sec.surtaxAffected} surtaxed
            </div>
          )}
        </div>
      </div>
      {sec.topSources.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 text-[10px] text-ink-faint truncate">
          Top: {sec.topSources.slice(0, 3).map(s => s.n).join(' · ')}
        </div>
      )}
    </Link>
  );
}

// ─── Tool card ────────────────────────────────────────────────────────────────
const TOOLS = [
  { icon: '📊', label: 'BOM Analyzer', desc: 'Upload CSV, calculate duties & FTA savings' },
  { icon: '🤖', label: 'AI Classifier', desc: 'Claude-powered HS code suggestions' },
  { icon: '🎛️', label: 'What-If Modeler', desc: 'Scenario surtax impact analysis' },
  { icon: '💸', label: 'Drawback Calc', desc: '3-method duty refund estimates' },
  { icon: '🌐', label: 'FTA Gap', desc: 'Origin-switching opportunities' },
  { icon: '⚠️', label: 'Risk Map', desc: 'HHI concentration & risk scoring' },
  { icon: '🔗', label: 'Supply Chain', desc: 'Multi-tier surtax exposure model' },
  { icon: '📰', label: 'Gazette Alerts', desc: 'Live Canada Gazette SOR tracking' },
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
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-positive inline-block animate-pulse" />
            <span className="text-[11px] text-ink-faint tracking-wider uppercase">Canadian Tariff Intelligence</span>
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">ResilienceHQ</h1>
          <p className="text-sm text-ink-muted max-w-2xl leading-relaxed mb-6">
            Live CBSA tariff data, StatsCan import analytics, and surtax monitoring for Canadian manufacturers.
            Browse by industry or open the full toolkit for BOM analysis, FTA optimization, and supply chain risk scoring.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Total Imports" value={fmtVal(totalImports)} sub="StatsCan CIMT 2025" orange />
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
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {TOOLS.map(t => (
              <Link
                key={t.label}
                href="/browse"
                className="p-3 bg-surface-1 border border-border rounded-lg hover:border-[#F15A22]/30 hover:bg-surface-2 transition-all text-center group"
              >
                <div className="text-lg mb-1.5">{t.icon}</div>
                <div className="text-xs font-medium group-hover:text-[#F15A22] transition-colors">{t.label}</div>
                <div className="text-[10px] text-ink-faint mt-0.5 leading-tight hidden sm:block">{t.desc}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="border-t border-border pt-4 text-[10px] text-ink-faint space-y-1">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span><strong className="text-ink-muted">Tariff data:</strong> CBSA Customs Tariff 2026 (T2026)</span>
            <span><strong className="text-ink-muted">Import data:</strong> StatsCan CIMT 2025</span>
            <span><strong className="text-ink-muted">US rates:</strong> USITC HTS</span>
            <span><strong className="text-ink-muted">Surtaxes:</strong> justice.gc.ca SOR orders (snapshot {surtaxData.generated})</span>
          </div>
          <div className="text-ink-faint/70">
            {/* TODO: Add French (bilingual) support — English only in v9 */}
            This tool is for intelligence and planning purposes only. Verify all rates with CBSA or a licensed customs broker before making sourcing decisions.
          </div>
        </footer>

      </main>
    </>
  );
}
