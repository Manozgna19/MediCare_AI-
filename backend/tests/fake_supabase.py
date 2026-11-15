"""Minimal in-memory stand-in for the supabase-py client (just what this app uses)."""
import uuid
from datetime import datetime, timezone

DEFAULTS = {
    "doctor_slots": {"booked": False}, "reminders": {"sent": False, "recurrence": "none"},
    "medications": {"active": True}, "appointments": {"status": "confirmed"},
}


class Result:
    def __init__(self, data): self.data = data


class Query:
    def __init__(self, db, name):
        self.db, self.name, self.mode, self.payload = db, name, "select", None
        self.filters, self._order, self._limit, self._single = [], None, None, None
        self._on_conflict = None

    def select(self, *a, **k): return self
    def insert(self, row): self.mode, self.payload = "insert", row; return self
    def update(self, row): self.mode, self.payload = "update", row; return self
    def upsert(self, row, on_conflict=None): self.mode, self.payload, self._on_conflict = "upsert", row, on_conflict; return self
    def delete(self): self.mode = "delete"; return self
    def eq(self, c, v): self.filters.append(("eq", c, v)); return self
    def gte(self, c, v): self.filters.append(("gte", c, v)); return self
    def lte(self, c, v): self.filters.append(("lte", c, v)); return self
    def in_(self, c, v): self.filters.append(("in", c, v)); return self
    def ilike(self, c, v): self.filters.append(("ilike", c, v.strip("%").lower())); return self
    def order(self, c, desc=False): self._order = (c, desc); return self
    def limit(self, n): self._limit = n; return self
    def maybe_single(self): self._single = "maybe"; return self
    def single(self): self._single = "one"; return self

    def _match(self, row):
        for op, c, v in self.filters:
            x = row.get(c)
            if op == "eq" and x != v: return False
            if op == "gte" and (x is None or x < v): return False
            if op == "lte" and (x is None or x > v): return False
            if op == "in" and x not in v: return False
            if op == "ilike" and v not in str(x or "").lower(): return False
        return True

    def execute(self):
        rows = self.db.tables.setdefault(self.name, [])
        if self.mode == "insert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            out = []
            for it in items:
                now = datetime.now(timezone.utc).isoformat()
                r = {"id": str(uuid.uuid4()), "created_at": now, **({"recorded_at": now} if self.name == "vitals" else {}), **DEFAULTS.get(self.name, {}), **it}
                rows.append(r); out.append(dict(r))
            return Result(out)
        if self.mode == "upsert":
            key = self._on_conflict or "id"
            for r in rows:
                if r.get(key) == self.payload.get(key):
                    r.update(self.payload); return Result([dict(r)])
            r = {"created_at": datetime.now(timezone.utc).isoformat(), **self.payload}
            r.setdefault("id", str(uuid.uuid4())); rows.append(r); return Result([dict(r)])
        hit = [r for r in rows if self._match(r)]
        if self.mode == "update":
            for r in hit: r.update(self.payload)
            return Result([dict(r) for r in hit])
        if self.mode == "delete":
            for r in hit: rows.remove(r)
            return Result([dict(r) for r in hit])
        if self._order:
            c, desc = self._order
            hit.sort(key=lambda r: (r.get(c) is None, r.get(c)), reverse=desc)
        if self._limit: hit = hit[: self._limit]
        if self._single == "maybe": return Result(dict(hit[0]) if hit else None)
        if self._single == "one":
            if not hit: raise LookupError("no rows")
            return Result(dict(hit[0]))
        return Result([dict(r) for r in hit])


class _Bucket:
    def __init__(self, store, name): self.store, self.name = store, name
    def upload(self, path, data, opts=None): self.store[(self.name, path)] = data
    def list(self, prefix): return [{"name": p.split("/", 1)[1]} for (b, p) in self.store if b == self.name and p.startswith(prefix + "/")]
    def remove(self, paths): [self.store.pop((self.name, p), None) for p in paths]
    def create_signed_url(self, path, ttl): return {"signedURL": f"https://files.test/{path}"}


class _Storage:
    def __init__(self, store): self.store = store
    def from_(self, name): return _Bucket(self.store, name)


class _Admin:
    def __init__(self, db): self.db = db
    def delete_user(self, uid):
        self.db.deleted_users.append(uid)
        for rows in self.db.tables.values():  # emulate ON DELETE CASCADE
            rows[:] = [r for r in rows if r.get("user_id") != uid and r.get("id") != uid or r.get("doctor_id")]


class FakeSupabase:
    def __init__(self):
        self.tables, self.files, self.deleted_users = {}, {}, []
        self.storage = _Storage(self.files)
        self.auth = type("A", (), {"admin": _Admin(self)})()

    def table(self, name): return Query(self, name)
