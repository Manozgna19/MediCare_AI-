from datetime import datetime, timedelta, timezone
from app import middleware
from app.services import scheduler


def seed_doctor(db):
    d = {"id": "doc1", "name": "Dr A", "specialty": "Cardiologist", "city": "Hyderabad", "lat": 17.4, "lng": 78.4}
    start = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    db.tables["doctors"] = [d]
    db.tables["doctor_slots"] = [{"id": "slot1", "doctor_id": "doc1", "starts_at": start, "booked": False}]


# ---- auth ----
def test_requires_auth(client):
    assert client.get("/api/profile").status_code in (401, 403)


def test_rejects_garbage_token(client):
    assert client.get("/api/profile", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_security_headers(client, alice):
    r = client.get("/api/profile", headers=alice)
    assert r.headers["cache-control"] == "no-store" and r.headers["x-content-type-options"] == "nosniff"


# ---- symptoms ----
def test_symptom_check_saves_and_returns(client, alice, db, llm):
    r = client.post("/api/symptoms/check", json={"symptoms": ["fever", "cough"], "severity": 4}, headers=alice)
    assert r.status_code == 200 and r.json()["triage"]["level"] in ("self_care", "see_doctor_soon", "see_doctor_today", "emergency")
    assert len(db.tables["symptom_checks"]) == 1 and db.tables["symptom_checks"][0]["user_id"] == "user-alice"


def test_symptom_free_text_red_flag_escalates(client, alice, llm):
    r = client.post("/api/symptoms/check", json={"symptoms": ["fatigue"], "free_text": "crushing chest pain", "severity": 2}, headers=alice)
    assert r.json()["triage"]["level"] == "emergency"


def test_symptom_check_survives_llm_outage(client, alice, monkeypatch):
    from fastapi import HTTPException
    from app.services import gemini
    def boom(*a, **k): raise HTTPException(503, "down")
    monkeypatch.setattr(gemini, "generate_json", boom)
    r = client.post("/api/symptoms/check", json={"symptoms": ["fever"]}, headers=alice)
    assert r.status_code == 200 and r.json()["guidance"] == {}


def test_symptom_validation(client, alice):
    assert client.post("/api/symptoms/check", json={"symptoms": []}, headers=alice).status_code == 422
    assert client.post("/api/symptoms/check", json={"symptoms": ["fever"], "severity": 11}, headers=alice).status_code == 422


# ---- chat ----
def test_chat_emergency_bypasses_llm(client, alice, llm, db):
    r = client.post("/api/chat", json={"message": "I have chest pain", "language": "te-IN"}, headers=alice).json()
    assert r["urgent"] and r["safety_override"] == "medical" and llm == []
    assert any(a["action"] == "safety_override" for a in db.tables["audit_log"])


def test_chat_filters_unknown_actions_and_uses_consent(client, alice, llm, db):
    db.tables["profiles"] = [{"id": "user-alice", "full_name": "Alice", "allergies": ["penicillin"], "ai_consent": {"medications": False}}]
    db.tables["medications"] = [{"user_id": "user-alice", "name": "SECRET-MED", "active": True}]
    r = client.post("/api/chat", json={"message": "hello"}, headers=alice).json()
    assert [a["feature"] for a in r["actions"]] == ["doctors"]


def test_chat_context_excludes_unconsented_data(db):
    from app.services.context import build_context
    db.tables["profiles"] = [{"id": "u", "ai_consent": {"medications": False}}]
    db.tables["medications"] = [{"user_id": "u", "name": "X", "active": True}]
    ctx = build_context("u")
    assert "medications" not in ctx and "profile" in ctx


# ---- doctors & booking ----
def test_booking_is_exclusive_and_isolated(client, alice, bob, db):
    seed_doctor(db)
    assert client.post("/api/appointments", json={"slot_id": "slot1"}, headers=alice).status_code == 200
    assert client.post("/api/appointments", json={"slot_id": "slot1"}, headers=bob).status_code == 409
    appt_id = db.tables["appointments"][0]["id"]
    assert client.delete(f"/api/appointments/{appt_id}", headers=bob).status_code == 404   # can't cancel someone else's
    assert client.delete(f"/api/appointments/{appt_id}", headers=alice).status_code == 200
    assert db.tables["doctor_slots"][0]["booked"] is False                                  # slot released


def test_booking_creates_reminders(client, alice, db):
    seed_doctor(db)
    client.post("/api/appointments", json={"slot_id": "slot1"}, headers=alice)
    assert len(db.tables["reminders"]) == 2


def test_doctor_search_by_distance(client, alice, db):
    seed_doctor(db)
    db.tables["doctors"].append({"id": "doc2", "name": "Far", "specialty": "Cardiologist", "city": "Delhi", "lat": 28.6, "lng": 77.2})
    r = client.get("/api/doctors?specialty=cardio&lat=17.4&lng=78.4", headers=alice).json()
    assert [d["name"] for d in r] == ["Dr A", "Far"]


# ---- medications ----
def test_medication_allergy_warning_and_reminders(client, alice, db):
    db.tables["profiles"] = [{"id": "user-alice", "allergies": ["Penicillin"]}]
    when = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    r = client.post("/api/medications", json={"name": "Amoxicillin", "dose": "500mg", "reminder_times": [when]}, headers=alice).json()
    assert r["warnings"] and len(db.tables["reminders"]) == 1 and db.tables["reminders"][0]["recurrence"] == "daily"


def test_stopping_medication_removes_reminders(client, alice, db):
    when = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    mid = client.post("/api/medications", json={"name": "Metformin", "reminder_times": [when]}, headers=alice).json()["id"]
    client.patch(f"/api/medications/{mid}/stop", headers=alice)
    assert db.tables["reminders"] == []


# ---- SOS ----
def test_sos_builds_links_and_audits(client, alice, db):
    db.tables["profiles"] = [{"id": "user-alice", "full_name": "Alice", "blood_group": "B+", "allergies": ["nuts"]}]
    client.post("/api/sos/contacts", json={"name": "Mom", "phone": "+919999999999"}, headers=alice)
    r = client.post("/api/sos/trigger", json={"lat": 17.4, "lng": 78.4}, headers=alice).json()
    assert "17.4,78.4" in r["message"] and "B+" in r["message"] and r["links"][0]["whatsapp"].startswith("https://wa.me/919999999999")
    assert db.tables["audit_log"][0]["action"] == "sos_triggered"


def test_sos_without_location_permission(client, alice):
    r = client.post("/api/sos/trigger", json={}, headers=alice).json()
    assert "location not shared" in r["message"]


def test_contacts_are_private(client, alice, bob):
    client.post("/api/sos/contacts", json={"name": "Mom", "phone": "1"}, headers=alice)
    assert client.get("/api/sos/contacts", headers=bob).json() == []


# ---- reports ----
def test_report_upload_rejects_bad_type(client, alice):
    r = client.post("/api/reports/scan", files={"file": ("x.exe", b"abc", "application/octet-stream")}, headers=alice)
    assert r.status_code == 415


def test_report_scan_pipeline(client, alice, db, monkeypatch, llm):
    from app.services import ocr
    monkeypatch.setattr(ocr, "extract_text", lambda d, c: "Tab Paracetamol 500mg twice daily for 5 days")
    monkeypatch.setattr(ocr, "structure", lambda t, l="en": {"doc_type": "prescription", "medications": [{"name": "Paracetamol", "dose": "500mg", "frequency": "BD"}], "summary_plain_language": "Fever medicine"})
    r = client.post("/api/reports/scan", files={"file": ("rx.png", b"\x89PNG", "image/png")}, headers=alice)
    assert r.status_code == 200 and r.json()["doc_type"] == "prescription"
    rid = r.json()["id"]
    assert client.post(f"/api/reports/{rid}/import-medications", json={}, headers=alice).json()["imported"] == 1


def test_report_unreadable(client, alice, monkeypatch):
    from app.services import ocr
    monkeypatch.setattr(ocr, "extract_text", lambda d, c: "  ")
    assert client.post("/api/reports/scan", files={"file": ("a.png", b"x", "image/png")}, headers=alice).status_code == 422


# ---- vitals/analytics, family ----
def test_vitals_validation_and_analytics(client, alice, llm):
    assert client.post("/api/vitals", json={"kind": "bogus", "value": 1}, headers=alice).status_code == 422
    for v in (120, 125, 131, 136, 142):
        client.post("/api/vitals", json={"kind": "systolic_bp", "value": v}, headers=alice)
    r = client.get("/api/analytics", headers=alice).json()
    assert "systolic_bp" in r["series"] and r["risk"]["band"] in ("low", "moderate", "high")


def test_family_analysis(client, alice):
    client.post("/api/family", json={"relation": "father", "condition": "heart disease", "age_at_diagnosis": 62}, headers=alice)
    assert client.get("/api/family/analysis", headers=alice).json()["results"][0]["concern_level"] == "elevated"


def test_family_early_onset_first_degree_is_higher(client, alice):
    client.post("/api/family", json={"relation": "father", "condition": "heart disease", "age_at_diagnosis": 48}, headers=alice)
    assert client.get("/api/family/analysis", headers=alice).json()["results"][0]["concern_level"] == "higher"


# ---- reminders & scheduler ----
def test_screenings_depend_on_age_and_sex(client, alice, db):
    db.tables["profiles"] = [{"id": "user-alice", "age": 50, "sex": "female"}]
    assert client.post("/api/reminders/screenings/generate", json={}, headers=alice).json()["created"] == 6
    assert client.post("/api/reminders/screenings/generate", json={}, headers=alice).json()["created"] == 0  # idempotent


def test_scheduler_sends_once_and_reschedules(db, monkeypatch):
    sent = []
    monkeypatch.setattr(scheduler, "send_push", lambda tokens, title, body, data=None: sent.append((tokens, title)) or [])
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    db.tables["device_tokens"] = [{"user_id": "u", "token": "t1"}]
    db.tables["reminders"] = [{"id": "r1", "user_id": "u", "kind": "medication", "title": "Take X", "remind_at": past, "recurrence": "daily", "sent": False},
                              {"id": "r2", "user_id": "u", "kind": "custom", "title": "Once", "remind_at": past, "recurrence": "none", "sent": False}]
    scheduler.dispatch_due()
    assert len(sent) == 2
    r1, r2 = db.tables["reminders"]
    assert r1["sent"] is False and r1["remind_at"] > datetime.now(timezone.utc).isoformat()   # daily one moved to the future
    assert r2["sent"] is True
    scheduler.dispatch_due()
    assert len(sent) == 2   # nothing re-sent


def test_scheduler_prunes_dead_tokens(db, monkeypatch):
    monkeypatch.setattr(scheduler, "send_push", lambda *a, **k: ["dead"])
    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    db.tables["device_tokens"] = [{"user_id": "u", "token": "dead"}, {"user_id": "u", "token": "ok"}]
    db.tables["reminders"] = [{"id": "r", "user_id": "u", "kind": "custom", "title": "T", "remind_at": past, "recurrence": "none", "sent": False}]
    scheduler.dispatch_due()
    assert [t["token"] for t in db.tables["device_tokens"]] == ["ok"]


# ---- privacy ----
def test_export_only_contains_own_data(client, alice, bob):
    client.post("/api/sos/contacts", json={"name": "Mom", "phone": "1"}, headers=alice)
    client.post("/api/sos/contacts", json={"name": "Dad", "phone": "2"}, headers=bob)
    exp = client.get("/api/privacy/export", headers=alice).json()
    assert [c["name"] for c in exp["emergency_contacts"]] == ["Mom"]


def test_delete_account_requires_confirmation(client, alice, db):
    assert client.request("DELETE", "/api/privacy/account", json={"confirm": "yes"}, headers=alice).status_code == 400
    assert client.request("DELETE", "/api/privacy/account", json={"confirm": "DELETE"}, headers=alice).json() == {"deleted": True}
    assert db.deleted_users == ["user-alice"]


# ---- rate limiting ----
def test_ai_endpoints_are_rate_limited(client, alice, llm):
    codes = [client.post("/api/chat", json={"message": "hi"}, headers=alice).status_code for _ in range(17)]
    assert codes[:15] == [200] * 15 and codes[15:] == [429, 429]


def test_rate_limit_is_per_user(client, alice, bob, llm):
    for _ in range(15): client.post("/api/chat", json={"message": "hi"}, headers=alice)
    assert client.post("/api/chat", json={"message": "hi"}, headers=bob).status_code == 200
