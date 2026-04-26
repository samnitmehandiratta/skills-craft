"""Auth endpoints — /api/v1/auth/*"""
import re
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from modules.auth.database import (
    create_otp, verify_otp, get_user_by_phone, create_user,
    create_token, update_user, save_profile, get_user_profiles,
    get_user_by_token,
)
from modules.auth.whatsapp import send_otp

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_E164 = re.compile(r"^\+\d{7,15}$")


def _require_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    token = auth.removeprefix("Bearer ").strip()
    user = get_user_by_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return user


def _user_is_onboarded(user: dict) -> bool:
    return bool(user.get("name") and user.get("dob") and user.get("gender") and user.get("country_code"))


# ── Request models ─────────────────────────────────────────────────────────────

class SendOtpRequest(BaseModel):
    phone: str  # E.164 format: +<country_code><number>


class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str


class UpdateMeRequest(BaseModel):
    name: str | None = None
    dob: str | None = None           # YYYY-MM-DD
    gender: str | None = None
    country_code: str | None = None


class SaveProfileRequest(BaseModel):
    session_id: str
    profile_json: str
    validation_json: str | None = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/send-otp")
def send_otp_endpoint(req: SendOtpRequest):
    phone = req.phone.strip()
    if not _E164.match(phone):
        raise HTTPException(
            status_code=422,
            detail="Phone must be in E.164 format: +<country_code><number> (e.g. +919876543210)",
        )
    otp = create_otp(phone)
    try:
        send_otp(phone, otp)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"ok": True}


@router.post("/verify-otp")
def verify_otp_endpoint(req: VerifyOtpRequest):
    phone = req.phone.strip()
    otp   = req.otp.strip()
    if not verify_otp(phone, otp):
        raise HTTPException(status_code=401, detail="Invalid or expired OTP.")

    user = get_user_by_phone(phone)
    is_new_user = False
    if user is None:
        try:
            user = create_user(phone)
            is_new_user = True
        except Exception:
            user = get_user_by_phone(phone)
            if user is None:
                raise HTTPException(status_code=500, detail="User creation failed.")

    if not _user_is_onboarded(user):
        is_new_user = True

    token = create_token(user["id"])
    return {"token": token, "user": dict(user), "is_new_user": is_new_user}


@router.get("/me")
def get_me(request: Request):
    user = _require_user(request)
    profiles = get_user_profiles(user["id"])
    return {"user": user, "profiles": profiles}


@router.put("/me")
def update_me(req: UpdateMeRequest, request: Request):
    user = _require_user(request)
    updated = update_user(
        user["id"],
        name=req.name,
        dob=req.dob,
        gender=req.gender,
        country_code=req.country_code,
    )
    return {"user": updated}


@router.post("/save-profile")
def save_profile_endpoint(req: SaveProfileRequest, request: Request):
    user = _require_user(request)
    row = save_profile(
        user_id=user["id"],
        session_id=req.session_id,
        profile_json=req.profile_json,
        validation_json=req.validation_json,
    )
    return {"ok": True, "profile": row}


@router.get("/profiles")
def get_profiles(request: Request):
    user = _require_user(request)
    return {"profiles": get_user_profiles(user["id"])}
