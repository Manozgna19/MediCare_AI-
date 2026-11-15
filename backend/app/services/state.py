"""One consolidated, per-user snapshot shared by the dashboard, chat context, summary and next-best-action engine.
Every query is filtered by user id (the backend uses a service-role key, which bypasses RLS)."""
from datetime import timedelta
from ..db import sb, one
from . import adherence as adh, analytics, scoring
from .util import now, parse_ts


def gather(uid: str) -> dict:
    t = now()
    prof = one(sb.table("profiles").select("*").eq("id", uid).maybe_single())
    contacts = sb.table("emergency_contacts").select("id").eq("user_id", uid).execute().data
    meds = sb.table("medications").select("id,name,dose,frequency").eq("user_id", uid).eq("active", True).execute().data
    vit = sb.table("vitals").select("kind,value,recorded_at").eq("user_id", uid).order("recorded_at").limit(1000).execute().data
    logs = sb.table("dose_logs").select("*").eq("user_id", uid).gte("scheduled_for", (t - timedelta(days=31)).isoformat()).execute().data
    family = sb.table("family_history").select("*").eq("user_id", uid).execute().data
    reminders = sb.table("reminders").select("*").eq("user_id", uid).order("remind_at").limit(300).execute().data
    appts = sb.table("appointments").select("*, doctors(name,specialty)").eq("user_id", uid).eq("status", "confirmed").gte("scheduled_at", t.isoformat()).order("scheduled_at").limit(5).execute().data
    checks = sb.table("symptom_checks").select("symptoms,risk_level,created_at").eq("user_id", uid).order("created_at", desc=True).limit(5).execute().data

    tr = analytics.trends(vit)
    latest = {k: v["latest"] for k, v in tr["series"].items()}
    ad = adh.compute(logs, t)
    comp = scoring.completeness(prof, len(contacts))
    recent_vitals = sum(1 for v in vit if parse_ts(v["recorded_at"]) >= t - timedelta(days=14))
    return {
        "now": t, "profile": prof, "n_contacts": len(contacts), "medications": meds, "trends": tr, "latest": latest,
        "adherence": ad, "completeness": comp, "family": family, "reminders": reminders, "appointments": appts,
        "symptom_checks": checks, "dose_logs": logs, "vitals_14d": recent_vitals,
        "risk": analytics.cardiometabolic_risk(prof, latest), "idrs": scoring.idrs(prof, family), "bmi": scoring.bmi(prof, latest),
        "health_score": scoring.health_score(latest, ad["pct"], comp["pct"], recent_vitals),
    }
