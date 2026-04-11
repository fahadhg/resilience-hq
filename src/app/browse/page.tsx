import Nav from '@/components/Nav';
import Dashboard from '@/components/Dashboard';
import { loadAllData } from '@/lib/loadData';

export const metadata = {
  title: 'Toolkit — ResilienceHQ',
  description: 'Full tariff toolkit: BOM analyzer, AI classifier, what-if modeler, FTA gap analysis, drawback calculator, risk map.',
};

export default async function BrowsePage() {
  const { tariffData, importData, usRates, surtaxData } = await loadAllData();
  return (
    <>
      <Nav />
      <main className="min-h-screen">
        <Dashboard
          tariffData={tariffData}
          importData={importData}
          usRates={usRates}
          surtaxData={surtaxData}
        />
      </main>
    </>
  );
}
