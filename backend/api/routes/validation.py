import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Response
from pydantic import BaseModel, Field

from api.deps import get_country_config
from modules.skills_engine.extractor import extract_explicit_skills
from modules.skills_engine.esco_mapper import map_skills_to_esco
from modules.skills_engine.profile_builder import build_profile
from modules.validation import session_store
from modules.validation.document_parser import parse_document
from modules.validation.skill_validator import (
    generate_question, score_answer, select_next_skill, estimate_total_questions
)
from modules.validation.cheat_detector import calculate_cheat_score, aggregate_session_cheat_score, CheatSignals
from modules.validation.voice_processor import transcribe_voice_answer
from modules.validation.bedrock_client import synthesize_speech
from modules.skills_engine.hidden_skills import infer_hidden_skills

router = APIRouter(prefix="/api/v1/validation", tags=["validation"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# Keywords that indicate a sentence is about HOW/WHERE someone learned, not about applying the skill.
_LEARNING_SOURCE_WORDS = {
    "youtube", "udemy", "coursera", "edx", "linkedin learning", "skillshare",
    "google", "tutorial", "tutorials", "course", "courses", "online course",
    "learned from", "learnt from", "watched", "video", "videos", "self-taught",
    "self taught", "book", "textbook", "college", "university", "school",
    "training programme", "training program", "bootcamp", "boot camp",
}


def _strip_learning_source_sentences(text: str) -> str:
    """Remove sentences that only describe where/how a skill was learned."""
    import re
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    kept = []
    for s in sentences:
        s_lower = s.lower()
        if any(kw in s_lower for kw in _LEARNING_SOURCE_WORDS):
            continue
        kept.append(s)
    return " ".join(kept)


# ── Pydantic Models ──────────────────────────────────────────────────────────

class StartInterviewRequest(BaseModel):
    session_id: str
    claimed_skills: list[str] = Field(min_length=1, max_length=20)
    country_code: str
    # Optional skill evidence from intake: {skill_name: evidence_string}
    skill_evidence: dict[str, str] = Field(default_factory=dict)


class StartInterviewResponse(BaseModel):
    validation_session_id: str
    first_question: str
    skill_being_tested: str
    question_number: int
    total_questions: int
    estimated_duration_minutes: int
    claimed_skills: list[str] = Field(default_factory=list)


class CheatSignalsInput(BaseModel):
    tab_switches: int = Field(ge=0, default=0)
    focus_losses: int = Field(ge=0, default=0)
    paste_events: int = Field(ge=0, default=0)
    answer_time_ms: int = Field(ge=0, default=0)
    gaze_away_seconds: float = Field(ge=0.0, default=0.0)


class SubmitAnswerRequest(BaseModel):
    validation_session_id: str
    answer_text: str = Field(min_length=1, max_length=5000)
    cheat_signals: CheatSignalsInput


class SkillMapEntry(BaseModel):
    skill: str
    avg_score: int
    questions_asked: int
    verdict: str  # PENDING | TESTING | STRONG | ADEQUATE | WEAK | FAIL
    tone_confidence: Optional[int] = None


class SubmitAnswerResponse(BaseModel):
    next_question: Optional[str]
    skill_being_tested: Optional[str]
    question_number: int
    total_questions: int
    is_complete: bool
    progress_pct: int
    current_skill_running_score: Optional[int]
    skill_map: list[SkillMapEntry] = Field(default_factory=list)
    just_scored_skill: Optional[str] = None
    just_scored_verdict: Optional[str] = None
    terminated_early: bool = False  # True when 5 consecutive fails triggered early end


class SkillScoreResult(BaseModel):
    skill: str
    confidence: int
    verdict: str
    questions_asked: int
    avg_score: int


class ValidationCertificate(BaseModel):
    certificate_id: str
    issued_at: str
    subject: str
    verdict_summary: str
    integrity_note: str
    version: str


class HiddenSkillResult(BaseModel):
    skill: str
    source_activity: str
    confidence: float
    category: str = "domain"


class ValidationResult(BaseModel):
    validation_session_id: str
    skill_scores: list[SkillScoreResult]
    overall_verdict: str
    cheat_risk_score: int
    cheat_risk_level: str
    certificate: ValidationCertificate
    generated_at: str
    hidden_skills: list[HiddenSkillResult] = Field(default_factory=list)


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


# ── Flow A: Document Upload ──────────────────────────────────────────────────

@router.post("/upload-document")
async def upload_document(
    file: UploadFile = File(...),
    country_code: str = Form(...),
    session_id: str = Form(default=""),
):
    config = get_country_config(country_code)

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")

    try:
        parsed = parse_document(content, file.filename or "upload", file.content_type or "")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if not parsed["extraction_ok"]:
        msg = parsed.get("warning") or "Could not extract readable text from this document."
        raise HTTPException(status_code=422, detail=msg)

    sid = session_id or str(uuid.uuid4())
    extracted_text = parsed["text"]

    explicit_result = extract_explicit_skills(extracted_text)
    mapped_skills = map_skills_to_esco(explicit_result["explicit_skills"])

    profile = build_profile(
        session_id=sid,
        explicit_skills=mapped_skills,
        hidden_skills=[],
        summary=explicit_result["summary"],
        config=config,
        transcript=extracted_text,
    )
    profile["source"] = "document_upload"
    profile["doc_type"] = parsed["doc_type"]
    return profile


# ── Flow B: Validation Interview ─────────────────────────────────────────────

@router.post("/interview/start", response_model=StartInterviewResponse)
def start_interview(req: StartInterviewRequest):
    config = get_country_config(req.country_code)

    claimed = [s.strip() for s in req.claimed_skills if s.strip()]
    if not claimed:
        raise HTTPException(status_code=400, detail="At least one claimed skill is required.")

    # Try to load intake evidence for this session to ground questions in real data
    skill_evidence: dict[str, str] = dict(req.skill_evidence)
    if req.session_id:
        try:
            from modules.skills_engine.intake import get_session
            intake_sess = get_session(req.session_id)
            if intake_sess:
                for qa in intake_sess.get("transcript", []):
                    answer_text = qa.get("answer", "")
                    if not answer_text:
                        continue
                    for skill in claimed:
                        if skill.lower() in answer_text.lower():
                            existing = skill_evidence.get(skill, "")
                            skill_evidence[skill] = (existing + " " + answer_text).strip()[:400]
        except Exception:
            pass

    vs = session_store.create_validation_session(
        original_session_id=req.session_id or None,
        claimed_skills=claimed,
        country_code=req.country_code,
    )
    # Store skill evidence in session for use in subsequent questions
    vs["skill_evidence"] = skill_evidence

    vid = vs["validation_session_id"]
    first_skill = claimed[0]
    total_questions = len(claimed) * 2  # initial estimate; grows adaptively

    q_data = generate_question(
        skill=first_skill,
        question_number=1,
        total_questions=total_questions,
        country_config=config,
        previous_qa=[],
        skill_evidence=skill_evidence.get(first_skill),
    )
    session_store.store_current_question(
        vid, first_skill, q_data["question"],
        q_data.get("what_a_good_answer_includes", []),
        q_data.get("red_flags", []),
        question_number=1,
    )

    return StartInterviewResponse(
        validation_session_id=vid,
        first_question=q_data["question"],
        skill_being_tested=first_skill,
        question_number=1,
        total_questions=total_questions,
        estimated_duration_minutes=max(2, total_questions * 2),
        claimed_skills=claimed,
    )


def _build_skill_map(vs: dict, current_skill: str, next_skill: Optional[str]) -> list[SkillMapEntry]:
    entries = []
    for s in vs["claimed_skills"]:
        scores = vs["skill_scores"].get(s, [])
        count = vs["skill_question_counts"].get(s, 0)
        if scores:
            avg = int(sum(scores) / len(scores))
            if avg >= 90:   verdict = "STRONG"
            elif avg >= 70: verdict = "ADEQUATE"
            elif avg >= 50: verdict = "WEAK"
            else:           verdict = "FAIL"
        else:
            avg = 0
            verdict = "TESTING" if s == next_skill else "PENDING"
        entries.append(SkillMapEntry(skill=s, avg_score=avg, questions_asked=count, verdict=verdict))
    return entries


@router.post("/interview/answer", response_model=SubmitAnswerResponse)
def submit_answer(req: SubmitAnswerRequest):
    try:
        vs = session_store.get_validation_session(req.validation_session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if vs["is_complete"]:
        raise HTTPException(status_code=400, detail="Interview already complete.")

    current_q = session_store.get_current_question(req.validation_session_id)
    if not current_q:
        raise HTTPException(status_code=400, detail="No active question found.")

    skill = current_q["skill"]
    question = current_q["question"]

    # Score the answer — pass recent conversation so scorer has context
    conversation_history = [
        {"question": a["question"], "answer": a.get("answer", "")}
        for a in vs["answers"][-3:]
    ]
    score = score_answer(
        skill=skill,
        question=question,
        answer=req.answer_text,
        what_a_good_answer_includes=current_q.get("what_good_includes", []),
        red_flags=current_q.get("red_flags", []),
        conversation_history=conversation_history,
    )

    # Incorporate gaze_away_seconds into cheat signals
    cheat_signals = CheatSignals(
        tab_switches=req.cheat_signals.tab_switches,
        focus_losses=req.cheat_signals.focus_losses,
        paste_events=req.cheat_signals.paste_events,
        answer_time_ms=req.cheat_signals.answer_time_ms,
    )
    cheat = calculate_cheat_score(cheat_signals)
    # Boost cheat score for gaze away
    gaze_secs = req.cheat_signals.gaze_away_seconds
    if gaze_secs >= 10:
        cheat.risk_score = min(100, cheat.risk_score + 40)
        cheat.flags.append(f"Camera: looked away {gaze_secs:.0f}s")
    elif gaze_secs >= 5:
        cheat.risk_score = min(100, cheat.risk_score + 20)
        cheat.flags.append(f"Camera: looked away {gaze_secs:.0f}s")
    elif gaze_secs >= 3:
        cheat.risk_score = min(100, cheat.risk_score + 10)
        cheat.flags.append(f"Camera: looked away {gaze_secs:.0f}s")

    session_store.record_answer(
        validation_session_id=req.validation_session_id,
        question_text=question,
        skill=skill,
        answer_text=req.answer_text,
        cheat_signals=req.cheat_signals.model_dump(),
        score=score,
        cheat_score=cheat,
    )

    total_answered = len(vs["answers"])
    skill_evidence = vs.get("skill_evidence", {})

    skill_scores_so_far = vs["skill_scores"].get(skill, [])
    running_score = int(sum(skill_scores_so_far) / len(skill_scores_so_far)) if skill_scores_so_far else None

    # Global early-termination: 5 consecutive wrong answers (score < 40) → end interview
    CONSEC_FAIL_LIMIT = 5
    recent_scores = [a["score"].get("confidence_score", 0) for a in vs["answers"][-CONSEC_FAIL_LIMIT:]]
    if len(recent_scores) >= CONSEC_FAIL_LIMIT and all(s < 40 for s in recent_scores):
        session_store.mark_complete(req.validation_session_id)
        return SubmitAnswerResponse(
            next_question=None,
            skill_being_tested=None,
            question_number=total_answered,
            total_questions=total_answered,
            is_complete=True,
            progress_pct=100,
            current_skill_running_score=running_score,
            skill_map=_build_skill_map(vs, skill, None),
            just_scored_skill=skill,
            just_scored_verdict=score.get("verdict"),
            terminated_early=True,
        )

    # Adaptive total: re-estimate based on current performance
    total_questions = estimate_total_questions(
        vs["claimed_skills"],
        vs["skill_question_counts"],
        vs["skill_scores"],
    )
    progress_pct = min(99, int((total_answered / total_questions) * 100))

    config = get_country_config(vs["country_code"])
    next_skill = select_next_skill(
        claimed_skills=vs["claimed_skills"],
        skill_question_counts=vs["skill_question_counts"],
        skill_scores=vs["skill_scores"],
    )

    if next_skill is None:
        session_store.mark_complete(req.validation_session_id)
        return SubmitAnswerResponse(
            next_question=None,
            skill_being_tested=None,
            question_number=total_answered,
            total_questions=total_answered,
            is_complete=True,
            progress_pct=100,
            current_skill_running_score=running_score,
            skill_map=_build_skill_map(vs, skill, None),
            just_scored_skill=skill,
            just_scored_verdict=score.get("verdict"),
        )

    next_q_num = total_answered + 1
    # Pass full Q+A so the generator can build correlated follow-up questions
    previous_qa = [
        {"question": a["question"], "answer": a.get("answer", ""), "skill": a["skill"]}
        for a in vs["answers"][-4:]
    ]
    next_q_data = generate_question(
        skill=next_skill,
        question_number=next_q_num,
        total_questions=total_questions,
        country_config=config,
        previous_qa=previous_qa,
        skill_evidence=skill_evidence.get(next_skill),
    )
    session_store.store_current_question(
        req.validation_session_id,
        next_skill,
        next_q_data["question"],
        next_q_data.get("what_a_good_answer_includes", []),
        next_q_data.get("red_flags", []),
        question_number=next_q_num,
    )

    return SubmitAnswerResponse(
        next_question=next_q_data["question"],
        skill_being_tested=next_skill,
        question_number=next_q_num,
        total_questions=total_questions,
        is_complete=False,
        progress_pct=progress_pct,
        current_skill_running_score=running_score,
        skill_map=_build_skill_map(vs, skill, next_skill),
        just_scored_skill=skill,
        just_scored_verdict=score.get("verdict"),
    )


@router.get("/interview/result/{validation_session_id}", response_model=ValidationResult)
def get_result(validation_session_id: str):
    try:
        vs = session_store.get_validation_session(validation_session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if not vs["is_complete"]:
        raise HTTPException(status_code=400, detail="Interview is not yet complete.")

    cached = session_store.get_stored_result(validation_session_id)
    if cached:
        return cached

    session_cheat = aggregate_session_cheat_score(vs["cheat_scores"])

    skill_scores: list[SkillScoreResult] = []
    verified_skills: list[str] = []

    for skill in vs["claimed_skills"]:
        scores = vs["skill_scores"].get(skill, [])
        questions_asked = vs["skill_question_counts"].get(skill, 0)
        avg = int(sum(scores) / len(scores)) if scores else 0

        if avg >= 70:
            verdict = "VERIFIED"
            verified_skills.append(skill)
        elif avg >= 40:
            verdict = "PARTIAL"
        else:
            verdict = "UNVERIFIED"

        skill_scores.append(SkillScoreResult(
            skill=skill, confidence=avg, verdict=verdict,
            questions_asked=questions_asked, avg_score=avg,
        ))

    verdicts = [s.verdict for s in skill_scores]
    if session_cheat.risk_level == "CRITICAL":
        overall = "UNVERIFIED"
    elif all(v == "VERIFIED" for v in verdicts):
        overall = "VERIFIED"
    elif any(v == "UNVERIFIED" for v in verdicts):
        overall = "UNVERIFIED"
    else:
        overall = "PARTIAL"

    # Infer hidden skills from all interview answers combined as a transcript
    answer_transcript = "\n\n".join(
        f"Q: {a['question']}\nA: {a['answer']}"
        for a in vs.get("answers", [])
        if a.get("answer", "").strip()
    )
    config = get_country_config(vs["country_code"])
    try:
        raw_hidden = infer_hidden_skills(answer_transcript, config)
        # Exclude any skill that the candidate explicitly claimed
        claimed_lower = {s.lower() for s in vs["claimed_skills"]}
        hidden_skills_list = [
            HiddenSkillResult(
                skill=h["skill"],
                source_activity=h.get("source_activity", ""),
                confidence=h["confidence"],
                category=h.get("category", "domain"),
            )
            for h in raw_hidden
            if h["skill"].lower() not in claimed_lower
        ]
    except Exception:
        hidden_skills_list = []

    cert = ValidationCertificate(
        certificate_id=str(uuid.uuid4()),
        issued_at=datetime.utcnow().isoformat() + "Z",
        subject=", ".join(verified_skills) if verified_skills else "No skills verified",
        verdict_summary=f"{overall}: {len(verified_skills)} of {len(vs['claimed_skills'])} skills verified.",
        integrity_note=f"Session integrity: {session_cheat.risk_level} risk (score {session_cheat.risk_score}/100).",
        version="1.0",
    )

    result = ValidationResult(
        validation_session_id=validation_session_id,
        skill_scores=skill_scores,
        overall_verdict=overall,
        cheat_risk_score=session_cheat.risk_score,
        cheat_risk_level=session_cheat.risk_level,
        certificate=cert,
        generated_at=datetime.utcnow().isoformat() + "Z",
        hidden_skills=hidden_skills_list,
    )

    session_store.store_validation_result(validation_session_id, result.model_dump())
    return result


@router.post("/interview/transcribe")
async def transcribe_audio_endpoint(
    audio: UploadFile = File(...),
    validation_session_id: str = Form(...),
):
    audio_bytes = await audio.read()
    result = await transcribe_voice_answer(audio_bytes, audio.content_type or "audio/webm")
    return {**result, "validation_session_id": validation_session_id}


@router.post("/interview/speak")
async def speak_question(req: SpeakRequest):
    """Convert question text to speech audio. Returns MP3 bytes."""
    audio_bytes = synthesize_speech(req.text)
    if not audio_bytes:
        raise HTTPException(status_code=503, detail="TTS service unavailable")
    return Response(content=audio_bytes, media_type="audio/mpeg")
