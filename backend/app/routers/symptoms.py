from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from ..db import sb, one
from ..deps import get_user_id
from ..services import gemini, risk_model, safety, triage

router = APIRouter(prefix="/symptoms", tags=["symptoms"])


class CheckIn(BaseModel):
    symptoms: list[str] = Field(min_length=1, max_length=15)
    free_text: str = Field("", max_length=1000)
    severity: int = Field(5, ge=1, le=10)
    duration_days: int = Field(1, ge=0, le=365)
    answers: dict[str, bool] = {}
    language: str = "en"


@router.get("/options")
def options():
    return risk_model.SYMPTOMS


@router.get("/followups")
def followups(symptoms: str, uid: str = Depends(get_user_id)):
    return triage.followups_for([s for s in symptoms.split(",") if s])


@router.post("/check")
def check(body: CheckIn, uid: str = Depends(get_user_id)):
    prof = one(sb.table("profiles").select("age,allergies,conditions").eq("id", uid).maybe_single())
    est = risk_model.estimate(body.symptoms, prof.get("age") or 30, body.severity, body.duration_days)
    est = triage.apply_followups(est, body.answers)
    if safety.detect(body.free_text) == "medical":
        est["level"] = "emergency"
        est["reasons"].append("You described a symptom that can be an emergency")
    est = triage.comorbidity(est, prof, body.severity)
    specialties = triage.recommend_specialties(est["recognised_symptoms"], prof.get("age"))
    prompt = f"""Patient: age {prof.get('age')}, known conditions {prof.get('conditions')}, allergies {prof.get('allergies')}.
Symptoms: {body.symptoms}. Extra details: {body.free_text or 'none'}. Severity {body.severity}/10 for {body.duration_days} day(s).
Follow-up answers that were YES: {[k for k, v in body.answers.items() if v]}.
Triage level already decided by the app: {est['level']}. Return JSON: possible_causes (list of {{name, likelihood: "common"|"possible"|"less_likely", why}}),
self_care (list), warning_signs (list of signs that mean go to emergency care), when_to_seek_care (string consistent with the triage level),
questions_for_doctor (list). Do not state a diagnosis."""
    try:
        ai = gemini.generate_json(prompt, language=body.language)
    except HTTPException:
        ai = {}  # triage still works if the LLM is down
    row = sb.table("symptom_checks").insert({
        "user_id": uid, "symptoms": body.symptoms, "free_text": body.free_text, "severity": body.severity,
        "duration_days": body.duration_days, "risk_level": est["level"], "result": {"estimate": est, "ai": ai, "specialties": specialties},
    }).execute().data[0]
    return {"id": row["id"], "triage": est, "guidance": ai, "specialties": specialties,
            "disclaimer": "Educational information only, not a medical diagnosis. In an emergency call 112."}


@router.get("/history")
def history(uid: str = Depends(get_user_id)):
    return sb.table("symptom_checks").select("*").eq("user_id", uid).order("created_at", desc=True).limit(50).execute().data
