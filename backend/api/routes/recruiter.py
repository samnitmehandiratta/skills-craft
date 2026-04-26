import os
import json
import base64
import hmac
import hashlib
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from rapidfuzz import fuzz

from modules.auth.database import (
    get_all_skill_profiles_with_users,
    get_skill_profile_with_user_by_session_id,
    shortlist_add,
    shortlist_remove,
    shortlist_list,
)


router = APIRouter(prefix="/api/v1/recruiter", tags=["recruiter"])


def _recruiter_password() -> str:
    return (os.getenv("RECRUITER_PASSWORD") or "recruiter123").strip()


def _token_secret() -> str:
    # Separate secret so password rotations don't invalidate sessions if you don't want them to.
    return (os.getenv("RECRUITER_TOKEN_SECRET") or _recruiter_password()).strip()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))


def _sign(payload_b64: str) -> str:
    sig = hmac.new(_token_secret().encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return _b64url(sig)


def _issue_token(*, ttl_seconds: int = 8 * 60 * 60) -> str:
    exp = int(time.time()) + ttl_seconds
    payload = {"exp": exp, "role": "recruiter"}
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = _sign(payload_b64)
    return f"{payload_b64}.{sig}"


def _require_recruiter_token(request: Request) -> None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Recruiter authentication required.")
    token = auth.removeprefix("Bearer ").strip()
    if "." not in token:
        raise HTTPException(status_code=401, detail="Invalid recruiter token.")
    payload_b64, sig = token.split(".", 1)
    if not hmac.compare_digest(sig, _sign(payload_b64)):
        raise HTTPException(status_code=401, detail="Invalid recruiter token.")
    try:
        payload = json.loads(_b64url_decode(payload_b64))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid recruiter token.")
    if payload.get("role") != "recruiter":
        raise HTTPException(status_code=401, detail="Invalid recruiter token.")
    exp = payload.get("exp")
    if not isinstance(exp, int) or exp < int(time.time()):
        raise HTTPException(status_code=401, detail="Recruiter session expired.")


class RecruiterLoginRequest(BaseModel):
    password: str


class RecruiterMatchRequest(BaseModel):
    posted_skills: list[str] = Field(..., min_length=1, description="Skills required for the job posting")
    country_code: str | None = None
    min_rating: int = Field(0, ge=0, le=100)
    limit: int = Field(50, ge=1, le=200)
    include_hidden: bool = True
    only_matched: bool = True


class ShortlistAddRequest(BaseModel):
    session_id: str
    notes: str | None = None


def _norm(s: str) -> str:
    return " ".join((s or "").lower().strip().split())


def _extract_skill_strings(profile: dict[str, Any], *, include_hidden: bool) -> list[str]:
    skills = profile.get("skills") or []
    out: list[str] = []
    for item in skills:
        if not isinstance(item, dict):
            continue
        if not include_hidden and bool(item.get("is_hidden")):
            continue
        val = item.get("skill")
        if isinstance(val, str) and val.strip():
            out.append(val.strip())
    return out


def _best_match(needle: str, haystack: list[str]) -> tuple[str | None, int]:
    best_skill: str | None = None
    best_score = 0
    n = _norm(needle)
    for h in haystack:
        score = int(fuzz.token_set_ratio(n, _norm(h)))
        if score > best_score:
            best_score = score
            best_skill = h
    return best_skill, best_score


@router.post("/login")
def recruiter_login(req: RecruiterLoginRequest):
    expected = _recruiter_password()
    if not expected:
        raise HTTPException(status_code=500, detail="Recruiter password not configured.")
    if (req.password or "").strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid recruiter password.")
    return {"token": _issue_token()}


@router.post("/match")
def match_candidates(req: RecruiterMatchRequest, request: Request):
    _require_recruiter_token(request)

    posted = [s.strip() for s in req.posted_skills if isinstance(s, str) and s.strip()]
    if not posted:
        raise HTTPException(status_code=422, detail="posted_skills must not be empty.")

    rows = get_all_skill_profiles_with_users(country_code=req.country_code, limit=req.limit)
    scanned = 0
    candidates: list[dict[str, Any]] = []

    for row in rows:
        try:
            profile = json.loads(row["profile_json"])
        except Exception:
            continue
        scanned += 1

        profile_skills = _extract_skill_strings(profile, include_hidden=req.include_hidden)
        if not profile_skills:
            continue

        matched: list[dict[str, Any]] = []
        missing: list[str] = []

        for ps in posted:
            best_skill, best_score = _best_match(ps, profile_skills)
            if best_score >= 85 and best_skill is not None:
                matched.append({"posted_skill": ps, "candidate_skill": best_skill, "score": best_score})
            else:
                missing.append(ps)

        required = len(posted)
        hit = len(matched)
        rating = int(round((hit / required) * 100)) if required else 0

        if req.only_matched and hit == 0:
            continue

        if rating < req.min_rating:
            continue

        candidates.append(
            {
                "profile_id": profile.get("profile_id"),
                "session_id": row.get("session_id"),
                "name": row.get("user_name"),
                "phone": row.get("user_phone"),
                "country": (profile.get("country") or {}).get("code"),
                "summary": profile.get("summary"),
                "rating": rating,
                "matched": matched,
                "missing": missing,
                "skills_total": len(profile_skills),
                "created_at": row.get("created_at"),
            }
        )

    candidates.sort(key=lambda c: (c["rating"], len(c["matched"])), reverse=True)
    return {"scanned": scanned, "count": len(candidates), "candidates": candidates}


@router.get("/candidate/{session_id}")
def get_candidate(session_id: str, request: Request):
    _require_recruiter_token(request)
    row = get_skill_profile_with_user_by_session_id(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    try:
        profile = json.loads(row["profile_json"])
    except Exception:
        raise HTTPException(status_code=500, detail="Candidate profile is not valid JSON.")
    return {
        "session_id": row.get("session_id"),
        "name": row.get("user_name"),
        "phone": row.get("user_phone"),
        "country_code": row.get("user_country_code"),
        "created_at": row.get("created_at"),
        "profile": profile,
        "validation_json": row.get("validation_json"),
    }


@router.get("/shortlist")
def get_shortlist(request: Request, limit: int = 200):
    _require_recruiter_token(request)
    return {"items": shortlist_list(limit=limit)}


@router.post("/shortlist/add")
def add_to_shortlist(req: ShortlistAddRequest, request: Request):
    _require_recruiter_token(request)
    return {"item": shortlist_add(req.session_id, notes=req.notes)}


@router.post("/shortlist/remove")
def remove_from_shortlist(req: ShortlistAddRequest, request: Request):
    _require_recruiter_token(request)
    shortlist_remove(req.session_id)
    return {"ok": True}

