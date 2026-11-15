import os
import sys
import time
from pathlib import Path

os.environ.update(SUPABASE_URL="http://fake", SUPABASE_KEY="k", SUPABASE_JWT_SECRET="test-secret-test-secret-test-secret!",
                  GEMINI_API_KEY="fake", GOOGLE_MAPS_API_KEY="fake")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import jwt as pyjwt  # noqa: E402
import pytest  # noqa: E402
import supabase  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

_fake = FakeSupabase()
supabase.create_client = lambda *a, **k: _fake  # must happen before the app imports db.py

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app import middleware, deps  # noqa: E402
from app.services import gemini  # noqa: E402


def token_for(uid: str) -> dict:
    t = pyjwt.encode({"sub": uid, "aud": "authenticated", "exp": int(time.time()) + 3600}, os.environ["SUPABASE_JWT_SECRET"], algorithm="HS256")
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(autouse=True)
def clean():
    _fake.tables.clear(); _fake.files.clear(); _fake.deleted_users.clear(); middleware.reset(); deps.clear_cache()
    yield


@pytest.fixture
def db(): return _fake


@pytest.fixture
def client(): return TestClient(app)


@pytest.fixture
def alice(): return token_for("user-alice")


@pytest.fixture
def bob(): return token_for("user-bob")


@pytest.fixture
def llm(monkeypatch):
    """Replace Gemini with a recorder so tests are offline and can assert it was (not) called."""
    calls = []
    def fake_json(prompt, system="", language="en"):
        calls.append(prompt)
        return {"reply": "ok", "urgent": False, "actions": [{"feature": "doctors", "label": "Find"}, {"feature": "bogus", "label": "x"}],
                "possible_causes": [], "self_care": [], "warning_signs": [], "when_to_seek_care": "rest"}
    monkeypatch.setattr(gemini, "generate_json", fake_json)
    monkeypatch.setattr(gemini, "generate", lambda *a, **k: "explained")
    return calls
