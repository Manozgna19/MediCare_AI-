from datetime import datetime, timedelta, timezone
from app.services import maps, scheduler
from app.services import gemini

NOW = lambda: datetime.now(timezone.utc)
iso = lambda d: d.isoformat()


def doctors(db):
    db.tables["doctors"] = [
        {"id": "d1", "name": "Dr Heart", "specialty": "Cardiologist", "city": "Hyderabad", "lat": 17.4, "lng": 78.4, "languages": ["English", "Telugu"], "fee_inr": 900, "rating": 4.7, "teleconsult": True},
        {"id": "d2", "name": "Dr Skin", "specialty": "Dermatologist", "city": "Hyderabad", "lat": 17.5, "lng": 78.5, "languages": ["English"], "fee_inr": 500, "rating": 4.2, "teleconsult": False}]
    db.tables["doctor_slots"] = [
        {"id": "s1", "doctor_id": "d1", "starts_at": iso(NOW() + timedelta(days=3)), "booked": False},
        {"id": "s2", "doctor_id": "d1", "starts_at": iso(NOW() + timedelta(days=4)), "booked": False},
        {"id": "s3", "doctor_id": "d2", "starts_at": iso(NOW() + timedelta(days=1)), "booked": False}]


# ---- symptoms ----
def test_followups_endpoint(client, alice):
    r = client.get("/api/symptoms/followups?symptoms=fever,fatigue", headers=alice).json()
    assert {q["symptom"] for q in r} == {"fever"}


def test_followup_answer_escalates_check(client, alice, llm):
    r = client.post("/api/symptoms/check", json={"symptoms": ["headache"], "severity": 3, "answers": {"headache_sudden": True}}, headers=alice).json()
    assert r["triage"]["level"] == "emergency" and r["triage"]["reasons"] and r["specialties"][0]["specialty"] == "Neurologist"


def test_chronic_condition_bumps_mild_case(client, alice, llm, db):
    db.tables["profiles"] = [{"id": "user-alice", "age": 40, "conditions": ["Diabetes"]}]
    r = client.post("/api/symptoms/check", json={"symptoms": ["runny_nose"], "severity": 4, "duration_days": 1}, headers=alice).json()
    assert r["triage"]["level"] != "self_care"


# ---- doctors ----
def test_doctor_filters_and_next_slot(client, alice, db):
    doctors(db)
    assert [d["name"] for d in client.get("/api/doctors?language=telugu", headers=alice).json()] == ["Dr Heart"]
    assert [d["name"] for d in client.get("/api/doctors?max_fee=600", headers=alice).json()] == ["Dr Skin"]
    assert [d["name"] for d in client.get("/api/doctors?teleconsult=true", headers=alice).json()] == ["Dr Heart"]
    r = client.get("/api/doctors?sort=soonest", headers=alice).json()
    assert r[0]["name"] == "Dr Skin" and r[0]["next_slot"]


def test_doctor_sort_rating_and_bad_sort(client, alice, db):
    doctors(db)
    assert client.get("/api/doctors?sort=rating", headers=alice).json()[0]["name"] == "Dr Heart"
    assert client.get("/api/doctors?sort=nonsense", headers=alice).status_code == 422


def test_reschedule_same_doctor(client, alice, db):
    doctors(db)
    aid = client.post("/api/appointments", json={"slot_id": "s1"}, headers=alice).json()["id"]
    r = client.post(f"/api/appointments/{aid}/reschedule", json={"slot_id": "s2"}, headers=alice)
    assert r.status_code == 200
    slots = {s["id"]: s["booked"] for s in db.tables["doctor_slots"]}
    assert slots["s1"] is False and slots["s2"] is True


def test_reschedule_other_doctor_rejected_and_slot_released(client, alice, db):
    doctors(db)
    aid = client.post("/api/appointments", json={"slot_id": "s1"}, headers=alice).json()["id"]
    assert client.post(f"/api/appointments/{aid}/reschedule", json={"slot_id": "s3"}, headers=alice).status_code == 409
    assert {s["id"]: s["booked"] for s in db.tables["doctor_slots"]}["s3"] is False


def test_reschedule_not_yours(client, alice, bob, db):
    doctors(db)
    aid = client.post("/api/appointments", json={"slot_id": "s1"}, headers=alice).json()["id"]
    assert client.post(f"/api/appointments/{aid}/reschedule", json={"slot_id": "s2"}, headers=bob).status_code == 404


def test_ics_download(client, alice, bob, db):
    doctors(db)
    aid = client.post("/api/appointments", json={"slot_id": "s1", "reason": "Chest, tightness"}, headers=alice).json()["id"]
    r = client.get(f"/api/appointments/{aid}/ics", headers=alice)
    assert r.headers["content-type"].startswith("text/calendar") and "BEGIN:VEVENT" in r.text and "Dr Heart" in r.text and "Chest\\, tightness" in r.text
    assert client.get(f"/api/appointments/{aid}/ics", headers=bob).status_code == 404


# ---- medications ----
def test_adding_interacting_medicine_reports_it(client, alice):
    client.post("/api/medications", json={"name": "Warfarin"}, headers=alice)
    r = client.post("/api/medications", json={"name": "Ibuprofen"}, headers=alice).json()
    assert r["interactions"][0]["severity"] == "high"
    assert client.get("/api/medications/interactions", headers=alice).json()


# ---- reports ----
def test_lab_trends_across_reports(client, alice, db):
    db.tables["reports"] = [
        {"id": "r1", "user_id": "user-alice", "created_at": "2026-08-01T00:00:00+00:00", "parsed": {"lab_results": [{"test": "HbA1c", "value": "6.8", "unit": "%", "flag": "high"}, {"test": "Hb", "value": "13", "flag": "normal"}]}},
        {"id": "r2", "user_id": "user-alice", "created_at": "2026-10-01T00:00:00+00:00", "parsed": {"lab_results": [{"test": "hba1c", "value": "7.2 %", "unit": "%", "flag": "high"}, {"test": "Junk", "value": "n/a"}]}},
        {"id": "r3", "user_id": "user-bob", "created_at": "2026-10-01T00:00:00+00:00", "parsed": {"lab_results": [{"test": "HbA1c", "value": "9", "flag": "high"}]}}]
    r = client.get("/api/reports/lab-trends", headers=alice).json()
    a1c = next(t for t in r if t["test"].lower() == "hba1c")
    assert [p["v"] for p in a1c["points"]] == [6.8, 7.2] and a1c["change_pct"] == 5.9 and a1c["abnormal"]
    assert r[0]["test"].lower() == "hba1c" and not any(t["test"] == "Junk" for t in r)


def test_report_ask_is_private_and_safe(client, alice, bob, db, llm):
    db.tables["reports"] = [{"id": "r1", "user_id": "user-alice", "ocr_text": "Hb 13", "parsed": {}}]
    assert client.post("/api/reports/r1/ask", json={"question": "what is my Hb?"}, headers=alice).json()["answer"] == "explained"
    assert client.post("/api/reports/r1/ask", json={"question": "what is my Hb?"}, headers=bob).status_code == 404
    assert client.post("/api/reports/r1/ask", json={"question": "I have chest pain, what now"}, headers=alice).json()["urgent"] is True


def test_import_meds_reports_interactions(client, alice, db):
    client.post("/api/medications", json={"name": "Warfarin"}, headers=alice)
    db.tables["reports"] = [{"id": "r1", "user_id": "user-alice", "parsed": {"medications": [{"name": "Ibuprofen", "dose": "400mg"}]}}]
    r = client.post("/api/reports/r1/import-medications", json={}, headers=alice).json()
    assert r["imported"] == 1 and r["interactions"]


# ---- chat proposals ----
def test_chat_proposals_validated_and_stored(client, alice, monkeypatch):
    at = iso(NOW() + timedelta(hours=5))
    monkeypatch.setattr(gemini, "generate_json", lambda *a, **k: {"reply": "Sure", "proposals": [
        {"type": "reminder", "args": {"title": "Take metformin", "remind_at": at, "recurrence": "daily"}, "summary": "Daily reminder"},
        {"type": "vital", "args": {"kind": "systolic_bp", "value": 9000}, "summary": "bad"},
        {"type": "vital", "args": {"kind": "heart_rate", "value": 72}, "summary": "ok"},
        {"type": "hack", "args": {}, "summary": "x"}]})
    r = client.post("/api/chat", json={"message": "remind me daily and log hr 72"}, headers=alice).json()
    assert [p["type"] for p in r["proposals"]] == ["reminder", "vital"]
    h = client.get("/api/chat/history", headers=alice).json()
    assert [m["role"] for m in h] == ["user", "assistant"]
    assert client.delete("/api/chat/history", headers=alice).json()["ok"] and client.get("/api/chat/history", headers=alice).json() == []


def test_chat_execute_creates_records_and_validates(client, alice, db):
    at = iso(NOW() + timedelta(hours=5))
    assert client.post("/api/chat/execute", json={"type": "reminder", "args": {"title": "Walk", "remind_at": at}}, headers=alice).json()["ok"]
    assert db.tables["reminders"][0]["user_id"] == "user-alice"
    assert client.post("/api/chat/execute", json={"type": "vital", "args": {"kind": "spo2", "value": 97}}, headers=alice).json()["ok"]
    assert client.post("/api/chat/execute", json={"type": "vital", "args": {"kind": "spo2", "value": 500}}, headers=alice).status_code == 422
    assert client.post("/api/chat/execute", json={"type": "delete_everything", "args": {}}, headers=alice).status_code == 422


def test_chat_history_is_private(client, alice, bob, llm):
    client.post("/api/chat", json={"message": "hello"}, headers=alice)
    assert client.get("/api/chat/history", headers=bob).json() == []


# ---- doses ----
def seed_due_medication(db):
    past = iso(NOW() - timedelta(minutes=5))
    db.tables["reminders"] = [{"id": "r1", "user_id": "user-alice", "kind": "medication", "title": "Take Metformin", "remind_at": past, "recurrence": "daily", "sent": False, "ref_id": "m1"}]


def test_dose_flow_taken_and_adherence(client, alice, db, monkeypatch):
    monkeypatch.setattr(scheduler, "send_push", lambda *a, **k: [])
    seed_due_medication(db); scheduler.dispatch_due()
    logged = client.get("/api/reminders/doses", headers=alice).json()["logged"]
    assert logged[0]["title"] == "Metformin" and logged[0]["status"] == "pending"
    assert client.post(f"/api/reminders/doses/{logged[0]['id']}", json={"status": "taken"}, headers=alice).json()["status"] == "taken"
    assert client.get("/api/reminders/doses", headers=alice).json()["logged"][0]["status"] == "taken"


def test_dose_status_validation_and_isolation(client, alice, bob, db, monkeypatch):
    monkeypatch.setattr(scheduler, "send_push", lambda *a, **k: [])
    seed_due_medication(db); scheduler.dispatch_due()
    did = db.tables["dose_logs"][0]["id"]
    assert client.post(f"/api/reminders/doses/{did}", json={"status": "bogus"}, headers=alice).status_code == 422
    assert client.post(f"/api/reminders/doses/{did}", json={"status": "taken"}, headers=bob).status_code == 404


def test_snooze_creates_one_off_reminder(client, alice, db, monkeypatch):
    monkeypatch.setattr(scheduler, "send_push", lambda *a, **k: [])
    seed_due_medication(db); scheduler.dispatch_due()
    did = db.tables["dose_logs"][0]["id"]
    r = client.post(f"/api/reminders/doses/{did}/snooze", json={"minutes": 15}, headers=alice).json()
    assert r["recurrence"] == "none" and r["title"] == "Take Metformin"
    assert db.tables["dose_logs"][0]["status"] == "snoozed"
    assert client.post(f"/api/reminders/doses/{did}/snooze", json={"minutes": 1}, headers=alice).status_code == 422


def test_adherence_endpoint(client, alice, db):
    db.tables["dose_logs"] = [{"id": str(i), "user_id": "user-alice", "title": "Metformin", "scheduled_for": iso(NOW() - timedelta(days=i + 1)), "status": "taken" if i % 2 == 0 else "skipped"} for i in range(4)]
    r = client.get("/api/reminders/adherence", headers=alice).json()
    assert r["pct"] == 50 and r["per_medicine"][0]["title"] == "Metformin"


# ---- vitals ----
def test_bp_endpoint_validation(client, alice, db):
    assert client.post("/api/vitals/bp", json={"systolic": 80, "diastolic": 90}, headers=alice).status_code == 422
    assert client.post("/api/vitals/bp", json={"systolic": 400, "diastolic": 90}, headers=alice).status_code == 422
    assert client.post("/api/vitals/bp", json={"systolic": 128, "diastolic": 82}, headers=alice).json()["ok"]
    assert sorted(v["kind"] for v in db.tables["vitals"]) == ["diastolic_bp", "systolic_bp"]


def test_vital_bounds_and_delete(client, alice, bob, db):
    assert client.post("/api/vitals", json={"kind": "spo2", "value": 140}, headers=alice).status_code == 422
    vid = client.post("/api/vitals", json={"kind": "spo2", "value": 97}, headers=alice).json()["id"]
    client.delete(f"/api/vitals/{vid}", headers=bob)
    assert len(db.tables["vitals"]) == 1
    client.delete(f"/api/vitals/{vid}", headers=alice)
    assert db.tables["vitals"] == []


def test_analytics_has_v2_fields(client, alice, db, llm):
    db.tables["profiles"] = [{"id": "user-alice", "age": 52, "sex": "male", "waist_cm": 95, "activity_level": "sedentary", "height_cm": 170}]
    for v in (118, 122, 127, 131, 137, 141):
        client.post("/api/vitals", json={"kind": "systolic_bp", "value": v}, headers=alice)
    r = client.get("/api/analytics?explain=true", headers=alice).json()
    assert r["idrs"]["available"] and "forecast_band" in r["series"]["systolic_bp"] and r["health_score"]["score"] >= 0 and r["explanation"]


# ---- SOS ----
def test_sos_safe_and_medical_id(client, alice, db):
    db.tables["profiles"] = [{"id": "user-alice", "full_name": "Alice", "blood_group": "O+", "allergies": ["nuts"], "conditions": ["asthma"]}]
    client.post("/api/sos/contacts", json={"name": "Mom", "phone": "+911"}, headers=alice)
    client.post("/api/medications", json={"name": "Salbutamol"}, headers=alice)
    s = client.post("/api/sos/safe", headers=alice).json()
    assert "safe now" in s["message"] and s["links"][0]["sms"].startswith("sms:+911")
    m = client.get("/api/sos/medical-id", headers=alice).json()
    assert m["profile"]["blood_group"] == "O+" and m["medications"][0]["name"] == "Salbutamol" and m["contacts"][0]["name"] == "Mom"


class _Resp:
    def raise_for_status(self): pass
    def json(self): return {"places": [
        {"displayName": {"text": "Open Pharmacy"}, "location": {"latitude": 17.41, "longitude": 78.45}, "googleMapsUri": "u1", "currentOpeningHours": {"openNow": True}, "rating": 4.1},
        {"displayName": {"text": "Closed Pharmacy"}, "location": {"latitude": 17.42, "longitude": 78.46}, "googleMapsUri": "u2", "currentOpeningHours": {"openNow": False}},
        {"displayName": {"text": "Unknown Hours"}, "location": {"latitude": 17.43, "longitude": 78.47}, "googleMapsUri": "u3"}]}


def test_nearby_kinds_filter_and_validation(client, alice, monkeypatch):
    sent = {}
    monkeypatch.setattr(maps.httpx, "post", lambda url, json, headers, timeout: sent.update(json) or _Resp())
    r = client.get("/api/sos/hospitals?lat=17.4&lng=78.4&kind=pharmacy", headers=alice).json()
    assert sent["includedTypes"] == ["pharmacy"] and len(r) == 3 and r[0]["distance_km"] >= 0
    names = [p["name"] for p in client.get("/api/sos/hospitals?lat=17.4&lng=78.4&kind=pharmacy&open_now=true", headers=alice).json()]
    assert names == ["Open Pharmacy", "Unknown Hours"]
    assert client.get("/api/sos/hospitals?lat=17.4&lng=78.4&kind=casino", headers=alice).status_code == 422
    assert client.get("/api/sos/hospitals?lat=17.4&lng=78.4&radius_m=99999", headers=alice).status_code == 422


# ---- dashboard, summary, privacy ----
def test_dashboard_aggregates_every_module(client, alice, db):
    db.tables["profiles"] = [{"id": "user-alice", "full_name": "Alice", "age": 50}]
    client.post("/api/vitals", json={"kind": "heart_rate", "value": 70}, headers=alice)
    d = client.get("/api/dashboard", headers=alice).json()
    assert d["name"] == "Alice" and 0 <= d["health_score"]["score"] <= 100 and d["vitals"]["heart_rate"]["status"] == "in_range"
    assert {a["id"] for a in d["actions"]} >= {"no_contact"} and d["timeline"][0]["type"] == "vital"


def test_summary_and_audit(client, alice, db):
    db.tables["profiles"] = [{"id": "user-alice", "full_name": "Alice", "allergies": ["nuts"]}]
    client.post("/api/medications", json={"name": "Metformin", "dose": "500mg"}, headers=alice)
    s = client.get("/api/dashboard/summary", headers=alice).json()
    assert s["profile"]["allergies"] == ["nuts"] and s["medications"][0]["name"] == "Metformin"
    assert db.tables["audit_log"][-1]["action"] == "summary_generated"


def test_profile_returns_completeness(client, alice):
    assert client.get("/api/profile", headers=alice).json()["completeness"]["pct"] == 0


def test_export_includes_new_tables(client, alice, bob, llm):
    client.post("/api/chat", json={"message": "hi"}, headers=alice)
    client.post("/api/chat", json={"message": "hi"}, headers=bob)
    exp = client.get("/api/privacy/export", headers=alice).json()
    assert "dose_logs" in exp and len(exp["chat_messages"]) == 2 and all(m["user_id"] == "user-alice" for m in exp["chat_messages"])
