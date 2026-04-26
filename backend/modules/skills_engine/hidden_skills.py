"""
Two-pass LLM engine that infers skills the user didn't explicitly mention.
Pass 1: Decompose activities into micro-tasks, infer underlying skills.
Pass 2: Score each inferred skill 0-1 for confidence, drop below 0.5.
"""
import json
from modules.validation.bedrock_client import chat_complete
from config.schema import CountryConfig


DECOMPOSE_SYSTEM = """You are an informal economy skills analyst specializing in low- and middle-income countries.

Your job: Given a person's narrative about their daily activities and work experience, identify skills they DIDN'T explicitly state but that are clearly implied by what they do.

Process for each activity mentioned:
1. List the micro-tasks they must actually perform to execute it
2. For each micro-task, identify the underlying cognitive or practical skill it requires
3. Only include skills that are genuinely implied — not aspirational or loosely related

Return ONLY valid JSON in this exact format:
{
  "activities": [
    {
      "activity": "the activity as described",
      "micro_tasks": ["task1", "task2", ...],
      "inferred_skills": ["skill1", "skill2", ...]
    }
  ]
}"""

CONFIDENCE_SYSTEM = """You are evaluating whether inferred skills are genuinely implied by specific work activities.

For each skill, score 0.0 to 1.0:
- 1.0 = This activity absolutely requires this skill to perform at all
- 0.7 = This activity strongly implies this skill in most contexts
- 0.5 = This activity sometimes requires this skill
- 0.3 = This is loosely related but not clearly implied
- 0.0 = Not implied at all

Return ONLY valid JSON:
{
  "scores": [
    {"skill": "skill name", "activity": "source activity", "confidence": 0.0}
  ]
}"""


def _build_decompose_prompt(transcript: str, config: CountryConfig) -> str:
    vocab = ", ".join(config.sector_vocabulary[:10]) if config.sector_vocabulary else ""
    hints = []
    for activity in (config.informal_economy_activities or []):
        hints.append(f'- "{activity.phrase}" implies: {", ".join(activity.hidden_skill_hints)}')
    hint_text = "\n".join(hints) if hints else "None available"

    return f"""Country context: {config.country_name} ({config.region})
Local sector terms to recognize: {vocab}
Known local activity → skill mappings:
{hint_text}

Person's narrative (from interview answers):
{transcript}

Identify ALL hidden skills implied by what they described doing. Focus on practical skills demonstrated through their answers."""


def _build_confidence_prompt(activities: list[dict]) -> str:
    items = []
    for item in activities:
        for skill in item.get("inferred_skills", []):
            items.append({"skill": skill, "activity": item.get("activity", "")})

    return f"""Evaluate these inferred skills for how confidently they are implied:

{json.dumps(items, indent=2)}

Score each 0.0-1.0. Drop anything below 0.5 in your assessment."""


def infer_hidden_skills(transcript: str, config: CountryConfig) -> list[dict]:
    """
    Returns list of hidden skills with structure:
    { skill, source_activity, confidence, is_hidden: True }
    """
    if not transcript or len(transcript.strip()) < 30:
        return []

    # Pass 1: Activity decomposition
    try:
        decompose_content = chat_complete(
            messages=[
                {"role": "system", "content": DECOMPOSE_SYSTEM},
                {"role": "user", "content": _build_decompose_prompt(transcript, config)},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        decomposed = json.loads(decompose_content)
        activities = decomposed.get("activities", [])
    except Exception:
        return []

    if not activities:
        return []

    # Pass 2: Confidence filtering
    try:
        confidence_content = chat_complete(
            messages=[
                {"role": "system", "content": CONFIDENCE_SYSTEM},
                {"role": "user", "content": _build_confidence_prompt(activities)},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        scored = json.loads(confidence_content)
        scores = scored.get("scores", [])
    except Exception:
        scores = []

    # Build final list: only skills with confidence >= 0.5
    result = []
    seen = set()
    for item in scores:
        skill = item.get("skill", "").strip()
        confidence = float(item.get("confidence", 0))
        activity = item.get("activity", "")
        if confidence >= 0.5 and skill and skill.lower() not in seen:
            seen.add(skill.lower())
            result.append({
                "skill": skill,
                "category": "domain",
                "source_activity": activity,
                "confidence": round(confidence, 2),
                "is_hidden": True,
            })

    return sorted(result, key=lambda x: x["confidence"], reverse=True)
