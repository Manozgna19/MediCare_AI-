"""Local-setup behaviour: configuration, token verification fallback, optional integrations."""
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from app import deps
from app.config import load_settings
from app.services import gemini, maps, ocr


def test_missing_required_settings_gives_clear_message():
    with pytest.raises(RuntimeError) as e:
        load_settings({})
    assert "SUPABASE_URL" in str(e.value) and "SUPABASE_KEY" in str(e.value) and ".env.example" in str(e.value)


def test_new_and_legacy_key_names_both_work():
    assert load_settings({"SUPABASE_URL": "https://x.supabase.co/", "SUPABASE_KEY": "a"}).supabase_key == "a"
    s = load_settings({"SUPABASE_URL": "https://x.supabase.co/", "SUPABASE_SERVICE_KEY": "legacy"})
    assert s.supabase_key == "legacy" and s.supabase_url == "https://x.supabase.co"   # trailing slash trimmed
    assert s.supabase_jwt_secret == "" and s.gemini_api_key == ""                      # optional values default to empty


def test_defaults_allow_vite_dev_origin():
    assert "http://localhost:5173" in load_settings({"SUPABASE_URL": "u", "SUPABASE_KEY": "k"}).cors_origins


def test_token_verified_via_supabase_when_no_jwt_secret(client, db, monkeypatch):
    monkeypatch.setattr(deps.settings, "supabase_jwt_secret", "")
    calls = []
    def get_user(token): calls.append(token); return SimpleNamespace(user=SimpleNamespace(id="user-remote"))
    monkeypatch.setattr(deps.sb.auth, "get_user", get_user, raising=False)
    h = {"Authorization": "Bearer opaque-or-es256-token"}
    db.tables["profiles"] = [{"id": "user-remote", "full_name": "Remote"}]
    assert client.get("/api/profile", headers=h).json()["full_name"] == "Remote"
    client.get("/api/profile", headers=h)
    assert len(calls) == 1          # second request served from the short-lived cache


def test_supabase_rejecting_token_gives_401(client, monkeypatch):
    monkeypatch.setattr(deps.settings, "supabase_jwt_secret", "")
    def reject(token): raise RuntimeError("invalid JWT")
    monkeypatch.setattr(deps.sb.auth, "get_user", reject, raising=False)
    assert client.get("/api/profile", headers={"Authorization": "Bearer bad"}).status_code == 401


def test_db_health_endpoint(client):
    assert client.get("/health/db").json() == {"status": "ok", "supabase": "reachable"}


def test_ai_without_key_is_a_friendly_503(client, alice, monkeypatch):
    monkeypatch.setattr(gemini, "client", None)
    r = client.post("/api/chat", json={"message": "hello"}, headers=alice)
    assert r.status_code == 503 and "GEMINI_API_KEY" in r.json()["detail"]


def test_symptom_triage_still_works_without_ai_key(client, alice, monkeypatch):
    monkeypatch.setattr(gemini, "client", None)
    r = client.post("/api/symptoms/check", json={"symptoms": ["fever"]}, headers=alice)
    assert r.status_code == 200 and r.json()["guidance"] == {}


def test_maps_without_key_is_a_friendly_503(client, alice, monkeypatch):
    monkeypatch.setattr(maps.settings, "google_maps_api_key", "")
    r = client.get("/api/sos/hospitals?lat=17&lng=78", headers=alice)
    assert r.status_code == 503 and "GOOGLE_MAPS_API_KEY" in r.json()["detail"]


def test_maps_upstream_failure_is_502(client, alice, monkeypatch):
    def boom(*a, **k): raise maps.httpx.ConnectError("down")
    monkeypatch.setattr(maps.httpx, "post", boom)
    assert client.get("/api/sos/hospitals?lat=17&lng=78", headers=alice).status_code == 502


def test_missing_tesseract_is_a_friendly_503(client, alice, monkeypatch):
    def nope(*a, **k): raise ocr.pytesseract.TesseractNotFoundError()
    monkeypatch.setattr(ocr.pytesseract, "image_to_string", nope)
    import io
    from PIL import Image
    buf = io.BytesIO(); Image.new("RGB", (20, 20), "white").save(buf, "PNG")
    r = client.post("/api/reports/scan", files={"file": ("a.png", buf.getvalue(), "image/png")}, headers=alice)
    assert r.status_code == 503 and "Tesseract" in r.json()["detail"]


def test_corrupt_image_is_422_not_500(client, alice):
    r = client.post("/api/reports/scan", files={"file": ("a.png", b"not an image", "image/png")}, headers=alice)
    assert r.status_code == 422
