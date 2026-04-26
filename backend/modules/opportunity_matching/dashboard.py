"""Policymaker aggregate view — computes stats across all sessions."""
from modules.skills_engine import intake as intake_store


def get_aggregate(country_code: str) -> dict:
    """Aggregate skill risk data across all completed sessions for a country."""
    sessions = [
        s for s in intake_store._sessions.values()
        if s.get("country_code", "").upper() == country_code.upper()
        and s.get("profile") is not None
    ]

    if not sessions:
        return _get_demo_aggregate(country_code)

    total_profiles = len(sessions)
    all_skills = []
    hidden_count = 0
    bucket_counts = {"AT_RISK": 0, "DURABLE": 0, "EMERGING": 0}

    for session in sessions:
        profile = session.get("profile", {})
        skills = profile.get("skills", [])
        all_skills.extend(skills)
        hidden_count += sum(1 for s in skills if s.get("is_hidden"))

        risk_assessment = session.get("risk_assessment", [])
        for skill in risk_assessment:
            bucket = skill.get("bucket", "EMERGING")
            bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1

    total_skills = len(all_skills)
    return {
        "total_profiles": total_profiles,
        "total_skills_mapped": total_skills,
        "avg_skills_per_profile": round(total_skills / total_profiles, 1) if total_profiles else 0,
        "hidden_skills_pct": round(hidden_count / total_skills * 100, 1) if total_skills else 0,
        "bucket_distribution": bucket_counts,
        "country_code": country_code,
        "data_note": "Aggregated from live sessions",
    }


def _get_demo_aggregate(country_code: str) -> dict:
    """Seeded demo data for policymaker view when no live sessions exist."""
    demo = {
        "GH": {
            "total_profiles": 47,
            "total_skills_mapped": 623,
            "avg_skills_per_profile": 13.3,
            "hidden_skills_pct": 58.2,
            "bucket_distribution": {"AT_RISK": 198, "DURABLE": 267, "EMERGING": 158},
            "skills_gap": [
                {"sector": "ICT", "demand_score": 0.85, "supply_score": 0.32, "gap": 0.53},
                {"sector": "Financial Services", "demand_score": 0.72, "supply_score": 0.41, "gap": 0.31},
                {"sector": "Healthcare", "demand_score": 0.61, "supply_score": 0.28, "gap": 0.33},
            ],
            "policy_insight": "68% of surveyed youth have at least one hidden durable skill. Structured recognition pathways could unlock immediate formal employment.",
        },
        "IN": {
            "total_profiles": 63,
            "total_skills_mapped": 841,
            "avg_skills_per_profile": 13.3,
            "hidden_skills_pct": 54.7,
            "bucket_distribution": {"AT_RISK": 302, "DURABLE": 358, "EMERGING": 181},
            "skills_gap": [
                {"sector": "IT & Software", "demand_score": 0.91, "supply_score": 0.38, "gap": 0.53},
                {"sector": "Healthcare", "demand_score": 0.78, "supply_score": 0.35, "gap": 0.43},
                {"sector": "Manufacturing (skilled)", "demand_score": 0.65, "supply_score": 0.44, "gap": 0.21},
            ],
            "policy_insight": "Garment and data-entry workers face the highest automation risk. NSDC upskilling pathways in digital skills show the highest ROI.",
        },
    }
    base = demo.get(country_code.upper(), {
        "total_profiles": 31,
        "total_skills_mapped": 412,
        "avg_skills_per_profile": 13.3,
        "hidden_skills_pct": 55.0,
        "bucket_distribution": {"AT_RISK": 148, "DURABLE": 176, "EMERGING": 88},
        "skills_gap": [],
        "policy_insight": "Majority of informal workers hold unrecognized durable skills. Portable credentialing infrastructure needed.",
    })
    base["country_code"] = country_code
    base["data_note"] = "Demo data — seeded from World Bank STEP survey archetypes"
    return base
