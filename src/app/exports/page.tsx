import Nav from '@/components/Nav';
import ExportsComplexity from '@/components/ExportsComplexity';
import AtlasExportBasket from '@/components/AtlasExportBasket';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Exports — ResilienceHQ',
  description: 'Canadian export basket, product complexity (PCI), revealed comparative advantage (RCA), and Economic Complexity Index.',
};

export default function ExportsPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen">
        <AtlasExportBasket />
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="border-t border-border pt-10 pb-4">
            <ExportsComplexity />
          </div>
        </div>
      </main>
    </>
  );
}
