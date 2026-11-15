import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

# Adult reference ranges used only to flag trends for discussion with a clinician.
RANGES = {
    "systolic_bp": (90, 130), "diastolic_bp": (60, 85), "heart_rate": (55, 100),
    "blood_glucose": (70, 140), "weight_kg": (None, None), "spo2": (94, 100), "temperature_c": (36.1, 37.5),
}
BOUNDS = {  # plausibility limits to catch typos
    "systolic_bp": (50, 260), "diastolic_bp": (30, 160), "heart_rate": (25, 250), "blood_glucose": (20, 700),
    "weight_kg": (2, 400), "spo2": (50, 100), "temperature_c": (30, 45),
}


def _anomalies(vals: np.ndarray) -> list[int]:
    """Robust (median/MAD) outlier detection so one bad reading doesn't hide itself by inflating the std."""
    if len(vals) < 6:
        return []
    med = np.median(vals)
    mad = np.median(np.abs(vals - med))
    if mad == 0:
        return []
    return [int(i) for i in np.where(np.abs(vals - med) / (1.4826 * mad) > 3.5)[0]]


def _status(kind: str, v: float) -> str:
    lo, hi = RANGES.get(kind, (None, None))
    if hi is not None and v > hi: return "high"
    if lo is not None and v < lo: return "low"
    return "in_range" if (lo is not None or hi is not None) else "n/a"


def correlations(df: pd.DataFrame) -> list[dict]:
    daily = df.assign(day=df["recorded_at"].dt.floor("D")).pivot_table(index="day", columns="kind", values="value", aggfunc="mean")
    out, cols = [], list(daily.columns)
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            a, b = cols[i], cols[j]
            if {a, b} == {"systolic_bp", "diastolic_bp"}:
                continue  # trivially related
            pair = daily[[a, b]].dropna()
            if len(pair) >= 6 and pair[a].std() > 0 and pair[b].std() > 0:
                r = float(pair.corr().iloc[0, 1])
                if abs(r) >= 0.6:
                    how = "rise and fall together" if r > 0 else "move in opposite directions"
                    out.append({"a": a, "b": b, "r": round(r, 2), "n": len(pair),
                                "note": f"{a.replace('_', ' ')} and {b.replace('_', ' ')} {how} in your data. This is a pattern, not proof of cause."})
    return out


def trends(rows: list[dict]) -> dict:
    if not rows:
        return {"series": {}, "insights": [], "correlations": []}
    df = pd.DataFrame(rows)
    df["recorded_at"] = pd.to_datetime(df["recorded_at"], utc=True)
    df["value"] = df["value"].astype(float)
    out, insights = {}, []
    for kind, g in df.groupby("kind"):
        g = g.sort_values("recorded_at")
        vals = g["value"].to_numpy()
        days = (g["recorded_at"] - g["recorded_at"].iloc[0]).dt.total_seconds().to_numpy() / 86400
        lo, hi = RANGES.get(kind, (None, None))
        label = kind.replace("_", " ")
        item = {
            "points": [{"t": t.isoformat(), "v": float(v)} for t, v in zip(g["recorded_at"], vals)],
            "mean": round(float(vals.mean()), 2), "latest": float(vals[-1]), "status": _status(kind, float(vals[-1])),
            "range": [lo, hi], "anomalies": _anomalies(vals),
            "rolling7": [round(float(x), 2) for x in pd.Series(vals).rolling(7, min_periods=1).mean()],
        }
        if len(vals) >= 5 and days[-1] > 0:
            lr = LinearRegression().fit(days.reshape(-1, 1), vals)
            slope = float(lr.coef_[0])
            fut = float(lr.predict([[days[-1] + 7]])[0])
            sd = float(np.std(vals - lr.predict(days.reshape(-1, 1)), ddof=2)) if len(vals) > 2 else 0.0
            item.update(slope_per_day=round(slope, 3), forecast_7d=round(fut, 2),
                        forecast_band=[round(fut - 1.96 * sd, 2), round(fut + 1.96 * sd, 2)])
            if hi is not None and fut > hi and vals[-1] <= hi * 1.1:
                insights.append(f"{label}: trending upward and may exceed {hi} within a week. Consider sharing this trend with your doctor.")
            if lo is not None and fut < lo:
                insights.append(f"{label}: trending downward toward the low end of the usual range.")
        if hi is not None and len(vals) >= 3 and (vals[-3:] > hi).all():
            insights.append(f"{label}: last 3 readings are all above {hi}.")
        if lo is not None and len(vals) >= 3 and (vals[-3:] < lo).all():
            insights.append(f"{label}: last 3 readings are all below {lo}.")
        if item["anomalies"] and item["anomalies"][-1] == len(vals) - 1:
            insights.append(f"{label}: your latest reading is unusual compared with your usual pattern. Re-check it if you can.")
        out[kind] = item
    return {"series": out, "insights": insights, "correlations": correlations(df)}


def cardiometabolic_risk(profile: dict, latest: dict) -> dict:
    """Transparent points-based screen (NOT a validated clinical score such as Framingham)."""
    pts, why = 0, []
    age = profile.get("age") or 0
    h, w = profile.get("height_cm"), latest.get("weight_kg") or profile.get("weight_kg")
    if age >= 45: pts += 1; why.append("age 45+")
    if age >= 60: pts += 1; why.append("age 60+")
    if h and w:
        bmi = w / ((h / 100) ** 2)
        if bmi >= 25: pts += 1; why.append(f"BMI {bmi:.1f}")
        if bmi >= 30: pts += 1
    if (latest.get("systolic_bp") or 0) >= 130: pts += 2; why.append("elevated blood pressure")
    if (latest.get("blood_glucose") or 0) >= 126: pts += 2; why.append("elevated glucose")
    if profile.get("smoker"): pts += 2; why.append("smoking")
    return {"points": pts, "band": "low" if pts <= 2 else "moderate" if pts <= 5 else "high", "factors": why}
