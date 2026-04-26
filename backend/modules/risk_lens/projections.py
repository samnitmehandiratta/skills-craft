"""Wittgenstein Centre education projections for 2025-2035."""
import json
from pathlib import Path

DATA_PATH = Path(__file__).parent.parent.parent / "data" / "wittgenstein_2025_2035.json"

# Fallback data based on Wittgenstein Centre published projections
FALLBACK_PROJECTIONS = {
    "GH": {
        "country": "Ghana", "region": "Sub-Saharan Africa",
        "years": [2025, 2027, 2029, 2031, 2033, 2035],
        "tertiary_education_pct": [9.2, 10.1, 11.3, 12.8, 14.0, 15.5],
        "secondary_education_pct": [42.1, 44.3, 46.8, 49.2, 51.5, 53.8],
        "youth_labor_force_growth": [2.8, 2.6, 2.5, 2.3, 2.1, 1.9],
        "key_insight": "Youth cohort growing faster than formal jobs — skills differentiation becomes critical.",
    },
    "IN": {
        "country": "India", "region": "South Asia",
        "years": [2025, 2027, 2029, 2031, 2033, 2035],
        "tertiary_education_pct": [18.5, 20.2, 22.1, 24.3, 26.2, 28.0],
        "secondary_education_pct": [55.3, 57.8, 60.2, 62.7, 64.9, 67.1],
        "youth_labor_force_growth": [1.2, 1.0, 0.8, 0.6, 0.4, 0.2],
        "key_insight": "Education attainment rising rapidly — credential inflation means skills differentiation matters more.",
    },
    "KE": {
        "country": "Kenya", "region": "East Africa",
        "years": [2025, 2027, 2029, 2031, 2033, 2035],
        "tertiary_education_pct": [7.8, 8.9, 10.2, 11.6, 13.1, 14.7],
        "secondary_education_pct": [38.5, 41.2, 44.0, 47.1, 50.0, 52.8],
        "youth_labor_force_growth": [3.1, 3.0, 2.8, 2.6, 2.4, 2.2],
        "key_insight": "Rapidly growing digital economy but youth population outpacing formal job creation.",
    },
    "BD": {
        "country": "Bangladesh", "region": "South Asia",
        "years": [2025, 2027, 2029, 2031, 2033, 2035],
        "tertiary_education_pct": [13.2, 14.8, 16.5, 18.3, 20.1, 22.0],
        "secondary_education_pct": [51.4, 54.0, 56.7, 59.3, 61.8, 64.2],
        "youth_labor_force_growth": [1.5, 1.3, 1.1, 0.9, 0.7, 0.5],
        "key_insight": "Garment sector automation risk is real — digital skills investment critical for next decade.",
    },
    "NG": {
        "country": "Nigeria", "region": "West Africa",
        "years": [2025, 2027, 2029, 2031, 2033, 2035],
        "tertiary_education_pct": [10.5, 11.8, 13.2, 14.9, 16.5, 18.2],
        "secondary_education_pct": [35.2, 37.8, 40.5, 43.3, 46.0, 48.7],
        "youth_labor_force_growth": [3.5, 3.4, 3.2, 3.1, 2.9, 2.7],
        "key_insight": "Largest youth population in Africa — skills infrastructure investment has the highest multiplier.",
    },
}


def get_projections(country_code: str) -> dict:
    code = country_code.upper()
    if DATA_PATH.exists():
        with open(DATA_PATH) as f:
            data = json.load(f)
        if code in data:
            return data[code]
    return FALLBACK_PROJECTIONS.get(code, {})
