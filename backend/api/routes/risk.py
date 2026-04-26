from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.deps import get_country_config
from modules.skills_engine import intake as intake_store
from modules.risk_lens.bucketer import assess_profile, get_summary
from modules.risk_lens.resilience import get_resilience_recommendations
from modules.risk_lens.projections import get_projections

router = APIRouter(prefix="/api/v1/risk", tags=["risk"])

# Stores assessed risk per session — independent of intake _sessions
_risk_results: dict[str, list] = {}
_country_by_session: dict[str, str] = {}


class AssessRequest(BaseModel):
    session_id: str
    country_code: str
    skills: Optional[list] = None  # if provided, use directly; otherwise look up from store


@router.post("/assess")
def assess_risk(req: AssessRequest):
    # Prefer skills passed directly (validation flow); fall back to session store (old flow)
    if req.skills is not None:
        skills = req.skills
    else:
        profile = intake_store.get_stored_profile(req.session_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found. Run /skills/build-profile first.")
        skills = profile.get("skills", [])

    config = get_country_config(req.country_code)
    assessed = assess_profile(skills, config)

    # Store for resilience lookup
    _risk_results[req.session_id] = assessed
    _country_by_session[req.session_id] = req.country_code

    # Also write back into session store if it exists (backward compat)
    if req.session_id in intake_store._sessions:
        intake_store._sessions[req.session_id]["risk_assessment"] = assessed

    summary = get_summary(assessed)
    return {
        "session_id": req.session_id,
        "assessed_skills": assessed,
        "summary": summary,
        "calibration_note": config.automation.rationale,
        "calibration_factor": config.automation.calibration_factor,
    }


@router.get("/resilience/{session_id}")
def get_resilience(session_id: str):
    # Try new standalone store first, fall back to session store
    risk_assessment = _risk_results.get(session_id)
    country_code = _country_by_session.get(session_id)

    if risk_assessment is None:
        session = intake_store._sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found. Run /risk/assess first.")
        risk_assessment = session.get("risk_assessment")
        country_code = session.get("country_code")
        if not risk_assessment:
            raise HTTPException(status_code=400, detail="Run /risk/assess first")

    config = get_country_config(country_code or "GH")
    at_risk = [s for s in risk_assessment if s["bucket"] == "AT_RISK"]
    recommendations = get_resilience_recommendations(at_risk, config)

    return {
        "session_id": session_id,
        "recommendations": recommendations,
        "at_risk_count": len(at_risk),
    }


@router.get("/projections/{country_code}")
def get_country_projections(country_code: str):
    get_country_config(country_code)  # validate
    projections = get_projections(country_code)
    if not projections:
        raise HTTPException(status_code=404, detail=f"No projection data for {country_code}")
    return projections
