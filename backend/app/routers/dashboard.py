from datetime import timedelta
from fastapi import APIRouter, Depends
from ..db import sb
from ..deps import get_user_id
from ..services import audit, nba, state
from ..services.util import parse_ts

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(uid: str = Depends(get_user_id)):
    s = state.gather(uid)
    t = s["now"]
    events = []
    for r in sb.table("symptom_checks").select("id,symptoms,risk_level,created_at").eq("user_id", uid).limit(30).execute().data:
        events.append({"type": "symptom", "at": r["created_at"], "title": ", ".join(r["symptoms"]).replace("_", " "), "detail": r["risk_level"]})
    for r in sb.table("reports").select("id,doc_type,summary,created_at").eq("user_id", uid).limit(30).execute().data:
        events.append({"type": "report", "at": r["created_at"], "title": (r["doc_type"] or "report").replace("_", " "), "detail": r["summary"]})
    for r in sb.table("appointments").select("id,scheduled_at,status,doctors(name,specialty)").eq("user_id", uid).limit(30).execute().data:
        d = r.get("doctors") or {}
        events.append({"type": "appointment", "at": r["scheduled_at"], "title": f'{d.get("name", "Doctor")} ({d.get("specialty", "")})', "detail": r["status"]})
    for r in sb.table("vitals").select("kind,value,recorded_at").eq("user_id", uid).order("recorded_at", desc=True).limit(30).execute().data:
        events.append({"type": "vital", "at": r["recorded_at"], "title": r["kind"].replace("_", " "), "detail": str(r["value"])})
    for r in [l for l in s["dose_logs"] if l["status"] in ("taken", "skipped")][-20:]:
        events.append({"type": "dose", "at": r["scheduled_for"], "title": r.get("title") or "Medicine", "detail": r["status"]})
    events.sort(key=lambda e: e["at"], reverse=True)
    upcoming_rem = [r for r in s["reminders"] if not r["sent"] and parse_ts(r["remind_at"]) >= t][:5]
    today = [l for l in s["dose_logs"] if l["status"] != "snoozed" and parse_ts(l["scheduled_for"]) >= t - timedelta(hours=24)]
    return {
        "timeline": events[:80], "upcoming_reminders": upcoming_rem, "upcoming_appointments": s["appointments"][:3],
        "active_medications": s["medications"], "health_score": s["health_score"], "actions": nba.next_actions(s),
        "today_doses": today, "adherence": {k: s["adherence"][k] for k in ("pct", "streak_days", "taken", "total")},
        "vitals": {k: {"latest": v["latest"], "status": v["status"]} for k, v in s["trends"]["series"].items()},
        "insights": s["trends"]["insights"], "completeness": s["completeness"], "name": s["profile"].get("full_name"),
    }


@router.get("/summary")
def summary(uid: str = Depends(get_user_id)):
    """A single printable page for a doctor's visit."""
    s = state.gather(uid)
    reports = sb.table("reports").select("doc_type,summary,created_at").eq("user_id", uid).order("created_at", desc=True).limit(5).execute().data
    audit.record(uid, "summary_generated")
    p = s["profile"]
    return {
        "generated_at": s["now"].isoformat(),
        "profile": {k: p.get(k) for k in ("full_name", "age", "sex", "blood_group", "height_cm", "weight_kg", "allergies", "conditions", "smoker")},
        "medications": s["medications"], "bmi": s["bmi"], "adherence_pct_30d": s["adherence"]["pct"],
        "latest_vitals": {k: {"value": v["latest"], "status": v["status"], "mean": v["mean"], "readings": len(v["points"])} for k, v in s["trends"]["series"].items()},
        "insights": s["trends"]["insights"], "recent_symptom_checks": s["symptom_checks"], "recent_reports": reports,
        "family_history": [{k: e.get(k) for k in ("relation", "condition", "age_at_diagnosis")} for e in s["family"]],
        "upcoming_appointments": [{"at": a["scheduled_at"], "doctor": (a.get("doctors") or {}).get("name")} for a in s["appointments"]],
    }
