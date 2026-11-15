from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .routers import symptoms, doctors, reports, sos, profile, chat, reminders, analytics, family, dashboard, privacy
from .middleware import RateLimit, SecurityHeaders
from .services import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    yield
    scheduler.scheduler.shutdown(wait=False)


app = FastAPI(title="MediCare AI", version="1.1.0", lifespan=lifespan)
app.add_middleware(SecurityHeaders)
app.add_middleware(RateLimit)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
                   allow_methods=["*"], allow_headers=["*"], allow_credentials=True)

for m in (symptoms, doctors, reports, sos, profile, chat, reminders, analytics, family, dashboard, privacy):
    app.include_router(m.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/db")
def health_db():
    """Setup check: confirms the backend can reach Supabase and that database/schema.sql has been run."""
    from fastapi import HTTPException
    from .db import sb
    try:
        sb.table("doctors").select("id").limit(1).execute()
    except Exception as e:
        raise HTTPException(503, f"Cannot query Supabase ({type(e).__name__}). Check SUPABASE_URL/SUPABASE_KEY and that database/schema.sql was run.")
    return {"status": "ok", "supabase": "reachable"}
