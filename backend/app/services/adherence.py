from collections import defaultdict
from datetime import timedelta
from .util import parse_ts


def compute(logs: list[dict], now, days: int = 30, grace_hours: int = 3) -> dict:
    """Dose adherence. A 'pending' dose older than the grace window counts as missed; snoozed doses are ignored."""
    since = now - timedelta(days=days)
    rows = []
    for l in logs:
        t = parse_ts(l["scheduled_for"])
        if t < since or t > now or l["status"] == "snoozed":
            continue
        st = l["status"]
        if st == "pending":
            if now - t < timedelta(hours=grace_hours):
                continue
            st = "missed"
        rows.append((t, l.get("title") or "Medicine", st))
    total, taken = len(rows), sum(1 for r in rows if r[2] == "taken")
    per: dict = defaultdict(lambda: [0, 0])
    day: dict = defaultdict(lambda: [0, 0])
    for t, title, st in rows:
        per[title][1] += 1; day[t.date().isoformat()][1] += 1
        if st == "taken":
            per[title][0] += 1; day[t.date().isoformat()][0] += 1
    streak, d = 0, now.date()
    while True:
        k = d.isoformat()
        if k not in day:
            if streak == 0 and d == now.date():
                d -= timedelta(days=1); continue
            break
        if day[k][0] != day[k][1]:
            break
        streak += 1; d -= timedelta(days=1)
    return {
        "pct": round(100 * taken / total) if total else None, "taken": taken, "total": total, "streak_days": streak,
        "per_medicine": [{"title": k, "taken": v[0], "total": v[1], "pct": round(100 * v[0] / v[1])} for k, v in sorted(per.items())],
        "by_day": [{"date": k, "taken": v[0], "total": v[1]} for k, v in sorted(day.items())],
    }
