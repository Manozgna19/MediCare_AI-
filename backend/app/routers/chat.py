import json
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError
from ..db import sb
from ..deps import get_user_id
from ..services import gemini, safety, audit
from ..services.context import build_context
from . import analytics as analytics_router, profile as profile_router, reminders as reminders_router

router = APIRouter(prefix="/chat", tags=["chat"])

FEATURES = {
    "symptom_checker": "/symptoms", "doctors": "/doctors", "reports": "/reports", "sos": "/sos", "profile": "/profile",
    "reminders": "/reminders", "analytics": "/analytics", "family": "/family", "dashboard": "/", "summary": "/summary",
}
# Things the assistant may PROPOSE. Nothing is saved until the user confirms (/chat/execute).
PROPOSALS = {"reminder": reminders_router.ReminderIn, "vital": analytics_router.Vital, "medication": profile_router.MedIn}


def short_lang(l: str) -> str:
    return l.split("-")[0]


class Turn(BaseModel):
    role: str
    text: str


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = []
    language: str = "en"
    now: str | None = None    # user's local time (ISO with offset) so "8 pm" resolves correctly
    tz: str = "Asia/Kolkata"


def _store(uid: str, role: str, text: str, meta: dict | None = None) -> None:
    sb.table("chat_messages").insert({"user_id": uid, "role": role, "text": text, "meta": meta or {}}).execute()


@router.post("")
def chat(body: ChatIn, uid: str = Depends(get_user_id)):
    kind = safety.detect(body.message)
    if kind:  # never route emergencies through the LLM
        audit.record(uid, "safety_override", {"kind": kind})
        out = safety.emergency_reply(kind, short_lang(body.language))
        _store(uid, "user", body.message); _store(uid, "assistant", out["reply"], {"urgent": True, "actions": out["actions"]})
        return {**out, "proposals": []}
    ctx = build_context(uid)
    convo = "\n".join(f"{t.role}: {t.text}" for t in body.history[-10:])
    system = f"""You coordinate a health app. Use the user's authorised data below only when it helps; never reveal it unprompted
or invent data that is not present. If a field is missing, say you don't have it.
Current local time: {body.now or 'unknown'} (timezone {body.tz}).
USER DATA: {json.dumps(ctx, default=str)}
APP FEATURES you can route to: {json.dumps(FEATURES)}.
You may PROPOSE (never perform) these saves; the user confirms them. Use exact JSON args:
- reminder: {{"kind":"medication|custom","title":str,"body":str,"remind_at":ISO8601 WITH timezone offset,"recurrence":"none|daily|weekly|yearly"}}
- vital: {{"kind":"systolic_bp|diastolic_bp|heart_rate|blood_glucose|weight_kg|spo2|temperature_c","value":number}} (a BP like 130/85 is two vital proposals)
- medication: {{"name":str,"dose":str,"frequency":str,"reminder_times":[ISO8601 with offset]}}
Only propose when the user clearly asks to save, log or be reminded of something.
Return JSON: {{"reply": string (short, plain, in the user's language), "urgent": boolean,
"actions": [{{"feature": one of the feature keys, "label": string}}],
"proposals": [{{"type": "reminder|vital|medication", "args": object, "summary": string}}]}}.
Suggest an action only when it clearly helps (symptoms -> symptom_checker, wants a visit -> doctors, emergency -> sos)."""
    out = gemini.generate_json(f"{convo}\nuser: {body.message}", system=system, language=body.language)
    if "reply" not in out:
        out = {"reply": "Sorry, I couldn't process that. Please try again.", "urgent": False, "actions": []}
    out["actions"] = [a for a in out.get("actions", []) if a.get("feature") in FEATURES]
    clean = []
    for p in (out.get("proposals") or [])[:3]:
        model = PROPOSALS.get(p.get("type"))
        try:
            clean.append({"type": p["type"], "args": model(**p.get("args", {})).model_dump(mode="json"), "summary": str(p.get("summary", ""))[:200]})
        except (ValidationError, TypeError, KeyError, AttributeError):
            continue  # drop anything that doesn't validate
    out["proposals"] = clean
    _store(uid, "user", body.message)
    _store(uid, "assistant", out["reply"], {"urgent": bool(out.get("urgent")), "actions": out["actions"], "proposals": clean})
    return out


class Execute(BaseModel):
    type: Literal["reminder", "vital", "medication"]
    args: dict


@router.post("/execute")
def execute(body: Execute, uid: str = Depends(get_user_id)):
    try:
        obj = PROPOSALS[body.type](**body.args)
    except ValidationError:
        raise HTTPException(422, "Those details don't look valid. Please add it manually.")
    fn = {"reminder": reminders_router.create, "vital": analytics_router.add_vital, "medication": profile_router.add_med}[body.type]
    result = fn(obj, uid)
    audit.record(uid, "chat_action", {"type": body.type})
    return {"ok": True, "result": result}


@router.get("/history")
def history(limit: int = 40, uid: str = Depends(get_user_id)):
    rows = sb.table("chat_messages").select("role,text,meta,created_at").eq("user_id", uid).order("created_at", desc=True).limit(min(limit, 100)).execute().data
    return list(reversed(rows))


@router.delete("/history")
def clear_history(uid: str = Depends(get_user_id)):
    sb.table("chat_messages").delete().eq("user_id", uid).execute()
    return {"ok": True}
