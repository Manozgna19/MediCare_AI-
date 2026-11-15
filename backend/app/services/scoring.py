from .analytics import RANGES

ACTIVITY = {"vigorous": 0, "moderate": 10, "mild": 20, "sedentary": 30}


def completeness(profile: dict, n_contacts: int = 0) -> dict:
    items = [("full_name", "your name"), ("age", "your age"), ("sex", "your sex"), ("blood_group", "your blood group"),
             ("height_cm", "your height"), ("weight_kg", "your weight"), ("waist_cm", "your waist size"), ("activity_level", "your activity level")]
    missing = [label for k, label in items if not profile.get(k)]
    total = len(items) + 1
    if n_contacts == 0:
        missing.append("an emergency contact")
    return {"pct": round(100 * (total - len(missing)) / total), "missing": missing}


def bmi(profile: dict, latest: dict) -> float | None:
    h, w = profile.get("height_cm"), latest.get("weight_kg") or profile.get("weight_kg")
    return round(w / ((h / 100) ** 2), 1) if h and w else None


def idrs(profile: dict, family: list[dict]) -> dict:
    """Indian Diabetes Risk Score style screen (age, waist, activity, parental history). Scores are multiples of 10:
    <30 low, 30-50 moderate, 60+ high. Verify the scale against the published IDRS before clinical use."""
    age, waist, sex, act = profile.get("age"), profile.get("waist_cm"), (profile.get("sex") or "").lower(), profile.get("activity_level")
    missing = [n for n, v in (("age", age), ("waist size", waist), ("sex", sex if sex in ("male", "female") else None), ("activity level", act if act in ACTIVITY else None)) if v in (None, "", 0)]
    if missing:
        return {"available": False, "missing": missing}
    pts = {"age": 0 if age < 35 else 20 if age < 50 else 30}
    lo, hi = (80, 90) if sex == "female" else (90, 100)
    pts["waist"] = 0 if waist < lo else 10 if waist < hi else 20
    pts["activity"] = ACTIVITY[act]
    parents = {e["relation"].lower() for e in family if "diabet" in e["condition"].lower() and e["relation"].lower() in ("mother", "father")}
    pts["family_history"] = 10 * len(parents)
    score = sum(pts.values())
    return {"available": True, "score": score, "band": "low" if score < 30 else "moderate" if score < 60 else "high", "parts": pts}


def health_score(latest: dict, adherence_pct, completeness_pct: int, vitals_14d: int) -> dict:
    comps = []
    ranged = [(k, v) for k, v in latest.items() if RANGES.get(k, (None, None)) != (None, None)]
    if ranged:
        ok = sum(1 for k, v in ranged if (RANGES[k][0] is None or v >= RANGES[k][0]) and (RANGES[k][1] is None or v <= RANGES[k][1]))
        comps.append(("Vitals in range", 40 * ok / len(ranged), 40))
    if adherence_pct is not None:
        comps.append(("Taking medicines", 30 * adherence_pct / 100, 30))
    comps.append(("Profile complete", 15 * completeness_pct / 100, 15))
    comps.append(("Tracking regularly", 15 * min(vitals_14d, 6) / 6, 15))
    earned, mx = sum(c[1] for c in comps), sum(c[2] for c in comps)
    return {"score": round(100 * earned / mx), "parts": [{"label": l, "earned": round(e, 1), "max": m} for l, e, m in comps]}
