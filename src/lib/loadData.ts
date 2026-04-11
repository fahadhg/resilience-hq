import { promises as fs } from 'fs';
import path from 'path';
import type { TariffItem, ImportOverlay, USRatesOverlay, SurtaxOverlay, HSSection } from './data';

export async function loadAllData() {
  const d = path.join(process.cwd(), 'public', 'data');
  const [t, i, u, s, sec] = await Promise.all([
    fs.readFile(path.join(d, 'tariff.json'), 'utf-8'),
    fs.readFile(path.join(d, 'imports.json'), 'utf-8'),
    fs.readFile(path.join(d, 'us_rates.json'), 'utf-8'),
    fs.readFile(path.join(d, 'surtaxes.json'), 'utf-8'),
    fs.readFile(path.join(d, 'sections.json'), 'utf-8'),
  ]);
  return {
    tariffData: JSON.parse(t) as TariffItem[],
    importData: JSON.parse(i) as ImportOverlay,
    usRates: JSON.parse(u) as USRatesOverlay,
    surtaxData: JSON.parse(s) as SurtaxOverlay,
    sections: JSON.parse(sec) as HSSection[],
  };
}
