"""Adaptive triage helpers: follow-up questions, comorbidity adjustment, specialty recommendation."""
from collections import Counter
from .risk_model import LEVELS

FOLLOWUPS = [
    {"id": "fever_high", "symptom": "fever", "q": "Is your temperature 39°C (102.2°F) or higher?", "escalate": "see_doctor_soon"},
    {"id": "fever_neck", "symptom": "fever", "q": "Do you have a stiff neck, or a rash that does not fade when pressed?", "escalate": "emergency"},
    {"id": "headache_sudden", "symptom": "headache", "q": "Did it start suddenly and feel like the worst headache of your life?", "escalate": "emergency"},
    {"id": "cough_blood", "symptom": "cough", "q": "Are you coughing up blood?", "escalate": "see_doctor_today"},
    {"id": "cough_long", "symptom": "cough", "q": "Has the cough lasted more than 3 weeks?", "escalate": "see_doctor_soon"},
    {"id": "abd_severe", "symptom": "abdominal_pain", "q": "Is your belly hard or very tender, or is the pain severe and constant?", "escalate": "see_doctor_today"},
    {"id": "vomit_fluids", "symptom": "vomiting", "q": "Can you not keep any fluids down, or are you passing very little urine?", "escalate": "see_doctor_today"},
    {"id": "diarrhea_blood", "symptom": "diarrhea", "q": "Is there blood in your stool, or has it lasted more than 3 days?", "escalate": "see_doctor_today"},
    {"id": "dizzy_faint", "symptom": "dizziness", "q": "Did you nearly faint, or is the dizziness with chest pain or a racing heart?", "escalate": "see_doctor_today"},
    {"id": "urine_fever", "symptom": "painful_urination", "q": "Do you also have fever, chills, or pain in your side or back?", "escalate": "see_doctor_today"},
    {"id": "rash_swelling", "symptom": "rash", "q": "Is there swelling of the lips or face, or trouble breathing with the rash?", "escalate": "emergency"},
    {"id": "thirst_weight", "symptom": "excess_thirst", "q": "Have you also been losing weight without trying?", "escalate": "see_doctor_soon"},
    {"id": "legs_one", "symptom": "swelling_legs", "q": "Is the swelling in only one leg, or is it painful or red?", "escalate": "see_doctor_today"},
    {"id": "vision_sudden", "symptom": "blurred_vision", "q": "Did your vision change suddenly, or only in one eye?", "escalate": "emergency"},
    {"id": "palp_long", "symptom": "palpitations", "q": "Do the palpitations last more than a few minutes, or come with dizziness?", "escalate": "see_doctor_today"},
    {"id": "back_numb", "symptom": "back_pain", "q": "Do you have numbness, leg weakness, or trouble passing urine or stool?", "escalate": "emergency"},
    {"id": "throat_swallow", "symptom": "sore_throat", "q": "Are you unable to swallow your saliva, or is it hard to open your mouth?", "escalate": "see_doctor_today"},
]
_INDEX = {f["id"]: f for f in FOLLOWUPS}
CHRONIC = ("diabet", "heart", "hypertens", "asthma", "copd", "kidney", "cancer", "immun", "stroke")


def followups_for(symptoms: list[str]) -> list[dict]:
    s = set(symptoms)
    return [{"id": f["id"], "symptom": f["symptom"], "q": f["q"]} for f in FOLLOWUPS if f["symptom"] in s]


def _bump(level: str, to: str) -> str:
    return to if LEVELS.index(to) > LEVELS.index(level) else level


def apply_followups(est: dict, answers: dict) -> dict:
    est = {**est, "reasons": list(est.get("reasons", []))}
    for fid, yes in (answers or {}).items():
        f = _INDEX.get(fid)
        if yes and f:
            est["level"] = _bump(est["level"], f["escalate"])
            est["reasons"].append(f["q"].rstrip("?"))
    return est


def comorbidity(est: dict, profile: dict, severity: int) -> dict:
    est = {**est, "reasons": list(est.get("reasons", []))}
    age = profile.get("age") or 30
    conds = " ".join(profile.get("conditions") or []).lower()
    vulnerable = age >= 65 or age <= 2 or any(c in conds for c in CHRONIC)
    if vulnerable and est["level"] == "self_care" and severity >= 4:
        est["level"] = "see_doctor_soon"
        est["reasons"].append("Because of your age or existing health conditions, a check-up is the safer choice")
    return est


SPECIALTY = {
    "chest_pain": ["Cardiologist"], "palpitations": ["Cardiologist"], "swelling_legs": ["Cardiologist", "General Physician"],
    "shortness_of_breath": ["Pulmonologist", "General Physician"], "cough": ["General Physician", "Pulmonologist"],
    "rash": ["Dermatologist"], "joint_pain": ["Orthopedist"], "back_pain": ["Orthopedist"],
    "abdominal_pain": ["Gastroenterologist", "General Physician"], "nausea": ["Gastroenterologist"],
    "vomiting": ["Gastroenterologist"], "diarrhea": ["Gastroenterologist"],
    "frequent_urination": ["Endocrinologist", "General Physician"], "excess_thirst": ["Endocrinologist"],
    "painful_urination": ["Urologist", "General Physician"], "blurred_vision": ["Ophthalmologist"],
    "headache": ["Neurologist", "General Physician"], "dizziness": ["Neurologist", "General Physician"],
    "confusion": ["Neurologist"], "slurred_speech": ["Neurologist"], "facial_droop": ["Neurologist"], "limb_weakness": ["Neurologist"],
    "fever": ["General Physician"], "fatigue": ["General Physician"], "sore_throat": ["General Physician"], "runny_nose": ["General Physician"],
}


def recommend_specialties(symptoms: list[str], age: int | None = None) -> list[dict]:
    score: Counter = Counter()
    why: dict[str, list[str]] = {}
    for s in symptoms:
        for rank, sp in enumerate(SPECIALTY.get(s, [])):
            score[sp] += 2 if rank == 0 else 1
            why.setdefault(sp, []).append(s)
    ranked = [sp for sp, _ in sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))]
    if age is not None and age <= 12:
        ranked = ["Pediatrician"] + [r for r in ranked if r != "Pediatrician"]
        why.setdefault("Pediatrician", symptoms)
    if not ranked:
        ranked, why = ["General Physician"], {"General Physician": symptoms}
    return [{"specialty": sp, "because": sorted(set(why.get(sp, [])))} for sp in ranked[:3]]
