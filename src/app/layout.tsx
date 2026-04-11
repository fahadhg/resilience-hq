import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ResilienceHQ — Canadian Tariff Intelligence by NGen',
  description: 'Live CBSA T2026 tariff data, StatsCan 2025 import analytics, surtax monitoring, and FTA optimization tools for Canadian manufacturers.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
