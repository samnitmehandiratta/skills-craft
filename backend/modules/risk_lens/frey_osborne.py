"""
Loads Frey-Osborne automation probability CSV and scores skills against it.
Applies LMIC calibration factor from country config.
"""
import pandas as pd
from pathlib import Path
from rapidfuzz import process, fuzz
from config.schema import CountryConfig

CSV_PATH = Path(__file__).parent.parent.parent / "data" / "frey_osborne_2013.csv"
MATCH_THRESHOLD = 50

_df: pd.DataFrame | None = None


def _load_data() -> pd.DataFrame:
    global _df
    if _df is None:
        if CSV_PATH.exists():
            _df = pd.read_csv(CSV_PATH)
        else:
            _df = _get_builtin_data()
    return _df


def _get_builtin_data() -> pd.DataFrame:
    """Fallback dataset with key occupations relevant to LMIC informal economy."""
    records = [
        ("Cashiers", 0.97), ("Data Entry Keyers", 0.99), ("Telemarketers", 0.99),
        ("Sewing Machine Operators", 0.90), ("Textile Knitting Machine Operators", 0.91),
        ("Cleaners of Vehicles and Equipment", 0.89), ("Laborers and Freight Movers", 0.85),
        ("Agricultural Laborers", 0.87), ("Food Preparation Workers", 0.82),
        ("Taxi Drivers", 0.89), ("Motorcycle Delivery Workers", 0.86),
        ("Market Vendors", 0.77), ("Street Vendors", 0.80),
        ("Mobile Phone Repair Technicians", 0.40), ("Electronics Repairers", 0.45),
        ("Construction Laborers", 0.88), ("Welders and Cutters", 0.55),
        ("Hairdressers and Barbers", 0.37), ("Tailors and Dressmakers", 0.72),
        ("Retail Salespersons", 0.92), ("Stock Clerks", 0.96),
        ("Bookkeeping Clerks", 0.98), ("Accounting Assistants", 0.94),
        ("Customer Service Representatives", 0.55), ("Loan Officers", 0.98),
        ("Teachers (Primary)", 0.02), ("Teachers (Secondary)", 0.02),
        ("Social Workers", 0.03), ("Healthcare Workers (Community)", 0.15),
        ("Software Developers", 0.04), ("Web Developers", 0.08),
        ("Graphic Designers", 0.17), ("Video Editors", 0.25),
        ("Electricians", 0.15), ("Plumbers", 0.38),
        ("Auto Mechanics", 0.29), ("HVAC Technicians", 0.35),
        ("Managers", 0.08), ("Supervisors", 0.12),
        ("Entrepreneurs and Business Owners", 0.05),
        ("Farmers (Subsistence)", 0.82), ("Fishermen", 0.78),
        ("Inventory Management Clerks", 0.95), ("Logistics Coordinators", 0.60),
        ("Translators and Interpreters", 0.38), ("Language Teachers", 0.02),
        ("Community Health Workers", 0.14), ("Midwives", 0.02),
        ("Security Guards", 0.84), ("Drivers (Heavy Vehicle)", 0.79),
    ]
    return pd.DataFrame(records, columns=["occupation_title", "automation_probability"])


def score_skill(skill_label: str, config: CountryConfig) -> dict:
    df = _load_data()
    occupations = df["occupation_title"].tolist()

    match_result = process.extractOne(
        skill_label,
        occupations,
        scorer=fuzz.token_sort_ratio,
        score_cutoff=MATCH_THRESHOLD,
    )

    if match_result:
        matched_occupation, match_score, _ = match_result
        raw_prob = float(df.loc[df["occupation_title"] == matched_occupation, "automation_probability"].iloc[0])
        calibrated_prob = round(raw_prob * config.automation.calibration_factor, 3)
        return {
            "matched_occupation": matched_occupation,
            "match_confidence": match_score,
            "raw_probability": raw_prob,
            "lmic_calibrated_probability": calibrated_prob,
            "calibration_factor": config.automation.calibration_factor,
        }

    # Use informal economy sector average as fallback
    fallback = 0.65 * config.automation.calibration_factor
    return {
        "matched_occupation": None,
        "match_confidence": 0,
        "raw_probability": None,
        "lmic_calibrated_probability": round(fallback, 3),
        "calibration_factor": config.automation.calibration_factor,
        "note": "Sector average used — no direct occupation match found",
    }
