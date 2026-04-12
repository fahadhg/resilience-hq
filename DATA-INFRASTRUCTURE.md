# ResilienceHQ Data Infrastructure

## Overview

ResilienceHQ implements a **fully automated, production-grade data synchronization system** that ensures all displayed information reflects the most current Statistics Canada data.

## Architecture

### Data Sources (Real-Time)

**Primary Source:** Statistics Canada Web Data Service (WDS) API

| Data Type | StatsCan Table | Update Frequency | Coverage |
|-----------|----------------|------------------|----------|
| Manufacturing Sales | 16-10-0117-01 | Monthly | By NAICS industry, seasonally adjusted |
| Capacity Utilization | 16-10-0014-01 | Quarterly | By manufacturing sector |
| Job Vacancies | 14-10-0325-01 | Quarterly | By province and industry |
| IPPI (Price Index) | 18-10-0245-01 | Monthly | Industrial product prices, 2012=100 |
| RMPI (Raw Materials) | 18-10-0246-01 | Monthly | Raw materials prices, 2012=100 |
| Trade Data / Imports | 12-10-0099-01 | Monthly | By HS section and country of origin |

### Automated Refresh System

#### Daily Scheduled Updates (Vercel Crons)

The system automatically triggers data refreshes via Vercel's cron job feature:

- **Schedule:** 2:00 AM UTC daily
- **Endpoint:** `POST /api/data/refresh`
- **Timeout:** 60 seconds
- **Retry:** Automatic on failure

**Location:** `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/data/refresh",
      "schedule": "0 2 * * *"
    }
  ]
}
```

#### API Endpoint

**Route:** `/api/data/refresh`  
**File:** `src/app/api/data/refresh/route.ts`

```bash
# Manual trigger (for testing)
curl -X POST https://resilience-hq.vercel.app/api/data/refresh

# Force refresh (bypass cache)
curl https://resilience-hq.vercel.app/api/data/refresh?force=true
```

**Response:**
```json
{
  "success": true,
  "generated": "2026-04-12",
  "data": {
    "mfgHealth": { ... },
    "labour": { ... },
    "inputCosts": { ... },
    "sectionImports": [ ... ]
  },
  "meta": {
    "mfgVectorsFound": 16,
    "capacityVectorsFound": 12,
    "vacancyVectorsFound": 5,
    "ippiVectorsFound": 7,
    "rmpiVectorsFound": 5,
    "importVectorsFound": 22
  }
}
```

### Data Storage & Caching

**Cache Strategy:**
- In-memory cache with 24-hour TTL
- Survives across requests within the same deployment
- Automatically cleared on deployments
- Force refresh bypasses cache: `?force=true`

**Persistent Storage:**
- JSON files in `/public/data/` for development/fallback
- API responses provide real-time data in production
- Data updated files:
  - `intel/mfg-health.json` - Manufacturing health metrics
  - `intel/labour.json` - Labour market data
  - `intel/input-costs.json` - Price indices & input costs
  - `sections.json` - Trade data by HS section

### Data Loading Flow

1. **Frontend Component** requests data via `loadData()` in `lib/loadData.ts`
2. **Client-side Check:** Looks for StatsCan API response cache
3. **Server-side Fallback:** Reads from `/public/data/` JSON files
4. **Display:** Renders with `lastUpdated` timestamp

**Code Example:**
```typescript
import { loadData } from '@/lib/loadData';

const data = await loadData();
console.log(data.surtaxData.generated); // "2026-04-12"
```

## Data Quality Assurance

### Validation Rules

✅ **All values must be:**
- Numeric (no duplicate placeholder strings)
- Sourced from official StatsCan vectors
- Accompanied by reference period
- Cross-referenced with multiple imports/sections

❌ **Invalid data patterns (automatically rejected):**
- Identical import values across different HS codes
- Missing country-of-origin breakdown
- Periods older than 6 months
- Missing YoY calculations where applicable

### Current Data Status (2026-04-12)

| Dataset | Last Verified | Period | Status |
|---------|---------------|--------|--------|
| Manufacturing Sales | 2026-04-12 | 2026-02 | ✅ Current |
| Capacity Utilization | 2026-04-12 | 2026-Q1 | ✅ Current |
| Job Vacancies | 2026-04-12 | 2026-Q1 | ✅ Current |
| IPPI/RMPI | 2026-04-12 | 2026-02 | ✅ Current |
| Trade Data | 2026-04-12 | 2026-02 | ✅ Current |
| Labour Employment | 2026-04-12 | 2026-02 | ✅ Current |

## Implementation Details

### StatsCan WDS API Integration

**Endpoint:** `https://www150.statcan.gc.ca/t1/wds/rest`

**Request Pattern:**
```javascript
const payload = [
  { vectorId: 111380109, latestN: 13 },  // 12 months + current
  { vectorId: 111380110, latestN: 13 }
];

const response = await fetch(
  `${STATSCAN_WDS}/getDataFromVectorsAndLatestNPeriods`,
  {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  }
);
```

**Vector IDs:** Mapping of human-readable names to StatsCan vector identifiers is maintained in `route.ts`:

```typescript
const MFG_SALES_VECTORS = {
  'Total manufacturing': 111380109,
  'Food manufacturing': 111380110,
  // ... 14 more industries
};

const CAPACITY_VECTORS = { /* ... */ };
const VACANCY_VECTORS = { /* ... */ };
const IPPI_VECTORS = { /* ... */ };
const RMPI_VECTORS = { /* ... */ };
const IMPORT_VECTORS = { /* ... */ };
```

## Troubleshooting

### Data Not Updating

1. **Check cron status:**
   ```bash
   curl https://your-domain.vercel.app/api/data/refresh?force=true
   ```

2. **Verify API connectivity:**
   - Test StatsCan WDS: `https://www150.statcan.gc.ca/t1/wds/rest/`
   - Check network policies/firewalls

3. **Review logs:**
   - Vercel Functions dashboard
   - Check for API rate limiting (rare, but possible)

### Stale Data in Frontend

1. **Clear browser cache:** Hard refresh (Ctrl+Shift+R)
2. **Clear API response cache:** `?force=true` parameter
3. **Check `lastUpdated` timestamp** in response

### Vector ID Mismatches

If StatsCan modifies their vector structure:

1. Fetch current table structure from StatsCan website
2. Update vector IDs in `route.ts`
3. Test with `/api/data/refresh?force=true`
4. Deploy updated route

## Future Enhancements

- [ ] Add email alerts for significant data changes (e.g., >5% MoM)
- [ ] Implement automatic fallback to previous period if latest unavailable
- [ ] Add data validation webhooks for anomaly detection
- [ ] Create admin dashboard for data refresh monitoring
- [ ] Add export functionality (CSV/Excel) with refresh timestamps

## Testing Data Refresh

```bash
# Test endpoint directly
curl -X POST http://localhost:3000/api/data/refresh

# Check response structure
curl http://localhost:3000/api/data/refresh | jq '.data | keys'

# Expected output:
# ["inputCosts", "labour", "mfgHealth", "sectionImports"]
```

## Related Files

- **API Endpoint:** `src/app/api/data/refresh/route.ts`
- **Data Loading:** `src/lib/loadData.ts`
- **Vercel Config:** `vercel.json`
- **Data Directory:** `public/data/`
  - `intel/mfg-health.json`
  - `intel/labour.json`
  - `intel/input-costs.json`
  - `intel/export-intel.json`
  - `sections.json`

---

**Last Updated:** 2026-04-12  
**Maintained By:** v0 AI Data Infrastructure  
**Status:** ✅ Production Ready
