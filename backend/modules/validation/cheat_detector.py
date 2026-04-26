"""
Cheat detection scoring based on browser-collected behavioral signals.
Pure Python — no LLM, no external calls.
"""
from dataclasses import dataclass, field


@dataclass
class CheatSignals:
    tab_switches: int = 0
    focus_losses: int = 0
    paste_events: int = 0
    answer_time_ms: int = 0


@dataclass
class CheatScore:
    risk_score: int
    risk_level: str
    flags: list[str] = field(default_factory=list)
    per_signal_scores: dict = field(default_factory=dict)


_TAB_THRESHOLDS = [(3, 50, "Left tab 3+ times — high lookup risk"), (2, 30, "Left tab twice — possible lookup"), (1, 15, "Left tab once during answer")]
_FOCUS_THRESHOLDS = [(6, 35, "Excessive focus loss"), (4, 20, "Repeated focus loss — possible alt-tab to resource"), (2, 10, "Window lost focus briefly")]
_PASTE_THRESHOLDS = [(2, 55, "Multiple pastes — strong copy-paste signal"), (1, 30, "Text was pasted — possible copy from external source")]
_TOO_FAST_MS = 4_000
_TOO_SLOW_MS = 300_000


def calculate_cheat_score(signals: CheatSignals) -> CheatScore:
    total = 0
    flags = []
    per_signal: dict[str, int] = {}

    # Tab switches
    for threshold, points, flag in _TAB_THRESHOLDS:
        if signals.tab_switches >= threshold:
            total += points
            flags.append(flag)
            per_signal["tab_switches"] = points
            break

    # Focus losses
    for threshold, points, flag in _FOCUS_THRESHOLDS:
        if signals.focus_losses >= threshold:
            total += points
            flags.append(flag)
            per_signal["focus_losses"] = points
            break

    # Paste events
    for threshold, points, flag in _PASTE_THRESHOLDS:
        if signals.paste_events >= threshold:
            total += points
            flags.append(flag)
            per_signal["paste_events"] = points
            break

    # Answer timing
    if signals.answer_time_ms > 0 and signals.answer_time_ms < _TOO_FAST_MS:
        total += 25
        flags.append("Answer in under 4s — possibly pre-prepared")
        per_signal["answer_time_ms"] = 25
    elif signals.answer_time_ms > _TOO_SLOW_MS:
        total += 10
        flags.append("Answer took 5+ min — possible external research")
        per_signal["answer_time_ms"] = 10

    risk_score = min(total, 100)
    risk_level = _risk_level(risk_score)

    return CheatScore(risk_score=risk_score, risk_level=risk_level, flags=flags, per_signal_scores=per_signal)


def _risk_level(score: int) -> str:
    if score <= 20:
        return "LOW"
    if score <= 45:
        return "MEDIUM"
    if score <= 70:
        return "HIGH"
    return "CRITICAL"


def aggregate_session_cheat_score(per_answer_scores: list[CheatScore]) -> CheatScore:
    if not per_answer_scores:
        return CheatScore(risk_score=0, risk_level="LOW")

    base = max(s.risk_score for s in per_answer_scores)
    high_count = sum(1 for s in per_answer_scores if s.risk_level in ("HIGH", "CRITICAL"))
    frequency_bonus = min(high_count * 5, 20)
    final_score = min(base + frequency_bonus, 100)

    all_flags = []
    seen = set()
    for s in per_answer_scores:
        for f in s.flags:
            if f not in seen:
                all_flags.append(f)
                seen.add(f)

    return CheatScore(risk_score=final_score, risk_level=_risk_level(final_score), flags=all_flags)
