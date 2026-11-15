import logging
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.background import BackgroundScheduler
from ..db import sb
from .notifications import send_push

log = logging.getLogger(__name__)
STEP = {"daily": timedelta(days=1), "weekly": timedelta(weeks=1), "yearly": timedelta(days=365)}
scheduler = BackgroundScheduler(timezone="UTC")


def dispatch_due():
    now = datetime.now(timezone.utc)
    due = (sb.table("reminders").select("*").lte("remind_at", now.isoformat()).eq("sent", False).limit(200).execute().data)
    for r in due:
        # Claim first so overlapping runs / multiple workers can't double-send.
        claimed = sb.table("reminders").update({"sent": True}).eq("id", r["id"]).eq("sent", False).execute().data
        if not claimed:
            continue
        tokens = [t["token"] for t in sb.table("device_tokens").select("token").eq("user_id", r["user_id"]).execute().data]
        bad = send_push(tokens, r["title"], r.get("body") or "", {"kind": r["kind"], "reminder_id": r["id"]})
        if bad:
            sb.table("device_tokens").delete().in_("token", bad).execute()
        if r["kind"] == "medication":  # track whether the dose was taken
            sb.table("dose_logs").insert({"user_id": r["user_id"], "reminder_id": r["id"], "medication_id": r.get("ref_id"), "title": r["title"].removeprefix("Take "), "scheduled_for": r["remind_at"], "status": "pending"}).execute()
        if r["recurrence"] in STEP:
            nxt = datetime.fromisoformat(r["remind_at"].replace("Z", "+00:00"))
            while nxt <= now:
                nxt += STEP[r["recurrence"]]
            sb.table("reminders").update({"remind_at": nxt.isoformat(), "sent": False}).eq("id", r["id"]).execute()


def start():
    scheduler.add_job(dispatch_due, "interval", minutes=1, id="dispatch_due", max_instances=1, coalesce=True)
    scheduler.start()
