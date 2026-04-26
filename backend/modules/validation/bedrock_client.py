"""
AWS Bedrock client using boto3 Converse API.
All LLM and vision calls go through Bedrock — no OpenRouter.
"""
import io
import os
import boto3

LLM_MODEL    = "amazon.nova-lite-v1:0"
VISION_MODEL = "us.amazon.nova-pro-v1:0"

_bedrock_runtime = None


def _get_bedrock():
    global _bedrock_runtime
    if _bedrock_runtime is None:
        _bedrock_runtime = boto3.client(
            "bedrock-runtime",
            region_name=os.environ.get("AWS_REGION", "us-east-1"),
            aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        )
    return _bedrock_runtime


def _openai_to_converse(messages: list) -> tuple[list, list]:
    """Convert OpenAI-style messages to Bedrock Converse format. Returns (system, messages)."""
    system = []
    converse_msgs = []
    for m in messages:
        if m["role"] == "system":
            system.append({"text": m["content"]})
        else:
            content = m["content"]
            if isinstance(content, str):
                converse_msgs.append({"role": m["role"], "content": [{"text": content}]})
            else:
                converse_msgs.append({"role": m["role"], "content": content})
    return system, converse_msgs


def _strip_fences(text: str) -> str:
    """Strip markdown code fences that models sometimes wrap JSON in."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
    return text.strip()


def chat_complete(messages: list, temperature: float = 0.3, **kwargs) -> str:
    """Send a chat completion via Bedrock. Returns text with markdown fences stripped."""
    system, converse_msgs = _openai_to_converse(messages)
    params = dict(
        modelId=LLM_MODEL,
        messages=converse_msgs,
        inferenceConfig={"temperature": temperature, "maxTokens": 4096},
    )
    if system:
        params["system"] = system
    resp = _get_bedrock().converse(**params)
    return _strip_fences(resp["output"]["message"]["content"][0]["text"])


def vision_ocr(image_bytes: bytes) -> str:
    """Extract text from an image using Claude 3.5 Sonnet vision on Bedrock."""
    try:
        resp = _get_bedrock().converse(
            modelId=VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"image": {"format": "png", "source": {"bytes": image_bytes}}},
                    {"text": "Extract all text visible in this image exactly as it appears. Include all labels, headings, bullet points, and body text. Output plain text only, no commentary."},
                ],
            }],
            inferenceConfig={"temperature": 0.1, "maxTokens": 4096},
        )
        return resp["output"]["message"]["content"][0]["text"]
    except Exception as e:
        print(f"[vision_ocr ERROR] {type(e).__name__}: {e}")
        return ""


def transcribe_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
    from openai import OpenAI
    extension = "webm"
    if "ogg" in mime_type:   extension = "ogg"
    elif "mp4" in mime_type: extension = "mp4"
    elif "wav" in mime_type: extension = "wav"

    filename   = f"recording.{extension}"
    audio_file = (filename, io.BytesIO(audio_bytes), mime_type)
    try:
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
        )
        result = client.audio.transcriptions.create(
            model="openai/whisper-large-v3", file=audio_file,
        )
        return result.text or ""
    except Exception as e:
        print(f"[transcribe_audio ERROR] {type(e).__name__}: {e}")
        return ""


def synthesize_speech(text: str) -> bytes:
    from openai import OpenAI
    try:
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
        )
        response = client.audio.speech.create(
            model="openai/tts-1", input=text, voice="alloy", response_format="mp3",
        )
        return response.content or b""
    except Exception as e:
        print(f"[synthesize_speech ERROR] {type(e).__name__}: {e}")
        return b""


def get_llm_client():
    """Legacy shim — raises to force callers to use chat_complete() instead."""
    raise RuntimeError("get_llm_client() is removed. Use chat_complete() from bedrock_client.")
