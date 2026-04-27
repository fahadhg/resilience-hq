import Nav from '@/components/Nav';
import ImportsBasket from '@/components/ImportsBasket';
import Dashboard from '@/components/Dashboard';
import { loadAllData } from '@/lib/loadData';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Imports — ResilienceHQ',
  description: "Canada's import basket, product complexity, trade balance, and full CBSA HS code browser.",
};

export default async function ImportsPage() {
  const { tariffData, importData, usRates, surtaxData } = await loadAllData();
  return (
    <>
      <Nav />
      <main className="min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
          {/* Harvard Atlas import treemap */}
          <ImportsBasket />

          {/* Divider */}
          <div className="border-t border-border pt-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="live-dot" />
              <h2 className="text-lg font-semibold tracking-tight">All HS Codes</h2>
              <span className="text-sm text-ink-faint">CBSA T2026 · StatsCan 2025 imports · {tariffData.length.toLocaleString()} codes</span>
            </div>
            <Dashboard
              tariffData={tariffData}
              importData={importData}
              usRates={usRates}
              surtaxData={surtaxData}
            />
          </div>
        </div>
      </main>
    </>
  );
}
