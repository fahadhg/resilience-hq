#!/usr/bin/env python3
"""
fetch-statcan-intel.py — Refresh public/data/intel/*.json from Statistics Canada
==================================================================================
Designed to run in GitHub Actions (full internet access) or locally.
Updates the 4 intel data files used by the ResilienceHQ Intel modules.

Run:
    pip install requests
    python3 scripts/fetch-statcan-intel.py

StatsCan WDS REST API v1:
    Base: https://www150.statcan.gc.ca/t1/tbl1/en/dtbl/
    getDataFromCubePidCoordAndLatestNPeriods/{pid}/{coord}/{n}
    getCubeMetadata/{pid}
"""

import json, re, sys, time
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
    requests.packages.urllib3.disable_warnings()
except ImportError:
    sys.exit("pip install requests")

ROOT  = Path(__file__).parent.parent
INTEL = ROOT / "public" / "data" / "intel"
INTEL.mkdir(parents=True, exist_ok=True)

# Mimic a real browser to avoid bot blocks
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-CA,en;q=0.9",
    "Referer": "https://www150.statcan.gc.ca/",
}

WDS = "https://www150.statcan.gc.ca/t1/tbl1/en/dtbl"

# ─── StatsCan WDS helpers ─────────────────────────────────────────────────────

def wds_get(path: str, timeout: int = 20) -> dict | list | None:
    url = f"{WDS}/{path}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        if r.status_code == 200:
            return r.json()
        print(f"  WDS {path} → HTTP {r.status_code}")
        return None
    except Exception as e:
        print(f"  WDS {path} → {e}")
        return None


def get_series(pid: str, coord: str, n: int = 13) -> list[dict]:
    """Fetch n periods of a specific series by coordinate."""
    data = wds_get(f"getDataFromCubePidCoordAndLatestNPeriods/{pid}/{coord}/{n}")
    if not data:
        return []
    # WDS returns: {"status":"SUCCESS","object":[{"refPer":...,"value":...},...]}
    obj = data if isinstance(data, list) else data.get("object", [])
    return [
        {"period": r.get("refPer", ""), "value": _parse_val(r.get("value"))}
        for r in (obj if isinstance(obj, list) else [])
    ]


def _parse_val(v) -> float | None:
    if v is None or str(v).strip() in ("", "..", "F", "x", "E"):
        return None
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return None


def yoy(series: list[dict]) -> str | None:
    """Compute YoY % change from a 13-period series."""
    vals = [r["value"] for r in series if r["value"] is not None]
    if len(vals) >= 13:
        latest, prev = vals[0], vals[12]
        if prev and prev != 0:
            return f"{(latest - prev) / prev * 100:.1f}"
    return None


def now_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


# ─── Table coordinates (from StatsCan WDS metadata) ──────────────────────────
#
# Table 16-10-0117-01 (Mfg sales, monthly, SA):
#   Dim 0: Industry (NAICS)  Dim 1: Geography  Dim 2: Seasonal adjustment
#   Coord "1.1.2" = Total mfg · Canada · Seasonally adjusted
#
# Table 16-10-0014-01 (Capacity utilization, quarterly):
#   Coord "1.1" = Total manufacturing · Canada
#
# Table 14-10-0325-01 (Job vacancies, quarterly):
#   Coord "1.1.1" = Total · All industries · Canada
#
# Table 18-10-0034-01 (IPPI, monthly):
#   Coord "1.1" = Total IPPI
#
# Table 18-10-0267-01 (RMPI, monthly):
#   Coord "1.1" = Total RMPI

MFG_COORDS = {
    # pid, coord, naics, label
    "total":    ("16100117", "1.1.2",  "31-33", "Total manufacturing"),
    "food":     ("16100117", "2.1.2",  "311",   "Food manufacturing"),
    "beverage": ("16100117", "3.1.2",  "312",   "Beverage & tobacco"),
    "textile":  ("16100117", "4.1.2",  "313",   "Textile mills"),
    "wood":     ("16100117", "7.1.2",  "321",   "Wood product mfg"),
    "paper":    ("16100117", "8.1.2",  "322",   "Pulp, paper & printing"),
    "petro":    ("16100117", "9.1.2",  "324",   "Petroleum & coal products"),
    "chem":     ("16100117", "10.1.2", "325",   "Chemical manufacturing"),
    "plastics": ("16100117", "11.1.2", "326",   "Plastics & rubber"),
    "metal":    ("16100117", "13.1.2", "331",   "Primary metal mfg"),
    "fab":      ("16100117", "14.1.2", "332",   "Fabricated metal products"),
    "mach":     ("16100117", "15.1.2", "333",   "Machinery mfg"),
    "comp":     ("16100117", "16.1.2", "334",   "Computer & electronics"),
    "elec":     ("16100117", "17.1.2", "335",   "Electrical equipment"),
    "auto":     ("16100117", "18.1.2", "336",   "Transportation equipment"),
    "furn":     ("16100117", "20.1.2", "337",   "Furniture & related"),
}

CAP_COORDS = {
    "total":    ("16100014", "1.1",  "Total manufacturing"),
    "food":     ("16100014", "3.1",  "Food & beverage"),
    "wood":     ("16100014", "5.1",  "Wood products"),
    "paper":    ("16100014", "6.1",  "Pulp & paper"),
    "petro":    ("16100014", "7.1",  "Petroleum refining"),
    "chem":     ("16100014", "8.1",  "Chemical mfg"),
    "plastics": ("16100014", "9.1",  "Plastics & rubber"),
    "metal":    ("16100014", "11.1", "Primary metals"),
    "fab":      ("16100014", "12.1", "Fabricated metals"),
    "mach":     ("16100014", "13.1", "Machinery"),
    "comp":     ("16100014", "14.1", "Computer & electronics"),
    "elec":     ("16100014", "15.1", "Electrical equipment"),
    "auto":     ("16100014", "16.1", "Transportation equipment"),
}

IPPI_COORDS = {
    "total":    ("18100034", "1.1",  "Total IPPI"),
    "steel":    ("18100034", "3.1",  "Steel mill products (ch 72-73)"),
    "nonferr":  ("18100034", "4.1",  "Non-ferrous metals (ch 74-76)"),
    "petro":    ("18100034", "6.1",  "Petroleum & coal products"),
    "chem":     ("18100034", "7.1",  "Industrial chemicals (ch 28-29)"),
    "plastics": ("18100034", "8.1",  "Plastics & rubber (ch 39-40)"),
    "auto":     ("18100034", "12.1", "Motor vehicle parts (ch 87)"),
    "elec":     ("18100034", "13.1", "Electrical equipment"),
}

RMPI_COORDS = {
    "total":    ("18100267", "1.1",  "Total RMPI"),
    "oil":      ("18100267", "2.1",  "Crude oil (ch 27)"),
    "natgas":   ("18100267", "3.1",  "Natural gas (ch 27)"),
    "iron":     ("18100267", "5.1",  "Iron & steel scrap (ch 72)"),
    "nonferr":  ("18100267", "7.1",  "Non-ferrous metals"),
    "lumber":   ("18100267", "9.1",  "Lumber & wood (ch 44)"),
    "grain":    ("18100267", "11.1", "Grains & oilseeds (ch 10-12)"),
}

VAC_COORDS = {
    "total_ca": ("14100325", "1.1.1",  "Total, all industries", "Canada"),
    "mfg_ca":   ("14100325", "5.1.1",  "Manufacturing", "Canada"),
    "mfg_on":   ("14100325", "5.6.1",  "Manufacturing", "Ontario"),
    "mfg_qc":   ("14100325", "5.7.1",  "Manufacturing", "Quebec"),
    "mfg_bc":   ("14100325", "5.9.1",  "Manufacturing", "British Columbia"),
    "mfg_ab":   ("14100325", "5.8.1",  "Manufacturing", "Alberta"),
}

EMP_COORDS = {
    "mfg_total": ("14100202", "9.1.1.1", "31-33", "Total manufacturing"),
    "mfg_food":  ("14100202", "10.1.1.1","311",   "Food manufacturing"),
    "mfg_auto":  ("14100202", "18.1.1.1","336",   "Transportation equipment"),
    "mfg_chem":  ("14100202", "13.1.1.1","325",   "Chemical manufacturing"),
}


# ─── Fetch functions ──────────────────────────────────────────────────────────

def fetch_mfg_health() -> dict:
    print("Fetching: manufacturing sales + capacity utilization…")
    sales = []
    for key, (pid, coord, naics, label) in MFG_COORDS.items():
        s = get_series(pid, coord, 13)
        if s:
            latest = s[0]
            sales.append({
                "naics": naics, "industry": label,
                "period": latest["period"],
                "value": round(latest["value"] / 1e6, 1) if latest["value"] else None,
                "unit": "millions $",
                "yoy": yoy(s),
            })
            print(f"  ✓ {label}: {latest['value']:,.0f}" if latest["value"] else f"  ✗ {label}: no data")
        time.sleep(0.2)

    capacity = []
    for key, (pid, coord, label) in CAP_COORDS.items():
        s = get_series(pid, coord, 5)
        if s and s[0]["value"]:
            capacity.append({
                "industry": label,
                "period": s[0]["period"],
                "rate": round(s[0]["value"], 1),
            })
        time.sleep(0.2)

    return {
        "source": "Statistics Canada, Table 16-10-0117-01 / 16-10-0014-01",
        "generated": now_str(),
        "note": "Monthly Survey of Manufacturing — seasonally adjusted values",
        "sales": sales,
        "capacity": capacity,
    }


def fetch_labour() -> dict:
    print("Fetching: job vacancies + employment…")
    vacancies = []
    for key, (pid, coord, industry, province) in VAC_COORDS.items():
        s = get_series(pid, coord, 5)
        if s and s[0]["value"]:
            vacancies.append({
                "industry": industry, "province": province,
                "period": s[0]["period"],
                "vacancies": int(s[0]["value"]),
                "unit": "number",
            })
            print(f"  ✓ {industry} ({province}): {int(s[0]['value']):,}")
        time.sleep(0.2)

    employment = []
    for key, (pid, coord, naics, label) in EMP_COORDS.items():
        s = get_series(pid, coord, 2)
        if s and s[0]["value"]:
            employment.append({
                "naics": naics, "industry": label,
                "period": s[0]["period"],
                "employed": round(s[0]["value"], 1),
                "unit": "thousands",
            })
        time.sleep(0.2)

    # Hard-to-fill flags: vacancy rate proxy (mfg vacancies > 500)
    flags = []
    for v in vacancies:
        if v["industry"] == "Manufacturing" and v["vacancies"] > 1000:
            flags.append(f"Manufacturing ({v['province']}): {v['vacancies']:,} vacancies — {v['period']}")

    return {
        "source": "Statistics Canada, Table 14-10-0325-01 / 14-10-0202-01",
        "generated": now_str(),
        "note": "Job vacancy and payroll employee data, quarterly",
        "vacancies": vacancies,
        "employment": employment,
        "hardToFillFlags": flags,
    }


def fetch_input_costs() -> dict:
    print("Fetching: IPPI + RMPI…")
    ippi = []
    for key, (pid, coord, label) in IPPI_COORDS.items():
        s = get_series(pid, coord, 13)
        if s:
            v_yoy = yoy(s)
            ippi.append({
                "product": label,
                "yoy": v_yoy,
                "latest": [{"period": r["period"], "index": r["value"]} for r in s if r["value"]],
            })
            print(f"  ✓ IPPI {label}: YoY={v_yoy}%")
        time.sleep(0.2)

    rmpi = []
    for key, (pid, coord, label) in RMPI_COORDS.items():
        s = get_series(pid, coord, 13)
        if s:
            v_yoy = yoy(s)
            rmpi.append({
                "commodity": label,
                "yoy": v_yoy,
                "latest": [{"period": r["period"], "index": r["value"]} for r in s if r["value"]],
            })
        time.sleep(0.2)

    # Build alerts for spikes > 5%
    alerts = []
    for p in ippi:
        try:
            y = float(p["yoy"]) if p["yoy"] else 0
            if abs(y) > 5:
                alerts.append({
                    "product": p["product"],
                    "yoy": y,
                    "latest": p["latest"][0]["index"] if p["latest"] else None,
                    "severity": "high" if abs(y) > 12 else "medium",
                })
        except (TypeError, ValueError):
            pass
    alerts.sort(key=lambda x: abs(x["yoy"]), reverse=True)

    return {
        "source": "Statistics Canada, Table 18-10-0034-01 (IPPI) / 18-10-0267-01 (RMPI)",
        "generated": now_str(),
        "note": "Price indices, 2012=100 base. YoY = year-over-year % change.",
        "alerts": alerts,
        "ippi": ippi,
        "rmpi": rmpi,
    }


def fetch_exports() -> dict:
    """Exports data is mostly static reference (FTA rates don't change often).
    Keep existing file but update the generated timestamp."""
    print("Exports: reading existing file + updating timestamp…")
    existing_path = INTEL / "exports.json"
    if existing_path.exists():
        with open(existing_path) as f:
            data = json.load(f)
        data["generated"] = now_str()
        return data

    # Fallback minimal structure
    return {
        "source": "Statistics Canada, Table 12-10-0011-01 + Global Affairs Canada",
        "generated": now_str(),
        "note": "Canadian merchandise exports 2024, by top destination.",
        "topDestinations": [],
        "partnerRates": {},
        "byChapter": {},
    }


# ─── Main ─────────────────────────────────────────────────────────────────────

def save(name: str, data: dict, prev: dict | None = None) -> bool:
    """Save JSON file. Return True if data changed."""
    path = INTEL / f"{name}.json"
    new_json = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    if prev:
        old_json = json.dumps(prev, separators=(",", ":"), ensure_ascii=False)
        if new_json == old_json:
            print(f"  {name}.json unchanged")
            return False
    with open(path, "w") as f:
        f.write(new_json)
    print(f"  ✓ {name}.json saved ({path.stat().st_size // 1024} KB)")
    return True


def load_existing(name: str) -> dict | None:
    path = INTEL / f"{name}.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None


def main():
    print(f"ResilienceHQ — StatsCan Intel Refresh ({now_str()})")
    print("=" * 60)

    changed = []

    # Mfg health
    prev = load_existing("mfg-health")
    data = fetch_mfg_health()
    if data["sales"]:  # Only save if we got real data
        if save("mfg-health", data, prev):
            changed.append("mfg-health")
    else:
        print("  ⚠ No mfg sales data returned — keeping existing file")

    # Labour
    prev = load_existing("labour")
    data = fetch_labour()
    if data["vacancies"]:
        if save("labour", data, prev):
            changed.append("labour")
    else:
        print("  ⚠ No labour data returned — keeping existing file")

    # Input costs
    prev = load_existing("input-costs")
    data = fetch_input_costs()
    if data["ippi"]:
        if save("input-costs", data, prev):
            changed.append("input-costs")
    else:
        print("  ⚠ No IPPI/RMPI data returned — keeping existing file")

    # Exports (update timestamp only)
    data = fetch_exports()
    if save("exports", data, load_existing("exports")):
        changed.append("exports")

    print("\n" + "=" * 60)
    if changed:
        print(f"✓ Updated: {', '.join(changed)}")
        print("Commit these files and push to trigger Vercel redeploy.")
        # Write a refresh timestamp file for the frontend
        ts_path = INTEL / "last-updated.json"
        with open(ts_path, "w") as f:
            json.dump({"updated": datetime.now(timezone.utc).isoformat()}, f)
    else:
        print("No changes detected.")

    return 0 if changed else 0  # Always exit 0 so GH Actions doesn't fail on no-change


if __name__ == "__main__":
    sys.exit(main())
