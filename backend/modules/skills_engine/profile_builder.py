"""Assembles the final portable skills profile from explicit + hidden + ESCO data."""
import uuid
from datetime import datetime
from config.schema import CountryConfig


def build_profile(
    session_id: str,
    explicit_skills: list[dict],
    hidden_skills: list[dict],
    summary: str,
    config: CountryConfig,
    transcript: str,
) -> dict:
    all_skills = explicit_skills + hidden_skills

    return {
        "profile_id": str(uuid.uuid4()),
        "session_id": session_id,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "country": {
            "code": config.country_code,
            "name": config.country_name,
            "region": config.region,
        },
        "summary": summary,
        "skills": all_skills,
        "skill_counts": {
            "total": len(all_skills),
            "explicit": len(explicit_skills),
            "hidden": len(hidden_skills),
        },
        "categories": _group_by_category(all_skills),
        "portable_format": {
            "version": "1.0",
            "taxonomy": "ESCO v1.1 / O*NET",
            "note": "This profile is portable across borders and sectors. Skills marked 'hidden' were inferred from your activities.",
        },
        "raw_transcript": transcript,
    }


def _group_by_category(skills: list[dict]) -> dict:
    groups: dict[str, list] = {}
    for skill in skills:
        cat = skill.get("category", "other")
        if cat not in groups:
            groups[cat] = []
        groups[cat].append(skill.get("skill", ""))
    return groups
