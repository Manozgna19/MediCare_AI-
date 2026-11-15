from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from ..db import sb
from ..deps import get_user_id
from ..services import hereditary

router = APIRouter(prefix="/family", tags=["family"])


class Entry(BaseModel):
    relation: str
    condition: str
    age_at_diagnosis: int | None = Field(None, ge=0, le=120)
    side: str | None = None  # maternal | paternal
    notes: str = ""


@router.get("")
def list_entries(uid: str = Depends(get_user_id)):
    return sb.table("family_history").select("*").eq("user_id", uid).order("created_at").execute().data


@router.post("")
def add(e: Entry, uid: str = Depends(get_user_id)):
    return sb.table("family_history").insert({**e.model_dump(), "user_id": uid}).execute().data[0]


@router.delete("/{eid}")
def delete(eid: str, uid: str = Depends(get_user_id)):
    sb.table("family_history").delete().eq("id", eid).eq("user_id", uid).execute()
    return {"ok": True}


@router.get("/analysis")
def analysis(uid: str = Depends(get_user_id)):
    entries = sb.table("family_history").select("*").eq("user_id", uid).execute().data
    return {"results": hereditary.analyse(entries),
            "disclaimer": "Educational only. A family history does not mean you will develop a condition; genetic counselling can give personalised advice."}
