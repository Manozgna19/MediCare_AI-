import datetime as dt
from app.services import risk_model, analytics, hereditary, safety


def test_risk_mild_is_self_care():
    assert risk_model.estimate(["runny_nose", "sore_throat"], 28, 2, 2)["level"] == "self_care"


def test_red_flags_force_emergency():
    assert risk_model.estimate(["chest_pain", "shortness_of_breath"], 55, 3, 0)["level"] == "emergency"
    assert risk_model.estimate(["facial_droop", "slurred_speech"], 60, 5, 0)["level"] == "emergency"


def test_unknown_symptoms_ignored():
    r = risk_model.estimate(["fever", "made_up"], 30, 4, 2)
    assert r["recognised_symptoms"] == ["fever"]


def test_trend_flags_rising_bp():
    rows = [{"kind": "systolic_bp", "value": 118 + i * 2.5, "recorded_at": (dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc) + dt.timedelta(days=i)).isoformat()} for i in range(10)]
    t = analytics.trends(rows)
    assert any("trending upward" in i for i in t["insights"])
    assert t["series"]["systolic_bp"]["forecast_7d"] > 140


def test_trends_empty():
    assert analytics.trends([]) == {"series": {}, "insights": [], "correlations": []}


def test_hereditary_two_first_degree_is_higher():
    r = hereditary.analyse([{"relation": "father", "condition": "Type 2 Diabetes", "age_at_diagnosis": 45}, {"relation": "mother", "condition": "type 2 diabetes"}])
    assert r[0]["concern_level"] == "higher"


def test_hereditary_distant_relative_is_mild():
    assert hereditary.analyse([{"relation": "uncle", "condition": "asthma"}])[0]["concern_level"] == "mild"


def test_safety_detection_languages():
    assert safety.detect("I have chest pain") == "medical"
    assert safety.detect("मुझे सीने में दर्द है") == "medical"
    assert safety.detect("ఛాతీ నొప్పి గా ఉంది") == "medical"
    assert safety.detect("I want to die") == "self_harm"
    assert safety.detect("I had a headache yesterday") is None


def test_self_harm_has_priority_and_helpline():
    assert safety.detect("chest pain and I want to end my life") == "self_harm"
    assert "14416" in safety.emergency_reply("self_harm")["reply"]


def test_allergy_class_conflict():
    assert safety.allergy_conflicts("Amoxicillin 500", ["Penicillin"])
    assert safety.allergy_conflicts("Brufen", ["NSAIDs"])
    assert not safety.allergy_conflicts("Paracetamol", ["Penicillin"])
