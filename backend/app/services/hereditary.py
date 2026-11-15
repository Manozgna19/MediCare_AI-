"""Educational family-history risk model: degree-weighted, early-onset aware, with screening conversation starters."""
FIRST = {"mother", "father", "sister", "brother", "daughter", "son"}
SECOND = {"grandmother", "grandfather", "aunt", "uncle", "niece", "nephew"}
FEMALE = {"mother", "sister", "daughter", "grandmother", "aunt", "niece"}

# label, plain-language note, early-onset age (single value or by sex), screening advice
KNOWLEDGE = {
    "type 2 diabetes": ("Diabetes", "Family history raises risk.", 40, "Ask about a fasting glucose or HbA1c test every 1 to 3 years, starting earlier than usual."),
    "heart disease": ("Heart disease", "Early heart disease in a parent or sibling is a notable risk factor.", {"M": 55, "F": 65}, "Ask about cholesterol, blood pressure and whether a heart risk assessment is right for you."),
    "hypertension": ("High blood pressure", "Tends to run in families.", 50, "Check your blood pressure at least once a year."),
    "breast cancer": ("Breast and ovarian cancer", "Relatives diagnosed young can point to inherited risk.", 50, "Ask whether genetic counselling or earlier screening is appropriate."),
    "colon cancer": ("Colorectal cancer", "A first-degree relative raises risk.", 50, "Screening often starts at 40, or 10 years before the youngest relative's diagnosis, whichever is earlier."),
    "stroke": ("Stroke", "Shares risk factors with heart disease.", 55, "Ask about blood pressure, cholesterol and heart rhythm checks."),
    "thalassemia": ("Thalassemia", "A recessive blood condition.", 99, "Carrier screening is worth discussing before planning a family."),
    "asthma": ("Asthma and allergies", "Allergic conditions often cluster in families.", 99, "Tell your doctor if you have wheeze or night cough."),
    "kidney disease": ("Kidney disease", "Can be linked to diabetes and blood pressure in families.", 50, "Ask about creatinine/eGFR and urine protein tests."),
}


def _early_limit(cond: str, relation: str) -> int:
    e = KNOWLEDGE.get(cond, (None, None, 50, None))[2]
    return e["F" if relation in FEMALE else "M"] if isinstance(e, dict) else e


def analyse(entries: list[dict]) -> list[dict]:
    grouped: dict[str, list[dict]] = {}
    for e in entries:
        grouped.setdefault(e["condition"].strip().lower(), []).append(e)
    results = []
    for cond, rel in grouped.items():
        label, note, _, advice = KNOWLEDGE.get(cond, (cond.title(), "Share this with your doctor.", 50, "Ask whether screening or counselling would help."))
        score, first_early, details = 0.0, False, []
        n_first = sum(1 for r in rel if r["relation"].lower() in FIRST)
        for r in rel:
            relation = r["relation"].lower()
            w = 1.0 if relation in FIRST else 0.5 if relation in SECOND else 0.25
            age = r.get("age_at_diagnosis")
            early = age is not None and age < _early_limit(cond, relation)
            if early:
                w *= 1.5
                first_early = first_early or relation in FIRST
            score += w
            details.append({"relation": relation, "age": age, "early": early})
        level = "higher" if score >= 2.5 or first_early or n_first >= 2 else "elevated" if score >= 1 else "mild"
        ages = [d["age"] for d in details if d["age"]]
        actions = [advice]
        if cond == "colon cancer" and ages:
            actions.append(f"Your youngest affected relative was diagnosed at {min(ages)}, so screening may be advised from about age {max(min(40, min(ages) - 10), 18)}.")
        results.append({
            "condition": cond, "topic": label, "concern_level": level, "score": round(score, 1), "education": note,
            "relatives": [f'{d["relation"]} (dx age {d["age"] or "?"}{", early" if d["early"] else ""})' for d in details],
            "actions": actions,
        })
    order = {"higher": 0, "elevated": 1, "mild": 2}
    return sorted(results, key=lambda r: (order[r["concern_level"]], -r["score"]))
