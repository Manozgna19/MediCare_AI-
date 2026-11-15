import hashlib
import threading
import time
from collections import defaultdict, deque
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

AI_PATHS = ("/api/chat", "/api/symptoms/check", "/api/reports/scan")
_hits: dict = defaultdict(deque)
_lock = threading.Lock()


def reset() -> None:
    with _lock:
        _hits.clear()


class RateLimit(BaseHTTPMiddleware):
    """Sliding-window limiter. In-memory = per process; use Redis if you run several replicas."""

    def __init__(self, app, default_per_min: int = 120, ai_per_min: int = 15):
        super().__init__(app)
        self.default, self.ai = default_per_min, ai_per_min

    async def dispatch(self, request, call_next):
        if request.method == "OPTIONS" or request.url.path == "/health":
            return await call_next(request)
        auth = request.headers.get("authorization")
        ident = hashlib.sha256(auth.encode()).hexdigest()[:16] if auth else (request.client.host if request.client else "anon")
        is_ai = request.url.path.startswith(AI_PATHS)
        limit = self.ai if is_ai else self.default
        now = time.monotonic()
        with _lock:
            q = _hits[(ident, is_ai)]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= limit:
                retry = int(60 - (now - q[0])) + 1
                return JSONResponse({"detail": f"Too many requests. Try again in {retry} seconds."}, status_code=429, headers={"Retry-After": str(retry)})
            q.append(now)
            if len(_hits) > 20000:
                for k in [k for k, v in _hits.items() if not v]:
                    del _hits[k]
        return await call_next(request)


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith("/api"):
            resp.headers["Cache-Control"] = "no-store"  # patient data must not be cached by proxies/browsers
        return resp
