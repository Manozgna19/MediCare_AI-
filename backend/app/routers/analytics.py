from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from ..db import sb
from ..deps import get_user_id
from ..services import gemini, state
from ..services.analytics import BOUNDS

router = APIRouter(tags=["analytics"])


class Vital(BaseModel):
    kind: str = Field(pattern="^(systolic_bp|diastolic_bp|heart_rate|blood_glucose|weight_kg|spo2|temperature_c)$")
    value: float
    recorded_at: datetime | None = None

    @model_validator(mode="after")
    def plausible(self):
        lo, hi = BOUNDS[self.kind]
        if not lo <= self.value <= hi:
            raise ValueError(f"{self.kind.replace('_', ' ')} should be between {lo} and {hi}. Please check the number.")
        return self


@router.post("/vitals")
def add_vital(v: Vital, uid: str = Depends(get_user_id)):
    row = {"user_id": uid, "kind": v.kind, "value": v.value}
    if v.recorded_at:
        row["recorded_at"] = v.recorded_at.isoformat()
    return sb.table("vitals").insert(row).execute().data[0]


class BP(BaseModel):
    systolic: float = Field(ge=50, le=260)
    diastolic: float = Field(ge=30, le=160)


@router.post("/vitals/bp")
def add_bp(b: BP, uid: str = Depends(get_user_id)):
    if b.systolic <= b.diastolic:
        raise HTTPException(422, "The top number (systolic) should be higher than the bottom number (diastolic).")
    rows = sb.table("vitals").insert([{"user_id": uid, "kind": "systolic_bp", "value": b.systolic}, {"user_id": uid, "kind": "diastolic_bp", "value": b.diastolic}]).execute().data
    return {"ok": True, "ids": [r["id"] for r in rows]}


@router.get("/vitals")
def recent(limit: int = 30, uid: str = Depends(get_user_id)):
    return sb.table("vitals").select("*").eq("user_id", uid).order("recorded_at", desc=True).limit(min(limit, 200)).execute().data


@router.delete("/vitals/{vid}")
def delete_vital(vid: str, uid: str = Depends(get_user_id)):
    sb.table("vitals").delete().eq("id", vid).eq("user_id", uid).execute()
    return {"ok": True}


@router.get("/analytics")
def analytics(language: str = "en", explain: bool = False, uid: str = Depends(get_user_id)):
    s = state.gather(uid)
    out = {**s["trends"], "risk": s["risk"], "idrs": s["idrs"], "bmi": s["bmi"], "health_score": s["health_score"],
           "disclaimer": "Trend estimates are informational and not a diagnosis. Share concerns with your doctor."}
    if explain and s["trends"]["series"]:
        out["explanation"] = gemini.generate(
            f"Explain these health trends and screens in 4 short sentences, plain language, no diagnosis: insights={s['trends']['insights']} "
            f"cardiometabolic={s['risk']} diabetes_risk_score={s['idrs']} patterns={s['trends']['correlations']}", language=language)
    return out
