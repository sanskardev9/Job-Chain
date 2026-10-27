-- JobChain + JobPilot schema
-- Run once in Supabase Dashboard -> SQL Editor on a fresh project.
-- Safe to re-run: tables use IF NOT EXISTS, policies/triggers are dropped and recreated.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user (identity; matches docs/MVP_SCHEMA_AND_EVENTS.md)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'candidate'
    check (role in ('candidate', 'employer_admin', 'employer_member')),
  wallet_address text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- jobs: manual tracking + bookmarks used by the current Next.js app
-- (/jobs, /bookmarks, /applied). Column names must match src/app/*.
-- No unique (user_id, job_url): the app may insert a bookmark row and an
-- applied row for the same URL.
-- ---------------------------------------------------------------------------

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text,
  company text,
  location text,
  job_url text not null,
  status text check (status in ('applied', 'interview', 'offer', 'rejected')),
  applied_at timestamptz,
  is_saved boolean not null default false,
  applied_via text not null default 'manual' check (applied_via in ('manual', 'email')),
  discovered_job_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_user_url_idx on public.jobs (user_id, job_url);
create index if not exists jobs_user_saved_idx on public.jobs (user_id) where is_saved;
create index if not exists jobs_user_applied_idx on public.jobs (user_id) where applied_at is not null;

-- ---------------------------------------------------------------------------
-- candidate_profiles: JobPilot's matching profile (replaces its local config).
-- Only claim what is recorded here.
-- ---------------------------------------------------------------------------

create table if not exists public.candidate_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  preferred_name text,
  github_url text,
  linkedin_url text,
  current_base text,
  role_family text,
  skills text[] not null default '{}',
  experience_years numeric(4, 1),
  -- preference, not a claim: apply to jobs asking for up to this many years
  max_required_experience_years numeric(4, 1),
  education text,
  -- e.g. [{"language": "English", "level": "C1"}]
  languages jsonb not null default '[]'::jsonb,
  needs_sponsorship boolean,
  target_countries text[] not null default '{}',
  keywords text[] not null default '{}',
  -- local path on the machine running JobPilot; the CV itself never leaves it
  cv_path text,
  send_mode text not null default 'dry_run' check (send_mode in ('dry_run', 'review', 'auto')),
  max_sends_per_run integer not null default 5 check (max_sends_per_run between 0 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidate_profiles
  add column if not exists max_required_experience_years numeric(4, 1);

-- CV uploaded from /profile into the private "cvs" bucket at <user_id>/cv.pdf.
-- cv_path (local file) is only a fallback for local testing.
alter table public.candidate_profiles
  add column if not exists cv_storage_path text,
  add column if not exists cv_filename text;

-- ---------------------------------------------------------------------------
-- discovered_jobs: vacancies found and scored by JobPilot (written with the
-- service-role key; users can read them and dismiss them).
-- ---------------------------------------------------------------------------

create table if not exists public.discovered_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  source_url text not null,
  vacancy_id text,
  title text not null,
  company text,
  country text,
  location text,
  work_mode text check (work_mode in ('remote', 'hybrid', 'onsite')),
  contract_type text,
  description text,
  deadline date,
  apply_url text,
  apply_email text,
  apply_email_evidence text,
  contact_name text,
  required_skills text[] not null default '{}',
  nice_to_have_skills text[] not null default '{}',
  min_experience_years numeric(4, 1),
  languages jsonb not null default '[]'::jsonb,
  visa_phrases text[] not null default '{}',
  match_label text check (match_label in ('strong', 'possible', 'unlikely')),
  score integer,
  matched_skills text[] not null default '{}',
  missing_skills text[] not null default '{}',
  blockers text[] not null default '{}',
  unknowns text[] not null default '{}',
  -- [{"rule": "language", "result": "unknown", "evidence": "German preferred"}]
  reasons jsonb not null default '[]'::jsonb,
  content_hash text,
  dismissed boolean not null default false,
  discovered_at timestamptz not null default now(),
  evaluated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, source_url)
);

create index if not exists discovered_jobs_user_label_idx
  on public.discovered_jobs (user_id, match_label) where not dismissed;
create index if not exists discovered_jobs_vacancy_idx
  on public.discovered_jobs (user_id, source, vacancy_id);

alter table public.jobs
  drop constraint if exists jobs_discovered_job_id_fkey;
alter table public.jobs
  add constraint jobs_discovered_job_id_fkey
  foreign key (discovered_job_id) references public.discovered_jobs (id) on delete set null;

-- ---------------------------------------------------------------------------
-- application_drafts: emails JobPilot prepares; the user approves in the UI,
-- JobPilot sends via Gmail and records the outcome.
-- ---------------------------------------------------------------------------

create table if not exists public.application_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  discovered_job_id uuid not null references public.discovered_jobs (id) on delete cascade,
  recipient text not null,
  recipient_evidence text,
  subject text not null,
  body text not null,
  cv_filename text,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'rejected', 'sending', 'sent', 'failed')),
  approved_at timestamptz,
  sent_at timestamptz,
  gmail_message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists application_drafts_user_status_idx
  on public.application_drafts (user_id, status);

-- Never send twice for the same vacancy.
create unique index if not exists application_drafts_one_send_per_job
  on public.application_drafts (discovered_job_id)
  where status in ('sending', 'sent');

-- Signed-in users may only edit the text and move draft <-> approved/rejected.
-- Sending states and Gmail fields are reserved for JobPilot (service role).
create or replace function public.guard_application_draft_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    return new;
  end if;

  if old.status not in ('draft', 'approved', 'rejected')
     or new.status not in ('draft', 'approved', 'rejected') then
    raise exception 'status % -> % is not allowed from the app', old.status, new.status;
  end if;

  if new.sent_at is distinct from old.sent_at
     or new.gmail_message_id is distinct from old.gmail_message_id
     or new.error is distinct from old.error
     or new.recipient is distinct from old.recipient
     or new.discovered_job_id is distinct from old.discovered_job_id
     or new.user_id is distinct from old.user_id then
    raise exception 'only subject, body and status can be changed from the app';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_at = now();
  elsif new.status <> 'approved' then
    new.approved_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists application_drafts_guard on public.application_drafts;
create trigger application_drafts_guard
  before update on public.application_drafts
  for each row execute function public.guard_application_draft_update();

-- ---------------------------------------------------------------------------
-- pipeline_events: JobPilot run log / audit trail. Never store tokens here.
-- ---------------------------------------------------------------------------

create table if not exists public.pipeline_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid,
  event_type text not null,
  discovered_job_id uuid references public.discovered_jobs (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_events_user_created_idx
  on public.pipeline_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

drop trigger if exists candidate_profiles_updated_at on public.candidate_profiles;
create trigger candidate_profiles_updated_at before update on public.candidate_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists discovered_jobs_updated_at on public.discovered_jobs;
create trigger discovered_jobs_updated_at before update on public.discovered_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists application_drafts_updated_at on public.application_drafts;
create trigger application_drafts_updated_at before update on public.application_drafts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (the service-role key used by JobPilot bypasses RLS)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.candidate_profiles enable row level security;
alter table public.discovered_jobs enable row level security;
alter table public.application_drafts enable row level security;
alter table public.pipeline_events enable row level security;

-- profiles
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- jobs (full CRUD on own rows)
drop policy if exists "jobs: select own" on public.jobs;
create policy "jobs: select own" on public.jobs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "jobs: insert own" on public.jobs;
create policy "jobs: insert own" on public.jobs
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "jobs: update own" on public.jobs;
create policy "jobs: update own" on public.jobs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "jobs: delete own" on public.jobs;
create policy "jobs: delete own" on public.jobs
  for delete to authenticated using (user_id = (select auth.uid()));

-- candidate_profiles
drop policy if exists "candidate_profiles: select own" on public.candidate_profiles;
create policy "candidate_profiles: select own" on public.candidate_profiles
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "candidate_profiles: insert own" on public.candidate_profiles;
create policy "candidate_profiles: insert own" on public.candidate_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "candidate_profiles: update own" on public.candidate_profiles;
create policy "candidate_profiles: update own" on public.candidate_profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- discovered_jobs: read + dismiss only; JobPilot inserts
drop policy if exists "discovered_jobs: select own" on public.discovered_jobs;
create policy "discovered_jobs: select own" on public.discovered_jobs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "discovered_jobs: update own" on public.discovered_jobs;
create policy "discovered_jobs: update own" on public.discovered_jobs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- application_drafts: read + review (guard trigger limits what changes)
drop policy if exists "application_drafts: select own" on public.application_drafts;
create policy "application_drafts: select own" on public.application_drafts
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "application_drafts: update own" on public.application_drafts;
create policy "application_drafts: update own" on public.application_drafts
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- pipeline_events: read only
drop policy if exists "pipeline_events: select own" on public.pipeline_events;
create policy "pipeline_events: select own" on public.pipeline_events
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Gmail sending: each user connects their own Gmail from /profile.
-- email_accounts: which address (owner can read). email_tokens: AES-GCM encrypted
-- refresh tokens, RLS with no policies so only the service role (JobPilot) reads them.
-- Both are written only through connect_gmail()/disconnect_gmail(), acting for auth.uid().
-- ---------------------------------------------------------------------------

create table if not exists public.email_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail')),
  email text not null,
  connected_at timestamptz not null default now()
);

create table if not exists public.email_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_encrypted text not null,
  scope text,
  updated_at timestamptz not null default now()
);

alter table public.email_accounts enable row level security;
alter table public.email_tokens enable row level security;

drop policy if exists "email_accounts: select own" on public.email_accounts;
create policy "email_accounts: select own" on public.email_accounts
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.connect_gmail(p_email text, p_refresh_token_encrypted text, p_scope text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.email_accounts (user_id, provider, email, connected_at)
  values (auth.uid(), 'gmail', p_email, now())
  on conflict (user_id) do update set email = excluded.email, connected_at = now();
  insert into public.email_tokens (user_id, refresh_token_encrypted, scope, updated_at)
  values (auth.uid(), p_refresh_token_encrypted, p_scope, now())
  on conflict (user_id) do update
    set refresh_token_encrypted = excluded.refresh_token_encrypted, scope = excluded.scope, updated_at = now();
end;
$$;

create or replace function public.disconnect_gmail()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.email_tokens where user_id = auth.uid();
  delete from public.email_accounts where user_id = auth.uid();
$$;

revoke all on function public.connect_gmail(text, text, text) from public, anon;
revoke all on function public.disconnect_gmail() from public, anon;
grant execute on function public.connect_gmail(text, text, text) to authenticated;
grant execute on function public.disconnect_gmail() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private CV bucket, one folder per user (<user_id>/cv.pdf).
-- JobPilot downloads with the service-role key when attaching to an email.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cvs: read own" on storage.objects;
create policy "cvs: read own" on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "cvs: upload own" on storage.objects;
create policy "cvs: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "cvs: replace own" on storage.objects;
create policy "cvs: replace own" on storage.objects for update to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "cvs: delete own" on storage.objects;
create policy "cvs: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- JobPilot tab: runs requested from the app, executed by the worker
-- (`python -m jobpilot worker`), which logs each step to pipeline_events.
-- ---------------------------------------------------------------------------

create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('search', 'send')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'finished', 'failed', 'cancelled')),
  current_step text,
  counts jsonb not null default '{}'::jsonb,
  error text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists pipeline_runs_user_idx on public.pipeline_runs (user_id, requested_at desc);
create index if not exists pipeline_runs_queue_idx on public.pipeline_runs (requested_at) where status = 'queued';
create unique index if not exists pipeline_runs_one_active
  on public.pipeline_runs (user_id) where status in ('queued', 'running');
create index if not exists pipeline_events_run_idx on public.pipeline_events (run_id, id);

create table if not exists public.pipeline_workers (
  id text primary key,
  last_seen timestamptz not null default now(),
  version text
);

alter table public.pipeline_workers
  add column if not exists sending_enabled boolean not null default false;

alter table public.pipeline_runs enable row level security;
alter table public.pipeline_workers enable row level security;

drop policy if exists "pipeline_runs: select own" on public.pipeline_runs;
create policy "pipeline_runs: select own" on public.pipeline_runs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "pipeline_runs: request own" on public.pipeline_runs;
create policy "pipeline_runs: request own" on public.pipeline_runs
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'queued' and started_at is null and finished_at is null);
drop policy if exists "pipeline_runs: cancel own" on public.pipeline_runs;
create policy "pipeline_runs: cancel own" on public.pipeline_runs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "pipeline_workers: read" on public.pipeline_workers;
create policy "pipeline_workers: read" on public.pipeline_workers
  for select to authenticated using (true);

create or replace function public.guard_pipeline_run_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    return new;
  end if;
  if new.status <> 'cancelled' or old.status not in ('queued', 'running')
     or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'runs can only be cancelled from the app';
  end if;
  return new;
end;
$$;

drop trigger if exists pipeline_runs_guard on public.pipeline_runs;
create trigger pipeline_runs_guard before update on public.pipeline_runs
  for each row execute function public.guard_pipeline_run_update();

-- Draft runs: write an application for one job picked in Found jobs (optional recipient typed by the user).
alter table public.pipeline_runs
  add column if not exists discovered_job_id uuid references public.discovered_jobs (id) on delete cascade,
  add column if not exists recipient text;
alter table public.pipeline_runs drop constraint if exists pipeline_runs_kind_check;
alter table public.pipeline_runs add constraint pipeline_runs_kind_check check (kind in ('search', 'send', 'draft'));
