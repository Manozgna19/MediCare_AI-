from typing import Literal
from urllib.parse import quote
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from ..db import sb, one
from ..deps import get_user_id
from ..services import maps, audit

router = APIRouter(prefix="/sos", tags=["sos"])


class Contact(BaseModel):
    name: str
    phone: str
    relation: str = ""


@router.get("/contacts")
def contacts(uid: str = Depends(get_user_id)):
    return sb.table("emergency_contacts").select("*").eq("user_id", uid).execute().data


@router.post("/contacts")
def add_contact(c: Contact, uid: str = Depends(get_user_id)):
    return sb.table("emergency_contacts").insert({**c.model_dump(), "user_id": uid}).execute().data[0]


@router.delete("/contacts/{cid}")
def del_contact(cid: str, uid: str = Depends(get_user_id)):
    sb.table("emergency_contacts").delete().eq("id", cid).eq("user_id", uid).execute()
    return {"ok": True}


def _links(cs: list[dict], msg: str) -> list[dict]:
    # The browser opens these; the user confirms sending from their own SMS/WhatsApp app.
    return [{"name": c["name"], "phone": c["phone"], "sms": f"sms:{c['phone']}?body={quote(msg)}",
             "whatsapp": f"https://wa.me/{''.join(ch for ch in c['phone'] if ch.isdigit())}?text={quote(msg)}"} for c in cs]


class Trigger(BaseModel):
    lat: float | None = None   # only present if the user granted browser location permission
    lng: float | None = None


@router.post("/trigger")
def trigger(t: Trigger, uid: str = Depends(get_user_id)):
    prof = one(sb.table("profiles").select("full_name,blood_group,allergies,conditions").eq("id", uid).maybe_single())
    loc = f"https://maps.google.com/?q={t.lat},{t.lng}" if t.lat is not None and t.lng is not None else "location not shared"
    msg = (f"EMERGENCY: {prof.get('full_name') or 'A MediCare AI user'} needs help. Location: {loc}. "
           f"Blood group: {prof.get('blood_group') or 'unknown'}. Allergies: {', '.join(prof.get('allergies') or []) or 'none listed'}.")
    cs = sb.table("emergency_contacts").select("name,phone").eq("user_id", uid).execute().data
    sb.table("sos_events").insert({"user_id": uid, "lat": t.lat, "lng": t.lng, "message": msg, "contacts_notified": len(cs)}).execute()
    audit.record(uid, "sos_triggered", {"shared_location": t.lat is not None, "contacts": len(cs)})
    return {"message": msg, "links": _links(cs, msg), "emergency_number": "112"}


@router.post("/safe")
def safe(uid: str = Depends(get_user_id)):
    """All-clear message so contacts don't keep worrying after a false alarm or once help has arrived."""
    prof = one(sb.table("profiles").select("full_name").eq("id", uid).maybe_single())
    who = prof.get("full_name")
    msg = f"UPDATE: {who} is safe now. Thank you for responding." if who else "UPDATE: I am safe now. Thank you for responding."
    cs = sb.table("emergency_contacts").select("name,phone").eq("user_id", uid).execute().data
    audit.record(uid, "sos_all_clear", {"contacts": len(cs)})
    return {"message": msg, "links": _links(cs, msg)}


@router.get("/medical-id")
def medical_id(uid: str = Depends(get_user_id)):
    """What a responder needs to know, on one card."""
    prof = one(sb.table("profiles").select("full_name,age,sex,blood_group,allergies,conditions").eq("id", uid).maybe_single())
    meds = sb.table("medications").select("name,dose,frequency").eq("user_id", uid).eq("active", True).execute().data
    cs = sb.table("emergency_contacts").select("name,phone,relation").eq("user_id", uid).execute().data
    return {"profile": prof, "medications": meds, "contacts": cs}


@router.get("/history")
def history(uid: str = Depends(get_user_id)):
    return sb.table("sos_events").select("id,created_at,contacts_notified,lat,lng").eq("user_id", uid).order("created_at", desc=True).limit(20).execute().data


@router.get("/hospitals")
def nearby(lat: float, lng: float, kind: Literal["hospital", "pharmacy", "clinic"] = "hospital",
           radius_m: int = Query(5000, ge=500, le=20000), open_now: bool = False, uid: str = Depends(get_user_id)):
    places = maps.nearby_places(lat, lng, kind, radius_m)
    return [p for p in places if p["open_now"] is not False] if open_now else places
