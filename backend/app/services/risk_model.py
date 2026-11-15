"""Symptom risk estimator.

IMPORTANT: trained on SYNTHETIC data generated from hand-written triage rules so
the pipeline works end to end. It is a demo, not a clinically validated tool.
Replace `_synthetic_dataset` with real, consented, de-identified data and have
clinicians validate it before any real-world use.
"""
from pathlib import Path
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier

MODEL_PATH = Path(__file__).parent / "risk_model.joblib"

SYMPTOMS = [
    "fever", "cough", "sore_throat", "headache", "fatigue", "nausea", "vomiting", "diarrhea",
    "abdominal_pain", "chest_pain", "shortness_of_breath", "dizziness", "rash", "joint_pain",
    "back_pain", "blurred_vision", "confusion", "slurred_speech", "facial_droop", "limb_weakness",
    "severe_bleeding", "fainting", "palpitations", "frequent_urination", "excess_thirst",
    "painful_urination", "swelling_legs", "runny_nose",
]
LEVELS = ["self_care", "see_doctor_soon", "see_doctor_today", "emergency"]

RED_FLAGS = {
    "chest_pain", "shortness_of_breath", "slurred_speech", "facial_droop",
    "limb_weakness", "severe_bleeding", "confusion", "fainting",
}
URGENT = {"palpitations", "blurred_vision", "vomiting", "abdominal_pain", "dizziness"}


def _vec(symptoms) -> np.ndarray:
    s = set(symptoms)
    return np.array([1 if x in s else 0 for x in SYMPTOMS])


def _rule_label(symptoms: set, age: int, severity: int, days: int) -> int:
    if symptoms & RED_FLAGS and (severity >= 6 or len(symptoms & RED_FLAGS) >= 2):
        return 3
    score = len(symptoms & URGENT) * 1.5 + len(symptoms) * 0.5 + severity * 0.4 + min(days, 14) * 0.15
    if age >= 65 or age <= 2:
        score += 1.5
    if symptoms & RED_FLAGS:
        score += 3
    return 0 if score < 4 else 1 if score < 7 else 2


def _synthetic_dataset(n: int = 6000):
    rng = np.random.default_rng(42)
    X, y = [], []
    for _ in range(n):
        k = int(rng.integers(1, 6))
        sy = set(rng.choice(SYMPTOMS, size=k, replace=False))
        age, sev, days = int(rng.integers(1, 90)), int(rng.integers(1, 11)), int(rng.integers(1, 21))
        X.append(np.concatenate([_vec(sy), [age, sev, days]]))
        y.append(_rule_label(sy, age, sev, days))
    return np.array(X), np.array(y)


def _load():
    if MODEL_PATH.exists():
        return joblib.load(MODEL_PATH)
    X, y = _synthetic_dataset()
    model = RandomForestClassifier(n_estimators=200, random_state=42, class_weight="balanced").fit(X, y)
    joblib.dump(model, MODEL_PATH)
    return model


_model = _load()


def estimate(symptoms: list, age: int, severity: int, days: int) -> dict:
    known = [s for s in symptoms if s in SYMPTOMS]
    x = np.concatenate([_vec(known), [age, severity, days]]).reshape(1, -1)
    proba = _model.predict_proba(x)[0]
    classes = [int(c) for c in _model.classes_]
    probs = {LEVELS[c]: round(float(p), 3) for c, p in zip(classes, proba)}
    level = LEVELS[classes[int(np.argmax(proba))]]
    flagged = sorted(set(known) & RED_FLAGS)
    if flagged and (severity >= 6 or len(flagged) >= 2):  # rules always override the model
        level = "emergency"
    return {"level": level, "probabilities": probs, "red_flags": flagged, "recognised_symptoms": known}
