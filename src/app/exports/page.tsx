import Nav from '@/components/Nav';
import ExportsComplexity from '@/components/ExportsComplexity';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Exports & Complexity — ResilienceHQ',
  description: 'Canadian export market concentration, Economic Complexity Index (ECI), product complexity (PCI), and diversification opportunities.',
};

export default function ExportsPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen">
        <ExportsComplexity />
      </main>
    </>
  );
}
