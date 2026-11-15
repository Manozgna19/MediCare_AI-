from datetime import timedelta, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from ..db import sb, one
from ..deps import get_user_id
from ..services.maps import haversine_km
from ..services.util import now, parse_ts

router = APIRouter(tags=["doctors"])


@router.get("/doctors")
def find(specialty: str | None = None, city: str | None = None, language: str | None = None, max_fee: int | None = None,
         min_rating: float | None = None, teleconsult: bool | None = None,
         sort: Literal["distance", "rating", "fee", "soonest"] = "distance",
         lat: float | None = None, lng: float | None = None, uid: str = Depends(get_user_id)):
    q = sb.table("doctors").select("*")
    if specialty: q = q.ilike("specialty", f"%{specialty}%")
    if city: q = q.ilike("city", f"%{city}%")
    docs = q.limit(200).execute().data
    if language: docs = [d for d in docs if any(language.lower() in l.lower() for l in d.get("languages") or [])]
    if max_fee is not None: docs = [d for d in docs if (d.get("fee_inr") or 0) <= max_fee]
    if min_rating is not None: docs = [d for d in docs if (d.get("rating") or 0) >= min_rating]
    if teleconsult: docs = [d for d in docs if d.get("teleconsult")]
    nxt: dict = {}
    ids = [d["id"] for d in docs]
    for i in range(0, len(ids), 50):  # chunk to keep the request URL short
        for s in sb.table("doctor_slots").select("doctor_id,starts_at").in_("doctor_id", ids[i:i + 50]).eq("booked", False).gte("starts_at", now().isoformat()).order("starts_at").limit(1000).execute().data:
            nxt.setdefault(s["doctor_id"], s["starts_at"])
    for d in docs:
        d["next_slot"] = nxt.get(d["id"])
        d["distance_km"] = round(haversine_km(lat, lng, d["lat"], d["lng"]), 1) if lat is not None and lng is not None and d.get("lat") else None
    keys = {
        "distance": lambda d: (d["distance_km"] is None, d["distance_km"] or 0),
        "rating": lambda d: -(d.get("rating") or 0),
        "fee": lambda d: d.get("fee_inr") or 10**9,
        "soonest": lambda d: (d["next_slot"] is None, d["next_slot"] or ""),
    }
    return sorted(docs, key=keys[sort])


@router.get("/doctors/{doctor_id}/slots")
def slots(doctor_id: str, uid: str = Depends(get_user_id)):
    return sb.table("doctor_slots").select("*").eq("doctor_id", doctor_id).eq("booked", False).gte("starts_at", now().isoformat()).order("starts_at").limit(60).execute().data


def _make_reminders(uid: str, appt_id: str, when) -> None:
    for label, hours in (("tomorrow", 24), ("in 2 hours", 2)):
        at = when - timedelta(hours=hours)
        if at > now():
            sb.table("reminders").insert({"user_id": uid, "kind": "appointment", "title": "Doctor appointment", "body": f"You have an appointment {label}.",
                                          "remind_at": at.astimezone(timezone.utc).isoformat(), "ref_id": appt_id}).execute()


class Book(BaseModel):
    slot_id: str
    reason: str = ""


@router.post("/appointments")
def book(body: Book, uid: str = Depends(get_user_id)):
    claimed = sb.table("doctor_slots").update({"booked": True}).eq("id", body.slot_id).eq("booked", False).execute().data  # atomic claim
    if not claimed:
        raise HTTPException(409, "That slot was just taken. Pick another time.")
    slot = claimed[0]
    appt = sb.table("appointments").insert({"user_id": uid, "doctor_id": slot["doctor_id"], "slot_id": slot["id"],
                                            "scheduled_at": slot["starts_at"], "reason": body.reason, "status": "confirmed"}).execute().data[0]
    _make_reminders(uid, appt["id"], parse_ts(slot["starts_at"]))
    return appt


@router.get("/appointments")
def mine(uid: str = Depends(get_user_id)):
    return sb.table("appointments").select("*, doctors(name,specialty,clinic,city)").eq("user_id", uid).order("scheduled_at", desc=True).execute().data


@router.delete("/appointments/{appt_id}")
def cancel(appt_id: str, uid: str = Depends(get_user_id)):
    rows = sb.table("appointments").update({"status": "cancelled"}).eq("id", appt_id).eq("user_id", uid).execute().data
    if not rows:
        raise HTTPException(404, "Appointment not found.")
    sb.table("doctor_slots").update({"booked": False}).eq("id", rows[0]["slot_id"]).execute()
    sb.table("reminders").delete().eq("user_id", uid).eq("ref_id", appt_id).execute()
    return {"ok": True}


class Resched(BaseModel):
    slot_id: str


@router.post("/appointments/{appt_id}/reschedule")
def reschedule(appt_id: str, body: Resched, uid: str = Depends(get_user_id)):
    appt = one(sb.table("appointments").select("*").eq("id", appt_id).eq("user_id", uid).maybe_single())
    if not appt or appt["status"] != "confirmed":
        raise HTTPException(404, "Appointment not found.")
    claimed = sb.table("doctor_slots").update({"booked": True}).eq("id", body.slot_id).eq("booked", False).execute().data
    if not claimed or claimed[0]["doctor_id"] != appt["doctor_id"]:
        if claimed:  # wrong doctor: release what we just took
            sb.table("doctor_slots").update({"booked": False}).eq("id", body.slot_id).execute()
        raise HTTPException(409, "That time isn't available. Pick another slot with the same doctor.")
    sb.table("doctor_slots").update({"booked": False}).eq("id", appt["slot_id"]).execute()
    new = sb.table("appointments").update({"slot_id": body.slot_id, "scheduled_at": claimed[0]["starts_at"]}).eq("id", appt_id).execute().data[0]
    sb.table("reminders").delete().eq("user_id", uid).eq("ref_id", appt_id).execute()
    _make_reminders(uid, appt_id, parse_ts(claimed[0]["starts_at"]))
    return new


def _esc(s: str) -> str:
    return (s or "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


@router.get("/appointments/{appt_id}/ics")
def ics(appt_id: str, uid: str = Depends(get_user_id)):
    appt = one(sb.table("appointments").select("*").eq("id", appt_id).eq("user_id", uid).maybe_single())
    if not appt:
        raise HTTPException(404, "Appointment not found.")
    doc = one(sb.table("doctors").select("*").eq("id", appt["doctor_id"]).maybe_single())
    start = parse_ts(appt["scheduled_at"]).astimezone(timezone.utc)
    f = lambda d: d.strftime("%Y%m%dT%H%M%SZ")
    body = "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MediCare AI//EN", "BEGIN:VEVENT", f"UID:{appt_id}@medicare.ai", f"DTSTAMP:{f(now())}",
        f"DTSTART:{f(start)}", f"DTEND:{f(start + timedelta(minutes=30))}", f"SUMMARY:{_esc('Appointment with ' + doc.get('name', 'doctor'))}",
        f"LOCATION:{_esc(', '.join(x for x in (doc.get('clinic'), doc.get('city')) if x))}", f"DESCRIPTION:{_esc(appt.get('reason') or '')}",
        "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Appointment in 1 hour", "END:VALARM", "END:VEVENT", "END:VCALENDAR"])
    return Response(body, media_type="text/calendar", headers={"Content-Disposition": 'attachment; filename="appointment.ics"'})
