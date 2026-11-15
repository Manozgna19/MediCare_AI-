from datetime import datetime, timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from ..db import sb, one
from ..deps import get_user_id
from ..services import adherence
from ..services.util import now

router = APIRouter(prefix="/reminders", tags=["reminders"])


class ReminderIn(BaseModel):
    kind: str = "custom"  # medication | appointment | screening | custom
    title: str = Field(min_length=1, max_length=120)
    body: str = Field("", max_length=300)
    remind_at: datetime
    recurrence: Literal["none", "daily", "weekly", "yearly"] = "none"


@router.get("")
def list_reminders(uid: str = Depends(get_user_id)):
    return sb.table("reminders").select("*").eq("user_id", uid).order("remind_at").execute().data


@router.post("")
def create(r: ReminderIn, uid: str = Depends(get_user_id)):
    return sb.table("reminders").insert({**r.model_dump(mode="json"), "user_id": uid}).execute().data[0]


class Token(BaseModel):
    token: str


@router.post("/device-token")
def register_token(t: Token, uid: str = Depends(get_user_id)):
    sb.table("device_tokens").upsert({"user_id": uid, "token": t.token}, on_conflict="token").execute()
    return {"ok": True}


# ---- dose tracking ----
@router.get("/doses")
def doses(hours: int = 24, uid: str = Depends(get_user_id)):
    """Doses whose reminder has fired recently, plus what's due in the next 12 hours."""
    t = now()
    done = sb.table("dose_logs").select("*").eq("user_id", uid).gte("scheduled_for", (t - timedelta(hours=min(hours, 72))).isoformat()).order("scheduled_for").execute().data
    upcoming = sb.table("reminders").select("id,title,body,remind_at,ref_id").eq("user_id", uid).eq("kind", "medication").eq("sent", False).gte("remind_at", t.isoformat()).lte("remind_at", (t + timedelta(hours=12)).isoformat()).order("remind_at").execute().data
    return {"logged": [d for d in done if d["status"] != "snoozed"], "upcoming": upcoming}


class DoseStatus(BaseModel):
    status: Literal["taken", "skipped"]


@router.post("/doses/{dose_id}")
def mark_dose(dose_id: str, b: DoseStatus, uid: str = Depends(get_user_id)):
    rows = sb.table("dose_logs").update({"status": b.status, "logged_at": now().isoformat()}).eq("id", dose_id).eq("user_id", uid).execute().data
    if not rows:
        raise HTTPException(404, "Dose not found.")
    return rows[0]


class Snooze(BaseModel):
    minutes: int = Field(10, ge=5, le=120)


@router.post("/doses/{dose_id}/snooze")
def snooze(dose_id: str, b: Snooze, uid: str = Depends(get_user_id)):
    dose = one(sb.table("dose_logs").select("*").eq("id", dose_id).eq("user_id", uid).maybe_single())
    if not dose:
        raise HTTPException(404, "Dose not found.")
    sb.table("dose_logs").update({"status": "snoozed", "logged_at": now().isoformat()}).eq("id", dose_id).execute()
    return sb.table("reminders").insert({"user_id": uid, "kind": "medication", "title": f"Take {dose['title']}", "body": "Snoozed reminder",
                                         "remind_at": (now() + timedelta(minutes=b.minutes)).isoformat(), "recurrence": "none", "ref_id": dose.get("medication_id")}).execute().data[0]


@router.get("/adherence")
def get_adherence(days: int = 30, uid: str = Depends(get_user_id)):
    t = now()
    logs = sb.table("dose_logs").select("*").eq("user_id", uid).gte("scheduled_for", (t - timedelta(days=min(days, 90))).isoformat()).execute().data
    return adherence.compute(logs, t, days=min(days, 90))


# Age/sex-based general screening conversation starters; users should confirm with their clinician.
SCREENINGS = [
    ("Blood pressure check", 18, None, "yearly"), ("Blood sugar (HbA1c) check", 35, None, "yearly"),
    ("Cholesterol (lipid profile)", 35, None, "yearly"), ("Cervical cancer screening discussion", 25, "female", "yearly"),
    ("Breast screening discussion", 40, "female", "yearly"), ("Colorectal screening discussion", 45, None, "yearly"),
]


@router.post("/screenings/generate")
def generate_screenings(uid: str = Depends(get_user_id)):
    prof = one(sb.table("profiles").select("age,sex").eq("id", uid).maybe_single())
    age, sex = prof.get("age") or 0, (prof.get("sex") or "").lower()
    existing = {r["title"] for r in sb.table("reminders").select("title").eq("user_id", uid).eq("kind", "screening").execute().data}
    base = now() + timedelta(days=7)
    rows = [{"user_id": uid, "kind": "screening", "title": t, "body": "Ask your doctor whether this is due for you.", "remind_at": base.isoformat(), "recurrence": rec}
            for t, min_age, s, rec in SCREENINGS if age >= min_age and (s is None or s == sex) and t not in existing]
    if rows:
        sb.table("reminders").insert(rows).execute()
    return {"created": len(rows)}


@router.delete("/{rid}")
def delete(rid: str, uid: str = Depends(get_user_id)):
    sb.table("reminders").delete().eq("id", rid).eq("user_id", uid).execute()
    return {"ok": True}
