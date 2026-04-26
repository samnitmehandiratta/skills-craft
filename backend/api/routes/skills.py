from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.deps import get_country_config
from modules.skills_engine import intake as intake_store
from modules.skills_engine.extractor import extract_explicit_skills
from modules.skills_engine.hidden_skills import infer_hidden_skills
from modules.skills_engine.esco_mapper import map_skills_to_esco
from modules.skills_engine.profile_builder import build_profile

router = APIRouter(prefix="/api/v1/skills", tags=["skills"])


class StartRequest(BaseModel):
    country_code: str
    language: str = "en"


class RespondRequest(BaseModel):
    session_id: str
    user_message: str


class MapEscoRequest(BaseModel):
    session_id: str


@router.post("/intake/start")
def start_intake(req: StartRequest):
    get_country_config(req.country_code)  # validate country exists
    return intake_store.start_session(req.country_code, req.language)


@router.post("/intake/respond")
def respond_to_intake(req: RespondRequest):
    try:
        return intake_store.respond(req.session_id, req.user_message)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/extract")
def extract_skills(req: MapEscoRequest):
    try:
        session = intake_store.get_session(req.session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if not session.get("is_complete"):
        raise HTTPException(status_code=400, detail="Intake is not complete yet")

    transcript = intake_store.get_transcript(req.session_id)
    config = get_country_config(session["country_code"])

    explicit_result = extract_explicit_skills(transcript)
    hidden_skills = infer_hidden_skills(transcript, config)

    return {
        "session_id": req.session_id,
        "explicit_skills": explicit_result["explicit_skills"],
        "hidden_skills": hidden_skills,
        "summary": explicit_result["summary"],
        "counts": {
            "explicit": len(explicit_result["explicit_skills"]),
            "hidden": len(hidden_skills),
            "total": len(explicit_result["explicit_skills"]) + len(hidden_skills),
        },
    }


@router.post("/build-profile")
def build_profile_endpoint(req: MapEscoRequest):
    try:
        session = intake_store.get_session(req.session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    transcript = intake_store.get_transcript(req.session_id)
    config = get_country_config(session["country_code"])

    explicit_result = extract_explicit_skills(transcript)
    hidden_skills = infer_hidden_skills(transcript, config)

    all_skills = explicit_result["explicit_skills"] + hidden_skills
    mapped_skills = map_skills_to_esco(all_skills)

    profile = build_profile(
        session_id=req.session_id,
        explicit_skills=[s for s in mapped_skills if not s.get("is_hidden")],
        hidden_skills=[s for s in mapped_skills if s.get("is_hidden")],
        summary=explicit_result["summary"],
        config=config,
        transcript=transcript,
    )

    intake_store.store_profile(req.session_id, profile)
    return profile


@router.get("/profile/{session_id}")
def get_profile(session_id: str):
    profile = intake_store.get_stored_profile(session_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found. Run /build-profile first.")
    return profile


class StoreProfileRequest(BaseModel):
    session_id: str
    profile: dict


@router.post("/store-profile")
def store_profile_direct(req: StoreProfileRequest):
    """Accept a pre-built profile from the validation flow and store it for risk/opportunities."""
    intake_store.store_profile(req.session_id, req.profile)
    return {"ok": True}
