import hashlib
import logging
import time

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .db import sb

bearer = HTTPBearer()
log = logging.getLogger(__name__)
_CACHE: dict[str, tuple[str, float]] = {}
_TTL_SECONDS = 60


def clear_cache() -> None:
    _CACHE.clear()


def _verify_locally(token: str) -> str | None:
    """Fast path: HS256 verification with the project's legacy JWT secret (only if configured)."""
    if not settings.supabase_jwt_secret:
        return None
    try:
        return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")["sub"]
    except (jwt.PyJWTError, KeyError):
        return None


def _verify_with_supabase(token: str) -> str | None:
    """Works for every Supabase signing-key type: ask Supabase Auth who this token belongs to (cached briefly)."""
    key = hashlib.sha256(token.encode()).hexdigest()
    hit = _CACHE.get(key)
    if hit and hit[1] > time.monotonic():
        return hit[0]
    try:
        user = getattr(sb.auth.get_user(token), "user", None)
    except Exception:
        log.info("Supabase rejected a token")
        return None
    if not user:
        return None
    if len(_CACHE) > 5000:
        _CACHE.clear()
    _CACHE[key] = (user.id, time.monotonic() + _TTL_SECONDS)
    return user.id


def get_user_id(cred: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
    """Return the signed-in user's UUID from the Supabase Auth access token, or 401."""
    uid = _verify_locally(cred.credentials) or _verify_with_supabase(cred.credentials)
    if not uid:
        raise HTTPException(401, "Invalid or expired session. Please sign in again.")
    return uid
