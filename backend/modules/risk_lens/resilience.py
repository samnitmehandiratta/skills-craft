"""Recommends adjacent skills that increase resilience for at-risk skills."""
import json
import os
from modules.validation.bedrock_client import chat_complete
from config.schema import CountryConfig

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = get_llm_client()
    return _client


RESILIENCE_SYSTEM = """You are a labor market advisor for informal economy workers in low- and middle-income countries.

For skills that are at high automation risk, suggest 1-2 adjacent skills the person could realistically develop to increase their economic resilience.

Requirements:
- Adjacent means buildable FROM their existing skill, not a complete career change
- Realistic for someone with limited formal education and limited access to expensive training
- Grounded in the local economy — mention real training pathways if possible
- Be honest: say why the adjacent skill is more durable

Return ONLY valid JSON:
{
  "recommendations": [
    {
      "at_risk_skill": "the at-risk skill",
      "adjacent_skills": [
        {
          "skill": "adjacent skill name",
          "why_durable": "one sentence explanation",
          "how_to_learn": "realistic pathway (e.g. COTVET course, YouTube, apprenticeship)",
          "estimated_months": 3
        }
      ]
    }
  ]
}"""


def get_resilience_recommendations(at_risk_skills: list[dict], config: CountryConfig) -> list[dict]:
    if not at_risk_skills:
        return []

    client = _get_client()

    skills_summary = [
        {"skill": s["skill"], "automation_probability": s["automation_score"]["lmic_calibrated_probability"]}
        for s in at_risk_skills[:5]  # limit to top 5 at-risk
    ]

    user_prompt = f"""Country: {config.country_name} ({config.region})
Available training: {", ".join(config.education_taxonomy.tvet_institutions)}
Opportunity types: {", ".join(config.opportunity_types)}

At-risk skills to address:
{json.dumps(skills_summary, indent=2)}

Suggest adjacent, buildable skills to increase resilience."""

    _content = chat_complete(
        messages=[
            {"role": "system", "content": RESILIENCE_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
    )

    try:
        result = json.loads(_content)
        return result.get("recommendations", [])
    except (json.JSONDecodeError, KeyError):
        return []
