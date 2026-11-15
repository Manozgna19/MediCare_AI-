from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..db import sb
from ..deps import get_user_id
from ..services import audit

router = APIRouter(prefix="/privacy", tags=["privacy"])
TABLES = ["profiles", "medications", "symptom_checks", "reports", "family_history", "emergency_contacts",
          "sos_events", "appointments", "reminders", "vitals", "dose_logs", "chat_messages"]


@router.get("/export")
def export(uid: str = Depends(get_user_id)):
    """Everything we hold about the user, as JSON (data portability)."""
    out = {}
    for t in TABLES:
        col = "id" if t == "profiles" else "user_id"
        out[t] = sb.table(t).select("*").eq(col, uid).execute().data
    audit.record(uid, "data_export")
    return out


class Confirm(BaseModel):
    confirm: str


@router.delete("/account")
def delete_account(body: Confirm, uid: str = Depends(get_user_id)):
    if body.confirm != "DELETE":
        raise HTTPException(400, 'Type DELETE to confirm account deletion.')
    try:
        files = sb.storage.from_("reports").list(uid)
        if files:
            sb.storage.from_("reports").remove([f"{uid}/{f['name']}" for f in files])
    except Exception:
        pass  # storage cleanup is best-effort; DB rows cascade from auth.users below
    sb.auth.admin.delete_user(uid)
    return {"deleted": True}
