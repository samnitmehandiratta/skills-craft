"""Extracts explicit skills from the intake transcript using LLM."""
import json
from modules.validation.bedrock_client import chat_complete


EXTRACT_SYSTEM = """You are a skills extraction specialist for informal economy workers in low- and middle-income countries.

Extract ALL skills explicitly mentioned or clearly demonstrated in the person's responses.
Include technical skills, soft skills, languages, domain knowledge, and tools.

Return ONLY valid JSON:
{
  "explicit_skills": [
    {
      "skill": "skill name (concise, 2-5 words)",
      "evidence": "the exact phrase or sentence that demonstrates this skill",
      "category": "technical|soft|language|domain|tool"
    }
  ],
  "summary": "2-sentence summary of this person's background"
}"""


def extract_explicit_skills(transcript: str) -> dict:
    content = chat_complete(
        messages=[
            {"role": "system", "content": EXTRACT_SYSTEM},
            {"role": "user", "content": f"Extract skills from this intake interview:\n\n{transcript}"},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    try:
        result = json.loads(content)
        skills = result.get("explicit_skills", [])
        summary = result.get("summary", "")
        for skill in skills:
            skill["is_hidden"] = False
        return {"explicit_skills": skills, "summary": summary}
    except (json.JSONDecodeError, KeyError):
        return {"explicit_skills": [], "summary": ""}
