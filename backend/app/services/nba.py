"""Next-best-action engine: turns signals from every module into a short prioritised to-do list."""
from datetime import timedelta
from .util import parse_ts


def next_actions(s: dict, limit: int = 5) -> list[dict]:
    acts, t, prof = [], s["now"], s["profile"]

    def add(pri, id_, title, why, feature, cta):
        acts.append({"id": id_, "priority": pri, "title": title, "why": why, "feature": feature, "cta": cta})

    recent = [c for c in s["symptom_checks"] if parse_ts(c["created_at"]) >= t - timedelta(hours=48)]
    worst = next((c for c in recent if c["risk_level"] in ("emergency", "see_doctor_today")), None)
    if worst and not s["appointments"]:
        add(1, "book_after_check", "See a doctor about your recent symptoms",
            "Your last symptom check suggested getting seen soon, and you have no appointment booked.", "doctors", "Find a doctor")
    soon = [a for a in s["appointments"] if parse_ts(a["scheduled_at"]) - t <= timedelta(hours=26)]
    if soon:
        add(2, "appt_soon", "You have an appointment coming up", "Bring your recent readings and medicine list. Open your summary to print or share.", "summary", "Open summary")
    if s["trends"]["insights"]:
        add(3, "trend_alert", "A reading is drifting", s["trends"]["insights"][0], "analytics", "See trends")
    pct = s["adherence"]["pct"]
    if pct is not None and pct < 70:
        add(3, "adherence_low", "Doses are slipping", f"You took {pct}% of your doses in the last 30 days. Missing doses can reduce how well a medicine works.", "reminders", "Review doses")
    if s["n_contacts"] == 0:
        add(4, "no_contact", "Add an emergency contact", "SOS can only alert people you have added.", "sos", "Add contact")
    with_rem = {r.get("ref_id") for r in s["reminders"] if r["kind"] == "medication"}
    unreminded = [m["name"] for m in s["medications"] if m["id"] not in with_rem]
    if unreminded:
        add(5, "med_no_reminder", f"Set reminders for {unreminded[0]}" + (f" and {len(unreminded) - 1} more" if len(unreminded) > 1 else ""),
            "Reminders make it easier to take medicines on time.", "reminders", "Add reminders")
    if s["idrs"].get("available") and s["idrs"]["band"] == "high":
        add(5, "idrs_high", "Ask about a diabetes check", "Your age, waist size, activity and family history point to a higher diabetes risk score.", "analytics", "See risk")
    if (prof.get("age") or 0) >= 35 and not any(r["kind"] == "screening" for r in s["reminders"]):
        add(6, "screenings", "Set up routine check-up reminders", "Age-appropriate screenings are easier to keep up with when they are scheduled.", "reminders", "Suggest check-ups")
    if s["completeness"]["pct"] < 70:
        add(7, "profile", "Finish your profile", f"Add {s['completeness']['missing'][0]} so guidance fits you better.", "profile", "Complete profile")
    if s["vitals_14d"] == 0 and (prof.get("age") or 0) >= 30:
        add(8, "log_vitals", "Log a reading", "No readings in the last two weeks. Regular blood pressure or glucose logs make trends useful.", "analytics", "Log a reading")
    return sorted(acts, key=lambda a: a["priority"])[:limit]
