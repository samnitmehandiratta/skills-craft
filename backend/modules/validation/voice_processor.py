"""
Voice processing: receives WebM/Opus audio bytes, transcribes to text.
Uses bedrock_client.transcribe_audio() with automatic fallback.
"""
from modules.validation.bedrock_client import transcribe_audio


async def transcribe_voice_answer(audio_bytes: bytes, mime_type: str = "audio/webm") -> dict:
    """
    Transcribes audio bytes to text. Never raises.

    Returns:
        {transcript, char_count, transcription_source, ok}
    """
    if not audio_bytes:
        return {"transcript": "", "char_count": 0, "transcription_source": "failed", "ok": False}

    try:
        text = transcribe_audio(audio_bytes, mime_type)
        if text:
            return {"transcript": text, "char_count": len(text), "transcription_source": "bedrock_or_openrouter", "ok": True}
        return {"transcript": "", "char_count": 0, "transcription_source": "failed", "ok": False}
    except Exception:
        return {"transcript": "", "char_count": 0, "transcription_source": "failed", "ok": False}
