"""
Manages the conversational intake flow — 5 questions to build a rich narrative.
Session state is held in memory (dict keyed by session_id).
"""
import uuid
from config.schema import CountryConfig

# In-memory session store
_sessions: dict[str, dict] = {}
# Profiles from validation-flow sessions (no full intake session required)
_profiles: dict[str, dict] = {}

QUESTIONS = [
    "What do you spend most of your time doing each day? Tell me about your work or main activities.",
    "What skills or things have you learned on your own — without formal training or school?",
    "What languages do you speak, and which do you use for work or business?",
    "Have you ever taught someone else how to do something, helped run a group, or organized people around a task?",
    "What tools, technology, or equipment do you use regularly — even if it seems basic?",
]


def start_session(country_code: str, language: str) -> dict:
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "session_id": session_id,
        "country_code": country_code,
        "language": language,
        "turn": 0,
        "transcript": [],
        "is_complete": False,
    }
    return {
        "session_id": session_id,
        "first_question": QUESTIONS[0],
        "total_questions": len(QUESTIONS),
    }


def respond(session_id: str, user_message: str) -> dict:
    if session_id not in _sessions:
        raise ValueError(f"Session {session_id} not found")

    session = _sessions[session_id]
    current_turn = session["turn"]

    session["transcript"].append({
        "question": QUESTIONS[current_turn],
        "answer": user_message.strip(),
    })
    session["turn"] += 1

    next_turn = session["turn"]
    if next_turn >= len(QUESTIONS):
        session["is_complete"] = True
        return {
            "session_id": session_id,
            "next_question": None,
            "is_complete": True,
            "turn": next_turn,
            "total_questions": len(QUESTIONS),
        }

    return {
        "session_id": session_id,
        "next_question": QUESTIONS[next_turn],
        "is_complete": False,
        "turn": next_turn,
        "total_questions": len(QUESTIONS),
    }


def get_transcript(session_id: str) -> str:
    if session_id not in _sessions:
        raise ValueError(f"Session {session_id} not found")
    session = _sessions[session_id]
    parts = []
    for item in session["transcript"]:
        parts.append(f"Q: {item['question']}\nA: {item['answer']}")
    return "\n\n".join(parts)


def get_session(session_id: str) -> dict:
    if session_id not in _sessions:
        raise ValueError(f"Session {session_id} not found")
    return _sessions[session_id]


def store_profile(session_id: str, profile: dict) -> None:
    if session_id in _sessions:
        _sessions[session_id]["profile"] = profile
    else:
        # Validation-flow sessions have no intake entry — store separately
        _profiles[session_id] = profile


def get_stored_profile(session_id: str) -> dict | None:
    if session_id in _sessions:
        return _sessions[session_id].get("profile")
    return _profiles.get(session_id)
