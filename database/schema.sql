-- =====================================================================================
-- MediCare AI: complete Supabase schema (tables, indexes, Row Level Security, storage).
-- Paste into  Supabase Dashboard > SQL Editor > New query > Run.
-- Safe to re-run: every statement is idempotent, so it also upgrades databases created
-- by earlier versions of this project.
-- =====================================================================================
create extension if not exists "pgcrypto";

-- ---------- Tables ----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  age int check (age between 0 and 120),
  sex text,
  blood_group text,
  height_cm numeric,
  weight_kg numeric,
  waist_cm numeric,
  activity_level text check (activity_level in ('vigorous','moderate','mild','sedentary')),
  smoker boolean default false,
  allergies text[] default '{}',
  conditions text[] default '{}',
  language text default 'en',
  ai_consent jsonb default '{"profile":true,"medications":true,"symptoms":true,"reports":true,"family":true,"vitals":true}',
  created_at timestamptz default now()
);

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, dose text, frequency text,
  active boolean default true,
  source_report_id uuid,
  created_at timestamptz default now()
);

create table if not exists public.symptom_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symptoms text[] not null, free_text text, severity int, duration_days int,
  risk_level text, result jsonb,
  created_at timestamptz default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text, doc_type text, ocr_text text, parsed jsonb, summary text,
  created_at timestamptz default now()
);

create table if not exists public.family_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  relation text not null, condition text not null, age_at_diagnosis int, side text, notes text,
  created_at timestamptz default now()
);

create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, phone text not null, relation text,
  created_at timestamptz default now()
);

create table if not exists public.sos_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision, lng double precision, message text, contacts_notified int,
  created_at timestamptz default now()
);

create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null, specialty text not null, clinic text, city text,
  lat double precision, lng double precision,
  languages text[] default '{English}',
  fee_inr int, rating numeric,
  teleconsult boolean default false
);

create table if not exists public.doctor_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  starts_at timestamptz not null,
  booked boolean default false,
  unique (doctor_id, starts_at)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id),
  slot_id uuid references public.doctor_slots(id),
  scheduled_at timestamptz not null, reason text, status text default 'confirmed',
  created_at timestamptz default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'custom', title text not null, body text,
  remind_at timestamptz not null,
  recurrence text default 'none',
  sent boolean default false,
  ref_id uuid,
  created_at timestamptz default now()
);

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz default now()
);

create table if not exists public.vitals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, value numeric not null,
  recorded_at timestamptz default now()
);

create table if not exists public.dose_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_id uuid, medication_id uuid, title text,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','taken','skipped','snoozed')),
  logged_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  text text not null,
  meta jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  action text not null, detail jsonb default '{}',
  created_at timestamptz default now()
);

-- ---------- Upgrade path for databases created by earlier versions ------------------
alter table public.profiles       add column if not exists waist_cm numeric;
alter table public.profiles       add column if not exists activity_level text check (activity_level in ('vigorous','moderate','mild','sedentary'));
alter table public.family_history add column if not exists side text;
alter table public.doctors        add column if not exists teleconsult boolean default false;

-- ---------- Indexes ---------------------------------------------------------------
create index if not exists reminders_due          on public.reminders (remind_at) where sent = false;
create index if not exists reminders_user         on public.reminders (user_id, remind_at);
create index if not exists vitals_user_kind_time  on public.vitals (user_id, kind, recorded_at);
create index if not exists dose_logs_user_time    on public.dose_logs (user_id, scheduled_for);
create index if not exists chat_user_time         on public.chat_messages (user_id, created_at);
create index if not exists symptom_checks_user    on public.symptom_checks (user_id, created_at);
create index if not exists reports_user           on public.reports (user_id, created_at);
create index if not exists appointments_user      on public.appointments (user_id, scheduled_at);
create index if not exists doctor_slots_open      on public.doctor_slots (doctor_id, starts_at) where booked = false;

-- ---------- Row Level Security ----------------------------------------------------
-- Owner-only access on every patient table. (The FastAPI backend uses the service_role key, which bypasses RLS,
-- and filters by user id itself; these policies protect direct access from the browser with the anon key.)
do $$
declare t text;
begin
  foreach t in array array['medications','symptom_checks','reports','family_history','emergency_contacts',
                           'sos_events','appointments','reminders','device_tokens','vitals','dose_logs','chat_messages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner access" on public.%I', t);
    execute format('create policy "owner access" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Doctor directory is read-only for signed-in users.
alter table public.doctors enable row level security;
drop policy if exists "doctors readable" on public.doctors;
create policy "doctors readable" on public.doctors for select to authenticated using (true);

alter table public.doctor_slots enable row level security;
drop policy if exists "slots readable" on public.doctor_slots;
create policy "slots readable" on public.doctor_slots for select to authenticated using (true);

-- Audit trail: written by the backend, readable by its owner.
alter table public.audit_log enable row level security;
drop policy if exists "read own audit" on public.audit_log;
create policy "read own audit" on public.audit_log for select to authenticated using (auth.uid() = user_id);

-- ---------- Auto-create a profile on sign-up --------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Back-fill profiles for any users who signed up before the trigger existed.
insert into public.profiles (id, full_name)
select id, raw_user_meta_data->>'full_name' from auth.users
on conflict (id) do nothing;

-- ---------- Private storage bucket for scanned documents --------------------------
insert into storage.buckets (id, name, public) values ('reports', 'reports', false)
on conflict (id) do nothing;

drop policy if exists "own report files" on storage.objects;
create policy "own report files" on storage.objects for all to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
