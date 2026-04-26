"""Classifies skills into At Risk / Durable / Emerging buckets."""
from config.schema import CountryConfig


def bucket_skill(lmic_prob: float, config: CountryConfig) -> str:
    if lmic_prob >= config.automation.at_risk_threshold:
        return "AT_RISK"
    elif lmic_prob <= config.automation.durable_threshold:
        return "DURABLE"
    else:
        return "EMERGING"


def assess_profile(skills: list[dict], config: CountryConfig) -> list[dict]:
    from modules.risk_lens.frey_osborne import score_skill

    assessed = []
    for skill in skills:
        label = skill.get("skill", "")
        scoring = score_skill(label, config)
        prob = scoring["lmic_calibrated_probability"]
        bucket = bucket_skill(prob, config)

        assessed.append({
            **skill,
            "automation_score": scoring,
            "bucket": bucket,
            "bucket_label": {
                "AT_RISK": "At Risk",
                "DURABLE": "Durable",
                "EMERGING": "Emerging",
            }[bucket],
            "bucket_color": {
                "AT_RISK": "red",
                "DURABLE": "green",
                "EMERGING": "yellow",
            }[bucket],
        })

    return assessed


def get_summary(assessed_skills: list[dict]) -> dict:
    total = len(assessed_skills)
    at_risk = sum(1 for s in assessed_skills if s["bucket"] == "AT_RISK")
    durable = sum(1 for s in assessed_skills if s["bucket"] == "DURABLE")
    emerging = sum(1 for s in assessed_skills if s["bucket"] == "EMERGING")

    return {
        "total": total,
        "at_risk": at_risk,
        "durable": durable,
        "emerging": emerging,
        "at_risk_pct": round(at_risk / total * 100, 1) if total else 0,
        "durable_pct": round(durable / total * 100, 1) if total else 0,
        "overall_risk": "HIGH" if at_risk / total > 0.5 else ("MODERATE" if at_risk / total > 0.25 else "LOW"),
    }
