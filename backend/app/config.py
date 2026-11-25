"""Settings come from environment variables, optionally loaded from backend/.env (via python-dotenv)."""
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from dotenv import load_dotenv

# Resolve .env relative to the backend folder so `uvicorn` works from any working directory.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


@dataclass
class Settings:
    supabase_url: str
    supabase_key: str                      # service_role key (server-side only)
    supabase_jwt_secret: str = ""          # optional: enables fast local token verification
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    google_maps_api_key: str = ""
    firebase_credentials: str = ""
    tesseract_langs: str = "eng"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


def load_settings(env: Mapping[str, str] = os.environ) -> Settings:
    def get(*names: str, default: str = "") -> str:
        for n in names:
            v = (env.get(n) or "").strip()
            if v:
                return v
        return default

    url = get("SUPABASE_URL").rstrip("/")
    key = get("SUPABASE_KEY", "SUPABASE_SERVICE_KEY")  # old name still accepted
    missing = [n for n, v in (("SUPABASE_URL", url), ("SUPABASE_KEY", key)) if not v]
    if missing:
        raise RuntimeError(
            f"Missing required setting(s): {', '.join(missing)}. "
            "Copy backend/.env.example to backend/.env and fill them in (see README, step 2)."
        )
    return Settings(
        supabase_url=url, supabase_key=key, supabase_jwt_secret=get("SUPABASE_JWT_SECRET"),
        gemini_api_key=get("GEMINI_API_KEY"), gemini_model=get("GEMINI_MODEL", default="gemini-2.5-flash"),
        google_maps_api_key=get("GOOGLE_MAPS_API_KEY"), firebase_credentials=get("FIREBASE_CREDENTIALS"),
        tesseract_langs=get("TESSERACT_LANGS", default="eng"),
        cors_origins=get("CORS_ORIGINS", default="http://localhost:5173,http://127.0.0.1:5173"),
    )


settings = load_settings()
