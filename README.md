# Tariff Monitor — Canadian Manufacturing

Live CBSA tariff monitoring dashboard with StatsCan import data, partial equilibrium model, and FTA origin analysis.

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4)

## Data Sources

| Source | Records | Updated |
|--------|---------|---------|
| **CBSA Customs Tariff T2026** | 4,426 HS codes (Ch 25–96) | Jan 1, 2026 |
| **StatsCan CIMT 2025** | 3.8M import records → 4,572 HS6 aggregates | Monthly |
| **Canada Gazette RSS** | SOR/tariff alerts | Real-time via API route |

Data files in `public/data/`:
- `tariff.json` — All manufacturing HS codes with MFN + 7 preferential rates (UST, MXT, CEUT, CPTPT, UKT, JT, KRT)
- `imports.json` — 2025 import volume by HS6 + top 3 source countries

## Deploy to Vercel

### One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USER/tariff-monitor)

### Manual deploy

```bash
# 1. Install dependencies
npm install

# 2. Run locally
npm run dev

# 3. Deploy
npx vercel --prod
```

No environment variables required. The CBSA Customs Tariff API is public (no auth key needed).

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Server component — loads JSON data
│   ├── layout.tsx            # Root layout with fonts
│   ├── globals.css           # Design tokens + dark theme
│   └── api/
│       ├── tariff/route.ts   # CBSA OData API proxy (avoids CORS)
│       └── gazette/route.ts  # Canada Gazette RSS scraper
├── components/
│   └── Dashboard.tsx         # Main interactive dashboard (client)
├── lib/
│   └── data.ts              # Types, constants, utilities
└── public/data/
    ├── tariff.json           # 4,426 CBSA tariff codes
    └── imports.json          # StatsCan import volumes by HS6
```

## Features

- **Watchlist** — Pin HS codes, persisted to localStorage
- **Import volumes** — Real 2025 StatsCan data showing top source countries per code
- **FTA comparison** — Side-by-side tariff rates across 7 trade agreements (CUSMA, CETA, CPTPP, UK, Japan, Korea)
- **Browse all codes** — Paginated table of 4,426 codes, sortable by import value or MFN rate
- **Gazette alerts** — Regulatory feed with "affects your watchlist" flags
- **Sensitivity chart** — Landed cost curves as surtax varies

## Refreshing Data

### CBSA Tariff (annual)
1. Download from [cbsa-asfc.gc.ca/trade-commerce/tariff-tarif](https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/menu-eng.html)
2. Extract the Access DB with `mdbtools` and reprocess

### StatsCan Imports (monthly)
1. Download from [open.canada.ca](https://open.canada.ca/data/en/dataset/2909a648-5753-4924-878a-b069392d9cde)
2. Process `ODPFN015_*.csv` (HS6 level) and aggregate by HS6 + country

## License

Data: Open Government Licence – Canada. Code: MIT.
