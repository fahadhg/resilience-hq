import Nav from '@/components/Nav';
import IntelDashboard from '@/components/IntelDashboard';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Intel Modules — ResilienceHQ',
  description: 'Manufacturing health, labour market signals, input cost tracker, and export market intelligence powered by Statistics Canada live data.',
};

export default function IntelPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen">
        <IntelDashboard />
      </main>
    </>
  );
}
