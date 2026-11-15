from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..db import sb, one
from ..deps import get_user_id
from ..services import safety, interactions, scoring

router = APIRouter(tags=["profile"])


class ProfileIn(BaseModel):
    full_name: str | None = None
    age: int | None = None
    sex: str | None = None
    blood_group: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    smoker: bool | None = None
    waist_cm: float | None = None
    activity_level: str | None = None
    allergies: list[str] | None = None
    conditions: list[str] | None = None
    language: str | None = None
    ai_consent: dict | None = None


@router.get("/profile")
def get_profile(uid: str = Depends(get_user_id)):
    prof = one(sb.table("profiles").select("*").eq("id", uid).maybe_single())
    n = len(sb.table("emergency_contacts").select("id").eq("user_id", uid).execute().data)
    return {**prof, "completeness": scoring.completeness(prof, n)}


@router.put("/profile")
def put_profile(p: ProfileIn, uid: str = Depends(get_user_id)):
    data = {k: v for k, v in p.model_dump().items() if v is not None}
    return sb.table("profiles").upsert({"id": uid, **data}).execute().data[0]


class MedIn(BaseModel):
    name: str
    dose: str = ""
    frequency: str = ""
    reminder_times: list[datetime] = []  # first occurrence of each daily dose, ISO with timezone


@router.get("/medications")
def meds(uid: str = Depends(get_user_id)):
    return sb.table("medications").select("*").eq("user_id", uid).order("created_at", desc=True).execute().data


@router.post("/medications")
def add_med(m: MedIn, uid: str = Depends(get_user_id)):
    row = sb.table("medications").insert({"user_id": uid, "name": m.name, "dose": m.dose, "frequency": m.frequency}).execute().data[0]
    for t in m.reminder_times:
        sb.table("reminders").insert({
            "user_id": uid, "kind": "medication", "title": f"Take {m.name}", "body": m.dose or "Time for your medicine.",
            "remind_at": t.astimezone(timezone.utc).isoformat(), "recurrence": "daily", "ref_id": row["id"]}).execute()
    prof = one(sb.table("profiles").select("allergies").eq("id", uid).maybe_single())
    others = [x["name"] for x in sb.table("medications").select("id,name").eq("user_id", uid).eq("active", True).execute().data if x["id"] != row["id"]]
    return {**row, "warnings": safety.allergy_conflicts(m.name, prof.get("allergies") or []), "interactions": interactions.check_new(m.name, others)}


@router.get("/medications/interactions")
def med_interactions(uid: str = Depends(get_user_id)):
    names = [x["name"] for x in sb.table("medications").select("name").eq("user_id", uid).eq("active", True).execute().data]
    return interactions.check(names)


@router.patch("/medications/{mid}/stop")
def stop_med(mid: str, uid: str = Depends(get_user_id)):
    sb.table("medications").update({"active": False}).eq("id", mid).eq("user_id", uid).execute()
    sb.table("reminders").delete().eq("user_id", uid).eq("ref_id", mid).execute()
    return {"ok": True}
