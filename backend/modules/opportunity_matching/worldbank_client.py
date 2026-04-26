"""World Bank WDI API wrapper with static fallback."""
import httpx

WDI_BASE = "https://api.worldbank.org/v2/countries"

FALLBACK_DATA = {
    "GHA": {
        "gdp_per_capita_usd": 2363,
        "youth_unemployment_pct": 12.4,
        "employment_ratio_pct": 68.2,
        "human_capital_index": 0.44,
        "source": "World Bank WDI 2023 (Ghana)",
    },
    "IND": {
        "gdp_per_capita_usd": 2389,
        "youth_unemployment_pct": 21.8,
        "employment_ratio_pct": 52.1,
        "human_capital_index": 0.49,
        "source": "World Bank WDI 2023 (India)",
    },
    "KEN": {
        "gdp_per_capita_usd": 2081,
        "youth_unemployment_pct": 22.6,
        "employment_ratio_pct": 72.3,
        "human_capital_index": 0.52,
        "source": "World Bank WDI 2023 (Kenya)",
    },
    "BGD": {
        "gdp_per_capita_usd": 2688,
        "youth_unemployment_pct": 11.9,
        "employment_ratio_pct": 55.7,
        "human_capital_index": 0.46,
        "source": "World Bank WDI 2023 (Bangladesh)",
    },
    "NGA": {
        "gdp_per_capita_usd": 2184,
        "youth_unemployment_pct": 42.5,
        "employment_ratio_pct": 56.9,
        "human_capital_index": 0.36,
        "source": "World Bank WDI 2023 (Nigeria)",
    },
}

INDICATORS = {
    "gdp_per_capita_usd": "NY.GDP.PCAP.CD",
    "youth_unemployment_pct": "SL.UEM.1524.ZS",
    "employment_ratio_pct": "SL.EMP.TOTL.SP.ZS",
}


async def get_wdi_data(wdi_country_code: str) -> dict:
    code = wdi_country_code.upper()
    results = {}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            for key, indicator in INDICATORS.items():
                resp = await client.get(
                    f"{WDI_BASE}/{code}/indicators/{indicator}",
                    params={"format": "json", "mrv": 1},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if len(data) > 1 and data[1]:
                        value = data[1][0].get("value")
                        if value is not None:
                            results[key] = round(float(value), 2)

        if results:
            results["source"] = "World Bank WDI (live)"
            return {**FALLBACK_DATA.get(code, {}), **results}
    except Exception:
        pass

    return FALLBACK_DATA.get(code, {"source": "not_found", "country_code": code})
