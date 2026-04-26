"""
In-memory session store for validation interviews.
Mirrors the _sessions dict pattern from modules/skills_engine/intake.py.
"""
import uuid

from modules.validation.cheat_detector import CheatScore

_sessions: dict[str, dict] = {}


def create_validation_session(
    original_session_id: str | None,
    claimed_skills: list[str],
    country_code: str,
) -> dict:
    vid = str(uuid.uuid4())
    session = {
        "validation_session_id": vid,
        "original_session_id": original_session_id,
        "claimed_skills": claimed_skills,
        "country_code": country_code,
        "questions_asked": [],
        "answers": [],
        "skill_question_counts": {s: 0 for s in claimed_skills},
        "skill_scores": {s: [] for s in claimed_skills},
        "cheat_scores": [],
        "is_complete": False,
        "current_skill": None,
        "current_question_number": 0,
        "result": None,
    }
    _sessions[vid] = session
    return session


def get_validation_session(validation_session_id: str) -> dict:
    session = _sessions.get(validation_session_id)
    if not session:
        raise ValueError(f"Validation session not found: {validation_session_id}")
    return session


def record_answer(
    validation_session_id: str,
    question_text: str,
    skill: str,
    answer_text: str,
    cheat_signals: dict,
    score: dict,
    cheat_score: CheatScore,
) -> None:
    session = get_validation_session(validation_session_id)
    session["answers"].append({
        "skill": skill,
        "question": question_text,
        "answer": answer_text,
        "cheat_signals": cheat_signals,
        "score": score,
        "cheat_score": {
            "risk_score": cheat_score.risk_score,
            "risk_level": cheat_score.risk_level,
            "flags": cheat_score.flags,
        },
    })
    session["skill_question_counts"][skill] = session["skill_question_counts"].get(skill, 0) + 1
    session["skill_scores"].setdefault(skill, []).append(score.get("confidence_score", 0))
    session["cheat_scores"].append(cheat_score)


def store_current_question(
    validation_session_id: str,
    skill: str,
    question: str,
    what_good_includes: list[str],
    red_flags: list[str],
    question_number: int,
) -> None:
    session = get_validation_session(validation_session_id)
    session["current_skill"] = skill
    session["current_question_number"] = question_number
    session["questions_asked"].append({
        "skill": skill,
        "question": question,
        "what_good_includes": what_good_includes,
        "red_flags": red_flags,
        "question_number": question_number,
    })


def get_current_question(validation_session_id: str) -> dict | None:
    session = get_validation_session(validation_session_id)
    if not session["questions_asked"]:
        return None
    return session["questions_asked"][-1]


def mark_complete(validation_session_id: str) -> None:
    get_validation_session(validation_session_id)["is_complete"] = True


def store_validation_result(validation_session_id: str, result: dict) -> None:
    get_validation_session(validation_session_id)["result"] = result


def get_stored_result(validation_session_id: str) -> dict | None:
    return get_validation_session(validation_session_id).get("result")
