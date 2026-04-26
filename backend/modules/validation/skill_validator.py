"""
LLM-powered adaptive interview question generator and answer scorer.
Uses the ESCO skills cache for real taxonomy context.
"""
import json
import os
from pathlib import Path
from modules.validation.bedrock_client import chat_complete
from config.schema import CountryConfig

_esco_cache: dict | None = None

ESCO_CACHE_PATH = Path(__file__).parent.parent.parent / "data" / "esco_skills_cache.json"


def _get_esco_cache() -> dict:
    global _esco_cache
    if _esco_cache is None:
        if ESCO_CACHE_PATH.exists():
            with open(ESCO_CACHE_PATH) as f:
                _esco_cache = json.load(f)
        else:
            _esco_cache = {}
    return _esco_cache


def _lookup_skill_context(skill: str) -> dict:
    """Pull real ESCO taxonomy data for a skill from cache."""
    cache = _get_esco_cache()
    key = skill.lower().strip()
    data = cache.get(key, {})
    return {
        "esco_label": data.get("esco_label", skill),
        "esco_uri": data.get("esco_uri", ""),
        "skill_type": data.get("skill_type", "skill"),
        "broader_concept": data.get("broader_concept", ""),
    }


QUESTION_SYSTEM = """You are an expert technical interviewer conducting a spoken skill validation interview.

Your job: Generate ONE targeted follow-up question that builds directly on what the candidate just said.

Core principle — CONVERSATIONAL FLOW:
- Read the candidate's previous answers carefully. Your next question must feel like a natural continuation of the conversation, not a random new topic.
- If they mentioned a specific project, tool, client, problem, or outcome → drill into THAT, not a generic version.
- Example: if they said "I built a website for a local shop", your next question is "What was the hardest part of building that website — did you run into any bugs or design problems?" NOT a generic "Tell me about a web project."

How to handle "I learned X from YouTube / online courses / tutorials":
- This tells you WHAT skill they have and HOW they started — use it as a springboard.
- Your first question should be: "What did you build or do with [skill] after learning it — walk me through a specific project or task."
- If they describe a project in their answer, dig into THAT project next — what went wrong, what decisions they made, what they'd do differently.
- Never ask "what YouTube channel" or "what course" — always redirect to application and output.

Question progression rules:
1. Q1: Broad opener — get them to describe a specific real thing they did with this skill.
2. Q2: Dig into what they said in Q1 — a detail, a challenge, a decision, or an outcome they mentioned.
3. Q3: Edge case or problem — based on the specific situation they described, what went wrong or was hard?
4. Q4+: Expert depth — compare approaches, explain tradeoffs, or describe how they'd do it differently now.

Format rules:
- 1-2 sentences only. Natural spoken language. No lists, no bullet points, no "firstly/secondly".
- Do NOT ask yes/no questions.
- Do NOT repeat a question that was already asked.

Return ONLY valid JSON:
{
  "question": "the question text",
  "what_a_good_answer_includes": ["key point 1", "key point 2", "key point 3"],
  "red_flags": ["warning sign 1", "warning sign 2"]
}"""

SCORING_SYSTEM = """You are a validation auditor for informal worker skill claims.

Your job: Score how confidently the given answer demonstrates the claimed skill, considering the full conversation context.

Important context rules:
- Read the full conversation so far. An answer that builds on a previous answer (e.g., "as I said, in that project I also...") is valid and shows depth.
- If the candidate says they learned from YouTube/online but then describes what they actually BUILT or DID, that is real evidence — score the application, not the learning source.
- Only deduct if they ONLY mention watching videos with zero description of what they actually did.

Scoring rubric:
- 90-100: Specific, detailed, real practical experience. References concrete situations, decisions, outcomes. Directly answers the question.
- 70-89: Adequate. Demonstrates familiarity with the skill in real contexts, some specifics but may lack depth.
- 50-69: Vague or generic. Could be said by anyone who read about the skill, no personal concrete examples.
- 30-49: Shows partial knowledge. Significant gaps, confusion, or the answer barely relates to the question.
- 0-29: Does not demonstrate the skill. Only describes watching/reading, deflects, is incoherent, or is off-topic.

Deductions:
- Extremely short answer (under 15 words) with no substance: -15 points
- Only describes learning sources with zero practical application described: -20 points
- Answer completely ignores the question asked: -25 points

Return ONLY valid JSON:
{
  "confidence_score": <integer 0-100>,
  "verdict": "STRONG" | "ADEQUATE" | "WEAK" | "FAIL",
  "reasoning": "1-2 sentence explanation",
  "key_evidence": "the strongest evidence phrase from the answer, or null"
}"""


def generate_question(
    skill: str,
    question_number: int,
    total_questions: int,
    country_config: CountryConfig,
    previous_qa: list[dict],
    skill_evidence: str | None = None,
) -> dict:
    # Pull real ESCO taxonomy data for grounding
    esco = _lookup_skill_context(skill)

    # Only inject informal-economy vocabulary when the skill is actually informal/trade.
    # Technical and professional skills (software, accounting, nursing, etc.) should get
    # standard professional questions — not kirana-store framing.
    _FORMAL_SKILL_KEYWORDS = {
        "software", "programming", "code", "coding", "developer", "python", "java",
        "javascript", "react", "node", "sql", "database", "data", "analysis",
        "analytics", "machine learning", "ai", "cloud", "devops", "network",
        "accounting", "finance", "audit", "tax", "nursing", "doctor", "medical",
        "engineering", "mechanical", "electrical", "civil", "architecture",
        "teaching", "education", "research", "legal", "law", "marketing",
        "management", "project", "hr", "recruitment", "logistics", "supply chain",
        "excel", "word", "powerpoint", "design", "graphic", "photoshop",
    }
    skill_lower = skill.lower()
    is_formal = any(kw in skill_lower for kw in _FORMAL_SKILL_KEYWORDS)
    vocab_sample = [] if is_formal else (country_config.sector_vocabulary[:5] if country_config.sector_vocabulary else [])

    context_lines = [
        f"Skill being tested: {skill}",
        f"ESCO taxonomy label: {esco['esco_label']}",
        f"Skill type: {esco['skill_type']}",
        f"Broader concept: {esco['broader_concept']}" if esco["broader_concept"] else "",
        f"Country: {country_config.country_name} ({country_config.region})",
        f"Local informal-sector context (use only if relevant): {', '.join(vocab_sample)}" if vocab_sample else "",
        f"Question number: {question_number} of {total_questions}",
    ]

    if skill_evidence:
        context_lines.append(f"\nBackground context from intake (what the candidate said about this skill before the interview): {skill_evidence}")

    if previous_qa:
        # Include full Q+A so the AI can build correlated follow-ups
        qa_lines = []
        for i, qa in enumerate(previous_qa[-4:]):
            q = qa.get("question", "")[:120]
            a = qa.get("answer", "")[:200]
            qa_lines.append(f"  Q{i+1}: {q}")
            if a:
                qa_lines.append(f"  A{i+1}: {a}")
        context_lines.append(
            "\nConversation so far (build your next question on what the candidate actually said):\n"
            + "\n".join(qa_lines)
        )

    context = "\n".join(line for line in context_lines if line)

    _fallback = {
        "question": f"Tell me about a specific time you used {skill} in your work. What did you do and what was the result?",
        "what_a_good_answer_includes": [],
        "red_flags": [],
    }

    try:
        _content = chat_complete(
            messages=[
                {"role": "system", "content": QUESTION_SYSTEM},
                {"role": "user", "content": context},
            ],
            response_format={"type": "json_object"},
            temperature=0.4,
        )
        result = json.loads(_content)
        if "question" not in result:
            return _fallback
        return result
    except Exception:
        return _fallback


def score_answer(
    skill: str,
    question: str,
    answer: str,
    what_a_good_answer_includes: list[str],
    red_flags: list[str],
    conversation_history: list[dict] | None = None,
) -> dict:
    _fallback = {"confidence_score": 0, "verdict": "FAIL", "reasoning": "Scoring unavailable", "key_evidence": None}

    if not answer or len(answer.strip()) < 5:
        return {"confidence_score": 0, "verdict": "FAIL", "reasoning": "No answer provided", "key_evidence": None}

    esco = _lookup_skill_context(skill)

    history_block = ""
    if conversation_history:
        lines = []
        for i, qa in enumerate(conversation_history[-3:]):
            lines.append(f"  Q{i+1}: {qa.get('question', '')[:100]}")
            lines.append(f"  A{i+1}: {qa.get('answer', '')[:150]}")
        history_block = "\nPrevious conversation (for context — the current answer may reference earlier answers):\n" + "\n".join(lines) + "\n"

    prompt = (
        f"Skill being tested: {skill} (ESCO: {esco['esco_label']})\n"
        f"{history_block}"
        f"Current question: {question}\n"
        f"Candidate's answer: {answer}\n\n"
        f"Good answer should include: {', '.join(what_a_good_answer_includes)}\n"
        f"Red flags to watch for: {', '.join(red_flags)}"
    )

    try:
        _content = chat_complete(
            messages=[
                {"role": "system", "content": SCORING_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        result = json.loads(_content)
        score = max(0, min(100, int(result.get("confidence_score", 0))))
        return {
            "confidence_score": score,
            "verdict": result.get("verdict", "FAIL"),
            "reasoning": result.get("reasoning", ""),
            "key_evidence": result.get("key_evidence"),
        }
    except Exception:
        return _fallback


def _max_per_skill(total_skills: int) -> int:
    """CISSP-CAT: fewer questions per skill when breadth is high."""
    if total_skills <= 4:
        return 4   # deep dive for small skill sets
    if total_skills <= 8:
        return 3
    return 2       # breadth mode: 2 max for 9+ skills


def _skill_determined(scores: list[int], count: int) -> bool:
    """
    CISSP CAT early-termination rule:
    - 2+ consecutive scores >= 75  → clearly knows it (STRONG/ADEQUATE) — stop
    - 2+ consecutive scores <  40  → clearly doesn't know it (FAIL) — stop
    Any of those patterns means we have enough evidence; asking more wastes both sides' time.
    """
    if len(scores) < 2:
        return False
    last2 = scores[-2:]
    if all(s >= 75 for s in last2):
        return True   # confirmed competent
    if all(s < 40  for s in last2):
        return True   # confirmed not competent
    return False


def select_next_skill(
    claimed_skills: list[str],
    skill_question_counts: dict[str, int],
    skill_scores: dict[str, list[int]],
    max_questions_per_skill: int = 2,  # kept for signature compat, ignored internally
) -> str | None:
    """
    CISSP-CAT adaptive skill selection:

    Pass 1 — everyone gets exactly 1 question (round-robin baseline).
    Pass 2 — adaptive:
      • Skill determined (2 consec strong OR 2 consec fail) → skip, don't ask again.
      • Under per-skill cap (scales with breadth) → ask one more.
    """
    n = len(claimed_skills)
    cap = _max_per_skill(n)

    # Pass 1: give every skill its first question
    for skill in claimed_skills:
        if skill_question_counts.get(skill, 0) == 0:
            return skill

    # Pass 2: adaptive depth, skipping determined skills
    for skill in claimed_skills:
        count  = skill_question_counts.get(skill, 0)
        scores = skill_scores.get(skill, [])

        # Already at or over the per-skill cap → done
        if count >= cap:
            continue

        # CISSP rule: if outcome is already clear, stop probing this skill
        if _skill_determined(scores, count):
            continue

        # Single failure on first question → give one more chance, then stop
        if count == 1 and scores and scores[-1] < 40:
            return skill   # second attempt, then determined on next eval

        # Otherwise: skill hasn't reached cap and isn't determined → ask more
        return skill

    return None  # all skills are determined or at cap → interview complete


def estimate_total_questions(
    claimed_skills: list[str],
    skill_question_counts: dict[str, int],
    skill_scores: dict[str, list[int]],
) -> int:
    """
    Live estimate: sum expected remaining questions per skill.
    Already-determined skills count only their actual questions asked.
    """
    cap = _max_per_skill(len(claimed_skills))
    total = 0
    for skill in claimed_skills:
        scores = skill_scores.get(skill, [])
        count  = skill_question_counts.get(skill, 0)
        if _skill_determined(scores, count) or count >= cap:
            total += count          # no more questions for this skill
        elif not scores:
            total += min(2, cap)    # fresh skill: assume 2 questions
        else:
            avg = sum(scores) / len(scores)
            if avg >= 75:
                total += min(count + 1, cap)   # likely one more depth question
            elif avg >= 40:
                total += min(count + 2, cap)   # borderline: up to 2 more
            else:
                total += count + 1             # one more chance, then fail
    return max(total, len(claimed_skills))
