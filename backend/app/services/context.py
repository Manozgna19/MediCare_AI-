"""Cross-feature AI coordination: ONE consent-aware snapshot shared with the chatbot."""
from ..db import sb
from . import state

DEFAULT_CONSENT = {"profile": True, "medications": True, "symptoms": True, "reports": True, "family": True, "vitals": True}


def build_context(uid: str) -> dict:
    s = state.gather(uid)
    prof = s["profile"]
    consent = {**DEFAULT_CONSENT, **(prof.get("ai_consent") or {})}
    ctx: dict = {"consent": consent}
    if consent["profile"]:
        ctx["profile"] = {k: prof.get(k) for k in ("full_name", "age", "sex", "blood_group", "allergies", "conditions", "language")}
    if consent["medications"]:
        ctx["medications"] = [{k: m.get(k) for k in ("name", "dose", "frequency")} for m in s["medications"]]
        ctx["dose_adherence_pct_30d"] = s["adherence"]["pct"]
    if consent["symptoms"]:
        ctx["recent_symptom_checks"] = s["symptom_checks"][:3]
    if consent["reports"]:
        ctx["recent_reports"] = sb.table("reports").select("doc_type,summary,created_at").eq("user_id", uid).order("created_at", desc=True).limit(3).execute().data
    if consent["family"]:
        ctx["family_history"] = [{k: e.get(k) for k in ("relation", "condition", "age_at_diagnosis")} for e in s["family"]]
    if consent["vitals"]:
        ctx["latest_vitals"] = s["latest"]
        ctx["trend_insights"] = s["trends"]["insights"]
        ctx["health_score"] = s["health_score"]["score"]
    ctx["upcoming_appointments"] = [{"scheduled_at": a["scheduled_at"], "doctor": (a.get("doctors") or {}).get("name")} for a in s["appointments"][:3]]
    return ctx
