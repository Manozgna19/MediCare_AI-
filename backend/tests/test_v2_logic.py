import datetime as dt
import numpy as np
from app.services import adherence, analytics, interactions, nba, scoring, triage

NOW = dt.datetime(2026, 11, 5, 12, 0, tzinfo=dt.timezone.utc)
iso = lambda d: d.isoformat()


def test_followups_only_for_selected_symptoms():
    qs = triage.followups_for(["fever", "cough"])
    assert {q["symptom"] for q in qs} == {"fever", "cough"} and triage.followups_for(["fatigue"]) == []


def test_followup_yes_escalates_and_explains():
    est = triage.apply_followups({"level": "self_care", "reasons": []}, {"fever_neck": True, "cough_long": False})
    assert est["level"] == "emergency" and len(est["reasons"]) == 1


def test_followup_never_downgrades():
    assert triage.apply_followups({"level": "emergency", "reasons": []}, {"cough_long": True})["level"] == "emergency"


def test_comorbidity_bumps_vulnerable_only():
    base = {"level": "self_care", "reasons": []}
    assert triage.comorbidity(base, {"age": 30, "conditions": []}, 5)["level"] == "self_care"
    assert triage.comorbidity(base, {"age": 30, "conditions": ["Type 2 Diabetes"]}, 5)["level"] == "see_doctor_soon"
    assert triage.comorbidity(base, {"age": 70}, 5)["level"] == "see_doctor_soon"
    assert triage.comorbidity(base, {"age": 70}, 2)["level"] == "self_care"


def test_specialty_recommendation():
    assert triage.recommend_specialties(["chest_pain", "palpitations"], 50)[0]["specialty"] == "Cardiologist"
    assert triage.recommend_specialties(["fever"], 6)[0]["specialty"] == "Pediatrician"
    assert triage.recommend_specialties([], None)[0]["specialty"] == "General Physician"


def test_interaction_detected_with_brand_names():
    r = interactions.check(["Warfarin 5mg", "Brufen 400"])
    assert r and r[0]["severity"] == "high"


def test_interaction_nitrate_pde5():
    assert interactions.check(["Sorbitrate", "Sildenafil"])[0]["severity"] == "high"


def test_no_false_alarm_for_same_drug_or_safe_pair():
    assert interactions.check(["Dolo 650", "Crocin"]) == []
    assert interactions.check(["Metformin", "Atorvastatin"]) == []


def test_one_message_per_pair_highest_severity():
    assert len(interactions.check(["Warfarin", "Aspirin"])) == 1


def test_check_new_only_returns_pairs_with_new_drug():
    r = interactions.check_new("Ibuprofen", ["Warfarin", "Metformin"])
    assert len(r) == 1 and "Ibuprofen" in r[0]["meds"]


def _log(h_ago, status, title="Metformin"):
    return {"scheduled_for": iso(NOW - dt.timedelta(hours=h_ago)), "status": status, "title": title}


def test_adherence_counts_missed_after_grace_and_ignores_snoozed():
    a = adherence.compute([_log(30, "taken"), _log(26, "pending"), _log(5, "skipped"), _log(1, "pending"), _log(6, "snoozed")], NOW)
    assert (a["taken"], a["total"], a["pct"]) == (1, 3, 33)


def test_adherence_streak():
    logs = [_log(24 * d + 2, "taken") for d in range(0, 4)]
    assert adherence.compute(logs, NOW)["streak_days"] == 4
    logs.append(_log(24 * 2 + 3, "skipped"))
    assert adherence.compute(logs, NOW)["streak_days"] == 2


def test_adherence_empty():
    assert adherence.compute([], NOW)["pct"] is None


def test_idrs_high_risk_example():
    r = scoring.idrs({"age": 52, "sex": "male", "waist_cm": 95, "activity_level": "sedentary"}, [{"relation": "father", "condition": "Type 2 diabetes"}])
    assert r["score"] == 80 and r["band"] == "high"


def test_idrs_low_risk_and_missing_inputs():
    assert scoring.idrs({"age": 28, "sex": "female", "waist_cm": 70, "activity_level": "vigorous"}, [])["band"] == "low"
    assert scoring.idrs({"age": 28}, [])["available"] is False


def test_completeness_counts_contact():
    assert scoring.completeness({}, 0)["pct"] == 0
    full = {k: 1 for k in ("full_name", "age", "sex", "blood_group", "height_cm", "weight_kg", "waist_cm", "activity_level")}
    assert scoring.completeness(full, 1)["pct"] == 100 and "an emergency contact" in scoring.completeness(full, 0)["missing"]


def test_health_score_renormalises_without_meds():
    s = scoring.health_score({"systolic_bp": 120}, None, 100, 6)
    assert s["score"] == 100 and all(p["label"] != "Taking medicines" for p in s["parts"])
    assert scoring.health_score({"systolic_bp": 180}, 50, 50, 0)["score"] < 40


def _rows(kind, vals, start=dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc)):
    return [{"kind": kind, "value": v, "recorded_at": iso(start + dt.timedelta(days=i))} for i, v in enumerate(vals)]


def test_anomaly_detected_and_reported():
    t = analytics.trends(_rows("heart_rate", [72, 74, 71, 73, 72, 75, 73, 190]))
    assert t["series"]["heart_rate"]["anomalies"] == [7] and any("unusual" in i for i in t["insights"])


def test_no_anomaly_in_steady_series():
    assert analytics.trends(_rows("heart_rate", [72, 73, 72, 74, 73, 72]))["series"]["heart_rate"]["anomalies"] == []


def test_forecast_band_contains_forecast():
    s = analytics.trends(_rows("weight_kg", [70, 70.4, 70.1, 70.9, 70.6, 71.2, 71.0]))["series"]["weight_kg"]
    lo, hi = s["forecast_band"]
    assert lo <= s["forecast_7d"] <= hi


def test_correlation_found_between_metrics():
    rng = np.random.default_rng(1)
    w = list(70 + np.arange(10) * 0.5 + rng.normal(0, .1, 10))
    sbp = [110 + (x - 70) * 4 for x in w]
    c = analytics.trends(_rows("weight_kg", w) + _rows("systolic_bp", sbp))["correlations"]
    assert c and c[0]["r"] > 0.9


def test_bp_pair_not_reported_as_correlation():
    assert analytics.trends(_rows("systolic_bp", list(range(120, 130))) + _rows("diastolic_bp", list(range(80, 90))))["correlations"] == []


def _state(**o):
    s = {"now": NOW, "profile": {"age": 50}, "n_contacts": 1, "medications": [], "reminders": [], "appointments": [], "symptom_checks": [],
         "trends": {"insights": []}, "adherence": {"pct": 95}, "idrs": {"available": False}, "completeness": {"pct": 100, "missing": []}, "vitals_14d": 3}
    s.update(o); return s


def test_nba_empty_state_only_suggests_screenings():
    assert [a["id"] for a in nba.next_actions(_state())] == ["screenings"]


def test_nba_priorities_and_limit():
    s = _state(n_contacts=0, symptom_checks=[{"risk_level": "see_doctor_today", "created_at": iso(NOW - dt.timedelta(hours=3))}],
               trends={"insights": ["systolic bp: rising"]}, adherence={"pct": 40}, medications=[{"id": "m1", "name": "Metformin"}],
               completeness={"pct": 40, "missing": ["your height"]}, vitals_14d=0)
    acts = nba.next_actions(s)
    assert acts[0]["id"] == "book_after_check" and len(acts) == 5
    assert [a["priority"] for a in acts] == sorted(a["priority"] for a in acts)


def test_nba_no_booking_nudge_if_already_booked():
    s = _state(symptom_checks=[{"risk_level": "emergency", "created_at": iso(NOW - dt.timedelta(hours=1))}],
               appointments=[{"scheduled_at": iso(NOW + dt.timedelta(days=2))}])
    assert "book_after_check" not in [a["id"] for a in nba.next_actions(s)]
