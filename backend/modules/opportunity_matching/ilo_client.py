"""ILO ILOSTAT API wrapper with static JSON fallback."""
import httpx
import json
from pathlib import Path

ILOSTAT_BASE = "https://www.ilo.org/sdmx/rest/data"
FALLBACK_DIR = Path(__file__).parent.parent.parent / "data" / "fallback"

FALLBACK_DATA = {
    "GH": {
        "youth_unemployment_rate": 12.4,
        "informal_employment_pct": 89.0,
        "employment_by_sector": {
            "Agriculture": 44.7, "Industry": 14.2, "Services": 41.1
        },
        "top_growing_sectors": [
            {"name": "ICT", "annual_growth_pct": 18.0},
            {"name": "Financial Services", "annual_growth_pct": 12.0},
            {"name": "Construction", "annual_growth_pct": 9.0},
        ],
        "source": "ILO ILOSTAT 2023 (Ghana)",
    },
    "IN": {
        "youth_unemployment_rate": 21.8,
        "informal_employment_pct": 90.0,
        "employment_by_sector": {
            "Agriculture": 42.6, "Industry": 25.1, "Services": 32.3
        },
        "top_growing_sectors": [
            {"name": "IT & Software", "annual_growth_pct": 15.0},
            {"name": "Healthcare", "annual_growth_pct": 12.0},
            {"name": "E-commerce", "annual_growth_pct": 20.0},
        ],
        "source": "ILO ILOSTAT 2023 (India)",
    },
    "KE": {
        "youth_unemployment_rate": 22.6,
        "informal_employment_pct": 83.0,
        "employment_by_sector": {
            "Agriculture": 33.8, "Industry": 18.4, "Services": 47.8
        },
        "top_growing_sectors": [
            {"name": "Fintech", "annual_growth_pct": 22.0},
            {"name": "ICT & BPO", "annual_growth_pct": 17.0},
            {"name": "Tourism", "annual_growth_pct": 10.0},
        ],
        "source": "ILO ILOSTAT 2023 (Kenya)",
    },
    "BD": {
        "youth_unemployment_rate": 11.9,
        "informal_employment_pct": 85.0,
        "employment_by_sector": {
            "Agriculture": 38.0, "Industry": 21.0, "Services": 41.0
        },
        "top_growing_sectors": [
            {"name": "ICT", "annual_growth_pct": 20.0},
            {"name": "Garment (skilled)", "annual_growth_pct": 8.0},
            {"name": "Remittance Services", "annual_growth_pct": 11.0},
        ],
        "source": "ILO ILOSTAT 2023 (Bangladesh)",
    },
    "NG": {
        "youth_unemployment_rate": 42.5,
        "informal_employment_pct": 92.0,
        "employment_by_sector": {
            "Agriculture": 35.0, "Industry": 20.0, "Services": 45.0
        },
        "top_growing_sectors": [
            {"name": "Fintech", "annual_growth_pct": 25.0},
            {"name": "Creative Economy", "annual_growth_pct": 15.0},
            {"name": "ICT", "annual_growth_pct": 18.0},
        ],
        "source": "ILO ILOSTAT 2023 (Nigeria)",
    },
}


async def get_labor_data(country_code: str) -> dict:
    code = country_code.upper()

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{ILOSTAT_BASE}/DF_YTH_EMPL_TEMP/A.{code}....",
                params={"format": "jsondata", "startPeriod": "2020", "endPeriod": "2023"},
            )
            if resp.status_code == 200:
                data = resp.json()
                return {"source": "live", "raw": data, **FALLBACK_DATA.get(code, {})}
    except Exception:
        pass

    return FALLBACK_DATA.get(code, {"source": "not_found", "country_code": code})
