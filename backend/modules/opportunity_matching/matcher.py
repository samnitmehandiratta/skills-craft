"""Matches a skills profile to realistic opportunities using labor market data."""
from config.schema import CountryConfig


def match_opportunities(
    assessed_skills: list[dict],
    labor_data: dict,
    wdi_data: dict,
    config: CountryConfig,
) -> list[dict]:
    durable_skills = [s for s in assessed_skills if s["bucket"] in ("DURABLE", "EMERGING")]
    skill_names = [s["skill"].lower() for s in durable_skills]

    opportunities = []
    for sector in config.top_sectors:
        relevance = _compute_relevance(skill_names, sector.name)
        if relevance < 0.1:
            continue

        wage = _estimate_wage(sector.name, config)
        opportunities.append({
            "title": f"{sector.name} Opportunity",
            "sector": sector.name,
            "sector_growth_rate": sector.growth_rate,
            "sector_growth_label": f"+{int(sector.growth_rate * 100)}% annual growth",
            "match_score": round(relevance, 2),
            "estimated_monthly_wage": wage,
            "wage_label": f"{config.wage_bands.currency} {wage:,}/month",
            "opportunity_type": _get_opportunity_type(sector.name, config),
            "matched_skills": _matched_skills(skill_names, sector.name, durable_skills),
            "data_source": labor_data.get("source", "ILO ILOSTAT"),
        })

    opportunities.sort(key=lambda x: x["match_score"], reverse=True)
    return opportunities[:5]


def _compute_relevance(skill_names: list[str], sector_name: str) -> float:
    sector_keywords = {
        "ict": ["coding", "programming", "computer", "software", "digital", "phone repair",
                "troubleshooting", "javascript", "python", "web", "app", "tech"],
        "financial": ["money", "accounting", "bookkeeping", "finance", "payment", "banking",
                      "budget", "cost", "record", "transaction", "float", "savings"],
        "agriculture": ["farming", "crop", "harvest", "soil", "irrigation", "livestock",
                        "agro", "food", "planting"],
        "healthcare": ["health", "medical", "care", "patient", "community health", "nursing",
                       "first aid", "hygiene"],
        "construction": ["building", "masonry", "carpentry", "welding", "plumbing",
                         "electrical", "fabrication"],
        "creative": ["design", "art", "music", "video", "content", "nollywood", "creative"],
        "logistics": ["logistics", "supply chain", "route", "delivery", "transport",
                      "inventory", "warehouse", "coordination"],
        "retail": ["sales", "customer", "negotiation", "market", "vendor", "trading"],
        "education": ["teaching", "training", "instructing", "mentoring", "tutoring"],
        "fintech": ["mobile money", "payment", "digital payment", "m-pesa", "bkash",
                    "float management", "transaction"],
    }

    sector_lower = sector_name.lower()
    matched_keywords = set()
    for category, keywords in sector_keywords.items():
        if any(k in sector_lower for k in [category]):
            matched_keywords.update(keywords)

    for category, keywords in sector_keywords.items():
        if any(k in sector_lower for k in keywords):
            matched_keywords.update(keywords)

    if not matched_keywords:
        matched_keywords = {"skill", "work", "experience"}

    matches = sum(1 for s in skill_names if any(kw in s for kw in matched_keywords))
    base_score = min(matches / max(len(skill_names), 1), 1.0)
    return max(base_score, 0.15)  # floor so all sectors get some score


def _estimate_wage(sector_name: str, config: CountryConfig) -> int:
    sector_lower = sector_name.lower()
    if any(k in sector_lower for k in ["ict", "software", "digital", "fintech", "tech"]):
        return config.wage_bands.digital_economy
    elif any(k in sector_lower for k in ["skilled", "mechanic", "electric", "health", "nurse"]):
        return config.wage_bands.skilled_trade
    elif any(k in sector_lower for k in ["formal", "bank", "finance", "government"]):
        return config.wage_bands.formal_entry
    else:
        return config.wage_bands.informal_minimum


def _get_opportunity_type(sector_name: str, config: CountryConfig) -> str:
    sector_lower = sector_name.lower()
    if any(k in sector_lower for k in ["freelance", "creative", "ict", "digital"]):
        return "digital_freelance"
    elif any(k in sector_lower for k in ["cooperative", "farm", "agriculture"]):
        return "cooperative_membership"
    elif any(k in sector_lower for k in ["training", "tvet", "vocational"]):
        return "vocational_upskilling"
    else:
        return "formal_employment" if "formal_employment" in config.opportunity_types else config.opportunity_types[0]


def _matched_skills(skill_names: list[str], sector_name: str, skills: list[dict]) -> list[str]:
    return [s["skill"] for s in skills[:3]]
