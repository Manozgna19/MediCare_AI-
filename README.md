# MediCare AI

AI-assisted healthcare web app. **React + Vite + TypeScript + Tailwind** frontend, **FastAPI** backend, and **Supabase** (Postgres, Auth, Storage) as the only data layer. Everything runs locally with no Docker.

> **Not a medical device.** Outputs are educational. The symptom risk model is trained on synthetic data to demonstrate the pipeline and must be clinically validated before real patient use.

## How the pieces connect

```
Browser (Vite, :5173) ──sign in / sign up──────────────▶ Supabase Auth      (anon key)
        │
        └── Authorization: Bearer <Supabase access token>
                         ▼
              FastAPI (:8000) ──supabase-py / PostgREST──▶ Supabase Postgres + Storage   (service_role key)
                         └── Gemini · Google Maps · Firebase · Tesseract (all optional)
```

* The backend talks to the database **only** through the official `supabase` Python client (`sb.table(...).select() / .insert() / .update() / .delete()`), see `backend/app/db.py`. There is no SQLAlchemy, psycopg2 or Alembic.
* The backend uses the `service_role` key, which bypasses Row Level Security, so every query filters by the verified user id. The RLS policies in `database/schema.sql` protect the same data against direct browser access with the anon key.

---

## Run it locally

### Prerequisites
* Python 3.11 or newer, Node.js 20 or newer
* A free Supabase project (https://supabase.com)
* *Optional:* Tesseract and Poppler, only needed for the prescription/report scanner

```bash
# macOS
brew install tesseract tesseract-lang poppler
# Ubuntu / Debian
sudo apt install tesseract-ocr tesseract-ocr-hin tesseract-ocr-tel poppler-utils
# Windows: install Tesseract (UB Mannheim build) and Poppler, then add both folders to PATH
```

### Step 1. Create the database
1. In Supabase: **SQL Editor, New query**, paste the whole of `database/schema.sql`, **Run**. It creates all 16 tables, indexes, Row Level Security policies, the sign-up trigger and the private `reports` storage bucket. It is safe to run again.
2. *(Optional, development only)* run `database/seed.sql` **once** to add sample doctors and appointment slots.
3. **Authentication, Providers, Email:** for quick local testing switch off *Confirm email*, or keep it on and click the link in the email. Under **Authentication, URL Configuration** set *Site URL* to `http://localhost:5173`.
4. **Project Settings, API:** copy the *Project URL*, the *anon* (public) key and the *service_role* (secret) key. If your dashboard shows the newer *publishable / secret* keys, those work for the same two roles; if sign-in misbehaves with a publishable key, use the key from the **Legacy API keys** tab.

### Step 2. Start the backend (http://localhost:8000)

macOS / Linux
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then open .env and set SUPABASE_URL and SUPABASE_KEY
uvicorn app.main:app --reload
```

Windows (PowerShell)
```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env        # then open .env and set SUPABASE_URL and SUPABASE_KEY
uvicorn app.main:app --reload
```

`SUPABASE_KEY` must be the **service_role** key. Only `SUPABASE_URL` and `SUPABASE_KEY` are required; AI, maps, push and OCR features show a clear "not configured" message until you add their keys.

Check it works: open http://localhost:8000/health/db. It should say `{"status":"ok","supabase":"reachable"}`. Interactive API docs: http://localhost:8000/docs.

### Step 3. Start the frontend (http://localhost:5173)

In a **second terminal**:
```bash
cd frontend
npm install
cp .env.example .env          # Windows: copy .env.example .env
# edit frontend/.env: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (anon key only!)
npm run dev
```
Open http://localhost:5173, create an account, and you're in. If `.env` is missing the app shows a setup screen instead of a blank page.

### Step 4. Optional integrations (add to `backend/.env`, then restart uvicorn)
| Feature | Setting |
|---|---|
| AI chat, symptom guidance, report explanations | `GEMINI_API_KEY` (https://aistudio.google.com/apikey) |
| Nearby hospitals, pharmacies, clinics | `GOOGLE_MAPS_API_KEY` with *Places API (New)* enabled |
| Push reminders | `FIREBASE_CREDENTIALS` (service-account JSON path) plus the `VITE_FIREBASE_*` values in `frontend/.env` and in `frontend/public/firebase-messaging-sw.js` |
| Faster token checks | `SUPABASE_JWT_SECRET` (otherwise Supabase Auth verifies tokens, cached for 60 s) |

## Tests and checks
```bash
cd backend && pip install pytest && pytest -q      # 107 tests, no network or keys needed
cd frontend && npm run build                       # type-checks, then builds
```

## Troubleshooting
| Symptom | Fix |
|---|---|
| Backend exits with `Missing required setting(s)` | Create `backend/.env` from `.env.example` and set `SUPABASE_URL` and `SUPABASE_KEY` |
| `/health/db` returns 503 | Wrong URL/key, or `schema.sql` wasn't run |
| Every API call returns 401 | The backend can't verify the token: check `SUPABASE_URL` points to the same project as the frontend |
| Data calls fail, sign-in works | `SUPABASE_KEY` is the anon key; it must be the **service_role** key |
| "Can't reach the server" in the app | Backend isn't running, or `VITE_API_URL` is wrong |
| Browser CORS error | Frontend isn't on port 5173 (Vite is configured to refuse other ports), or add your origin to `CORS_ORIGINS` |
| Sign-up works but sign-in says "email not confirmed" | Click the confirmation email, or disable *Confirm email* (Step 1.3) |
| Scanning says Tesseract/Poppler is needed | Install them (Prerequisites) and restart |

## Project layout
```
backend/app/main.py            FastAPI app, CORS, middleware, /health and /health/db
backend/app/config.py          Environment settings (python-dotenv)
backend/app/db.py              Supabase client (the single data-access point)
backend/app/deps.py            Verifies the Supabase access token on every request
backend/app/routers/           symptoms, doctors, reports, sos, profile, chat, reminders, analytics, family, dashboard, privacy
backend/app/services/          triage, risk model, OCR, analytics, interactions, adherence, scoring, safety, state, nba, maps, FCM, scheduler
backend/tests/                 107 tests against an in-memory fake of the Supabase client
frontend/src/lib/supabase.ts   Browser Supabase client (anon key)
frontend/src/lib/api.ts        Calls the FastAPI backend with the user's access token
frontend/src/pages/            One page per feature
database/schema.sql            Complete tables + RLS + storage (idempotent)
database/seed.sql              Sample doctors (development only)
```

## Features
Symptom checker with body map and follow-up questions · doctor search, booking, rescheduling and calendar export · prescription and lab-report scanner with trend charts and Q&A · emergency SOS with Medical ID and nearby hospitals · profile and medicine tracking with allergy and interaction warnings · multilingual assistant with voice conversation and confirm-before-save actions · reminders with dose tracking and adherence · health trends with forecasts and a diabetes risk score · family history tree with hereditary risk guidance · dashboard with health score, next-best-actions, timeline and a printable doctor summary.

## Safety and privacy notes
Emergency phrases (English, Hindi, Telugu) are caught by deterministic rules before any AI call. The AI never saves anything without your confirmation. Users can switch off which data categories the assistant may read, export all their data, and delete their account from the Profile page. The drug-interaction table covers only a handful of well-known pairs, and the diabetes score is an IDRS-style screen: verify both clinically before relying on them. Before real users: clinical validation, a verified doctor directory, Redis-backed rate limiting, malware scanning of uploads, a privacy policy, and compliant hosting.
