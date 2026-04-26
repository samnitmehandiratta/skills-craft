from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.deps import get_country_config
from modules.skills_engine import intake as intake_store
from modules.opportunity_matching.ilo_client import get_labor_data
from modules.opportunity_matching.worldbank_client import get_wdi_data
from modules.opportunity_matching.matcher import match_opportunities
from modules.opportunity_matching.dashboard import get_aggregate
from api.routes.risk import _risk_results
import json
from pathlib import Path

router = APIRouter(prefix="/api/v1/opportunities", tags=["opportunities"])

DEMO_PROFILES_DIR = Path(__file__).parent.parent.parent / "data" / "demo_profiles"


class MatchRequest(BaseModel):
    session_id: str
    country_code: str
    risk_assessment: Optional[list] = None  # if provided, use directly


@router.post("/match")
async def match_opps(req: MatchRequest):
    # Prefer risk_assessment passed directly; fall back to stored results
    if req.risk_assessment is not None:
        risk_assessment = req.risk_assessment
    else:
        risk_assessment = _risk_results.get(req.session_id)
        if risk_assessment is None:
            session = intake_store._sessions.get(req.session_id, {})
            risk_assessment = session.get("risk_assessment")
        if not risk_assessment:
            raise HTTPException(status_code=400, detail="Run /risk/assess first")

    config = get_country_config(req.country_code)
    labor_data = await get_labor_data(req.country_code)
    wdi_data = await get_wdi_data(config.labor_data.wdi_country_code)

    opportunities = match_opportunities(risk_assessment, labor_data, wdi_data, config)

    return {
        "session_id": req.session_id,
        "opportunities": opportunities,
        "labor_signals": {
            "youth_unemployment_rate": labor_data.get("youth_unemployment_rate"),
            "informal_employment_pct": labor_data.get("informal_employment_pct"),
            "gdp_per_capita_usd": wdi_data.get("gdp_per_capita_usd"),
            "human_capital_index": wdi_data.get("human_capital_index"),
            "ilo_source": labor_data.get("source"),
            "wdi_source": wdi_data.get("source"),
        },
    }


@router.get("/labor-signals/{country_code}")
async def get_labor_signals(country_code: str):
    config = get_country_config(country_code)
    labor_data = await get_labor_data(country_code)
    wdi_data = await get_wdi_data(config.labor_data.wdi_country_code)
    return {
        "country_code": country_code,
        "ilo_data": labor_data,
        "wdi_data": wdi_data,
        "top_sectors": [s.dict() for s in config.top_sectors],
    }


@router.get("/dashboard/aggregate/{country_code}")
def get_dashboard(country_code: str):
    get_country_config(country_code)
    return get_aggregate(country_code)


@router.get("/demo-profile/{profile_name}")
def get_demo_profile(profile_name: str):
    path = DEMO_PROFILES_DIR / f"{profile_name}.json"
    if not path.exists():
        available = [f.stem for f in DEMO_PROFILES_DIR.glob("*.json")]
        raise HTTPException(
            status_code=404,
            detail=f"Demo profile '{profile_name}' not found. Available: {available}"
        )
    with open(path) as f:
        return json.load(f)
