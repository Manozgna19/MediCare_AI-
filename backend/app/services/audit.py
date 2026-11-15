import logging
from ..db import sb

log = logging.getLogger("audit")


def record(uid: str, action: str, detail: dict | None = None) -> None:
    """Best-effort audit trail for sensitive actions. Never blocks the user's request."""
    try:
        sb.table("audit_log").insert({"user_id": uid, "action": action, "detail": detail or {}}).execute()
    except Exception:
        log.exception("audit write failed for %s", action)
