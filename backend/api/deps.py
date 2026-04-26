from fastapi import HTTPException, Request
from config.loader import get_config
from config.schema import CountryConfig
from modules.auth.database import get_user_by_token


def get_country_config(country_code: str) -> CountryConfig:
    try:
        return get_config(country_code)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


def get_current_user(request: Request) -> dict | None:
    """Optional auth dependency — returns user dict or None (never raises)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth.removeprefix("Bearer ").strip()
    return get_user_by_token(token) if token else None
