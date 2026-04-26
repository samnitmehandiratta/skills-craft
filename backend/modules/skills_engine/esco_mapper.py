"""
Maps skill labels to ESCO taxonomy URIs.
Uses a local cache first; falls back to ESCO REST API.
"""
import json
import httpx
from pathlib import Path

CACHE_PATH = Path(__file__).parent.parent.parent / "data" / "esco_skills_cache.json"
ESCO_API = "https://ec.europa.eu/esco/api/search"

_cache: dict[str, dict] = {}


def _load_cache() -> None:
    global _cache
    if CACHE_PATH.exists():
        with open(CACHE_PATH) as f:
            _cache = json.load(f)


def _save_cache() -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_PATH, "w") as f:
        json.dump(_cache, f, indent=2)


def _lookup_esco(skill_text: str) -> dict:
    cache_key = skill_text.lower().strip()
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        resp = httpx.get(
            ESCO_API,
            params={"text": skill_text, "type": "skill", "language": "en", "limit": 1},
            timeout=5.0,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("_embedded", {}).get("results", [])
        if results:
            top = results[0]
            mapped = {
                "esco_uri": top.get("uri", ""),
                "esco_label": top.get("title", skill_text),
                "skill_type": top.get("skillType", "skill"),
                "broader_concept": top.get("broaderHierarchyConcept", ""),
            }
        else:
            mapped = {
                "esco_uri": "",
                "esco_label": skill_text,
                "skill_type": "skill",
                "broader_concept": "",
            }
        _cache[cache_key] = mapped
        _save_cache()
        return mapped
    except Exception:
        fallback = {
            "esco_uri": "",
            "esco_label": skill_text,
            "skill_type": "skill",
            "broader_concept": "",
        }
        _cache[cache_key] = fallback
        return fallback


def map_skills_to_esco(skills: list[dict]) -> list[dict]:
    _load_cache()
    mapped = []
    for skill in skills:
        label = skill.get("skill", "")
        esco_data = _lookup_esco(label)
        mapped.append({**skill, **esco_data})
    return mapped
