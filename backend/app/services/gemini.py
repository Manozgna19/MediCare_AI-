import json
import logging
import re
from fastapi import HTTPException
from google import genai
from google.genai import types
from ..config import settings

client = genai.Client(api_key=settings.gemini_api_key) if settings.gemini_api_key else None
log = logging.getLogger(__name__)

SAFETY_PREAMBLE = (
    "You are MediCare AI, a health-information assistant. You are NOT a doctor. "
    "Never give a definitive diagnosis or prescribe. Give general educational guidance, "
    "mention uncertainty, and advise seeing a clinician for anything persistent or worrying. "
    "If the user describes chest pain, trouble breathing, stroke signs, severe bleeding, "
    "suicidal thoughts, or other emergencies, tell them to call emergency services (112 in India) "
    "or use the SOS button immediately."
)


def generate(prompt: str, system: str = "", language: str = "en", json_mode: bool = False) -> str:
    cfg = types.GenerateContentConfig(
        system_instruction=f"{SAFETY_PREAMBLE}\nRespond in language code: {language}.\n{system}",
        temperature=0.3,
        response_mime_type="application/json" if json_mode else "text/plain",
    )
    if client is None:
        raise HTTPException(503, "AI features need GEMINI_API_KEY in backend/.env.")
    try:
        resp = client.models.generate_content(model=settings.gemini_model, contents=prompt, config=cfg)
    except Exception:
        log.exception("Gemini call failed")
        raise HTTPException(503, "The AI service is busy. Please try again in a moment.")
    return resp.text or ""


def generate_json(prompt: str, system: str = "", language: str = "en") -> dict:
    raw = generate(prompt, system, language, json_mode=True)
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"error": "model_returned_invalid_json", "raw": raw}
