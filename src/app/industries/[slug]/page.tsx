import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import IndustryDetail from '@/components/IndustryDetail';
import { loadAllData } from '@/lib/loadData';

// Pre-render all 20 section slugs at build time
export async function generateStaticParams() {
  const { sections } = await loadAllData();
  return sections.map(s => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { sections } = await loadAllData();
  const section = sections.find(s => s.slug === slug);
  if (!section) return { title: 'Not Found' };
  return {
    title: `${section.name} — ResilienceHQ`,
    description: `${section.description}. CBSA T2026 tariff data, StatsCan 2025 imports, surtax monitoring.`,
  };
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tariffData, importData, usRates, surtaxData, sections } = await loadAllData();

  const section = sections.find(s => s.slug === slug);
  if (!section) notFound();

  const chapSet = new Set(section.chapters);

  // Pre-filter to this section's codes only
  const sectionCodes = tariffData.filter(t => chapSet.has(t.c));

  // Pre-filter imports to relevant chapters only (reduces client bundle)
  const filteredImports: typeof importData = {};
  for (const [key, val] of Object.entries(importData)) {
    const ch = parseInt(key.replace(/\./g, '').slice(0, 2), 10);
    if (chapSet.has(ch)) filteredImports[key] = val;
  }

  // Pre-filter surtaxes to relevant chapters
  const filteredSurtax = {
    ...surtaxData,
    surtaxes: surtaxData.surtaxes.filter(s => {
      const ch = parseInt(s.hs.replace(/\./g, '').slice(0, 2), 10);
      return chapSet.has(ch);
    }),
  };

  return (
    <>
      <Nav />
      <main className="min-h-screen">
        <IndustryDetail
          section={section}
          codes={sectionCodes}
          importData={filteredImports}
          usRates={usRates}
          surtaxData={filteredSurtax}
        />
      </main>
    </>
  );
}
