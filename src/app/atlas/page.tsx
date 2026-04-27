import Nav from '@/components/Nav';
import AtlasExportBasket from '@/components/AtlasExportBasket';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Export Basket — Harvard Atlas · ResilienceHQ',
  description: "Canada's export structure, product complexity (PCI), RCA, and Economic Complexity Index sourced from the Harvard Atlas of Economic Complexity.",
};

export default function AtlasPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen">
        <AtlasExportBasket />
      </main>
    </>
  );
}
